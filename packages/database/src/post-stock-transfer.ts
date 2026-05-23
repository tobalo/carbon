import { nanoid } from "nanoid";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";
import { getPostgresConnectionPool } from "./postgres.ts";

type ExpiredEntityPolicy = "Warn" | "Block" | "BlockWithOverride";

export const postStockTransferArgsValidator = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("inventory"),
    stockTransferId: z.string(),
    stockTransferLineId: z.string(),
    quantity: z.number().positive(),
    locationId: z.string(),
    userId: z.string(),
    companyId: z.string()
  }),
  z.object({
    type: z.literal("unpickInventory"),
    stockTransferId: z.string(),
    stockTransferLineId: z.string(),
    locationId: z.string(),
    userId: z.string(),
    companyId: z.string()
  }),
  z.object({
    type: z.literal("serial"),
    stockTransferId: z.string(),
    stockTransferLineId: z.string(),
    trackedEntityId: z.string(),
    fromStorageUnitId: z.string().nullable(),
    locationId: z.string(),
    userId: z.string(),
    companyId: z.string()
  }),
  z.object({
    type: z.literal("batch"),
    stockTransferId: z.string(),
    stockTransferLineId: z.string(),
    trackedEntityId: z.string(),
    fromStorageUnitId: z.string().nullable(),
    quantity: z.number().positive(),
    overrideExpired: z.boolean().optional(),
    overrideReason: z.string().optional(),
    locationId: z.string(),
    userId: z.string(),
    companyId: z.string()
  }),
  z.object({
    type: z.literal("unpickSerial"),
    stockTransferId: z.string(),
    stockTransferLineId: z.string(),
    trackedEntityId: z.string(),
    locationId: z.string(),
    userId: z.string(),
    companyId: z.string()
  }),
  z.object({
    type: z.literal("unpickBatch"),
    stockTransferId: z.string(),
    stockTransferLineId: z.string(),
    trackedEntityId: z.string(),
    locationId: z.string(),
    userId: z.string(),
    companyId: z.string()
  })
]);

type PostStockTransferArgs = z.infer<typeof postStockTransferArgsValidator>;

type StockTransferLineRow = {
  id: string;
  itemId: string;
  fromStorageUnitId: string | null;
  toStorageUnitId: string | null;
  pickedQuantity: string | number;
  quantity: string | number;
};

type TrackedEntityRow = {
  id: string;
  sourceDocument: string;
  sourceDocumentId: string;
  sourceDocumentReadableId: string | null;
  quantity: string | number;
  status: string;
  attributes: Record<string, unknown> | null;
  itemId: string | null;
  expirationDate: Date | string | null;
};

type TrackedActivityRow = {
  id: string;
};

let postStockTransferPool: Pool | null = null;

export async function postStockTransfer(args: PostStockTransferArgs) {
  if (!args.companyId) throw new Error("Payload is missing companyId");
  if (!args.userId) throw new Error("Payload is missing userId");

  const pool = getPostStockTransferPool();
  const client = await pool.connect();
  let expiredWarning: string | undefined;

  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [
      args.userId
    ]);

    switch (args.type) {
      case "inventory":
        await postInventoryTransfer(client, args);
        break;
      case "unpickInventory":
        await unpickInventoryTransfer(client, args);
        break;
      case "serial":
        await postSerialTransfer(client, args);
        break;
      case "batch":
        expiredWarning = await postBatchTransfer(client, args);
        break;
      case "unpickSerial":
        await unpickSerialTransfer(client, args);
        break;
      case "unpickBatch":
        await unpickBatchTransfer(client, args);
        break;
      default:
        assertNever(args);
    }

    await client.query("COMMIT");
    return { success: true, warning: expiredWarning };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function closePostStockTransferPool() {
  if (!postStockTransferPool) return;
  await postStockTransferPool.end();
  postStockTransferPool = null;
}

function getPostStockTransferPool() {
  postStockTransferPool ??= getPostgresConnectionPool(
    Number(process.env.DATABASE_SERVICE_POOL_SIZE ?? 5),
    { kind: "service" }
  );
  return postStockTransferPool;
}

