import { nanoid } from "nanoid";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";
import { getPostgresConnectionPool } from "./postgres.ts";

const selectedSalesLineSchema = z.object({
  quantity: z.number(),
  netUnitPrice: z.number(),
  convertedNetUnitPrice: z.number(),
  addOn: z.number(),
  convertedAddOn: z.number(),
  taxableAddOn: z.number().optional(),
  convertedTaxableAddOn: z.number().optional(),
  shippingCost: z.number(),
  convertedShippingCost: z.number(),
  leadTime: z.number()
});

const selectedSupplierLineSchema = z.object({
  leadTime: z.number(),
  quantity: z.number(),
  shippingCost: z.number(),
  supplierShippingCost: z.number(),
  supplierUnitPrice: z.number(),
  supplierTaxAmount: z.number(),
  unitPrice: z.number()
});

export const convertArgsValidator = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("methodVersionToActive"),
    id: z.string(),
    companyId: z.string(),
    userId: z.string()
  }),
  z.object({
    type: z.literal("purchaseOrderToPurchaseInvoice"),
    id: z.string(),
    companyId: z.string(),
    userId: z.string()
  }),
  z.object({
    type: z.literal("quoteToSalesOrder"),
    id: z.string(),
    companyId: z.string(),
    userId: z.string(),
    purchaseOrderNumber: z.string().optional(),
    selectedLines: z.record(z.string(), selectedSalesLineSchema),
    digitalQuoteAcceptedBy: z.string().optional(),
    digitalQuoteAcceptedByEmail: z.string().optional()
  }),
  z.object({
    type: z.literal("salesOrderToSalesInvoice"),
    id: z.string(),
    companyId: z.string(),
    userId: z.string()
  }),
  z.object({
    type: z.literal("salesRfqToQuote"),
    id: z.string(),
    companyId: z.string(),
    userId: z.string()
  }),
  z.object({
    type: z.literal("shipmentToSalesInvoice"),
    id: z.string(),
    companyId: z.string(),
    userId: z.string()
  }),
  z.object({
    type: z.literal("supplierQuoteToPurchaseOrder"),
    id: z.string(),
    companyId: z.string(),
    userId: z.string(),
    selectedLines: z.record(z.string(), selectedSupplierLineSchema)
  })
]);

type ConvertArgs = z.infer<typeof convertArgsValidator>;
type Row = QueryResultRow & Record<string, any>;

let convertPool: Pool | null = null;

