import { nanoid } from "nanoid";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";
import { getPostgresConnectionPool } from "./postgres.ts";

const WEEKS_TO_FORECAST = 18 * 4;
const KEY_SEPARATOR = "\u001f";

export const mrpArgsValidator = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("company"),
    id: z.string(),
    companyId: z.string(),
    userId: z.string()
  }),
  z.object({
    type: z.literal("location"),
    id: z.string(),
    companyId: z.string(),
    userId: z.string()
  }),
  z.object({
    type: z.literal("item"),
    id: z.string(),
    companyId: z.string(),
    userId: z.string()
  }),
  z.object({
    type: z.literal("job"),
    id: z.string(),
    companyId: z.string(),
    userId: z.string()
  }),
  z.object({
    type: z.literal("purchaseOrder"),
    id: z.string(),
    companyId: z.string(),
    userId: z.string()
  }),
  z.object({
    type: z.literal("salesOrder"),
    id: z.string(),
    companyId: z.string(),
    userId: z.string()
  })
]);

type MrpArgs = z.infer<typeof mrpArgsValidator>;
type MethodType = "Purchase to Order" | "Pull from Inventory" | "Make to Order";
type ReplenishmentSystem = "Buy" | "Make" | "Buy and Make";
type PeriodType = "Week" | "Day" | "Month";

type DemandPeriod = {
  id: string;
  startDate: string;
  endDate: string;
  periodType: PeriodType;
};

type BomChild = {
  itemId: string;
  quantity: number;
  methodType: MethodType;
};

type LocationRow = {
  id: string;
};

type ItemRow = {
  id: string;
  replenishmentSystem: ReplenishmentSystem;
};

type ItemReplenishmentRow = {
  itemId: string;
  leadTime: string | number | null;
};

type InventoryRow = {
  itemId: string | null;
  locationId: string | null;
  quantityOnHand: string | number | null;
};

type ActiveMakeMethodRow = {
  id: string;
  itemId: string;
};

type MethodMaterialRow = {
  id: string;
  makeMethodId: string;
  materialMakeMethodId: string | null;
  itemId: string;
  quantity: string | number;
  methodType: MethodType;
};

type SalesOrderLineRow = {
  itemId: string | null;
  quantityToSend: string | number | null;
  promisedDate: Date | string | null;
  locationId: string | null;
};

type JobMaterialLineRow = {
  itemId: string | null;
  quantityToIssue: string | number | null;
  dueDate: Date | string | null;
  leadTime: string | number | null;
  locationId: string | null;
};

type ProductionLineRow = {
  itemId: string | null;
  quantityToReceive: string | number | null;
  dueDate: Date | string | null;
  deadlineType: string | null;
  locationId: string | null;
};

type PurchaseOrderLineRow = {
  itemId: string | null;
  quantityToReceive: string | number | null;
  promisedDate: Date | string | null;
  orderDate: Date | string | null;
  leadTime: string | number | null;
  locationId: string | null;
};

type DemandProjectionRow = {
  itemId: string | null;
  locationId: string | null;
  periodId: string;
  forecastQuantity: string | number | null;
};

type DemandActualRow = {
  itemId: string;
  locationId: string;
  periodId: string;
  sourceType: "Sales Order" | "Job Material";
};

type SupplyActualRow = {
  itemId: string;
  locationId: string;
  periodId: string;
  sourceType: "Purchase Order" | "Production Order";
};

type DemandForecastInsert = {
  itemId: string;
  locationId: string;
  periodId: string;
  forecastQuantity: number;
  forecastMethod: string;
  companyId: string;
  createdBy: string;
  updatedBy: string;
};

type DemandActualInsert = {
  itemId: string;
  locationId: string;
  periodId: string;
  actualQuantity: number;
  sourceType: "Sales Order" | "Job Material";
  companyId: string;
  createdBy: string;
  updatedBy: string;
};

type SupplyActualInsert = {
  itemId: string;
  locationId: string;
  periodId: string;
  actualQuantity: number;
  sourceType: "Purchase Order" | "Production Order";
  companyId: string;
  createdBy: string;
  updatedBy: string;
};

let mrpPool: Pool | null = null;