async function postInventoryTransfer(
  client: PoolClient,
  args: Extract<PostStockTransferArgs, { type: "inventory" }>
) {
  const stockTransferLine = await getStockTransferLine(client, args);

  await insertItemLedgerEntry(client, {
    entryType: "Transfer",
    documentType: "Direct Transfer",
    documentId: args.stockTransferId,
    companyId: args.companyId,
    itemId: stockTransferLine.itemId,
    quantity: -args.quantity,
    locationId: args.locationId,
    storageUnitId: stockTransferLine.fromStorageUnitId,
    trackedEntityId: null,
    trackedEntityStatus: null,
    userId: args.userId
  });

  await insertItemLedgerEntry(client, {
    entryType: "Transfer",
    documentType: "Direct Transfer",
    documentId: args.stockTransferId,
    companyId: args.companyId,
    itemId: stockTransferLine.itemId,
    quantity: args.quantity,
    locationId: args.locationId,
    storageUnitId: stockTransferLine.toStorageUnitId,
    trackedEntityId: null,
    trackedEntityStatus: null,
    userId: args.userId
  });

  await updateStockTransferLine(client, args, {
    pickedQuantity: toNumber(stockTransferLine.pickedQuantity) + args.quantity
  });
}

async function unpickInventoryTransfer(
  client: PoolClient,
  args: Extract<PostStockTransferArgs, { type: "unpickInventory" }>
) {
  const stockTransferLine = await getStockTransferLine(client, args);
  const currentPickedQuantity = toNumber(stockTransferLine.pickedQuantity);

  if (currentPickedQuantity > 0) {
    await insertItemLedgerEntry(client, {
      entryType: "Transfer",
      documentType: "Direct Transfer",
      documentId: args.stockTransferId,
      companyId: args.companyId,
      itemId: stockTransferLine.itemId,
      quantity: currentPickedQuantity,
      locationId: args.locationId,
      storageUnitId: stockTransferLine.fromStorageUnitId,
      trackedEntityId: null,
      trackedEntityStatus: null,
      userId: args.userId
    });

    await insertItemLedgerEntry(client, {
      entryType: "Transfer",
      documentType: "Direct Transfer",
      documentId: args.stockTransferId,
      companyId: args.companyId,
      itemId: stockTransferLine.itemId,
      quantity: -currentPickedQuantity,
      locationId: args.locationId,
      storageUnitId: stockTransferLine.toStorageUnitId,
      trackedEntityId: null,
      trackedEntityStatus: null,
      userId: args.userId
    });
  }

  await updateStockTransferLine(client, args, {
    trackedEntityId: null,
    pickedQuantity: 0
  });
}

async function postSerialTransfer(
  client: PoolClient,
  args: Extract<PostStockTransferArgs, { type: "serial" }>
) {
  const stockTransferLine = await getStockTransferLine(client, args);
  const transferActivityId = await createTrackedActivity(client, {
    type: "Transfer",
    sourceDocument: "Stock Transfer",
    sourceDocumentId: args.stockTransferId,
    attributes: {
      "Stock Transfer": args.stockTransferId,
      "Stock Transfer Line": args.stockTransferLineId,
      "From Location": args.locationId,
      "To Location": args.locationId,
      "From Shelf": stockTransferLine.fromStorageUnitId,
      "To Shelf": stockTransferLine.toStorageUnitId
    },
    companyId: args.companyId,
    userId: args.userId
  });

  await insertTrackedActivityInput(client, {
    trackedActivityId: transferActivityId,
    trackedEntityId: args.trackedEntityId,
    quantity: 1,
    companyId: args.companyId,
    userId: args.userId
  });

  await insertItemLedgerEntry(client, {
    entryType: "Transfer",
    documentType: "Direct Transfer",
    documentId: args.stockTransferId,
    companyId: args.companyId,
    itemId: stockTransferLine.itemId,
    quantity: -1,
    locationId: args.locationId,
    storageUnitId: args.fromStorageUnitId,
    trackedEntityId: args.trackedEntityId,
    trackedEntityStatus: null,
    userId: args.userId
  });

  await insertItemLedgerEntry(client, {
    entryType: "Transfer",
    documentType: "Direct Transfer",
    documentId: args.stockTransferId,
    companyId: args.companyId,
    itemId: stockTransferLine.itemId,
    quantity: 1,
    locationId: args.locationId,
    storageUnitId: stockTransferLine.toStorageUnitId,
    trackedEntityId: args.trackedEntityId,
    trackedEntityStatus: null,
    userId: args.userId
  });

  await updateStockTransferLine(client, args, {
    trackedEntityId: args.trackedEntityId,
    fromStorageUnitId: args.fromStorageUnitId,
    pickedQuantity: toNumber(stockTransferLine.pickedQuantity) + 1
  });
}