export async function convert(args: ConvertArgs) {
  if (!args.companyId) throw new Error("Payload is missing companyId");
  if (!args.userId) throw new Error("Payload is missing userId");

  const pool = getConvertPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [
      args.userId
    ]);

    const convertedId = await convertInTransaction(client, args);

    await client.query("COMMIT");
    return { id: convertedId, convertedId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function closeConvertPool() {
  if (!convertPool) return;
  await convertPool.end();
  convertPool = null;
}

function getConvertPool() {
  convertPool ??= getPostgresConnectionPool(
    Number(process.env.DATABASE_SERVICE_POOL_SIZE ?? 5),
    { kind: "service" }
  );
  return convertPool;
}

async function convertInTransaction(client: PoolClient, args: ConvertArgs) {
  switch (args.type) {
    case "methodVersionToActive":
      return activateMethodVersion(client, args);
    case "purchaseOrderToPurchaseInvoice":
      return purchaseOrderToPurchaseInvoice(client, args);
    case "quoteToSalesOrder":
      return quoteToSalesOrder(client, args);
    case "salesOrderToSalesInvoice":
      return salesOrderToSalesInvoice(client, args);
    case "salesRfqToQuote":
      return salesRfqToQuote(client, args);
    case "shipmentToSalesInvoice":
      return shipmentToSalesInvoice(client, args);
    case "supplierQuoteToPurchaseOrder":
      return supplierQuoteToPurchaseOrder(client, args);
    default:
      assertNever(args);
  }
}

async function activateMethodVersion(
  client: PoolClient,
  args: Extract<ConvertArgs, { type: "methodVersionToActive" }>
) {
  const makeMethod = await queryOneRequired<Row>(
    client,
    `
      SELECT id, "itemId"
      FROM "makeMethod"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.id, args.companyId],
    "Make method not found"
  );

  const related = await queryMany<{ id: string; status: string }>(
    client,
    `
      SELECT id, status
      FROM "makeMethod"
      WHERE "itemId" = $1 AND "companyId" = $2 AND id <> $3
    `,
    [makeMethod.itemId, args.companyId, args.id]
  );
  const activeIds = related
    .filter((method) => method.status === "Active")
    .map((method) => method.id);
  const relatedIds = related
    .filter((method) => method.status === "Active" || method.status === "Draft")
    .map((method) => method.id);

  if (activeIds.length > 0) {
    await client.query(
      `
        UPDATE "makeMethod"
        SET status = 'Archived', "updatedAt" = NOW(), "updatedBy" = $1
        WHERE id = ANY($2::text[]) AND "companyId" = $3
      `,
      [args.userId, activeIds, args.companyId]
    );
  }

  await client.query(
    `
      UPDATE "makeMethod"
      SET status = 'Active', "updatedAt" = NOW(), "updatedBy" = $1
      WHERE id = $2 AND "companyId" = $3
    `,
    [args.userId, args.id, args.companyId]
  );

  if (relatedIds.length > 0) {
    await client.query(
      `
        UPDATE "methodMaterial"
        SET "materialMakeMethodId" = $1, "updatedAt" = NOW(), "updatedBy" = $2
        WHERE "materialMakeMethodId" = ANY($3::text[])
          AND "companyId" = $4
      `,
      [args.id, args.userId, relatedIds, args.companyId]
    );
  }

  return args.id;
}

async function purchaseOrderToPurchaseInvoice(
  client: PoolClient,
  args: Extract<ConvertArgs, { type: "purchaseOrderToPurchaseInvoice" }>
) {
  const purchaseOrder = await queryOneRequired<Row>(
    client,
    `
      SELECT *
      FROM "purchaseOrder"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.id, args.companyId],
    "Purchase order not found"
  );
  const payment = await queryOneRequired<Row>(
    client,
    `
      SELECT *
      FROM "purchaseOrderPayment"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.id, args.companyId],
    "Purchase order payment not found"
  );
  const delivery = await queryOneRequired<Row>(
    client,
    `
      SELECT *
      FROM "purchaseOrderDelivery"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.id, args.companyId],
    "Purchase order delivery not found"
  );
  const lines = await queryMany<Row>(
    client,
    `
      SELECT *
      FROM "purchaseOrderLine"
      WHERE "purchaseOrderId" = $1 AND "companyId" = $2
      ORDER BY "sortOrder", id
    `,
    [args.id, args.companyId]
  );
  const uninvoicedLines = lines.filter(
    (line) => toNumber(line.quantityToInvoice) > 0 && !line.invoicedComplete
  );
  if (uninvoicedLines.length === 0) {
    throw new Error(
      "No lines available to invoice. All lines may already be marked as invoiced complete."
    );
  }

  const subtotal = uninvoicedLines.reduce(
    (sum, line) => sum + toNumber(line.quantityToInvoice) * toNumber(line.unitPrice),
    0
  );
  const invoiceReadableId = await getNextSequence(
    client,
    "purchaseInvoice",
    args.companyId
  );
  const invoiceId = nanoid();

  await client.query(
    `
      INSERT INTO "purchaseInvoice" (
        id, "invoiceId", status, "supplierId", "supplierReference",
        "invoiceSupplierId", "invoiceSupplierContactId",
        "invoiceSupplierLocationId", "locationId", "paymentTermId",
        "currencyCode", "dateIssued", "exchangeRate", subtotal,
        "supplierInteractionId", "totalDiscount", "totalAmount", "totalTax",
        balance, "companyId", "createdAt", "createdBy"
      )
      VALUES (
        $1, $2, 'Draft', $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_DATE::text,
        $11, $12, $13, 0, $14, 0, $15, $16, NOW(), $17
      )
    `,
    [
      invoiceId,
      invoiceReadableId,
      purchaseOrder.supplierId,
      purchaseOrder.supplierReference ?? "",
      payment.invoiceSupplierId,
      payment.invoiceSupplierContactId,
      payment.invoiceSupplierLocationId,
      delivery.locationId,
      payment.paymentTermId,
      purchaseOrder.currencyCode ?? "USD",
      toNumber(purchaseOrder.exchangeRate, 1),
      subtotal,
      purchaseOrder.supplierInteractionId,
      subtotal,
      subtotal,
      args.companyId,
      args.userId
    ]
  );

  await client.query(
    `
      INSERT INTO "purchaseInvoiceDelivery" (
        id, "locationId", "supplierShippingCost", "shippingMethodId",
        "shippingTermId", incoterm, "incotermLocation", "companyId",
        "updatedAt", "updatedBy"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
    `,
    [
      invoiceId,
      delivery.locationId,
      toNumber(delivery.supplierShippingCost),
      delivery.shippingMethodId,
      delivery.shippingTermId,
      delivery.incoterm,
      delivery.incotermLocation,
      args.companyId,
      args.userId
    ]
  );

  for (const line of uninvoicedLines) {
    await client.query(
      `
        INSERT INTO "purchaseInvoiceLine" (
          id, "invoiceId", "invoiceLineType", "purchaseOrderId",
          "purchaseOrderLineId", "itemId", "locationId", "storageUnitId",
          "accountId", "costCenterId", "assetId", description, quantity,
          "supplierUnitPrice", "supplierShippingCost", "supplierTaxAmount",
          "purchaseUnitOfMeasureCode", "inventoryUnitOfMeasureCode",
          "conversionFactor", "exchangeRate", "jobOperationId", "sortOrder",
          "companyId", "createdAt", "createdBy"
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, NOW(), $24
        )
      `,
      [
        nanoid(),
        invoiceId,
        line.purchaseOrderLineType,
        line.purchaseOrderId,
        line.id,
        line.itemId,
        line.locationId,
        line.storageUnitId,
        line.accountId,
        line.costCenterId,
        line.assetId,
        line.description,
        toNumber(line.quantityToInvoice),
        toNumber(line.supplierUnitPrice),
        toNumber(line.supplierShippingCost),
        toNumber(line.supplierTaxAmount),
        line.purchaseUnitOfMeasureCode,
        line.inventoryUnitOfMeasureCode,
        line.conversionFactor,
        toNumber(line.exchangeRate, 1),
        line.jobOperationId,
        toNumber(line.sortOrder, 1),
        args.companyId,
        args.userId
      ]
    );
  }

  return invoiceId;
}

