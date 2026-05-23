import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";
import { getPostgresConnectionPool } from "./postgres.ts";

export const postPurchaseInvoiceArgsValidator = z.object({
  type: z.enum(["post", "void"]).default("post"),
  invoiceId: z.string(),
  userId: z.string(),
  companyId: z.string(),
  skipReceiptPost: z.boolean().optional()
});

type PostPurchaseInvoiceArgs = z.infer<
  typeof postPurchaseInvoiceArgsValidator
>;

type PurchaseInvoiceRow = {
  id: string;
  invoiceId: string;
  postingDate: string | Date | null;
  status:
    | "Draft"
    | "Pending"
    | "Open"
    | "Return"
    | "Debit Note Issued"
    | "Paid"
    | "Partially Paid"
    | "Overdue"
    | "Voided";
};

type PurchaseInvoiceLineRow = {
  id: string;
  quantity: string | number;
  conversionFactor: string | number | null;
  purchaseOrderLineId: string | null;
};

type PurchaseOrderLineRow = {
  id: string;
  purchaseOrderId: string;
  purchaseOrderLineType: string;
  purchaseQuantity: string | number | null;
  quantityInvoiced: string | number | null;
  quantityReceived: string | number | null;
  quantityToInvoice: string | number | null;
  invoicedComplete: boolean;
  receivedComplete: boolean;
};

let postPurchaseInvoicePool: Pool | null = null;