async function postBatchTransfer(
  client: PoolClient,
  args: Extract<PostStockTransferArgs, { type: "batch" }>
) {
  const stockTransferLine = await getStockTransferLine(client, args);
  const trackedEntity = await getTrackedEntity(
    client,
    args.trackedEntityId,
    args.companyId
  );
  const policy = await getExpiredEntityPolicy(client, args.companyId);
  const expiredCheck = checkExpiredEntity(
    { id: trackedEntity.id, expirationDate: trackedEntity.expirationDate },
    policy,
    {
      allowed: Boolean(args.overrideExpired),
      reason: args.overrideReason ?? null
    }
  );

  const entityQuantity = toNumber(trackedEntity.quantity);
  const transferQuantity = args.quantity;

  if (entityQuantity !== transferQuantity) {
    await splitBatchForTransfer(client, {
      stockTransferLine,
      trackedEntity,
      stockTransferId: args.stockTransferId,
      trackedEntityId: args.trackedEntityId,
      fromStorageUnitId: args.fromStorageUnitId,
      locationId: args.locationId,
      transferQuantity,
      entityQuantity,
      companyId: args.companyId,
      userId: args.userId
    });
  }

  const transferActivityId = await createTrackedActivity(client, {
    type: "Transfer",
    sourceDocument: "Stock Transfer",
    sourceDocumentId: args.stockTransferId,
    attributes: {
      "Stock Transfer": args.stockTransferId,
      "Stock Transfer Line": args.stockTransferLineId,
      "From Location": args.locationId,
      "To Location": args.locationId,
      "From Shelf": stockTransferLine.fromStorageUnitId,
      "To Shelf": stockTransferLine.toStorageUnitId
    },
    companyId: args.companyId,
    userId: args.userId
  });

  await insertTrackedActivityInput(client, {
    trackedActivityId: transferActivityId,
    trackedEntityId: args.trackedEntityId,
    quantity: transferQuantity,
    companyId: args.companyId,
    userId: args.userId
  });

  await client.query(
    `UPDATE "trackedEntity"
     SET status = 'Consumed'
     WHERE id = $1 AND "companyId" = $2`,
    [args.trackedEntityId, args.companyId]
  );

  await insertItemLedgerEntry(client, {
    entryType: "Transfer",
    documentType: "Direct Transfer",
    documentId: args.stockTransferId,
    companyId: args.companyId,
    itemId: stockTransferLine.itemId,
    quantity: -transferQuantity,
    locationId: args.locationId,
    storageUnitId: args.fromStorageUnitId,
    trackedEntityId: args.trackedEntityId,
    trackedEntityStatus: null,
    userId: args.userId
  });

  await insertItemLedgerEntry(client, {
    entryType: "Transfer",
    documentType: "Direct Transfer",
    documentId: args.stockTransferId,
    companyId: args.companyId,
    itemId: stockTransferLine.itemId,
    quantity: transferQuantity,
    locationId: args.locationId,
    storageUnitId: stockTransferLine.toStorageUnitId,
    trackedEntityId: args.trackedEntityId,
    trackedEntityStatus: null,
    userId: args.userId
  });

  await updateStockTransferLine(client, args, {
    trackedEntityId: args.trackedEntityId,
    fromStorageUnitId: args.fromStorageUnitId,
    pickedQuantity: transferQuantity
  });

  return expiredCheck.warning;
}

