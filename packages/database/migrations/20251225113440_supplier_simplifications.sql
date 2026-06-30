-- Supplier table simplifications and contact email adjustments start
-- Add purchasingContactId and invoicingContactId to supplier table
ALTER TABLE supplier ADD COLUMN "purchasingContactId" TEXT references "supplierContact" (id) ON DELETE RESTRICT;
ALTER TABLE supplier ADD COLUMN "invoicingContactId" TEXT references "supplierContact" (id) ON DELETE RESTRICT;

-- Recreate suppliers view to include phone and fax from supplierContact
DROP VIEW IF EXISTS "suppliers";

-- Recreate suppliers view with phone/fax from primary contact
CREATE OR REPLACE VIEW "suppliers" WITH(SECURITY_INVOKER=true) AS
      SELECT
        s.id,
        s.name,
        s."supplierTypeId",
        s."supplierStatusId",
        s."taxId",
        s."accountManagerId",
        s.logo,
        s.assignee,
        s."companyId",
        s."createdAt",
        s."createdBy",
        s."updatedAt",
        s."updatedBy",
        s."customFields",
        s."currencyCode",
        s.website,
        s."externalId",
        s.tags,
        s."taxPercent",
        s."purchasingContactId",
        s."invoicingContactId",
        s.embedding,
        st.name AS "type",
        ss.name AS "status",
        po.count AS "orderCount",
        p.count AS "partCount",
        pc."workPhone" AS "phone",
        pc.fax AS "fax"
      FROM "supplier" s
      LEFT JOIN "supplierType" st ON st.id = s."supplierTypeId"
      LEFT JOIN "supplierStatus" ss ON ss.id = s."supplierStatusId"
      LEFT JOIN (
        SELECT
          "supplierId",
          COUNT(*) AS "count"
        FROM "purchaseOrder"
        GROUP BY "supplierId"
      ) po ON po."supplierId" = s.id
      LEFT JOIN (
        SELECT
          "supplierId",
          COUNT(*) AS "count"
        FROM "supplierPart"
        GROUP BY "supplierId"
      ) p ON p."supplierId" = s.id
    LEFT JOIN (
      SELECT DISTINCT ON (sc."supplierId")
        sc."supplierId" AS id,
        co."workPhone",
        co."fax"
      FROM "supplierContact" sc
      JOIN "contact" co
        ON co.id = sc."contactId"
      ORDER BY sc."supplierId", sc.id
    ) pc
      ON pc.id = s.id;

-- Create contacts from supplier phone/fax data
-- Only create contacts for suppliers that have phone or fax data
WITH src AS (
  SELECT
    xid() AS contact_id,
    su."id" AS "supplierId",
    su."name" AS "firstName",
    '' AS "lastName",
    NULL AS "email",
    su."phone" AS "workPhone",
    su."fax",
    false AS "isCustomer",
    su."companyId"
  FROM "supplier" su
  WHERE su."phone" IS NOT NULL
     OR su."fax" IS NOT NULL
),

c AS (
  INSERT INTO "contact" (
    "id",
    "firstName",
    "lastName",
    "email",
    "workPhone",
    "fax",
    "isCustomer",
    "companyId"
  )
  SELECT
    contact_id,
    "firstName",
    "lastName",
    "email",
    "workPhone",
    "fax",
    "isCustomer",
    "companyId"
  FROM src
  ON CONFLICT DO NOTHING
  RETURNING id
)

INSERT INTO "supplierContact" (
  "id",
  "supplierId",
  "contactId"
)
SELECT
  xid(),
  src."supplierId",
  c.id
FROM c
JOIN src
  ON src.contact_id = c.id
ON CONFLICT DO NOTHING;
-- Supplier table simplifications and contact email adjustments end