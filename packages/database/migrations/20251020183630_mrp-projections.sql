
-- Demand forecasts table for estimates
CREATE TABLE "demandProjection" (
  "itemId" TEXT NOT NULL,
  "locationId" TEXT,
  "periodId" TEXT NOT NULL,
  "forecastQuantity" NUMERIC NOT NULL DEFAULT 0,
  "forecastMethod" TEXT, -- 'manual', 'statistical', 'ml', etc.
  "confidence" NUMERIC(3,2), -- 0.00 to 1.00
  "notes" TEXT,
  "companyId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT NOT NULL,
  
  CONSTRAINT "demandProjection_pkey" PRIMARY KEY ("itemId", "locationId", "periodId"),
  CONSTRAINT "demandProjection_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE CASCADE,
  CONSTRAINT "demandProjection_itemId_locationId_periodId_companyId_key" UNIQUE ("itemId", "locationId", "periodId", "companyId"),
  CONSTRAINT "demandProjection_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE CASCADE,
  CONSTRAINT "demandProjection_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "period"("id") ON DELETE CASCADE,
  CONSTRAINT "demandProjection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE,
  CONSTRAINT "demandProjection_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE RESTRICT,
  CONSTRAINT "demandProjection_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON DELETE RESTRICT
);

ALTER TABLE "demandProjection" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."demandProjection"
FOR SELECT USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_permission ('inventory_view')
    )::text[]
  )
);

CREATE POLICY "INSERT" ON "public"."demandProjection"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('inventory_create')
    )::text[]
  )
);

CREATE POLICY "UPDATE" ON "public"."demandProjection"
FOR UPDATE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('inventory_update')
    )::text[]
  )
);

CREATE POLICY "DELETE" ON "public"."demandProjection"
FOR DELETE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('inventory_delete')
    )::text[]
  )
);

-- Migrate data from demandForecast to demandProjection
INSERT INTO "demandProjection" (
  "itemId",
  "locationId", 
  "periodId",
  "forecastQuantity",
  "forecastMethod",
  "confidence",
  "notes",
  "companyId",
  "createdBy",
  "createdAt",
  "updatedAt",
  "updatedBy"
)
SELECT 
  "itemId",
  "locationId",
  "periodId", 
  "forecastQuantity",
  "forecastMethod",
  "confidence",
  "notes",
  "companyId",
  "createdBy",
  "createdAt",
  "updatedAt",
  "updatedBy"
FROM "demandForecast";

DELETE FROM "demandForecast";