export async function runMrp(args: MrpArgs) {
  if (!args.companyId) throw new Error("Payload is missing companyId");
  if (!args.userId) throw new Error("Payload is missing userId");

  const pool = getMrpPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [
      args.userId
    ]);
    await calculateMrp(client, args);
    await client.query("COMMIT");
    return { success: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function closeMrpPool() {
  if (!mrpPool) return;
  await mrpPool.end();
  mrpPool = null;
}

function getMrpPool() {
  mrpPool ??= getPostgresConnectionPool(
    Number(process.env.DATABASE_SERVICE_POOL_SIZE ?? 5),
    { kind: "service" }
  );
  return mrpPool;
}

async function calculateMrp(client: PoolClient, args: MrpArgs) {
  const today = todayString();
  const ranges = getStartAndEndDates(today, "Week");
  const periods = await getOrCreateDemandPeriods(client, ranges, "Week");
  const periodIds = periods.map((period) => period.id);
  const companyId = args.companyId;
  const userId = args.userId;

  const locations = await queryMany<LocationRow>(
    client,
    `SELECT id FROM "location" WHERE "companyId" = $1`,
    [companyId]
  );

  const salesOrderLines = await queryMany<SalesOrderLineRow>(
    client,
    `SELECT "itemId", "quantityToSend", "promisedDate", "locationId"
     FROM "openSalesOrderLines"
     WHERE "companyId" = $1`,
    [companyId]
  );
  const jobMaterialLines = await queryMany<JobMaterialLineRow>(
    client,
    `SELECT "itemId", "quantityToIssue", "dueDate", "leadTime", "locationId"
     FROM "openJobMaterialLines"
     WHERE "companyId" = $1`,
    [companyId]
  );
  const productionLines = await queryMany<ProductionLineRow>(
    client,
    `SELECT "itemId", "quantityToReceive", "dueDate", "deadlineType",
            "locationId"
     FROM "openProductionOrders"
     WHERE "companyId" = $1`,
    [companyId]
  );
  const purchaseOrderLines = await queryMany<PurchaseOrderLineRow>(
    client,
    `SELECT "itemId", "quantityToReceive", "promisedDate", "orderDate",
            "leadTime", "locationId"
     FROM "openPurchaseOrderLines"
     WHERE "companyId" = $1`,
    [companyId]
  );
  const demandProjections = await queryMany<DemandProjectionRow>(
    client,
    `SELECT "itemId", "locationId", "periodId", "forecastQuantity"
     FROM "demandProjection"
     WHERE "companyId" = $1
       AND "periodId" = ANY($2::text[])`,
    [companyId, periodIds]
  );
  const allItems = await queryMany<ItemRow>(
    client,
    `SELECT id, "replenishmentSystem"
     FROM "item"
     WHERE "companyId" = $1`,
    [companyId]
  );
  const allReplenishments = await queryMany<ItemReplenishmentRow>(
    client,
    `SELECT "itemId", "leadTime"
     FROM "itemReplenishment"
     WHERE "companyId" = $1`,
    [companyId]
  );
  const inventoryRows = await queryMany<InventoryRow>(
    client,
    `SELECT "itemId", "locationId", SUM(quantity) AS "quantityOnHand"
     FROM "itemLedger"
     WHERE "companyId" = $1
     GROUP BY "itemId", "locationId"`,
    [companyId]
  );
  const activeMethods = await queryMany<ActiveMakeMethodRow>(
    client,
    `SELECT id, "itemId"
     FROM "activeMakeMethods"
     WHERE "companyId" = $1`,
    [companyId]
  );

  const replenishmentSystemByItem = new Map<string, ReplenishmentSystem>();
  for (const item of allItems) {
    replenishmentSystemByItem.set(item.id, item.replenishmentSystem);
  }

  const leadTimeByItem = new Map<string, number>();
  for (const replenishment of allReplenishments) {
    leadTimeByItem.set(
      replenishment.itemId,
      toNumber(replenishment.leadTime, 7)
    );
  }

  const baseInventoryByLocationItem = new Map<string, number>();
  for (const row of inventoryRows) {
    if (!row.itemId || !row.locationId) continue;
    baseInventoryByLocationItem.set(
      key2(row.locationId, row.itemId),
      toNumber(row.quantityOnHand)
    );
  }

  const methodIdByItem = new Map<string, string>();
  for (const method of activeMethods) {
    if (method.id && method.itemId) methodIdByItem.set(method.itemId, method.id);
  }

  const allMaterials = await loadMethodMaterials(
    client,
    Array.from(methodIdByItem.values()),
    companyId
  );
  const bomByItem = buildBomByItem(methodIdByItem, allMaterials);
  const lowLevelCodes = computeLowLevelCodes(
    bomByItem,
    replenishmentSystemByItem
  );
  const maxLevel =
    lowLevelCodes.size > 0 ? Math.max(...lowLevelCodes.values()) : 0;

  const jobSupplyByLocationPeriodItem = new Map<string, number>();
  for (const line of productionLines) {
    if (!line.itemId || !line.quantityToReceive) continue;

    const dueDate = line.dueDate
      ? dateString(line.dueDate)
      : line.deadlineType === "No Deadline"
        ? addDays(today, 30)
        : today;
    const period = findPeriod(dueDate, today, periods);
    if (!period) continue;

    increment(
      jobSupplyByLocationPeriodItem,
      key3(line.locationId ?? "", period.id, line.itemId),
      toNumber(line.quantityToReceive)
    );
  }

  const poSupplyByLocationPeriodItem = new Map<string, number>();
  for (const line of purchaseOrderLines) {
    if (!line.itemId || !line.quantityToReceive) continue;

    const dueDate = line.promisedDate
      ? dateString(line.promisedDate)
      : line.orderDate
        ? addDays(dateString(line.orderDate), toNumber(line.leadTime, 7))
        : addDays(today, toNumber(line.leadTime, 7));
    const period = findPeriod(dueDate, today, periods);
    if (!period) continue;

    increment(
      poSupplyByLocationPeriodItem,
      key3(line.locationId ?? "", period.id, line.itemId),
      toNumber(line.quantityToReceive)
    );
  }

  const grossDemand = new Map<string, number>();
  const salesDemandByKey = new Map<string, number>();
  const jobMaterialDemandByKey = new Map<string, number>();

  for (const projection of demandProjections) {
    if (!projection.itemId || !projection.forecastQuantity) continue;

    const periodKey = key3(
      projection.locationId ?? "",
      projection.periodId,
      projection.itemId
    );
    const plannedProduction = jobSupplyByLocationPeriodItem.get(periodKey) ?? 0;
    const netDemand = Math.max(
      0,
      toNumber(projection.forecastQuantity) - plannedProduction
    );

    if (netDemand > 0) increment(grossDemand, periodKey, netDemand);
  }

  for (const line of salesOrderLines) {
    if (!line.itemId || !line.quantityToSend) continue;

    const promisedDate = line.promisedDate ? dateString(line.promisedDate) : today;
    const period = findPeriod(promisedDate, today, periods);
    if (!period) continue;

    const demandKey = key3(line.locationId ?? "", period.id, line.itemId);
    increment(grossDemand, demandKey, toNumber(line.quantityToSend));
    increment(
      salesDemandByKey,
      key4(line.itemId, line.locationId ?? "", period.id, "Sales Order"),
      toNumber(line.quantityToSend)
    );
  }

  for (const line of jobMaterialLines) {
    if (!line.itemId || !line.quantityToIssue) continue;

    const dueDate = line.dueDate ? dateString(line.dueDate) : today;
    const requiredDate = addDays(dueDate, -toNumber(line.leadTime, 7));
    const period = findPeriod(requiredDate, today, periods);
    if (!period) continue;

    const demandKey = key3(line.locationId ?? "", period.id, line.itemId);
    increment(grossDemand, demandKey, toNumber(line.quantityToIssue));
    increment(
      jobMaterialDemandByKey,
      key4(line.itemId, line.locationId ?? "", period.id, "Job Material"),
      toNumber(line.quantityToIssue)
    );
  }

  const onHandByLocationItem = new Map(baseInventoryByLocationItem);
  const bomDerivedDemand = new Map<string, number>();
  const demandForecastMap = new Map<string, DemandForecastInsert>();

  for (let level = 0; level <= maxLevel; level++) {
    const keysAtLevel: string[] = [];
    for (const [key, quantity] of grossDemand) {
      if (quantity <= 0) continue;
      const [, , itemId] = splitKey3(key);
      if ((lowLevelCodes.get(itemId) ?? 0) === level) {
        keysAtLevel.push(key);
      }
    }

    for (const demandKey of keysAtLevel) {
      const grossQuantity = grossDemand.get(demandKey) ?? 0;
      if (grossQuantity <= 0) continue;

      const [locationId, periodId, itemId] = splitKey3(demandKey);
      const replenishmentSystem = replenishmentSystemByItem.get(itemId);
      const effectiveReplenishmentSystem =
        replenishmentSystem === "Buy and Make" ? "Buy" : replenishmentSystem;

      const inventoryKey = key2(locationId, itemId);
      const onHand = onHandByLocationItem.get(inventoryKey) ?? 0;
      const netRequirement = Math.max(0, grossQuantity - Math.max(0, onHand));

      if (onHand > 0) {
        onHandByLocationItem.set(
          inventoryKey,
          Math.max(0, onHand - grossQuantity)
        );
      }

      if (netRequirement <= 0 || effectiveReplenishmentSystem !== "Make") {
        continue;
      }

      const children = bomByItem.get(itemId) ?? [];
      for (const child of children) {
        const childReplenishmentSystem = replenishmentSystemByItem.get(
          child.itemId
        );
        const childEffectiveReplenishmentSystem =
          childReplenishmentSystem === "Buy and Make"
            ? "Buy"
            : childReplenishmentSystem;

        if (
          child.methodType === "Make to Order" &&
          childEffectiveReplenishmentSystem === "Make"
        ) {
          continue;
        }

        const childQuantity = child.quantity * netRequirement;
        const childLeadTimeDays = leadTimeByItem.get(child.itemId) ?? 7;
        const childLeadTimeWeeks = Math.ceil(childLeadTimeDays / 7);
        const currentPeriodIndex = periods.findIndex(
          (period) => period.id === periodId
        );
        const targetPeriodIndex = Math.max(
          0,
          currentPeriodIndex - childLeadTimeWeeks
        );
        const targetPeriod = periods[targetPeriodIndex];
        if (!targetPeriod) continue;

        const childKey = key3(locationId, targetPeriod.id, child.itemId);
        increment(grossDemand, childKey, childQuantity);
        increment(bomDerivedDemand, childKey, childQuantity);
      }
    }
  }

  for (const [key, quantity] of bomDerivedDemand) {
    if (quantity <= 0) continue;
    const [locationId, periodId, itemId] = splitKey3(key);
    const forecastKey = key3(itemId, locationId, periodId);
    const existing = demandForecastMap.get(forecastKey);

    if (existing) {
      existing.forecastQuantity += quantity;
      continue;
    }

    demandForecastMap.set(forecastKey, {
      itemId,
      locationId,
      periodId,
      forecastQuantity: quantity,
      forecastMethod: "mrp",
      companyId,
      createdBy: userId,
      updatedBy: userId
    });
  }

  const demandActualsMap = await buildDemandActualsMap(client, {
    companyId,
    userId,
    periodIds,
    salesDemandByKey,
    jobMaterialDemandByKey
  });
  const supplyActualsMap = await buildSupplyActualsMap(client, {
    companyId,
    userId,
    periodIds,
    jobSupplyByLocationPeriodItem,
    poSupplyByLocationPeriodItem
  });

  await persistMrpResults(client, {
    companyId,
    periodIds,
    locationIds: locations.map((location) => location.id),
    demandForecasts: Array.from(demandForecastMap.values()),
    demandActuals: Array.from(demandActualsMap.values()),
    supplyActuals: Array.from(supplyActualsMap.values())
  });
}

async function loadMethodMaterials(
  client: PoolClient,
  makeMethodIds: string[],
  companyId: string
) {
  if (makeMethodIds.length === 0) return [];

  return queryMany<MethodMaterialRow>(
    client,
    `SELECT id, "makeMethodId", "materialMakeMethodId", "itemId", quantity,
            "methodType"
     FROM "methodMaterial"
     WHERE "companyId" = $1
       AND "makeMethodId" = ANY($2::text[])`,
    [companyId, makeMethodIds]
  );
}

function buildBomByItem(
  methodIdByItem: Map<string, string>,
  materials: MethodMaterialRow[]
) {
  const materialsByMethodId = new Map<string, MethodMaterialRow[]>();
  for (const material of materials) {
    const existing = materialsByMethodId.get(material.makeMethodId) ?? [];
    existing.push(material);
    materialsByMethodId.set(material.makeMethodId, existing);
  }

  const bomByItem = new Map<string, BomChild[]>();
  for (const [itemId, methodId] of methodIdByItem) {
    const methodMaterials = materialsByMethodId.get(methodId) ?? [];
    const children = methodMaterials.map((material) => ({
      itemId: material.itemId,
      quantity: toNumber(material.quantity, 1),
      methodType: material.methodType
    }));
    if (children.length > 0) bomByItem.set(itemId, children);
  }

  return bomByItem;
}

function computeLowLevelCodes(
  bomByItem: Map<string, BomChild[]>,
  replenishmentSystemByItem: Map<string, ReplenishmentSystem>
) {
  const lowLevelCodes = new Map<string, number>();

  function assignLevel(itemId: string, level: number, visited: Set<string>) {
    if (visited.has(itemId)) return;
    visited.add(itemId);

    const current = lowLevelCodes.get(itemId) ?? -1;
    if (level > current) lowLevelCodes.set(itemId, level);

    const children = bomByItem.get(itemId) ?? [];
    for (const child of children) {
      const childReplenishmentSystem = replenishmentSystemByItem.get(
        child.itemId
      );
      const childEffectiveReplenishmentSystem =
        childReplenishmentSystem === "Buy and Make"
          ? "Buy"
          : childReplenishmentSystem;

      if (
        child.methodType === "Make to Order" &&
        childEffectiveReplenishmentSystem === "Make"
      ) {
        continue;
      }

      assignLevel(child.itemId, level + 1, new Set(visited));
    }
  }

  for (const itemId of bomByItem.keys()) {
    assignLevel(itemId, 0, new Set());
  }

  return lowLevelCodes;
}

async function buildDemandActualsMap(
  client: PoolClient,
  args: {
    companyId: string;
    userId: string;
    periodIds: string[];
    salesDemandByKey: Map<string, number>;
    jobMaterialDemandByKey: Map<string, number>;
  }
) {
  const map = new Map<string, DemandActualInsert>();
  const existing = await queryMany<DemandActualRow>(
    client,
    `SELECT "itemId", "locationId", "periodId", "sourceType"
     FROM "demandActual"
     WHERE "companyId" = $1
       AND "periodId" = ANY($2::text[])`,
    [args.companyId, args.periodIds]
  );

  for (const row of existing) {
    map.set(key4(row.itemId, row.locationId, row.periodId, row.sourceType), {
      itemId: row.itemId,
      locationId: row.locationId,
      periodId: row.periodId,
      actualQuantity: 0,
      sourceType: row.sourceType,
      companyId: args.companyId,
      createdBy: args.userId,
      updatedBy: args.userId
    });
  }

  for (const [key, quantity] of args.salesDemandByKey) {
    if (quantity <= 0) continue;
    const [itemId, locationId, periodId] = splitKey4(key);
    map.set(key, {
      itemId,
      locationId,
      periodId,
      actualQuantity: quantity,
      sourceType: "Sales Order",
      companyId: args.companyId,
      createdBy: args.userId,
      updatedBy: args.userId
    });
  }

  for (const [key, quantity] of args.jobMaterialDemandByKey) {
    if (quantity <= 0) continue;
    const [itemId, locationId, periodId] = splitKey4(key);
    map.set(key, {
      itemId,
      locationId,
      periodId,
      actualQuantity: quantity,
      sourceType: "Job Material",
      companyId: args.companyId,
      createdBy: args.userId,
      updatedBy: args.userId
    });
  }

  return map;
}

async function buildSupplyActualsMap(
  client: PoolClient,
  args: {
    companyId: string;
    userId: string;
    periodIds: string[];
    jobSupplyByLocationPeriodItem: Map<string, number>;
    poSupplyByLocationPeriodItem: Map<string, number>;
  }
) {
  const map = new Map<string, SupplyActualInsert>();
  const existing = await queryMany<SupplyActualRow>(
    client,
    `SELECT "itemId", "locationId", "periodId", "sourceType"
     FROM "supplyActual"
     WHERE "companyId" = $1
       AND "periodId" = ANY($2::text[])`,
    [args.companyId, args.periodIds]
  );

  for (const row of existing) {
    map.set(key4(row.itemId, row.locationId, row.periodId, row.sourceType), {
      itemId: row.itemId,
      locationId: row.locationId,
      periodId: row.periodId,
      actualQuantity: 0,
      sourceType: row.sourceType,
      companyId: args.companyId,
      createdBy: args.userId,
      updatedBy: args.userId
    });
  }

  for (const [key, quantity] of args.jobSupplyByLocationPeriodItem) {
    if (quantity <= 0) continue;
    const [locationId, periodId, itemId] = splitKey3(key);
    const actualKey = key4(itemId, locationId, periodId, "Production Order");
    map.set(actualKey, {
      itemId,
      locationId,
      periodId,
      actualQuantity: quantity,
      sourceType: "Production Order",
      companyId: args.companyId,
      createdBy: args.userId,
      updatedBy: args.userId
    });
  }

  for (const [key, quantity] of args.poSupplyByLocationPeriodItem) {
    if (quantity <= 0) continue;
    const [locationId, periodId, itemId] = splitKey3(key);
    const actualKey = key4(itemId, locationId, periodId, "Purchase Order");
    map.set(actualKey, {
      itemId,
      locationId,
      periodId,
      actualQuantity: quantity,
      sourceType: "Purchase Order",
      companyId: args.companyId,
      createdBy: args.userId,
      updatedBy: args.userId
    });
  }

  return map;
}

async function persistMrpResults(
  client: PoolClient,
  args: {
    companyId: string;
    periodIds: string[];
    locationIds: string[];
    demandForecasts: DemandForecastInsert[];
    demandActuals: DemandActualInsert[];
    supplyActuals: SupplyActualInsert[];
  }
) {
  await client.query(
    `DELETE FROM "demandForecast"
     WHERE "companyId" = $1 AND "forecastMethod" = 'mrp'`,
    [args.companyId]
  );

  if (args.locationIds.length > 0) {
    await client.query(
      `DELETE FROM "supplyForecast"
       WHERE "companyId" = $1 AND "locationId" = ANY($2::text[])`,
      [args.companyId, args.locationIds]
    );
  } else {
    await client.query(`DELETE FROM "supplyForecast" WHERE "companyId" = $1`, [
      args.companyId
    ]);
  }

  await client.query(
    `DELETE FROM "demandActual"
     WHERE "companyId" = $1 AND "periodId" = ANY($2::text[])`,
    [args.companyId, args.periodIds]
  );
  await client.query(
    `DELETE FROM "supplyActual"
     WHERE "companyId" = $1 AND "periodId" = ANY($2::text[])`,
    [args.companyId, args.periodIds]
  );

  await insertDemandForecasts(client, args.demandForecasts);
  await insertDemandActuals(client, args.demandActuals);
  await insertSupplyActuals(client, args.supplyActuals);
}

async function insertDemandForecasts(
  client: PoolClient,
  rows: DemandForecastInsert[]
) {
  for (const batch of chunks(rows, 500)) {
    const values: unknown[] = [];
    const tuples = batch.map((row) => {
      values.push(
        row.itemId,
        row.locationId,
        row.periodId,
        row.forecastQuantity,
        row.forecastMethod,
        row.companyId,
        row.createdBy,
        row.updatedBy
      );
      const offset = values.length - 7;
      return `($${offset}, $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, NOW(), $${offset + 6}, NOW(), $${offset + 7})`;
    });

    if (tuples.length === 0) continue;
    await client.query(
      `INSERT INTO "demandForecast" (
         "itemId", "locationId", "periodId", "forecastQuantity",
         "forecastMethod", "companyId", "createdAt", "createdBy",
         "updatedAt", "updatedBy"
       )
       VALUES ${tuples.join(", ")}`,
      values
    );
  }
}

async function insertDemandActuals(client: PoolClient, rows: DemandActualInsert[]) {
  for (const batch of chunks(rows, 500)) {
    const values: unknown[] = [];
    const tuples = batch.map((row) => {
      values.push(
        row.itemId,
        row.locationId,
        row.periodId,
        row.actualQuantity,
        row.sourceType,
        row.companyId,
        row.createdBy,
        row.updatedBy
      );
      const offset = values.length - 7;
      return `($${offset}, $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, NOW(), $${offset + 6}, NOW(), $${offset + 7})`;
    });

    if (tuples.length === 0) continue;
    await client.query(
      `INSERT INTO "demandActual" (
         "itemId", "locationId", "periodId", "actualQuantity",
         "sourceType", "companyId", "createdAt", "createdBy",
         "updatedAt", "updatedBy"
       )
       VALUES ${tuples.join(", ")}`,
      values
    );
  }
}

async function insertSupplyActuals(client: PoolClient, rows: SupplyActualInsert[]) {
  for (const batch of chunks(rows, 500)) {
    const values: unknown[] = [];
    const tuples = batch.map((row) => {
      values.push(
        row.itemId,
        row.locationId,
        row.periodId,
        row.actualQuantity,
        row.sourceType,
        row.companyId,
        row.createdBy,
        row.updatedBy
      );
      const offset = values.length - 7;
      return `($${offset}, $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, NOW(), $${offset + 6}, NOW(), $${offset + 7})`;
    });

    if (tuples.length === 0) continue;
    await client.query(
      `INSERT INTO "supplyActual" (
         "itemId", "locationId", "periodId", "actualQuantity",
         "sourceType", "companyId", "createdAt", "createdBy",
         "updatedAt", "updatedBy"
       )
       VALUES ${tuples.join(", ")}`,
      values
    );
  }
}

async function getOrCreateDemandPeriods(
  client: PoolClient,
  periods: { startDate: string; endDate: string }[],
  periodType: PeriodType
) {
  const existingPeriods = await queryMany<DemandPeriod>(
    client,
    `SELECT id, "startDate", "endDate", "periodType"
     FROM "period"
     WHERE "startDate" = ANY($1::date[])
       AND "periodType" = $2`,
    [periods.map((period) => period.startDate), periodType]
  );

  const existingPeriodMap = new Map(
    existingPeriods.map((period) => [dateString(period.startDate), period])
  );
  const periodsToCreate = periods.filter(
    (period) => !existingPeriodMap.has(period.startDate)
  );

  for (const period of periodsToCreate) {
    const id = nanoid();
    await client.query(
      `INSERT INTO "period" (
         id, "startDate", "endDate", "periodType", "createdAt"
       )
       VALUES ($1, $2, $3, $4, NOW())`,
      [id, period.startDate, period.endDate, periodType]
    );
    existingPeriods.push({
      id,
      startDate: period.startDate,
      endDate: period.endDate,
      periodType
    });
  }

  return existingPeriods
    .map((period) => ({
      ...period,
      startDate: dateString(period.startDate),
      endDate: dateString(period.endDate)
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function findPeriod(date: string, today: string, periods: DemandPeriod[]) {
  if (date < today) return periods[0];
  return periods.find(
    (period) => period.startDate <= date && period.endDate >= date
  );
}

function getStartAndEndDates(today: string, groupBy: PeriodType) {
  if (groupBy !== "Week") throw new Error("Only weekly MRP is implemented");

  const periods: { startDate: string; endDate: string }[] = [];
  let currentStart = startOfWeek(today);

  for (let i = 0; i < WEEKS_TO_FORECAST; i++) {
    const periodEnd = addDays(currentStart, 6);
    periods.push({
      startDate: currentStart,
      endDate: periodEnd
    });
    currentStart = addDays(periodEnd, 1);
  }

  return periods;
}

function startOfWeek(value: string) {
  const date = parseDateOnly(value);
  date.setDate(date.getDate() - date.getDay());
  return formatDate(date);
}

function addDays(value: string, days: number) {
  const date = parseDateOnly(value);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function todayString() {
  return formatDate(new Date());
}

function dateString(value: Date | string) {
  if (value instanceof Date) return formatDate(value);
  return value.includes("T") ? value.split("T")[0] ?? value : value;
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function key2(a: string, b: string) {
  return [a, b].join(KEY_SEPARATOR);
}

function key3(a: string, b: string, c: string) {
  return [a, b, c].join(KEY_SEPARATOR);
}

function key4(a: string, b: string, c: string, d: string) {
  return [a, b, c, d].join(KEY_SEPARATOR);
}

function splitKey3(key: string): [string, string, string] {
  return key.split(KEY_SEPARATOR) as [string, string, string];
}

function splitKey4(key: string): [string, string, string, string] {
  return key.split(KEY_SEPARATOR) as [string, string, string, string];
}

function increment(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

function toNumber(value: string | number | null | undefined, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    result.push(values.slice(i, i + size));
  }
  return result;
}

async function queryMany<T extends QueryResultRow>(
  client: PoolClient,
  text: string,
  values: unknown[] = []
) {
  const result = await client.query<T>(text, values);
  return result.rows;
}
