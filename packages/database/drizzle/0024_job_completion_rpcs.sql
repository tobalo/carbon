CREATE OR REPLACE FUNCTION next_item_ledger_entry_number(p_company_id text)
RETURNS numeric
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_next numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('itemLedger:' || COALESCE(p_company_id, ''))::bigint);

  SELECT COALESCE(MAX("entryNumber"), 0) + 1
  INTO v_next
  FROM "itemLedger"
  WHERE "companyId" = p_company_id;

  RETURN v_next;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION next_cost_ledger_entry_number(p_company_id text)
RETURNS numeric
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_next numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('costLedger:' || COALESCE(p_company_id, ''))::bigint);

  SELECT COALESCE(MAX("entryNumber"), 0) + 1
  INTO v_next
  FROM "costLedger"
  WHERE "companyId" = p_company_id;

  RETURN v_next;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION ensure_current_accounting_period(
  p_company_id text,
  p_user_id text
)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_period_id text;
  v_today date := CURRENT_DATE;
  v_user_id text := COALESCE(p_user_id, app_uid(), 'system');
BEGIN
  SELECT id
  INTO v_period_id
  FROM "accountingPeriod"
  WHERE "companyId" = p_company_id
    AND "startDate" <= v_today
    AND "endDate" >= v_today
    AND status = 'Active'
  LIMIT 1;

  IF v_period_id IS NOT NULL THEN
    RETURN v_period_id;
  END IF;

  UPDATE "accountingPeriod"
  SET
    status = 'Inactive',
    "updatedAt" = NOW(),
    "updatedBy" = v_user_id
  WHERE "companyId" = p_company_id
    AND status = 'Active';

  UPDATE "accountingPeriod"
  SET
    status = 'Active',
    "updatedAt" = NOW(),
    "updatedBy" = v_user_id
  WHERE "companyId" = p_company_id
    AND "startDate" <= v_today
    AND "endDate" >= v_today
  RETURNING id INTO v_period_id;

  IF v_period_id IS NOT NULL THEN
    RETURN v_period_id;
  END IF;

  v_period_id := nanoid();

  INSERT INTO "accountingPeriod" (
    id,
    "startDate",
    "endDate",
    "companyId",
    status,
    "createdAt",
    "createdBy"
  )
  VALUES (
    v_period_id,
    date_trunc('month', v_today)::date,
    (date_trunc('month', v_today) + INTERVAL '1 month' - INTERVAL '1 day')::date,
    p_company_id,
    'Active',
    NOW(),
    v_user_id
  );

  RETURN v_period_id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION insert_item_ledger_entry(
  p_entry_type "itemLedgerType",
  p_document_type text,
  p_document_id text,
  p_company_id text,
  p_item_id text,
  p_quantity numeric,
  p_location_id text,
  p_storage_unit_id text,
  p_tracked_entity_id text,
  p_tracked_entity_status text,
  p_user_id text
)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id text := nanoid();
  v_user_id text := COALESCE(p_user_id, app_uid(), 'system');