DROP FUNCTION IF EXISTS get_production_projections;
CREATE OR REPLACE FUNCTION get_production_projections(company_id TEXT, location_id TEXT, periods TEXT[])
  RETURNS TABLE (
    "id" TEXT,
    "readableIdWithRevision" TEXT,
    "name" TEXT,
    "active" BOOLEAN,
    "type" "itemType",
    "itemTrackingType" "itemTrackingType",
    "replenishmentSystem" "itemReplenishmentSystem",
    "thumbnailPath" TEXT,
    "unitOfMeasureCode" TEXT,
    "leadTime" INTEGER,
    "manufacturingBlocked" BOOLEAN,
    "lotSize" INTEGER,
    "reorderingPolicy" "itemReorderingPolicy",
    "demandAccumulationPeriod" INTEGER,
    "demandAccumulationSafetyStock" NUMERIC,
    "reorderPoint" INTEGER,
    "reorderQuantity" INTEGER,
    "minimumOrderQuantity" INTEGER,
    "maximumOrderQuantity" INTEGER,
    "orderMultiple" INTEGER,
    "quantityOnHand" NUMERIC,
    "maximumInventoryQuantity" NUMERIC,
    "week1" NUMERIC,
    "week2" NUMERIC,
    "week3" NUMERIC,
    "week4" NUMERIC,
    "week5" NUMERIC,
    "week6" NUMERIC,
    "week7" NUMERIC,
    "week8" NUMERIC,
    "week9" NUMERIC,
    "week10" NUMERIC,
    "week11" NUMERIC,
    "week12" NUMERIC,
    "week13" NUMERIC,
    "week14" NUMERIC,
    "week15" NUMERIC,
    "week16" NUMERIC,
    "week17" NUMERIC,
    "week18" NUMERIC,
    "week19" NUMERIC,
    "week20" NUMERIC,
    "week21" NUMERIC,
    "week22" NUMERIC,
    "week23" NUMERIC,
    "week24" NUMERIC,
    "week25" NUMERIC,
    "week26" NUMERIC,
    "week27" NUMERIC,
    "week28" NUMERIC,
    "week29" NUMERIC,
    "week30" NUMERIC,
    "week31" NUMERIC,
    "week32" NUMERIC,
    "week33" NUMERIC,
    "week34" NUMERIC,
    "week35" NUMERIC,
    "week36" NUMERIC,
    "week37" NUMERIC,
    "week38" NUMERIC,
    "week39" NUMERIC,
    "week40" NUMERIC,
    "week41" NUMERIC,
    "week42" NUMERIC,
    "week43" NUMERIC,
    "week44" NUMERIC,
    "week45" NUMERIC,
    "week46" NUMERIC,
    "week47" NUMERIC,
    "week48" NUMERIC,
    "week49" NUMERIC,
    "week50" NUMERIC,
    "week51" NUMERIC,
    "week52" NUMERIC
  ) AS $$
  SELECT
    i."id",
    i."readableIdWithRevision",
    i."name",
    i."active",
    i."type",
    i."itemTrackingType",
    i."replenishmentSystem",
    CASE
      WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
      ELSE i."thumbnailPath"
    END AS "thumbnailPath",
    i."unitOfMeasureCode",
    ir."leadTime",
    ir."manufacturingBlocked",
    ir."lotSize",
    ip."reorderingPolicy",
    ip."demandAccumulationPeriod",
    ip."demandAccumulationSafetyStock",
    ip."reorderPoint",
    ip."reorderQuantity",
    ip."minimumOrderQuantity",
    ip."maximumOrderQuantity",
    ip."orderMultiple",
    COALESCE((
      SELECT SUM("quantity")
      FROM "itemLedger"
      WHERE "companyId" = company_id
        AND "locationId" = location_id
        AND "itemId" = i."id"
    ), 0) AS "quantityOnHand",
    ip."maximumInventoryQuantity",
    MAX(CASE WHEN df."periodId" = periods[1] THEN df."forecastQuantity" END) AS "week1",
    MAX(CASE WHEN df."periodId" = periods[2] THEN df."forecastQuantity" END) AS "week2",
    MAX(CASE WHEN df."periodId" = periods[3] THEN df."forecastQuantity" END) AS "week3",
    MAX(CASE WHEN df."periodId" = periods[4] THEN df."forecastQuantity" END) AS "week4",
    MAX(CASE WHEN df."periodId" = periods[5] THEN df."forecastQuantity" END) AS "week5",
    MAX(CASE WHEN df."periodId" = periods[6] THEN df."forecastQuantity" END) AS "week6",
    MAX(CASE WHEN df."periodId" = periods[7] THEN df."forecastQuantity" END) AS "week7",
    MAX(CASE WHEN df."periodId" = periods[8] THEN df."forecastQuantity" END) AS "week8",
    MAX(CASE WHEN df."periodId" = periods[9] THEN df."forecastQuantity" END) AS "week9",
    MAX(CASE WHEN df."periodId" = periods[10] THEN df."forecastQuantity" END) AS "week10",
    MAX(CASE WHEN df."periodId" = periods[11] THEN df."forecastQuantity" END) AS "week11",
    MAX(CASE WHEN df."periodId" = periods[12] THEN df."forecastQuantity" END) AS "week12",
    MAX(CASE WHEN df."periodId" = periods[13] THEN df."forecastQuantity" END) AS "week13",
    MAX(CASE WHEN df."periodId" = periods[14] THEN df."forecastQuantity" END) AS "week14",
    MAX(CASE WHEN df."periodId" = periods[15] THEN df."forecastQuantity" END) AS "week15",
    MAX(CASE WHEN df."periodId" = periods[16] THEN df."forecastQuantity" END) AS "week16",
    MAX(CASE WHEN df."periodId" = periods[17] THEN df."forecastQuantity" END) AS "week17",
    MAX(CASE WHEN df."periodId" = periods[18] THEN df."forecastQuantity" END) AS "week18",
    MAX(CASE WHEN df."periodId" = periods[19] THEN df."forecastQuantity" END) AS "week19",
    MAX(CASE WHEN df."periodId" = periods[20] THEN df."forecastQuantity" END) AS "week20",
    MAX(CASE WHEN df."periodId" = periods[21] THEN df."forecastQuantity" END) AS "week21",
    MAX(CASE WHEN df."periodId" = periods[22] THEN df."forecastQuantity" END) AS "week22",
    MAX(CASE WHEN df."periodId" = periods[23] THEN df."forecastQuantity" END) AS "week23",
    MAX(CASE WHEN df."periodId" = periods[24] THEN df."forecastQuantity" END) AS "week24",
    MAX(CASE WHEN df."periodId" = periods[25] THEN df."forecastQuantity" END) AS "week25",
    MAX(CASE WHEN df."periodId" = periods[26] THEN df."forecastQuantity" END) AS "week26",
    MAX(CASE WHEN df."periodId" = periods[27] THEN df."forecastQuantity" END) AS "week27",
    MAX(CASE WHEN df."periodId" = periods[28] THEN df."forecastQuantity" END) AS "week28",
    MAX(CASE WHEN df."periodId" = periods[29] THEN df."forecastQuantity" END) AS "week29",
    MAX(CASE WHEN df."periodId" = periods[30] THEN df."forecastQuantity" END) AS "week30",
    MAX(CASE WHEN df."periodId" = periods[31] THEN df."forecastQuantity" END) AS "week31",
    MAX(CASE WHEN df."periodId" = periods[32] THEN df."forecastQuantity" END) AS "week32",
    MAX(CASE WHEN df."periodId" = periods[33] THEN df."forecastQuantity" END) AS "week33",
    MAX(CASE WHEN df."periodId" = periods[34] THEN df."forecastQuantity" END) AS "week34",
    MAX(CASE WHEN df."periodId" = periods[35] THEN df."forecastQuantity" END) AS "week35",
    MAX(CASE WHEN df."periodId" = periods[36] THEN df."forecastQuantity" END) AS "week36",
    MAX(CASE WHEN df."periodId" = periods[37] THEN df."forecastQuantity" END) AS "week37",
    MAX(CASE WHEN df."periodId" = periods[38] THEN df."forecastQuantity" END) AS "week38",
    MAX(CASE WHEN df."periodId" = periods[39] THEN df."forecastQuantity" END) AS "week39",
    MAX(CASE WHEN df."periodId" = periods[40] THEN df."forecastQuantity" END) AS "week40",
    MAX(CASE WHEN df."periodId" = periods[41] THEN df."forecastQuantity" END) AS "week41",
    MAX(CASE WHEN df."periodId" = periods[42] THEN df."forecastQuantity" END) AS "week42",
    MAX(CASE WHEN df."periodId" = periods[43] THEN df."forecastQuantity" END) AS "week43",
    MAX(CASE WHEN df."periodId" = periods[44] THEN df."forecastQuantity" END) AS "week44",
    MAX(CASE WHEN df."periodId" = periods[45] THEN df."forecastQuantity" END) AS "week45",
    MAX(CASE WHEN df."periodId" = periods[46] THEN df."forecastQuantity" END) AS "week46",
    MAX(CASE WHEN df."periodId" = periods[47] THEN df."forecastQuantity" END) AS "week47",
    MAX(CASE WHEN df."periodId" = periods[48] THEN df."forecastQuantity" END) AS "week48",
    MAX(CASE WHEN df."periodId" = periods[49] THEN df."forecastQuantity" END) AS "week49",
    MAX(CASE WHEN df."periodId" = periods[50] THEN df."forecastQuantity" END) AS "week50",
    MAX(CASE WHEN df."periodId" = periods[51] THEN df."forecastQuantity" END) AS "week51",
    MAX(CASE WHEN df."periodId" = periods[52] THEN df."forecastQuantity" END) AS "week52"
  FROM "item" i
  INNER JOIN "itemReplenishment" ir ON i."id" = ir."itemId"
  INNER JOIN "itemPlanning" ip ON i."id" = ip."itemId" AND ip."locationId" = location_id
  LEFT JOIN "modelUpload" mu ON mu."id" = i."modelUploadId"
  INNER JOIN "demandProjection" df ON df."itemId" = i."id" 
    AND df."companyId" = company_id 
    AND df."locationId" = location_id
    AND df."periodId" = ANY(periods)
  WHERE i."companyId" = company_id
    AND i."replenishmentSystem" = 'Make'
    AND i."itemTrackingType" != 'Non-Inventory'
    AND i."active" = TRUE
  GROUP BY
    i."id",
    i."readableIdWithRevision",
    i."name",
    i."active",
    i."type",
    i."itemTrackingType",
    i."replenishmentSystem",
    i."thumbnailPath",
    mu."thumbnailPath",
    i."unitOfMeasureCode",
    ir."leadTime",
    ir."manufacturingBlocked",
    ir."lotSize",
    ip."reorderingPolicy",
    ip."demandAccumulationPeriod",
    ip."demandAccumulationSafetyStock",
    ip."reorderPoint",
    ip."reorderQuantity",
    ip."minimumOrderQuantity",
    ip."maximumOrderQuantity",
    ip."orderMultiple",
    ip."maximumInventoryQuantity";
$$ LANGUAGE sql SECURITY DEFINER;