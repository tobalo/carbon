CREATE OR REPLACE FUNCTION close_job_to_gl(
  p_job_id text,
  p_user_id text,
  p_company_id text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_accounting_enabled boolean := false;
  v_wip_account text;
  v_material_variance_account text;
  v_remaining_wip numeric := 0;
  v_job_id_readable text;
  v_accounting_period_id text;
  v_journal_entry_id text;
  v_journal_id text := nanoid();
  v_journal_line_reference text := nanoid();
  v_user_id text := COALESCE(p_user_id, app_uid(), 'system');
BEGIN
  SELECT COALESCE("accountingEnabled", false)
  INTO v_accounting_enabled
  FROM "companySettings"
  WHERE id = p_company_id;

  IF NOT COALESCE(v_accounting_enabled, false) THEN
    RETURN jsonb_build_object('success', true, 'posted', false, 'reason', 'accounting-disabled');
  END IF;

  SELECT "workInProgressAccount", "materialVarianceAccount"
  INTO v_wip_account, v_material_variance_account
  FROM "accountDefault"
  WHERE "companyId" = p_company_id;

  IF v_wip_account IS NULL OR v_material_variance_account IS NULL THEN
    RAISE EXCEPTION 'Default WIP or material variance account is not configured';
  END IF;

  SELECT COALESCE(SUM(jl.amount), 0)
  INTO v_remaining_wip
  FROM "journalLine" jl
  INNER JOIN "journal" j ON j.id = jl."journalId"
  WHERE jl."accountId" = v_wip_account
    AND jl."documentId" = p_job_id
    AND j."companyId" = p_company_id;

  IF ABS(COALESCE(v_remaining_wip, 0)) < 0.01 THEN
    RETURN jsonb_build_object('success', true, 'posted', false, 'reason', 'no-remaining-wip');
  END IF;

  SELECT "jobId"
  INTO STRICT v_job_id_readable
  FROM "job"
  WHERE id = p_job_id
    AND "companyId" = p_company_id;

  v_accounting_period_id := ensure_current_accounting_period(p_company_id, v_user_id);

  BEGIN
    v_journal_entry_id := get_next_sequence('journalEntry', p_company_id);
  EXCEPTION WHEN OTHERS THEN
    v_journal_entry_id := 'JC-' || nanoid('', 10);
  END;

  INSERT INTO "journal" (
    id,
    "journalEntryId",
    "accountingPeriodId",
    description,
    "postingDate",
    "companyId",
    "sourceType",
    status,
    "postedAt",
    "postedBy",
    "createdAt",
    "createdBy"
  )
  VALUES (
    v_journal_id,
    v_journal_entry_id,
    v_accounting_period_id,
    'Job Close Variance ' || v_job_id_readable,
    CURRENT_DATE,
    p_company_id,
    to_jsonb('Job Close'::text),
    'Posted',
    NOW(),
    v_user_id,
    NOW(),
    v_user_id
  );

  PERFORM insert_journal_line_entry(
    v_journal_id,
    v_material_variance_account,
    'Production Variance',
    ABS(v_remaining_wip),
    0,
    'Job Close',
    p_job_id,
    'job:' || p_job_id,
    v_journal_line_reference,
    p_company_id
  );

  PERFORM insert_journal_line_entry(
    v_journal_id,
    v_wip_account,
    'WIP Account',
    -ABS(v_remaining_wip),
    0,
    'Job Close',
    p_job_id,
    'job:' || p_job_id,
    v_journal_line_reference,
    p_company_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'posted', true,
    'journalId', v_journal_id,
    'amount', ABS(v_remaining_wip)
  );
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION post_production_event_to_gl(
  p_production_event_id text,
  p_user_id text,
  p_company_id text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_accounting_enabled boolean := false;
  v_company_group_id text;
  v_wip_account text;
  v_labor_absorption_account text;
  v_event record;
  v_dimension_item_posting_group text;
  v_dimension_location text;
  v_dimension_employee text;
  v_duration_hours numeric;
  v_rate numeric;
  v_cost numeric;
  v_accounting_period_id text;
  v_journal_entry_id text;
  v_journal_id text := nanoid();
  v_journal_line_reference text := nanoid();
  v_journal_line_id text;
  v_user_id text := COALESCE(p_user_id, app_uid(), 'system');
BEGIN
  SELECT COALESCE("accountingEnabled", false)
  INTO v_accounting_enabled
  FROM "companySettings"
  WHERE id = p_company_id;

  IF NOT COALESCE(v_accounting_enabled, false) THEN
    RETURN jsonb_build_object('success', true, 'posted', false, 'reason', 'accounting-disabled');
  END IF;

  SELECT "companyGroupId"
  INTO STRICT v_company_group_id
  FROM "company"
  WHERE id = p_company_id;

  SELECT "workInProgressAccount", "laborAbsorptionAccount"
  INTO v_wip_account, v_labor_absorption_account
  FROM "accountDefault"
  WHERE "companyId" = p_company_id;

  IF v_wip_account IS NULL OR v_labor_absorption_account IS NULL THEN
    RAISE EXCEPTION 'Default WIP or labor absorption account is not configured';
  END IF;

  SELECT
    pe.id,
    pe.duration,
    pe.type,
    pe."employeeId",
    pe."endTime",
    pe."workCenterId",
    jo."jobId",
    wc."laborRate",
    wc."machineRate",
    job."jobId" AS "readableJobId",
    job."itemId",
    job."locationId",
    ic."itemPostingGroupId"
  INTO STRICT v_event
  FROM "productionEvent" pe
  INNER JOIN "jobOperation" jo ON jo.id = pe."jobOperationId"
  INNER JOIN "job" job ON job.id = jo."jobId"
  LEFT JOIN "workCenter" wc ON wc.id = pe."workCenterId"
  LEFT JOIN "itemCost" ic
    ON ic."itemId" = job."itemId"
   AND ic."companyId" = p_company_id
  WHERE pe.id = p_production_event_id
    AND pe."companyId" = p_company_id;

  IF v_event."endTime" IS NULL
     OR v_event.duration IS NULL
     OR v_event."workCenterId" IS NULL THEN
    UPDATE "productionEvent"
    SET "postedToGL" = true,
        "updatedAt" = NOW(),
        "updatedBy" = v_user_id
    WHERE id = p_production_event_id
      AND "companyId" = p_company_id;

    RETURN jsonb_build_object('success', true, 'posted', false, 'reason', 'incomplete-event');
  END IF;

  IF v_company_group_id IS NOT NULL THEN
    SELECT
      MAX(CASE WHEN "entityType" = 'ItemPostingGroup' THEN id END),
      MAX(CASE WHEN "entityType" = 'Location' THEN id END),
      MAX(CASE WHEN "entityType" = 'Employee' THEN id END)
    INTO v_dimension_item_posting_group, v_dimension_location, v_dimension_employee
    FROM "dimension"
    WHERE "companyGroupId" = v_company_group_id
      AND active = true
      AND "entityType" IN ('ItemPostingGroup', 'Location', 'Employee');
  END IF;

  v_duration_hours := COALESCE(v_event.duration, 0) / 3600;
  v_rate := CASE
    WHEN v_event.type::text = 'Machine' THEN COALESCE(v_event."machineRate", 0)
    ELSE COALESCE(v_event."laborRate", 0)
  END;
  v_cost := v_duration_hours * v_rate;

  IF COALESCE(v_cost, 0) <= 0 THEN
    UPDATE "productionEvent"
    SET "postedToGL" = true,
        "updatedAt" = NOW(),
        "updatedBy" = v_user_id
    WHERE id = p_production_event_id
      AND "companyId" = p_company_id;

    RETURN jsonb_build_object('success', true, 'posted', false, 'reason', 'zero-cost');
  END IF;

  v_accounting_period_id := ensure_current_accounting_period(p_company_id, v_user_id);

  BEGIN
    v_journal_entry_id := get_next_sequence('journalEntry', p_company_id);
  EXCEPTION WHEN OTHERS THEN
    v_journal_entry_id := 'PE-' || nanoid('', 10);
  END;

  INSERT INTO "journal" (
    id,
    "journalEntryId",
    "accountingPeriodId",
    description,
    "postingDate",
    "companyId",
    "sourceType",
    status,
    "postedAt",
    "postedBy",
    "createdAt",
    "createdBy"
  )
  VALUES (
    v_journal_id,
    v_journal_entry_id,
    v_accounting_period_id,
    v_event.type::text || ' Time - Job ' || v_event."readableJobId",
    CURRENT_DATE,
    p_company_id,
    to_jsonb('Production Event'::text),
    'Posted',
    NOW(),
    v_user_id,
    NOW(),
    v_user_id
  );

  v_journal_line_id := insert_journal_line_entry(
    v_journal_id,
    v_wip_account,
    'WIP Account',
    v_cost,
    1,
    'Production Event',
    v_event."jobId",
    'job:' || v_event."jobId",
    v_journal_line_reference,
    p_company_id
  );

  IF v_dimension_item_posting_group IS NOT NULL AND v_event."itemPostingGroupId" IS NOT NULL THEN
    PERFORM insert_journal_line_dimension_entry(
      v_journal_line_id,
      v_dimension_item_posting_group,
      v_event."itemPostingGroupId",
      p_company_id
    );
  END IF;

  IF v_dimension_location IS NOT NULL AND v_event."locationId" IS NOT NULL THEN
    PERFORM insert_journal_line_dimension_entry(
      v_journal_line_id,
      v_dimension_location,
      v_event."locationId",
      p_company_id
    );
  END IF;

  IF v_dimension_employee IS NOT NULL AND v_event."employeeId" IS NOT NULL THEN
    PERFORM insert_journal_line_dimension_entry(
      v_journal_line_id,
      v_dimension_employee,
      v_event."employeeId",
      p_company_id
    );
  END IF;

  v_journal_line_id := insert_journal_line_entry(
    v_journal_id,
    v_labor_absorption_account,
    'Labor/Machine Absorption',
    -v_cost,
    1,
    'Production Event',
    v_event."jobId",
    'job:' || v_event."jobId",
    v_journal_line_reference,
    p_company_id
  );

  IF v_dimension_item_posting_group IS NOT NULL AND v_event."itemPostingGroupId" IS NOT NULL THEN
    PERFORM insert_journal_line_dimension_entry(
      v_journal_line_id,
      v_dimension_item_posting_group,
      v_event."itemPostingGroupId",
      p_company_id
    );
  END IF;

  IF v_dimension_location IS NOT NULL AND v_event."locationId" IS NOT NULL THEN
    PERFORM insert_journal_line_dimension_entry(
      v_journal_line_id,
      v_dimension_location,
      v_event."locationId",
      p_company_id
    );
  END IF;

  IF v_dimension_employee IS NOT NULL AND v_event."employeeId" IS NOT NULL THEN
    PERFORM insert_journal_line_dimension_entry(
      v_journal_line_id,
      v_dimension_employee,
      v_event."employeeId",
      p_company_id
    );
  END IF;

  UPDATE "productionEvent"
  SET "postedToGL" = true,
      "updatedAt" = NOW(),
      "updatedBy" = v_user_id
  WHERE id = p_production_event_id
    AND "companyId" = p_company_id;

  RETURN jsonb_build_object(
    'success', true,
    'posted', true,
    'journalId', v_journal_id,
    'amount', v_cost
  );
END;
$$;
