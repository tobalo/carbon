INSERT INTO "employeeTypePermission" ("employeeTypeId", "module", "view", "create", "update", "delete")
SELECT 
  et.id,
  'Quality',
  ARRAY[et."companyId"],
  ARRAY[et."companyId"],
  ARRAY[et."companyId"],
  ARRAY[et."companyId"]
FROM "employeeType" et
WHERE et.protected = true
ON CONFLICT ("employeeTypeId", "module") DO NOTHING;
