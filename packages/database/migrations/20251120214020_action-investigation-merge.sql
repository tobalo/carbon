-- Migration: Merge nonConformanceInvestigationTask into nonConformanceActionTask
-- and nonConformanceInvestigationType into nonConformanceRequiredAction

-- Step 1: Migrate investigation types to nonConformanceRequiredAction
-- Insert all investigation types into the required action table
INSERT INTO "nonConformanceRequiredAction" (
  "id",
  "companyId",
  "name",
  "active",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy"
)
SELECT
  "id",
  "companyId",
  "name",
  "active",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy"
FROM "nonConformanceInvestigationType"
ON CONFLICT ("companyId", "name") DO NOTHING;

-- Step 2: Migrate investigation tasks to nonConformanceActionTask
-- Insert all investigation tasks into the action task table
INSERT INTO "nonConformanceActionTask" (
  "id",
  "nonConformanceId",
  "actionTypeId",
  "status",
  "dueDate",
  "completedDate",
  "assignee",
  "notes",
  "supplierId",
  "sortOrder",
  "tags",
  "companyId",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy"
)
SELECT
  "id",
  "nonConformanceId",
  "investigationTypeId" as "actionTypeId",
  "status",
  "dueDate",
  "completedDate",
  "assignee",
  "notes",
  "supplierId",
  "sortOrder",
  "tags",
  "companyId",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy"
FROM "nonConformanceInvestigationTask";

-- Step 3: Merge investigationTypeIds into requiredActionIds for nonConformance table
-- Combine both arrays, removing duplicates
UPDATE "nonConformance"
SET "requiredActionIds" = (
  SELECT ARRAY(
    SELECT DISTINCT unnest("requiredActionIds" || "investigationTypeIds")
  )
)
WHERE "investigationTypeIds" IS NOT NULL
  AND array_length("investigationTypeIds", 1) > 0;

-- Step 4: Merge investigationTypeIds into requiredActionIds for nonConformanceWorkflow table
-- Combine both arrays, removing duplicates
UPDATE "nonConformanceWorkflow"
SET "requiredActionIds" = (
  SELECT ARRAY(
    SELECT DISTINCT unnest("requiredActionIds" || "investigationTypeIds")
  )
)
WHERE "investigationTypeIds" IS NOT NULL
  AND array_length("investigationTypeIds", 1) > 0;

-- Step 5: Drop the investigationTypeIds columns (CASCADE to drop dependent views)
ALTER TABLE "nonConformance" DROP COLUMN IF EXISTS "investigationTypeIds" CASCADE;
ALTER TABLE "nonConformanceWorkflow" DROP COLUMN IF EXISTS "investigationTypeIds" CASCADE;

-- Step 6: Drop the trigger function for investigation types (no longer needed)
DROP FUNCTION IF EXISTS remove_investigation_type_from_arrays();

-- Step 7: Drop the old investigation task table
DROP TABLE IF EXISTS "nonConformanceInvestigationTask";

-- Step 8: Drop the old investigation type table
DROP TABLE IF EXISTS "nonConformanceInvestigationType";

-- Step 9: Drop any old enums if they still exist (they were deprecated in earlier migrations)
DROP TYPE IF EXISTS "nonConformanceInvestigation";
DROP TYPE IF EXISTS "nonConformanceAction";

CREATE OR REPLACE VIEW "issues" WITH(SECURITY_INVOKER=true) AS
  SELECT
    ncr.*,
    nci."items"
  FROM "nonConformance" ncr
  LEFT JOIN (
    SELECT
      "nonConformanceId",
      array_agg("itemId"::text) as items
    FROM "nonConformanceItem" nci
    GROUP BY "nonConformanceId"
  ) nci ON nci."nonConformanceId" = ncr."id";