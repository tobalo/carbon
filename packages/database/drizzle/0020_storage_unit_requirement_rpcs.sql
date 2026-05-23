CREATE OR REPLACE FUNCTION get_item_storage_unit_requirements_by_location_and_item(
  company_id text,
  location_id text,
  item_id text DEFAULT NULL
)
RETURNS TABLE (
  "itemId" text,
  "itemReadableId" text,
  "name" text,
  "description" text,
  "itemTrackingType" "itemTrackingType",
  "type" "itemType",
  "thumbnailPath" text,
  "unitOfMeasureCode" text,
  "quantityOnHandInStorageUnit" numeric,
  "quantityRequiredByStorageUnit" numeric,
  "quantityIncoming" numeric,
  "storageUnitId" text,
  "storageUnitName" text,
  "isDefaultStorageUnit" boolean
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH
  open_job_requirements_in_storage_unit AS (
    SELECT
      jm."itemId",
      jm."storageUnitId",
      SUM(jm."quantityToIssue") AS "quantityOnProductionDemandInStorageUnit"
    FROM "jobMaterial" jm
    JOIN "job" j ON jm."jobId" = j."id"
    WHERE j."status" IN ('Planned', 'Ready', 'In Progress', 'Paused')
      AND jm."methodType" != 'Make to Order'
      AND j."companyId" = company_id
      AND jm."companyId" = company_id
      AND j."locationId" = location_id
      AND (item_id IS NULL OR jm."itemId" = item_id)
    GROUP BY jm."itemId", jm."storageUnitId"
  ),
  active_stock_transfers_from_storage_unit AS (
    SELECT
      stl."itemId",
      stl."fromStorageUnitId" AS "storageUnitId",
      SUM(stl."outstandingQuantity") AS "quantityOnActiveStockTransferFromStorageUnit"
    FROM "stockTransferLine" stl
    JOIN "stockTransfer" st ON stl."stockTransferId" = st."id"
    WHERE st."status" IN ('Released', 'In Progress')
      AND st."companyId" = company_id
      AND stl."companyId" = company_id
      AND st."locationId" = location_id
      AND stl."fromStorageUnitId" IS NOT NULL
      AND (item_id IS NULL OR stl."itemId" = item_id)
    GROUP BY stl."itemId", stl."fromStorageUnitId"
  ),
  active_stock_transfers_to_storage_unit AS (
    SELECT
      stl."itemId",
      stl."toStorageUnitId" AS "storageUnitId",
      SUM(stl."outstandingQuantity") AS "quantityOnActiveStockTransferToStorageUnit"
    FROM "stockTransferLine" stl
    JOIN "stockTransfer" st ON stl."stockTransferId" = st."id"
    WHERE st."status" IN ('Released', 'In Progress')
      AND st."companyId" = company_id
      AND stl."companyId" = company_id
      AND st."locationId" = location_id
      AND stl."toStorageUnitId" IS NOT NULL
      AND (item_id IS NULL OR stl."itemId" = item_id)
    GROUP BY stl."itemId", stl."toStorageUnitId"
  ),
  open_jobs AS (
    SELECT
      j."itemId" AS "jobItemId",
      j."storageUnitId",
      SUM(j."productionQuantity" - j."quantityReceivedToInventory") AS "quantityFromProduction"
    FROM "job" j
    WHERE j."status" IN ('Ready', 'In Progress', 'Paused', 'Planned')
      AND j."salesOrderId" IS NULL
      AND j."companyId" = company_id
      AND j."locationId" = location_id
      AND (item_id IS NULL OR j."itemId" = item_id)
    GROUP BY j."itemId", j."storageUnitId"
  ),
  open_purchase_orders AS (
    SELECT
      pol."itemId" AS "purchaseOrderItemId",
      pol."storageUnitId",
      SUM(pol."quantityToReceive" * pol."conversionFactor") AS "quantityFromPurchaseOrder"
    FROM "purchaseOrder" po
    JOIN "purchaseOrderLine" pol ON pol."purchaseOrderId" = po."id"
    WHERE po."status" IN ('Planned', 'To Receive', 'To Receive and Invoice')
      AND po."companyId" = company_id
      AND pol."companyId" = company_id
      AND pol."locationId" = location_id
      AND (item_id IS NULL OR pol."itemId" = item_id)
    GROUP BY pol."itemId", pol."storageUnitId"
  ),
  item_ledgers_in_storage_unit AS (
    SELECT
      il."itemId" AS "ledgerItemId",
      il."storageUnitId",
      SUM(il."quantity") AS "quantityOnHandInStorageUnit"
    FROM "itemLedger" il
    WHERE il."companyId" = company_id
      AND il."locationId" = location_id
      AND (item_id IS NULL OR il."itemId" = item_id)
    GROUP BY il."itemId", il."storageUnitId"
  ),
  items_with_activity AS (
    SELECT DISTINCT active_items."itemId", active_items."storageUnitId"
    FROM (
      SELECT ils."ledgerItemId" AS "itemId", ils."storageUnitId"
      FROM item_ledgers_in_storage_unit ils
      WHERE ils."quantityOnHandInStorageUnit" > 0
      UNION
      SELECT ojis."itemId", ojis."storageUnitId"
      FROM open_job_requirements_in_storage_unit ojis
      WHERE ojis."quantityOnProductionDemandInStorageUnit" > 0
      UNION
      SELECT astfs."itemId", astfs."storageUnitId"
      FROM active_stock_transfers_from_storage_unit astfs
      WHERE astfs."quantityOnActiveStockTransferFromStorageUnit" > 0
      UNION
      SELECT astts."itemId", astts."storageUnitId"
      FROM active_stock_transfers_to_storage_unit astts
      WHERE astts."quantityOnActiveStockTransferToStorageUnit" > 0
      UNION
      SELECT oj."jobItemId" AS "itemId", oj."storageUnitId"
      FROM open_jobs oj
      WHERE oj."quantityFromProduction" > 0
      UNION
      SELECT opo."purchaseOrderItemId" AS "itemId", opo."storageUnitId"
      FROM open_purchase_orders opo
      WHERE opo."quantityFromPurchaseOrder" > 0
    ) active_items
  )
  SELECT
    ish."itemId",
    i."readableId" AS "itemReadableId",
    i."name",
    i."name" AS "description",
    i."itemTrackingType",
    i."type",
    CASE
      WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
      ELSE i."thumbnailPath"
    END AS "thumbnailPath",
    i."unitOfMeasureCode",
    COALESCE(ils."quantityOnHandInStorageUnit", 0) + COALESCE(astts."quantityOnActiveStockTransferToStorageUnit", 0) AS "quantityOnHandInStorageUnit",
    COALESCE(ojis."quantityOnProductionDemandInStorageUnit", 0) + COALESCE(astfs."quantityOnActiveStockTransferFromStorageUnit", 0) AS "quantityRequiredByStorageUnit",
    COALESCE(oj."quantityFromProduction", 0) + COALESCE(opo."quantityFromPurchaseOrder", 0) AS "quantityIncoming",
    ish."storageUnitId",
    s."name" AS "storageUnitName",
    COALESCE(pm."defaultStorageUnitId" = ish."storageUnitId", false) AS "isDefaultStorageUnit"
  FROM items_with_activity ish
  JOIN "item" i ON i."id" = ish."itemId" AND i."companyId" = company_id
  LEFT JOIN "storageUnit" s
    ON s."id" = ish."storageUnitId"
    AND s."companyId" = company_id
    AND s."locationId" = location_id
  LEFT JOIN item_ledgers_in_storage_unit ils
    ON i."id" = ils."ledgerItemId"
    AND ish."storageUnitId" IS NOT DISTINCT FROM ils."storageUnitId"
  LEFT JOIN open_job_requirements_in_storage_unit ojis
    ON i."id" = ojis."itemId"
    AND ish."storageUnitId" IS NOT DISTINCT FROM ojis."storageUnitId"
  LEFT JOIN active_stock_transfers_from_storage_unit astfs
    ON i."id" = astfs."itemId"
    AND ish."storageUnitId" IS NOT DISTINCT FROM astfs."storageUnitId"
  LEFT JOIN active_stock_transfers_to_storage_unit astts
    ON i."id" = astts."itemId"
    AND ish."storageUnitId" IS NOT DISTINCT FROM astts."storageUnitId"
  LEFT JOIN open_jobs oj
    ON i."id" = oj."jobItemId"
    AND ish."storageUnitId" IS NOT DISTINCT FROM oj."storageUnitId"
  LEFT JOIN open_purchase_orders opo
    ON i."id" = opo."purchaseOrderItemId"
    AND ish."storageUnitId" IS NOT DISTINCT FROM opo."storageUnitId"
  LEFT JOIN "modelUpload" mu
    ON mu.id = i."modelUploadId"
    AND mu."companyId" = company_id
  LEFT JOIN "pickMethod" pm
    ON pm."itemId" = i."id"
    AND pm."companyId" = company_id
    AND pm."locationId" = location_id
  ORDER BY (
    COALESCE(ils."quantityOnHandInStorageUnit", 0)
    + COALESCE(astts."quantityOnActiveStockTransferToStorageUnit", 0)
    - COALESCE(ojis."quantityOnProductionDemandInStorageUnit", 0)
    - COALESCE(astfs."quantityOnActiveStockTransferFromStorageUnit", 0)
  ) DESC;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_item_storage_unit_requirements_by_location(
  company_id text,
  location_id text
)
RETURNS TABLE (
  "itemId" text,
  "itemReadableId" text,
  "name" text,
  "description" text,
  "itemTrackingType" "itemTrackingType",
  "type" "itemType",
  "thumbnailPath" text,
  "unitOfMeasureCode" text,
  "quantityOnHandInStorageUnit" numeric,
  "quantityRequiredByStorageUnit" numeric,
  "quantityIncoming" numeric,
  "storageUnitId" text,
  "storageUnitName" text,
  "isDefaultStorageUnit" boolean
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT *
  FROM get_item_storage_unit_requirements_by_location_and_item(company_id, location_id, NULL)
  ORDER BY ("quantityOnHandInStorageUnit" - "quantityRequiredByStorageUnit") ASC;
$$;
