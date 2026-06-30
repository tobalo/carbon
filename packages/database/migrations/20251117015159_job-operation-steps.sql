-- Function to get all jobOperationStepRecords for a given job
DROP FUNCTION IF EXISTS get_job_operation_step_records;
CREATE OR REPLACE FUNCTION get_job_operation_step_records(p_job_id TEXT)
RETURNS TABLE (
  "id" TEXT,
  "jobOperationStepId" TEXT,
  "index" INTEGER,
  "type" "procedureStepType",
  "name" TEXT,
  "value" TEXT,
  "numericValue" NUMERIC,
  "booleanValue" BOOLEAN,
  "userValue" TEXT,
  "unitOfMeasureCode" TEXT,
  "minValue" NUMERIC,
  "maxValue" NUMERIC,
  "operationId" TEXT,
  "operationDescription" TEXT,
  "itemId" TEXT,
  "itemReadableId" TEXT,
  "companyId" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE,
  "createdBy" TEXT,
  "updatedAt" TIMESTAMP WITH TIME ZONE,
  "updatedBy" TEXT
)
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  WITH job_operations AS (
    -- Get all job operations for the given job
    SELECT 
      jo."id",
      jo."description",
      jo."order",
      jo."jobMakeMethodId"
    FROM "jobOperation" jo
    WHERE jo."jobId" = p_job_id
  ),
  job_operation_steps AS (
    -- Get all job operation steps for those operations
    SELECT 
      jos."id", 
      jos."type", 
      jos."name",
      jos."unitOfMeasureCode",
      jos."minValue",
      jos."maxValue",
      jos."operationId",
      jo."description" as "operationDescription",
      jo."jobMakeMethodId"
    FROM "jobOperationStep" jos
    INNER JOIN job_operations jo ON jos."operationId" = jo."id"
  ),
  job_items AS (
    -- Get item info from jobMakeMethod
    SELECT 
      jmm."id" as "makeMethodId",
      i."id" as "itemId",
      i."readableIdWithRevision" as "itemReadableId"
    FROM "jobMakeMethod" jmm
    LEFT JOIN "item" i ON jmm."parentMaterialId" = i."id"
  )
  -- Get all job operation step records for those steps
  SELECT 
    josr."id",
    josr."jobOperationStepId",
    josr."index",
    jos."type",
    jos."name",
    josr."value",
    josr."numericValue",
    josr."booleanValue",
    josr."userValue",
    jos."unitOfMeasureCode",
    jos."minValue",
    jos."maxValue",
    jos."operationId",
    jos."operationDescription",
    ji."itemId",
    ji."itemReadableId",
    josr."companyId",
    josr."createdAt",
    josr."createdBy",
    josr."updatedAt",
    josr."updatedBy"
  FROM "jobOperationStepRecord" josr
  INNER JOIN job_operation_steps jos ON josr."jobOperationStepId" = jos."id"
  LEFT JOIN job_items ji ON jos."jobMakeMethodId" = ji."makeMethodId"
  ORDER BY josr."jobOperationStepId", josr."index";
END;
$$ LANGUAGE plpgsql;
