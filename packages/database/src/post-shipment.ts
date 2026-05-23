import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";
import { getPostgresConnectionPool } from "./postgres.ts";

export const postShipmentArgsValidator = z.object({
  type: z.enum(["post", "void"]),
  shipmentId: z.string(),
  userId: z.string(),
  companyId: z.string()
});

type PostShipmentArgs = z.infer<typeof postShipmentArgsValidator>;

type ShipmentRow = {
  id: string;
  shipmentId: string;
  status: "Draft" | "Pending" | "Posted" | "Voided";
  sourceDocument: unknown;
  sourceDocumentId: string | null;
  sourceDocumentReadableId: string | null;
  locationId: string | null;
};

type ShipmentLineRow = {
  id: string;
  itemId: string;
  lineId: string | null;
  locationId: string | null;
  storageUnitId: string | null;
  shippedQuantity: string | number;
  requiresBatchTracking: boolean;
  requiresSerialTracking: boolean;
};

type SalesOrderRow = {
  id: string;
  status: string;
};

type SalesOrderLineRow = {
  id: string;
  salesOrderId: string;
  salesOrderLineType: string;
  saleQuantity: string | number | null;
  quantitySent: string | number | null;
  sentComplete: boolean;
  sentDate: string | Date | null;
  invoicedComplete: boolean;
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

let postShipmentPool: Pool | null = null;

export async function postShipment(args: PostShipmentArgs) {
  if (!args.companyId) throw new Error("Payload is missing companyId");
  if (!args.userId) throw new Error("Payload is missing userId");

  const pool = getPostShipmentPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [
      args.userId
    ]);

    if (args.type === "void") {
      await voidShipment(client, args);
    } else {
      await postShipmentTransaction(client, args);
    }

    await client.query("COMMIT");
    return { success: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (args.type !== "void") {
      await resetShipmentToDraft(args).catch(() => undefined);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function closePostShipmentPool() {
  if (!postShipmentPool) return;
  await postShipmentPool.end();
  postShipmentPool = null;
}

function getPostShipmentPool() {
  postShipmentPool ??= getPostgresConnectionPool(
    Number(process.env.DATABASE_SERVICE_POOL_SIZE ?? 5),
    { kind: "service" }
  );
  return postShipmentPool;
}

async function postShipmentTransaction(
  client: PoolClient,
  args: PostShipmentArgs
) {
  const shipment = await loadShipment(client, args);
  if (shipment.status === "Posted") return;
  if (shipment.status === "Voided") {
    throw new Error("Cannot post a voided shipment");
  }

  const sourceDocument = unwrapJsonText(shipment.sourceDocument);
  switch (sourceDocument) {
    case "Sales Order":
      await postSalesOrderShipment(client, args, shipment);
      break;
    default:
      throw new Error(`Shipment source document is not supported: ${sourceDocument}`);
  }

  await client.query(
    `
      UPDATE "shipment"
      SET status = 'Posted',
          "postingDate" = CURRENT_DATE,
          "postedBy" = $1,
          "updatedAt" = NOW(),
          "updatedBy" = $1
      WHERE id = $2 AND "companyId" = $3
    `,
    [args.userId, args.shipmentId, args.companyId]
  );
}

async function voidShipment(client: PoolClient, args: PostShipmentArgs) {
  const shipment = await loadShipment(client, args);
  if (shipment.status !== "Posted") {
    throw new Error("Can only void posted shipments");
  }

  const sourceDocument = unwrapJsonText(shipment.sourceDocument);
  if (sourceDocument !== "Sales Order") {
    throw new Error(
      `Void is only supported for shipments with source document "Sales Order"`
    );
  }

  const shipmentLines = await loadShipmentLines(client, args);
  await reverseItemLedger(client, args);
  await reverseSalesOrderShipmentQuantities(client, args, shipment, shipmentLines);

  await client.query(
    `
      UPDATE "shipment"
      SET status = 'Voided',
          "updatedAt" = NOW(),
          "updatedBy" = $1
      WHERE id = $2 AND "companyId" = $3
    `,
    [args.userId, args.shipmentId, args.companyId]
  );
}

async function postSalesOrderShipment(
  client: PoolClient,
  args: PostShipmentArgs,
  shipment: ShipmentRow
) {
  if (!shipment.sourceDocumentId) {
    throw new Error("Shipment has no sourceDocumentId");
  }

  const salesOrder = await loadSalesOrder(
    client,
    shipment.sourceDocumentId,
    args.companyId
  );
  const shipmentLines = await loadShipmentLines(client, args);
  const salesOrderLines = await loadSalesOrderLines(
    client,
    shipment.sourceDocumentId,
    args.companyId
  );
  if (!salesOrder) throw new Error("Failed to fetch sales order");

  const salesOrderLinesById = new Map(salesOrderLines.map((line) => [line.id, line]));

  for (const shipmentLine of shipmentLines) {
    const salesOrderLine = salesOrderLinesById.get(shipmentLine.lineId ?? "");
    if (!salesOrderLine) continue;

    const shippedQuantity = toNumber(shipmentLine.shippedQuantity);
    const newQuantitySent = Math.max(
      0,
      toNumber(salesOrderLine.quantitySent) + shippedQuantity
    );
    const saleQuantity = toNumber(salesOrderLine.saleQuantity);
    const sentComplete =
      saleQuantity > 0 ? newQuantitySent >= saleQuantity : salesOrderLine.sentComplete;

    await client.query(
      `
        UPDATE "salesOrderLine"
        SET "quantitySent" = $1,
            "sentComplete" = $2,
            "sentDate" = CASE WHEN $2 THEN CURRENT_DATE ELSE "sentDate" END,
            "updatedAt" = NOW(),
            "updatedBy" = $3
        WHERE id = $4 AND "companyId" = $5
      `,
      [
        newQuantitySent,
        sentComplete,
        args.userId,
        salesOrderLine.id,
        args.companyId
      ]
    );

    await insertShipmentItemLedgerEntry(client, args, shipment, shipmentLine, {
      entryType: shippedQuantity < 0 ? "Positive Adjmt." : "Negative Adjmt.",
      documentType: "Sales Shipment",
      documentId: shipment.id,
      quantity: -shippedQuantity
    });
  }

  await updateSalesOrderStatus(client, args, salesOrder.id);
}

async function reverseSalesOrderShipmentQuantities(
  client: PoolClient,
  args: PostShipmentArgs,
  shipment: ShipmentRow,
  shipmentLines: ShipmentLineRow[]
) {
  if (!shipment.sourceDocumentId) {
    throw new Error("Shipment has no sourceDocumentId");
  }

  const salesOrderLines = await loadSalesOrderLines(
    client,
    shipment.sourceDocumentId,
    args.companyId
  );
  const salesOrderLinesById = new Map(salesOrderLines.map((line) => [line.id, line]));

  for (const shipmentLine of shipmentLines) {
    const salesOrderLine = salesOrderLinesById.get(shipmentLine.lineId ?? "");
    if (!salesOrderLine) continue;

    const shippedQuantity = toNumber(shipmentLine.shippedQuantity);
    const newQuantitySent = Math.max(
      0,
      toNumber(salesOrderLine.quantitySent) - shippedQuantity
    );
    const saleQuantity = toNumber(salesOrderLine.saleQuantity);
    const sentComplete = saleQuantity > 0 ? newQuantitySent >= saleQuantity : false;

    await client.query(
      `
        UPDATE "salesOrderLine"
        SET "quantitySent" = $1,
            "sentComplete" = $2,
            "sentDate" = CASE WHEN $2 THEN "sentDate" ELSE NULL END,
            "updatedAt" = NOW(),
            "updatedBy" = $3
        WHERE id = $4 AND "companyId" = $5
      `,
      [
        newQuantitySent,
        sentComplete,
        args.userId,
        salesOrderLine.id,
        args.companyId
      ]
    );
  }

  await updateSalesOrderStatus(client, args, shipment.sourceDocumentId);
}

async function reverseItemLedger(client: PoolClient, args: PostShipmentArgs) {
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
    [args.shipmentId, args.companyId]
  );

  for (const row of rows) {
    await insertItemLedgerEntry(client, {
      entryType: reverseEntryType(row.entryType),
      documentType: unwrapJsonText(row.documentType) ?? "Shipment",
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

async function insertShipmentItemLedgerEntry(
  client: PoolClient,
  args: PostShipmentArgs,
  shipment: ShipmentRow,
  shipmentLine: ShipmentLineRow,
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
    itemId: shipmentLine.itemId,
    quantity: ledger.quantity,
    locationId: shipmentLine.locationId ?? shipment.locationId,
    storageUnitId: shipmentLine.storageUnitId,
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

async function updateSalesOrderStatus(
  client: PoolClient,
  args: PostShipmentArgs,
  salesOrderId: string
) {
  const lines = await loadSalesOrderLines(client, salesOrderId, args.companyId);
  const allInvoiced = lines.every(
    (line) => line.salesOrderLineType === "Comment" || line.invoicedComplete
  );
  const allShipped = lines.every(
    (line) => line.salesOrderLineType === "Comment" || line.sentComplete
  );

  let status = "To Ship and Invoice";
  if (allInvoiced && allShipped) status = "Completed";
  else if (allShipped) status = "To Invoice";
  else if (allInvoiced) status = "To Ship";

  await client.query(
    `
      UPDATE "salesOrder"
      SET status = $1, "updatedAt" = NOW(), "updatedBy" = $2
      WHERE id = $3 AND "companyId" = $4
    `,
    [status, args.userId, salesOrderId, args.companyId]
  );
}

async function loadShipment(client: PoolClient, args: PostShipmentArgs) {
  const shipment = await queryOne<ShipmentRow>(
    client,
    `
      SELECT
        id,
        "shipmentId",
        status,
        "sourceDocument",
        "sourceDocumentId",
        "sourceDocumentReadableId",
        "locationId"
      FROM "shipment"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.shipmentId, args.companyId]
  );

  if (!shipment) throw new Error("Failed to fetch shipment");
  return shipment;
}

async function loadShipmentLines(client: PoolClient, args: PostShipmentArgs) {
  return queryMany<ShipmentLineRow>(
    client,
    `
      SELECT
        id,
        "itemId",
        "lineId",
        "locationId",
        "storageUnitId",
        "shippedQuantity",
        "requiresBatchTracking",
        "requiresSerialTracking"
      FROM "shipmentLine"
      WHERE "shipmentId" = $1 AND "companyId" = $2
      ORDER BY id
    `,
    [args.shipmentId, args.companyId]
  );
}

async function loadSalesOrder(
  client: PoolClient,
  salesOrderId: string,
  companyId: string
) {
  return queryOne<SalesOrderRow>(
    client,
    `
      SELECT id, status
      FROM "salesOrder"
      WHERE id = $1 AND "companyId" = $2
    `,
    [salesOrderId, companyId]
  );
}

async function loadSalesOrderLines(
  client: PoolClient,
  salesOrderId: string,
  companyId: string
) {
  return queryMany<SalesOrderLineRow>(
    client,
    `
      SELECT
        id,
        "salesOrderId",
        "salesOrderLineType",
        "saleQuantity",
        "quantitySent",
        "sentComplete",
        "sentDate",
        "invoicedComplete"
      FROM "salesOrderLine"
      WHERE "salesOrderId" = $1 AND "companyId" = $2
      ORDER BY "sortOrder", id
    `,
    [salesOrderId, companyId]
  );
}

async function resetShipmentToDraft(args: PostShipmentArgs) {
  const pool = getPostShipmentPool();
  await pool.query(
    `
      UPDATE "shipment"
      SET status = 'Draft', "updatedAt" = NOW(), "updatedBy" = $1
      WHERE id = $2 AND "companyId" = $3
    `,
    [args.userId, args.shipmentId, args.companyId]
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