BEGIN
  INSERT INTO "itemLedger" (
    id,
    "entryNumber",
    "entryType",
    "documentType",
    "documentId",
    "companyId",
    "itemId",
    quantity,
    "locationId",
    "storageUnitId",
    "trackedEntityId",
    "trackedEntityStatus",
    "postingDate",
    "createdAt",
    "createdBy"
  )
  VALUES (
    v_id,
    next_item_ledger_entry_number(p_company_id),
    p_entry_type,
    to_jsonb(p_document_type),
    p_document_id,
    p_company_id,
    p_item_id,
    p_quantity,
    p_location_id,
    p_storage_unit_id,
    p_tracked_entity_id,
    CASE WHEN p_tracked_entity_status IS NULL THEN NULL ELSE to_jsonb(p_tracked_entity_status) END,
    CURRENT_DATE,
    NOW(),
    v_user_id
  );

  RETURN v_id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION insert_cost_ledger_entry(
  p_item_ledger_type "itemLedgerType",
  p_cost_ledger_type "costLedgerType",
  p_adjustment boolean,
  p_document_type text,
  p_document_id text,
  p_item_id text,
  p_quantity numeric,
  p_cost numeric,
  p_remaining_quantity numeric,
  p_company_id text,
  p_nominal_cost numeric
)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id text := nanoid();
BEGIN
  INSERT INTO "costLedger" (
    id,
    "entryNumber",
    "itemLedgerType",
    "costLedgerType",
    adjustment,
    "documentType",
    "documentId",
    "itemId",
    quantity,
    cost,
    "nominalCost",
    "remainingQuantity",
    "postingDate",
    "createdAt",
    "companyId"
  )
  VALUES (
    v_id,
    next_cost_ledger_entry_number(p_company_id),
    p_item_ledger_type,
    p_cost_ledger_type,
    COALESCE(p_adjustment, false),
    to_jsonb(p_document_type),
    p_document_id,
    p_item_id,
    p_quantity,
    p_cost,
    COALESCE(p_nominal_cost, p_cost, 0),
    p_remaining_quantity,
    CURRENT_DATE,
    NOW(),
    p_company_id
  );

  RETURN v_id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION insert_journal_line_entry(
  p_journal_id text,
  p_account_id text,
  p_description text,
  p_amount numeric,
  p_quantity numeric,
  p_document_type text,
  p_document_id text,
  p_document_line_reference text,
  p_journal_line_reference text,
  p_company_id text
)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id text := nanoid();
BEGIN
  INSERT INTO "journalLine" (
    id,
    "journalId",
    "accountId",
    description,
    amount,
    quantity,
    "documentType",
    "documentId",
    "documentLineReference",
    "journalLineReference",
    "companyId",
    "createdAt",
    accrual
  )
  VALUES (
    v_id,
    p_journal_id,
    p_account_id,
    p_description,
    p_amount,
    p_quantity,
    to_jsonb(p_document_type),
    p_document_id,
    p_document_line_reference,
    p_journal_line_reference,
    p_company_id,
    NOW(),
    false
  );

  RETURN v_id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION insert_journal_line_dimension_entry(
  p_journal_line_id text,
  p_dimension_id text,
  p_value_id text,
  p_company_id text
)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id text := nanoid();
BEGIN
  INSERT INTO "journalLineDimension" (
    id,
    "journalLineId",
    "dimensionId",
    "valueId",
    "companyId",
    "createdAt"
  )
  VALUES (
    v_id,
    p_journal_line_id,
    p_dimension_id,
    p_value_id,
    p_company_id,
    NOW()
  );

  RETURN v_id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION backflush_job_materials(
  p_job_id text,
  p_quantity_complete numeric,
  p_company_id text,
  p_user_id text
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_quantity numeric;
  v_job_location_id text;
  v_job_id_readable text;
  v_ratio numeric;
  v_target numeric;
  v_material record;
  v_material_qty_to_issue numeric;
  v_material_storage_unit_id text;
  v_material_costing_method text;
  v_material_standard_cost numeric;
  v_material_unit_cost numeric;
  v_material_item_posting_group_id text;
  v_material_cogs_total numeric;
  v_cost_layer record;
  v_remaining_to_consume numeric;
  v_layer_unit_cost numeric;
  v_quantity_from_layer numeric;
  v_accounting_enabled boolean;
  v_company_group_id text;
  v_inventory_account text;
  v_wip_account text;
  v_dimension_item_posting_group text;
  v_dimension_location text;
  v_bf_item_ids text[] := '{}';
  v_bf_quantities numeric[] := '{}';
  v_bf_journal_id text;
  v_bf_journal_entry_id text;
  v_bf_accounting_period_id text;
  v_bf_journal_line_ref text;
  v_bf_jl_id text;
  v_bf_jl_ids text[] := '{}';
  v_bf_posting_group_ids text[] := '{}';
  v_user_id text := COALESCE(p_user_id, app_uid(), 'system');
  i integer;
BEGIN
  IF session_user = 'carbon_app'
     AND NOT (p_company_id = ANY(app_companies_for_context())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT quantity, "locationId", "jobId"
  INTO STRICT v_job_quantity, v_job_location_id, v_job_id_readable
  FROM "job"
  WHERE id = p_job_id
    AND "companyId" = p_company_id;

  IF v_job_quantity IS NULL OR v_job_quantity <= 0 THEN
    RETURN;
  END IF;

  v_ratio := COALESCE(p_quantity_complete, 0) / v_job_quantity;

  FOR v_material IN
    SELECT
      jm.id,
      jm."itemId",
      jm."quantityToIssue",
      jm."quantityIssued",
      jm."estimatedQuantity",
      jm."storageUnitId",
      jm."defaultStorageUnit"
    FROM "jobMaterial" jm
    WHERE jm."jobId" = p_job_id
      AND jm."companyId" = p_company_id
      AND jm."itemType" IN ('Material', 'Part', 'Consumable')
      AND jm."methodType" != 'Make to Order'
      AND jm."requiresBatchTracking" = false
      AND jm."requiresSerialTracking" = false
      AND COALESCE(jm."quantityToIssue", 0) > 0
  LOOP
    v_target := COALESCE(v_material."estimatedQuantity", v_material."quantityToIssue", 0) * v_ratio;
    v_material_qty_to_issue := GREATEST(v_target - COALESCE(v_material."quantityIssued", 0), 0);

    IF v_material_qty_to_issue <= 0 THEN
      CONTINUE;
    END IF;

    v_material_storage_unit_id := v_material."storageUnitId";

    IF v_material_storage_unit_id IS NULL AND COALESCE(v_material."defaultStorageUnit", false) THEN
      SELECT "defaultStorageUnitId"
      INTO v_material_storage_unit_id
      FROM "pickMethod"
      WHERE "itemId" = v_material."itemId"
        AND "locationId" = v_job_location_id
        AND "companyId" = p_company_id
      LIMIT 1;
    END IF;

    IF v_material_storage_unit_id IS NULL THEN
      SELECT "storageUnitId"
      INTO v_material_storage_unit_id
      FROM "itemLedger"
      WHERE "itemId" = v_material."itemId"
        AND "locationId" = v_job_location_id
        AND "companyId" = p_company_id
        AND "storageUnitId" IS NOT NULL
      GROUP BY "storageUnitId"
      HAVING SUM(quantity) > 0
      ORDER BY SUM(quantity) DESC
      LIMIT 1;
    END IF;

    PERFORM insert_item_ledger_entry(
      'Consumption',
      'Job Consumption',
      p_job_id,
      p_company_id,
      v_material."itemId",
      -v_material_qty_to_issue,
      v_job_location_id,
      v_material_storage_unit_id,
      NULL,
      NULL,
      v_user_id
    );

    UPDATE "jobMaterial"
    SET
      "quantityIssued" = COALESCE("quantityIssued", 0) + v_material_qty_to_issue,
      "updatedAt" = NOW(),
      "updatedBy" = v_user_id
    WHERE id = v_material.id;

    v_bf_item_ids := v_bf_item_ids || v_material."itemId";
    v_bf_quantities := v_bf_quantities || v_material_qty_to_issue;
  END LOOP;

  SELECT "accountingEnabled"
  INTO v_accounting_enabled
  FROM "companySettings"
  WHERE id = p_company_id;

  IF NOT COALESCE(v_accounting_enabled, false) THEN
    RETURN;
  END IF;

  IF COALESCE(array_length(v_bf_item_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;

  SELECT "companyGroupId"
  INTO v_company_group_id
  FROM "company"
  WHERE id = p_company_id;

  SELECT "inventoryAccount", "workInProgressAccount"
  INTO v_inventory_account, v_wip_account
  FROM "accountDefault"
  WHERE "companyId" = p_company_id;

  IF v_inventory_account IS NULL OR v_wip_account IS NULL THEN
    RETURN;
  END IF;

  IF v_company_group_id IS NOT NULL THEN
    SELECT
      MAX(CASE WHEN "entityType" = 'ItemPostingGroup' THEN id END),
      MAX(CASE WHEN "entityType" = 'Location' THEN id END)
    INTO v_dimension_item_posting_group, v_dimension_location
    FROM "dimension"
    WHERE "companyGroupId" = v_company_group_id
      AND active = true
      AND "entityType" IN ('ItemPostingGroup', 'Location');
  END IF;

  v_bf_accounting_period_id := ensure_current_accounting_period(p_company_id, v_user_id);

  BEGIN
    v_bf_journal_entry_id := get_next_sequence('journalEntry', p_company_id);
  EXCEPTION WHEN OTHERS THEN
    v_bf_journal_entry_id := 'JC-' || nanoid('', 10);
  END;

  v_bf_journal_id := nanoid();

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
    v_bf_journal_id,
    v_bf_journal_entry_id,
    v_bf_accounting_period_id,
    'Material Issue - Job ' || v_job_id_readable,
    CURRENT_DATE,
    p_company_id,
    to_jsonb('Job Consumption'::text),
    'Posted',
    NOW(),
    v_user_id,
    NOW(),
    v_user_id
  );

  FOR i IN 1..array_length(v_bf_item_ids, 1)
  LOOP
    SELECT "costingMethod"::text, "standardCost", "unitCost", "itemPostingGroupId"
    INTO v_material_costing_method, v_material_standard_cost, v_material_unit_cost, v_material_item_posting_group_id
    FROM "itemCost"
    WHERE "itemId" = v_bf_item_ids[i]
      AND "companyId" = p_company_id;

    IF v_material_costing_method IS NULL THEN
      CONTINUE;
    END IF;

    v_material_cogs_total := 0;

    IF v_material_costing_method = 'Standard' THEN
      v_material_cogs_total := COALESCE(v_material_standard_cost, 0) * v_bf_quantities[i];
    ELSIF v_material_costing_method = 'Average' THEN
      v_material_cogs_total := COALESCE(v_material_unit_cost, 0) * v_bf_quantities[i];
    ELSIF v_material_costing_method IN ('FIFO', 'LIFO') THEN
      v_remaining_to_consume := v_bf_quantities[i];

      FOR v_cost_layer IN
        SELECT id, quantity, cost, "remainingQuantity"
        FROM "costLedger"
        WHERE "itemId" = v_bf_item_ids[i]
          AND "companyId" = p_company_id
          AND "remainingQuantity" > 0
        ORDER BY
          CASE WHEN v_material_costing_method = 'FIFO' THEN "postingDate" END ASC,
          CASE WHEN v_material_costing_method = 'LIFO' THEN "postingDate" END DESC,
          CASE WHEN v_material_costing_method = 'FIFO' THEN "createdAt" END ASC,
          CASE WHEN v_material_costing_method = 'LIFO' THEN "createdAt" END DESC
      LOOP
        EXIT WHEN v_remaining_to_consume <= 0;

        v_layer_unit_cost := CASE
          WHEN v_cost_layer.quantity > 0 THEN v_cost_layer.cost / v_cost_layer.quantity
          ELSE 0
        END;

        v_quantity_from_layer := LEAST(v_remaining_to_consume, v_cost_layer."remainingQuantity");
        v_material_cogs_total := v_material_cogs_total + v_quantity_from_layer * v_layer_unit_cost;
        v_remaining_to_consume := v_remaining_to_consume - v_quantity_from_layer;

        UPDATE "costLedger"
        SET "remainingQuantity" = "remainingQuantity" - v_quantity_from_layer
        WHERE id = v_cost_layer.id;
      END LOOP;

      IF v_remaining_to_consume > 0 THEN
        v_material_cogs_total := v_material_cogs_total + v_remaining_to_consume * COALESCE(v_material_unit_cost, 0);
      END IF;
    END IF;

    IF v_material_cogs_total <= 0 THEN
      CONTINUE;
    END IF;

    v_bf_journal_line_ref := nanoid();

    v_bf_jl_id := insert_journal_line_entry(
      v_bf_journal_id,
      v_wip_account,
      'WIP Account',
      v_material_cogs_total,
      v_bf_quantities[i],
      'Job Consumption',
      p_job_id,
      'job:' || p_job_id,
      v_bf_journal_line_ref,
      p_company_id
    );
    v_bf_jl_ids := v_bf_jl_ids || v_bf_jl_id;
    v_bf_posting_group_ids := v_bf_posting_group_ids || COALESCE(v_material_item_posting_group_id, '');

    v_bf_jl_id := insert_journal_line_entry(
      v_bf_journal_id,
      v_inventory_account,
      'Inventory Account',
      -v_material_cogs_total,
      v_bf_quantities[i],
      'Job Consumption',
      p_job_id,
      'job:' || p_job_id,
      v_bf_journal_line_ref,
      p_company_id
    );
    v_bf_jl_ids := v_bf_jl_ids || v_bf_jl_id;
    v_bf_posting_group_ids := v_bf_posting_group_ids || COALESCE(v_material_item_posting_group_id, '');

    PERFORM insert_cost_ledger_entry(
      'Consumption',
      'Direct Cost',
      false,
      'Job Consumption',
      p_job_id,
      v_bf_item_ids[i],
      -v_bf_quantities[i],
      -v_material_cogs_total,
      0,
      p_company_id,
      -v_material_cogs_total
    );
  END LOOP;

  IF COALESCE(array_length(v_bf_jl_ids, 1), 0) > 0 THEN
    FOR i IN 1..array_length(v_bf_jl_ids, 1)
    LOOP
      IF v_bf_posting_group_ids[i] != '' AND v_dimension_item_posting_group IS NOT NULL THEN
        PERFORM insert_journal_line_dimension_entry(
          v_bf_jl_ids[i],
          v_dimension_item_posting_group,
          v_bf_posting_group_ids[i],
          p_company_id
        );
      END IF;

      IF v_job_location_id IS NOT NULL AND v_dimension_location IS NOT NULL THEN
        PERFORM insert_journal_line_dimension_entry(
          v_bf_jl_ids[i],
          v_dimension_location,
          v_job_location_id,
          p_company_id
        );
      END IF;
    END LOOP;
  END IF;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION complete_job_to_inventory(
  p_job_id text,
  p_quantity_complete numeric,
  p_storage_unit_id text DEFAULT NULL,
  p_location_id text DEFAULT NULL,
  p_company_id text DEFAULT NULL,
  p_user_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id text;
  v_previous_received numeric;
  v_quantity_to_receive numeric;
  v_job_id_readable text;
  v_job_location_id text;
  v_job_company_id text;
  v_company_id text;
  v_location_id text;
  v_user_id text;
  v_job_make_method record;
  v_tracked_entity record;
  v_accounting_enabled boolean;
  v_company_group_id text;
  v_inventory_account text;
  v_wip_account text;
  v_labor_absorption_account text;
  v_dimension_item_posting_group text;
  v_dimension_location text;
  v_dimension_employee text;
  v_event record;
  v_duration_hours numeric;
  v_rate numeric;
  v_labor_cost numeric;
  v_labor_journal_line_reference text;
  v_labor_accounting_period_id text;
  v_labor_journal_entry_id text;
  v_labor_journal_id text;
  v_labor_jl_id text;
  v_accumulated_wip_cost numeric;
  v_journal_line_reference text;
  v_accounting_period_id text;
  v_journal_entry_id text;
  v_journal_id text;
  v_jl_ids text[] := '{}';
  v_new_per_unit_cost numeric;
  v_costing_method text;
  v_existing_unit_cost numeric;
  v_item_posting_group_id text;
  v_total_qty_on_hand numeric;
  v_prior_qty numeric;
  v_prior_value numeric;
  v_new_unit_cost numeric;
  i integer;
BEGIN
  SELECT "itemId", "quantityReceivedToInventory", "jobId", "locationId", "companyId"
  INTO STRICT v_item_id, v_previous_received, v_job_id_readable, v_job_location_id, v_job_company_id
  FROM "job"
  WHERE id = p_job_id;

  v_company_id := COALESCE(p_company_id, v_job_company_id);
  v_location_id := COALESCE(p_location_id, v_job_location_id);
  v_user_id := COALESCE(p_user_id, app_uid(), 'system');
  v_quantity_to_receive := GREATEST(COALESCE(p_quantity_complete, 0) - COALESCE(v_previous_received, 0), 0);

  IF session_user = 'carbon_app'
     AND NOT (v_company_id = ANY(app_companies_for_context())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT *
  INTO STRICT v_job_make_method
  FROM "jobMakeMethod"
  WHERE "jobId" = p_job_id
    AND "companyId" = v_company_id
    AND "parentMaterialId" IS NULL;

  UPDATE "job"
  SET
    status = 'Completed',
    "completedDate" = CURRENT_DATE,
    "quantityComplete" = p_quantity_complete,
    "quantityReceivedToInventory" = p_quantity_complete,
    "updatedAt" = NOW(),
    "updatedBy" = v_user_id
  WHERE id = p_job_id
    AND "companyId" = v_company_id;

  IF v_quantity_to_receive > 0 THEN
    IF v_job_make_method."requiresBatchTracking" THEN
      SELECT *
      INTO v_tracked_entity
      FROM "trackedEntity"
      WHERE attributes->>'Job Make Method' = v_job_make_method.id
        AND "companyId" = v_company_id
        AND status != 'Consumed'
      ORDER BY "createdAt" DESC
      LIMIT 1;

      IF v_tracked_entity.id IS NULL THEN
        RAISE EXCEPTION 'Tracked entity not found';
      END IF;

      PERFORM insert_item_ledger_entry(
        'Assembly Output',
        'Job Receipt',
        p_job_id,
        v_company_id,
        v_item_id,
        v_quantity_to_receive,
        v_location_id,
        p_storage_unit_id,
        v_tracked_entity.id,
        v_tracked_entity.status::text,
        v_user_id
      );
    ELSIF v_job_make_method."requiresSerialTracking" THEN
      FOR v_tracked_entity IN
        SELECT *
        FROM "trackedEntity"
        WHERE attributes->>'Job Make Method' = v_job_make_method.id
          AND "companyId" = v_company_id
          AND status != 'Consumed'
      LOOP
        PERFORM insert_item_ledger_entry(
          'Assembly Output',
          'Job Receipt',
          p_job_id,
          v_company_id,
          v_item_id,
          1,
          v_location_id,
          p_storage_unit_id,
          v_tracked_entity.id,
          'Available',
          v_user_id
        );
      END LOOP;

      UPDATE "trackedEntity"
      SET status = 'Available'
      WHERE attributes->>'Job Make Method' = v_job_make_method.id
        AND "companyId" = v_company_id
        AND status != 'Consumed';
    ELSE
      PERFORM insert_item_ledger_entry(
        'Assembly Output',
        'Job Receipt',
        p_job_id,
        v_company_id,
        v_item_id,
        v_quantity_to_receive,
        v_location_id,
        p_storage_unit_id,
        NULL,
        NULL,
        v_user_id
      );
    END IF;
  END IF;

  IF p_storage_unit_id IS NOT NULL AND v_location_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM "itemLedger"
      WHERE "itemId" = v_item_id
        AND "locationId" = v_location_id
        AND "companyId" = v_company_id
        AND "storageUnitId" IS NOT NULL
        AND "storageUnitId" != p_storage_unit_id
      LIMIT 1
    ) THEN
      UPDATE "pickMethod"
      SET
        "defaultStorageUnitId" = p_storage_unit_id,
        "updatedBy" = v_user_id,
        "updatedAt" = NOW()
      WHERE "itemId" = v_item_id
        AND "locationId" = v_location_id
        AND "companyId" = v_company_id;

      IF NOT FOUND THEN
        INSERT INTO "pickMethod" (
          "itemId",
          "locationId",
          "defaultStorageUnitId",
          "companyId",
          "createdBy",
          "createdAt"
        )
        VALUES (
          v_item_id,
          v_location_id,
          p_storage_unit_id,
          v_company_id,
          v_user_id,
          NOW()
        );
      END IF;
    END IF;
  END IF;

  PERFORM backflush_job_materials(p_job_id, p_quantity_complete, v_company_id, v_user_id);

  SELECT "accountingEnabled"
  INTO v_accounting_enabled
  FROM "companySettings"
  WHERE id = v_company_id;

  IF NOT COALESCE(v_accounting_enabled, false) THEN
    RETURN;
  END IF;

  SELECT "companyGroupId"
  INTO v_company_group_id
  FROM "company"
  WHERE id = v_company_id;

  SELECT "inventoryAccount", "workInProgressAccount", "laborAbsorptionAccount"
  INTO v_inventory_account, v_wip_account, v_labor_absorption_account
  FROM "accountDefault"
  WHERE "companyId" = v_company_id;

  IF v_inventory_account IS NULL OR v_wip_account IS NULL THEN
    RETURN;
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

  FOR v_event IN
    SELECT
      pe.id,
      pe.duration,
      pe.type,
      pe."employeeId",
      wc."laborRate",
      wc."machineRate"
    FROM "productionEvent" pe
    INNER JOIN "jobOperation" jo ON jo.id = pe."jobOperationId"
    INNER JOIN "workCenter" wc ON wc.id = pe."workCenterId"
    WHERE jo."jobId" = p_job_id
      AND pe."companyId" = v_company_id
      AND pe."endTime" IS NOT NULL
      AND pe."postedToGL" = false
      AND COALESCE(pe.duration, 0) > 0
  LOOP
    v_duration_hours := COALESCE(v_event.duration, 0) / 3600;
    v_rate := CASE
      WHEN v_event.type::text = 'Machine' THEN COALESCE(v_event."machineRate", 0)
      ELSE COALESCE(v_event."laborRate", 0)
    END;
    v_labor_cost := v_duration_hours * v_rate;

    IF v_labor_cost > 0 AND v_labor_absorption_account IS NOT NULL THEN
      v_labor_journal_line_reference := nanoid();
      v_labor_accounting_period_id := ensure_current_accounting_period(v_company_id, v_user_id);

      BEGIN
        v_labor_journal_entry_id := get_next_sequence('journalEntry', v_company_id);
      EXCEPTION WHEN OTHERS THEN
        v_labor_journal_entry_id := 'PE-' || nanoid('', 10);
      END;

      v_labor_journal_id := nanoid();

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
        v_labor_journal_id,
        v_labor_journal_entry_id,
        v_labor_accounting_period_id,
        v_event.type::text || ' Time - Job ' || v_job_id_readable,
        CURRENT_DATE,
        v_company_id,
        to_jsonb('Production Event'::text),
        'Posted',
        NOW(),
        v_user_id,
        NOW(),
        v_user_id
      );

      v_labor_jl_id := insert_journal_line_entry(
        v_labor_journal_id,
        v_wip_account,
        'WIP Account',
        v_labor_cost,
        1,
        'Production Event',
        p_job_id,
        'job:' || p_job_id,
        v_labor_journal_line_reference,
        v_company_id
      );

      IF v_dimension_employee IS NOT NULL AND v_event."employeeId" IS NOT NULL THEN
        PERFORM insert_journal_line_dimension_entry(
          v_labor_jl_id,
          v_dimension_employee,
          v_event."employeeId",
          v_company_id
        );
      END IF;

      v_labor_jl_id := insert_journal_line_entry(
        v_labor_journal_id,
        v_labor_absorption_account,
        'Labor/Machine Absorption',
        -v_labor_cost,
        1,
        'Production Event',
        p_job_id,
        'job:' || p_job_id,
        v_labor_journal_line_reference,
        v_company_id
      );

      IF v_dimension_employee IS NOT NULL AND v_event."employeeId" IS NOT NULL THEN
        PERFORM insert_journal_line_dimension_entry(
          v_labor_jl_id,
          v_dimension_employee,
          v_event."employeeId",
          v_company_id
        );
      END IF;
    END IF;

    UPDATE "productionEvent"
    SET
      "postedToGL" = true,
      "updatedAt" = NOW(),
      "updatedBy" = v_user_id
    WHERE id = v_event.id;
  END LOOP;

  IF v_quantity_to_receive <= 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(ABS(SUM(jl.amount)), 0)
  INTO v_accumulated_wip_cost
  FROM "journalLine" jl
  INNER JOIN "journal" j ON j.id = jl."journalId"
  WHERE jl."accountId" = v_wip_account
    AND jl."documentId" = p_job_id
    AND j."companyId" = v_company_id;

  IF v_accumulated_wip_cost <= 0 THEN
    RETURN;
  END IF;

  v_journal_line_reference := nanoid();
  v_accounting_period_id := ensure_current_accounting_period(v_company_id, v_user_id);

  BEGIN
    v_journal_entry_id := get_next_sequence('journalEntry', v_company_id);
  EXCEPTION WHEN OTHERS THEN
    v_journal_entry_id := 'JR-' || nanoid('', 10);
  END;

  v_journal_id := nanoid();

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
    'Job Completion ' || v_job_id_readable,
    CURRENT_DATE,
    v_company_id,
    to_jsonb('Job Receipt'::text),
    'Posted',
    NOW(),
    v_user_id,
    NOW(),
    v_user_id
  );

  v_labor_jl_id := insert_journal_line_entry(
    v_journal_id,
    v_inventory_account,
    'Finished Goods Inventory',
    v_accumulated_wip_cost,
    v_quantity_to_receive,
    'Job Receipt',
    p_job_id,
    'job:' || p_job_id,
    v_journal_line_reference,
    v_company_id
  );
  v_jl_ids := v_jl_ids || v_labor_jl_id;

  v_labor_jl_id := insert_journal_line_entry(
    v_journal_id,
    v_wip_account,
    'WIP Account',
    -v_accumulated_wip_cost,
    v_quantity_to_receive,
    'Job Receipt',
    p_job_id,
    'job:' || p_job_id,
    v_journal_line_reference,
    v_company_id
  );
  v_jl_ids := v_jl_ids || v_labor_jl_id;

  PERFORM insert_cost_ledger_entry(
    'Output',
    'Direct Cost',
    false,
    'Job Receipt',
    p_job_id,
    v_item_id,
    v_quantity_to_receive,
    v_accumulated_wip_cost,
    v_quantity_to_receive,
    v_company_id,
    v_accumulated_wip_cost
  );

  SELECT "costingMethod"::text, "unitCost", "itemPostingGroupId"
  INTO v_costing_method, v_existing_unit_cost, v_item_posting_group_id
  FROM "itemCost"
  WHERE "itemId" = v_item_id
    AND "companyId" = v_company_id;

  IF v_costing_method IS NOT NULL AND v_quantity_to_receive > 0 THEN
    v_new_per_unit_cost := v_accumulated_wip_cost / v_quantity_to_receive;

    IF v_costing_method = 'Average' THEN
      SELECT COALESCE(SUM(quantity), 0)
      INTO v_total_qty_on_hand
      FROM "itemLedger"
      WHERE "itemId" = v_item_id
        AND "companyId" = v_company_id;

      v_prior_qty := v_total_qty_on_hand - v_quantity_to_receive;
      v_prior_value := v_prior_qty * COALESCE(v_existing_unit_cost, 0);

      IF v_total_qty_on_hand > 0 THEN
        v_new_unit_cost := (v_prior_value + v_accumulated_wip_cost) / v_total_qty_on_hand;

        UPDATE "itemCost"
        SET
          "unitCost" = v_new_unit_cost,
          "updatedAt" = NOW(),
          "updatedBy" = v_user_id
        WHERE "itemId" = v_item_id
          AND "companyId" = v_company_id;
      END IF;
    ELSIF v_costing_method IN ('FIFO', 'LIFO') THEN
      UPDATE "itemCost"
      SET
        "unitCost" = v_new_per_unit_cost,
        "updatedAt" = NOW(),
        "updatedBy" = v_user_id
      WHERE "itemId" = v_item_id
        AND "companyId" = v_company_id;
    END IF;
  END IF;

  IF COALESCE(array_length(v_jl_ids, 1), 0) > 0 THEN
    FOR i IN 1..array_length(v_jl_ids, 1)
    LOOP
      IF v_item_posting_group_id IS NOT NULL AND v_dimension_item_posting_group IS NOT NULL THEN
        PERFORM insert_journal_line_dimension_entry(
          v_jl_ids[i],
          v_dimension_item_posting_group,
          v_item_posting_group_id,
          v_company_id
        );
      END IF;

      IF v_location_id IS NOT NULL AND v_dimension_location IS NOT NULL THEN
        PERFORM insert_journal_line_dimension_entry(
          v_jl_ids[i],
          v_dimension_location,
          v_location_id,
          v_company_id
        );
      END IF;
    END LOOP;
  END IF;
END;
$$;
