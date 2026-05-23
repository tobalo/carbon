import { nanoid } from "nanoid";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";
import { getPostgresConnectionPool } from "./postgres.ts";

const onShapeDataValidator = z.object({
  index: z.string(),
  id: z.string().optional(),
  readableId: z.string().optional(),
  revision: z.string().optional(),
  name: z.string(),
  quantity: z.number(),
  replenishmentSystem: z.enum(["Make", "Buy", "Buy and Make"]),
  defaultMethodType: z.enum([
    "Make to Order",
    "Purchase to Order",
    "Pull from Inventory"
  ]),
  data: z.record(z.string(), z.any())
});

export const syncArgsValidator = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("onshape"),
    makeMethodId: z.string(),
    data: z.array(onShapeDataValidator),
    companyId: z.string(),
    userId: z.string()
  })
]);

type SyncArgs = z.infer<typeof syncArgsValidator>;
type OnShapeData = z.infer<typeof onShapeDataValidator>;

type MakeMethodInfo = {
  id: string;
  itemId: string;
  version: string | number;
  status: "Draft" | "Active" | "Archived";
};

type ItemInfo = {
  id: string;
  readableId: string;
  readableIdWithRevision: string | null;
  revision: string | null;
  unitOfMeasureCode: string | null;
  type: string;
};

type TreeNode = {
  data: OnShapeData;
  children: TreeNode[];
  level: number;
};

let syncPool: Pool | null = null;

export async function sync(args: SyncArgs) {
  if (!args.companyId) throw new Error("Payload is missing companyId");
  if (!args.userId) throw new Error("Payload is missing userId");

  return syncOnshape(args);
}

export async function closeSyncPool() {
  if (!syncPool) return;
  await syncPool.end();
  syncPool = null;
}

function getSyncPool() {
  syncPool ??= getPostgresConnectionPool(
    Number(process.env.DATABASE_SERVICE_POOL_SIZE ?? 5),
    { kind: "service" }
  );
  return syncPool;
}

