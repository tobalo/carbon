import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";
import { getPostgresConnectionPool } from "./postgres.ts";

export const postReceiptArgsValidator = z.object({
  type: z.enum(["post", "void"]).default("post"),
  receiptId: z.string(),
  userId: z.string(),
  companyId: z.string()
});

type PostReceiptArgs = z.infer<typeof postReceiptArgsValidator>;

type ReceiptRow = {
  id: string;
  receiptId: string;
  status: "Draft" | "Pending" | "Posted" | "Voided";
  sourceDocument: unknown;
  sourceDocumentId: string | null;
  sourceDocumentReadableId: string | null;
  externalDocumentId: string | null;
  invoiced: boolean | null;
};

type ReceiptLineRow = {
  id: string;
  itemId: string;
  lineId: string | null;
  locationId: string | null;
  storageUnitId: string | null;
  receivedQuantity: string | number;
  conversionFactor: string | number | null;
  requiresBatchTracking: boolean;
  requiresSerialTracking: boolean;
};

type PurchaseOrderRow = {
  id: string;
  status: string;
};

type PurchaseOrderLineRow = {
  id: string;
  purchaseOrderId: string;
  purchaseOrderLineType: string;
  purchaseQuantity: string | number | null;
  quantityReceived: string | number | null;
  receivedComplete: boolean;
  invoicedComplete: boolean;
};

type WarehouseTransferLineRow = {
  id: string;
  transferId: string;
  quantity: string | number;
  shippedQuantity: string | number;
  receivedQuantity: string | number;
};

type ItemLedgerRow = {
  entryType: string;
  documentType: unknown;
  documentId: string | null;
  itemId: string;
  quantity: string | number;
  locationId: string | null;
  storageUnitId: string | null;
  trackedEntityId: string | null;
  trackedEntityStatus: unknown;
};

let postReceiptPool: Pool | null = null;