async function splitBatchForTransfer(
  client: PoolClient,
  args: {
    stockTransferLine: StockTransferLineRow;
    trackedEntity: TrackedEntityRow;
    stockTransferId: string;
    trackedEntityId: string;
    fromStorageUnitId: string | null;
    locationId: string;
    transferQuantity: number;
    entityQuantity: number;
    companyId: string;
    userId: string;
  }
) {
  const remainingQuantity = args.entityQuantity - args.transferQuantity;
  const newTrackedEntityId = nanoid();
  const splitActivityId = await createTrackedActivity(client, {
    type: "Split",
    sourceDocument: "Stock Transfer",
    sourceDocumentId: args.stockTransferId,
    attributes: {
      "Original Quantity": args.entityQuantity,
      "Transfer Quantity": args.transferQuantity,
      "Remaining Quantity": remainingQuantity,
      "Split Entity ID": newTrackedEntityId
    },
    companyId: args.companyId,
    userId: args.userId
  });

  await insertTrackedActivityInput(client, {
    trackedActivityId: splitActivityId,
    trackedEntityId: args.trackedEntityId,
    quantity: args.entityQuantity,
    companyId: args.companyId,
    userId: args.userId
  });

  await client.query(
    `INSERT INTO "trackedEntity" (
       id, "sourceDocument", "sourceDocumentId", "sourceDocumentReadableId",
       quantity, status, attributes, "itemId", "expirationDate",
       "companyId", "createdAt", "createdBy"
     )
     VALUES (
       $1, $2, $3, $4, $5, 'Available', $6::jsonb, $7, $8,
       $9, NOW(), $10
     )`,
    [
      newTrackedEntityId,
      args.trackedEntity.sourceDocument,
      args.trackedEntity.sourceDocumentId,
      args.trackedEntity.sourceDocumentReadableId,
      remainingQuantity,
      JSON.stringify(args.trackedEntity.attributes ?? {}),
      args.trackedEntity.itemId,
      args.trackedEntity.expirationDate,
      args.companyId,
      args.userId
    ]
  );

  await insertTrackedActivityOutput(client, {
    trackedActivityId: splitActivityId,
    trackedEntityId: newTrackedEntityId,
    quantity: remainingQuantity,
    companyId: args.companyId,
    userId: args.userId
  });
  await insertTrackedActivityOutput(client, {
    trackedActivityId: splitActivityId,
    trackedEntityId: args.trackedEntityId,
    quantity: args.transferQuantity,
    companyId: args.companyId,
    userId: args.userId
  });

  await client.query(
    `UPDATE "trackedEntity"
     SET quantity = $1,
         attributes = $2::jsonb
     WHERE id = $3 AND "companyId" = $4`,
    [
      args.transferQuantity,
      JSON.stringify({
        ...(args.trackedEntity.attributes ?? {}),
        "Split Entity ID": newTrackedEntityId
      }),
      args.trackedEntityId,
      args.companyId
    ]
  );

  await insertItemLedgerEntry(client, {
    entryType: "Negative Adjmt.",
    documentType: "Batch Split",
    documentId: splitActivityId,
    companyId: args.companyId,
    itemId: args.stockTransferLine.itemId,
    quantity: -args.entityQuantity,
    locationId: args.locationId,
    storageUnitId: args.fromStorageUnitId,
    trackedEntityId: args.trackedEntityId,
    trackedEntityStatus: null,
    userId: args.userId
  });
  await insertItemLedgerEntry(client, {
    entryType: "Positive Adjmt.",
    documentType: "Batch Split",
    documentId: splitActivityId,
    companyId: args.companyId,
    itemId: args.stockTransferLine.itemId,
    quantity: args.transferQuantity,
    locationId: args.locationId,
    storageUnitId: args.fromStorageUnitId,
    trackedEntityId: args.trackedEntityId,
    trackedEntityStatus: null,
    userId: args.userId
  });
  await insertItemLedgerEntry(client, {
    entryType: "Positive Adjmt.",
    documentType: "Batch Split",
    documentId: splitActivityId,
    companyId: args.companyId,
    itemId: args.stockTransferLine.itemId,
    quantity: remainingQuantity,
    locationId: args.locationId,
    storageUnitId: args.fromStorageUnitId,
    trackedEntityId: newTrackedEntityId,
    trackedEntityStatus: null,
    userId: args.userId
  });
}