async function syncOnshape(args: Extract<SyncArgs, { type: "onshape" }>) {
  const pool = getSyncPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [
      args.userId
    ]);

    const activeMakeMethodId = await prepareTopLevelMakeMethod(client, args);
    await syncOnshapeTree(client, args, activeMakeMethodId);

    await client.query("COMMIT");
    return { success: true, makeMethodId: activeMakeMethodId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function prepareTopLevelMakeMethod(
  client: PoolClient,
  args: Extract<SyncArgs, { type: "onshape" }>
) {
  const topLevelMakeMethod = await queryOne<MakeMethodInfo>(
    client,
    `SELECT id, "itemId", version, status
     FROM "makeMethod"
     WHERE id = $1 AND "companyId" = $2`,
    [args.makeMethodId, args.companyId]
  );

  if (!topLevelMakeMethod) {
    throw new Error(`Make method not found for id: ${args.makeMethodId}`);
  }

  if (topLevelMakeMethod.status !== "Active") {
    return args.makeMethodId;
  }

  const existingDraft = await queryOne<Pick<MakeMethodInfo, "id" | "version">>(
    client,
    `SELECT id, version
     FROM "makeMethod"
     WHERE "itemId" = $1
       AND status = 'Draft'
       AND "companyId" = $2
     ORDER BY version DESC
     LIMIT 1`,
    [topLevelMakeMethod.itemId, args.companyId]
  );

  if (existingDraft) return existingDraft.id;

  const draftId = await createMakeMethod(client, {
    itemId: topLevelMakeMethod.itemId,
    companyId: args.companyId,
    userId: args.userId,
    version: await nextMakeMethodVersion(
      client,
      topLevelMakeMethod.itemId,
      args.companyId
    ),
    status: "Draft"
  });

  await copyMakeMethodOperations(
    client,
    topLevelMakeMethod.id,
    draftId,
    args.companyId,
    args.userId
  );

  return draftId;
}

async function syncOnshapeTree(
  client: PoolClient,
  args: Extract<SyncArgs, { type: "onshape" }>,
  activeMakeMethodId: string
) {
  const existingItemIds = args.data
    .map((item) => item.id)
    .filter((id): id is string => Boolean(id));

  const existingMakeMethods = await getActiveMakeMethodsByItemId(
    client,
    existingItemIds,
    args.companyId
  );
  const existingItems = await getItemsById(client, existingItemIds, args.companyId);

  await client.query(`DELETE FROM "methodMaterial" WHERE "makeMethodId" = $1`, [
    activeMakeMethodId
  ]);

  const newlyCreatedItemsByPartId = new Map<string, string>();
  const newlyCreatedMakeMethodsByItemId = new Map<string, MakeMethodInfo>();

  const sortedData = [...args.data].sort(compareOnshapeIndexes);
  const tree = buildTree(sortedData);

  const traverseTree = async (
    node: TreeNode,
    parentMakeMethodId: string,
    index: number
  ) => {
    const { data, children } = node;
    const {
      id,
      readableId,
      revision,
      name,
      quantity,
      replenishmentSystem,
      defaultMethodType
    } = data;

    const partId = readableId || name;
    if (!partId) return;

    const externalPartId = getReadableIdWithRevision(partId, revision);
    const isMade = children.length > 0;
    let itemId = id;

    if (itemId) {
      const updatedItem = await client.query(
        `UPDATE "item"
         SET "updatedBy" = $1, "updatedAt" = NOW()
         WHERE id = $2 AND "companyId" = $3`,
        [args.userId, itemId, args.companyId]
      );
      if (updatedItem.rowCount === 0) {
        throw new Error(`Item not found for id: ${itemId}`);
      }

      await replaceOnshapeDataMapping(client, {
        itemId,
        externalPartId,
        metadata: data.data,
        companyId: args.companyId,
        userId: args.userId
      });
    } else {
      itemId = newlyCreatedItemsByPartId.get(partId);

      if (!itemId) {
        itemId = await createItemAndPart(client, {
          partId,
          revision,
          name,
          replenishmentSystem,
          defaultMethodType,
          companyId: args.companyId,
          userId: args.userId
        });

        await replaceOnshapeDataMapping(client, {
          itemId,
          externalPartId,
          metadata: data.data,
          companyId: args.companyId,
          userId: args.userId
        });

        newlyCreatedItemsByPartId.set(partId, itemId);
        existingItems.set(itemId, {
          id: itemId,
          readableId: partId,
          readableIdWithRevision: getReadableIdWithRevision(partId, revision),
          revision: revision ?? "0",
          unitOfMeasureCode: "EA",
          type: "Part"
        });
      }
    }

    const materialMakeMethodId = await maybeGetOrCreateMaterialMakeMethod(
      client,
      {
        itemId,
        isMade,
        defaultMethodType,
        existingMakeMethods,
        newlyCreatedMakeMethodsByItemId,
        companyId: args.companyId,
        userId: args.userId
      }
    );

    const itemInfo = existingItems.get(itemId);
    await insertMethodMaterial(client, {
      itemId,
      quantity: quantity ?? 1,
      makeMethodId: parentMakeMethodId,
      materialMakeMethodId,
      methodType: defaultMethodType,
      order: index,
      itemType: itemInfo?.type ?? "Part",
      unitOfMeasureCode: itemInfo?.unitOfMeasureCode ?? "EA",
      companyId: args.companyId,
      userId: args.userId
    });

    if (materialMakeMethodId) {
      await client.query(
        `DELETE FROM "methodMaterial" WHERE "makeMethodId" = $1`,
        [materialMakeMethodId]
      );

      for (const [childIndex, child] of children.entries()) {
        await traverseTree(child, materialMakeMethodId, childIndex);
      }
    }
  };

  for (const [index, node] of tree.entries()) {
    await traverseTree(node, activeMakeMethodId, index);
  }
}

async function getActiveMakeMethodsByItemId(
  client: PoolClient,
  itemIds: string[],
  companyId: string
) {
  const makeMethods = new Map<string, MakeMethodInfo>();
  if (itemIds.length === 0) return makeMethods;

  const rows = await queryMany<MakeMethodInfo>(
    client,
    `SELECT id, "itemId", version, status
     FROM "activeMakeMethods"
     WHERE "companyId" = $1 AND "itemId" = ANY($2::text[])`,
    [companyId, itemIds]
  );

  for (const makeMethod of rows) {
    makeMethods.set(makeMethod.itemId, makeMethod);
  }

  return makeMethods;
}

async function getItemsById(
  client: PoolClient,
  itemIds: string[],
  companyId: string
) {
  const items = new Map<string, ItemInfo>();
  if (itemIds.length === 0) return items;

  const rows = await queryMany<ItemInfo>(
    client,
    `SELECT id, "readableId", "readableIdWithRevision", revision,
            "unitOfMeasureCode", type
     FROM "item"
     WHERE "companyId" = $1 AND id = ANY($2::text[])`,
    [companyId, itemIds]
  );

  for (const item of rows) {
    items.set(item.id, item);
  }

  return items;
}

async function maybeGetOrCreateMaterialMakeMethod(
  client: PoolClient,
  args: {
    itemId: string;
    isMade: boolean;
    defaultMethodType: string;
    existingMakeMethods: Map<string, MakeMethodInfo>;
    newlyCreatedMakeMethodsByItemId: Map<string, MakeMethodInfo>;
    companyId: string;
    userId: string;
  }
) {
  if (args.defaultMethodType !== "Make to Order" && !args.isMade) {
    return undefined;
  }

  const existingMakeMethod =
    args.existingMakeMethods.get(args.itemId) ??
    args.newlyCreatedMakeMethodsByItemId.get(args.itemId);

  if (!existingMakeMethod) {
    const triggerCreatedMakeMethod = await queryOne<MakeMethodInfo>(
      client,
      `SELECT id, "itemId", version, status
       FROM "makeMethod"
       WHERE "itemId" = $1 AND "companyId" = $2
       ORDER BY version DESC
       LIMIT 1`,
      [args.itemId, args.companyId]
    );

    if (triggerCreatedMakeMethod) {
      cacheMakeMethod(args, triggerCreatedMakeMethod);
      return triggerCreatedMakeMethod.id;
    }

    const id = await createMakeMethod(client, {
      itemId: args.itemId,
      companyId: args.companyId,
      userId: args.userId,
      version: 1,
      status: "Draft"
    });
    const makeMethodInfo: MakeMethodInfo = {
      id,
      itemId: args.itemId,
      version: 1,
      status: "Draft"
    };
    cacheMakeMethod(args, makeMethodInfo);
    return id;
  }

  if (existingMakeMethod.status === "Draft") {
    return existingMakeMethod.id;
  }

  const existingDraft = await queryOne<Pick<MakeMethodInfo, "id" | "version">>(
    client,
    `SELECT id, version
     FROM "makeMethod"
     WHERE "itemId" = $1
       AND status = 'Draft'
       AND "companyId" = $2
     ORDER BY version DESC
     LIMIT 1`,
    [args.itemId, args.companyId]
  );

  if (existingDraft) {
    const makeMethodInfo: MakeMethodInfo = {
      id: existingDraft.id,
      itemId: args.itemId,
      version: existingDraft.version,
      status: "Draft"
    };
    cacheMakeMethod(args, makeMethodInfo);
    return existingDraft.id;
  }

  const newVersion = await nextMakeMethodVersion(
    client,
    args.itemId,
    args.companyId
  );
  const id = await createMakeMethod(client, {
    itemId: args.itemId,
    companyId: args.companyId,
    userId: args.userId,
    version: newVersion,
    status: "Draft"
  });

  await copyMakeMethodOperations(
    client,
    existingMakeMethod.id,
    id,
    args.companyId,
    args.userId
  );

  const makeMethodInfo: MakeMethodInfo = {
    id,
    itemId: args.itemId,
    version: newVersion,
    status: "Draft"
  };
  cacheMakeMethod(args, makeMethodInfo);
  return id;
}

function cacheMakeMethod(
  args: {
    existingMakeMethods: Map<string, MakeMethodInfo>;
    newlyCreatedMakeMethodsByItemId: Map<string, MakeMethodInfo>;
  } & Pick<MakeMethodInfo, never>,
  makeMethodInfo: MakeMethodInfo
) {
  args.newlyCreatedMakeMethodsByItemId.set(
    makeMethodInfo.itemId,
    makeMethodInfo
  );
  args.existingMakeMethods.set(makeMethodInfo.itemId, makeMethodInfo);
}

async function createMakeMethod(
  client: PoolClient,
  args: {
    itemId: string;
    companyId: string;
    userId: string;
    version: number;
    status: "Draft" | "Active" | "Archived";
  }
) {
  const id = nanoid();
  await client.query(
    `INSERT INTO "makeMethod" (
       id, "itemId", version, status, "companyId", "createdAt", "createdBy"
     )
     VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
    [id, args.itemId, args.version, args.status, args.companyId, args.userId]
  );
  return id;
}

async function nextMakeMethodVersion(
  client: PoolClient,
  itemId: string,
  companyId: string
) {
  const row = await queryOne<{ version: string | number | null }>(
    client,
    `SELECT version
     FROM "makeMethod"
     WHERE "itemId" = $1 AND "companyId" = $2
     ORDER BY version DESC
     LIMIT 1`,
    [itemId, companyId]
  );

  return Number(row?.version ?? 0) + 1;
}

async function createItemAndPart(
  client: PoolClient,
  args: {
    partId: string;
    revision: string | undefined;
    name: string;
    replenishmentSystem: string;
    defaultMethodType: string;
    companyId: string;
    userId: string;
  }
) {
  const itemId = nanoid();
  const revision = args.revision ?? "0";

  await client.query(
    `INSERT INTO "item" (
       id, "readableId", revision, "readableIdWithRevision", name, type,
       "unitOfMeasureCode", "itemTrackingType", "replenishmentSystem",
       "defaultMethodType", active, "requiresInspection", embedding,
       "companyId", "createdAt", "createdBy"
     )
     VALUES (
       $1, $2, $3, $4, $5, 'Part', 'EA', 'Inventory', $6, $7,
       true, false, $8::vector, $9, NOW(), $10
     )`,
    [
      itemId,
      args.partId,
      revision,
      getReadableIdWithRevision(args.partId, revision),
      args.name,
      args.replenishmentSystem,
      args.defaultMethodType,
      zeroEmbedding(),
      args.companyId,
      args.userId
    ]
  );

  await client.query(
    `INSERT INTO "part" (
       id, approved, "companyId", "createdAt", "createdBy"
     )
     VALUES ($1, false, $2, NOW(), $3)
     ON CONFLICT (id) DO UPDATE SET
       "updatedBy" = EXCLUDED."createdBy",
       "updatedAt" = NOW()`,
    [args.partId, args.companyId, args.userId]
  );

  return itemId;
}

async function replaceOnshapeDataMapping(
  client: PoolClient,
  args: {
    itemId: string;
    externalPartId: string;
    metadata: Record<string, unknown>;
    companyId: string;
    userId: string;
  }
) {
  await client.query(
    `DELETE FROM "externalIntegrationMapping"
     WHERE "companyId" = $1
       AND "entityType" = 'item'
       AND integration = 'onshapeData'
       AND (
         "entityId" = $2 OR
         (
           "externalId" = $3 AND
           "allowDuplicateExternalId" = false
         )
       )`,
    [args.companyId, args.itemId, args.externalPartId]
  );

  await client.query(
    `INSERT INTO "externalIntegrationMapping" (
       id, "entityType", "entityId", integration, "externalId", metadata,
       "companyId", "allowDuplicateExternalId", "createdAt", "createdBy",
       "updatedAt"
     )
     VALUES (
       $1, 'item', $2, 'onshapeData', $3, $4::jsonb, $5, false,
       NOW(), $6, NOW()
     )`,
    [
      nanoid(),
      args.itemId,
      args.externalPartId,
      JSON.stringify(args.metadata),
      args.companyId,
      args.userId
    ]
  );
}

async function insertMethodMaterial(
  client: PoolClient,
  args: {
    itemId: string;
    quantity: number;
    makeMethodId: string;
    materialMakeMethodId: string | undefined;
    methodType: string;
    order: number;
    itemType: string;
    unitOfMeasureCode: string;
    companyId: string;
    userId: string;
  }
) {
  await client.query(
    `INSERT INTO "methodMaterial" (
       id, "itemId", quantity, "makeMethodId", "materialMakeMethodId",
       "methodType", "order", "itemType", "unitOfMeasureCode", kit,
       "scrapQuantity", "sourcingType", "storageUnitIds", "companyId",
       "createdAt", "createdBy"
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, false, 0,
       'Specified', '{}'::jsonb, $10, NOW(), $11
     )`,
    [
      nanoid(),
      args.itemId,
      args.quantity,
      args.makeMethodId,
      args.materialMakeMethodId ?? null,
      args.methodType,
      args.order,
      args.itemType,
      args.unitOfMeasureCode,
      args.companyId,
      args.userId
    ]
  );
}

async function copyMakeMethodOperations(
  client: PoolClient,
  sourceMakeMethodId: string,
  targetMakeMethodId: string,
  companyId: string,
  userId: string
) {
  const sourceOperations = await queryMany<{ id: string } & QueryResultRow>(
    client,
    `SELECT *
     FROM "methodOperation"
     WHERE "makeMethodId" = $1 AND "companyId" = $2
     ORDER BY "order"`,
    [sourceMakeMethodId, companyId]
  );

  for (const operation of sourceOperations) {
    const oldOperationId = operation.id;
    const newOperationId = nanoid();

    await client.query(
      `INSERT INTO "methodOperation" (
         id, "companyId", "createdAt", "createdBy", "customFields",
         description, "laborTime", "laborUnit", "machineTime", "machineUnit",
         "makeMethodId", "operationLeadTime", "operationMinimumCost",
         "operationOrder", "operationSupplierProcessId", "operationType",
         "operationUnitCost", "order", "procedureId", "processId",
         "setupTime", "setupUnit", tags, "workCenterId", "workInstruction"
       )
       VALUES (
         $1, $2, NOW(), $3, $4::jsonb, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
         $22::text[], $23, $24::jsonb
       )`,
      [
        newOperationId,
        operation.companyId,
        userId,
        operation.customFields ? JSON.stringify(operation.customFields) : null,
        operation.description,
        operation.laborTime,
        operation.laborUnit,
        operation.machineTime,
        operation.machineUnit,
        targetMakeMethodId,
        operation.operationLeadTime,
        operation.operationMinimumCost,
        operation.operationOrder,
        operation.operationSupplierProcessId,
        operation.operationType,
        operation.operationUnitCost,
        operation.order,
        operation.procedureId,
        operation.processId,
        operation.setupTime,
        operation.setupUnit,
        operation.tags,
        operation.workCenterId,
        JSON.stringify(operation.workInstruction ?? {})
      ]
    );

    await copyMethodOperationTools(client, oldOperationId, newOperationId, userId);
    await copyMethodOperationParameters(
      client,
      oldOperationId,
      newOperationId,
      userId
    );
    await copyMethodOperationSteps(client, oldOperationId, newOperationId, userId);
  }
}

async function copyMethodOperationTools(
  client: PoolClient,
  sourceOperationId: string,
  targetOperationId: string,
  userId: string
) {
  const rows = await queryMany<QueryResultRow>(
    client,
    `SELECT *
     FROM "methodOperationTool"
     WHERE "operationId" = $1`,
    [sourceOperationId]
  );

  for (const row of rows) {
    await client.query(
      `INSERT INTO "methodOperationTool" (
         id, "operationId", "toolId", quantity, "companyId", "createdAt",
         "createdBy", "updatedAt"
       )
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, NOW())`,
      [
        nanoid(),
        targetOperationId,
        row.toolId,
        row.quantity,
        row.companyId,
        userId
      ]
    );
  }
}

async function copyMethodOperationParameters(
  client: PoolClient,
  sourceOperationId: string,
  targetOperationId: string,
  userId: string
) {
  const rows = await queryMany<QueryResultRow>(
    client,
    `SELECT *
     FROM "methodOperationParameter"
     WHERE "operationId" = $1`,
    [sourceOperationId]
  );

  for (const row of rows) {
    await client.query(
      `INSERT INTO "methodOperationParameter" (
         id, "operationId", key, value, "companyId", "createdAt", "createdBy"
       )
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
      [
        nanoid(),
        targetOperationId,
        row.key,
        row.value,
        row.companyId,
        userId
      ]
    );
  }
}

