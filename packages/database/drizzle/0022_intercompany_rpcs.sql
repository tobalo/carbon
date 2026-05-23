CREATE OR REPLACE FUNCTION "matchIntercompanyTransactions"(p_company_group_id text)
RETURNS TABLE (
  "id" text,
  "sourceCompanyId" text,
  "targetCompanyId" text,
  "amount" numeric(19, 4),
  "status" text,
  "matchedWithId" text
)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "userToCompany" utc
    JOIN "company" c ON c."id" = utc."companyId"
    WHERE utc."userId" = app_uid()
      AND utc."role" = 'employee'
      AND c."companyGroupId" = p_company_group_id
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions to match intercompany transactions';
  END IF;

  WITH matches AS (
    SELECT
      src."id" AS "sourceId",
      tgt."id" AS "targetId"
    FROM "intercompanyTransaction" src
    JOIN "intercompanyTransaction" tgt
      ON src."sourceCompanyId" = tgt."targetCompanyId"
      AND src."targetCompanyId" = tgt."sourceCompanyId"
      AND src."amount" = tgt."amount"
      AND src."companyGroupId" = tgt."companyGroupId"
    JOIN "company" src_source_company
      ON src_source_company."id" = src."sourceCompanyId"
      AND src_source_company."companyGroupId" = p_company_group_id
    JOIN "company" src_target_company
      ON src_target_company."id" = src."targetCompanyId"
      AND src_target_company."companyGroupId" = p_company_group_id
    JOIN "company" tgt_source_company
      ON tgt_source_company."id" = tgt."sourceCompanyId"
      AND tgt_source_company."companyGroupId" = p_company_group_id
    JOIN "company" tgt_target_company
      ON tgt_target_company."id" = tgt."targetCompanyId"
      AND tgt_target_company."companyGroupId" = p_company_group_id
    JOIN "journalLine" src_jl
      ON src_jl."id" = src."sourceJournalLineId"
      AND src_jl."companyId" = src."sourceCompanyId"
    JOIN "journalLine" tgt_jl
      ON tgt_jl."id" = tgt."sourceJournalLineId"
      AND tgt_jl."companyId" = tgt."sourceCompanyId"
    WHERE src."companyGroupId" = p_company_group_id
      AND src."status" = 'Unmatched'
      AND tgt."status" = 'Unmatched'
      AND src."sourceJournalLineId" < tgt."sourceJournalLineId"
  )
  UPDATE "intercompanyTransaction" ict
  SET
    "status" = 'Matched',
    "targetJournalLineId" = CASE
      WHEN ict."id" = m."sourceId" THEN (
        SELECT t."sourceJournalLineId"
        FROM "intercompanyTransaction" t
        WHERE t."id" = m."targetId"
          AND t."companyGroupId" = p_company_group_id
      )
      ELSE (
        SELECT t."sourceJournalLineId"
        FROM "intercompanyTransaction" t
        WHERE t."id" = m."sourceId"
          AND t."companyGroupId" = p_company_group_id
      )
    END,
    "updatedAt" = NOW()
  FROM matches m
  WHERE ict."companyGroupId" = p_company_group_id
    AND ict."id" IN (m."sourceId", m."targetId");

  RETURN QUERY
  SELECT
    ict."id",
    ict."sourceCompanyId",
    ict."targetCompanyId",
    ict."amount",
    ict."status",
    ict."targetJournalLineId" AS "matchedWithId"
  FROM "intercompanyTransaction" ict
  JOIN "company" sc
    ON sc."id" = ict."sourceCompanyId"
    AND sc."companyGroupId" = p_company_group_id
  JOIN "company" tc
    ON tc."id" = ict."targetCompanyId"
    AND tc."companyGroupId" = p_company_group_id
  WHERE ict."companyGroupId" = p_company_group_id
  ORDER BY ict."createdAt" DESC;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "findLowestCommonParent"(
  p_company_group_id text,
  p_company_a text,
  p_company_b text
)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_result text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "company"
    WHERE "id" = p_company_a
      AND "companyGroupId" = p_company_group_id
  ) OR NOT EXISTS (
    SELECT 1
    FROM "company"
    WHERE "id" = p_company_b
      AND "companyGroupId" = p_company_group_id
  ) THEN
    RETURN NULL;
  END IF;

  WITH RECURSIVE
  ancestors_a AS (
    SELECT "id", "parentCompanyId", 0 AS depth
    FROM "company"
    WHERE "id" = p_company_a
      AND "companyGroupId" = p_company_group_id
    UNION ALL
    SELECT c."id", c."parentCompanyId", a.depth + 1
    FROM "company" c
    JOIN ancestors_a a ON a."parentCompanyId" = c."id"
    WHERE c."companyGroupId" = p_company_group_id
  ),
  ancestors_b AS (
    SELECT "id", "parentCompanyId", 0 AS depth
    FROM "company"
    WHERE "id" = p_company_b
      AND "companyGroupId" = p_company_group_id
    UNION ALL
    SELECT c."id", c."parentCompanyId", b.depth + 1
    FROM "company" c
    JOIN ancestors_b b ON b."parentCompanyId" = c."id"
    WHERE c."companyGroupId" = p_company_group_id
  )
  SELECT a."id"
  INTO v_result
  FROM ancestors_a a
  JOIN ancestors_b b ON a."id" = b."id"
  WHERE a."id" != p_company_a
    AND a."id" != p_company_b
  ORDER BY (a.depth + b.depth) ASC
  LIMIT 1;

  IF v_result IS NULL THEN
    SELECT a."id"
    INTO v_result
    FROM (
      WITH RECURSIVE anc AS (
        SELECT "id", "parentCompanyId"
        FROM "company"
        WHERE "id" = p_company_b
          AND "companyGroupId" = p_company_group_id
        UNION ALL
        SELECT c."id", c."parentCompanyId"
        FROM "company" c
        JOIN anc ON anc."parentCompanyId" = c."id"
        WHERE c."companyGroupId" = p_company_group_id
      )
      SELECT "id" FROM anc WHERE "id" = p_company_a
    ) a;

    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;

    SELECT a."id"
    INTO v_result
    FROM (
      WITH RECURSIVE anc AS (
        SELECT "id", "parentCompanyId"
        FROM "company"
        WHERE "id" = p_company_a
          AND "companyGroupId" = p_company_group_id
        UNION ALL
        SELECT c."id", c."parentCompanyId"
        FROM "company" c
        JOIN anc ON anc."parentCompanyId" = c."id"
        WHERE c."companyGroupId" = p_company_group_id
      )
      SELECT "id" FROM anc WHERE "id" = p_company_b
    ) a;

    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;

  RETURN v_result;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "generateEliminationEntries"(
  p_company_group_id text,
  p_user_id text
)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_lca_id text;
  v_elim_id text;
  v_journal_id text;
  v_journal_entry_id text;
  v_period_id text;
  v_context_user_id text := app_uid();
  v_user_id text := COALESCE(v_context_user_id, p_user_id);
  v_journals_created integer := 0;
