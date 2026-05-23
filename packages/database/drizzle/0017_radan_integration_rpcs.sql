CREATE OR REPLACE FUNCTION get_radan_v1(
  company_id text,
  processes text[]
)
RETURNS TABLE (
  "id" text,
  "jobId" text,
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
  "jobMakeMethodId" text,
  "assignee" text,
  "tags" text[],
  "jobReadableId" text,
  "jobStatus" "jobStatus",
  "jobDueDate" date,
  "jobDeadlineType" "deadlineType",
  "jobCustomerId" text,
  "jobLocationName" text,
  "salesOrderReadableId" text,
  "salesOrderId" text,
  "salesOrderLineId" text,
  "parentMaterialId" text,
  "itemId" text,
  "itemReadableId" text,
  "itemDescription" text,
  "operationStatus" "jobOperationStatus",
  "operationQuantity" numeric,
  "quantityComplete" numeric,
  "quantityScrapped" numeric,
  "materialItemReadableId" text,
  "materialItemDescription" text,
  "materialSubstance" text,
  "materialForm" text,
  "materialDimension" text,
  "materialFinish" text,
  "materialGrade" text
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
      j."deadlineType",
      j."customerId",
      l."name" AS "locationName",
      so."salesOrderId" AS "salesOrderReadableId",
      so."id" AS "salesOrderId",
      j."salesOrderLineId"
    FROM "job" j
    JOIN "location" l
      ON l."id" = j."locationId"
      AND l."companyId" = company_id
    LEFT JOIN "salesOrderLine" sol
      ON sol."id" = j."salesOrderLineId"
      AND sol."companyId" = company_id
    LEFT JOIN "salesOrder" so
      ON so."id" = sol."salesOrderId"
      AND so."companyId" = company_id
    WHERE j."companyId" = company_id
      AND j."status" IN ('Ready', 'In Progress', 'Paused')
  )
  SELECT
    jo."id",
    jo."jobId",
    jo."order"::double precision AS "operationOrder",
    jo."priority"::double precision AS "priority",
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
    jo."jobMakeMethodId",
    jo."assignee",
    jo."tags",
    rj."jobId" AS "jobReadableId",
    rj."status" AS "jobStatus",
    rj."dueDate" AS "jobDueDate",
    rj."deadlineType" AS "jobDeadlineType",
    rj."customerId" AS "jobCustomerId",
    rj."locationName" AS "jobLocationName",
    rj."salesOrderReadableId",
    rj."salesOrderId",
    rj."salesOrderLineId",
    jmm."parentMaterialId",
    i."id" AS "itemId",
    i."readableId" AS "itemReadableId",
    i."name" AS "itemDescription",
    CASE
      WHEN rj."status" = 'Paused' THEN 'Paused'::"jobOperationStatus"
      ELSE jo."status"
    END AS "operationStatus",
    jo."operationQuantity",
    jo."quantityComplete",
    jo."quantityScrapped",
    fm."materialItemReadableId" AS "materialItemReadableId",
    fm."materialItemDescription" AS "materialItemDescription",
    fm."materialSubstance" AS "materialSubstance",
    fm."materialForm" AS "materialForm",
    fm."materialDimension" AS "materialDimension",
    fm."materialFinish" AS "materialFinish",
    fm."materialGrade" AS "materialGrade"
  FROM "jobOperation" jo
  JOIN relevant_jobs rj ON rj.id = jo."jobId"
  LEFT JOIN "jobMakeMethod" jmm
    ON jo."jobMakeMethodId" = jmm.id
    AND jmm."companyId" = company_id
    AND jmm."jobId" = rj.id
  LEFT JOIN (
    SELECT
      jm."jobMakeMethodId",
      jm."itemId" AS "materialItemId",
      mi."readableId" AS "materialItemReadableId",
      mi."name" AS "materialItemDescription",
      ms."name" AS "materialSubstance",
      mf."name" AS "materialForm",
      md."name" AS "materialDimension",
      mf2."name" AS "materialFinish",
      mg."name" AS "materialGrade"
    FROM (
      SELECT DISTINCT ON (jm."jobMakeMethodId")
        jm."jobMakeMethodId",
        jm."itemId",
        jm."id"
      FROM "jobMaterial" jm
      WHERE jm."companyId" = company_id
        AND jm."itemType" = 'Material'
        AND jm."jobMakeMethodId" IN (
          SELECT DISTINCT jo."jobMakeMethodId"
          FROM "jobOperation" jo
          JOIN relevant_jobs rj ON rj.id = jo."jobId"
          WHERE jo."companyId" = company_id
            AND jo."status" NOT IN ('Done', 'Canceled')
            AND CASE
              WHEN array_length(processes, 1) > 0 THEN jo."processId" = ANY(processes)
              ELSE true
            END
        )
      ORDER BY jm."jobMakeMethodId", jm."order" DESC
    ) jm
    JOIN "item" mi
      ON mi."id" = jm."itemId"
      AND mi."companyId" = company_id
    LEFT JOIN "material" m
      ON m."id" = mi."readableId"
      AND m."companyId" = company_id
    LEFT JOIN "materialSubstance" ms
      ON ms."id" = m."materialSubstanceId"
      AND ms."companyId" = company_id
    LEFT JOIN "materialForm" mf
      ON mf."id" = m."materialFormId"
      AND mf."companyId" = company_id
    LEFT JOIN "materialDimension" md
      ON md."id" = m."dimensionId"
      AND md."companyId" = company_id
    LEFT JOIN "materialFinish" mf2
      ON mf2."id" = m."finishId"
      AND mf2."companyId" = company_id
    LEFT JOIN "materialGrade" mg
      ON mg."id" = m."gradeId"
      AND mg."companyId" = company_id
  ) fm ON fm."jobMakeMethodId" = jmm."id"
  JOIN "item" i
    ON jmm."itemId" = i.id
    AND i."companyId" = company_id
  WHERE jo."companyId" = company_id
    AND jo."status" NOT IN ('Done', 'Canceled')
    AND CASE
      WHEN array_length(processes, 1) > 0 THEN jo."processId" = ANY(processes)
      ELSE true
    END
  ORDER BY jo."priority";
END;
$$;
