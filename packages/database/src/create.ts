import { nanoid } from "nanoid";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { getPostgresConnectionPool } from "./postgres.ts";

type CreateArgs =
  | {
      type: "nonConformanceTasks";
      id: string;
      companyId: string;
      userId: string;
    }
  | {
      type: "purchaseOrderFromJob";
      jobId: string;
      purchaseOrdersBySupplierId: Record<string, string>;
      companyId: string;
      userId: string;
    };

type NonConformanceRow = {
  id: string;
  description: string | null;
  content: unknown;
  nonConformanceWorkflowId: string | null;
  requiredActionIds: string[] | null;
  approvalRequirements: unknown[] | null;
};

type NonConformanceWorkflowRow = {
  content: unknown;
};

type ActionTaskRow = {
  id: string;
  actionTypeId: string | null;
};

type ApprovalTaskRow = {
  id: string;
  approvalType: unknown;
};

type ReviewerRow = {
  id: string;
};

type JobRow = {
  id: string;
  jobId: string;
  locationId: string | null;
};

type JobOperationRow = {
  id: string;
  jobId: string;
  jobMakeMethodId: string | null;
  operationSupplierProcessId: string | null;
  operationType: string;
  operationQuantity: string | number | null;
  operationUnitCost: string | number | null;
  operationMinimumCost: string | number | null;
  itemId: string | null;
};

type SupplierProcessRow = {
  id: string;
  supplierId: string;
};

type PurchaseOrderLineRow = {
  id: string;
  jobOperationId: string | null;
};

type SupplierRow = {
  id: string;
  currencyCode: string | null;
};

type SupplierPaymentRow = {
  supplierId: string;
  paymentTermId: string | null;
  invoiceSupplierId: string | null;
  invoiceSupplierContactId: string | null;
  invoiceSupplierLocationId: string | null;
};

type SupplierShippingRow = {
  supplierId: string;
  shippingMethodId: string | null;
  shippingTermId: string | null;
};

type ItemRow = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  unitOfMeasureCode: string | null;
};

let createPool: Pool | null = null;