export async function postReceipt(args: PostReceiptArgs) {
  if (!args.companyId) throw new Error("Payload is missing companyId");
  if (!args.userId) throw new Error("Payload is missing userId");

  const pool = getPostReceiptPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [
      args.userId
    ]);

    if (args.type === "void") {
      await voidReceipt(client, args);
    } else {
      await postReceiptTransaction(client, args);
    }

    await client.query("COMMIT");
    return { success: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (args.type !== "void") {
      await resetReceiptToDraft(args).catch(() => undefined);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function closePostReceiptPool() {
  if (!postReceiptPool) return;
  await postReceiptPool.end();
  postReceiptPool = null;
}

function getPostReceiptPool() {
  postReceiptPool ??= getPostgresConnectionPool(
    Number(process.env.DATABASE_SERVICE_POOL_SIZE ?? 5),
    { kind: "service" }
  );
  return postReceiptPool;
}

async function postReceiptTransaction(
  client: PoolClient,
  args: PostReceiptArgs
) {
  const receipt = await loadReceipt(client, args);
  if (receipt.status === "Posted") return;
  if (receipt.status === "Voided") {
    throw new Error("Cannot post a voided receipt");
  }

  const sourceDocument = unwrapJsonText(receipt.sourceDocument);
  switch (sourceDocument) {
    case "Purchase Order":
      await postPurchaseOrderReceipt(client, args, receipt);
      break;
    case "Inbound Transfer":
      await postInboundTransferReceipt(client, args, receipt);
      break;
    default:
      throw new Error(`Receipt source document is not supported: ${sourceDocument}`);
  }

  await client.query(
    `
      UPDATE "receipt"
      SET status = 'Posted',
          "postingDate" = CURRENT_DATE,
          "postedBy" = $1,
          "updatedAt" = NOW(),
          "updatedBy" = $1
      WHERE id = $2 AND "companyId" = $3
    `,
    [args.userId, args.receiptId, args.companyId]
  );
}

async function voidReceipt(client: PoolClient, args: PostReceiptArgs) {
  const receipt = await loadReceipt(client, args);
  if (receipt.status !== "Posted") {
    throw new Error("Can only void posted receipts");
  }
  if (receipt.invoiced) {
    throw new Error(
      "Cannot void a receipt created by a purchase invoice. Void the invoice instead."
    );
  }

  const sourceDocument = unwrapJsonText(receipt.sourceDocument);
  if (sourceDocument !== "Purchase Order") {
    throw new Error(
      `Void is only supported for receipts with source document "Purchase Order"`
    );
  }

  const lines = await loadReceiptLines(client, args);
  await reverseItemLedger(client, args);
  await reversePurchaseOrderReceiptQuantities(client, args, receipt, lines);

  await client.query(
    `
      UPDATE "receipt"
      SET status = 'Voided',
          "updatedAt" = NOW(),
          "updatedBy" = $1
      WHERE id = $2 AND "companyId" = $3
    `,
    [args.userId, args.receiptId, args.companyId]
  );
}

async function postPurchaseOrderReceipt(
  client: PoolClient,
  args: PostReceiptArgs,
  receipt: ReceiptRow
) {
  if (!receipt.sourceDocumentId) {
    throw new Error("Receipt has no sourceDocumentId");
  }

  const purchaseOrder = await loadPurchaseOrder(
    client,
    receipt.sourceDocumentId,
    args.companyId
  );
  const receiptLines = await loadReceiptLines(client, args);
  const purchaseOrderLines = await loadPurchaseOrderLines(
    client,
    receipt.sourceDocumentId,
    args.companyId
  );
  if (!purchaseOrder) throw new Error("Failed to fetch purchase order");

  const purchaseOrderLinesById = new Map(
    purchaseOrderLines.map((line) => [line.id, line])
  );

  for (const receiptLine of receiptLines) {
    const purchaseOrderLine = purchaseOrderLinesById.get(
      receiptLine.lineId ?? ""
    );
    if (!purchaseOrderLine) continue;

    const receivedQuantity = toNumber(receiptLine.receivedQuantity);
    const conversionFactor = toNumber(receiptLine.conversionFactor, 1);
    const receivedPurchaseQuantity = receivedQuantity / conversionFactor;
    const newQuantityReceived = Math.max(
      0,
      toNumber(purchaseOrderLine.quantityReceived) + receivedPurchaseQuantity
    );
    const purchaseQuantity = toNumber(purchaseOrderLine.purchaseQuantity);
    const receivedComplete =
      purchaseQuantity > 0
        ? newQuantityReceived >= purchaseQuantity
        : purchaseOrderLine.receivedComplete;

    await client.query(
      `
        UPDATE "purchaseOrderLine"
        SET "quantityReceived" = $1,
            "receivedComplete" = $2,
            "receivedDate" = CURRENT_DATE,
            "updatedAt" = NOW(),
            "updatedBy" = $3
        WHERE id = $4 AND "companyId" = $5
      `,
      [
        newQuantityReceived,
        receivedComplete,
        args.userId,
        purchaseOrderLine.id,
        args.companyId
      ]
    );

    await insertReceiptItemLedgerEntry(client, args, receiptLine, {
      entryType: receivedQuantity < 0 ? "Negative Adjmt." : "Positive Adjmt.",
      documentType: "Purchase Receipt",
      documentId: receipt.id,
      quantity: receivedQuantity
    });
  }

  await updatePurchaseOrderStatus(client, args, purchaseOrder.id);
}

async function reversePurchaseOrderReceiptQuantities(
  client: PoolClient,
  args: PostReceiptArgs,
  receipt: ReceiptRow,
  receiptLines: ReceiptLineRow[]
) {
  if (!receipt.sourceDocumentId) {
    throw new Error("Receipt has no sourceDocumentId");
  }

  const purchaseOrderLines = await loadPurchaseOrderLines(
    client,
    receipt.sourceDocumentId,
    args.companyId
  );
  const purchaseOrderLinesById = new Map(
    purchaseOrderLines.map((line) => [line.id, line])
  );

  for (const receiptLine of receiptLines) {
    const purchaseOrderLine = purchaseOrderLinesById.get(
      receiptLine.lineId ?? ""
    );
    if (!purchaseOrderLine) continue;

    const receivedPurchaseQuantity =
      toNumber(receiptLine.receivedQuantity) /
      toNumber(receiptLine.conversionFactor, 1);
    const newQuantityReceived = Math.max(
      0,
      toNumber(purchaseOrderLine.quantityReceived) - receivedPurchaseQuantity
    );
    const purchaseQuantity = toNumber(purchaseOrderLine.purchaseQuantity);
    const receivedComplete =
      purchaseQuantity > 0 ? newQuantityReceived >= purchaseQuantity : false;

    await client.query(
      `
        UPDATE "purchaseOrderLine"
        SET "quantityReceived" = $1,
            "receivedComplete" = $2,
            "updatedAt" = NOW(),
            "updatedBy" = $3
        WHERE id = $4 AND "companyId" = $5
      `,
      [
        newQuantityReceived,
        receivedComplete,
        args.userId,
        purchaseOrderLine.id,
        args.companyId
      ]
    );
  }

  await updatePurchaseOrderStatus(client, args, receipt.sourceDocumentId);
}

async function postInboundTransferReceipt(
  client: PoolClient,
  args: PostReceiptArgs,
  receipt: ReceiptRow
) {
  if (!receipt.sourceDocumentId) {
    throw new Error("Receipt has no sourceDocumentId");
  }

  const receiptLines = await loadReceiptLines(client, args);
  const transferLines = await queryMany<WarehouseTransferLineRow>(
    client,
    `
      SELECT id, "transferId", quantity, "shippedQuantity", "receivedQuantity"
      FROM "warehouseTransferLine"
      WHERE "transferId" = $1 AND "companyId" = $2
    `,
    [receipt.sourceDocumentId, args.companyId]
  );
  const transferLinesById = new Map(transferLines.map((line) => [line.id, line]));

  for (const receiptLine of receiptLines) {
    const transferLine = transferLinesById.get(receiptLine.lineId ?? "");
    if (!transferLine) continue;

    const receivedQuantity = toNumber(receiptLine.receivedQuantity);
    const newReceivedQuantity = Math.max(
      0,
      toNumber(transferLine.receivedQuantity) + receivedQuantity
    );

    await client.query(
      `
        UPDATE "warehouseTransferLine"
        SET "receivedQuantity" = $1,
            "updatedAt" = NOW(),
            "updatedBy" = $2
        WHERE id = $3 AND "companyId" = $4
      `,
      [newReceivedQuantity, args.userId, transferLine.id, args.companyId]
    );

    await insertReceiptItemLedgerEntry(client, args, receiptLine, {
      entryType: "Transfer",
      documentType: "Transfer Receipt",
      documentId: receipt.sourceDocumentReadableId ?? receipt.sourceDocumentId,
      quantity: receivedQuantity
    });
  }

  await updateWarehouseTransferStatus(client, args, receipt.sourceDocumentId);
}

async function reverseItemLedger(client: PoolClient, args: PostReceiptArgs) {
  const rows = await queryMany<ItemLedgerRow>(
    client,
    `
      SELECT
        "entryType",
        "documentType",
        "documentId",
        "itemId",
        quantity,
        "locationId",
        "storageUnitId",
        "trackedEntityId",
        "trackedEntityStatus"
      FROM "itemLedger"
      WHERE "documentId" = $1 AND "companyId" = $2
    `,
    [args.receiptId, args.companyId]
  );

  for (const row of rows) {
    await insertItemLedgerEntry(client, {
      entryType: reverseEntryType(row.entryType),
      documentType: unwrapJsonText(row.documentType) ?? "Receipt",
      documentId: row.documentId,
      companyId: args.companyId,
      itemId: row.itemId,
      quantity: -toNumber(row.quantity),
      locationId: row.locationId,
      storageUnitId: row.storageUnitId,
      trackedEntityId: row.trackedEntityId,
      trackedEntityStatus: unwrapJsonText(row.trackedEntityStatus),
      userId: args.userId
    });
  }
}

async function insertReceiptItemLedgerEntry(
  client: PoolClient,
  args: PostReceiptArgs,
  receiptLine: ReceiptLineRow,
  ledger: {
    entryType: string;
    documentType: string;
    documentId: string | null;
    quantity: number;
  }
) {
  if (ledger.quantity === 0) return;

  await insertItemLedgerEntry(client, {
    entryType: ledger.entryType,
    documentType: ledger.documentType,
    documentId: ledger.documentId,
    companyId: args.companyId,
    itemId: receiptLine.itemId,
    quantity: ledger.quantity,
    locationId: receiptLine.locationId,
    storageUnitId: receiptLine.storageUnitId,
    trackedEntityId: null,
    trackedEntityStatus: null,
    userId: args.userId
  });
}

async function insertItemLedgerEntry(
  client: PoolClient,
  args: {
    entryType: string;
    documentType: string;
    documentId: string | null;
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

async function updatePurchaseOrderStatus(
  client: PoolClient,
  args: PostReceiptArgs,
  purchaseOrderId: string
) {
  const lines = await loadPurchaseOrderLines(
    client,
    purchaseOrderId,
    args.companyId
  );
  const allInvoiced = lines.every(
    (line) => line.purchaseOrderLineType === "Comment" || line.invoicedComplete
  );
  const allReceived = lines.every(
    (line) =>
      line.purchaseOrderLineType === "Comment" ||
      line.purchaseOrderLineType === "G/L Account" ||
      line.receivedComplete
  );

  let status = "To Receive and Invoice";
  if (allInvoiced && allReceived) status = "Completed";
  else if (allInvoiced) status = "To Receive";
  else if (allReceived) status = "To Invoice";

  await client.query(
    `
      UPDATE "purchaseOrder"
      SET status = $1, "updatedAt" = NOW(), "updatedBy" = $2
      WHERE id = $3 AND "companyId" = $4
    `,
    [status, args.userId, purchaseOrderId, args.companyId]
  );
}

async function updateWarehouseTransferStatus(
  client: PoolClient,
  args: PostReceiptArgs,
  warehouseTransferId: string
) {
  const lines = await queryMany<WarehouseTransferLineRow>(
    client,
    `
      SELECT id, "transferId", quantity, "shippedQuantity", "receivedQuantity"
      FROM "warehouseTransferLine"
      WHERE "transferId" = $1 AND "companyId" = $2
    `,
    [warehouseTransferId, args.companyId]
  );

  const allShipped = lines.every(
    (line) => toNumber(line.shippedQuantity) >= toNumber(line.quantity)
  );
  const allReceived = lines.every(
    (line) => toNumber(line.receivedQuantity) >= toNumber(line.quantity)
  );

  let status = "To Ship and Receive";
  if (allShipped && allReceived) status = "Completed";
  else if (allShipped) status = "To Receive";
  else if (allReceived) status = "To Ship";

  await client.query(
    `
      UPDATE "warehouseTransfer"
      SET status = $1, "updatedAt" = NOW(), "updatedBy" = $2
      WHERE id = $3 AND "companyId" = $4
    `,
    [status, args.userId, warehouseTransferId, args.companyId]
  );
}

async function loadReceipt(client: PoolClient, args: PostReceiptArgs) {
  const receipt = await queryOne<ReceiptRow>(
    client,
    `
      SELECT
        id,
        "receiptId",
        status,
        "sourceDocument",
        "sourceDocumentId",
        "sourceDocumentReadableId",
        "externalDocumentId",
        invoiced
      FROM "receipt"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.receiptId, args.companyId]
  );

  if (!receipt) throw new Error("Failed to fetch receipt");
  return receipt;
}

async function loadReceiptLines(client: PoolClient, args: PostReceiptArgs) {
  return queryMany<ReceiptLineRow>(
    client,
    `
      SELECT
        id,
        "itemId",
        "lineId",
        "locationId",
        "storageUnitId",
        "receivedQuantity",
        "conversionFactor",
        "requiresBatchTracking",
        "requiresSerialTracking"
      FROM "receiptLine"
      WHERE "receiptId" = $1 AND "companyId" = $2
      ORDER BY id
    `,
    [args.receiptId, args.companyId]
  );
}

async function loadPurchaseOrder(
  client: PoolClient,
  purchaseOrderId: string,
  companyId: string
) {
  return queryOne<PurchaseOrderRow>(
    client,
    `
      SELECT id, status
      FROM "purchaseOrder"
      WHERE id = $1 AND "companyId" = $2
    `,
    [purchaseOrderId, companyId]
  );
}

async function loadPurchaseOrderLines(
  client: PoolClient,
  purchaseOrderId: string,
  companyId: string
) {
  return queryMany<PurchaseOrderLineRow>(
    client,
    `
      SELECT
        id,
        "purchaseOrderId",
        "purchaseOrderLineType",
        "purchaseQuantity",
        "quantityReceived",
        "receivedComplete",
        "invoicedComplete"
      FROM "purchaseOrderLine"
      WHERE "purchaseOrderId" = $1 AND "companyId" = $2
      ORDER BY "sortOrder", id
    `,
    [purchaseOrderId, companyId]
  );
}

async function resetReceiptToDraft(args: PostReceiptArgs) {
  const pool = getPostReceiptPool();
  await pool.query(
    `
      UPDATE "receipt"
      SET status = 'Draft', "updatedAt" = NOW(), "updatedBy" = $1
      WHERE id = $2 AND "companyId" = $3
    `,
    [args.userId, args.receiptId, args.companyId]
  );
}

function reverseEntryType(entryType: string) {
  if (entryType === "Positive Adjmt.") return "Negative Adjmt.";
  if (entryType === "Negative Adjmt.") return "Positive Adjmt.";
  return entryType;
}

function unwrapJsonText(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function toNumber(value: string | number | null | undefined, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

async function queryOne<T extends QueryResultRow>(
  client: PoolClient,
  query: string,
  values: unknown[] = []
) {
  const result = await client.query<T>(query, values);
  return result.rows[0] ?? null;
}

async function queryMany<T extends QueryResultRow>(
  client: PoolClient,
  query: string,
  values: unknown[] = []
) {
  const result = await client.query<T>(query, values);
  return result.rows;
}