async function unpickSerialTransfer(
  client: PoolClient,
  args: Extract<PostStockTransferArgs, { type: "unpickSerial" }>
) {
  const stockTransferLine = await getStockTransferLine(client, args);
  const trackedEntity = await getTrackedEntity(
    client,
    args.trackedEntityId,
    args.companyId
  );
  const transferActivity = await getTransferActivity(client, args);

  await insertItemLedgerEntry(client, {
    entryType: "Transfer",
    documentType: "Direct Transfer",
    documentId: args.stockTransferId,
    companyId: args.companyId,
    itemId: stockTransferLine.itemId,
    quantity: -1,
    locationId: args.locationId,
    storageUnitId: stockTransferLine.toStorageUnitId,
    trackedEntityId: args.trackedEntityId,
    trackedEntityStatus: null,
    userId: args.userId
  });
  await insertItemLedgerEntry(client, {
    entryType: "Transfer",
    documentType: "Direct Transfer",
    documentId: args.stockTransferId,
    companyId: args.companyId,
    itemId: stockTransferLine.itemId,
    quantity: 1,
    locationId: args.locationId,
    storageUnitId: stockTransferLine.fromStorageUnitId,
    trackedEntityId: args.trackedEntityId,
    trackedEntityStatus: null,
    userId: args.userId
  });

  await deleteTransferActivity(client, transferActivity.id);
  await client.query(
    `UPDATE "trackedEntity"
     SET status = 'Available',
         attributes = $1::jsonb
     WHERE id = $2 AND "companyId" = $3`,
    [
      JSON.stringify({
        ...(trackedEntity.attributes ?? {}),
        Shelf: stockTransferLine.fromStorageUnitId
      }),
      args.trackedEntityId,
      args.companyId
    ]
  );

  await updateStockTransferLine(client, args, {
    trackedEntityId: null,
    pickedQuantity: Math.max(0, toNumber(stockTransferLine.pickedQuantity) - 1)
  });
}

async function unpickBatchTransfer(
  client: PoolClient,
  args: Extract<PostStockTransferArgs, { type: "unpickBatch" }>
) {
  const stockTransferLine = await getStockTransferLine(client, args);
  const trackedEntity = await getTrackedEntity(
    client,
    args.trackedEntityId,
    args.companyId
  );
  const transferActivity = await getTransferActivity(client, args);
  const transferQuantity = toNumber(trackedEntity.quantity);
  const splitEntityId = trackedEntity.attributes?.["Split Entity ID"] as
    | string
    | undefined;

  if (splitEntityId) {
    await unpickSplitBatchTransfer(client, {
      args,
      stockTransferLine,
      trackedEntity,
      splitEntityId,
      transferQuantity
    });
  } else {
    await client.query(
      `UPDATE "trackedEntity"
       SET status = 'Available',
           attributes = $1::jsonb
       WHERE id = $2 AND "companyId" = $3`,
      [
        JSON.stringify({
          ...(trackedEntity.attributes ?? {}),
          Shelf: stockTransferLine.fromStorageUnitId
        }),
        args.trackedEntityId,
        args.companyId
      ]
    );

    await insertItemLedgerEntry(client, {
      entryType: "Transfer",
      documentType: "Direct Transfer",
      documentId: args.stockTransferId,
      companyId: args.companyId,
      itemId: stockTransferLine.itemId,
      quantity: transferQuantity,
      locationId: args.locationId,
      storageUnitId: stockTransferLine.fromStorageUnitId,
      trackedEntityId: args.trackedEntityId,
      trackedEntityStatus: null,
      userId: args.userId
    });
    await insertItemLedgerEntry(client, {
      entryType: "Transfer",
      documentType: "Direct Transfer",
      documentId: args.stockTransferId,
      companyId: args.companyId,
      itemId: stockTransferLine.itemId,
      quantity: -transferQuantity,
      locationId: args.locationId,
      storageUnitId: stockTransferLine.toStorageUnitId,
      trackedEntityId: args.trackedEntityId,
      trackedEntityStatus: null,
      userId: args.userId
    });
  }

  await deleteTransferActivity(client, transferActivity.id);
  await updateStockTransferLine(client, args, {
    trackedEntityId: null,
    pickedQuantity: Math.max(
      0,
      toNumber(stockTransferLine.pickedQuantity) - transferQuantity
    )
  });
}