async function copyMethodOperationSteps(
  client: PoolClient,
  sourceOperationId: string,
  targetOperationId: string,
  userId: string
) {
  const rows = await queryMany<QueryResultRow>(
    client,
    `SELECT *
     FROM "methodOperationStep"
     WHERE "operationId" = $1
     ORDER BY "sortOrder"`,
    [sourceOperationId]
  );

  for (const row of rows) {
    await client.query(
      `INSERT INTO "methodOperationStep" (
         id, "operationId", name, type, "sortOrder", description, required,
         "unitOfMeasureCode", "minValue", "maxValue", "listValues",
         "fileTypes", "companyId", "createdAt", "createdBy"
       )
       VALUES (
         $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10,
         $11::text[], $12::text[], $13, NOW(), $14
       )`,
      [
        nanoid(),
        targetOperationId,
        row.name,
        row.type,
        row.sortOrder,
        row.description ? JSON.stringify(row.description) : null,
        row.required,
        row.unitOfMeasureCode,
        row.minValue,
        row.maxValue,
        row.listValues,
        row.fileTypes,
        row.companyId,
        userId
      ]
    );
  }
}

function compareOnshapeIndexes(a: OnShapeData, b: OnShapeData) {
  const aIndices = a.index.toString().split(".");
  const bIndices = b.index.toString().split(".");

  for (let i = 0; i < Math.min(aIndices.length, bIndices.length); i++) {
    const aVal = Number.parseInt(aIndices[i] ?? "0", 10);
    const bVal = Number.parseInt(bIndices[i] ?? "0", 10);
    if (aVal !== bVal) return aVal - bVal;
  }

  return aIndices.length - bIndices.length;
}

