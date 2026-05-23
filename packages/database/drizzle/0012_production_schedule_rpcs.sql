DROP FUNCTION IF EXISTS get_jobs_by_date_range(text, date, date);--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_jobs_by_date_range(
  location_id text,
  company_id text,
  start_date date,
  end_date date
)
RETURNS TABLE (
  "id" text,
  "jobId" text,
  "status" "jobStatus",
  "dueDate" date,
  "completedDate" timestamptz,
  "deadlineType" "deadlineType",
  "customerId" text,
  "customerName" text,
  "salesOrderReadableId" text,
  "salesOrderId" text,
  "salesOrderLineId" text,
  "itemId" text,
  "itemReadableId" text,
  "itemDescription" text,
  "quantity" numeric,
  "quantityComplete" numeric,
  "quantityShipped" numeric,
  "priority" double precision,
  "assignee" text,
  "tags" text[],
  "thumbnailPath" text,
  "operationCount" integer,
  "completedOperationCount" integer,
  "hasConflict" boolean,
  "jobMakeMethodId" text
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH relevant_jobs AS (
    SELECT
      j."id",
      j."jobId",
      j."status",
      j."dueDate",
      j."completedDate"::timestamptz AS "completedDate",
      j."deadlineType",
      j."customerId",
      j."salesOrderLineId",
      j."quantity",
      j."quantityShipped",
      j."priority"::double precision AS "priority",
      j."assignee",
      j."tags",
      mu."thumbnailPath"
    FROM "job" j
    LEFT JOIN "modelUpload" mu ON mu.id = j."modelUploadId" AND mu."companyId" = company_id
    WHERE j."locationId" = location_id
      AND j."companyId" = company_id
      AND j."dueDate" IS NOT NULL
      AND j."dueDate" >= start_date
      AND j."dueDate" <= end_date
      AND j."status" != 'Cancelled'
  ),
  job_items AS (
    SELECT DISTINCT ON (jmm."jobId")
      jmm."jobId",
      jmm."id" AS "jobMakeMethodId",
      jmm."itemId",
      i."readableId" AS "itemReadableId",
      i."name" AS "itemDescription",
      i."thumbnailPath" AS "itemThumbnailPath",
      imu."thumbnailPath" AS "itemModelThumbnailPath"
    FROM "jobMakeMethod" jmm
    LEFT JOIN "item" i ON i.id = jmm."itemId" AND i."companyId" = company_id
    LEFT JOIN "modelUpload" imu ON imu.id = i."modelUploadId" AND imu."companyId" = company_id
    WHERE jmm."parentMaterialId" IS NULL
      AND jmm."companyId" = company_id
    ORDER BY jmm."jobId", jmm."createdAt"
  ),
  operation_stats AS (
    SELECT
      jo."jobId",
      COUNT(*)::integer AS "operationCount",
      COUNT(*) FILTER (WHERE jo."status" = 'Done')::integer AS "completedOperationCount",
      BOOL_OR(COALESCE(jo."hasConflict", false)) AS "hasConflict"
    FROM "jobOperation" jo
    JOIN "jobMakeMethod" jmm ON jo."jobMakeMethodId" = jmm.id
    WHERE jmm."parentMaterialId" IS NULL
      AND jo."companyId" = company_id
      AND jmm."companyId" = company_id
    GROUP BY jo."jobId"
  ),
  parent_quantity_complete AS (
    SELECT
      jo."jobId",
      MAX(jo."quantityComplete") AS "quantityComplete"
    FROM "jobOperation" jo
    JOIN "jobMakeMethod" jmm ON jo."jobMakeMethodId" = jmm.id
    WHERE jmm."parentMaterialId" IS NULL
      AND jo."companyId" = company_id
      AND jmm."companyId" = company_id
    GROUP BY jo."jobId"
  )
  SELECT
    rj."id",
    rj."jobId",
    rj."status",
    rj."dueDate",
    rj."completedDate",
    rj."deadlineType",
    rj."customerId",
    c."name" AS "customerName",
    so."salesOrderId" AS "salesOrderReadableId",
    so."id" AS "salesOrderId",
    rj."salesOrderLineId",
    ji."itemId",
    ji."itemReadableId",
    ji."itemDescription",
    rj."quantity",
    COALESCE(pqc."quantityComplete", 0) AS "quantityComplete",
    rj."quantityShipped",
    rj."priority",
    rj."assignee",
    rj."tags",
    COALESCE(ji."itemThumbnailPath", ji."itemModelThumbnailPath", rj."thumbnailPath") AS "thumbnailPath",
    COALESCE(os."operationCount", 0) AS "operationCount",
    COALESCE(os."completedOperationCount", 0) AS "completedOperationCount",
    COALESCE(os."hasConflict", false) AS "hasConflict",
    ji."jobMakeMethodId"
  FROM relevant_jobs rj
  LEFT JOIN "salesOrderLine" sol ON sol."id" = rj."salesOrderLineId" AND sol."companyId" = company_id
  LEFT JOIN "salesOrder" so ON so."id" = sol."salesOrderId" AND so."companyId" = company_id
  LEFT JOIN "customer" c ON c."id" = rj."customerId" AND c."companyId" = company_id
  LEFT JOIN job_items ji ON ji."jobId" = rj."id"
  LEFT JOIN operation_stats os ON os."jobId" = rj."id"
  LEFT JOIN parent_quantity_complete pqc ON pqc."jobId" = rj."id"
  ORDER BY rj."dueDate";
END;
$$;--> statement-breakpoint

DROP FUNCTION IF EXISTS get_unscheduled_jobs(text);--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_unscheduled_jobs(location_id text, company_id text)
RETURNS TABLE (
  "id" text,
  "jobId" text,
  "status" "jobStatus",
  "dueDate" date,
  "completedDate" timestamptz,
  "deadlineType" "deadlineType",
  "customerId" text,
  "customerName" text,
  "salesOrderReadableId" text,
  "salesOrderId" text,
  "salesOrderLineId" text,
  "itemId" text,
  "itemReadableId" text,
  "itemDescription" text,
  "quantity" numeric,
  "quantityComplete" numeric,
  "quantityShipped" numeric,
  "priority" double precision,
  "assignee" text,
  "tags" text[],
  "thumbnailPath" text,
  "operationCount" integer,
  "completedOperationCount" integer,
  "hasConflict" boolean,
  "jobMakeMethodId" text
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH relevant_jobs AS (
    SELECT
      j."id",
      j."jobId",
      j."status",
      j."dueDate",
      j."completedDate"::timestamptz AS "completedDate",
      j."deadlineType",
      j."customerId",
      j."salesOrderLineId",
      j."quantity",
      j."quantityShipped",
      j."priority"::double precision AS "priority",
      j."assignee",
      j."tags",
      mu."thumbnailPath"
    FROM "job" j
    LEFT JOIN "modelUpload" mu ON mu.id = j."modelUploadId" AND mu."companyId" = company_id
    WHERE j."locationId" = location_id
      AND j."companyId" = company_id
      AND j."dueDate" IS NULL
      AND j."status" NOT IN ('Cancelled', 'Draft', 'Planned', 'Completed')
  ),
  job_items AS (
    SELECT DISTINCT ON (jmm."jobId")
      jmm."jobId",
      jmm."id" AS "jobMakeMethodId",
      jmm."itemId",
      i."readableId" AS "itemReadableId",
      i."name" AS "itemDescription",
      i."thumbnailPath" AS "itemThumbnailPath",
      imu."thumbnailPath" AS "itemModelThumbnailPath"
    FROM "jobMakeMethod" jmm
    LEFT JOIN "item" i ON i.id = jmm."itemId" AND i."companyId" = company_id
    LEFT JOIN "modelUpload" imu ON imu.id = i."modelUploadId" AND imu."companyId" = company_id
    WHERE jmm."parentMaterialId" IS NULL
      AND jmm."companyId" = company_id
    ORDER BY jmm."jobId", jmm."createdAt"
  ),
  operation_stats AS (
    SELECT
      jo."jobId",
      COUNT(*)::integer AS "operationCount",
      COUNT(*) FILTER (WHERE jo."status" = 'Done')::integer AS "completedOperationCount",
      BOOL_OR(COALESCE(jo."hasConflict", false)) AS "hasConflict"
    FROM "jobOperation" jo
    JOIN "jobMakeMethod" jmm ON jo."jobMakeMethodId" = jmm.id
    WHERE jmm."parentMaterialId" IS NULL
      AND jo."companyId" = company_id
      AND jmm."companyId" = company_id
    GROUP BY jo."jobId"
  ),
  parent_quantity_complete AS (
    SELECT
      jo."jobId",
      MAX(jo."quantityComplete") AS "quantityComplete"
    FROM "jobOperation" jo
    JOIN "jobMakeMethod" jmm ON jo."jobMakeMethodId" = jmm.id
    WHERE jmm."parentMaterialId" IS NULL
      AND jo."companyId" = company_id
      AND jmm."companyId" = company_id
    GROUP BY jo."jobId"
  )
  SELECT
    rj."id",
    rj."jobId",
    rj."status",
    rj."dueDate",
    rj."completedDate",
    rj."deadlineType",
    rj."customerId",
    c."name" AS "customerName",
    so."salesOrderId" AS "salesOrderReadableId",
    so."id" AS "salesOrderId",
    rj."salesOrderLineId",
    ji."itemId",
    ji."itemReadableId",
    ji."itemDescription",
    rj."quantity",
    COALESCE(pqc."quantityComplete", 0) AS "quantityComplete",
    rj."quantityShipped",
    rj."priority",
    rj."assignee",
    rj."tags",
    COALESCE(ji."itemThumbnailPath", ji."itemModelThumbnailPath", rj."thumbnailPath") AS "thumbnailPath",
    COALESCE(os."operationCount", 0) AS "operationCount",
    COALESCE(os."completedOperationCount", 0) AS "completedOperationCount",
    COALESCE(os."hasConflict", false) AS "hasConflict",
    ji."jobMakeMethodId"
  FROM relevant_jobs rj
  LEFT JOIN "salesOrderLine" sol ON sol."id" = rj."salesOrderLineId" AND sol."companyId" = company_id
  LEFT JOIN "salesOrder" so ON so."id" = sol."salesOrderId" AND so."companyId" = company_id
  LEFT JOIN "customer" c ON c."id" = rj."customerId" AND c."companyId" = company_id
  LEFT JOIN job_items ji ON ji."jobId" = rj."id"
  LEFT JOIN operation_stats os ON os."jobId" = rj."id"
  LEFT JOIN parent_quantity_complete pqc ON pqc."jobId" = rj."id"
  ORDER BY rj."priority" DESC;
END;
$$;
