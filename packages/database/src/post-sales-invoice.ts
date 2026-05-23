import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";
import { getPostgresConnectionPool } from "./postgres.ts";

export const postSalesInvoiceArgsValidator = z.object({
  type: z.enum(["post", "void"]).default("post"),
  invoiceId: z.string(),
  userId: z.string(),
  companyId: z.string()
});

type PostSalesInvoiceArgs = z.infer<typeof postSalesInvoiceArgsValidator>;

type SalesInvoiceRow = {
  id: string;
  invoiceId: string;
  status:
    | "Draft"
    | "Pending"
    | "Submitted"
    | "Return"
    | "Credit Note Issued"
    | "Paid"
    | "Partially Paid"
    | "Overdue"
    | "Voided";
};

type SalesInvoiceLineRow = {
  id: string;
  quantity: string | number;
  salesOrderLineId: string | null;
};

type SalesOrderLineRow = {
  id: string;
  salesOrderId: string;
  salesOrderLineType: string;
  saleQuantity: string | number | null;
  quantityInvoiced: string | number | null;
  quantityToInvoice: string | number | null;
  invoicedComplete: boolean;
  sentComplete: boolean;
};

let postSalesInvoicePool: Pool | null = null;

export async function postSalesInvoice(args: PostSalesInvoiceArgs) {
  if (!args.companyId) throw new Error("Payload is missing companyId");
  if (!args.userId) throw new Error("Payload is missing userId");

  const pool = getPostSalesInvoicePool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [
      args.userId
    ]);

    if (args.type === "void") {
      await voidSalesInvoice(client, args);
    } else {
      await postSalesInvoiceTransaction(client, args);
    }

    await client.query("COMMIT");
    return { success: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (args.type !== "void") {
      await resetSalesInvoiceToDraft(args).catch(() => undefined);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function closePostSalesInvoicePool() {
  if (!postSalesInvoicePool) return;
  await postSalesInvoicePool.end();
  postSalesInvoicePool = null;
}

function getPostSalesInvoicePool() {
  postSalesInvoicePool ??= getPostgresConnectionPool(
    Number(process.env.DATABASE_SERVICE_POOL_SIZE ?? 5),
    { kind: "service" }
  );
  return postSalesInvoicePool;
}

async function postSalesInvoiceTransaction(
  client: PoolClient,
  args: PostSalesInvoiceArgs
) {
  const invoice = await loadSalesInvoice(client, args);
  if (invoice.status === "Submitted") return;
  if (invoice.status === "Voided") {
    throw new Error("Cannot post a voided sales invoice");
  }

  const invoiceLines = await loadSalesInvoiceLines(client, args);
  await applySalesOrderLineInvoiceQuantities(client, args, invoiceLines, "post");

  await client.query(
    `
      UPDATE "salesInvoice"
      SET "dateIssued" = CURRENT_DATE::text,
          "postingDate" = CURRENT_DATE,
          status = 'Submitted',
          "updatedAt" = NOW(),
          "updatedBy" = $1
      WHERE id = $2 AND "companyId" = $3
    `,
    [args.userId, args.invoiceId, args.companyId]
  );
}

async function voidSalesInvoice(client: PoolClient, args: PostSalesInvoiceArgs) {
  const invoice = await loadSalesInvoice(client, args);
  if (invoice.status === "Voided") {
    throw new Error("Sales invoice is already voided");
  }

  const invoiceLines = await loadSalesInvoiceLines(client, args);
  await applySalesOrderLineInvoiceQuantities(client, args, invoiceLines, "void");

  await client.query(
    `
      UPDATE "salesInvoice"
      SET status = 'Voided',
          "updatedAt" = NOW(),
          "updatedBy" = $1
      WHERE id = $2 AND "companyId" = $3
    `,
    [args.userId, args.invoiceId, args.companyId]
  );
}

async function applySalesOrderLineInvoiceQuantities(
  client: PoolClient,
  args: PostSalesInvoiceArgs,
  invoiceLines: SalesInvoiceLineRow[],
  mode: "post" | "void"
) {
  const salesOrderLineIds = Array.from(
    new Set(
      invoiceLines
        .map((line) => line.salesOrderLineId)
        .filter((id): id is string => Boolean(id))
    )
  );
  if (salesOrderLineIds.length === 0) return;

  const salesOrderLines = await queryMany<SalesOrderLineRow>(
    client,
    `
      SELECT
        id,
        "salesOrderId",
        "salesOrderLineType",
        "saleQuantity",
        "quantityInvoiced",
        "quantityToInvoice",
        "invoicedComplete",
        "sentComplete"
      FROM "salesOrderLine"
      WHERE id = ANY($1::text[]) AND "companyId" = $2
    `,
    [salesOrderLineIds, args.companyId]
  );
  const salesOrderLinesById = new Map(
    salesOrderLines.map((line) => [line.id, line])
  );
  const affectedSalesOrderIds = new Set<string>();

  for (const invoiceLine of invoiceLines) {
    if (!invoiceLine.salesOrderLineId) continue;
    const salesOrderLine = salesOrderLinesById.get(invoiceLine.salesOrderLineId);
    if (!salesOrderLine) continue;

    const quantity = toNumber(invoiceLine.quantity);
    const currentQuantity = toNumber(salesOrderLine.quantityInvoiced);
    const newQuantityInvoiced =
      mode === "post"
        ? currentQuantity + quantity
        : Math.max(0, currentQuantity - quantity);
    const targetQuantity = toNumber(
      salesOrderLine.quantityToInvoice,
      toNumber(salesOrderLine.saleQuantity)
    );
    const invoicedComplete =
      targetQuantity > 0 ? newQuantityInvoiced >= targetQuantity : false;

    await client.query(
      `
        UPDATE "salesOrderLine"
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
        salesOrderLine.id,
        args.companyId
      ]
    );
    affectedSalesOrderIds.add(salesOrderLine.salesOrderId);
  }

  for (const salesOrderId of affectedSalesOrderIds) {
    await updateSalesOrderStatus(client, args, salesOrderId);
  }
}

async function updateSalesOrderStatus(
  client: PoolClient,
  args: PostSalesInvoiceArgs,
  salesOrderId: string
) {
  const lines = await queryMany<SalesOrderLineRow>(
    client,
    `
      SELECT
        id,
        "salesOrderId",
        "salesOrderLineType",
        "saleQuantity",
        "quantityInvoiced",
        "quantityToInvoice",
        "invoicedComplete",
        "sentComplete"
      FROM "salesOrderLine"
      WHERE "salesOrderId" = $1 AND "companyId" = $2
    `,
    [salesOrderId, args.companyId]
  );

  const allInvoiced = lines.every(
    (line) => line.salesOrderLineType === "Comment" || line.invoicedComplete
  );
  const allShipped = lines.every(
    (line) => line.salesOrderLineType === "Comment" || line.sentComplete
  );

  let status = "To Ship and Invoice";
  if (allInvoiced && allShipped) status = "Completed";
  else if (allInvoiced) status = "To Ship";
  else if (allShipped) status = "To Invoice";

  await client.query(
    `
      UPDATE "salesOrder"
      SET status = $1, "updatedAt" = NOW(), "updatedBy" = $2
      WHERE id = $3 AND "companyId" = $4
    `,
    [status, args.userId, salesOrderId, args.companyId]
  );
}

async function loadSalesInvoice(
  client: PoolClient,
  args: PostSalesInvoiceArgs
) {
  const invoice = await queryOne<SalesInvoiceRow>(
    client,
    `
      SELECT id, "invoiceId", status
      FROM "salesInvoice"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.invoiceId, args.companyId]
  );

  if (!invoice) throw new Error("Failed to fetch sales invoice");
  return invoice;
}

async function loadSalesInvoiceLines(
  client: PoolClient,
  args: PostSalesInvoiceArgs
) {
  return queryMany<SalesInvoiceLineRow>(
    client,
    `
      SELECT id, quantity, "salesOrderLineId"
      FROM "salesInvoiceLine"
      WHERE "invoiceId" = $1 AND "companyId" = $2
      ORDER BY "sortOrder", id
    `,
    [args.invoiceId, args.companyId]
  );
}

async function resetSalesInvoiceToDraft(args: PostSalesInvoiceArgs) {
  const pool = getPostSalesInvoicePool();
  await pool.query(
    `
      UPDATE "salesInvoice"
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