export async function postPurchaseInvoice(args: PostPurchaseInvoiceArgs) {
  if (!args.companyId) throw new Error("Payload is missing companyId");
  if (!args.userId) throw new Error("Payload is missing userId");

  const pool = getPostPurchaseInvoicePool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [
      args.userId
    ]);

    if (args.type === "void") {
      await voidPurchaseInvoice(client, args);
    } else {
      await postPurchaseInvoiceTransaction(client, args);
    }

    await client.query("COMMIT");
    return { success: true, receiptIds: [] as string[] };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (args.type !== "void") {
      await resetPurchaseInvoiceToDraft(args).catch(() => undefined);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function closePostPurchaseInvoicePool() {
  if (!postPurchaseInvoicePool) return;
  await postPurchaseInvoicePool.end();
  postPurchaseInvoicePool = null;
}

function getPostPurchaseInvoicePool() {
  postPurchaseInvoicePool ??= getPostgresConnectionPool(
    Number(process.env.DATABASE_SERVICE_POOL_SIZE ?? 5),
    { kind: "service" }
  );
  return postPurchaseInvoicePool;
}

async function postPurchaseInvoiceTransaction(
  client: PoolClient,
  args: PostPurchaseInvoiceArgs
) {
  const invoice = await loadPurchaseInvoice(client, args);
  if (invoice.status === "Open") return;
  if (invoice.status === "Voided") {
    throw new Error("Cannot post a voided purchase invoice");
  }

  const invoiceLines = await loadPurchaseInvoiceLines(client, args);
  await applyPurchaseOrderLineInvoiceQuantities(
    client,
    args,
    invoiceLines,
    "post"
  );

  await client.query(
    `
      UPDATE "purchaseInvoice"
      SET "datePaid" = CURRENT_DATE::text,
          "postingDate" = CURRENT_DATE,
          status = 'Open',
          "updatedAt" = NOW(),
          "updatedBy" = $1
      WHERE id = $2 AND "companyId" = $3
    `,
    [args.userId, args.invoiceId, args.companyId]
  );
}

async function voidPurchaseInvoice(
  client: PoolClient,
  args: PostPurchaseInvoiceArgs
) {
  const invoice = await loadPurchaseInvoice(client, args);
  if (!invoice.postingDate) {
    throw new Error("Can only void posted purchase invoices");
  }
  if (invoice.status === "Voided") {
    throw new Error("Purchase invoice is already voided");
  }
  if (invoice.status === "Paid" || invoice.status === "Partially Paid") {
    throw new Error(
      "Cannot void a purchase invoice with payments applied. Reverse the payment first."
    );
  }

  const invoiceLines = await loadPurchaseInvoiceLines(client, args);
  await applyPurchaseOrderLineInvoiceQuantities(
    client,
    args,
    invoiceLines,
    "void"
  );

  await client.query(
    `
      UPDATE "purchaseInvoice"
      SET status = 'Voided',
          "updatedAt" = NOW(),
          "updatedBy" = $1
      WHERE id = $2 AND "companyId" = $3
    `,
    [args.userId, args.invoiceId, args.companyId]
  );
}

async function applyPurchaseOrderLineInvoiceQuantities(
  client: PoolClient,
  args: PostPurchaseInvoiceArgs,
  invoiceLines: PurchaseInvoiceLineRow[],
  mode: "post" | "void"
) {
  const deltasByPurchaseOrderLineId = new Map<string, number>();
  for (const invoiceLine of invoiceLines) {
    if (!invoiceLine.purchaseOrderLineId) continue;

    const quantity =
      toNumber(invoiceLine.quantity) / toNumber(invoiceLine.conversionFactor, 1);
    if (quantity <= 0) continue;

    deltasByPurchaseOrderLineId.set(
      invoiceLine.purchaseOrderLineId,
      (deltasByPurchaseOrderLineId.get(invoiceLine.purchaseOrderLineId) ?? 0) +
        quantity
    );
  }

  const purchaseOrderLineIds = Array.from(deltasByPurchaseOrderLineId.keys());
  if (purchaseOrderLineIds.length === 0) return;

  const purchaseOrderLines = await queryMany<PurchaseOrderLineRow>(
    client,
    `
      SELECT
        id,
        "purchaseOrderId",
        "purchaseOrderLineType",
        "purchaseQuantity",
        "quantityInvoiced",
        "quantityReceived",
        "quantityToInvoice",
        "invoicedComplete",
        "receivedComplete"
      FROM "purchaseOrderLine"
      WHERE id = ANY($1::text[]) AND "companyId" = $2
    `,
    [purchaseOrderLineIds, args.companyId]
  );
  const affectedPurchaseOrderIds = new Set<string>();

  for (const purchaseOrderLine of purchaseOrderLines) {
    const quantity = deltasByPurchaseOrderLineId.get(purchaseOrderLine.id);
    if (!quantity) continue;

    const currentQuantity = toNumber(purchaseOrderLine.quantityInvoiced);
    const newQuantityInvoiced =
      mode === "post"
        ? currentQuantity + quantity
        : Math.max(0, currentQuantity - quantity);
    const targetQuantity = toNumber(
      purchaseOrderLine.quantityToInvoice,
      toNumber(purchaseOrderLine.purchaseQuantity)
    );
    const invoicedComplete =
      targetQuantity > 0
        ? mode === "post"
          ? purchaseOrderLine.invoicedComplete ||
            newQuantityInvoiced >= targetQuantity
          : newQuantityInvoiced >= targetQuantity
        : false;

    await client.query(
      `
        UPDATE "purchaseOrderLine"
        SET "quantityInvoiced" = $1,
            "invoicedComplete" = $2,
            "updatedAt" = NOW(),
            "updatedBy" = $3
        WHERE id = $4 AND "companyId" = $5
      `,
      [
        newQuantityInvoiced,
        invoicedComplete,
        args.userId,
        purchaseOrderLine.id,
        args.companyId
      ]
    );
    affectedPurchaseOrderIds.add(purchaseOrderLine.purchaseOrderId);
  }

  for (const purchaseOrderId of affectedPurchaseOrderIds) {
    await updatePurchaseOrderStatus(client, args, purchaseOrderId);
  }
}

async function updatePurchaseOrderStatus(
  client: PoolClient,
  args: PostPurchaseInvoiceArgs,
  purchaseOrderId: string
) {
  const lines = await queryMany<PurchaseOrderLineRow>(
    client,
    `
      SELECT
        id,
        "purchaseOrderId",
        "purchaseOrderLineType",
        "purchaseQuantity",
        "quantityInvoiced",
        "quantityReceived",
        "quantityToInvoice",
        "invoicedComplete",
        "receivedComplete"
      FROM "purchaseOrderLine"
      WHERE "purchaseOrderId" = $1 AND "companyId" = $2
    `,
    [purchaseOrderId, args.companyId]
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

async function loadPurchaseInvoice(
  client: PoolClient,
  args: PostPurchaseInvoiceArgs
) {
  const invoice = await queryOne<PurchaseInvoiceRow>(
    client,
    `
      SELECT id, "invoiceId", "postingDate", status
      FROM "purchaseInvoice"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.invoiceId, args.companyId]
  );

  if (!invoice) throw new Error("Failed to fetch purchase invoice");
  return invoice;
}

async function loadPurchaseInvoiceLines(
  client: PoolClient,
  args: PostPurchaseInvoiceArgs
) {
  return queryMany<PurchaseInvoiceLineRow>(
    client,
    `
      SELECT id, quantity, "conversionFactor", "purchaseOrderLineId"
      FROM "purchaseInvoiceLine"
      WHERE "invoiceId" = $1 AND "companyId" = $2
      ORDER BY "sortOrder", id
    `,
    [args.invoiceId, args.companyId]
  );
}

async function resetPurchaseInvoiceToDraft(args: PostPurchaseInvoiceArgs) {
  const pool = getPostPurchaseInvoicePool();
  await pool.query(
    `
      UPDATE "purchaseInvoice"
      SET status = 'Draft', "updatedAt" = NOW(), "updatedBy" = $1
      WHERE id = $2 AND "companyId" = $3
    `,
    [args.userId, args.invoiceId, args.companyId]
  );
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
