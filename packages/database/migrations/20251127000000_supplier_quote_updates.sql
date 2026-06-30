-- Add new status values to supplierQuoteStatus enum
ALTER TYPE "supplierQuoteStatus" ADD VALUE IF NOT EXISTS 'Draft';
ALTER TYPE "supplierQuoteStatus" ADD VALUE IF NOT EXISTS 'Declined';
ALTER TYPE "supplierQuoteStatus" ADD VALUE IF NOT EXISTS 'Cancelled';


-- Add externalLinkId column to supplierQuote table
ALTER TABLE "supplierQuote" ADD COLUMN IF NOT EXISTS "externalLinkId" uuid REFERENCES "externalLink"("id") ON DELETE SET NULL;


DROP VIEW IF EXISTS "supplierQuotes";
CREATE OR REPLACE VIEW "supplierQuotes"
WITH
  (SECURITY_INVOKER = true) AS
SELECT
  q.*,
  ql."thumbnailPath",
  ql."itemType"
FROM
  "supplierQuote" q
  LEFT JOIN (
    SELECT
      "supplierQuoteId",
      MIN(
        CASE
          WHEN i."thumbnailPath" IS NULL
          AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
          ELSE i."thumbnailPath"
        END
      ) AS "thumbnailPath",
      MIN(i."type") AS "itemType"
    FROM
      "supplierQuoteLine"
      INNER JOIN "item" i ON i."id" = "supplierQuoteLine"."itemId"
      LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId"
    GROUP BY
      "supplierQuoteId"
  ) ql ON ql."supplierQuoteId" = q.id;


-- Policies
-- Consolidate all policies into single policies for SELECT, INSERT, UPDATE, DELETE

-- Drop existing granular policies
DROP POLICY IF EXISTS "Employees with purchasing_view can view purchasing-related external links" ON "externalLink";
DROP POLICY IF EXISTS "Employees with purchasing_create can insert purchasing-related external links" ON "externalLink";
DROP POLICY IF EXISTS "Employees with purchasing_update can update purchasing-related external links" ON "externalLink";
DROP POLICY IF EXISTS "Employees with purchasing_delete can delete purchasing-related external links" ON "externalLink";

-- Drop consolidated policies if they exist (re-run safety)
DROP POLICY IF EXISTS "SELECT" ON "externalLink";
DROP POLICY IF EXISTS "INSERT" ON "externalLink";
DROP POLICY IF EXISTS "UPDATE" ON "externalLink";
DROP POLICY IF EXISTS "DELETE" ON "externalLink";

CREATE POLICY "Authenticated users can view external links" ON "externalLink"
  FOR SELECT
  USING (
    "companyId" = ANY (
      (
        SELECT
          get_companies_with_employee_role()
      )::text[]
    )
  );

CREATE POLICY "Employees with purchasing_create can insert purchasing-related external links" ON "externalLink"
  FOR INSERT WITH CHECK (
    "documentType" = 'SupplierQuote' AND "companyId" = ANY (
      (
        SELECT
          get_companies_with_employee_permission('purchasing_create')
      )::text[]
    )
  );

CREATE POLICY "Employees with purchasing_update can update purchasing-related external links" ON "externalLink"
  FOR UPDATE USING (
    "documentType" = 'SupplierQuote' AND "companyId" = ANY (
      (
        SELECT
          get_companies_with_employee_permission('purchasing_update')
      )::text[]
    )
  );

CREATE POLICY "Employees with purchasing_delete can delete purchasing-related external links" ON "externalLink"
  FOR DELETE USING
    (
      "documentType" = 'SupplierQuote' AND "companyId" = ANY (
        (
          SELECT
            get_companies_with_employee_permission('purchasing_delete')
        )::text[]
      )
    )