async function unpickSplitBatchTransfer(
  client: PoolClient,
  input: {
    args: Extract<PostStockTransferArgs, { type: "unpickBatch" }>;
    stockTransferLine: StockTransferLineRow;
    trackedEntity: TrackedEntityRow;
    splitEntityId: string;
    transferQuantity: number;
  }
) {
  const { args, stockTransferLine, trackedEntity, splitEntityId } = input;
  const originalEntity = await getTrackedEntity(client, splitEntityId, args.companyId);
  const originalQuantity =
    toNumber(originalEntity.quantity) + input.transferQuantity;
  const splitActivity = await queryOneRequired<TrackedActivityRow>(
    client,
    `SELECT id
     FROM "trackedActivity"
     WHERE type = 'Split'
       AND "sourceDocument" = 'Stock Transfer'
       AND "sourceDocumentId" = $1
       AND "companyId" = $2
     ORDER BY "createdAt" DESC
     LIMIT 1`,
    [args.stockTransferId, args.companyId]
  );

  await client.query(
    `UPDATE "trackedEntity"
     SET status = 'Consumed', quantity = 0
     WHERE id = $1 AND "companyId" = $2`,
    [splitEntityId, args.companyId]
  );

  await client.query(
    `UPDATE "trackedEntity"
     SET status = 'Available', quantity = $1
     WHERE id = $2 AND "companyId" = $3`,
    [originalQuantity, args.trackedEntityId, args.companyId]
  );

  await insertItemLedgerEntry(client, {
    entryType: "Positive Adjmt.",
    documentType: "Direct Transfer",
    documentId: args.stockTransferId,
    companyId: args.companyId,
    itemId: stockTransferLine.itemId,
    quantity: originalQuantity,
    locationId: args.locationId,
    storageUnitId: stockTransferLine.fromStorageUnitId,
    trackedEntityId: args.trackedEntityId,
    trackedEntityStatus: null,
    userId: args.userId
  });
  await insertItemLedgerEntry(client, {
    entryType: "Negative Adjmt.",
    documentType: "Direct Transfer",
    documentId: args.stockTransferId,
    companyId: args.companyId,
    itemId: stockTransferLine.itemId,
    quantity: -input.transferQuantity,
    locationId: args.locationId,
    storageUnitId: stockTransferLine.toStorageUnitId,
    trackedEntityId: args.trackedEntityId,
    trackedEntityStatus: null,
    userId: args.userId
  });
  await insertItemLedgerEntry(client, {
    entryType: "Negative Adjmt.",
    documentType: "Direct Transfer",
    documentId: args.stockTransferId,
    companyId: args.companyId,
    itemId: stockTransferLine.itemId,
    quantity: -(originalQuantity - input.transferQuantity),
    locationId: args.locationId,
    storageUnitId: stockTransferLine.fromStorageUnitId,
    trackedEntityId: splitEntityId,
    trackedEntityStatus: null,
    userId: args.userId
  });

  await client.query(
    `DELETE FROM "trackedActivityOutput" WHERE "trackedActivityId" = $1`,
    [splitActivity.id]
  );
  await client.query(
    `DELETE FROM "trackedActivityInput" WHERE "trackedActivityId" = $1`,
    [splitActivity.id]
  );
  await client.query(`DELETE FROM "trackedActivity" WHERE id = $1`, [
    splitActivity.id
  ]);

  void trackedEntity;
}