BEGIN
  IF v_context_user_id IS NOT NULL
    AND p_user_id IS NOT NULL
    AND p_user_id IS DISTINCT FROM v_context_user_id
  THEN
    RAISE EXCEPTION 'User context mismatch while generating elimination entries';
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User context is required to generate elimination entries';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "userToCompany" utc
    JOIN "company" c ON c."id" = utc."companyId"
    WHERE utc."userId" = v_user_id
      AND utc."role" = 'employee'
      AND c."companyGroupId" = p_company_group_id
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions to generate elimination entries';
  END IF;

  FOR v_rec IN
    SELECT DISTINCT
      ict."sourceCompanyId",
      ict."targetCompanyId"
    FROM "intercompanyTransaction" ict
    JOIN "company" sc
      ON sc."id" = ict."sourceCompanyId"
      AND sc."companyGroupId" = p_company_group_id
    JOIN "company" tc
      ON tc."id" = ict."targetCompanyId"
      AND tc."companyGroupId" = p_company_group_id
    WHERE ict."companyGroupId" = p_company_group_id
      AND ict."status" = 'Matched'
  LOOP
    v_lca_id := "findLowestCommonParent"(p_company_group_id, v_rec."sourceCompanyId", v_rec."targetCompanyId");

    SELECT c."id"
    INTO v_elim_id
    FROM "company" c
    WHERE c."parentCompanyId" = v_lca_id
      AND c."isEliminationEntity" = true
      AND c."companyGroupId" = p_company_group_id
    LIMIT 1;

    IF v_elim_id IS NULL THEN
      SELECT c."id"
      INTO v_elim_id
      FROM "company" c
      WHERE c."companyGroupId" = p_company_group_id
        AND c."isEliminationEntity" = true
      LIMIT 1;
    END IF;

    IF v_elim_id IS NULL THEN
      RAISE EXCEPTION 'No elimination entity found for company group %', p_company_group_id;
    END IF;

    SELECT "id"
    INTO v_period_id
    FROM "accountingPeriod"
    WHERE "companyId" = v_elim_id
      AND "status" = 'Active'
    LIMIT 1;

    v_journal_id := nanoid();
    BEGIN
      v_journal_entry_id := get_next_sequence('journalEntry', v_elim_id);
    EXCEPTION WHEN OTHERS THEN
      v_journal_entry_id := 'IC-' || nanoid('', 10);
    END;

    INSERT INTO "journal" (
      "id",
      "journalEntryId",
      "description",
      "accountingPeriodId",
      "companyId",
      "postingDate",
      "status",
      "createdAt",
      "createdBy"
    )
    VALUES (
      v_journal_id,
      v_journal_entry_id,
      'IC Elimination: ' || v_rec."sourceCompanyId" || ' <-> ' || v_rec."targetCompanyId",
      v_period_id,
      v_elim_id,
      CURRENT_DATE,
      'Posted',
      NOW(),
      v_user_id
    );

    v_journals_created := v_journals_created + 1;

    INSERT INTO "journalLine" (
      "id",
      "journalId",
      "accountId",
      "description",
      "amount",
      "documentType",
      "journalLineReference",
      "companyId",
      "createdAt",
      "accrual",
      "quantity"
    )
    SELECT
      nanoid(),
      v_journal_id,
      jl."accountId",
      'IC Elimination: ' || COALESCE(jl."description", ''),
      -jl."amount",
      jl."documentType",
      'ic-elim-' || ict."id",
      v_elim_id,
      NOW(),
      false,
      0
    FROM "intercompanyTransaction" ict
    JOIN "journalLine" jl
      ON jl."id" = ict."sourceJournalLineId"
      AND jl."companyId" = ict."sourceCompanyId"
    JOIN "account" a
      ON a."id" = jl."accountId"
      AND a."companyGroupId" = p_company_group_id
    WHERE ict."companyGroupId" = p_company_group_id
      AND ict."status" = 'Matched'
      AND ict."sourceCompanyId" = v_rec."sourceCompanyId"
      AND ict."targetCompanyId" = v_rec."targetCompanyId";

    INSERT INTO "journalLine" (
      "id",
      "journalId",
      "accountId",
      "description",
      "amount",
      "documentType",
      "journalLineReference",
      "companyId",
      "createdAt",
      "accrual",
      "quantity"
    )
    SELECT
      nanoid(),
      v_journal_id,
      jl."accountId",
      'IC Elimination: ' || COALESCE(jl."description", ''),
      -jl."amount",
      jl."documentType",
      'ic-elim-' || ict."id",
      v_elim_id,
      NOW(),
      false,
      0
    FROM "intercompanyTransaction" ict
    JOIN "journalLine" jl
      ON jl."id" = ict."targetJournalLineId"
      AND jl."companyId" = ict."targetCompanyId"
    JOIN "account" a
      ON a."id" = jl."accountId"
      AND a."companyGroupId" = p_company_group_id
    WHERE ict."companyGroupId" = p_company_group_id
      AND ict."status" = 'Matched'
      AND ict."sourceCompanyId" = v_rec."sourceCompanyId"
      AND ict."targetCompanyId" = v_rec."targetCompanyId"
      AND ict."targetJournalLineId" IS NOT NULL;

    UPDATE "intercompanyTransaction"
    SET
      "status" = 'Eliminated',
      "eliminationJournalId" = v_journal_id,
      "updatedAt" = NOW()
    WHERE "companyGroupId" = p_company_group_id
      AND "status" = 'Matched'
      AND "sourceCompanyId" = v_rec."sourceCompanyId"
      AND "targetCompanyId" = v_rec."targetCompanyId"
      AND EXISTS (
        SELECT 1
        FROM "company" sc
        WHERE sc."id" = "intercompanyTransaction"."sourceCompanyId"
          AND sc."companyGroupId" = p_company_group_id
      )
      AND EXISTS (
        SELECT 1
        FROM "company" tc
        WHERE tc."id" = "intercompanyTransaction"."targetCompanyId"
          AND tc."companyGroupId" = p_company_group_id
      )
      AND EXISTS (
        SELECT 1
        FROM "journalLine" jl
        JOIN "account" a
          ON a."id" = jl."accountId"
          AND a."companyGroupId" = p_company_group_id
        WHERE jl."id" = "intercompanyTransaction"."sourceJournalLineId"
          AND jl."companyId" = "intercompanyTransaction"."sourceCompanyId"
      )
      AND (
        "targetJournalLineId" IS NULL
        OR EXISTS (
          SELECT 1
          FROM "journalLine" jl
          JOIN "account" a
            ON a."id" = jl."accountId"
            AND a."companyGroupId" = p_company_group_id
          WHERE jl."id" = "intercompanyTransaction"."targetJournalLineId"
            AND jl."companyId" = "intercompanyTransaction"."targetCompanyId"
        )
      );
  END LOOP;

  RETURN v_journals_created;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "getIntercompanyBalance"(p_company_group_id text)
