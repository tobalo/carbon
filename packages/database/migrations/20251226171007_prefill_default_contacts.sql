-- Prefill default contacts for customers and suppliers based on phone/fax matches

WITH custs AS (
  SELECT DISTINCT ON (cu.id)
    cu.id AS "customerId",
    cc."id" AS "contactId"
  FROM customer cu
  JOIN "customerContact" cc
    ON cu.id = cc."customerId"
  JOIN contact c
    ON c.id = cc."contactId"
  WHERE
    (c."mobilePhone" IS NOT NULL AND c."mobilePhone" = cu.phone)
     OR
    (c.fax IS NOT NULL AND c.fax = cu.fax)
  ORDER BY
    cu.id,
    (c."mobilePhone" = cu.phone) DESC,
    cc.id
)

UPDATE customer cu
SET
  "salesContactId"     = e."contactId",
  "invoicingContactId" = e."contactId"
FROM custs e
WHERE cu.id = e."customerId";


WITH sups AS (
  SELECT DISTINCT ON (su.id)
    su.id AS "supplierId",
    sc."id" AS "contactId"
  FROM supplier su
  JOIN "supplierContact" sc
    ON su.id = sc."supplierId"
  JOIN contact c
    ON c.id = sc."contactId"
  WHERE
    (c."workPhone" IS NOT NULL AND c."workPhone" = su.phone)
     OR
    (c.fax IS NOT NULL AND c.fax = su.fax)
  ORDER BY
    su.id,
    (c."workPhone" = su.phone) DESC,
    sc.id
)

UPDATE supplier su
SET
  "purchasingContactId" = s."contactId",
  "invoicingContactId"  = s."contactId"
FROM sups s
WHERE su.id = s."supplierId";
