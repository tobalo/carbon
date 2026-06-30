-- Customer table simplifications and contact email adjustments start
-- Make email nullable on contact table
ALTER TABLE "contact" DROP CONSTRAINT IF EXISTS "contact_email_companyId_unique";

ALTER TABLE "contact" ALTER COLUMN "email" DROP NOT NULL;

-- Create a partial unique index for email (only when email is not null)
CREATE UNIQUE INDEX "contact_email_companyId_unique_idx"
  ON "contact" ("email", "companyId", "isCustomer")
  WHERE "email" IS NOT NULL;


ALTER TABLE customer ADD COLUMN "salesContactId" TEXT references "customerContact" (id) ON DELETE RESTRICT;
ALTER TABLE customer ADD COLUMN "invoicingContactId" TEXT references "customerContact" (id) ON DELETE RESTRICT;

DROP VIEW IF EXISTS "customers";

-- Recreate customers view with phone/fax from primary contact
CREATE OR REPLACE VIEW "customers" WITH(SECURITY_INVOKER=true) AS
  SELECT
    c.id,
    c.name,
    c."customerTypeId",
    c."customerStatusId",
    c."taxId",
    c."accountManagerId",
    c.logo,
    c.assignee,
    c."taxPercent",
    c.website,
    c."companyId",
    c."createdAt",
    c."createdBy",
    c."updatedAt",
    c."updatedBy",
    c."customFields",
    c."currencyCode",
    c."salesContactId",
    c."invoicingContactId",
    ct.name AS "type",
    cs.name AS "status",
    so.count AS "orderCount",
    pc."workPhone" AS "phone",
    pc."fax" AS "fax"
  FROM "customer" c
  LEFT JOIN "customerType" ct ON ct.id = c."customerTypeId"
  LEFT JOIN "customerStatus" cs ON cs.id = c."customerStatusId"
  LEFT JOIN (
    SELECT
      "customerId",
      COUNT(*) AS "count"
    FROM "salesOrder"
    GROUP BY "customerId"
  ) so ON so."customerId" = c.id
  LEFT JOIN (
    SELECT DISTINCT ON (cc."customerId")
      cc."customerId",
      co."workPhone",
      co."fax"
    FROM "customerContact" cc
    INNER JOIN "contact" co ON co.id = cc."contactId"
    ORDER BY cc."customerId"
  ) pc ON pc."customerId" = c.id;

-- Create contacts from customer phone/fax data
-- Only create contacts for customers that have phone or fax data
WITH src AS (
  SELECT
    xid() AS contact_id,
    cu."id" AS "customerId",
    cu."name" AS "firstName",
    '' AS "lastName",
    NULL AS "email",
    cu."phone" AS "mobilePhone",
    cu."fax",
    true AS "isCustomer",
    cu."companyId"
  FROM "customer" cu
  WHERE cu."phone" IS NOT NULL
     OR cu."fax" IS NOT NULL
),

c AS (
  INSERT INTO "contact" (
    "id",
    "firstName",
    "lastName",
    "email",
    "mobilePhone",
    "fax",
    "isCustomer",
    "companyId"
  )
  SELECT
    contact_id,
    "firstName",
    "lastName",
    "email",
    "mobilePhone",
    "fax",
    "isCustomer",
    "companyId"
  FROM src
  ON CONFLICT DO NOTHING
  RETURNING id
)

INSERT INTO "customerContact" (
  "id",
  "customerId",
  "contactId"
)
SELECT
  xid(),
  src."customerId",
  c.id
FROM c
JOIN src
  ON src.contact_id = c.id
ON CONFLICT DO NOTHING;
-- Customer table simplifications and contact email adjustments end