export async function create(args: CreateArgs) {
  if (!args.companyId) throw new Error("Payload is missing companyId");
  if (!args.userId) throw new Error("Payload is missing userId");

  const pool = getCreatePool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [
      args.userId
    ]);

    switch (args.type) {
      case "nonConformanceTasks":
        await createNonConformanceTasks(client, args);
        break;
      case "purchaseOrderFromJob":
        await createPurchaseOrdersFromJob(client, args);
        break;
      default:
        assertNever(args);
    }

    await client.query("COMMIT");
    return { success: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function closeCreatePool() {
  if (!createPool) return;
  await createPool.end();
  createPool = null;
}

function getCreatePool() {
  createPool ??= getPostgresConnectionPool(
    Number(process.env.DATABASE_SERVICE_POOL_SIZE ?? 5),
    { kind: "service" }
  );
  return createPool;
}

async function createNonConformanceTasks(
  client: PoolClient,
  args: Extract<CreateArgs, { type: "nonConformanceTasks" }>
) {
  const nonConformance = await queryOne<NonConformanceRow>(
    client,
    `SELECT id, description, content, "nonConformanceWorkflowId",
            "requiredActionIds", "approvalRequirements"
     FROM "nonConformance"
     WHERE id = $1 AND "companyId" = $2`,
    [args.id, args.companyId]
  );

  if (!nonConformance) throw new Error("Non-conformance not found");

  const actionTasks = await queryMany<ActionTaskRow>(
    client,
    `SELECT id, "actionTypeId"
     FROM "nonConformanceActionTask"
     WHERE "nonConformanceId" = $1`,
    [args.id]
  );
  const approvalTasks = await queryMany<ApprovalTaskRow>(
    client,
    `SELECT id, "approvalType"
     FROM "nonConformanceApprovalTask"
     WHERE "nonConformanceId" = $1`,
    [args.id]
  );
  const existingReviewers = await queryMany<ReviewerRow>(
    client,
    `SELECT id
     FROM "nonConformanceReviewer"
     WHERE "nonConformanceId" = $1`,
    [args.id]
  );
  const workflow = nonConformance.nonConformanceWorkflowId
    ? await queryOne<NonConformanceWorkflowRow>(
        client,
        `SELECT content
         FROM "nonConformanceWorkflow"
         WHERE id = $1 AND "companyId" = $2`,
        [nonConformance.nonConformanceWorkflowId, args.companyId]
      )
    : null;

  const currentActionTasks = new Map(
    actionTasks
      .filter((task) => task.actionTypeId)
      .map((task) => [task.actionTypeId as string, task.id])
  );
  const currentApprovalTasks = new Map(
    approvalTasks
      .filter((task) => approvalKey(task.approvalType))
      .map((task) => [approvalKey(task.approvalType) as string, task.id])
  );

  const requiredActionIds = nonConformance.requiredActionIds ?? [];
  const approvalRequirements = normalizeStringArray(
    nonConformance.approvalRequirements
  );

  const actionTasksToDelete = Array.from(currentActionTasks.entries())
    .filter(([actionTypeId]) => !requiredActionIds.includes(actionTypeId))
    .map(([, id]) => id);
  const approvalTasksToDelete = Array.from(currentApprovalTasks.entries())
    .filter(([approvalType]) => !approvalRequirements.includes(approvalType))
    .map(([, id]) => id);

  await backfillNonConformanceContent(client, {
    nonConformance,
    workflow,
    id: args.id
  });

  for (const [index, actionTypeId] of requiredActionIds.entries()) {
    if (currentActionTasks.has(actionTypeId)) continue;

    await client.query(
      `INSERT INTO "nonConformanceActionTask" (
         id, "nonConformanceId", "actionTypeId", "sortOrder", status,
         notes, "companyId", "createdAt", "createdBy"
       )
       VALUES ($1, $2, $3, $4, 'Pending', '{}'::jsonb, $5, NOW(), $6)`,
      [nanoid(), args.id, actionTypeId, index + 1, args.companyId, args.userId]
    );
  }

  for (const approvalType of approvalRequirements) {
    if (currentApprovalTasks.has(approvalType)) continue;

    await client.query(
      `INSERT INTO "nonConformanceApprovalTask" (
         id, "nonConformanceId", "approvalType", "sortOrder", status,
         notes, "companyId", "createdAt", "createdBy"
       )
       VALUES ($1, $2, $3::jsonb, 0, 'Pending', '{}'::jsonb, $4, NOW(), $5)`,
      [
        nanoid(),
        args.id,
        JSON.stringify(approvalType),
        args.companyId,
        args.userId
      ]
    );
  }

  if (actionTasksToDelete.length > 0) {
    await client.query(
      `DELETE FROM "nonConformanceActionTask" WHERE id = ANY($1::text[])`,
      [actionTasksToDelete]
    );
  }

  if (approvalTasksToDelete.length > 0) {
    await client.query(
      `DELETE FROM "nonConformanceApprovalTask" WHERE id = ANY($1::text[])`,
      [approvalTasksToDelete]
    );
  }

  const hasMrbApproval = approvalRequirements.includes("MRB");
  const hasExistingMrbTask = currentApprovalTasks.has("MRB");
  const hasExistingReviewers = existingReviewers.length > 0;

  if (!hasMrbApproval && hasExistingReviewers) {
    await client.query(
      `DELETE FROM "nonConformanceReviewer"
       WHERE "nonConformanceId" = $1`,
      [args.id]
    );
  } else if (hasMrbApproval && (!hasExistingMrbTask || !hasExistingReviewers)) {
    for (const title of ["Engineering", "Quality"]) {
      await client.query(
        `INSERT INTO "nonConformanceReviewer" (
           id, "nonConformanceId", title, status, notes,
           "companyId", "createdAt", "createdBy"
         )
         VALUES ($1, $2, $3, 'Pending', '{}'::jsonb, $4, NOW(), $5)`,
        [nanoid(), args.id, title, args.companyId, args.userId]
      );
    }
  }
}

async function backfillNonConformanceContent(
  client: PoolClient,
  args: {
    id: string;
    nonConformance: NonConformanceRow;
    workflow: NonConformanceWorkflowRow | null;
  }
) {
  const content = args.nonConformance.content;
  if (!isEmptyObject(content)) return;

  const workflowContent = isRecord(args.workflow?.content)
    ? args.workflow.content.content
    : [];
  const insertedContent = {
    type: "doc",
    content: Array.isArray(workflowContent) ? [...workflowContent] : []
  };

  if (args.nonConformance.description) {
    insertedContent.content.unshift({
      type: "paragraph",
      content: [{ type: "text", text: args.nonConformance.description }]
    });
  }

  if (insertedContent.content.length === 0) return;

  await client.query(
    `UPDATE "nonConformance"
     SET content = $1::jsonb
     WHERE id = $2`,
    [JSON.stringify(insertedContent), args.id]
  );
}

async function createPurchaseOrdersFromJob(
  client: PoolClient,
  args: Extract<CreateArgs, { type: "purchaseOrderFromJob" }>
) {
  const job = await queryOne<JobRow>(
    client,
    `SELECT id, "jobId", "locationId"
     FROM "job"
     WHERE id = $1 AND "companyId" = $2`,
    [args.jobId, args.companyId]
  );
  if (!job) throw new Error("Job not found");

  const outsideOperations = await queryMany<JobOperationRow>(
    client,
    `SELECT jo.id, jo."jobId", jo."jobMakeMethodId",
            jo."operationSupplierProcessId", jo."operationType",
            jo."operationQuantity", jo."operationUnitCost",
            jo."operationMinimumCost", jmm."itemId"
     FROM "jobOperation" jo
     LEFT JOIN "jobMakeMethod" jmm ON jmm.id = jo."jobMakeMethodId"
     WHERE jo."jobId" = $1
       AND jo."companyId" = $2
       AND jo."operationType" = 'Outside'`,
    [args.jobId, args.companyId]
  );

  if (outsideOperations.length === 0) return;

  const supplierProcessIds = unique(
    outsideOperations.map((operation) => operation.operationSupplierProcessId)
  );
  if (supplierProcessIds.length === 0) return;

  const supplierProcesses = await queryMany<SupplierProcessRow>(
    client,
    `SELECT id, "supplierId"
     FROM "supplierProcess"
     WHERE id = ANY($1::text[]) AND "companyId" = $2`,
    [supplierProcessIds, args.companyId]
  );
  const existingPurchaseOrderLines = await queryMany<PurchaseOrderLineRow>(
    client,
    `SELECT id, "jobOperationId"
     FROM "purchaseOrderLine"
     WHERE "jobId" = $1
       AND "jobOperationId" = ANY($2::text[])
       AND "companyId" = $3`,
    [args.jobId, outsideOperations.map((operation) => operation.id), args.companyId]
  );

  const supplierProcessById = new Map(
    supplierProcesses.map((process) => [process.id, process])
  );
  const existingOperationIds = new Set(
    existingPurchaseOrderLines
      .map((line) => line.jobOperationId)
      .filter((id): id is string => Boolean(id))
  );
  const outsideOperationsBySupplierId = new Map<string, JobOperationRow[]>();

  for (const operation of outsideOperations) {
    if (existingOperationIds.has(operation.id)) continue;
    const supplierProcess = operation.operationSupplierProcessId
      ? supplierProcessById.get(operation.operationSupplierProcessId)
      : null;
    if (!supplierProcess) continue;

    const supplierOperations =
      outsideOperationsBySupplierId.get(supplierProcess.supplierId) ?? [];
    supplierOperations.push(operation);
    outsideOperationsBySupplierId.set(
      supplierProcess.supplierId,
      supplierOperations
    );
  }

  const supplierIds = Array.from(outsideOperationsBySupplierId.keys());
  if (supplierIds.length === 0) return;

  const itemIds = unique(outsideOperations.map((operation) => operation.itemId));
  const suppliers = await queryMany<SupplierRow>(
    client,
    `SELECT id, "currencyCode"
     FROM "supplier"
     WHERE id = ANY($1::text[]) AND "companyId" = $2`,
    [supplierIds, args.companyId]
  );
  const supplierPayments = await queryMany<SupplierPaymentRow>(
    client,
    `SELECT "supplierId", "paymentTermId", "invoiceSupplierId",
            "invoiceSupplierContactId", "invoiceSupplierLocationId"
     FROM "supplierPayment"
     WHERE "supplierId" = ANY($1::text[])`,
    [supplierIds]
  );
  const supplierShipping = await queryMany<SupplierShippingRow>(
    client,
    `SELECT "supplierId", "shippingMethodId", "shippingTermId"
     FROM "supplierShipping"
     WHERE "supplierId" = ANY($1::text[])`,
    [supplierIds]
  );
  const items =
    itemIds.length > 0
      ? await queryMany<ItemRow>(
          client,
          `SELECT id, name, description, type, "unitOfMeasureCode"
           FROM "item"
           WHERE id = ANY($1::text[])`,
          [itemIds]
        )
      : [];
  const company = await queryOne<{ companyGroupId: string | null }>(
    client,
    `SELECT "companyGroupId" FROM "company" WHERE id = $1`,
    [args.companyId]
  );

  if (!company?.companyGroupId) {
    throw new Error("Company has no company group");
  }

  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const paymentBySupplierId = new Map(
    supplierPayments.map((payment) => [payment.supplierId, payment])
  );
  const shippingBySupplierId = new Map(
    supplierShipping.map((shipping) => [shipping.supplierId, shipping])
  );
  const itemById = new Map(items.map((item) => [item.id, item]));
  const exchangeRateByCurrency = await getExchangeRateByCurrency(
    client,
    company.companyGroupId,
    suppliers.map((supplier) => supplier.currencyCode)
  );

  for (const [supplierId, operations] of outsideOperationsBySupplierId) {
    const supplier = supplierById.get(supplierId);
    if (!supplier) continue;

    let purchaseOrderId =
      args.purchaseOrdersBySupplierId[supplierId] === "new"
        ? undefined
        : args.purchaseOrdersBySupplierId[supplierId];

    if (!purchaseOrderId) {
      purchaseOrderId = await createOutsideProcessingPurchaseOrder(client, {
        job,
        supplier,
        payment: paymentBySupplierId.get(supplierId),
        shipping: shippingBySupplierId.get(supplierId),
        exchangeRate:
          exchangeRateByCurrency.get(supplier.currencyCode ?? "USD") ?? 1,
        companyId: args.companyId,
        userId: args.userId
      });
    }

    for (const operation of operations) {
      const item = operation.itemId ? itemById.get(operation.itemId) : null;
      const supplierProcess = operation.operationSupplierProcessId
        ? supplierProcessById.get(operation.operationSupplierProcessId)
        : null;
      if (!item || !supplierProcess) continue;

      const operationQuantity = toNumber(operation.operationQuantity, 0);
      const unitCost = toNumber(operation.operationUnitCost, 0);
      const minimumCost = toNumber(operation.operationMinimumCost, 0);
      const totalUnitCost = unitCost * operationQuantity;
      const totalCost =
        minimumCost > totalUnitCost ? minimumCost : totalUnitCost;
      const supplierUnitPrice =
        operationQuantity > 0 ? totalCost / operationQuantity : totalCost;

      await client.query(
        `INSERT INTO "purchaseOrderLine" (
           id, "purchaseOrderId", "purchaseOrderLineType", "itemId",
           description, "purchaseQuantity", "purchaseUnitOfMeasureCode",
           "inventoryUnitOfMeasureCode", "conversionFactor",
           "supplierUnitPrice", "supplierShippingCost", "supplierTaxAmount",
           "exchangeRate", "locationId", "jobId", "jobOperationId",
           "companyId", "createdAt", "createdBy", "sortOrder",
           "receivedComplete", "invoicedComplete", "requiresInspection"
         )
         VALUES (
           $1, $2, $3::"purchaseOrderLineType", $4, $5, $6, $7, $8, 1,
           $9, 0, 0, $10, $11, $12, $13, $14, NOW(), $15, $16,
           false, false, false
         )`,
        [
          nanoid(),
          purchaseOrderId,
          item.type,
          item.id,
          item.name || item.description,
          operationQuantity || 1,
          item.unitOfMeasureCode,
          item.unitOfMeasureCode,
          supplierUnitPrice,
          exchangeRateByCurrency.get(supplier.currencyCode ?? "USD") ?? 1,
          job.locationId,
          job.id,
          operation.id,
          args.companyId,
          args.userId,
          await nextPurchaseOrderLineSortOrder(client, purchaseOrderId)
        ]
      );
    }
  }
}

async function createOutsideProcessingPurchaseOrder(
  client: PoolClient,
  args: {
    job: JobRow;
    supplier: SupplierRow;
    payment: SupplierPaymentRow | undefined;
    shipping: SupplierShippingRow | undefined;
    exchangeRate: number;
    companyId: string;
    userId: string;
  }
) {
  const supplierInteractionId = nanoid();
  await client.query(
    `INSERT INTO "supplierInteraction" (id, "companyId", "supplierId")
     VALUES ($1, $2, $3)`,
    [supplierInteractionId, args.companyId, args.supplier.id]
  );

  const purchaseOrderId = nanoid();
  const nextSequence = await getNextSequence(client, "purchaseOrder", args.companyId);

  await client.query(
    `INSERT INTO "purchaseOrder" (
       id, "purchaseOrderId", "revisionId", status, "supplierId",
       "jobId", "jobReadableId", "companyId", "createdAt", "createdBy",
       "purchaseOrderType", "supplierInteractionId", "currencyCode",
       "exchangeRate", "exchangeRateUpdatedAt"
     )
     VALUES (
       $1, $2, 0, 'Draft', $3, $4, $5, $6, NOW(), $7,
       'Outside Processing', $8, $9, $10, NOW()
     )`,
    [
      purchaseOrderId,
      nextSequence,
      args.supplier.id,
      args.job.id,
      args.job.jobId,
      args.companyId,
      args.userId,
      supplierInteractionId,
      args.supplier.currencyCode ?? "USD",
      args.exchangeRate
    ]
  );

  await client.query(
    `INSERT INTO "purchaseOrderDelivery" (
       id, "locationId", "shippingMethodId", "shippingTermId",
       "dropShipment", "supplierShippingCost", "companyId"
     )
     VALUES ($1, $2, $3, $4, false, 0, $5)`,
    [
      purchaseOrderId,
      args.job.locationId,
      args.shipping?.shippingMethodId ?? null,
      args.shipping?.shippingTermId ?? null,
      args.companyId
    ]
  );

  await client.query(
    `INSERT INTO "purchaseOrderPayment" (
       id, "invoiceSupplierId", "invoiceSupplierContactId",
       "invoiceSupplierLocationId", "paymentTermId", "paymentComplete",
       "companyId"
     )
     VALUES ($1, $2, $3, $4, $5, false, $6)`,
    [
      purchaseOrderId,
      args.payment?.invoiceSupplierId ?? null,
      args.payment?.invoiceSupplierContactId ?? null,
      args.payment?.invoiceSupplierLocationId ?? null,
      args.payment?.paymentTermId ?? null,
      args.companyId
    ]
  );

  return purchaseOrderId;
}

async function nextPurchaseOrderLineSortOrder(
  client: PoolClient,
  purchaseOrderId: string
) {
  const row = await queryOne<{ sortOrder: string | number | null }>(
    client,
    `SELECT COALESCE(MAX("sortOrder"), 0) + 1 AS "sortOrder"
     FROM "purchaseOrderLine"
     WHERE "purchaseOrderId" = $1`,
    [purchaseOrderId]
  );
  return toNumber(row?.sortOrder, 1);
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

async function getExchangeRateByCurrency(
  client: PoolClient,
  companyGroupId: string,
  currencyCodes: Array<string | null>
) {
  const uniqueCurrencyCodes = unique(currencyCodes).map((code) => code ?? "USD");
  if (uniqueCurrencyCodes.length === 0) return new Map<string, number>();

  const rows = await queryMany<{
    code: string;
    exchangeRate: string | number;
  }>(
    client,
    `SELECT code, "exchangeRate"
     FROM "currency"
     WHERE "companyGroupId" = $1
       AND code = ANY($2::text[])`,
    [companyGroupId, uniqueCurrencyCodes]
  );

  const rates = new Map(rows.map((row) => [row.code, toNumber(row.exchangeRate, 1)]));
  for (const code of uniqueCurrencyCodes) {
    rates.set(code, rates.get(code) ?? 1);
  }
  return rates;
}

async function queryOne<T extends QueryResultRow>(
  client: PoolClient,
  text: string,
  params: unknown[] = []
) {
  const result = await client.query<T>(text, params);
  return result.rows[0] ?? null;
}

async function queryMany<T extends QueryResultRow>(
  client: PoolClient,
  text: string,
  params: unknown[] = []
) {
  const result = await client.query<T>(text, params);
  return result.rows;
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function approvalKey(value: unknown) {
  if (typeof value === "string") return value;
  return null;
}

function isEmptyObject(value: unknown) {
  return isRecord(value) && Object.keys(value).length === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unique<T>(values: Array<T | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is T => value !== null && value !== undefined))
  );
}

function toNumber(value: string | number | null | undefined, fallback: number) {
  if (value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported create type: ${JSON.stringify(value)}`);
}