async function getExpiredEntityPolicy(
  client: PoolClient,
  companyId: string
): Promise<ExpiredEntityPolicy> {
  const row = await queryOne<{
    inventoryShelfLife: { expiredEntityPolicy?: ExpiredEntityPolicy } | null;
  }>(
    client,
    `SELECT "inventoryShelfLife"
     FROM "companySettings"
     WHERE id = $1`,
    [companyId]
  );

  return row?.inventoryShelfLife?.expiredEntityPolicy ?? "Block";
}

function checkExpiredEntity(
  entity: { id: string; expirationDate: Date | string | null },
  policy: ExpiredEntityPolicy,
  override: { allowed: boolean; reason: string | null }
) {
  if (!entity.expirationDate) return {};
  const expiration =
    entity.expirationDate instanceof Date
      ? entity.expirationDate
      : new Date(`${entity.expirationDate}T00:00:00`);
  const now = new Date();
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (Number.isNaN(expiration.valueOf()) || expiration >= todayLocal) return {};

  if (policy === "Warn") {
    return { warning: `Transferred expired tracked entity: ${entity.id}` };
  }

  if (
    policy === "BlockWithOverride" &&
    override.allowed &&
    override.reason?.trim()
  ) {
    return {};
  }

  throw new Error(`Cannot transfer expired tracked entity: ${entity.id}`);
}

async function getStockTransferLine(
  client: PoolClient,
  args: { stockTransferLineId: string; companyId: string }
) {
  return queryOneRequired<StockTransferLineRow>(
    client,
    `SELECT id, "itemId", "fromStorageUnitId", "toStorageUnitId",
            "pickedQuantity", quantity
     FROM "stockTransferLine"
     WHERE id = $1 AND "companyId" = $2`,
    [args.stockTransferLineId, args.companyId]
  );
}

async function getTrackedEntity(
  client: PoolClient,
  trackedEntityId: string,
  companyId: string
) {
  return queryOneRequired<TrackedEntityRow>(
    client,
    `SELECT id, "sourceDocument", "sourceDocumentId",
            "sourceDocumentReadableId", quantity, status, attributes,
            "itemId", "expirationDate"
     FROM "trackedEntity"
     WHERE id = $1 AND "companyId" = $2`,
    [trackedEntityId, companyId]
  );
}

async function getTransferActivity(
  client: PoolClient,
  args: {
    stockTransferId: string;
    trackedEntityId: string;
    companyId: string;
  }
) {
  return queryOneRequired<TrackedActivityRow>(
    client,
    `SELECT ta.id
     FROM "trackedActivity" ta
     INNER JOIN "trackedActivityInput" tai
       ON ta.id = tai."trackedActivityId"
     WHERE ta.type = 'Transfer'
       AND ta."sourceDocument" = 'Stock Transfer'
       AND ta."sourceDocumentId" = $1
       AND tai."trackedEntityId" = $2
       AND ta."companyId" = $3
     ORDER BY ta."createdAt" DESC
     LIMIT 1`,
    [args.stockTransferId, args.trackedEntityId, args.companyId]
  );
}

async function createTrackedActivity(
  client: PoolClient,
  args: {
    type: string;
    sourceDocument: string;
    sourceDocumentId: string;
    attributes: Record<string, unknown>;
    companyId: string;
    userId: string;
  }
) {
  const id = nanoid();
  await client.query(
    `INSERT INTO "trackedActivity" (
       id, type, "sourceDocument", "sourceDocumentId", attributes,
       "companyId", "createdAt", "createdBy"
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW(), $7)`,
    [
      id,
      args.type,
      args.sourceDocument,
      args.sourceDocumentId,
      JSON.stringify(args.attributes),
      args.companyId,
      args.userId
    ]
  );
  return id;
}

