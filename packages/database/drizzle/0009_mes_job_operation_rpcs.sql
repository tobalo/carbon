CREATE OR REPLACE FUNCTION get_active_job_operations_by_location(
  location_id text,
  company_id text,
  work_center_ids text[]
)
RETURNS TABLE (
  "id" text,
  "jobId" text,
  "jobMakeMethodId" text,
  "operationOrder" double precision,
  "priority" double precision,
  "processId" text,
  "workCenterId" text,
  "description" text,
  "setupTime" numeric,
  "setupUnit" factor,
  "laborTime" numeric,
  "laborUnit" factor,
  "machineTime" numeric,
  "machineUnit" factor,
  "operationOrderType" "methodOperationOrder",
  "jobReadableId" text,
  "jobStatus" "jobStatus",
  "jobDueDate" date,
  "jobDeadlineType" "deadlineType",
  "jobCustomerId" text,
  "customerName" text,
  "parentMaterialId" text,
  "itemReadableId" text,
  "itemDescription" text,
  "operationStatus" "jobOperationStatus",
  "targetQuantity" numeric,
  "operationQuantity" numeric,
  "quantityComplete" numeric,
  "quantityScrapped" numeric,
  "salesOrderId" text,
  "salesOrderLineId" text,
  "salesOrderReadableId" text,
  "assignee" text,
  "tags" text[],
  "thumbnailPath" text,
  "operationDueDate" date
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH relevant_jobs AS (
    SELECT *
    FROM "job"
    WHERE "locationId" = location_id
      AND "companyId" = company_id
      AND "status" IN ('Ready', 'In Progress', 'Paused')
  )
  SELECT
    jo."id",
    jo."jobId",
    jo."jobMakeMethodId",
    jo."order"::double precision AS "operationOrder",
    jo."priority"::double precision AS "priority",
    jo."processId",
    jo."workCenterId",
    jo."description",
    jo."setupTime"::numeric(10, 2),
    jo."setupUnit",
    jo."laborTime"::numeric(10, 2),
    jo."laborUnit",
    jo."machineTime"::numeric(10, 2),
    jo."machineUnit",
    jo."operationOrder" AS "operationOrderType",
    rj."jobId" AS "jobReadableId",
    rj."status" AS "jobStatus",
    rj."dueDate" AS "jobDueDate",
    rj."deadlineType" AS "jobDeadlineType",
    rj."customerId" AS "jobCustomerId",
    c."name" AS "customerName",
    jmm."parentMaterialId",
    i."readableId" AS "itemReadableId",
    i."name" AS "itemDescription",
    CASE
      WHEN rj."status" = 'Paused' THEN 'Paused'
      ELSE jo."status"
    END AS "operationStatus",
    jo."targetQuantity"::numeric,
    jo."operationQuantity",
    jo."quantityComplete",
    jo."quantityScrapped",
    rj."salesOrderId",
    rj."salesOrderLineId",
    so."salesOrderId" AS "salesOrderReadableId",
    jo."assignee",
    jo."tags",
    COALESCE(mu."thumbnailPath", i."thumbnailPath") AS "thumbnailPath",
    jo."dueDate" AS "operationDueDate"
  FROM "jobOperation" jo
  JOIN relevant_jobs rj ON rj.id = jo."jobId"
  LEFT JOIN "jobMakeMethod" jmm
    ON jo."jobMakeMethodId" = jmm.id
    AND jmm."companyId" = company_id
  LEFT JOIN "item" i
    ON jmm."itemId" = i.id
    AND i."companyId" = company_id
  LEFT JOIN "customer" c
    ON rj."customerId" = c.id
    AND c."companyId" = company_id
  LEFT JOIN "salesOrder" so
    ON rj."salesOrderId" = so.id
    AND so."companyId" = company_id
  LEFT JOIN "modelUpload" mu
    ON i."modelUploadId" = mu.id
    AND mu."companyId" = company_id
  WHERE jo."companyId" = company_id
    AND CASE
      WHEN array_length(work_center_ids, 1) > 0 THEN
        jo."workCenterId" = ANY(work_center_ids)
        AND jo."status" NOT IN ('Done', 'Canceled')
      ELSE jo."status" NOT IN ('Done', 'Canceled')
    END
  ORDER BY jo."startDate", jo."priority";
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_job_operation_by_id(
  operation_id text,
  company_id text
)
RETURNS TABLE (
  id text,
  "companyId" text,
  "jobId" text,
  "jobMakeMethodId" text,
  "operationOrder" double precision,
  "processId" text,
  "workCenterId" text,
  description text,
  "setupTime" numeric,
  "setupUnit" factor,
  "laborTime" numeric,
  "laborUnit" factor,
  "machineTime" numeric,
  "machineUnit" factor,
  "operationOrderType" "methodOperationOrder",
  "jobReadableId" text,
  "jobStatus" "jobStatus",
  "jobDueDate" date,
  "jobDeadlineType" "deadlineType",
  "parentMaterialId" text,
  "itemId" text,
  "itemReadableId" text,
  "itemDescription" text,
  "itemUnitOfMeasure" text,
  "itemModelPath" text,
  "itemModelId" text,
  "itemModelName" text,
  "itemModelSize" bigint,
  "operationStatus" "jobOperationStatus",
  "targetQuantity" numeric,
  "operationQuantity" numeric,
  "quantityComplete" numeric,
  "quantityReworked" numeric,
  "quantityScrapped" numeric,
  "workInstruction" json,
  "operationDueDate" date
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    jo."id",
    jo."companyId",
    jo."jobId",
    jo."jobMakeMethodId",
    jo."order"::double precision AS "operationOrder",
    jo."processId",
    jo."workCenterId",
    jo."description",
    jo."setupTime",
    jo."setupUnit",
    jo."laborTime",
    jo."laborUnit",
    jo."machineTime",
    jo."machineUnit",
    jo."operationOrder" AS "operationOrderType",
    j."jobId" AS "jobReadableId",
    j."status" AS "jobStatus",
    j."dueDate"::date AS "jobDueDate",
    j."deadlineType" AS "jobDeadlineType",
    jmm."parentMaterialId",
    i."id" AS "itemId",
    i."readableIdWithRevision" AS "itemReadableId",
    i."name" AS "itemDescription",
    uom."name" AS "itemUnitOfMeasure",
    m."modelPath" AS "itemModelPath",
    m."id" AS "itemModelId",
    m."name" AS "itemModelName",
    m."size"::bigint AS "itemModelSize",
    jo."status" AS "operationStatus",
    jo."targetQuantity"::numeric,
    jo."operationQuantity",
    jo."quantityComplete",
    jo."quantityReworked",
    jo."quantityScrapped",
    jo."workInstruction"::json,
    jo."dueDate" AS "operationDueDate"
  FROM "jobOperation" jo
  JOIN "job" j
    ON j.id = jo."jobId"
    AND j."companyId" = company_id
  LEFT JOIN "jobMakeMethod" jmm
    ON jo."jobMakeMethodId" = jmm.id
    AND jmm."companyId" = company_id
  LEFT JOIN "item" i
    ON jmm."itemId" = i.id
    AND i."companyId" = company_id
  LEFT JOIN "unitOfMeasure" uom
    ON i."unitOfMeasureCode" = uom."code"
    AND i."companyId" = uom."companyId"
  LEFT JOIN "modelUpload" m
    ON i."modelUploadId" = m.id
    AND m."companyId" = company_id
  WHERE jo.id = operation_id
    AND jo."companyId" = company_id
  LIMIT 1;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_active_job_operations_by_employee(
  employee_id text,
  company_id text
)
RETURNS TABLE (
  "id" text,
  "jobId" text,
  "operationOrder" double precision,
  "processId" text,
  "workCenterId" text,
  "description" text,
  "setupTime" numeric,
  "setupUnit" factor,
  "laborTime" numeric,
  "laborUnit" factor,
  "machineTime" numeric,
  "machineUnit" factor,
  "operationOrderType" "methodOperationOrder",
  "jobReadableId" text,
  "jobStatus" "jobStatus",
  "jobDueDate" date,
  "jobDeadlineType" "deadlineType",
  "jobCustomerId" text,
  "salesOrderReadableId" text,
  "salesOrderId" text,
  "salesOrderLineId" text,
  "parentMaterialId" text,
  "itemReadableId" text,
  "itemDescription" text,
  "operationStatus" "jobOperationStatus",
  "targetQuantity" numeric,
  "operationQuantity" numeric,
  "quantityComplete" numeric,
  "quantityScrapped" numeric,
  "thumbnailPath" text,
  "assignee" text,
  "tags" text[],
  "operationDueDate" date
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH active_production_events AS (
    SELECT DISTINCT "jobOperationId"
    FROM "productionEvent"
    WHERE "employeeId" = employee_id
      AND "endTime" IS NULL
      AND "companyId" = company_id
  )
  SELECT
    jo."id",
    jo."jobId",
    jo."order"::double precision AS "operationOrder",
    jo."processId",
    jo."workCenterId",
    jo."description",
    jo."setupTime",
    jo."setupUnit",
    jo."laborTime",
    jo."laborUnit",
    jo."machineTime",
    jo."machineUnit",
    jo."operationOrder" AS "operationOrderType",
    j."jobId" AS "jobReadableId",
    j."status" AS "jobStatus",
    j."dueDate" AS "jobDueDate",
    j."deadlineType" AS "jobDeadlineType",
    j."customerId" AS "jobCustomerId",
    so."salesOrderId" AS "salesOrderReadableId",
    so."id" AS "salesOrderId",
    j."salesOrderLineId",
    jmm."parentMaterialId",
    i."readableId" AS "itemReadableId",
    i."name" AS "itemDescription",
    jo."status" AS "operationStatus",
    jo."targetQuantity"::numeric,
    jo."operationQuantity",
    jo."quantityComplete",
    jo."quantityScrapped",
    CASE
      WHEN jmm."parentMaterialId" IS NULL THEN COALESCE(i."thumbnailPath", j_mu."thumbnailPath", i_mu."thumbnailPath")
      ELSE COALESCE(i."thumbnailPath", i_mu."thumbnailPath")
    END AS "thumbnailPath",
    jo."assignee",
    jo."tags",
    jo."dueDate" AS "operationDueDate"
  FROM "jobOperation" jo
  JOIN "job" j ON j.id = jo."jobId" AND j."companyId" = company_id
  LEFT JOIN "salesOrderLine" sol ON sol."id" = j."salesOrderLineId" AND sol."companyId" = company_id
  LEFT JOIN "salesOrder" so ON so."id" = sol."salesOrderId" AND so."companyId" = company_id
  LEFT JOIN "jobMakeMethod" jmm ON jo."jobMakeMethodId" = jmm.id AND jmm."companyId" = company_id
  LEFT JOIN "item" i ON jmm."itemId" = i.id AND i."companyId" = company_id
  LEFT JOIN "modelUpload" j_mu ON j_mu.id = j."modelUploadId" AND j_mu."companyId" = company_id
  LEFT JOIN "modelUpload" i_mu ON i_mu.id = i."modelUploadId" AND i_mu."companyId" = company_id
  JOIN active_production_events ape ON ape."jobOperationId" = jo.id
  WHERE jo."companyId" = company_id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_recent_job_operations_by_employee(
  employee_id text,
  company_id text
)
RETURNS TABLE (
  "id" text,
  "jobId" text,
  "operationOrder" double precision,
  "processId" text,
  "workCenterId" text,
  "description" text,
  "setupTime" numeric,
  "setupUnit" factor,
  "laborTime" numeric,
  "laborUnit" factor,
  "machineTime" numeric,
  "machineUnit" factor,
  "operationOrderType" "methodOperationOrder",
  "jobReadableId" text,
  "jobStatus" "jobStatus",
  "jobDueDate" date,
  "jobDeadlineType" "deadlineType",
  "jobCustomerId" text,
  "salesOrderReadableId" text,
  "salesOrderId" text,
  "salesOrderLineId" text,
  "parentMaterialId" text,
  "itemReadableId" text,
  "itemDescription" text,
  "operationStatus" "jobOperationStatus",
  "targetQuantity" numeric,
  "operationQuantity" numeric,
  "quantityComplete" numeric,
  "quantityScrapped" numeric,
  "thumbnailPath" text,
  "assignee" text,
  "tags" text[],
  "operationDueDate" date
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH recent_production_events AS (
    SELECT "jobOperationId", MAX(NULLIF("endTime", '')::timestamptz) AS "lastActivity"
    FROM "productionEvent"
    WHERE "employeeId" = employee_id
      AND "companyId" = company_id
    GROUP BY "jobOperationId"
    ORDER BY MAX("endTime") DESC
    LIMIT 20
  ),
  recent_production_quantities AS (
    SELECT "jobOperationId", MAX("createdAt") AS "lastActivity"
    FROM "productionQuantity"
    WHERE "createdBy" = employee_id
      AND "companyId" = company_id
    GROUP BY "jobOperationId"
    ORDER BY MAX("createdAt") DESC
    LIMIT 20
  ),
  combined_recent_activities AS (
    SELECT DISTINCT ON ("jobOperationId") "jobOperationId", "lastActivity"
    FROM (
      SELECT "jobOperationId", "lastActivity"
      FROM recent_production_events
      UNION ALL
      SELECT "jobOperationId", "lastActivity"
      FROM recent_production_quantities
    ) combined
    ORDER BY "jobOperationId", "lastActivity" DESC
  )
  SELECT
    jo."id",
    jo."jobId",
    jo."order"::double precision AS "operationOrder",
    jo."processId",
    jo."workCenterId",
    jo."description",
    jo."setupTime",
    jo."setupUnit",
    jo."laborTime",
    jo."laborUnit",
    jo."machineTime",
    jo."machineUnit",
    jo."operationOrder" AS "operationOrderType",
    j."jobId" AS "jobReadableId",
    j."status" AS "jobStatus",
    j."dueDate" AS "jobDueDate",
    j."deadlineType" AS "jobDeadlineType",
    j."customerId" AS "jobCustomerId",
    so."salesOrderId" AS "salesOrderReadableId",
    so."id" AS "salesOrderId",
    j."salesOrderLineId",
    jmm."parentMaterialId",
    i."readableId" AS "itemReadableId",
    i."name" AS "itemDescription",
    jo."status" AS "operationStatus",
    jo."targetQuantity"::numeric,
    jo."operationQuantity",
    jo."quantityComplete",
    jo."quantityScrapped",
    CASE
      WHEN jmm."parentMaterialId" IS NULL THEN COALESCE(i."thumbnailPath", j_mu."thumbnailPath", i_mu."thumbnailPath")
      ELSE COALESCE(i."thumbnailPath", i_mu."thumbnailPath")
    END AS "thumbnailPath",
    jo."assignee",
    jo."tags",
    jo."dueDate" AS "operationDueDate"
  FROM combined_recent_activities cra
  JOIN "jobOperation" jo ON jo.id = cra."jobOperationId" AND jo."companyId" = company_id
  JOIN "job" j ON j.id = jo."jobId" AND j."companyId" = company_id
  LEFT JOIN "salesOrderLine" sol ON sol."id" = j."salesOrderLineId" AND sol."companyId" = company_id
  LEFT JOIN "salesOrder" so ON so."id" = sol."salesOrderId" AND so."companyId" = company_id
  LEFT JOIN "jobMakeMethod" jmm ON jo."jobMakeMethodId" = jmm.id AND jmm."companyId" = company_id
  LEFT JOIN "item" i ON jmm."itemId" = i.id AND i."companyId" = company_id
  LEFT JOIN "modelUpload" j_mu ON j_mu.id = j."modelUploadId" AND j_mu."companyId" = company_id
  LEFT JOIN "modelUpload" i_mu ON i_mu.id = i."modelUploadId" AND i_mu."companyId" = company_id
  ORDER BY cra."lastActivity" DESC
  LIMIT 20;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_assigned_job_operations(
  user_id text,
  company_id text
)
RETURNS TABLE (
  "id" text,
  "jobId" text,
  "operationOrder" double precision,
  "processId" text,
  "workCenterId" text,
  "description" text,
  "setupTime" numeric,
  "setupUnit" factor,
  "laborTime" numeric,
  "laborUnit" factor,
  "machineTime" numeric,
  "machineUnit" factor,
  "operationOrderType" "methodOperationOrder",
  "jobReadableId" text,
  "jobStatus" "jobStatus",
  "jobDueDate" date,
  "jobDeadlineType" "deadlineType",
  "jobCustomerId" text,
  "salesOrderReadableId" text,
  "salesOrderId" text,
  "salesOrderLineId" text,
  "parentMaterialId" text,
  "itemReadableId" text,
  "itemDescription" text,
  "operationStatus" "jobOperationStatus",
  "targetQuantity" numeric,
  "operationQuantity" numeric,
  "quantityComplete" numeric,
  "quantityScrapped" numeric,
  "thumbnailPath" text,
  "assignee" text,
  "tags" text[],
  "operationDueDate" date
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    jo."id",
    jo."jobId",
    jo."order"::double precision AS "operationOrder",
    jo."processId",
    jo."workCenterId",
    jo."description",
    jo."setupTime",
    jo."setupUnit",
    jo."laborTime",
    jo."laborUnit",
    jo."machineTime",
    jo."machineUnit",
    jo."operationOrder" AS "operationOrderType",
    j."jobId" AS "jobReadableId",
    j."status" AS "jobStatus",
    j."dueDate" AS "jobDueDate",
    j."deadlineType" AS "jobDeadlineType",
    j."customerId" AS "jobCustomerId",
    so."salesOrderId" AS "salesOrderReadableId",
    so."id" AS "salesOrderId",
    j."salesOrderLineId",
    jmm."parentMaterialId",
    i."readableId" AS "itemReadableId",
    i."name" AS "itemDescription",
    CASE
      WHEN j."status" = 'Paused' THEN 'Paused'
      ELSE jo."status"
    END AS "operationStatus",
    jo."targetQuantity"::numeric,
    jo."operationQuantity",
    jo."quantityComplete",
    jo."quantityScrapped",
    CASE
      WHEN jmm."parentMaterialId" IS NULL THEN COALESCE(i."thumbnailPath", j_mu."thumbnailPath", i_mu."thumbnailPath")
      ELSE COALESCE(i."thumbnailPath", i_mu."thumbnailPath")
    END AS "thumbnailPath",
    jo."assignee",
    jo."tags",
    jo."dueDate" AS "operationDueDate"
  FROM "jobOperation" jo
  JOIN "job" j ON j.id = jo."jobId" AND j."companyId" = company_id
  LEFT JOIN "salesOrderLine" sol ON sol."id" = j."salesOrderLineId" AND sol."companyId" = company_id
  LEFT JOIN "salesOrder" so ON so."id" = sol."salesOrderId" AND so."companyId" = company_id
  LEFT JOIN "jobMakeMethod" jmm ON jo."jobMakeMethodId" = jmm.id AND jmm."companyId" = company_id
  LEFT JOIN "item" i ON jmm."itemId" = i.id AND i."companyId" = company_id
  LEFT JOIN "modelUpload" j_mu ON j_mu.id = j."modelUploadId" AND j_mu."companyId" = company_id
  LEFT JOIN "modelUpload" i_mu ON i_mu.id = i."modelUploadId" AND i_mu."companyId" = company_id
  WHERE jo."assignee" = user_id
    AND jo."companyId" = company_id
    AND jo."status" IN ('Todo', 'Ready', 'Waiting', 'In Progress', 'Paused')
    AND j."status" IN ('Ready', 'In Progress', 'Paused')
    AND j."companyId" = company_id
  ORDER BY jo."priority";
END;
$$;--> statement-breakpoint

DROP FUNCTION IF EXISTS get_job_operations_by_work_center(text, text);--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_job_operations_by_work_center(
  work_center_id text,
  location_id text,
  company_id text
)
RETURNS TABLE (
  "id" text,
  "jobId" text,
  "operationOrder" double precision,
  "processId" text,
  "workCenterId" text,
  "description" text,
  "setupTime" numeric(10, 2),
  "setupUnit" factor,
  "laborTime" numeric(10, 2),
  "laborUnit" factor,
  "machineTime" numeric(10, 2),
  "machineUnit" factor,
  "operationOrderType" "methodOperationOrder",
  "jobReadableId" text,
  "jobStatus" "jobStatus",
  "jobDueDate" date,
  "jobDeadlineType" "deadlineType",
  "parentMaterialId" text,
  "itemReadableId" text,
  "operationStatus" "jobOperationStatus",
  "operationQuantity" numeric(10, 2),
  "quantityComplete" numeric(10, 2),
  "quantityScrapped" numeric(10, 2)
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH relevant_jobs AS (
    SELECT *
    FROM "job"
    WHERE "locationId" = location_id
      AND "companyId" = company_id
      AND "status" IN ('Ready', 'In Progress', 'Paused')
  )
  SELECT
    jo."id",
    jo."jobId",
    jo."order"::double precision AS "operationOrder",
    jo."processId",
    jo."workCenterId",
    jo."description",
    jo."setupTime",
    jo."setupUnit",
    jo."laborTime",
    jo."laborUnit",
    jo."machineTime",
    jo."machineUnit",
    jo."operationOrder" AS "operationOrderType",
    rj."jobId" AS "jobReadableId",
    rj."status" AS "jobStatus",
    rj."dueDate" AS "jobDueDate",
    rj."deadlineType" AS "jobDeadlineType",
    jmm."parentMaterialId",
    i."readableId" AS "itemReadableId",
    CASE
      WHEN rj."status" = 'Paused' THEN 'Paused'
      ELSE jo."status"
    END AS "operationStatus",
    jo."operationQuantity"::numeric(10, 2),
    jo."quantityComplete"::numeric(10, 2),
    jo."quantityScrapped"::numeric(10, 2)
  FROM "jobOperation" jo
  JOIN relevant_jobs rj ON rj.id = jo."jobId"
  LEFT JOIN "jobMakeMethod" jmm ON jo."jobMakeMethodId" = jmm.id AND jmm."companyId" = company_id
  LEFT JOIN "item" i ON jmm."itemId" = i.id AND i."companyId" = company_id
  WHERE jo."workCenterId" = work_center_id
    AND jo."companyId" = company_id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_active_job_count(
  employee_id text,
  company_id text
)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  active_count integer;
BEGIN
  SELECT COUNT(DISTINCT "jobOperationId")
  INTO active_count
  FROM "productionEvent"
  WHERE "employeeId" = employee_id
    AND "companyId" = company_id
    AND "endTime" IS NULL;

  RETURN active_count;
END;
$$;
