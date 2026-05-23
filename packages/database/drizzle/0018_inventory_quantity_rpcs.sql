CREATE OR REPLACE FUNCTION get_item_quantities_by_tracking_id(
  item_id text,
  company_id text,
  location_id text
)
RETURNS TABLE (
  "itemId" text,
  "storageUnitId" text,
  "storageUnitName" text,
  "trackedEntityId" text,
  "readableId" text,
  quantity numeric
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    il."itemId",
    il."storageUnitId",
    s."name" AS "storageUnitName",
    il."trackedEntityId",
    te."readableId",
    SUM(il."quantity") AS "quantity"
  FROM "itemLedger" il
  LEFT JOIN "storageUnit" s
    ON il."storageUnitId" = s."id"
    AND s."companyId" = company_id
    AND s."locationId" = location_id
  LEFT JOIN "trackedEntity" te
    ON il."trackedEntityId" = te."id"
    AND te."companyId" = company_id
  WHERE il."itemId" = item_id
    AND il."companyId" = company_id
    AND il."locationId" = location_id
  GROUP BY
    il."itemId",
    il."storageUnitId",
    s."name",
    il."trackedEntityId",
    te."readableId";
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_job_quantity_on_hand(
  job_id text,
  company_id text,
  location_id text
)
RETURNS TABLE (
  "id" text,
  "jobMaterialItemId" text,
  "jobMakeMethodId" text,
  "itemReadableId" text,
  "name" text,
  "description" text,
  "itemTrackingType" "itemTrackingType",
  "methodType" "methodType",
  "type" "itemType",
  "thumbnailPath" text,
  "unitOfMeasureCode" text,
  "quantityPerParent" numeric,
  "estimatedQuantity" numeric,
  "quantityIssued" numeric,
  "quantityOnHandInStorageUnit" numeric,
  "quantityOnHandNotInStorageUnit" numeric,
  "quantityOnSalesOrder" numeric,
  "quantityOnPurchaseOrder" numeric,
  "quantityOnProductionOrder" numeric,
  "quantityFromProductionOrderInStorageUnit" numeric,
  "quantityFromProductionOrderNotInStorageUnit" numeric,
  "quantityInTransitToStorageUnit" numeric,
  "storageUnitId" text,
  "storageUnitName" text
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH
  job_materials AS (
    SELECT
      jm."id",
      jm."itemId",
      jm."jobMakeMethodId",
      jm."description",
      jm."methodType",
      jm."quantity",
      jm."estimatedQuantity",
      jm."quantityIssued",
      jm."storageUnitId"
    FROM "jobMaterial" jm
    JOIN "job" source_job ON source_job."id" = jm."jobId"
    WHERE jm."jobId" = job_id
      AND jm."companyId" = company_id
      AND source_job."companyId" = company_id
      AND source_job."locationId" = location_id
  ),
  open_purchase_orders AS (
    SELECT
      pol."itemId" AS "purchaseOrderItemId",
      SUM(pol."quantityToReceive" * pol."conversionFactor") AS "quantityOnPurchaseOrder"
    FROM "purchaseOrder" po
    JOIN "purchaseOrderLine" pol ON pol."purchaseOrderId" = po."id"
    JOIN job_materials jm ON jm."itemId" = pol."itemId"
    WHERE po."status" IN ('To Receive', 'To Receive and Invoice')
      AND po."companyId" = company_id
      AND pol."companyId" = company_id
      AND pol."locationId" = location_id
    GROUP BY pol."itemId"
  ),
  open_stock_transfers_to AS (
    SELECT
      stl."itemId",
      stl."toStorageUnitId" AS "storageUnitId",
      SUM(stl."outstandingQuantity") AS "quantityOnStockTransferTo"
    FROM "stockTransferLine" stl
    JOIN "stockTransfer" st ON stl."stockTransferId" = st."id"
    JOIN job_materials jm ON jm."itemId" = stl."itemId"
    WHERE st."status" IN ('Released', 'In Progress')
      AND st."companyId" = company_id
      AND st."locationId" = location_id
      AND stl."companyId" = company_id
    GROUP BY stl."itemId", stl."toStorageUnitId"
  ),
  open_stock_transfers_from AS (
    SELECT
      stl."itemId",
      stl."fromStorageUnitId" AS "storageUnitId",
      SUM(stl."outstandingQuantity") AS "quantityOnStockTransferFrom"
    FROM "stockTransferLine" stl
    JOIN "stockTransfer" st ON stl."stockTransferId" = st."id"
    JOIN job_materials jm ON jm."itemId" = stl."itemId"
    WHERE st."status" IN ('Released', 'In Progress')
      AND st."companyId" = company_id
      AND st."locationId" = location_id
      AND stl."companyId" = company_id
    GROUP BY stl."itemId", stl."fromStorageUnitId"
  ),
  stock_transfers_in_transit AS (
    SELECT
      COALESCE(stt."itemId", stf."itemId") AS "itemId",
      COALESCE(stt."storageUnitId", stf."storageUnitId") AS "storageUnitId",
      COALESCE(stt."quantityOnStockTransferTo", 0) - COALESCE(stf."quantityOnStockTransferFrom", 0) AS "quantityInTransit"
    FROM open_stock_transfers_to stt
    FULL OUTER JOIN open_stock_transfers_from stf
      ON stt."itemId" = stf."itemId"
      AND stt."storageUnitId" = stf."storageUnitId"
  ),
  open_sales_orders AS (
    SELECT
      sol."itemId" AS "salesOrderItemId",
      SUM(sol."quantityToSend") AS "quantityOnSalesOrder"
    FROM "salesOrder" so
    JOIN "salesOrderLine" sol ON sol."salesOrderId" = so."id"
    JOIN job_materials jm ON jm."itemId" = sol."itemId"
    WHERE so."status" IN ('Confirmed', 'To Ship and Invoice', 'To Ship', 'To Invoice', 'In Progress')
      AND so."companyId" = company_id
      AND sol."companyId" = company_id
      AND sol."locationId" = location_id
    GROUP BY sol."itemId"
  ),
  open_jobs AS (
    SELECT
      j."itemId" AS "jobItemId",
      SUM(j."productionQuantity" + j."scrapQuantity" - j."quantityReceivedToInventory" - j."quantityShipped") AS "quantityOnProductionOrder"
    FROM "job" j
    WHERE j."status" IN ('Ready', 'In Progress', 'Paused')
      AND j."companyId" = company_id
      AND j."locationId" = location_id
    GROUP BY j."itemId"
  ),
  open_job_requirements AS (
    SELECT
      jm."itemId",
      jm."storageUnitId",
      SUM(jm."quantityToIssue") AS "quantityOnProductionDemand"
    FROM "jobMaterial" jm
    JOIN "job" j ON jm."jobId" = j."id"
    JOIN job_materials jmat ON jmat."itemId" = jm."itemId"
    WHERE j."status" IN ('Planned', 'Ready', 'In Progress', 'Paused')
      AND jm."methodType" != 'Make to Order'
      AND jm."companyId" = company_id
      AND j."companyId" = company_id
      AND j."locationId" = location_id
    GROUP BY jm."itemId", jm."storageUnitId"
  ),
  open_job_requirements_in_storage_unit AS (
    SELECT
      ojr."itemId",
      SUM(ojr."quantityOnProductionDemand") AS "quantityOnProductionDemandInStorageUnit"
    FROM open_job_requirements ojr
    JOIN job_materials jm
      ON jm."itemId" = ojr."itemId"
      AND jm."storageUnitId" = ojr."storageUnitId"
    GROUP BY ojr."itemId"
  ),
  open_job_requirements_not_in_storage_unit AS (
    SELECT
      ojr."itemId",
      SUM(ojr."quantityOnProductionDemand") AS "quantityOnProductionDemandNotInStorageUnit"
    FROM open_job_requirements ojr
    JOIN job_materials jm
      ON jm."itemId" = ojr."itemId"
      AND (jm."storageUnitId" IS NULL OR jm."storageUnitId" != ojr."storageUnitId")
    GROUP BY ojr."itemId"
  ),
  item_ledgers AS (
    SELECT
      il."itemId" AS "ledgerItemId",
      il."storageUnitId",
      SUM(il."quantity") FILTER (
        WHERE il."trackedEntityStatus" IS NULL
          OR il."trackedEntityStatus" != to_jsonb('Rejected'::text)
      ) AS "quantityOnHand"
    FROM "itemLedger" il
    JOIN job_materials jm ON jm."itemId" = il."itemId"
    WHERE il."companyId" = company_id
      AND il."locationId" = location_id
    GROUP BY il."itemId", il."storageUnitId"
  ),
  item_ledgers_in_storage_unit AS (
    SELECT
      il."ledgerItemId",
      SUM(il."quantityOnHand") AS "quantityOnHandInStorageUnit"
    FROM item_ledgers il
    JOIN job_materials jm
      ON jm."itemId" = il."ledgerItemId"
      AND jm."storageUnitId" = il."storageUnitId"
    GROUP BY il."ledgerItemId"
  ),
  item_ledgers_not_in_storage_unit AS (
    SELECT
      il."ledgerItemId",
      SUM(il."quantityOnHand") AS "quantityOnHandNotInStorageUnit"
    FROM item_ledgers il
    JOIN job_materials jm
      ON jm."itemId" = il."ledgerItemId"
      AND (jm."storageUnitId" IS NULL OR jm."storageUnitId" != il."storageUnitId")
    GROUP BY il."ledgerItemId"
  )
  SELECT
    jm."id",
    jm."itemId" AS "jobMaterialItemId",
    jm."jobMakeMethodId",
    i."readableId" AS "itemReadableId",
    i."name",
    jm."description",
    i."itemTrackingType",
    jm."methodType",
    i."type",
    CASE
      WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
      ELSE i."thumbnailPath"
    END AS "thumbnailPath",
    i."unitOfMeasureCode",
    jm."quantity" AS "quantityPerParent",
    jm."estimatedQuantity",
    jm."quantityIssued",
    COALESCE(ils."quantityOnHandInStorageUnit", 0) AS "quantityOnHandInStorageUnit",
    COALESCE(ilns."quantityOnHandNotInStorageUnit", 0) AS "quantityOnHandNotInStorageUnit",
    COALESCE(so."quantityOnSalesOrder", 0) AS "quantityOnSalesOrder",
    COALESCE(po."quantityOnPurchaseOrder", 0) AS "quantityOnPurchaseOrder",
    COALESCE(oj."quantityOnProductionOrder", 0) AS "quantityOnProductionOrder",
    COALESCE(ojis."quantityOnProductionDemandInStorageUnit", 0) AS "quantityFromProductionOrderInStorageUnit",
    COALESCE(ojns."quantityOnProductionDemandNotInStorageUnit", 0) AS "quantityFromProductionOrderNotInStorageUnit",
    COALESCE(stit."quantityInTransit", 0) AS "quantityInTransitToStorageUnit",
    jm."storageUnitId",
    s."name" AS "storageUnitName"
  FROM job_materials jm
  JOIN "item" i
    ON i."id" = jm."itemId"
    AND i."companyId" = company_id
  LEFT JOIN "storageUnit" s
    ON s."id" = jm."storageUnitId"
    AND s."companyId" = company_id
    AND s."locationId" = location_id
  LEFT JOIN item_ledgers_in_storage_unit ils ON i."id" = ils."ledgerItemId"
  LEFT JOIN item_ledgers_not_in_storage_unit ilns ON i."id" = ilns."ledgerItemId"
  LEFT JOIN open_sales_orders so ON i."id" = so."salesOrderItemId"
  LEFT JOIN open_purchase_orders po ON i."id" = po."purchaseOrderItemId"
  LEFT JOIN open_jobs oj ON i."id" = oj."jobItemId"
  LEFT JOIN open_job_requirements_in_storage_unit ojis ON i."id" = ojis."itemId"
  LEFT JOIN open_job_requirements_not_in_storage_unit ojns ON i."id" = ojns."itemId"
  LEFT JOIN "modelUpload" mu
    ON mu.id = i."modelUploadId"
    AND mu."companyId" = company_id
  LEFT JOIN stock_transfers_in_transit stit
    ON jm."itemId" = stit."itemId"
    AND jm."storageUnitId" = stit."storageUnitId";
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_inventory_quantities(
  company_id text,
  location_id text
)
RETURNS TABLE (
  "id" text,
  "readableId" text,
  "readableIdWithRevision" text,
  "name" text,
  "active" boolean,
  "type" "itemType",
  "itemTrackingType" "itemTrackingType",
  "replenishmentSystem" "itemReplenishmentSystem",
  "materialSubstanceId" text,
  "materialFormId" text,
  "dimensionId" text,
  "dimension" text,
  "finishId" text,
  "finish" text,
  "gradeId" text,
  "grade" text,
  "materialType" text,
  "materialTypeId" text,
  "thumbnailPath" text,
  "unitOfMeasureCode" text,
  "leadTime" integer,
  "lotSize" integer,
  "reorderingPolicy" "itemReorderingPolicy",
  "demandAccumulationPeriod" integer,
  "demandAccumulationSafetyStock" numeric,
  "reorderPoint" integer,
  "reorderQuantity" integer,
  "minimumOrderQuantity" integer,
  "maximumOrderQuantity" integer,
  "maximumInventoryQuantity" numeric,
  "orderMultiple" integer,
  "quantityOnHand" numeric,
  "quantityOnHold" numeric,
  "quantityRejected" numeric,
  "quantityOnSalesOrder" numeric,
  "quantityOnPurchaseOrder" numeric,
  "quantityOnProductionOrder" numeric,
  "quantityOnProductionDemand" numeric,
  "demandForecast" numeric,
  "usageLast30Days" numeric,
  "usageLast90Days" numeric,
  "daysRemaining" numeric,
  "storageTypeIds" text[],
  "storageUnitIds" text[]
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH
  open_purchase_orders AS (
    SELECT
      pol."itemId",
      SUM(pol."quantityToReceive" * pol."conversionFactor") AS "quantityOnPurchaseOrder"
    FROM "purchaseOrder" po
    JOIN "purchaseOrderLine" pol ON pol."purchaseOrderId" = po."id"
    WHERE po."status" IN ('Planned', 'To Receive', 'To Receive and Invoice')
      AND po."companyId" = company_id
      AND pol."companyId" = company_id
      AND pol."locationId" = location_id
    GROUP BY pol."itemId"
  ),
  open_sales_orders AS (
    SELECT
      sol."itemId",
      SUM(sol."quantityToSend") AS "quantityOnSalesOrder"
    FROM "salesOrder" so
    JOIN "salesOrderLine" sol ON sol."salesOrderId" = so."id"
    WHERE so."status" IN ('Confirmed', 'To Ship and Invoice', 'To Ship', 'To Invoice', 'In Progress')
      AND so."companyId" = company_id
      AND sol."companyId" = company_id
      AND sol."locationId" = location_id
    GROUP BY sol."itemId"
  ),
  open_job_requirements AS (
    SELECT
      jm."itemId",
      SUM(jm."quantityToIssue") AS "quantityOnProductionDemand"
    FROM "jobMaterial" jm
    JOIN "job" j ON jm."jobId" = j."id"
    WHERE j."status" IN ('Planned', 'Ready', 'In Progress', 'Paused')
      AND jm."methodType" != 'Make to Order'
      AND jm."companyId" = company_id
      AND j."companyId" = company_id
      AND j."locationId" = location_id
    GROUP BY jm."itemId"
  ),
  open_jobs AS (
    SELECT
      j."itemId",
      SUM(j."productionQuantity" + j."scrapQuantity" - j."quantityReceivedToInventory" - j."quantityShipped") AS "quantityOnProductionOrder"
    FROM "job" j
    WHERE j."status" IN ('Planned', 'Ready', 'In Progress', 'Paused')
      AND j."companyId" = company_id
      AND j."locationId" = location_id
    GROUP BY j."itemId"
  ),
  item_ledgers AS (
    SELECT
      "itemId",
      SUM("quantity") FILTER (
        WHERE "trackedEntityStatus" IS NULL
          OR "trackedEntityStatus" != to_jsonb('Rejected'::text)
      ) AS "quantityOnHand",
      SUM("quantity") FILTER (
        WHERE "trackedEntityStatus" = to_jsonb('On Hold'::text)
      ) AS "quantityOnHold",
      SUM("quantity") FILTER (
        WHERE "trackedEntityStatus" = to_jsonb('Rejected'::text)
      ) AS "quantityRejected",
      SUM(CASE
        WHEN "entryType" IN ('Negative Adjmt.', 'Sale', 'Consumption', 'Assembly Consumption')
          AND "createdAt" >= CURRENT_DATE - INTERVAL '30 days'
        THEN -"quantity"
        ELSE 0
      END) / 30 AS "usageLast30Days",
      SUM(CASE
        WHEN "entryType" IN ('Negative Adjmt.', 'Sale', 'Consumption', 'Assembly Consumption')
          AND "createdAt" >= CURRENT_DATE - INTERVAL '90 days'
        THEN -"quantity"
        ELSE 0
      END) / 90 AS "usageLast90Days"
    FROM "itemLedger"
    WHERE "companyId" = company_id
      AND "locationId" = location_id
    GROUP BY "itemId"
  ),
  item_storage_types AS (
    SELECT
      il."itemId",
      ARRAY_AGG(DISTINCT t) AS "storageTypeIds"
    FROM "itemLedger" il
    JOIN "storageUnit" su
      ON su."id" = il."storageUnitId"
      AND su."companyId" = company_id
      AND su."locationId" = location_id
    CROSS JOIN LATERAL unnest(su."storageTypeIds") AS t
    WHERE il."companyId" = company_id
      AND il."locationId" = location_id
    GROUP BY il."itemId"
  ),
  item_storage_units AS (
    SELECT
      il."itemId",
      ARRAY_AGG(DISTINCT il."storageUnitId") AS "storageUnitIds"
    FROM "itemLedger" il
    JOIN "storageUnit" su
      ON su."id" = il."storageUnitId"
      AND su."companyId" = company_id
      AND su."locationId" = location_id
    WHERE il."companyId" = company_id
      AND il."locationId" = location_id
      AND il."storageUnitId" IS NOT NULL
    GROUP BY il."itemId"
  ),
  demand_forecast AS (
    SELECT "itemId", SUM(qty) AS "demandForecast"
    FROM (
      SELECT "itemId", "actualQuantity" AS qty
      FROM "demandActual"
      WHERE "companyId" = company_id AND "locationId" = location_id
      UNION ALL
      SELECT "itemId", "forecastQuantity" AS qty
      FROM "demandForecast"
      WHERE "companyId" = company_id AND "locationId" = location_id
    ) combined
    GROUP BY "itemId"
  )
  SELECT
    i."id",
    i."readableId",
    i."readableIdWithRevision",
    i."name",
    i."active",
    i."type",
    i."itemTrackingType",
    i."replenishmentSystem",
    m."materialSubstanceId",
    m."materialFormId",
    m."dimensionId",
    md."name" AS "dimension",
    m."finishId",
    mf."name" AS "finish",
    m."gradeId",
    mg."name" AS "grade",
    mt."name" AS "materialType",
    m."materialTypeId",
    CASE
      WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
      ELSE i."thumbnailPath"
    END AS "thumbnailPath",
    i."unitOfMeasureCode",
    ir."leadTime"::integer,
    ir."lotSize"::integer,
    ip."reorderingPolicy",
    ip."demandAccumulationPeriod"::integer,
    ip."demandAccumulationSafetyStock",
    ip."reorderPoint"::integer,
    ip."reorderQuantity"::integer,
    ip."minimumOrderQuantity"::integer,
    ip."maximumOrderQuantity"::integer,
    ip."maximumInventoryQuantity",
    ip."orderMultiple"::integer,
    COALESCE(il."quantityOnHand", 0) AS "quantityOnHand",
    COALESCE(il."quantityOnHold", 0) AS "quantityOnHold",
    COALESCE(il."quantityRejected", 0) AS "quantityRejected",
    COALESCE(so."quantityOnSalesOrder", 0) AS "quantityOnSalesOrder",
    COALESCE(po."quantityOnPurchaseOrder", 0) AS "quantityOnPurchaseOrder",
    COALESCE(jo."quantityOnProductionOrder", 0) AS "quantityOnProductionOrder",
    COALESCE(jr."quantityOnProductionDemand", 0) AS "quantityOnProductionDemand",
    COALESCE(df."demandForecast", 0) AS "demandForecast",
    COALESCE(il."usageLast30Days", 0) AS "usageLast30Days",
    COALESCE(il."usageLast90Days", 0) AS "usageLast90Days",
    CASE
      WHEN COALESCE(il."usageLast30Days", 0) > 0
      THEN ROUND(COALESCE(il."quantityOnHand", 0) / il."usageLast30Days", 2)
      ELSE NULL
    END AS "daysRemaining",
    COALESCE(ist."storageTypeIds", ARRAY[]::text[]) AS "storageTypeIds",
    COALESCE(isu."storageUnitIds", ARRAY[]::text[]) AS "storageUnitIds"
  FROM "item" i
  LEFT JOIN item_ledgers il ON i."id" = il."itemId"
  LEFT JOIN item_storage_types ist ON i."id" = ist."itemId"
  LEFT JOIN item_storage_units isu ON i."id" = isu."itemId"
  LEFT JOIN open_sales_orders so ON i."id" = so."itemId"
  LEFT JOIN open_purchase_orders po ON i."id" = po."itemId"
  LEFT JOIN open_jobs jo ON i."id" = jo."itemId"
  LEFT JOIN open_job_requirements jr ON i."id" = jr."itemId"
  LEFT JOIN demand_forecast df ON i."id" = df."itemId"
  LEFT JOIN "material" m ON i."readableId" = m."id" AND m."companyId" = company_id
  LEFT JOIN "modelUpload" mu
    ON mu.id = i."modelUploadId"
    AND mu."companyId" = company_id
  LEFT JOIN "materialDimension" md
    ON m."dimensionId" = md."id"
    AND md."companyId" = company_id
  LEFT JOIN "materialFinish" mf
    ON m."finishId" = mf."id"
    AND mf."companyId" = company_id
  LEFT JOIN "materialGrade" mg
    ON m."gradeId" = mg."id"
    AND mg."companyId" = company_id
  LEFT JOIN "materialType" mt
    ON m."materialTypeId" = mt."id"
    AND mt."companyId" = company_id
  LEFT JOIN "itemReplenishment" ir ON i."id" = ir."itemId" AND ir."companyId" = company_id
  LEFT JOIN "itemPlanning" ip
    ON i."id" = ip."itemId"
    AND ip."companyId" = company_id
    AND ip."locationId" = location_id
  WHERE i."itemTrackingType" <> 'Non-Inventory'
    AND i."companyId" = company_id;
END;
$$;
