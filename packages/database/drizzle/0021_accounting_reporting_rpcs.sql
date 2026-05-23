CREATE OR REPLACE FUNCTION "accountTreeBalances"(
  p_company_group_id text,
  from_date date DEFAULT (now() - interval '100 year'),
  to_date date DEFAULT now()
)
RETURNS TABLE (
  "accountId" text,
  "balance" numeric(19, 4),
  "balanceAtDate" numeric(19, 4),
  "netChange" numeric(19, 4)
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE "accountTree" AS (
    SELECT
      a."id",
      a."id" AS "rootId",
      a."isGroup"
    FROM "account" a
    WHERE a."companyGroupId" = p_company_group_id
      AND a."active" = true
    UNION ALL
    SELECT
      child."id",
      t."rootId",
      child."isGroup"
    FROM "accountTree" t
    JOIN "account" child ON child."parentId" = t."id"
    WHERE t."isGroup" = true
      AND child."companyGroupId" = p_company_group_id
      AND child."active" = true
  ),
  "leafBalances" AS (
    SELECT
      a."id" AS "accountId",
      COALESCE(SUM(CASE WHEN j."id" IS NOT NULL THEN jl."amount" ELSE 0 END), 0) AS "balance",
      COALESCE(SUM(CASE WHEN j."postingDate" <= to_date THEN jl."amount" ELSE 0 END), 0) AS "balanceAtDate",
      COALESCE(SUM(CASE WHEN j."postingDate" >= from_date AND j."postingDate" <= to_date THEN jl."amount" ELSE 0 END), 0) AS "netChange"
    FROM "account" a
    LEFT JOIN "journalLine" jl
      ON jl."accountId" = a."id"
      AND EXISTS (
        SELECT 1
        FROM "company" c
        WHERE c."id" = jl."companyId"
          AND c."companyGroupId" = p_company_group_id
      )
    LEFT JOIN "journal" j
      ON j."id" = jl."journalId"
      AND j."companyId" = jl."companyId"
    WHERE a."companyGroupId" = p_company_group_id
      AND a."isGroup" = false
      AND a."active" = true
    GROUP BY a."id"
  )
  SELECT
    t."rootId" AS "accountId",
    COALESCE(SUM(lb."balance"), 0)::numeric(19, 4) AS "balance",
    COALESCE(SUM(lb."balanceAtDate"), 0)::numeric(19, 4) AS "balanceAtDate",
    COALESCE(SUM(lb."netChange"), 0)::numeric(19, 4) AS "netChange"
  FROM "accountTree" t
  LEFT JOIN "leafBalances" lb ON lb."accountId" = t."id" AND t."isGroup" = false
  GROUP BY t."rootId";
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "accountTreeBalancesByCompany"(
  p_company_group_id text,
  p_company_id text DEFAULT NULL,
  from_date date DEFAULT (now() - interval '100 year'),
  to_date date DEFAULT now()
)
RETURNS TABLE (
  "accountId" text,
  "balance" numeric(19, 4),
  "balanceAtDate" numeric(19, 4),
  "netChange" numeric(19, 4)
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE "accountTree" AS (
    SELECT
      a."id",
      a."id" AS "rootId",
      a."isGroup"
    FROM "account" a
    WHERE a."companyGroupId" = p_company_group_id
      AND a."active" = true
    UNION ALL
    SELECT
      child."id",
      t."rootId",
      child."isGroup"
    FROM "accountTree" t
    JOIN "account" child ON child."parentId" = t."id"
    WHERE t."isGroup" = true
      AND child."companyGroupId" = p_company_group_id
      AND child."active" = true
  ),
  "leafBalances" AS (
    SELECT
      a."id" AS "accountId",
      COALESCE(SUM(CASE WHEN j."id" IS NOT NULL THEN jl."amount" ELSE 0 END), 0) AS "balance",
      COALESCE(SUM(CASE WHEN j."postingDate" <= to_date THEN jl."amount" ELSE 0 END), 0) AS "balanceAtDate",
      COALESCE(SUM(CASE WHEN j."postingDate" >= from_date AND j."postingDate" <= to_date THEN jl."amount" ELSE 0 END), 0) AS "netChange"
    FROM "account" a
    LEFT JOIN "journalLine" jl
      ON jl."accountId" = a."id"
      AND (p_company_id IS NULL OR jl."companyId" = p_company_id)
      AND EXISTS (
        SELECT 1
        FROM "company" c
        WHERE c."id" = jl."companyId"
          AND c."companyGroupId" = p_company_group_id
      )
    LEFT JOIN "journal" j
      ON j."id" = jl."journalId"
      AND j."companyId" = jl."companyId"
    WHERE a."companyGroupId" = p_company_group_id
      AND a."isGroup" = false
      AND a."active" = true
    GROUP BY a."id"
  )
  SELECT
    t."rootId" AS "accountId",
    COALESCE(SUM(lb."balance"), 0)::numeric(19, 4) AS "balance",
    COALESCE(SUM(lb."balanceAtDate"), 0)::numeric(19, 4) AS "balanceAtDate",
    COALESCE(SUM(lb."netChange"), 0)::numeric(19, 4) AS "netChange"
  FROM "accountTree" t
  LEFT JOIN "leafBalances" lb ON lb."accountId" = t."id" AND t."isGroup" = false
  GROUP BY t."rootId";
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "trialBalance"(
  p_company_group_id text,
  p_company_id text DEFAULT NULL,
  from_date date DEFAULT (now() - interval '100 year'),
  to_date date DEFAULT now()
)
RETURNS TABLE (
  "accountId" text,
  "accountNumber" text,
  "accountName" text,
  "accountClass" "glAccountClass",
  "incomeBalance" "glIncomeBalance",
  "debitBalance" numeric(19, 4),
  "creditBalance" numeric(19, 4),
  "netChange" numeric(19, 4)
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a."id" AS "accountId",
    a."number" AS "accountNumber",
    a."name" AS "accountName",
    a."class" AS "accountClass",
    a."incomeBalance",
    CASE
      WHEN a."class" IN ('Asset', 'Expense') AND b."balanceAtDate" > 0 THEN b."balanceAtDate"
      WHEN a."class" IN ('Liability', 'Equity', 'Revenue') AND b."balanceAtDate" < 0 THEN ABS(b."balanceAtDate")
      ELSE 0::numeric(19, 4)
    END AS "debitBalance",
    CASE
      WHEN a."class" IN ('Liability', 'Equity', 'Revenue') AND b."balanceAtDate" >= 0 THEN b."balanceAtDate"
      WHEN a."class" IN ('Asset', 'Expense') AND b."balanceAtDate" < 0 THEN ABS(b."balanceAtDate")
      ELSE 0::numeric(19, 4)
    END AS "creditBalance",
    b."netChange"
  FROM "account" a
  JOIN "accountTreeBalancesByCompany"(p_company_group_id, p_company_id, from_date, to_date) b
    ON b."accountId" = a."id"
  WHERE a."isGroup" = false
    AND a."companyGroupId" = p_company_group_id
    AND a."active" = true
    AND (b."balanceAtDate" != 0 OR b."netChange" != 0)
  ORDER BY a."number";
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "translateTrialBalance"(
  p_company_group_id text,
  p_company_id text,
  p_target_currency text,
  p_period_end date,
  p_period_start date DEFAULT NULL
)
RETURNS TABLE (
  "accountId" text,
  "localBalance" numeric(19, 4),
  "exchangeRate" numeric(20, 8),
  "translatedBalance" numeric(19, 4)
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_source_currency text;
  v_closing_rate numeric(20, 8);
  v_average_rate numeric(20, 8);
  v_historical_rate numeric(20, 8);
BEGIN
  SELECT "baseCurrencyCode"
  INTO v_source_currency
  FROM "company"
  WHERE "id" = p_company_id
    AND "companyGroupId" = p_company_group_id;

  IF v_source_currency IS NULL THEN
    RETURN;
  END IF;

  IF v_source_currency = p_target_currency THEN
    RETURN QUERY
    SELECT
      b."accountId",
      b."balanceAtDate" AS "localBalance",
      1.0::numeric(20, 8) AS "exchangeRate",
      b."balanceAtDate" AS "translatedBalance"
    FROM "accountTreeBalancesByCompany"(p_company_group_id, p_company_id, p_period_start, p_period_end) b
    JOIN "account" a ON a."id" = b."accountId"
    WHERE a."isGroup" = false
      AND a."companyGroupId" = p_company_group_id;
    RETURN;
  END IF;

  SELECT "rate"
  INTO v_closing_rate
  FROM "exchangeRateHistory"
  WHERE "currencyCode" = v_source_currency
    AND "companyGroupId" = p_company_group_id
    AND "effectiveDate" <= p_period_end
  ORDER BY "effectiveDate" DESC
  LIMIT 1;

  SELECT AVG("rate")
  INTO v_average_rate
  FROM "exchangeRateHistory"
  WHERE "currencyCode" = v_source_currency
    AND "companyGroupId" = p_company_group_id
    AND "effectiveDate" >= COALESCE(p_period_start, p_period_end - interval '1 year')
    AND "effectiveDate" <= p_period_end;

  SELECT "historicalExchangeRate"
  INTO v_historical_rate
  FROM "currency"
  WHERE "code" = v_source_currency
    AND "companyGroupId" = p_company_group_id;

  v_average_rate := COALESCE(v_average_rate, v_closing_rate, 1);
  v_historical_rate := COALESCE(v_historical_rate, v_closing_rate, 1);
  v_closing_rate := COALESCE(v_closing_rate, 1);

  RETURN QUERY
  SELECT
    b."accountId",
    b."balanceAtDate" AS "localBalance",
    CASE a."consolidatedRate"
      WHEN 'Current' THEN v_closing_rate
      WHEN 'Average' THEN v_average_rate
      WHEN 'Historical' THEN v_historical_rate
    END AS "exchangeRate",
    ROUND(b."balanceAtDate" * CASE a."consolidatedRate"
      WHEN 'Current' THEN v_closing_rate
      WHEN 'Average' THEN v_average_rate
      WHEN 'Historical' THEN v_historical_rate
    END, 4) AS "translatedBalance"
  FROM "accountTreeBalancesByCompany"(p_company_group_id, p_company_id, p_period_start, p_period_end) b
  JOIN "account" a ON a."id" = b."accountId"
  WHERE a."isGroup" = false
    AND a."companyGroupId" = p_company_group_id;
END;
$$;
