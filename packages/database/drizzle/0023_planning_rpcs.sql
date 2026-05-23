CREATE OR REPLACE FUNCTION calculate_quantity_to_order(
  p_reordering_policy "itemReorderingPolicy",
  p_reorder_point numeric,
  p_reorder_quantity numeric,
  p_minimum_order_quantity numeric,
  p_maximum_order_quantity numeric,
  p_order_multiple numeric,
  p_lot_size numeric,
  p_maximum_inventory_quantity numeric,
  p_demand_accumulation_period numeric,
  p_demand_accumulation_safety_stock numeric,
  p_projections numeric[]
)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  ordered_quantity numeric := 0;
  num_periods integer;
  projected_stock numeric;
  projected_quantity numeric;
  remaining_needed numeric;
  total_order_qty numeric;
  order_qty numeric;
  required_qty numeric;
  i integer;
  j integer;
  iterations integer;
  demand_period integer;
BEGIN
  num_periods := COALESCE(array_length(p_projections, 1), 0);
  IF num_periods = 0 THEN
    RETURN 0;
  END IF;

  demand_period := GREATEST(COALESCE(p_demand_accumulation_period, 1), 1)::integer;

  CASE p_reordering_policy
    WHEN 'Manual Reorder' THEN
      RETURN 0;
    WHEN 'Demand-Based Reorder' THEN
      i := 1;
      WHILE i <= num_periods LOOP
        projected_stock := 0;
        j := i;
        WHILE j <= LEAST(i + demand_period - 1, num_periods) LOOP
          projected_stock := COALESCE(p_projections[j], 0) + ordered_quantity;
          j := j + 1;
        END LOOP;

        IF projected_stock < COALESCE(p_demand_accumulation_safety_stock, 0) THEN
          total_order_qty := COALESCE(p_demand_accumulation_safety_stock, 0) - projected_stock;

          IF COALESCE(p_maximum_order_quantity, 0) > 0 THEN
            total_order_qty := LEAST(total_order_qty, p_maximum_order_quantity);
          END IF;

          total_order_qty := GREATEST(total_order_qty, COALESCE(p_minimum_order_quantity, 0));

          IF COALESCE(p_order_multiple, 0) > 0 THEN
            total_order_qty := CEIL(total_order_qty / p_order_multiple) * p_order_multiple;
          END IF;

          ordered_quantity := ordered_quantity + total_order_qty;
        END IF;

        i := i + demand_period;
      END LOOP;
      RETURN ordered_quantity;
    WHEN 'Fixed Reorder Quantity' THEN
      FOR i IN 1..num_periods LOOP
        projected_quantity := COALESCE(p_projections[i], 0);
        remaining_needed := COALESCE(p_reorder_point, 0) - (projected_quantity + ordered_quantity);
        iterations := 0;
        WHILE remaining_needed > 0 AND iterations < 5 LOOP
          IF COALESCE(p_reorder_quantity, 0) > 0 THEN
            order_qty := p_reorder_quantity;
          ELSE
            order_qty := COALESCE(p_reorder_point, 0);
          END IF;

          ordered_quantity := ordered_quantity + order_qty;
          remaining_needed := COALESCE(p_reorder_point, 0) - (projected_quantity + ordered_quantity);
          iterations := iterations + 1;
        END LOOP;
      END LOOP;
      RETURN ordered_quantity;
    WHEN 'Maximum Quantity' THEN
      FOR i IN 1..num_periods LOOP
        projected_quantity := COALESCE(p_projections[i], 0);
        remaining_needed := COALESCE(p_reorder_point, 0) - (projected_quantity + ordered_quantity);
        iterations := 0;
        WHILE remaining_needed > 0 AND iterations < 5 LOOP
          required_qty := COALESCE(p_maximum_inventory_quantity, 0) - (projected_quantity + ordered_quantity);

          IF COALESCE(p_reorder_quantity, 0) > 0 THEN
            order_qty := GREATEST(COALESCE(p_minimum_order_quantity, 0), required_qty);
          ELSE
            order_qty := COALESCE(p_reorder_point, 0);
          END IF;

          IF order_qty <= 0 THEN
            EXIT;
          END IF;

          IF COALESCE(p_order_multiple, 0) > 1 THEN
            order_qty := CEIL(order_qty / p_order_multiple) * p_order_multiple;
          END IF;

          IF COALESCE(p_lot_size, 0) > 0 THEN
            order_qty := CEIL(order_qty / p_lot_size) * p_lot_size;
          END IF;

          IF COALESCE(p_maximum_order_quantity, 0) > 0 THEN
            order_qty := LEAST(order_qty, p_maximum_order_quantity);
          END IF;

          ordered_quantity := ordered_quantity + order_qty;
          remaining_needed := COALESCE(p_reorder_point, 0) - (projected_quantity + ordered_quantity);
          iterations := iterations + 1;
        END LOOP;
      END LOOP;
      RETURN ordered_quantity;
    ELSE
      RETURN 0;
  END CASE;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION planning_projection_rows(
  company_id text,
  location_id text,
  periods text[],
  replenishment_system "itemReplenishmentSystem"
)
RETURNS TABLE (
  "id" text,
  "readableIdWithRevision" text,
  "name" text,
  "active" boolean,
  "type" "itemType",
  "itemTrackingType" "itemTrackingType",
  "replenishmentSystem" "itemReplenishmentSystem",
  "thumbnailPath" text,
  "unitOfMeasureCode" text,
  "leadTime" integer,
  "manufacturingBlocked" boolean,
  "purchasingBlocked" boolean,
  "lotSize" integer,
  "reorderingPolicy" "itemReorderingPolicy",
  "demandAccumulationPeriod" integer,
  "demandAccumulationSafetyStock" numeric,
  "reorderPoint" integer,
  "reorderQuantity" integer,
  "minimumOrderQuantity" integer,
  "maximumOrderQuantity" integer,
  "orderMultiple" integer,
  "quantityOnHand" numeric,
  "maximumInventoryQuantity" numeric,
  "suppliers" jsonb,
  "preferredSupplierId" text,
  "purchasingUnitOfMeasureCode" text,
  "conversionFactor" numeric,
  "quantityToOrder" numeric,
  "projections" numeric[]
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  WITH RECURSIVE
  supply_data AS (
    SELECT
      "itemId",
      "periodId",
      SUM(COALESCE("actualQuantity", 0) + COALESCE("forecastQuantity", 0)) AS "supply"
    FROM (
      SELECT "itemId", "periodId", "actualQuantity", NULL::numeric AS "forecastQuantity"
      FROM "supplyActual"
      WHERE "companyId" = company_id
        AND "locationId" = location_id
        AND "periodId" = ANY(periods)
      UNION ALL
      SELECT "itemId", "periodId", NULL::numeric AS "actualQuantity", "forecastQuantity"
      FROM "supplyForecast"
      WHERE "companyId" = company_id
        AND "locationId" = location_id
        AND "periodId" = ANY(periods)
    ) combined
    GROUP BY "itemId", "periodId"
  ),
  demand_data AS (
    SELECT
      "itemId",
      "periodId",
      SUM(COALESCE("actualQuantity", 0) + COALESCE("forecastQuantity", 0)) AS "demand"
    FROM (
      SELECT "itemId", "periodId", "actualQuantity", NULL::numeric AS "forecastQuantity"
      FROM "demandActual"
      WHERE "companyId" = company_id
        AND "locationId" = location_id
        AND "periodId" = ANY(periods)
      UNION ALL
      SELECT "itemId", "periodId", NULL::numeric AS "actualQuantity", "forecastQuantity"
      FROM "demandForecast"
      WHERE "companyId" = company_id
        AND "locationId" = location_id
        AND "periodId" = ANY(periods)
    ) combined
    GROUP BY "itemId", "periodId"
  ),
  supplier_data AS (
    SELECT
      ps."itemId",
      jsonb_agg(
        jsonb_build_object(
          'id', ps."id",
          'minimumOrderQuantity', ps."minimumOrderQuantity",
          'supplierUnitOfMeasureCode', ps."supplierUnitOfMeasureCode",
          'conversionFactor', ps."conversionFactor",
          'unitPrice', ps."unitPrice",
          'supplierId', ps."supplierId",
          'supplierPartId', ps."supplierPartId"
        )
      ) AS "suppliers"
    FROM "supplierPart" ps
    WHERE ps."companyId" = company_id
      AND ps.active = true
    GROUP BY ps."itemId"
  ),
  base_items AS (
    SELECT DISTINCT ON (i."id")
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
      ir."leadTime"::integer,
      ir."manufacturingBlocked",
      ir."purchasingBlocked",
      ir."lotSize"::integer,
      ip."reorderingPolicy",
      ip."demandAccumulationPeriod"::integer,
      ip."demandAccumulationSafetyStock",
      ip."reorderPoint"::integer,
      ip."reorderQuantity"::integer,
      ip."minimumOrderQuantity"::integer,
      ip."maximumOrderQuantity"::integer,
      ip."orderMultiple"::integer,
      COALESCE((
        SELECT SUM("quantity")
        FROM "itemLedger"
        WHERE "companyId" = company_id
          AND "locationId" = location_id
          AND "itemId" = i."id"
      ), 0) AS "quantityOnHand",
      ip."maximumInventoryQuantity",
      COALESCE(sd."suppliers", '[]'::jsonb) AS "suppliers",
      ir."preferredSupplierId",
      ir."purchasingUnitOfMeasureCode",
      ir."conversionFactor"
    FROM "item" i
    JOIN "itemReplenishment" ir
      ON i."id" = ir."itemId"
      AND ir."companyId" = company_id
    JOIN "itemPlanning" ip
      ON i."id" = ip."itemId"
      AND ip."companyId" = company_id
      AND ip."locationId" = location_id
    LEFT JOIN "modelUpload" mu
      ON mu."id" = i."modelUploadId"
      AND mu."companyId" = company_id
    LEFT JOIN supplier_data sd ON sd."itemId" = i."id"
    WHERE i."companyId" = company_id
      AND i."replenishmentSystem" = replenishment_system
      AND i."itemTrackingType" != 'Non-Inventory'
      AND i."active" = true
      AND (
        EXISTS (SELECT 1 FROM demand_data d WHERE d."itemId" = i."id")
        OR (
          ip."reorderPoint" > 0
          AND ip."reorderingPolicy" IN ('Fixed Reorder Quantity', 'Maximum Quantity')
        )
      )
  ),
  projections AS (
    SELECT
      bi.*,
      periods[1] AS "periodId",
      bi."quantityOnHand" + COALESCE(s."supply", 0) - COALESCE(d."demand", 0) AS "projection",
      1 AS period_index
    FROM base_items bi
    LEFT JOIN supply_data s ON bi."id" = s."itemId" AND s."periodId" = periods[1]
    LEFT JOIN demand_data d ON bi."id" = d."itemId" AND d."periodId" = periods[1]
    WHERE COALESCE(array_length(periods, 1), 0) > 0
    UNION ALL
    SELECT
      p."id",
      p."readableIdWithRevision",
      p."name",
      p."active",
      p."type",
      p."itemTrackingType",
      p."replenishmentSystem",
      p."thumbnailPath",
      p."unitOfMeasureCode",
      p."leadTime",
      p."manufacturingBlocked",
      p."purchasingBlocked",
      p."lotSize",
      p."reorderingPolicy",
      p."demandAccumulationPeriod",
      p."demandAccumulationSafetyStock",
      p."reorderPoint",
      p."reorderQuantity",
      p."minimumOrderQuantity",
      p."maximumOrderQuantity",
      p."orderMultiple",
      p."quantityOnHand",
      p."maximumInventoryQuantity",
      p."suppliers",
      p."preferredSupplierId",
      p."purchasingUnitOfMeasureCode",
      p."conversionFactor",
      periods[p.period_index + 1] AS "periodId",
      p."projection" + COALESCE(s."supply", 0) - COALESCE(d."demand", 0) AS "projection",
      p.period_index + 1 AS period_index
    FROM projections p
    LEFT JOIN supply_data s ON p."id" = s."itemId" AND s."periodId" = periods[p.period_index + 1]
    LEFT JOIN demand_data d ON p."id" = d."itemId" AND d."periodId" = periods[p.period_index + 1]
    WHERE p.period_index < array_length(periods, 1)
  ),
  projected_arrays AS (
    SELECT
      p."id",
      array_agg(p."projection" ORDER BY p.period_index) AS "projections"
    FROM projections p
    GROUP BY p."id"
  )
  SELECT
    bi."id",
    bi."readableIdWithRevision",
    bi."name",
    bi."active",
    bi."type",
    bi."itemTrackingType",
    bi."replenishmentSystem",
    bi."thumbnailPath",
    bi."unitOfMeasureCode",
    bi."leadTime",
    bi."manufacturingBlocked",
    bi."purchasingBlocked",
    bi."lotSize",
    bi."reorderingPolicy",
    bi."demandAccumulationPeriod",
    bi."demandAccumulationSafetyStock",
    bi."reorderPoint",
    bi."reorderQuantity",
    bi."minimumOrderQuantity",
    bi."maximumOrderQuantity",
    bi."orderMultiple",
    bi."quantityOnHand",
    bi."maximumInventoryQuantity",
    bi."suppliers",
    bi."preferredSupplierId",
    bi."purchasingUnitOfMeasureCode",
    bi."conversionFactor",
    calculate_quantity_to_order(
      bi."reorderingPolicy",
      bi."reorderPoint",
      bi."reorderQuantity",
      bi."minimumOrderQuantity",
      bi."maximumOrderQuantity",
      bi."orderMultiple",
      bi."lotSize",
      bi."maximumInventoryQuantity",
      bi."demandAccumulationPeriod",
      bi."demandAccumulationSafetyStock",
      COALESCE(pa."projections", ARRAY[]::numeric[])
    ) AS "quantityToOrder",
    COALESCE(pa."projections", ARRAY[]::numeric[]) AS "projections"
  FROM base_items bi
  LEFT JOIN projected_arrays pa ON pa."id" = bi."id";
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_purchasing_planning(
  company_id text,
  location_id text,
  periods text[]
)
RETURNS TABLE (
  "id" text,
  "readableIdWithRevision" text,
  "name" text,
  "active" boolean,
  "type" "itemType",
  "itemTrackingType" "itemTrackingType",
  "replenishmentSystem" "itemReplenishmentSystem",
  "thumbnailPath" text,
  "unitOfMeasureCode" text,
  "leadTime" integer,
  "purchasingBlocked" boolean,
  "lotSize" integer,
  "reorderingPolicy" "itemReorderingPolicy",
  "demandAccumulationPeriod" integer,
  "demandAccumulationSafetyStock" numeric,
  "reorderPoint" integer,
  "reorderQuantity" integer,
  "minimumOrderQuantity" integer,
  "maximumOrderQuantity" integer,
  "orderMultiple" integer,
  "quantityOnHand" numeric,
  "maximumInventoryQuantity" numeric,
  "suppliers" jsonb,
  "preferredSupplierId" text,
  "purchasingUnitOfMeasureCode" text,
  "conversionFactor" numeric,
  "quantityToOrder" numeric,
  "week1" numeric,
  "week2" numeric,
  "week3" numeric,
  "week4" numeric,
  "week5" numeric,
  "week6" numeric,
  "week7" numeric,
  "week8" numeric,
  "week9" numeric,
  "week10" numeric,
  "week11" numeric,
  "week12" numeric,
  "week13" numeric,
  "week14" numeric,
  "week15" numeric,
  "week16" numeric,
  "week17" numeric,
  "week18" numeric,
  "week19" numeric,
  "week20" numeric,
  "week21" numeric,
  "week22" numeric,
  "week23" numeric,
  "week24" numeric,
  "week25" numeric,
  "week26" numeric,
  "week27" numeric,
  "week28" numeric,
  "week29" numeric,
  "week30" numeric,
  "week31" numeric,
  "week32" numeric,
  "week33" numeric,
  "week34" numeric,
  "week35" numeric,
  "week36" numeric,
  "week37" numeric,
  "week38" numeric,
  "week39" numeric,
  "week40" numeric,
  "week41" numeric,
  "week42" numeric,
  "week43" numeric,
  "week44" numeric,
  "week45" numeric,
  "week46" numeric,
  "week47" numeric,
  "week48" numeric,
  "week49" numeric,
  "week50" numeric,
  "week51" numeric,
  "week52" numeric
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p."id", p."readableIdWithRevision", p."name", p."active", p."type",
    p."itemTrackingType", p."replenishmentSystem", p."thumbnailPath",
    p."unitOfMeasureCode", p."leadTime", p."purchasingBlocked", p."lotSize",
    p."reorderingPolicy", p."demandAccumulationPeriod", p."demandAccumulationSafetyStock",
    p."reorderPoint", p."reorderQuantity", p."minimumOrderQuantity",
    p."maximumOrderQuantity", p."orderMultiple", p."quantityOnHand",
    p."maximumInventoryQuantity", p."suppliers", p."preferredSupplierId",
    p."purchasingUnitOfMeasureCode", p."conversionFactor", p."quantityToOrder",
    p."projections"[1], p."projections"[2], p."projections"[3], p."projections"[4],
    p."projections"[5], p."projections"[6], p."projections"[7], p."projections"[8],
    p."projections"[9], p."projections"[10], p."projections"[11], p."projections"[12],
    p."projections"[13], p."projections"[14], p."projections"[15], p."projections"[16],
    p."projections"[17], p."projections"[18], p."projections"[19], p."projections"[20],
    p."projections"[21], p."projections"[22], p."projections"[23], p."projections"[24],
    p."projections"[25], p."projections"[26], p."projections"[27], p."projections"[28],
    p."projections"[29], p."projections"[30], p."projections"[31], p."projections"[32],
    p."projections"[33], p."projections"[34], p."projections"[35], p."projections"[36],
    p."projections"[37], p."projections"[38], p."projections"[39], p."projections"[40],
    p."projections"[41], p."projections"[42], p."projections"[43], p."projections"[44],
    p."projections"[45], p."projections"[46], p."projections"[47], p."projections"[48],
    p."projections"[49], p."projections"[50], p."projections"[51], p."projections"[52]
  FROM planning_projection_rows(company_id, location_id, periods, 'Buy') p;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_production_planning(
  company_id text,
  location_id text,
  periods text[]
)
RETURNS TABLE (
  "id" text,
  "readableIdWithRevision" text,
  "name" text,
  "active" boolean,
  "type" "itemType",
  "itemTrackingType" "itemTrackingType",
  "replenishmentSystem" "itemReplenishmentSystem",
  "thumbnailPath" text,
  "unitOfMeasureCode" text,
  "leadTime" integer,
  "manufacturingBlocked" boolean,
  "lotSize" integer,
  "reorderingPolicy" "itemReorderingPolicy",
  "demandAccumulationPeriod" integer,
  "demandAccumulationSafetyStock" numeric,
  "reorderPoint" integer,
  "reorderQuantity" integer,
  "minimumOrderQuantity" integer,
  "maximumOrderQuantity" integer,
  "orderMultiple" integer,
  "quantityOnHand" numeric,
  "maximumInventoryQuantity" numeric,
  "quantityToOrder" numeric,
  "week1" numeric,
  "week2" numeric,
  "week3" numeric,
  "week4" numeric,
  "week5" numeric,
  "week6" numeric,
  "week7" numeric,
  "week8" numeric,
  "week9" numeric,
  "week10" numeric,
  "week11" numeric,
  "week12" numeric,
  "week13" numeric,
  "week14" numeric,
  "week15" numeric,
  "week16" numeric,
  "week17" numeric,
  "week18" numeric,
  "week19" numeric,
  "week20" numeric,
  "week21" numeric,
  "week22" numeric,
  "week23" numeric,
  "week24" numeric,
  "week25" numeric,
  "week26" numeric,
  "week27" numeric,
  "week28" numeric,
  "week29" numeric,
  "week30" numeric,
  "week31" numeric,
  "week32" numeric,
  "week33" numeric,
  "week34" numeric,
  "week35" numeric,
  "week36" numeric,
  "week37" numeric,
  "week38" numeric,
  "week39" numeric,
  "week40" numeric,
  "week41" numeric,
  "week42" numeric,
  "week43" numeric,
  "week44" numeric,
  "week45" numeric,
  "week46" numeric,
  "week47" numeric,
  "week48" numeric,
  "week49" numeric,
  "week50" numeric,
  "week51" numeric,
  "week52" numeric
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p."id", p."readableIdWithRevision", p."name", p."active", p."type",
    p."itemTrackingType", p."replenishmentSystem", p."thumbnailPath",
    p."unitOfMeasureCode", p."leadTime", p."manufacturingBlocked", p."lotSize",
    p."reorderingPolicy", p."demandAccumulationPeriod", p."demandAccumulationSafetyStock",
    p."reorderPoint", p."reorderQuantity", p."minimumOrderQuantity",
    p."maximumOrderQuantity", p."orderMultiple", p."quantityOnHand",
    p."maximumInventoryQuantity", p."quantityToOrder",
    p."projections"[1], p."projections"[2], p."projections"[3], p."projections"[4],
    p."projections"[5], p."projections"[6], p."projections"[7], p."projections"[8],
    p."projections"[9], p."projections"[10], p."projections"[11], p."projections"[12],
    p."projections"[13], p."projections"[14], p."projections"[15], p."projections"[16],
    p."projections"[17], p."projections"[18], p."projections"[19], p."projections"[20],
    p."projections"[21], p."projections"[22], p."projections"[23], p."projections"[24],
    p."projections"[25], p."projections"[26], p."projections"[27], p."projections"[28],
    p."projections"[29], p."projections"[30], p."projections"[31], p."projections"[32],
    p."projections"[33], p."projections"[34], p."projections"[35], p."projections"[36],
    p."projections"[37], p."projections"[38], p."projections"[39], p."projections"[40],
    p."projections"[41], p."projections"[42], p."projections"[43], p."projections"[44],
    p."projections"[45], p."projections"[46], p."projections"[47], p."projections"[48],
    p."projections"[49], p."projections"[50], p."projections"[51], p."projections"[52]
  FROM planning_projection_rows(company_id, location_id, periods, 'Make') p;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_production_projections(
  company_id text,
  location_id text,
  periods text[]
)
RETURNS TABLE (
  "id" text,
  "readableIdWithRevision" text,
  "name" text,
  "active" boolean,
  "type" "itemType",
  "itemTrackingType" "itemTrackingType",
  "replenishmentSystem" "itemReplenishmentSystem",
  "thumbnailPath" text,
  "unitOfMeasureCode" text,
  "leadTime" integer,
  "manufacturingBlocked" boolean,
  "lotSize" integer,
  "reorderingPolicy" "itemReorderingPolicy",
  "demandAccumulationPeriod" integer,
  "demandAccumulationSafetyStock" numeric,
  "reorderPoint" integer,
  "reorderQuantity" integer,
  "minimumOrderQuantity" integer,
  "maximumOrderQuantity" integer,
  "orderMultiple" integer,
  "quantityOnHand" numeric,
  "maximumInventoryQuantity" numeric,
  "week1" numeric,
  "week2" numeric,
  "week3" numeric,
  "week4" numeric,
  "week5" numeric,
  "week6" numeric,
  "week7" numeric,
  "week8" numeric,
  "week9" numeric,
  "week10" numeric,
  "week11" numeric,
  "week12" numeric,
  "week13" numeric,
  "week14" numeric,
  "week15" numeric,
  "week16" numeric,
  "week17" numeric,
  "week18" numeric,
  "week19" numeric,
  "week20" numeric,
  "week21" numeric,
  "week22" numeric,
  "week23" numeric,
  "week24" numeric,
  "week25" numeric,
  "week26" numeric,
  "week27" numeric,
  "week28" numeric,
  "week29" numeric,
  "week30" numeric,
  "week31" numeric,
  "week32" numeric,
  "week33" numeric,
  "week34" numeric,
  "week35" numeric,
  "week36" numeric,
  "week37" numeric,
  "week38" numeric,
  "week39" numeric,
  "week40" numeric,
  "week41" numeric,
  "week42" numeric,
  "week43" numeric,
  "week44" numeric,
  "week45" numeric,
  "week46" numeric,
  "week47" numeric,
  "week48" numeric,
  "week49" numeric,
  "week50" numeric,
  "week51" numeric,
  "week52" numeric
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p."id", p."readableIdWithRevision", p."name", p."active", p."type",
    p."itemTrackingType", p."replenishmentSystem", p."thumbnailPath",
    p."unitOfMeasureCode", p."leadTime", p."manufacturingBlocked", p."lotSize",
    p."reorderingPolicy", p."demandAccumulationPeriod", p."demandAccumulationSafetyStock",
    p."reorderPoint", p."reorderQuantity", p."minimumOrderQuantity",
    p."maximumOrderQuantity", p."orderMultiple", p."quantityOnHand",
    p."maximumInventoryQuantity",
    p."projections"[1], p."projections"[2], p."projections"[3], p."projections"[4],
    p."projections"[5], p."projections"[6], p."projections"[7], p."projections"[8],
    p."projections"[9], p."projections"[10], p."projections"[11], p."projections"[12],
    p."projections"[13], p."projections"[14], p."projections"[15], p."projections"[16],
    p."projections"[17], p."projections"[18], p."projections"[19], p."projections"[20],
    p."projections"[21], p."projections"[22], p."projections"[23], p."projections"[24],
    p."projections"[25], p."projections"[26], p."projections"[27], p."projections"[28],
    p."projections"[29], p."projections"[30], p."projections"[31], p."projections"[32],
    p."projections"[33], p."projections"[34], p."projections"[35], p."projections"[36],
    p."projections"[37], p."projections"[38], p."projections"[39], p."projections"[40],
    p."projections"[41], p."projections"[42], p."projections"[43], p."projections"[44],
    p."projections"[45], p."projections"[46], p."projections"[47], p."projections"[48],
    p."projections"[49], p."projections"[50], p."projections"[51], p."projections"[52]
  FROM planning_projection_rows(company_id, location_id, periods, 'Make') p;
$$;