async function salesOrderToSalesInvoice(
  client: PoolClient,
  args: Extract<ConvertArgs, { type: "salesOrderToSalesInvoice" }>
) {
  const salesOrder = await queryOneRequired<Row>(
    client,
    `SELECT * FROM "salesOrder" WHERE id = $1 AND "companyId" = $2`,
    [args.id, args.companyId],
    "Sales order not found"
  );
  const payment = await queryOneRequired<Row>(
    client,
    `SELECT * FROM "salesOrderPayment" WHERE id = $1 AND "companyId" = $2`,
    [args.id, args.companyId],
    "Sales order payment not found"
  );
  const shipment = await queryOneRequired<Row>(
    client,
    `SELECT * FROM "salesOrderShipment" WHERE id = $1 AND "companyId" = $2`,
    [args.id, args.companyId],
    "Sales order shipment not found"
  );
  const lines = await queryMany<Row>(
    client,
    `
      SELECT *
      FROM "salesOrderLine"
      WHERE "salesOrderId" = $1 AND "companyId" = $2
      ORDER BY "sortOrder", id
    `,
    [args.id, args.companyId]
  );
  const uninvoicedLines = lines.filter(
    (line) => toNumber(line.quantityToInvoice) > 0 && !line.invoicedComplete
  );

  return insertSalesInvoiceFromSalesOrderLines(client, args, {
    salesOrder,
    payment,
    shipment,
    lines: uninvoicedLines,
    sourceShipmentId: null
  });
}