function buildTree(data: OnShapeData[]) {
  const result: TreeNode[] = [];
  const nodeMap = new Map<string, TreeNode>();

  for (const item of data) {
    const indexStr = item.index.toString();
    const node: TreeNode = {
      data: item,
      children: [],
      level: indexStr.split(".").length
    };

    nodeMap.set(indexStr, node);

    const lastDotIndex = indexStr.lastIndexOf(".");
    if (lastDotIndex === -1) {
      result.push(node);
      continue;
    }

    const parentIndex = indexStr.substring(0, lastDotIndex);
    const parentNode = nodeMap.get(parentIndex);
    if (parentNode) parentNode.children.push(node);
  }

  return result;
}

function getReadableIdWithRevision(
  readableId: string,
  revision?: string | null
) {
  if (revision && revision !== "0") return `${readableId}.${revision}`;
  return readableId;
}

let cachedZeroEmbedding: string | null = null;

function zeroEmbedding() {
  cachedZeroEmbedding ??= `[${Array.from({ length: 1536 }, () => "0").join(",")}]`;
  return cachedZeroEmbedding;
}

async function queryOne<T extends QueryResultRow>(
  client: PoolClient,
  text: string,
  values: unknown[] = []
) {
  const result = await client.query<T>(text, values);
  return result.rows[0] ?? null;
}

async function queryMany<T extends QueryResultRow>(
  client: PoolClient,
  text: string,
  values: unknown[] = []
) {
  const result = await client.query<T>(text, values);
  return result.rows;
}
