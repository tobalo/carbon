DROP FUNCTION IF EXISTS get_job_operation_step_records(text);--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_job_operation_step_records(
  p_job_id text,
  p_company_id text
)
RETURNS TABLE (
  "id" text,
  "jobOperationStepId" text,
  "index" integer,
  "type" "procedureStepType",
  "name" text,
  "value" text,
  "numericValue" numeric,
  "booleanValue" boolean,
  "userValue" text,
  "unitOfMeasureCode" text,
  "minValue" numeric,
  "maxValue" numeric,
  "operationId" text,
  "operationDescription" text,
  "itemId" text,
  "itemReadableId" text,
  "companyId" text,
  "createdAt" timestamptz,
  "createdBy" text,
  "updatedAt" timestamptz,
  "updatedBy" text
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH job_operations AS (
    SELECT
      jo."id",
      jo."description",
      jo."order",
      jo."jobMakeMethodId"
    FROM "jobOperation" jo
    WHERE jo."jobId" = p_job_id
      AND jo."companyId" = p_company_id
  ),
  job_operation_steps AS (
    SELECT
      jos."id",
      jos."type",
      jos."name",
      jos."unitOfMeasureCode",
      jos."minValue",
      jos."maxValue",
      jos."operationId",
      jo."description" AS "operationDescription",
      jo."jobMakeMethodId"
    FROM "jobOperationStep" jos
    JOIN job_operations jo ON jos."operationId" = jo."id"
    WHERE jos."companyId" = p_company_id
  ),
  job_items AS (
    SELECT
      jmm."id" AS "makeMethodId",
      i."id" AS "itemId",
      i."readableIdWithRevision" AS "itemReadableId"
    FROM "jobMakeMethod" jmm
    LEFT JOIN "item" i ON jmm."parentMaterialId" = i."id" AND i."companyId" = p_company_id
    WHERE jmm."companyId" = p_company_id
  )
  SELECT
    josr."id",
    josr."jobOperationStepId",
    josr."index"::integer,
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
  JOIN job_operation_steps jos ON josr."jobOperationStepId" = jos."id"
  LEFT JOIN job_items ji ON jos."jobMakeMethodId" = ji."makeMethodId"
  WHERE josr."companyId" = p_company_id
  ORDER BY josr."jobOperationStepId", josr."index";
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_action_tasks_by_item_and_process(
  p_item_id text,
  p_process_id text,
  p_company_id text
)
RETURNS TABLE (
  id text,
  "nonConformanceId" text,
  "actionTypeName" text,
  assignee text,
  notes jsonb
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT
    ncat.id,
    nc."nonConformanceId",
    ncra.name AS "actionTypeName",
    ncat.assignee,
    ncat.notes::jsonb
  FROM "nonConformanceActionTask" ncat
  LEFT JOIN "nonConformanceRequiredAction" ncra
    ON ncat."actionTypeId" = ncra."id"
    AND ncat."companyId" = ncra."companyId"
  JOIN "nonConformance" nc ON ncat."nonConformanceId" = nc.id
  WHERE ncat."companyId" = p_company_id
    AND EXISTS (
      SELECT 1
      FROM "nonConformanceActionProcess" ncap
      WHERE ncap."actionTaskId" = ncat.id
        AND ncap."processId" = p_process_id
        AND ncap."companyId" = p_company_id
    )
    AND EXISTS (
      SELECT 1
      FROM "nonConformance" nc
      JOIN "nonConformanceItem" nci
        ON nc.id = nci."nonConformanceId"
        AND nci."companyId" = p_company_id
      WHERE nc.id = ncat."nonConformanceId"
        AND nc."companyId" = p_company_id
        AND nc.status != 'Closed'
        AND nci."itemId" = p_item_id
    );
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_sales_order_lines_by_customer_id(customer_id text, company_id text)
RETURNS TABLE (
  "customerReference" text,
  "salesOrderId" text,
  "customerContactName" text,
  "customerEngineeringContactName" text,
  "saleQuantity" numeric(9, 2),
  "quantityToSend" numeric(9, 2),
  "quantitySent" numeric(9, 2),
  "quantityInvoiced" numeric(9, 2),
  "unitPrice" numeric(9, 2),
  "unitOfMeasureCode" text,
  "locationId" text,
  "orderDate" date,
  "promisedDate" date,
  "receiptRequestedDate" date,
  "receiptPromisedDate" date,
  "salesOrderStatus" "salesOrderStatus",
  "readableId" text,
  "revision" text,
  "readableIdWithRevision" text,
  "customerId" text,
  "thumbnailPath" text,
  "jobOperations" jsonb,
  "jobQuantityShipped" numeric(9, 2),
  "jobQuantityComplete" numeric(9, 2),
  "jobProductionQuantity" numeric(9, 2),
  "jobStatus" "jobStatus"
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    so."customerReference",
    so."salesOrderId",
    COALESCE(pc."fullName", pc."email") AS "customerContactName",
    COALESCE(ec."fullName", ec."email") AS "customerEngineeringContactName",
    sol."saleQuantity",
    sol."quantityToSend",
    sol."quantitySent",
    sol."quantityInvoiced",
    sol."unitPrice",
    sol."unitOfMeasureCode",
    sol."locationId",
    so."orderDate",
    sol."promisedDate",
    ss."receiptRequestedDate",
    ss."receiptPromisedDate",
    so."status" AS "salesOrderStatus",
    i."readableId",
    i."revision",
    i."readableIdWithRevision",
    so."customerId",
    CASE
      WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
      ELSE i."thumbnailPath"
    END AS "thumbnailPath",
    COALESCE(
      (
        SELECT jsonb_agg(DISTINCT
          jsonb_build_object(
            'id', jo.id,
            'jobId', jo."jobId",
            'order', jo."order",
            'status', jo.status,
            'description', p."name",
            'operationType', jo."operationType",
            'operationQuantity', jo."operationQuantity",
            'quantityComplete', jo."quantityComplete"
          )
        )
        FROM "jobOperation" jo
        JOIN "jobMakeMethod" jmm ON jmm."id" = jo."jobMakeMethodId"
        JOIN "process" p ON p."id" = jo."processId"
        WHERE jo."jobId" = j.id
          AND jmm."parentMaterialId" IS NULL
      ),
      '[]'::jsonb
    ) AS "jobOperations",
    j."quantityShipped" AS "jobQuantityShipped",
    j."quantityComplete" AS "jobQuantityComplete",
    j."productionQuantity" AS "jobProductionQuantity",
    j."status" AS "jobStatus"
  FROM "salesOrderLine" sol
  JOIN "salesOrder" so ON so."id" = sol."salesOrderId"
  LEFT JOIN "salesOrderShipment" ss ON ss."id" = so."id"
  JOIN "item" i ON i."id" = sol."itemId"
  LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId"
  LEFT JOIN "job" j ON j."salesOrderLineId" = sol."id"
  LEFT JOIN "customerContact" pcc ON pcc."id" = so."customerContactId"
  LEFT JOIN "contact" pc ON pc."id" = pcc."contactId"
  LEFT JOIN "customerContact" ecc ON ecc."id" = so."customerEngineeringContactId"
  LEFT JOIN "contact" ec ON ec."id" = ecc."contactId"
  WHERE so."customerId" = customer_id
    AND so."companyId" = company_id;
END;
$$;