async function shipmentToSalesInvoice(
  client: PoolClient,
  args: Extract<ConvertArgs, { type: "shipmentToSalesInvoice" }>
) {
  const shipmentDocument = await queryOneRequired<Row>(
    client,
    `
      SELECT *, "sourceDocument" #>> '{}' AS "sourceDocumentText"
      FROM "shipment"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.id, args.companyId],
    "Shipment not found"
  );
  if (
    !shipmentDocument.sourceDocumentId ||
    shipmentDocument.sourceDocumentText !== "Sales Order"
  ) {
    throw new Error("Shipment has no source document id");
  }

  const shipmentLines = await queryMany<Row>(
    client,
    `
      SELECT *
      FROM "shipmentLine"
      WHERE "shipmentId" = $1 AND "companyId" = $2
    `,
    [args.id, args.companyId]
  );
  const quantitiesByLine = new Map<string, number>();
  for (const line of shipmentLines) {
    if (!line.lineId) continue;
    quantitiesByLine.set(
      line.lineId,
      (quantitiesByLine.get(line.lineId) ?? 0) + toNumber(line.shippedQuantity)
    );
  }
  const salesOrderLineIds = Array.from(quantitiesByLine.keys());
  if (salesOrderLineIds.length === 0) {
    throw new Error("Shipment has no lines to invoice");
  }

  const salesOrder = await queryOneRequired<Row>(
    client,
    `SELECT * FROM "salesOrder" WHERE id = $1 AND "companyId" = $2`,
    [shipmentDocument.sourceDocumentId, args.companyId],
    "Sales order not found"
  );
  const payment = await queryOneRequired<Row>(
    client,
    `SELECT * FROM "salesOrderPayment" WHERE id = $1 AND "companyId" = $2`,
    [shipmentDocument.sourceDocumentId, args.companyId],
    "Sales order payment not found"
  );
  const shipment = await queryOneRequired<Row>(
    client,
    `SELECT * FROM "salesOrderShipment" WHERE id = $1 AND "companyId" = $2`,
    [shipmentDocument.sourceDocumentId, args.companyId],
    "Sales order shipment not found"
  );
  const orderLines = await queryMany<Row>(
    client,
    `
      SELECT *
      FROM "salesOrderLine"
      WHERE id = ANY($1::text[]) AND "companyId" = $2
      ORDER BY "sortOrder", id
    `,
    [salesOrderLineIds, args.companyId]
  );
  const lines = orderLines
    .map((line) => ({
      ...line,
      quantityToInvoice: Math.min(
        quantitiesByLine.get(line.id) ?? 0,
        toNumber(line.quantityToInvoice)
      )
    }))
    .filter((line) => toNumber(line.quantityToInvoice) > 0);

  return insertSalesInvoiceFromSalesOrderLines(client, args, {
    salesOrder,
    payment,
    shipment,
    lines,
    sourceShipmentId: args.id
  });
}

async function insertSalesInvoiceFromSalesOrderLines(
  client: PoolClient,
  args: Pick<ConvertArgs, "companyId" | "userId">,
  {
    salesOrder,
    payment,
    shipment,
    lines,
    sourceShipmentId
  }: {
    salesOrder: Row;
    payment: Row;
    shipment: Row;
    lines: Row[];
    sourceShipmentId: string | null;
  }
) {
  const subtotal = lines.reduce(
    (sum, line) => sum + toNumber(line.quantityToInvoice) * toNumber(line.unitPrice),
    0
  );
  const invoiceReadableId = await getNextSequence(
    client,
    "salesInvoice",
    args.companyId
  );
  const invoiceId = nanoid();

  await client.query(
    `
      INSERT INTO "salesInvoice" (
        id, "invoiceId", status, "customerId", "customerReference",
        "invoiceCustomerId", "invoiceCustomerContactId",
        "invoiceCustomerLocationId", "locationId", "paymentTermId",
        "currencyCode", "dateIssued", "exchangeRate", subtotal,
        "opportunityId", "shipmentId", "totalDiscount", "totalAmount",
        "totalTax", balance, "customFields", "externalNotes",
        "internalNotes", "companyId", "createdAt", "createdBy"
      )
      VALUES (
        $1, $2, 'Draft', $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_DATE::text,
        $11, $12, $13, $14, 0, $15, 0, $16, '{}'::jsonb, '{}'::jsonb,
        '{}'::jsonb, $17, NOW(), $18
      )
    `,
    [
      invoiceId,
      invoiceReadableId,
      salesOrder.customerId,
      salesOrder.customerReference ?? "",
      payment.invoiceCustomerId,
      payment.invoiceCustomerContactId,
      payment.invoiceCustomerLocationId,
      shipment.locationId,
      payment.paymentTermId,
      salesOrder.currencyCode ?? "USD",
      toNumber(salesOrder.exchangeRate, 1),
      subtotal,
      salesOrder.opportunityId,
      sourceShipmentId,
      subtotal,
      subtotal,
      args.companyId,
      args.userId
    ]
  );

  await client.query(
    `
      INSERT INTO "salesInvoiceShipment" (
        id, "locationId", "shippingCost", "shippingMethodId",
        "shippingTermId", incoterm, "incotermLocation", "customFields",
        "companyId", "createdAt", "createdBy"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb, $8, NOW(), $9)
    `,
    [
      invoiceId,
      shipment.locationId,
      toNumber(shipment.shippingCost),
      shipment.shippingMethodId,
      shipment.shippingTermId,
      shipment.incoterm,
      shipment.incotermLocation,
      args.companyId,
      args.userId
    ]
  );

  for (const line of lines) {
    await client.query(
      `
        INSERT INTO "salesInvoiceLine" (
          id, "invoiceId", "invoiceLineType", "salesOrderId",
          "salesOrderLineId", "methodType", "itemId", "locationId",
          "storageUnitId", "accountId", "assetId", description, quantity,
          "unitPrice", "addOnCost", "nonTaxableAddOnCost", "setupPrice",
          "shippingCost", "taxPercent", "unitOfMeasureCode", "exchangeRate",
          "sortOrder", "customFields", "externalNotes", "internalNotes",
          "companyId", "createdAt", "createdBy"
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20, $21, $22, '{}'::jsonb,
          '{}'::jsonb, '{}'::jsonb, $23, NOW(), $24
        )
      `,
      [
        nanoid(),
        invoiceId,
        line.salesOrderLineType,
        line.salesOrderId,
        line.id,
        line.methodType,
        line.itemId,
        line.locationId,
        line.storageUnitId,
        line.accountId,
        line.assetId,
        line.description,
        toNumber(line.quantityToInvoice),
        toNumber(line.unitPrice),
        toNumber(line.addOnCost),
        toNumber(line.nonTaxableAddOnCost),
        toNumber(line.setupPrice),
        toNumber(line.shippingCost),
        toNumber(line.taxPercent),
        line.unitOfMeasureCode ?? "EA",
        toNumber(line.exchangeRate, 1),
        toNumber(line.sortOrder, 1),
        args.companyId,
        args.userId
      ]
    );
  }

  return invoiceId;
}

async function salesRfqToQuote(
  client: PoolClient,
  args: Extract<ConvertArgs, { type: "salesRfqToQuote" }>
) {
  const rfq = await queryOneRequired<Row>(
    client,
    `SELECT * FROM "salesRfq" WHERE id = $1 AND "companyId" = $2`,
    [args.id, args.companyId],
    "Sales RFQ not found"
  );
  if (rfq.status !== "Ready for Quote") {
    throw new Error(`Sales RFQ with id ${args.id} is not in Ready for Quote status`);
  }
  if (!rfq.customerId) {
    throw new Error(`Sales RFQ with id ${args.id} has no customerId`);
  }

  const [customerPayment, customerShipping, customer, company, rfqLines] =
    await Promise.all([
      queryOneRequired<Row>(
        client,
        `SELECT * FROM "customerPayment" WHERE "customerId" = $1 AND "companyId" = $2`,
        [rfq.customerId, args.companyId],
        "Customer payment not found"
      ),
      queryOneRequired<Row>(
        client,
        `SELECT * FROM "customerShipping" WHERE "customerId" = $1 AND "companyId" = $2`,
        [rfq.customerId, args.companyId],
        "Customer shipping not found"
      ),
      queryOneRequired<Row>(
        client,
        `SELECT * FROM "customer" WHERE id = $1 AND "companyId" = $2`,
        [rfq.customerId, args.companyId],
        "Customer not found"
      ),
      queryOneRequired<Row>(
        client,
        `SELECT * FROM "company" WHERE id = $1`,
        [args.companyId],
        "Company not found"
      ),
      queryMany<Row>(
        client,
        `
          SELECT srl.*, i.type AS "itemType", i."defaultMethodType"
          FROM "salesRfqLine" srl
          LEFT JOIN "item" i ON i.id = srl."itemId"
          WHERE srl."salesRfqId" = $1 AND srl."companyId" = $2
          ORDER BY srl."order", srl.id
        `,
        [args.id, args.companyId]
      )
    ]);

  if (rfqLines.some((line) => !line.itemId)) {
    throw new Error("Sales RFQ lines without itemId are not ported yet");
  }

  const quoteReadableId = await getNextSequence(client, "quote", args.companyId);
  const quoteId = nanoid();
  const currencyCode =
    customer.currencyCode ?? company.baseCurrencyCode ?? "USD";
  const currency = await queryOne<Row>(
    client,
    `SELECT "exchangeRate" FROM "currency" WHERE code = $1 AND "companyId" = $2`,
    [currencyCode, args.companyId]
  );

  await client.query(
    `
      INSERT INTO "quote" (
        id, "quoteId", "revisionId", status, "customerId",
        "customerContactId", "customerEngineeringContactId",
        "customerLocationId", "customerReference", "locationId",
        "expirationDate", "salesPersonId", "externalNotes", "internalNotes",
        "companyId", "createdAt", "createdBy", "currencyCode",
        "exchangeRate", "exchangeRateUpdatedAt", "opportunityId"
      )
      VALUES (
        $1, $2, 0, 'Draft', $3, $4, $5, $6, $7, $8,
        CURRENT_DATE + INTERVAL '30 days', $9, $10, $11, $12, NOW(), $13,
        $14, $15, NOW(), $16
      )
    `,
    [
      quoteId,
      quoteReadableId,
      rfq.customerId,
      rfq.customerContactId,
      rfq.customerEngineeringContactId,
      rfq.customerLocationId,
      rfq.customerReference,
      rfq.locationId,
      rfq.salesPersonId ?? args.userId,
      rfq.externalNotes ?? {},
      rfq.internalNotes ?? {},
      args.companyId,
      args.userId,
      currencyCode,
      toNumber(currency?.exchangeRate, 1),
      rfq.opportunityId
    ]
  );

  await client.query(
    `
      INSERT INTO "quotePayment" (
        id, "invoiceCustomerId", "invoiceCustomerContactId",
        "invoiceCustomerLocationId", "paymentTermId", "companyId"
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      quoteId,
      customerPayment.invoiceCustomerId,
      customerPayment.invoiceCustomerContactId,
      customerPayment.invoiceCustomerLocationId,
      customerPayment.paymentTermId,
      args.companyId
    ]
  );

  await client.query(
    `
      INSERT INTO "quoteShipment" (
        id, "locationId", "shippingMethodId", "shippingTermId",
        incoterm, "incotermLocation", "companyId"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      quoteId,
      rfq.locationId,
      customerShipping.shippingMethodId,
      customerShipping.shippingTermId,
      customerShipping.incoterm,
      customerShipping.incotermLocation,
      args.companyId
    ]
  );

  for (const line of rfqLines) {
    await client.query(
      `
        INSERT INTO "quoteLine" (
          id, "quoteId", "quoteRevisionId", "itemId", "customerPartId",
          "customerPartRevision", description, "itemType", "locationId",
          "methodType", "modelUploadId", "internalNotes", "externalNotes",
          quantity, status, "unitOfMeasureCode", "sortOrder", "taxPercent",
          "unitPricePrecision", "companyId", "createdBy"
        )
        VALUES (
          $1, $2, 0, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          $13, 'Not Started', $14, $15, 0, 2, $16, $17
        )
      `,
      [
        line.id,
        quoteId,
        line.itemId,
        line.customerPartId,
        line.customerPartRevision,
        line.description ?? line.customerPartId,
        line.itemType ?? "Part",
        rfq.locationId,
        line.defaultMethodType ?? "Make to Order",
        line.modelUploadId,
        line.internalNotes ?? {},
        line.externalNotes ?? {},
        line.quantity,
        line.unitOfMeasureCode,
        toNumber(line.order, 1),
        args.companyId,
        args.userId
      ]
    );
  }

  await client.query(
    `
      UPDATE "salesRfq"
      SET status = 'Quoted', "updatedAt" = NOW(), "updatedBy" = $1
      WHERE id = $2 AND "companyId" = $3
    `,
    [args.userId, args.id, args.companyId]
  );

  return quoteId;
}

async function quoteToSalesOrder(
  client: PoolClient,
  args: Extract<ConvertArgs, { type: "quoteToSalesOrder" }>
) {
  const quote = await queryOneRequired<Row>(
    client,
    `SELECT * FROM "quote" WHERE id = $1 AND "companyId" = $2`,
    [args.id, args.companyId],
    "Quote not found"
  );
  const payment = await queryOneRequired<Row>(
    client,
    `SELECT * FROM "quotePayment" WHERE id = $1 AND "companyId" = $2`,
    [args.id, args.companyId],
    "Quote payment not found"
  );
  const shipment = await queryOneRequired<Row>(
    client,
    `SELECT * FROM "quoteShipment" WHERE id = $1 AND "companyId" = $2`,
    [args.id, args.companyId],
    "Quote shipment not found"
  );
  const company = await queryOneRequired<Row>(
    client,
    `SELECT * FROM "company" WHERE id = $1`,
    [args.companyId],
    "Company not found"
  );
  const lines = await queryMany<Row>(
    client,
    `
      SELECT *
      FROM "quoteLine"
      WHERE "quoteId" = $1 AND "companyId" = $2
      ORDER BY "sortOrder", id
    `,
    [args.id, args.companyId]
  );
  const selectedLines = lines.filter((line) => {
    const selected = args.selectedLines[String(line.id)];
    return Boolean(selected && selected.quantity > 0);
  });
  const hasZeroQuantityLines = lines.some(
    (line) => args.selectedLines[String(line.id)]?.quantity === 0
  );

  const salesOrderReadableId = await getNextSequence(
    client,
    "salesOrder",
    args.companyId
  );
  const salesOrderId = nanoid();

  await client.query(
    `
      INSERT INTO "salesOrder" (
        id, "salesOrderId", "revisionId", "orderDate", "customerId",
        "customerContactId", "customerEngineeringContactId",
        "customerLocationId", "customerReference", "locationId",
        "salesPersonId", status, "createdAt", "createdBy", "companyId",
        "currencyCode", "externalNotes", "internalNotes", "exchangeRate",
        "exchangeRateUpdatedAt", "opportunityId"
      )
      VALUES (
        $1, $2, 0, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9,
        'To Ship and Invoice', NOW(), $10, $11, $12, $13, $14, $15, NOW(), $16
      )
    `,
    [
      salesOrderId,
      salesOrderReadableId,
      quote.customerId,
      quote.customerContactId,
      quote.customerEngineeringContactId,
      quote.customerLocationId,
      args.purchaseOrderNumber ?? "",
      quote.locationId,
      quote.salesPersonId ?? args.userId,
      args.userId,
      args.companyId,
      quote.currencyCode ?? company.baseCurrencyCode ?? "USD",
      quote.externalNotes ?? {},
      quote.internalNotes ?? {},
      toNumber(quote.exchangeRate, 1),
      quote.opportunityId
    ]
  );

  await client.query(
    `
      INSERT INTO "salesOrderPayment" (
        id, "invoiceCustomerId", "invoiceCustomerContactId",
        "invoiceCustomerLocationId", "paymentTermId", "paymentComplete",
        "companyId"
      )
      VALUES ($1, $2, $3, $4, $5, false, $6)
    `,
    [
      salesOrderId,
      payment.invoiceCustomerId,
      payment.invoiceCustomerContactId,
      payment.invoiceCustomerLocationId,
      payment.paymentTermId,
      args.companyId
    ]
  );

  await client.query(
    `
      INSERT INTO "salesOrderShipment" (
        id, "locationId", "shippingCost", "shippingMethodId",
        "shippingTermId", incoterm, "incotermLocation", "dropShipment",
        "companyId"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8)
    `,
    [
      salesOrderId,
      shipment.locationId,
      toNumber(shipment.shippingCost),
      shipment.shippingMethodId,
      shipment.shippingTermId,
      shipment.incoterm,
      shipment.incotermLocation,
      args.companyId
    ]
  );

  for (const line of selectedLines) {
    const selected = args.selectedLines[String(line.id)];
    if (!selected) continue;
    await client.query(
      `
        INSERT INTO "salesOrderLine" (
          id, "salesOrderId", "salesOrderLineType", "addOnCost",
          "nonTaxableAddOnCost", description, "itemId", "locationId",
          "methodType", "storageUnitId", "internalNotes", "externalNotes",
          "saleQuantity", "quantityToSend", "quantityToInvoice", status,
          "unitOfMeasureCode", "unitPrice", "promisedDate", "createdAt",
          "createdBy", "companyId", "exchangeRate", "taxPercent",
          "shippingCost", "sortOrder", "invoicedComplete", "sentComplete",
          "requiresInspection"
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10, $11, $12, $12,
          $12, 'Ordered', $13, $14, CURRENT_DATE + ($15::integer * INTERVAL '1 day'),
          NOW(), $16, $17, $18, $19, $20, $21, false, false, false
        )
      `,
      [
        line.id,
        salesOrderId,
        line.itemType,
        selected.taxableAddOn ?? selected.addOn,
        (selected.addOn ?? 0) - (selected.taxableAddOn ?? selected.addOn ?? 0),
        line.description,
        line.itemId,
        line.locationId ?? quote.locationId,
        line.methodType,
        line.internalNotes ?? {},
        line.externalNotes ?? {},
        selected.quantity,
        line.unitOfMeasureCode,
        selected.netUnitPrice,
        selected.leadTime,
        args.userId,
        args.companyId,
        toNumber(quote.exchangeRate, 1),
        toNumber(line.taxPercent),
        selected.shippingCost,
        toNumber(line.sortOrder, 1)
      ]
    );
  }

  await client.query(
    `
      UPDATE "quote"
      SET status = $1,
          "digitalQuoteAcceptedBy" = $2,
          "digitalQuoteAcceptedByEmail" = $3,
          "updatedAt" = NOW(),
          "updatedBy" = $4
      WHERE id = $5 AND "companyId" = $6
    `,
    [
      hasZeroQuantityLines ? "Partial" : "Ordered",
      args.digitalQuoteAcceptedBy ?? null,
      args.digitalQuoteAcceptedByEmail ?? null,
      args.userId,
      args.id,
      args.companyId
    ]
  );

  return salesOrderId;
}

async function supplierQuoteToPurchaseOrder(
  client: PoolClient,
  args: Extract<ConvertArgs, { type: "supplierQuoteToPurchaseOrder" }>
) {
  const quote = await queryOneRequired<Row>(
    client,
    `SELECT * FROM "supplierQuote" WHERE id = $1 AND "companyId" = $2`,
    [args.id, args.companyId],
    "Supplier quote not found"
  );
  const [supplierPayment, supplierShipping, supplier, company, lines] =
    await Promise.all([
      queryOneRequired<Row>(
        client,
        `SELECT * FROM "supplierPayment" WHERE "supplierId" = $1 AND "companyId" = $2`,
        [quote.supplierId, args.companyId],
        "Supplier payment not found"
      ),
      queryOneRequired<Row>(
        client,
        `SELECT * FROM "supplierShipping" WHERE "supplierId" = $1 AND "companyId" = $2`,
        [quote.supplierId, args.companyId],
        "Supplier shipping not found"
      ),
      queryOneRequired<Row>(
        client,
        `SELECT * FROM "supplier" WHERE id = $1 AND "companyId" = $2`,
        [quote.supplierId, args.companyId],
        "Supplier not found"
      ),
      queryOneRequired<Row>(
        client,
        `SELECT * FROM "company" WHERE id = $1`,
        [args.companyId],
        "Company not found"
      ),
      queryMany<Row>(
        client,
        `
          SELECT sql.*, i.type AS "itemType"
          FROM "supplierQuoteLine" sql
          LEFT JOIN "item" i ON i.id = sql."itemId"
          WHERE sql."supplierQuoteId" = $1 AND sql."companyId" = $2
          ORDER BY sql."sortOrder", sql.id
        `,
        [args.id, args.companyId]
      )
    ]);
  const selectedLines = lines.filter((line) => {
    const selected = args.selectedLines[String(line.id)];
    return Boolean(selected && selected.quantity > 0);
  });

  const purchaseOrderReadableId = await getNextSequence(
    client,
    "purchaseOrder",
    args.companyId
  );
  const purchaseOrderId = nanoid();

  await client.query(
    `
      INSERT INTO "purchaseOrder" (
        id, "purchaseOrderId", "purchaseOrderType", "revisionId", status,
        "supplierId", "supplierContactId", "supplierLocationId",
        "supplierReference", "supplierInteractionId", "createdAt",
        "createdBy", "companyId", "currencyCode", "exchangeRate",
        "exchangeRateUpdatedAt"
      )
      VALUES (
        $1, $2, $3, 0, 'To Receive and Invoice', $4, $5, $6, $7, $8, NOW(),
        $9, $10, $11, $12, NOW()
      )
    `,
    [
      purchaseOrderId,
      purchaseOrderReadableId,
      quote.supplierQuoteType,
      quote.supplierId,
      quote.supplierContactId,
      quote.supplierLocationId,
      quote.supplierReference,
      quote.supplierInteractionId,
      args.userId,
      args.companyId,
      quote.currencyCode ?? supplier.currencyCode ?? company.baseCurrencyCode ?? "USD",
      toNumber(quote.exchangeRate, 1)
    ]
  );

  await client.query(
    `
      INSERT INTO "purchaseOrderPayment" (
        id, "invoiceSupplierId", "invoiceSupplierContactId",
        "invoiceSupplierLocationId", "paymentTermId", "paymentComplete",
        "companyId"
      )
      VALUES ($1, $2, $3, $4, $5, false, $6)
    `,
    [
      purchaseOrderId,
      supplierPayment.invoiceSupplierId,
      supplierPayment.invoiceSupplierContactId,
      supplierPayment.invoiceSupplierLocationId,
      supplierPayment.paymentTermId,
      args.companyId
    ]
  );

  await client.query(
    `
      INSERT INTO "purchaseOrderDelivery" (
        id, "locationId", "shippingMethodId", "shippingTermId", incoterm,
        "incotermLocation", "dropShipment", "supplierShippingCost",
        "companyId"
      )
      VALUES ($1, NULL, $2, $3, $4, $5, false, 0, $6)
    `,
    [
      purchaseOrderId,
      supplierShipping.shippingMethodId,
      supplierShipping.shippingTermId,
      supplierShipping.incoterm,
      supplierShipping.incotermLocation,
      args.companyId
    ]
  );

  for (const line of selectedLines) {
    const selected = args.selectedLines[String(line.id)];
    if (!selected) continue;
    const isIndirect = line.supplierQuoteLineType === "G/L Account";
    await client.query(
      `
        INSERT INTO "purchaseOrderLine" (
          id, "purchaseOrderId", "purchaseOrderLineType", description,
          "itemId", "accountId", "costCenterId", "locationId",
          "exchangeRate", "conversionFactor", "internalNotes",
          "externalNotes", "purchaseQuantity", "quantityToReceive",
          "quantityToInvoice", "inventoryUnitOfMeasureCode",
          "purchaseUnitOfMeasureCode", "supplierUnitPrice",
          "supplierShippingCost", "supplierTaxAmount", "unitPrice",
          "shippingCost", "sortOrder", "createdAt", "createdBy",
          "companyId", "invoicedComplete", "receivedComplete",
          "requiresInspection"
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, NULL, $8, $9, $10, $11, $12, $12, $12,
          $13, $14, $15, $16, $17, $18, $19, $20, NOW(), $21, $22,
          false, false, false
        )
      `,
      [
        nanoid(),
        purchaseOrderId,
        isIndirect ? "G/L Account" : line.itemType ?? "Part",
        line.description,
        isIndirect ? null : line.itemId,
        isIndirect ? line.accountId : null,
        isIndirect ? line.costCenterId : null,
        toNumber(quote.exchangeRate, 1),
        toNumber(line.conversionFactor, 1),
        line.internalNotes ?? {},
        line.externalNotes ?? {},
        selected.quantity,
        line.inventoryUnitOfMeasureCode,
        line.purchaseUnitOfMeasureCode,
        selected.supplierUnitPrice,
        selected.supplierShippingCost,
        selected.supplierTaxAmount,
        selected.unitPrice,
        selected.shippingCost,
        toNumber(line.sortOrder, 1),
        args.userId,
        args.companyId
      ]
    );
  }

  return purchaseOrderId;
}

async function getNextSequence(
  client: PoolClient,
  table: string,
  companyId: string
) {
  const row = await queryOne<{ value: string }>(
    client,
    `SELECT get_next_sequence($1, $2) AS value`,
    [table, companyId]
  );
  if (!row?.value) throw new Error(`Failed to get next sequence for ${table}`);
  return row.value;
}

function toNumber(value: unknown, fallback = 0) {
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

async function queryOneRequired<T extends QueryResultRow>(
  client: PoolClient,
  query: string,
  values: unknown[] = [],
  message = "Record not found"
) {
  const row = await queryOne<T>(client, query, values);
  if (!row) throw new Error(message);
  return row;
}

async function queryMany<T extends QueryResultRow>(
  client: PoolClient,
  query: string,
  values: unknown[] = []
) {
  const result = await client.query<T>(query, values);
  return result.rows;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled convert type: ${JSON.stringify(value)}`);
}
