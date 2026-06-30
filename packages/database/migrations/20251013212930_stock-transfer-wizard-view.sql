DROP FUNCTION IF EXISTS get_item_shelf_requirements_by_location;
CREATE OR REPLACE FUNCTION get_item_shelf_requirements_by_location(company_id TEXT, location_id TEXT)
  RETURNS TABLE (
    "itemId" TEXT,
    "itemReadableId" TEXT,
    "name" TEXT,
    "description" TEXT,
    "itemTrackingType" "itemTrackingType",
    "type" "itemType",
    "thumbnailPath" TEXT,
    "unitOfMeasureCode" TEXT,
    "quantityOnHandInShelf" NUMERIC,
    "quantityRequiredByShelf" NUMERIC,
    "quantityIncoming" NUMERIC,
    "shelfId" TEXT,
    "shelfName" TEXT,
    "isDefaultShelf" BOOLEAN
  ) AS $$
  BEGIN
    RETURN QUERY
    
WITH
  item_shelves AS (
    SELECT DISTINCT
      il."itemId",
      il."shelfId"
    FROM "itemLedger" il
    WHERE il."companyId" = company_id
      AND il."locationId" = location_id
  ),
  open_job_requirements_in_shelf AS (
    SELECT 
      jm."itemId",
      jm."shelfId",
      SUM(jm."quantityToIssue") AS "quantityOnProductionDemandInShelf"
    FROM "jobMaterial" jm
    INNER JOIN "job" j ON jm."jobId" = j."id"
    WHERE j."status" IN (
        'Planned',
        'Ready',
        'In Progress',
        'Paused'
      )
    AND jm."methodType" != 'Make'
    AND j."companyId" = company_id
    AND j."locationId" = location_id
    GROUP BY jm."itemId", jm."shelfId"
  ),
  active_stock_transfers_from_shelf AS (
    SELECT 
      stl."itemId",
      stl."fromShelfId" AS "shelfId",
      SUM(stl."outstandingQuantity") AS "quantityOnActiveStockTransferFromShelf"
    FROM "stockTransferLine" stl
    INNER JOIN "stockTransfer" st ON stl."stockTransferId" = st."id"
    WHERE st."status" IN ('Released', 'In Progress')
    AND st."companyId" = company_id
    AND st."locationId" = location_id
    AND stl."fromShelfId" IS NOT NULL
    GROUP BY stl."itemId", stl."fromShelfId"
  ),
  active_stock_transfers_to_shelf AS (
    SELECT 
      stl."itemId",
      stl."toShelfId" AS "shelfId",
      SUM(stl."outstandingQuantity") AS "quantityOnActiveStockTransferToShelf"
    FROM "stockTransferLine" stl
    INNER JOIN "stockTransfer" st ON stl."stockTransferId" = st."id"
    WHERE st."status" IN ('Released', 'In Progress')
    AND st."companyId" = company_id
    AND st."locationId" = location_id
    AND stl."toShelfId" IS NOT NULL
    GROUP BY stl."itemId", stl."toShelfId"
  ),
  open_jobs AS (
    SELECT 
      j."itemId" AS "jobItemId",
      j."shelfId",
      SUM(j."productionQuantity" - j."quantityReceivedToInventory") AS "quantityFromProduction"
    FROM job j
    WHERE j."status" IN (
      'Ready',
      'In Progress',
      'Paused',
      'Planned'
    ) AND "salesOrderId" IS NULL
    AND j."companyId" = company_id
    AND j."locationId" = location_id
    GROUP BY j."itemId", j."shelfId"
  ),
  open_purchase_orders AS (
    SELECT
      pol."itemId" AS "purchaseOrderItemId",
      pol."shelfId",
      SUM(pol."quantityToReceive" * pol."conversionFactor") AS "quantityFromPurchaseOrder" 
    FROM
      "purchaseOrder" po
      INNER JOIN "purchaseOrderLine" pol
        ON pol."purchaseOrderId" = po."id"
    WHERE
      po."status" IN (
        'Planned',
        'To Receive',
        'To Receive and Invoice'
      )
      AND po."companyId" = company_id
      AND pol."locationId" = location_id
    GROUP BY pol."itemId", pol."shelfId"
  ),
  item_ledgers_in_shelf AS (
    SELECT 
      il."itemId" AS "ledgerItemId",
      il."shelfId",
      SUM(il."quantity") AS "quantityOnHandInShelf"
    FROM "itemLedger" il
    WHERE il."companyId" = company_id
      AND il."locationId" = location_id
    GROUP BY il."itemId", il."shelfId"
  ),
  items_with_activity AS (
    SELECT DISTINCT active_items."itemId", active_items."shelfId"
    FROM (
      SELECT ils."ledgerItemId" AS "itemId", ils."shelfId"
      FROM item_ledgers_in_shelf ils
      WHERE ils."quantityOnHandInShelf" > 0

      UNION

      SELECT ojis."itemId", ojis."shelfId"
      FROM open_job_requirements_in_shelf ojis
      WHERE ojis."quantityOnProductionDemandInShelf" > 0

      UNION

      SELECT astfs."itemId", astfs."shelfId"
      FROM active_stock_transfers_from_shelf astfs
      WHERE astfs."quantityOnActiveStockTransferFromShelf" > 0

      UNION

      SELECT astts."itemId", astts."shelfId"
      FROM active_stock_transfers_to_shelf astts
      WHERE astts."quantityOnActiveStockTransferToShelf" > 0

      UNION

      SELECT oj."jobItemId" AS "itemId", oj."shelfId"
      FROM open_jobs oj
      WHERE oj."quantityFromProduction" > 0

      UNION

      SELECT opo."purchaseOrderItemId" AS "itemId", opo."shelfId"
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
  COALESCE(ils."quantityOnHandInShelf", 0) + COALESCE(astts."quantityOnActiveStockTransferToShelf", 0) AS "quantityOnHandInShelf",
  COALESCE(ojis."quantityOnProductionDemandInShelf", 0) + COALESCE(astfs."quantityOnActiveStockTransferFromShelf", 0) AS "quantityRequiredByShelf",
  COALESCE(oj."quantityFromProduction", 0) + COALESCE(opo."quantityFromPurchaseOrder", 0) AS "quantityIncoming",
  ish."shelfId",
  s."name" AS "shelfName",
  COALESCE(pm."defaultShelfId" = ish."shelfId", false) AS "isDefaultShelf"
FROM
  items_with_activity ish
  INNER JOIN "item" i ON i."id" = ish."itemId"
  LEFT JOIN "shelf" s ON s."id" = ish."shelfId"
  LEFT JOIN item_ledgers_in_shelf ils ON i."id" = ils."ledgerItemId" AND ish."shelfId" IS NOT DISTINCT FROM ils."shelfId"
  LEFT JOIN open_job_requirements_in_shelf ojis ON i."id" = ojis."itemId" AND ish."shelfId" IS NOT DISTINCT FROM ojis."shelfId"
  LEFT JOIN active_stock_transfers_from_shelf astfs ON i."id" = astfs."itemId" AND ish."shelfId" IS NOT DISTINCT FROM astfs."shelfId"
  LEFT JOIN active_stock_transfers_to_shelf astts ON i."id" = astts."itemId" AND ish."shelfId" IS NOT DISTINCT FROM astts."shelfId"
  LEFT JOIN open_jobs oj ON i."id" = oj."jobItemId" AND ish."shelfId" IS NOT DISTINCT FROM oj."shelfId"
  LEFT JOIN open_purchase_orders opo ON i."id" = opo."purchaseOrderItemId" AND ish."shelfId" IS NOT DISTINCT FROM opo."shelfId"
  LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId"
  LEFT JOIN "pickMethod" pm ON pm."itemId" = i."id" AND pm."locationId" = location_id
ORDER BY (COALESCE(ils."quantityOnHandInShelf", 0) + COALESCE(astts."quantityOnActiveStockTransferToShelf", 0) - COALESCE(ojis."quantityOnProductionDemandInShelf", 0) - COALESCE(astfs."quantityOnActiveStockTransferFromShelf", 0)) ASC;
  END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


DROP FUNCTION IF EXISTS get_item_shelf_requirements_by_location_and_item;
CREATE OR REPLACE FUNCTION get_item_shelf_requirements_by_location_and_item(company_id TEXT, location_id TEXT, item_id TEXT DEFAULT NULL)
  RETURNS TABLE (
    "itemId" TEXT,
    "itemReadableId" TEXT,
    "name" TEXT,
    "description" TEXT,
    "itemTrackingType" "itemTrackingType",
    "type" "itemType",
    "thumbnailPath" TEXT,
    "unitOfMeasureCode" TEXT,
    "quantityOnHandInShelf" NUMERIC,
    "quantityRequiredByShelf" NUMERIC,
    "quantityIncoming" NUMERIC,
    "shelfId" TEXT,
    "shelfName" TEXT,
    "isDefaultShelf" BOOLEAN
  ) AS $$
  BEGIN
    RETURN QUERY
    
WITH
  item_shelves AS (
    SELECT DISTINCT
      il."itemId",
      il."shelfId"
    FROM "itemLedger" il
    WHERE il."companyId" = company_id
      AND il."locationId" = location_id
      AND (item_id IS NULL OR il."itemId" = item_id)
  ),
  open_job_requirements_in_shelf AS (
    SELECT 
      jm."itemId",
      jm."shelfId",
      SUM(jm."quantityToIssue") AS "quantityOnProductionDemandInShelf"
    FROM "jobMaterial" jm
    INNER JOIN "job" j ON jm."jobId" = j."id"
    WHERE j."status" IN (
        'Planned',
        'Ready',
        'In Progress',
        'Paused'
      )
    AND jm."methodType" != 'Make'
    AND j."companyId" = company_id
    AND j."locationId" = location_id
    AND (item_id IS NULL OR jm."itemId" = item_id)
    GROUP BY jm."itemId", jm."shelfId"
  ),
  active_stock_transfers_from_shelf AS (
    SELECT 
      stl."itemId",
      stl."fromShelfId" AS "shelfId",
      SUM(stl."outstandingQuantity") AS "quantityOnActiveStockTransferFromShelf"
    FROM "stockTransferLine" stl
    INNER JOIN "stockTransfer" st ON stl."stockTransferId" = st."id"
    WHERE st."status" IN ('Released', 'In Progress')
    AND st."companyId" = company_id
    AND st."locationId" = location_id
    AND stl."fromShelfId" IS NOT NULL
    AND (item_id IS NULL OR stl."itemId" = item_id)
    GROUP BY stl."itemId", stl."fromShelfId"
  ),
  active_stock_transfers_to_shelf AS (
    SELECT 
      stl."itemId",
      stl."toShelfId" AS "shelfId",
      SUM(stl."outstandingQuantity") AS "quantityOnActiveStockTransferToShelf"
    FROM "stockTransferLine" stl
    INNER JOIN "stockTransfer" st ON stl."stockTransferId" = st."id"
    WHERE st."status" IN ('Released', 'In Progress')
    AND st."companyId" = company_id
    AND st."locationId" = location_id
    AND stl."toShelfId" IS NOT NULL
    AND (item_id IS NULL OR stl."itemId" = item_id)
    GROUP BY stl."itemId", stl."toShelfId"
  ),
  open_jobs AS (
    SELECT 
      j."itemId" AS "jobItemId",
      j."shelfId",
      SUM(j."productionQuantity" - j."quantityReceivedToInventory") AS "quantityFromProduction"
    FROM job j
    WHERE j."status" IN (
      'Ready',
      'In Progress',
      'Paused',
      'Planned'
    ) AND "salesOrderId" IS NULL
    AND j."companyId" = company_id
    AND j."locationId" = location_id
    AND (item_id IS NULL OR j."itemId" = item_id)
    GROUP BY j."itemId", j."shelfId"
  ),
  open_purchase_orders AS (
    SELECT
      pol."itemId" AS "purchaseOrderItemId",
      pol."shelfId",
      SUM(pol."quantityToReceive" * pol."conversionFactor") AS "quantityFromPurchaseOrder" 
    FROM
      "purchaseOrder" po
      INNER JOIN "purchaseOrderLine" pol
        ON pol."purchaseOrderId" = po."id"
    WHERE
      po."status" IN (
        'Planned',
        'To Receive',
        'To Receive and Invoice'
      )
      AND po."companyId" = company_id
      AND pol."locationId" = location_id
      AND (item_id IS NULL OR pol."itemId" = item_id)
    GROUP BY pol."itemId", pol."shelfId"
  ),
  item_ledgers_in_shelf AS (
    SELECT 
      il."itemId" AS "ledgerItemId",
      il."shelfId",
      SUM(il."quantity") AS "quantityOnHandInShelf"
    FROM "itemLedger" il
    WHERE il."companyId" = company_id
      AND il."locationId" = location_id
      AND (item_id IS NULL OR il."itemId" = item_id)
    GROUP BY il."itemId", il."shelfId"
  ),
  items_with_activity AS (
    SELECT DISTINCT active_items."itemId", active_items."shelfId"
    FROM (
      SELECT ils."ledgerItemId" AS "itemId", ils."shelfId"
      FROM item_ledgers_in_shelf ils
      WHERE ils."quantityOnHandInShelf" > 0

      UNION

      SELECT ojis."itemId", ojis."shelfId"
      FROM open_job_requirements_in_shelf ojis
      WHERE ojis."quantityOnProductionDemandInShelf" > 0

      UNION

      SELECT astfs."itemId", astfs."shelfId"
      FROM active_stock_transfers_from_shelf astfs
      WHERE astfs."quantityOnActiveStockTransferFromShelf" > 0

      UNION

      SELECT astts."itemId", astts."shelfId"
      FROM active_stock_transfers_to_shelf astts
      WHERE astts."quantityOnActiveStockTransferToShelf" > 0

      UNION

      SELECT oj."jobItemId" AS "itemId", oj."shelfId"
      FROM open_jobs oj
      WHERE oj."quantityFromProduction" > 0

      UNION

      SELECT opo."purchaseOrderItemId" AS "itemId", opo."shelfId"
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
  COALESCE(ils."quantityOnHandInShelf", 0) + COALESCE(astts."quantityOnActiveStockTransferToShelf", 0) AS "quantityOnHandInShelf",
  COALESCE(ojis."quantityOnProductionDemandInShelf", 0) + COALESCE(astfs."quantityOnActiveStockTransferFromShelf", 0) AS "quantityRequiredByShelf",
  COALESCE(oj."quantityFromProduction", 0) + COALESCE(opo."quantityFromPurchaseOrder", 0) AS "quantityIncoming",
  ish."shelfId",
  s."name" AS "shelfName",
  COALESCE(pm."defaultShelfId" = ish."shelfId", false) AS "isDefaultShelf"
FROM
  items_with_activity ish
  INNER JOIN "item" i ON i."id" = ish."itemId"
  LEFT JOIN "shelf" s ON s."id" = ish."shelfId"
  LEFT JOIN item_ledgers_in_shelf ils ON i."id" = ils."ledgerItemId" AND ish."shelfId" IS NOT DISTINCT FROM ils."shelfId"
  LEFT JOIN open_job_requirements_in_shelf ojis ON i."id" = ojis."itemId" AND ish."shelfId" IS NOT DISTINCT FROM ojis."shelfId"
  LEFT JOIN active_stock_transfers_from_shelf astfs ON i."id" = astfs."itemId" AND ish."shelfId" IS NOT DISTINCT FROM astfs."shelfId"
  LEFT JOIN active_stock_transfers_to_shelf astts ON i."id" = astts."itemId" AND ish."shelfId" IS NOT DISTINCT FROM astts."shelfId"
  LEFT JOIN open_jobs oj ON i."id" = oj."jobItemId" AND ish."shelfId" IS NOT DISTINCT FROM oj."shelfId"
  LEFT JOIN open_purchase_orders opo ON i."id" = opo."purchaseOrderItemId" AND ish."shelfId" IS NOT DISTINCT FROM opo."shelfId"
  LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId"
  LEFT JOIN "pickMethod" pm ON pm."itemId" = i."id" AND pm."locationId" = location_id
ORDER BY (COALESCE(ils."quantityOnHandInShelf", 0) + COALESCE(astts."quantityOnActiveStockTransferToShelf", 0) - COALESCE(ojis."quantityOnProductionDemandInShelf", 0) - COALESCE(astfs."quantityOnActiveStockTransferFromShelf", 0)) DESC;
  END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP FUNCTION IF EXISTS get_job_quantity_on_hand;
CREATE OR REPLACE FUNCTION get_job_quantity_on_hand(job_id TEXT, company_id TEXT, location_id TEXT)
  RETURNS TABLE (
    "id" TEXT,
    "jobMaterialItemId" TEXT,
    "jobMakeMethodId" TEXT,
    "itemReadableId" TEXT,
    "name" TEXT,
    "description" TEXT,
    "itemTrackingType" "itemTrackingType",
    "methodType" "methodType",
    "type" "itemType",
    "thumbnailPath" TEXT,
    "unitOfMeasureCode" TEXT,
    "quantityPerParent" NUMERIC,
    "estimatedQuantity" NUMERIC,
    "quantityIssued" NUMERIC,
    "quantityOnHandInShelf" NUMERIC,
    "quantityOnHandNotInShelf" NUMERIC,
    "quantityOnSalesOrder" NUMERIC,
    "quantityOnPurchaseOrder" NUMERIC,
    "quantityOnProductionOrder" NUMERIC,
    "quantityFromProductionOrderInShelf" NUMERIC,
    "quantityFromProductionOrderNotInShelf" NUMERIC,
    "quantityInTransitToShelf" NUMERIC,
    "shelfId" TEXT,
    "shelfName" TEXT
  ) AS $$
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
      jm."shelfId"
    FROM
      "jobMaterial" jm
    WHERE
      jm."jobId" = job_id
  ),
  open_purchase_orders AS (
    SELECT
      pol."itemId" AS "purchaseOrderItemId",
      SUM(pol."quantityToReceive" * pol."conversionFactor") AS "quantityOnPurchaseOrder" 
    FROM
      "purchaseOrder" po
      INNER JOIN "purchaseOrderLine" pol
        ON pol."purchaseOrderId" = po."id"
      INNER JOIN job_materials jm
        ON jm."itemId" = pol."itemId"
    WHERE
      po."status" IN (
        'Planned',
        'To Receive',
        'To Receive and Invoice'
      )
      AND po."companyId" = company_id
      AND pol."locationId" = location_id
    GROUP BY pol."itemId"
  ),
  open_stock_transfers_to AS (
    SELECT
      stl."itemId",
      stl."toShelfId" AS "shelfId",
      SUM(stl."outstandingQuantity") AS "quantityOnStockTransferTo"
    FROM "stockTransferLine" stl
    INNER JOIN "stockTransfer" st ON stl."stockTransferId" = st."id"
    INNER JOIN job_materials jm ON jm."itemId" = stl."itemId"
    WHERE st."status" IN ('Released', 'In Progress')
    AND st."companyId" = company_id
    AND st."locationId" = location_id
    GROUP BY stl."itemId", stl."toShelfId"
  ),
  open_stock_transfers_from AS (
    SELECT
      stl."itemId",
      stl."fromShelfId" AS "shelfId",
      SUM(stl."outstandingQuantity") AS "quantityOnStockTransferFrom"
    FROM "stockTransferLine" stl
    INNER JOIN "stockTransfer" st ON stl."stockTransferId" = st."id"
    INNER JOIN job_materials jm ON jm."itemId" = stl."itemId"
    WHERE st."status" IN ('Released', 'In Progress')
    AND st."companyId" = company_id
    AND st."locationId" = location_id
    GROUP BY stl."itemId", stl."fromShelfId"
  ),
  stock_transfers_in_transit AS (
    SELECT
      COALESCE(stt."itemId", stf."itemId") AS "itemId",
      COALESCE(stt."shelfId", stf."shelfId") AS "shelfId",
      COALESCE(stt."quantityOnStockTransferTo", 0) - COALESCE(stf."quantityOnStockTransferFrom", 0) AS "quantityInTransit"
    FROM open_stock_transfers_to stt
    FULL OUTER JOIN open_stock_transfers_from stf ON stt."itemId" = stf."itemId" AND stt."shelfId" = stf."shelfId"
  ),
  open_sales_orders AS (
    SELECT
      sol."itemId" AS "salesOrderItemId",
      SUM(sol."quantityToSend") AS "quantityOnSalesOrder" 
    FROM
      "salesOrder" so
      INNER JOIN "salesOrderLine" sol
        ON sol."salesOrderId" = so."id"
      INNER JOIN job_materials jm
        ON jm."itemId" = sol."itemId"
    WHERE
      so."status" IN (
        'Confirmed',
        'To Ship and Invoice',
        'To Ship',
        'To Invoice',
        'In Progress'
      )
      AND so."companyId" = company_id
      AND sol."locationId" = location_id
    GROUP BY sol."itemId"
  ),
  open_jobs AS (
    SELECT 
      j."itemId" AS "jobItemId",
      SUM(j."productionQuantity" - j."quantityReceivedToInventory") AS "quantityOnProductionOrder"
    FROM job j
    WHERE j."status" IN (
      'Ready',
      'In Progress',
      'Paused',
      'Planned'
    ) AND "salesOrderId" IS NULL
    GROUP BY j."itemId"
  ),
  open_job_requirements AS (
    SELECT 
      jm."itemId",
      jm."shelfId",
      SUM(jm."quantityToIssue") AS "quantityOnProductionDemand"
    FROM "jobMaterial" jm
    INNER JOIN "job" j ON jm."jobId" = j."id"
    INNER JOIN job_materials jmat
      ON jmat."itemId" = jm."itemId"
    WHERE j."status" IN (
        'Planned',
        'Ready',
        'In Progress',
        'Paused'
      )
    AND jm."methodType" != 'Make'
    AND j."companyId" = company_id
    AND j."locationId" = location_id
    GROUP BY jm."itemId", jm."shelfId"
  ),
  open_job_requirements_in_shelf AS (
    SELECT 
      ojr."itemId",
      SUM(ojr."quantityOnProductionDemand") AS "quantityOnProductionDemandInShelf"
    FROM open_job_requirements ojr
    INNER JOIN job_materials jm
      ON jm."itemId" = ojr."itemId" AND jm."shelfId" = ojr."shelfId"
    GROUP BY ojr."itemId"
  ),
  open_job_requirements_not_in_shelf AS (
    SELECT 
      ojr."itemId",
      SUM(ojr."quantityOnProductionDemand") AS "quantityOnProductionDemandNotInShelf"
    FROM open_job_requirements ojr
    INNER JOIN job_materials jm
      ON jm."itemId" = ojr."itemId" AND (jm."shelfId" IS NULL OR jm."shelfId" != ojr."shelfId")
    GROUP BY ojr."itemId"
  ),
  item_ledgers AS (
    SELECT 
      il."itemId" AS "ledgerItemId",
      il."shelfId",
      SUM(il."quantity") AS "quantityOnHand"
    FROM "itemLedger" il
    INNER JOIN job_materials jm
      ON jm."itemId" = il."itemId"
    WHERE il."companyId" = company_id
      AND il."locationId" = location_id
    GROUP BY il."itemId", il."shelfId"
  ),
  item_ledgers_in_shelf AS (
    SELECT 
      il."ledgerItemId",
      SUM(il."quantityOnHand") AS "quantityOnHandInShelf"
    FROM item_ledgers il
    INNER JOIN job_materials jm
      ON jm."itemId" = il."ledgerItemId" AND jm."shelfId" = il."shelfId"
    GROUP BY il."ledgerItemId"
  ),
  item_ledgers_not_in_shelf AS (
    SELECT 
      il."ledgerItemId",
      SUM(il."quantityOnHand") AS "quantityOnHandNotInShelf"
    FROM item_ledgers il
    INNER JOIN job_materials jm
      ON jm."itemId" = il."ledgerItemId" AND (jm."shelfId" IS NULL OR jm."shelfId" != il."shelfId")
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
  jm."quantity" as "quantityPerParent",
  jm."estimatedQuantity",
  jm."quantityIssued",
  COALESCE(ils."quantityOnHandInShelf", 0) AS "quantityOnHandInShelf",
  COALESCE(ilns."quantityOnHandNotInShelf", 0) AS "quantityOnHandNotInShelf",
  COALESCE(so."quantityOnSalesOrder", 0) AS "quantityOnSalesOrder",
  COALESCE(po."quantityOnPurchaseOrder", 0) AS "quantityOnPurchaseOrder",
  COALESCE(oj."quantityOnProductionOrder", 0) AS "quantityOnProductionOrder",
  COALESCE(ojis."quantityOnProductionDemandInShelf", 0) AS "quantityFromProductionOrderInShelf",
  COALESCE(ojns."quantityOnProductionDemandNotInShelf", 0) AS "quantityFromProductionOrderNotInShelf",
  COALESCE(stit."quantityInTransit", 0) AS "quantityInTransitToShelf",
  jm."shelfId",
  s."name" AS "shelfName"
FROM
  job_materials jm
  INNER JOIN "item" i ON i."id" = jm."itemId"
  LEFT JOIN "shelf" s ON s."id" = jm."shelfId"
  LEFT JOIN item_ledgers_in_shelf ils ON i."id" = ils."ledgerItemId"
  LEFT JOIN item_ledgers_not_in_shelf ilns ON i."id" = ilns."ledgerItemId"
  LEFT JOIN open_sales_orders so ON i."id" = so."salesOrderItemId"
  LEFT JOIN open_purchase_orders po ON i."id" = po."purchaseOrderItemId"
  LEFT JOIN open_jobs oj ON i."id" = oj."jobItemId"
  LEFT JOIN open_job_requirements_in_shelf ojis ON i."id" = ojis."itemId"
  LEFT JOIN open_job_requirements_not_in_shelf ojns ON i."id" = ojns."itemId"
  LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId"
  LEFT JOIN stock_transfers_in_transit stit ON jm."itemId" = stit."itemId" AND jm."shelfId" = stit."shelfId";
  END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