RETURNS TABLE (
  "sourceCompanyId" text,
  "sourceCompanyName" text,
  "targetCompanyId" text,
  "targetCompanyName" text,
  "balance" numeric(19, 4)
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "userToCompany" utc
    JOIN "company" c ON c."id" = utc."companyId"
    WHERE utc."userId" = app_uid()
      AND utc."role" = 'employee'
      AND c."companyGroupId" = p_company_group_id
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions to view intercompany balance';
  END IF;

  RETURN QUERY
  SELECT
    ict."sourceCompanyId",
    sc."name" AS "sourceCompanyName",
    ict."targetCompanyId",
    tc."name" AS "targetCompanyName",
    SUM(
      CASE
        WHEN ict."status" != 'Eliminated' THEN ict."amount"
        ELSE 0
      END
    ) AS "balance"
  FROM "intercompanyTransaction" ict
  JOIN "company" sc
    ON sc."id" = ict."sourceCompanyId"
    AND sc."companyGroupId" = p_company_group_id
  JOIN "company" tc
    ON tc."id" = ict."targetCompanyId"
    AND tc."companyGroupId" = p_company_group_id
  WHERE ict."companyGroupId" = p_company_group_id
  GROUP BY ict."sourceCompanyId", sc."name", ict."targetCompanyId", tc."name"
  HAVING SUM(
    CASE
      WHEN ict."status" != 'Eliminated' THEN ict."amount"
      ELSE 0
    END
  ) != 0;
END;
$$;