async function insertTrackedActivityInput(
  client: PoolClient,
  args: {
    trackedActivityId: string;
    trackedEntityId: string;
    quantity: number;
    companyId: string;
    userId: string;
  }
) {
  await client.query(
    `INSERT INTO "trackedActivityInput" (
       "trackedActivityId", "trackedEntityId", quantity,
       "companyId", "createdAt", "createdBy"
     )
     VALUES ($1, $2, $3, $4, NOW(), $5)`,
    [
      args.trackedActivityId,
      args.trackedEntityId,
      args.quantity,
      args.companyId,
      args.userId
    ]
  );
}

async function insertTrackedActivityOutput(
  client: PoolClient,
  args: {
    trackedActivityId: string;
    trackedEntityId: string;
    quantity: number;
    companyId: string;
    userId: string;
  }
) {
  await client.query(
    `INSERT INTO "trackedActivityOutput" (
       "trackedActivityId", "trackedEntityId", quantity,
       "companyId", "createdAt", "createdBy"
     )
     VALUES ($1, $2, $3, $4, NOW(), $5)`,
    [
      args.trackedActivityId,
      args.trackedEntityId,
      args.quantity,
      args.companyId,
      args.userId
    ]
  );
}

async function insertItemLedgerEntry(
  client: PoolClient,
  args: {
    entryType: string;
    documentType: string;
    documentId: string;
    companyId: string;
    itemId: string;
    quantity: number;
    locationId: string | null;
    storageUnitId: string | null;
    trackedEntityId: string | null;
    trackedEntityStatus: string | null;
    userId: string;
  }
) {
  await client.query(
    `SELECT insert_item_ledger_entry(
       $1::"itemLedgerType", $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
     )`,
    [
      args.entryType,
      args.documentType,
      args.documentId,
      args.companyId,
      args.itemId,
      args.quantity,
      args.locationId,
      args.storageUnitId,
      args.trackedEntityId,
      args.trackedEntityStatus,
      args.userId
    ]
  );
}

async function updateStockTransferLine(
  client: PoolClient,
  args: { stockTransferLineId: string; companyId: string; userId: string },
  values: {
    trackedEntityId?: string | null;
    fromStorageUnitId?: string | null;
    pickedQuantity: number;
  }
) {
  await client.query(
    `UPDATE "stockTransferLine"
     SET "trackedEntityId" = COALESCE($1, "trackedEntityId"),
         "fromStorageUnitId" = COALESCE($2, "fromStorageUnitId"),
         "pickedQuantity" = $3,
         "updatedBy" = $4,
         "updatedAt" = NOW()
     WHERE id = $5 AND "companyId" = $6`,
    [
      values.trackedEntityId,
      values.fromStorageUnitId,
      values.pickedQuantity,
      args.userId,
      args.stockTransferLineId,
      args.companyId
    ]
  );

  if (Object.hasOwn(values, "trackedEntityId") && values.trackedEntityId === null) {
    await client.query(
      `UPDATE "stockTransferLine"
       SET "trackedEntityId" = NULL
       WHERE id = $1 AND "companyId" = $2`,
      [args.stockTransferLineId, args.companyId]
    );
  }
}

async function deleteTransferActivity(client: PoolClient, trackedActivityId: string) {
  await client.query(
    `DELETE FROM "trackedActivityInput" WHERE "trackedActivityId" = $1`,
    [trackedActivityId]
  );
  await client.query(`DELETE FROM "trackedActivity" WHERE id = $1`, [
    trackedActivityId
  ]);
}

function toNumber(value: string | number | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

async function queryOne<T extends QueryResultRow>(
  client: PoolClient,
  text: string,
  values: unknown[] = []
) {
  const result = await client.query<T>(text, values);
  return result.rows[0] ?? null;
}

async function queryOneRequired<T extends QueryResultRow>(
  client: PoolClient,
  text: string,
  values: unknown[] = []
) {
  const row = await queryOne<T>(client, text, values);
  if (!row) throw new Error("Required row not found");
  return row;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled post-stock-transfer payload: ${JSON.stringify(value)}`);
}
