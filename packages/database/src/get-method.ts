import { nanoid } from "nanoid";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";
import { getPostgresConnectionPool } from "./postgres.ts";

const rawPartsValidator = z.object({
  billOfMaterial: z.boolean().optional(),
  billOfProcess: z.boolean().optional(),
  parameters: z.boolean().optional(),
  tools: z.boolean().optional(),
  steps: z.boolean().optional(),
  workInstructions: z.boolean().optional()
});

const partsValidator = rawPartsValidator.optional().transform((parts) => ({
  billOfMaterial: parts?.billOfMaterial ?? true,
  billOfProcess: parts?.billOfProcess ?? true,
  parameters: parts?.parameters ?? true,
  tools: parts?.tools ?? true,
  steps: parts?.steps ?? true,
  workInstructions: parts?.workInstructions ?? true
}));

export const getMethodArgsValidator = z.object({
  type: z.enum([
    "itemToItem",
    "itemToJob",
    "itemToJobMakeMethod",
    "itemToQuoteLine",
    "itemToQuoteMakeMethod",
    "jobMakeMethodToItem",
    "jobToItem",
    "makeMethodToMakeMethod",
    "procedureToOperation",
    "quoteLineToItem",
    "quoteLineToJob",
    "quoteLineToQuoteLine",
    "quoteMakeMethodToItem",
    "quoteToQuote"
  ]),
  sourceId: z.string(),
  targetId: z.string(),
  companyId: z.string(),
  userId: z.string(),
  configuration: z.record(z.string(), z.unknown()).optional(),
  parts: partsValidator
});

type GetMethodArgs = z.infer<typeof getMethodArgsValidator>;
type MethodParts = GetMethodArgs["parts"];
type Row = QueryResultRow & Record<string, any>;

const jsonbColumnsByTable: Record<string, Set<string>> = {
  jobMaterial: new Set(["customFields"]),
  jobOperation: new Set(["customFields", "workInstruction"]),
  jobOperationStep: new Set(["description"]),
  methodMaterial: new Set(["customFields", "storageUnitIds"]),
  methodOperation: new Set(["customFields", "workInstruction"]),
  methodOperationStep: new Set(["description"]),
  quote: new Set(["customFields", "externalNotes", "internalNotes"]),
  quoteLine: new Set([
    "additionalCharges",
    "configuration",
    "customFields",
    "externalNotes",
    "internalNotes",
    "priceTrace"
  ]),
  quoteLinePrice: new Set(["categoryMarkups"]),
  quoteMaterial: new Set(["customFields"]),
  quoteOperation: new Set(["customFields", "workInstruction"]),
  quotePayment: new Set(["customFields"]),
  quoteOperationStep: new Set(["description"])
};

let getMethodPool: Pool | null = null;

export async function getMethod(input: unknown) {
  const args = getMethodArgsValidator.parse(input);

  if (!args.companyId) throw new Error("Payload is missing companyId");
  if (!args.userId) throw new Error("Payload is missing userId");

  const pool = getGetMethodPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [
      args.userId
    ]);

    const response = await getMethodInTransaction(client, args);

    await client.query("COMMIT");
    return response;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function closeGetMethodPool() {
  if (!getMethodPool) return;
  await getMethodPool.end();
  getMethodPool = null;
}

function getGetMethodPool() {
  getMethodPool ??= getPostgresConnectionPool(
    Number(process.env.DATABASE_SERVICE_POOL_SIZE ?? 5),
    { kind: "service" }
  );
  return getMethodPool;
}

async function getMethodInTransaction(
  client: PoolClient,
  args: GetMethodArgs
) {
  switch (args.type) {
    case "itemToItem":
      await copyItemMethodToItem(client, args);
      return { success: true };
    case "itemToJob":
      await copyItemMethodToJob(client, args);
      return { success: true };
    case "itemToJobMakeMethod":
      await copyItemMethodToJobMakeMethod(client, args);
      return { success: true };
    case "itemToQuoteLine":
      await copyItemMethodToQuoteLine(client, args);
      return { success: true };
    case "itemToQuoteMakeMethod":
      await copyItemMethodToQuoteMakeMethod(client, args);
      return { success: true };
    case "quoteLineToJob":
      await copyQuoteLineToJob(client, args);
      return { success: true };
    case "quoteLineToQuoteLine":
      await copyQuoteLineToQuoteLine(client, args);
      return { success: true };
    case "jobMakeMethodToItem":
      await copyJobMakeMethodToItem(client, args);
      return { success: true };
    case "jobToItem":
      await copyJobToItem(client, args);
      return { success: true };
    case "makeMethodToMakeMethod":
      await copyMakeMethodToMakeMethod(client, args);
      return { success: true };
    case "procedureToOperation":
      await syncProcedureToOperation(client, args);
      return { success: true };
    case "quoteLineToItem":
      await copyQuoteLineToItem(client, args);
      return { success: true };
    case "quoteMakeMethodToItem":
      await copyQuoteMakeMethodToItem(client, args);
      return { success: true };
    case "quoteToQuote": {
      const newQuoteId = await copyQuoteToQuote(client, args);
      return { success: true, newQuoteId };
    }
    default:
      assertNever(args.type);
  }
}

async function copyItemMethodToItem(
  client: PoolClient,
  args: GetMethodArgs
) {
  const sourceMakeMethod = await getActiveMakeMethod(
    client,
    args.sourceId,
    args.companyId
  );
  const targetMakeMethod = await getActiveMakeMethod(
    client,
    args.targetId,
    args.companyId
  );
  const targetReplenishment = await queryOne<Row>(
    client,
    `
      SELECT "requiresConfiguration"
      FROM "itemReplenishment"
      WHERE "itemId" = $1 AND "companyId" = $2
    `,
    [args.targetId, args.companyId]
  );

  if (!targetReplenishment) {
    throw new Error("Failed to get target item replenishment");
  }
  if (targetReplenishment.requiresConfiguration) {
    throw new Error("Cannot override method of configured item");
  }

  await copyMethodContents(client, {
    sourceMakeMethodId: sourceMakeMethod.id,
    targetMakeMethodId: targetMakeMethod.id,
    companyId: args.companyId,
    userId: args.userId,
    parts: args.parts
  });
}

async function copyItemMethodToJob(client: PoolClient, args: GetMethodArgs) {
  const sourceMakeMethod = await getActiveMakeMethod(
    client,
    args.sourceId,
    args.companyId
  );
  const job = await queryOneRequired<Row>(
    client,
    `
      SELECT id, quantity, "locationId"
      FROM "job"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.targetId, args.companyId],
    "Failed to get job"
  );
  const rootJobMakeMethod = await queryOneRequired<Row>(
    client,
    `
      SELECT *
      FROM "jobMakeMethod"
      WHERE "jobId" = $1
        AND "parentMaterialId" IS NULL
        AND "companyId" = $2
      ORDER BY "createdAt"
      LIMIT 1
    `,
    [args.targetId, args.companyId],
    "Failed to get job make method"
  );

  if (args.configuration) {
    await client.query(
      `
        UPDATE "job"
        SET configuration = $1,
            "updatedAt" = NOW(),
            "updatedBy" = $2
        WHERE id = $3 AND "companyId" = $4
      `,
      [
        JSON.stringify(args.configuration),
        args.userId,
        args.targetId,
        args.companyId
      ]
    );
  }

  await clearJobMethodScope(client, {
    jobId: args.targetId,
    rootJobMakeMethodId: rootJobMakeMethod.id,
    companyId: args.companyId,
    userId: args.userId,
    parts: args.parts,
    fullJob: true
  });
  await updateJobMakeMethodVersion(client, {
    jobMakeMethodId: rootJobMakeMethod.id,
    version: sourceMakeMethod.version,
    companyId: args.companyId,
    userId: args.userId
  });

  await copyMethodTreeToJob(client, {
    sourceMakeMethodId: sourceMakeMethod.id,
    jobId: args.targetId,
    jobMakeMethodId: rootJobMakeMethod.id,
    parentQuantity: toNumber(job.quantity, 1),
    locationId: job.locationId,
    companyId: args.companyId,
    userId: args.userId,
    parts: args.parts
  });
}

async function copyItemMethodToJobMakeMethod(
  client: PoolClient,
  args: GetMethodArgs
) {
  const sourceMakeMethod = await getActiveMakeMethod(
    client,
    args.sourceId,
    args.companyId
  );
  const jobMakeMethod = await queryOneRequired<Row>(
    client,
    `
      SELECT *
      FROM "jobMakeMethod"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.targetId, args.companyId],
    "Failed to get job make method"
  );
  const job = await queryOneRequired<Row>(
    client,
    `
      SELECT id, quantity, "locationId"
      FROM "job"
      WHERE id = $1 AND "companyId" = $2
    `,
    [jobMakeMethod.jobId, args.companyId],
    "Failed to get job"
  );
  const parentMaterial = jobMakeMethod.parentMaterialId
    ? await queryOne<Row>(
        client,
        `
          SELECT "estimatedQuantity", "scrapQuantity"
          FROM "jobMaterial"
          WHERE id = $1 AND "companyId" = $2
        `,
        [jobMakeMethod.parentMaterialId, args.companyId]
      )
    : null;
  const parentQuantity =
    toNumber(parentMaterial?.estimatedQuantity, toNumber(job.quantity, 1)) +
    toNumber(parentMaterial?.scrapQuantity, 0);

  await clearJobMethodScope(client, {
    jobId: jobMakeMethod.jobId,
    rootJobMakeMethodId: jobMakeMethod.id,
    companyId: args.companyId,
    userId: args.userId,
    parts: args.parts,
    fullJob: false
  });
  await updateJobMakeMethodVersion(client, {
    jobMakeMethodId: jobMakeMethod.id,
    version: sourceMakeMethod.version,
    companyId: args.companyId,
    userId: args.userId
  });

  await copyMethodTreeToJob(client, {
    sourceMakeMethodId: sourceMakeMethod.id,
    jobId: jobMakeMethod.jobId,
    jobMakeMethodId: jobMakeMethod.id,
    parentQuantity,
    locationId: job.locationId,
    companyId: args.companyId,
    userId: args.userId,
    parts: args.parts
  });
}

async function copyItemMethodToQuoteLine(
  client: PoolClient,
  args: GetMethodArgs
) {
  const [quoteId, quoteLineId] = args.targetId.split(":");
  if (!quoteId || !quoteLineId) throw new Error("Invalid targetId");

  const sourceMakeMethod = await getActiveMakeMethod(
    client,
    args.sourceId,
    args.companyId
  );
  const quote = await queryOneRequired<Row>(
    client,
    `
      SELECT id, "locationId"
      FROM "quote"
      WHERE id = $1 AND "companyId" = $2
    `,
    [quoteId, args.companyId],
    "Failed to get quote"
  );
  const quoteLine = await queryOneRequired<Row>(
    client,
    `
      SELECT id
      FROM "quoteLine"
      WHERE id = $1 AND "quoteId" = $2 AND "companyId" = $3
    `,
    [quoteLineId, quoteId, args.companyId],
    "Failed to get quote line"
  );
  let quoteMakeMethod = await queryOne<Row>(
    client,
    `
      SELECT *
      FROM "quoteMakeMethod"
      WHERE "quoteLineId" = $1
        AND "parentMaterialId" IS NULL
        AND "companyId" = $2
      ORDER BY "createdAt"
      LIMIT 1
    `,
    [quoteLine.id, args.companyId]
  );

  if (!quoteMakeMethod) {
    const rootId = nanoid();
    await insertRow(client, "quoteMakeMethod", {
      id: rootId,
      quoteId,
      quoteLineId,
      itemId: args.sourceId,
      parentMaterialId: null,
      quantityPerParent: 1,
      version: toNumber(sourceMakeMethod.version, 1),
      companyId: args.companyId,
      createdAt: new Date(),
      createdBy: args.userId,
      customFields: {}
    });
    quoteMakeMethod = await getQuoteMakeMethod(client, rootId, args.companyId);
  }

  if (args.configuration) {
    await client.query(
      `
        UPDATE "quoteLine"
        SET configuration = $1,
            "updatedAt" = NOW(),
            "updatedBy" = $2
        WHERE id = $3 AND "companyId" = $4
      `,
      [
        JSON.stringify(args.configuration),
        args.userId,
        quoteLine.id,
        args.companyId
      ]
    );
  }

  await clearQuoteMethodScope(client, {
    quoteId,
    quoteLineId,
    rootQuoteMakeMethodId: quoteMakeMethod.id,
    companyId: args.companyId,
    userId: args.userId,
    parts: args.parts,
    fullLine: true
  });
  await updateQuoteMakeMethodVersion(client, {
    quoteMakeMethodId: quoteMakeMethod.id,
    version: sourceMakeMethod.version,
    companyId: args.companyId,
    userId: args.userId
  });

  await copyMethodTreeToQuote(client, {
    sourceMakeMethodId: sourceMakeMethod.id,
    quoteId,
    quoteLineId,
    quoteMakeMethodId: quoteMakeMethod.id,
    locationId: quote.locationId,
    companyId: args.companyId,
    userId: args.userId,
    parts: args.parts
  });
}

async function copyItemMethodToQuoteMakeMethod(
  client: PoolClient,
  args: GetMethodArgs
) {
  const sourceMakeMethod = await getActiveMakeMethod(
    client,
    args.sourceId,
    args.companyId
  );
  const quoteMakeMethod = await getQuoteMakeMethod(
    client,
    args.targetId,
    args.companyId
  );

  await clearQuoteMethodScope(client, {
    quoteId: quoteMakeMethod.quoteId,
    quoteLineId: quoteMakeMethod.quoteLineId,
    rootQuoteMakeMethodId: quoteMakeMethod.id,
    companyId: args.companyId,
    userId: args.userId,
    parts: args.parts,
    fullLine: false
  });
  await updateQuoteMakeMethodVersion(client, {
    quoteMakeMethodId: quoteMakeMethod.id,
    version: sourceMakeMethod.version,
    companyId: args.companyId,
    userId: args.userId
  });

  await copyMethodTreeToQuote(client, {
    sourceMakeMethodId: sourceMakeMethod.id,
    quoteId: quoteMakeMethod.quoteId,
    quoteLineId: quoteMakeMethod.quoteLineId,
    quoteMakeMethodId: quoteMakeMethod.id,
    locationId: null,
    companyId: args.companyId,
    userId: args.userId,
    parts: args.parts
  });
}

async function copyMakeMethodToMakeMethod(
  client: PoolClient,
  args: GetMethodArgs
) {
  const sourceMakeMethod = await getMakeMethod(
    client,
    args.sourceId,
    args.companyId
  );
  const targetMakeMethod = await getMakeMethod(
    client,
    args.targetId,
    args.companyId
  );

  await copyMethodContents(client, {
    sourceMakeMethodId: sourceMakeMethod.id,
    targetMakeMethodId: targetMakeMethod.id,
    companyId: args.companyId,
    userId: args.userId,
    parts: args.parts
  });
}

async function copyQuoteLineToJob(client: PoolClient, args: GetMethodArgs) {
  const [quoteId, quoteLineId] = args.sourceId.split(":");
  if (!quoteId || !quoteLineId) throw new Error("Invalid sourceId");

  const job = await queryOneRequired<Row>(
    client,
    `
      SELECT id, quantity, "locationId"
      FROM "job"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.targetId, args.companyId],
    "Failed to get job"
  );
  const rootJobMakeMethod = await queryOneRequired<Row>(
    client,
    `
      SELECT *
      FROM "jobMakeMethod"
      WHERE "jobId" = $1
        AND "parentMaterialId" IS NULL
        AND "companyId" = $2
      ORDER BY "createdAt"
      LIMIT 1
    `,
    [args.targetId, args.companyId],
    "Failed to get job make method"
  );
  const rootQuoteMakeMethod = await queryOneRequired<Row>(
    client,
    `
      SELECT *
      FROM "quoteMakeMethod"
      WHERE "quoteLineId" = $1
        AND "parentMaterialId" IS NULL
        AND "companyId" = $2
      ORDER BY "createdAt"
      LIMIT 1
    `,
    [quoteLineId, args.companyId],
    "Failed to get quote make method"
  );

  await clearJobMethodScope(client, {
    jobId: args.targetId,
    rootJobMakeMethodId: rootJobMakeMethod.id,
    companyId: args.companyId,
    userId: args.userId,
    parts: args.parts,
    fullJob: true
  });
  await updateJobMakeMethodVersion(client, {
    jobMakeMethodId: rootJobMakeMethod.id,
    version: rootQuoteMakeMethod.version,
    companyId: args.companyId,
    userId: args.userId
  });

  await copyQuoteMakeMethodToJob(client, {
    quoteMakeMethodId: rootQuoteMakeMethod.id,
    jobId: args.targetId,
    jobMakeMethodId: rootJobMakeMethod.id,
    parentQuantity: toNumber(job.quantity, 1),
    locationId: job.locationId,
    companyId: args.companyId,
    userId: args.userId,
    parts: args.parts
  });
}

async function copyQuoteLineToQuoteLine(
  client: PoolClient,
  args: GetMethodArgs
) {
  const [, sourceQuoteLineId] = args.sourceId.split(":");
  const [targetQuoteId, targetQuoteLineId] = args.targetId.split(":");
  if (!sourceQuoteLineId) throw new Error("Invalid sourceId");
  if (!targetQuoteId || !targetQuoteLineId) throw new Error("Invalid targetId");

  const sourceRoot = await queryOneRequired<Row>(
    client,
    `
      SELECT *
      FROM "quoteMakeMethod"
      WHERE "quoteLineId" = $1
        AND "parentMaterialId" IS NULL
        AND "companyId" = $2
      ORDER BY "createdAt"
      LIMIT 1
    `,
    [sourceQuoteLineId, args.companyId],
    "Failed to get source quote make method"
  );
  let targetRoot = await queryOne<Row>(
    client,
    `
      SELECT *
      FROM "quoteMakeMethod"
      WHERE "quoteLineId" = $1
        AND "parentMaterialId" IS NULL
        AND "companyId" = $2
      ORDER BY "createdAt"
      LIMIT 1
    `,
    [targetQuoteLineId, args.companyId]
  );

  if (!targetRoot) {
    const targetLine = await queryOneRequired<Row>(
      client,
      `
        SELECT "itemId"
        FROM "quoteLine"
        WHERE id = $1 AND "quoteId" = $2 AND "companyId" = $3
      `,
      [targetQuoteLineId, targetQuoteId, args.companyId],
      "Failed to get target quote line"
    );
    const targetRootId = nanoid();
    await insertRow(client, "quoteMakeMethod", {
      id: targetRootId,
      quoteId: targetQuoteId,
      quoteLineId: targetQuoteLineId,
      itemId: targetLine.itemId,
      parentMaterialId: null,
      quantityPerParent: 1,
      version: toNumber(sourceRoot.version, 1),
      companyId: args.companyId,
      createdAt: new Date(),
      createdBy: args.userId,
      customFields: {}
    });
    targetRoot = await getQuoteMakeMethod(client, targetRootId, args.companyId);
  }

  await clearQuoteMethodScope(client, {
    quoteId: targetQuoteId,
    quoteLineId: targetQuoteLineId,
    rootQuoteMakeMethodId: targetRoot.id,
    companyId: args.companyId,
    userId: args.userId,
    parts: args.parts,
    fullLine: true
  });
  await updateQuoteMakeMethodVersion(client, {
    quoteMakeMethodId: targetRoot.id,
    version: sourceRoot.version,
    companyId: args.companyId,
    userId: args.userId
  });

  await copyQuoteMakeMethodToQuote(client, {
    sourceQuoteMakeMethodId: sourceRoot.id,
    targetQuoteId,
    targetQuoteLineId,
    targetQuoteMakeMethodId: targetRoot.id,
    companyId: args.companyId,
    userId: args.userId,
    parts: args.parts
  });
}

async function copyJobToItem(client: PoolClient, args: GetMethodArgs) {
  const rootJobMakeMethod = await queryOneRequired<Row>(
    client,
    `
      SELECT *
      FROM "jobMakeMethod"
      WHERE "jobId" = $1
        AND "parentMaterialId" IS NULL
        AND "companyId" = $2
      ORDER BY "createdAt"
      LIMIT 1
    `,
    [args.sourceId, args.companyId],
    "Failed to get job make method"
  );

  await copyJobMakeMethodTreeToMakeMethod(client, {
    sourceJobMakeMethodId: rootJobMakeMethod.id,
    targetMakeMethodId: args.targetId,
    companyId: args.companyId,
    userId: args.userId,
    parts: args.parts,
    visitedMakeMethodIds: new Set()
  });
}

async function copyJobMakeMethodToItem(
  client: PoolClient,
  args: GetMethodArgs
) {
  await copyJobMakeMethodTreeToMakeMethod(client, {
    sourceJobMakeMethodId: args.sourceId,
    targetMakeMethodId: args.targetId,
    companyId: args.companyId,
    userId: args.userId,
    parts: args.parts,
    visitedMakeMethodIds: new Set()
  });
}

async function copyQuoteLineToItem(client: PoolClient, args: GetMethodArgs) {
  const [, quoteLineId] = args.sourceId.split(":");
  if (!quoteLineId) throw new Error("Invalid sourceId");

  const rootQuoteMakeMethod = await queryOneRequired<Row>(
    client,
    `
      SELECT *
      FROM "quoteMakeMethod"
      WHERE "quoteLineId" = $1
        AND "parentMaterialId" IS NULL
        AND "companyId" = $2
      ORDER BY "createdAt"
      LIMIT 1
    `,
    [quoteLineId, args.companyId],
    "Failed to get quote make method"
  );

  await copyQuoteMakeMethodTreeToMakeMethod(client, {
    sourceQuoteMakeMethodId: rootQuoteMakeMethod.id,
    targetMakeMethodId: args.targetId,
    companyId: args.companyId,
    userId: args.userId,
    parts: args.parts,
    visitedMakeMethodIds: new Set()
  });
}

async function copyQuoteMakeMethodToItem(
  client: PoolClient,
  args: GetMethodArgs
) {
  await copyQuoteMakeMethodTreeToMakeMethod(client, {
    sourceQuoteMakeMethodId: args.sourceId,
    targetMakeMethodId: args.targetId,
    companyId: args.companyId,
    userId: args.userId,
    parts: args.parts,
    visitedMakeMethodIds: new Set()
  });
}

async function copyQuoteToQuote(client: PoolClient, args: GetMethodArgs) {
  const sourceQuote = await queryOneRequired<Row>(
    client,
    `
      SELECT *
      FROM "quote"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.sourceId, args.companyId],
    "Failed to get source quote"
  );
  const sourcePayment = await queryOne<Row>(
    client,
    `
      SELECT *
      FROM "quotePayment"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.sourceId, args.companyId]
  );
  const sourceShipment = await queryOne<Row>(
    client,
    `
      SELECT *
      FROM "quoteShipment"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.sourceId, args.companyId]
  );
  const sourceLines = await queryMany<Row>(
    client,
    `
      SELECT *
      FROM "quoteLine"
      WHERE "quoteId" = $1 AND "companyId" = $2
      ORDER BY "sortOrder", id
    `,
    [args.sourceId, args.companyId]
  );
  const sourceLineIds = sourceLines.map((line) => line.id);
  const sourcePrices =
    sourceLineIds.length > 0
      ? await queryMany<Row>(
          client,
          `
            SELECT *
            FROM "quoteLinePrice"
            WHERE "quoteLineId" = ANY($1::text[])
            ORDER BY "quoteLineId", quantity
          `,
          [sourceLineIds]
        )
      : [];

  const asRevision = !!args.targetId;
  const newQuoteId = nanoid();
  const quoteReadableId = asRevision
    ? sourceQuote.quoteId
    : await getNextSequence(client, "quote", args.companyId);
  const revisionId = asRevision
    ? await getNextRevisionId(client, sourceQuote.quoteId, args.companyId)
    : 0;
  const externalLinkId = nanoid();
  const opportunityId = asRevision
    ? sourceQuote.opportunityId
    : await createQuoteOpportunity(client, {
        customerId: sourceQuote.customerId,
        companyId: args.companyId
      });

  await insertRow(client, "externalLink", {
    id: externalLinkId,
    documentId: newQuoteId,
    documentType: "Quote",
    customerId: sourceQuote.customerId,
    companyId: args.companyId,
    createdAt: new Date(),
    expiresAt: addDaysAsDateString(30)
  });

  await insertRow(client, "quote", {
    id: newQuoteId,
    quoteId: quoteReadableId,
    revisionId,
    customerId: sourceQuote.customerId,
    customerContactId: sourceQuote.customerContactId,
    customerEngineeringContactId: sourceQuote.customerEngineeringContactId,
    customerLocationId: sourceQuote.customerLocationId,
    customerReference: sourceQuote.customerReference,
    locationId: sourceQuote.locationId,
    expirationDate: addDaysAsDateString(30),
    dueDate: sourceQuote.dueDate,
    estimatorId: sourceQuote.estimatorId,
    salesPersonId: sourceQuote.salesPersonId ?? args.userId,
    status: "Draft",
    externalNotes: sourceQuote.externalNotes,
    internalNotes: sourceQuote.internalNotes,
    currencyCode: sourceQuote.currencyCode,
    exchangeRate: sourceQuote.exchangeRate ?? 1,
    exchangeRateUpdatedAt: new Date(),
    externalLinkId,
    opportunityId,
    tags: sourceQuote.tags ?? [],
    customFields: sourceQuote.customFields ?? {},
    companyId: args.companyId,
    createdAt: new Date(),
    createdBy: args.userId
  });

  await insertRow(client, "quotePayment", {
    id: newQuoteId,
    invoiceCustomerId: sourcePayment?.invoiceCustomerId ?? sourceQuote.customerId,
    invoiceCustomerContactId: sourcePayment?.invoiceCustomerContactId ?? null,
    invoiceCustomerLocationId: sourcePayment?.invoiceCustomerLocationId ?? null,
    paymentTermId: sourcePayment?.paymentTermId ?? null,
    customFields: sourcePayment?.customFields ?? {},
    companyId: args.companyId,
    updatedAt: new Date(),
    updatedBy: args.userId
  });

  await insertRow(client, "quoteShipment", {
    id: newQuoteId,
    locationId: sourceShipment?.locationId ?? sourceQuote.locationId,
    shippingMethodId: sourceShipment?.shippingMethodId ?? null,
    shippingTermId: sourceShipment?.shippingTermId ?? null,
    shippingCost: sourceShipment?.shippingCost ?? null,
    receiptRequestedDate: sourceShipment?.receiptRequestedDate ?? null,
    incoterm: sourceShipment?.incoterm ?? null,
    incotermLocation: sourceShipment?.incotermLocation ?? null,
    companyId: args.companyId,
    updatedAt: new Date(),
    updatedBy: args.userId
  });

  const newLineIdBySourceId = new Map<string, string>();
  const newRootMethodIdBySourceLineId = new Map<string, string>();

  for (const line of sourceLines) {
    const newLineId = nanoid();
    newLineIdBySourceId.set(line.id, newLineId);

    await insertRow(client, "quoteLine", {
      ...line,
      id: newLineId,
      quoteId: newQuoteId,
      quoteRevisionId: revisionId,
      createdBy: args.userId,
      updatedAt: null,
      updatedBy: null
    });

    if (line.methodType !== "Make to Order") continue;

    const sourceRootMethod = await queryOne<Row>(
      client,
      `
        SELECT *
        FROM "quoteMakeMethod"
        WHERE "quoteLineId" = $1
          AND "parentMaterialId" IS NULL
          AND "companyId" = $2
        ORDER BY "createdAt"
        LIMIT 1
      `,
      [line.id, args.companyId]
    );
    if (!sourceRootMethod) continue;

    const targetRootMethodId = nanoid();
    await insertRow(client, "quoteMakeMethod", {
      ...sourceRootMethod,
      id: targetRootMethodId,
      quoteId: newQuoteId,
      quoteLineId: newLineId,
      parentMaterialId: null,
      createdAt: new Date(),
      createdBy: args.userId,
      updatedAt: null,
      updatedBy: null
    });
    newRootMethodIdBySourceLineId.set(line.id, targetRootMethodId);
  }

  for (const price of sourcePrices) {
    const newLineId = newLineIdBySourceId.get(price.quoteLineId);
    if (!newLineId) continue;

    await insertRow(client, "quoteLinePrice", {
      ...price,
      quoteId: newQuoteId,
      quoteLineId: newLineId,
      createdAt: new Date(),
      createdBy: args.userId,
      updatedAt: null,
      updatedBy: null
    });
  }

  for (const line of sourceLines) {
    const targetRootMethodId = newRootMethodIdBySourceLineId.get(line.id);
    const newLineId = newLineIdBySourceId.get(line.id);
    if (!targetRootMethodId || !newLineId) continue;

    const sourceRootMethod = await queryOneRequired<Row>(
      client,
      `
        SELECT *
        FROM "quoteMakeMethod"
        WHERE "quoteLineId" = $1
          AND "parentMaterialId" IS NULL
          AND "companyId" = $2
        ORDER BY "createdAt"
        LIMIT 1
      `,
      [line.id, args.companyId],
      "Failed to get source quote make method"
    );

    await copyQuoteMakeMethodToQuote(client, {
      sourceQuoteMakeMethodId: sourceRootMethod.id,
      targetQuoteId: newQuoteId,
      targetQuoteLineId: newLineId,
      targetQuoteMakeMethodId: targetRootMethodId,
      companyId: args.companyId,
      userId: args.userId,
      parts: args.parts
    });
  }

  return newQuoteId;
}

async function copyJobMakeMethodTreeToMakeMethod(
  client: PoolClient,
  args: {
    sourceJobMakeMethodId: string;
    targetMakeMethodId: string;
    companyId: string;
    userId: string;
    parts: MethodParts;
    visitedMakeMethodIds: Set<string>;
  }
) {
  const [targetMakeMethod, sourceJobMakeMethod] = await Promise.all([
    getMakeMethod(client, args.targetMakeMethodId, args.companyId),
    queryOneRequired<Row>(
      client,
      `
        SELECT *
        FROM "jobMakeMethod"
        WHERE id = $1 AND "companyId" = $2
      `,
      [args.sourceJobMakeMethodId, args.companyId],
      "Failed to get job make method"
    )
  ]);

  await assertMakeMethodCanBeOverwritten(client, {
    makeMethod: targetMakeMethod,
    companyId: args.companyId
  });

  if (args.visitedMakeMethodIds.has(args.targetMakeMethodId)) return;
  args.visitedMakeMethodIds.add(args.targetMakeMethodId);

  const job = await queryOneRequired<Row>(
    client,
    `
      SELECT id, "locationId"
      FROM "job"
      WHERE id = $1 AND "companyId" = $2
    `,
    [sourceJobMakeMethod.jobId, args.companyId],
    "Failed to get job"
  );

  await clearMakeMethodContents(client, {
    makeMethodId: args.targetMakeMethodId,
    companyId: args.companyId,
    userId: args.userId,
    parts: args.parts
  });

  const operationIdBySourceId = new Map<string, string>();

  if (args.parts.billOfProcess) {
    const operations = await queryMany<Row>(
      client,
      `
        SELECT *
        FROM "jobOperation"
        WHERE "jobMakeMethodId" = $1 AND "companyId" = $2
        ORDER BY "order", id
      `,
      [args.sourceJobMakeMethodId, args.companyId]
    );

    for (const operation of operations) {
      const methodOperationId = await cloneJobOperationToMethod(
        client,
        operation,
        {
          targetMakeMethodId: args.targetMakeMethodId,
          companyId: args.companyId,
          userId: args.userId,
          parts: args.parts
        }
      );
      operationIdBySourceId.set(operation.id, methodOperationId);
    }
  }

  if (!args.parts.billOfMaterial) return;

  const materials = await queryMany<Row>(
    client,
    `
      SELECT *
      FROM "jobMaterial"
      WHERE "jobMakeMethodId" = $1 AND "companyId" = $2
      ORDER BY "order", id
    `,
    [args.sourceJobMakeMethodId, args.companyId]
  );

  for (const material of materials) {
    const childSourceMakeMethod = await queryOne<Row>(
      client,
      `
        SELECT *
        FROM "jobMakeMethod"
        WHERE "parentMaterialId" = $1 AND "companyId" = $2
        LIMIT 1
      `,
      [material.id, args.companyId]
    );
    const childTargetMakeMethod =
      material.methodType === "Make to Order" && childSourceMakeMethod
        ? await getActiveMakeMethod(client, material.itemId, args.companyId).catch(
            () => null
          )
        : null;

    if (
      childSourceMakeMethod &&
      childTargetMakeMethod &&
      childTargetMakeMethod.id !== args.targetMakeMethodId
    ) {
      await copyJobMakeMethodTreeToMakeMethod(client, {
        ...args,
        sourceJobMakeMethodId: childSourceMakeMethod.id,
        targetMakeMethodId: childTargetMakeMethod.id
      });
    }

    const sourceOperationId = material.jobOperationId;
    const methodOperationId =
      typeof sourceOperationId === "string"
        ? operationIdBySourceId.get(sourceOperationId)
        : null;
    const unitOfMeasureCode = await getMaterialUnitOfMeasureCode(client, {
      material,
      companyId: args.companyId
    });

    await insertRow(client, "methodMaterial", {
      id: nanoid(),
      makeMethodId: args.targetMakeMethodId,
      materialMakeMethodId: childTargetMakeMethod?.id ?? null,
      methodOperationId: methodOperationId ?? null,
      itemId: material.itemId,
      itemType: material.itemType,
      kit: material.kit ?? false,
      methodType: material.methodType,
      order: material.order,
      productionQuantity: undefined,
      quantity: toNumber(material.quantity, 0),
      scrapQuantity: toNumber(material.scrapQuantity, 0),
      sourcingType: "Specified",
      storageUnitIds: buildStorageUnitIds(job.locationId, material.storageUnitId),
      unitOfMeasureCode,
      companyId: args.companyId,
      createdAt: new Date(),
      createdBy: args.userId,
      customFields: material.customFields ?? {}
    });
  }
}

async function copyQuoteMakeMethodTreeToMakeMethod(
  client: PoolClient,
  args: {
    sourceQuoteMakeMethodId: string;
    targetMakeMethodId: string;
    companyId: string;
    userId: string;
    parts: MethodParts;
    visitedMakeMethodIds: Set<string>;
  }
) {
  const [targetMakeMethod, sourceQuoteMakeMethod] = await Promise.all([
    getMakeMethod(client, args.targetMakeMethodId, args.companyId),
    getQuoteMakeMethod(client, args.sourceQuoteMakeMethodId, args.companyId)
  ]);

  await assertMakeMethodCanBeOverwritten(client, {
    makeMethod: targetMakeMethod,
    companyId: args.companyId
  });

  if (args.visitedMakeMethodIds.has(args.targetMakeMethodId)) return;
  args.visitedMakeMethodIds.add(args.targetMakeMethodId);

  const quote = await queryOneRequired<Row>(
    client,
    `
      SELECT id, "locationId"
      FROM "quote"
      WHERE id = $1 AND "companyId" = $2
    `,
    [sourceQuoteMakeMethod.quoteId, args.companyId],
    "Failed to get quote"
  );

  await clearMakeMethodContents(client, {
    makeMethodId: args.targetMakeMethodId,
    companyId: args.companyId,
    userId: args.userId,
    parts: args.parts
  });

  const operationIdBySourceId = new Map<string, string>();

  if (args.parts.billOfProcess) {
    const operations = await queryMany<Row>(
      client,
      `
        SELECT *
        FROM "quoteOperation"
        WHERE "quoteMakeMethodId" = $1 AND "companyId" = $2
        ORDER BY "order", id
      `,
      [args.sourceQuoteMakeMethodId, args.companyId]
    );

    for (const operation of operations) {
      const methodOperationId = await cloneQuoteOperationToMethod(
        client,
        operation,
        {
          targetMakeMethodId: args.targetMakeMethodId,
          companyId: args.companyId,
          userId: args.userId,
          parts: args.parts
        }
      );
      operationIdBySourceId.set(operation.id, methodOperationId);
    }
  }

  if (!args.parts.billOfMaterial) return;

  const materials = await queryMany<Row>(
    client,
    `
      SELECT *
      FROM "quoteMaterial"
      WHERE "quoteMakeMethodId" = $1 AND "companyId" = $2
      ORDER BY "order", id
    `,
    [args.sourceQuoteMakeMethodId, args.companyId]
  );

  for (const material of materials) {
    const childSourceMakeMethod = await queryOne<Row>(
      client,
      `
        SELECT *
        FROM "quoteMakeMethod"
        WHERE "parentMaterialId" = $1 AND "companyId" = $2
        LIMIT 1
      `,
      [material.id, args.companyId]
    );
    const childTargetMakeMethod =
      material.methodType === "Make to Order" && childSourceMakeMethod
        ? await getActiveMakeMethod(client, material.itemId, args.companyId).catch(
            () => null
          )
        : null;

    if (
      childSourceMakeMethod &&
      childTargetMakeMethod &&
      childTargetMakeMethod.id !== args.targetMakeMethodId
    ) {
      await copyQuoteMakeMethodTreeToMakeMethod(client, {
        ...args,
        sourceQuoteMakeMethodId: childSourceMakeMethod.id,
        targetMakeMethodId: childTargetMakeMethod.id
      });
    }

    const sourceOperationId = material.quoteOperationId;
    const methodOperationId =
      typeof sourceOperationId === "string"
        ? operationIdBySourceId.get(sourceOperationId)
        : null;
    const unitOfMeasureCode = await getMaterialUnitOfMeasureCode(client, {
      material,
      companyId: args.companyId
    });

    await insertRow(client, "methodMaterial", {
      id: nanoid(),
      makeMethodId: args.targetMakeMethodId,
      materialMakeMethodId: childTargetMakeMethod?.id ?? null,
      methodOperationId: methodOperationId ?? null,
      itemId: material.itemId,
      itemType: material.itemType,
      kit: material.kit ?? false,
      methodType: material.methodType,
      order: material.order,
      productionQuantity: undefined,
      quantity: toNumber(material.quantity, 0),
      scrapQuantity: toNumber(material.scrapQuantity, 0),
      sourcingType: "Specified",
      storageUnitIds: buildStorageUnitIds(quote.locationId, material.storageUnitId),
      unitOfMeasureCode,
      companyId: args.companyId,
      createdAt: new Date(),
      createdBy: args.userId,
      customFields: material.customFields ?? {}
    });
  }
}

async function copyMethodContents(
  client: PoolClient,
  args: {
    sourceMakeMethodId: string;
    targetMakeMethodId: string;
    companyId: string;
    userId: string;
    parts: MethodParts;
  }
) {
  const targetOperationIds = await queryMany<{ id: string }>(
    client,
    `
      SELECT id
      FROM "methodOperation"
      WHERE "makeMethodId" = $1 AND "companyId" = $2
    `,
    [args.targetMakeMethodId, args.companyId]
  );
  const targetOperationIdList = targetOperationIds.map((row) => row.id);

  if (args.parts.billOfMaterial) {
    await client.query(
      `
        DELETE FROM "methodMaterial"
        WHERE "makeMethodId" = $1 AND "companyId" = $2
      `,
      [args.targetMakeMethodId, args.companyId]
    );
  }

  if (args.parts.billOfProcess) {
    if (!args.parts.billOfMaterial && targetOperationIdList.length > 0) {
      await client.query(
        `
          UPDATE "methodMaterial"
          SET "methodOperationId" = NULL,
              "updatedAt" = NOW(),
              "updatedBy" = $1
          WHERE "methodOperationId" = ANY($2::text[])
            AND "companyId" = $3
        `,
        [args.userId, targetOperationIdList, args.companyId]
      );
    }

    await deleteMethodOperationChildren(
      client,
      targetOperationIdList,
      args.companyId
    );
    await client.query(
      `
        DELETE FROM "methodOperation"
        WHERE "makeMethodId" = $1 AND "companyId" = $2
      `,
      [args.targetMakeMethodId, args.companyId]
    );
  }

  const operationIdBySourceId = new Map<string, string>();

  if (args.parts.billOfProcess) {
    const sourceOperations = await queryMany<Row>(
      client,
      `
        SELECT *
        FROM "methodOperation"
        WHERE "makeMethodId" = $1 AND "companyId" = $2
        ORDER BY "order", id
      `,
      [args.sourceMakeMethodId, args.companyId]
    );

    for (const operation of sourceOperations) {
      const newOperationId = await cloneMethodOperation(client, operation, {
        targetMakeMethodId: args.targetMakeMethodId,
        companyId: args.companyId,
        userId: args.userId,
        parts: args.parts
      });
      operationIdBySourceId.set(operation.id, newOperationId);
    }
  }

  if (args.parts.billOfMaterial) {
    const sourceMaterials = await queryMany<Row>(
      client,
      `
        SELECT *
        FROM "methodMaterial"
        WHERE "makeMethodId" = $1 AND "companyId" = $2
        ORDER BY "order", id
      `,
      [args.sourceMakeMethodId, args.companyId]
    );

    for (const material of sourceMaterials) {
      const sourceOperationId = material.methodOperationId;
      const targetOperationId =
        typeof sourceOperationId === "string"
          ? operationIdBySourceId.get(sourceOperationId)
          : null;
      await insertRow(client, "methodMaterial", {
        ...material,
        id: nanoid(),
        makeMethodId: args.targetMakeMethodId,
        methodOperationId: targetOperationId ?? null,
        productionQuantity: undefined,
        createdBy: args.userId,
        updatedBy: material.updatedBy ?? null
      });
    }
  }
}

async function clearJobMethodScope(
  client: PoolClient,
  args: {
    jobId: string;
    rootJobMakeMethodId: string;
    companyId: string;
    userId: string;
    parts: MethodParts;
    fullJob: boolean;
  }
) {
  const operationIds = args.fullJob
    ? await queryMany<{ id: string }>(
        client,
        `
          SELECT id
          FROM "jobOperation"
          WHERE "jobId" = $1 AND "companyId" = $2
        `,
        [args.jobId, args.companyId]
      )
    : await queryMany<{ id: string }>(
        client,
        `
          SELECT id
          FROM "jobOperation"
          WHERE "jobMakeMethodId" = $1 AND "companyId" = $2
        `,
        [args.rootJobMakeMethodId, args.companyId]
      );
  const operationIdList = operationIds.map((row) => row.id);

  if (args.parts.billOfMaterial) {
    if (args.fullJob) {
      await client.query(
        `
          DELETE FROM "jobMaterial"
          WHERE "jobId" = $1 AND "companyId" = $2
        `,
        [args.jobId, args.companyId]
      );
      await client.query(
        `
          DELETE FROM "jobMakeMethod"
          WHERE "jobId" = $1
            AND "parentMaterialId" IS NOT NULL
            AND "companyId" = $2
        `,
        [args.jobId, args.companyId]
      );
    } else {
      await client.query(
        `
          DELETE FROM "jobMaterial"
          WHERE "jobMakeMethodId" = $1 AND "companyId" = $2
        `,
        [args.rootJobMakeMethodId, args.companyId]
      );
    }
  }

  if (args.parts.billOfProcess) {
    if (!args.parts.billOfMaterial && operationIdList.length > 0) {
      await client.query(
        `
          UPDATE "jobMaterial"
          SET "jobOperationId" = NULL,
              "updatedAt" = NOW(),
              "updatedBy" = $1
          WHERE "jobOperationId" = ANY($2::text[])
            AND "companyId" = $3
        `,
        [args.userId, operationIdList, args.companyId]
      );
    }

    await deleteJobOperationChildren(client, operationIdList, args.companyId);
    if (args.fullJob) {
      await client.query(
        `
          DELETE FROM "jobOperation"
          WHERE "jobId" = $1 AND "companyId" = $2
        `,
        [args.jobId, args.companyId]
      );
    } else {
      await client.query(
        `
          DELETE FROM "jobOperation"
          WHERE "jobMakeMethodId" = $1 AND "companyId" = $2
        `,
        [args.rootJobMakeMethodId, args.companyId]
      );
    }
  }
}

async function updateJobMakeMethodVersion(
  client: PoolClient,
  args: {
    jobMakeMethodId: string;
    version: unknown;
    companyId: string;
    userId: string;
  }
) {
  await client.query(
    `
      UPDATE "jobMakeMethod"
      SET version = $1,
          "updatedAt" = NOW(),
          "updatedBy" = $2
      WHERE id = $3 AND "companyId" = $4
    `,
    [
      toNumber(args.version, 1),
      args.userId,
      args.jobMakeMethodId,
      args.companyId
    ]
  );
}

async function copyMethodTreeToJob(
  client: PoolClient,
  args: {
    sourceMakeMethodId: string;
    jobId: string;
    jobMakeMethodId: string;
    parentQuantity: number;
    locationId: string | null;
    companyId: string;
    userId: string;
    parts: MethodParts;
  }
) {
  const operationIdBySourceId = new Map<string, string>();

  if (args.parts.billOfProcess) {
    const sourceOperations = await queryMany<Row>(
      client,
      `
        SELECT *
        FROM "methodOperation"
        WHERE "makeMethodId" = $1 AND "companyId" = $2
        ORDER BY "order", id
      `,
      [args.sourceMakeMethodId, args.companyId]
    );

    for (const operation of sourceOperations) {
      const jobOperationId = await cloneMethodOperationToJob(client, operation, {
        jobId: args.jobId,
        jobMakeMethodId: args.jobMakeMethodId,
        parentQuantity: args.parentQuantity,
        companyId: args.companyId,
        userId: args.userId,
        parts: args.parts
      });
      operationIdBySourceId.set(operation.id, jobOperationId);
    }
  }

  if (!args.parts.billOfMaterial) return;

  const sourceMaterials = await queryMany<Row>(
    client,
    `
      SELECT *
      FROM "methodMaterial"
      WHERE "makeMethodId" = $1 AND "companyId" = $2
      ORDER BY "order", id
    `,
    [args.sourceMakeMethodId, args.companyId]
  );

  for (const material of sourceMaterials) {
    const item = await getItemForJobMaterial(
      client,
      material.itemId,
      args.companyId
    );
    const childMakeMethodId =
      material.materialMakeMethodId ??
      (material.methodType === "Make to Order"
        ? await getActiveMakeMethod(client, material.itemId, args.companyId).then(
            (method) => method.id
          )
        : null);
    const quantity = toNumber(material.quantity, 0);
    const targetQuantity = args.parentQuantity * quantity;
    const itemScrapPercentage = toNumber(item.scrapPercentage, 0);
    const scrapQuantity = targetQuantity * itemScrapPercentage;
    const totalWithScrap = Math.ceil(targetQuantity + scrapQuantity);
    const estimatedQuantity =
      material.methodType === "Make to Order" ? targetQuantity : totalWithScrap;
    const jobMaterialId = nanoid();
    const sourceOperationId = material.methodOperationId;
    const jobOperationId =
      typeof sourceOperationId === "string"
        ? operationIdBySourceId.get(sourceOperationId)
        : null;

    await insertRow(client, "jobMaterial", {
      id: jobMaterialId,
      jobId: args.jobId,
      jobMakeMethodId: args.jobMakeMethodId,
      jobOperationId: jobOperationId ?? null,
      itemId: material.itemId,
      itemType: material.itemType,
      description: item.name ?? material.itemId,
      methodType: material.methodType,
      order: material.order,
      quantity,
      quantityIssued: 0,
      estimatedQuantity,
      itemScrapPercentage,
      scrapQuantity,
      kit: material.kit ?? false,
      requiresBatchTracking: item.itemTrackingType === "Batch",
      requiresSerialTracking: item.itemTrackingType === "Serial",
      unitCost: toNumber(item.unitCost, 0),
      unitOfMeasureCode: item.unitOfMeasureCode,
      companyId: args.companyId,
      createdAt: new Date(),
      createdBy: args.userId,
      customFields: {}
    });

    if (material.methodType === "Make to Order" && childMakeMethodId) {
      const childJobMakeMethodId = nanoid();
      await insertRow(client, "jobMakeMethod", {
        id: childJobMakeMethodId,
        jobId: args.jobId,
        parentMaterialId: jobMaterialId,
        itemId: material.itemId,
        itemScrapPercentage,
        quantityPerParent: quantity,
        requiresBatchTracking: item.itemTrackingType === "Batch",
        requiresSerialTracking: item.itemTrackingType === "Serial",
        trackedEntityId: null,
        version: toNumber(item.makeMethodVersion, 1),
        companyId: args.companyId,
        createdAt: new Date(),
        createdBy: args.userId
      });

      if (childMakeMethodId !== args.sourceMakeMethodId) {
        await copyMethodTreeToJob(client, {
          ...args,
          sourceMakeMethodId: childMakeMethodId,
          jobMakeMethodId: childJobMakeMethodId,
          parentQuantity: estimatedQuantity + scrapQuantity
        });
      }
    }
  }
}

async function cloneMethodOperationToJob(
  client: PoolClient,
  operation: Row,
  args: {
    jobId: string;
    jobMakeMethodId: string;
    parentQuantity: number;
    companyId: string;
    userId: string;
    parts: MethodParts;
  }
) {
  const jobOperationId = nanoid();
  await insertRow(client, "jobOperation", {
    id: jobOperationId,
    jobId: args.jobId,
    jobMakeMethodId: args.jobMakeMethodId,
    processId: operation.processId,
    procedureId: operation.procedureId,
    workCenterId: operation.workCenterId,
    description: operation.description,
    setupTime: operation.setupTime,
    setupUnit: operation.setupUnit,
    laborTime: operation.laborTime,
    laborUnit: operation.laborUnit,
    laborRate: 0,
    machineTime: operation.machineTime,
    machineUnit: operation.machineUnit,
    machineRate: operation.machineRate ?? 0,
    operationLeadTime: operation.operationLeadTime ?? 0,
    operationMinimumCost: operation.operationMinimumCost ?? 0,
    operationOrder: operation.operationOrder,
    operationType: operation.operationType,
    operationUnitCost: operation.operationUnitCost ?? 0,
    operationSupplierProcessId: operation.operationSupplierProcessId,
    order: operation.order,
    overheadRate: 0,
    priority: 1,
    status: "Ready",
    targetQuantity: args.parentQuantity,
    operationQuantity: args.parentQuantity,
    workInstruction: args.parts.workInstructions ? operation.workInstruction : {},
    companyId: args.companyId,
    createdAt: new Date(),
    createdBy: args.userId,
    customFields: {}
  });

  if (args.parts.tools) {
    await cloneMethodOperationChildrenToJob(client, {
      sourceTable: "methodOperationTool",
      targetTable: "jobOperationTool",
      sourceOperationId: operation.id,
      targetOperationId: jobOperationId,
      companyId: args.companyId,
      userId: args.userId
    });
  }

  if (operation.procedureId) {
    await syncProcedureToOperation(client, {
      type: "procedureToOperation",
      sourceId: operation.procedureId,
      targetId: jobOperationId,
      companyId: args.companyId,
      userId: args.userId,
      parts: args.parts
    });
  } else {
    if (args.parts.parameters) {
      await cloneMethodOperationChildrenToJob(client, {
        sourceTable: "methodOperationParameter",
        targetTable: "jobOperationParameter",
        sourceOperationId: operation.id,
        targetOperationId: jobOperationId,
        companyId: args.companyId,
        userId: args.userId
      });
    }

    if (args.parts.steps) {
      await cloneMethodOperationChildrenToJob(client, {
        sourceTable: "methodOperationStep",
        targetTable: "jobOperationStep",
        sourceOperationId: operation.id,
        targetOperationId: jobOperationId,
        companyId: args.companyId,
        userId: args.userId
      });
    }
  }

  return jobOperationId;
}

async function copyQuoteMakeMethodToJob(
  client: PoolClient,
  args: {
    quoteMakeMethodId: string;
    jobId: string;
    jobMakeMethodId: string;
    parentQuantity: number;
    locationId: string | null;
    companyId: string;
    userId: string;
    parts: MethodParts;
  }
) {
  const operationIdByQuoteOperationId = new Map<string, string>();

  if (args.parts.billOfProcess) {
    const quoteOperations = await queryMany<Row>(
      client,
      `
        SELECT *
        FROM "quoteOperation"
        WHERE "quoteMakeMethodId" = $1 AND "companyId" = $2
        ORDER BY "order", id
      `,
      [args.quoteMakeMethodId, args.companyId]
    );

    for (const operation of quoteOperations) {
      const jobOperationId = await cloneQuoteOperationToJob(client, operation, {
        jobId: args.jobId,
        jobMakeMethodId: args.jobMakeMethodId,
        parentQuantity: args.parentQuantity,
        companyId: args.companyId,
        userId: args.userId,
        parts: args.parts
      });
      operationIdByQuoteOperationId.set(operation.id, jobOperationId);
    }
  }

  if (!args.parts.billOfMaterial) return;

  const quoteMaterials = await queryMany<Row>(
    client,
    `
      SELECT *
      FROM "quoteMaterial"
      WHERE "quoteMakeMethodId" = $1 AND "companyId" = $2
      ORDER BY "order", id
    `,
    [args.quoteMakeMethodId, args.companyId]
  );

  for (const material of quoteMaterials) {
    const item = await getItemForJobMaterial(
      client,
      material.itemId,
      args.companyId
    );
    const quantity = toNumber(material.quantity, 0);
    const targetQuantity = args.parentQuantity * quantity;
    const itemScrapPercentage = toNumber(item.scrapPercentage, 0);
    const scrapQuantity =
      material.methodType === "Make to Order"
        ? targetQuantity * itemScrapPercentage
        : 0;
    const totalWithScrap = Math.ceil(targetQuantity + scrapQuantity);
    const estimatedQuantity =
      material.methodType === "Make to Order" ? targetQuantity : totalWithScrap;
    const jobMaterialId = nanoid();
    const jobOperationId =
      typeof material.quoteOperationId === "string"
        ? operationIdByQuoteOperationId.get(material.quoteOperationId)
        : null;

    await insertRow(client, "jobMaterial", {
      id: jobMaterialId,
      jobId: args.jobId,
      jobMakeMethodId: args.jobMakeMethodId,
      jobOperationId: jobOperationId ?? null,
      itemId: material.itemId,
      itemType: material.itemType,
      description: material.description ?? item.name ?? material.itemId,
      methodType: material.methodType,
      order: material.order,
      quantity,
      quantityIssued: 0,
      estimatedQuantity,
      itemScrapPercentage,
      scrapQuantity,
      kit: material.kit ?? false,
      requiresBatchTracking: item.itemTrackingType === "Batch",
      requiresSerialTracking: item.itemTrackingType === "Serial",
      unitCost: toNumber(material.unitCost, toNumber(item.unitCost, 0)),
      unitOfMeasureCode: material.unitOfMeasureCode ?? item.unitOfMeasureCode,
      companyId: args.companyId,
      createdAt: new Date(),
      createdBy: args.userId,
      customFields: {}
    });

    if (material.methodType === "Make to Order") {
      const childQuoteMakeMethod = await queryOne<Row>(
        client,
        `
          SELECT *
          FROM "quoteMakeMethod"
          WHERE "parentMaterialId" = $1 AND "companyId" = $2
          LIMIT 1
        `,
        [material.id, args.companyId]
      );
      if (!childQuoteMakeMethod) continue;

      const childJobMakeMethodId = nanoid();
      await insertRow(client, "jobMakeMethod", {
        id: childJobMakeMethodId,
        jobId: args.jobId,
        parentMaterialId: jobMaterialId,
        itemId: material.itemId,
        itemScrapPercentage,
        quantityPerParent: quantity,
        requiresBatchTracking: item.itemTrackingType === "Batch",
        requiresSerialTracking: item.itemTrackingType === "Serial",
        trackedEntityId: null,
        version: toNumber(childQuoteMakeMethod.version, 1),
        companyId: args.companyId,
        createdAt: new Date(),
        createdBy: args.userId
      });

      await copyQuoteMakeMethodToJob(client, {
        ...args,
        quoteMakeMethodId: childQuoteMakeMethod.id,
        jobMakeMethodId: childJobMakeMethodId,
        parentQuantity: estimatedQuantity + scrapQuantity
      });
    }
  }
}

async function copyQuoteMakeMethodToQuote(
  client: PoolClient,
  args: {
    sourceQuoteMakeMethodId: string;
    targetQuoteId: string;
    targetQuoteLineId: string;
    targetQuoteMakeMethodId: string;
    companyId: string;
    userId: string;
    parts: MethodParts;
  }
) {
  const operationIdBySourceId = new Map<string, string>();

  if (args.parts.billOfProcess) {
    const operations = await queryMany<Row>(
      client,
      `
        SELECT *
        FROM "quoteOperation"
        WHERE "quoteMakeMethodId" = $1 AND "companyId" = $2
        ORDER BY "order", id
      `,
      [args.sourceQuoteMakeMethodId, args.companyId]
    );

    for (const operation of operations) {
      const targetOperationId = await cloneQuoteOperationToQuote(
        client,
        operation,
        {
          targetQuoteId: args.targetQuoteId,
          targetQuoteLineId: args.targetQuoteLineId,
          targetQuoteMakeMethodId: args.targetQuoteMakeMethodId,
          companyId: args.companyId,
          userId: args.userId,
          parts: args.parts
        }
      );
      operationIdBySourceId.set(operation.id, targetOperationId);
    }
  }

  if (!args.parts.billOfMaterial) return;

  const materials = await queryMany<Row>(
    client,
    `
      SELECT *
      FROM "quoteMaterial"
      WHERE "quoteMakeMethodId" = $1 AND "companyId" = $2
      ORDER BY "order", id
    `,
    [args.sourceQuoteMakeMethodId, args.companyId]
  );

  for (const material of materials) {
    const targetMaterialId = nanoid();
    const targetOperationId =
      typeof material.quoteOperationId === "string"
        ? operationIdBySourceId.get(material.quoteOperationId)
        : null;

    await insertRow(client, "quoteMaterial", {
      ...material,
      id: targetMaterialId,
      quoteId: args.targetQuoteId,
      quoteLineId: args.targetQuoteLineId,
      quoteMakeMethodId: args.targetQuoteMakeMethodId,
      quoteOperationId: targetOperationId ?? null,
      productionQuantity: undefined,
      createdAt: new Date(),
      createdBy: args.userId,
      updatedAt: null,
      updatedBy: null
    });

    if (material.methodType === "Make to Order") {
      const childSourceMakeMethod = await queryOne<Row>(
        client,
        `
          SELECT *
          FROM "quoteMakeMethod"
          WHERE "parentMaterialId" = $1 AND "companyId" = $2
          LIMIT 1
        `,
        [material.id, args.companyId]
      );
      if (!childSourceMakeMethod) continue;

      const childTargetMakeMethodId = nanoid();
      await insertRow(client, "quoteMakeMethod", {
        ...childSourceMakeMethod,
        id: childTargetMakeMethodId,
        quoteId: args.targetQuoteId,
        quoteLineId: args.targetQuoteLineId,
        parentMaterialId: targetMaterialId,
        createdAt: new Date(),
        createdBy: args.userId,
        updatedAt: null,
        updatedBy: null
      });

      await copyQuoteMakeMethodToQuote(client, {
        ...args,
        sourceQuoteMakeMethodId: childSourceMakeMethod.id,
        targetQuoteMakeMethodId: childTargetMakeMethodId
      });
    }
  }
}

async function cloneQuoteOperationToQuote(
  client: PoolClient,
  operation: Row,
  args: {
    targetQuoteId: string;
    targetQuoteLineId: string;
    targetQuoteMakeMethodId: string;
    companyId: string;
    userId: string;
    parts: MethodParts;
  }
) {
  const quoteOperationId = nanoid();
  await insertRow(client, "quoteOperation", {
    ...operation,
    id: quoteOperationId,
    quoteId: args.targetQuoteId,
    quoteLineId: args.targetQuoteLineId,
    quoteMakeMethodId: args.targetQuoteMakeMethodId,
    workInstruction: args.parts.workInstructions ? operation.workInstruction : {},
    createdAt: new Date(),
    createdBy: args.userId,
    updatedAt: null,
    updatedBy: null
  });

  if (args.parts.tools) {
    await cloneMethodOperationChildrenToTarget(client, {
      sourceTable: "quoteOperationTool",
      targetTable: "quoteOperationTool",
      sourceOperationId: operation.id,
      targetOperationId: quoteOperationId,
      companyId: args.companyId,
      userId: args.userId
    });
  }

  if (!operation.procedureId) {
    if (args.parts.parameters) {
      await cloneMethodOperationChildrenToTarget(client, {
        sourceTable: "quoteOperationParameter",
        targetTable: "quoteOperationParameter",
        sourceOperationId: operation.id,
        targetOperationId: quoteOperationId,
        companyId: args.companyId,
        userId: args.userId
      });
    }

    if (args.parts.steps) {
      await cloneMethodOperationChildrenToTarget(client, {
        sourceTable: "quoteOperationStep",
        targetTable: "quoteOperationStep",
        sourceOperationId: operation.id,
        targetOperationId: quoteOperationId,
        companyId: args.companyId,
        userId: args.userId
      });
    }
  }

  return quoteOperationId;
}

async function cloneQuoteOperationToJob(
  client: PoolClient,
  operation: Row,
  args: {
    jobId: string;
    jobMakeMethodId: string;
    parentQuantity: number;
    companyId: string;
    userId: string;
    parts: MethodParts;
  }
) {
  const jobOperationId = nanoid();
  await insertRow(client, "jobOperation", {
    id: jobOperationId,
    jobId: args.jobId,
    jobMakeMethodId: args.jobMakeMethodId,
    processId: operation.processId,
    procedureId: operation.procedureId,
    workCenterId: operation.workCenterId,
    description: operation.description,
    setupTime: operation.setupTime,
    setupUnit: operation.setupUnit,
    laborTime: operation.laborTime,
    laborUnit: operation.laborUnit,
    laborRate: operation.laborRate ?? 0,
    machineTime: operation.machineTime,
    machineUnit: operation.machineUnit,
    machineRate: operation.machineRate ?? 0,
    operationLeadTime: operation.operationLeadTime ?? 0,
    operationMinimumCost: operation.operationMinimumCost ?? 0,
    operationOrder: operation.operationOrder,
    operationType: operation.operationType,
    operationUnitCost: operation.operationUnitCost ?? 0,
    operationSupplierProcessId: operation.operationSupplierProcessId,
    order: operation.order,
    overheadRate: operation.overheadRate ?? 0,
    priority: 1,
    status: "Ready",
    targetQuantity: args.parentQuantity,
    operationQuantity: args.parentQuantity,
    workInstruction: args.parts.workInstructions ? operation.workInstruction : {},
    companyId: args.companyId,
    createdAt: new Date(),
    createdBy: args.userId,
    customFields: {}
  });

  if (args.parts.tools) {
    await cloneMethodOperationChildrenToTarget(client, {
      sourceTable: "quoteOperationTool",
      targetTable: "jobOperationTool",
      sourceOperationId: operation.id,
      targetOperationId: jobOperationId,
      companyId: args.companyId,
      userId: args.userId
    });
  }

  if (operation.procedureId) {
    await syncProcedureToOperation(client, {
      type: "procedureToOperation",
      sourceId: operation.procedureId,
      targetId: jobOperationId,
      companyId: args.companyId,
      userId: args.userId,
      parts: args.parts
    });
  } else {
    if (args.parts.parameters) {
      await cloneMethodOperationChildrenToTarget(client, {
        sourceTable: "quoteOperationParameter",
        targetTable: "jobOperationParameter",
        sourceOperationId: operation.id,
        targetOperationId: jobOperationId,
        companyId: args.companyId,
        userId: args.userId
      });
    }

    if (args.parts.steps) {
      await cloneMethodOperationChildrenToTarget(client, {
        sourceTable: "quoteOperationStep",
        targetTable: "jobOperationStep",
        sourceOperationId: operation.id,
        targetOperationId: jobOperationId,
        companyId: args.companyId,
        userId: args.userId
      });
    }
  }

  return jobOperationId;
}

async function clearQuoteMethodScope(
  client: PoolClient,
  args: {
    quoteId: string;
    quoteLineId: string;
    rootQuoteMakeMethodId: string;
    companyId: string;
    userId: string;
    parts: MethodParts;
    fullLine: boolean;
  }
) {
  const operationIds = args.fullLine
    ? await queryMany<{ id: string }>(
        client,
        `
          SELECT id
          FROM "quoteOperation"
          WHERE "quoteLineId" = $1 AND "companyId" = $2
        `,
        [args.quoteLineId, args.companyId]
      )
    : await queryMany<{ id: string }>(
        client,
        `
          SELECT id
          FROM "quoteOperation"
          WHERE "quoteMakeMethodId" = $1 AND "companyId" = $2
        `,
        [args.rootQuoteMakeMethodId, args.companyId]
      );
  const operationIdList = operationIds.map((row) => row.id);

  if (args.parts.billOfMaterial) {
    if (args.fullLine) {
      await client.query(
        `
          DELETE FROM "quoteMaterial"
          WHERE "quoteLineId" = $1 AND "companyId" = $2
        `,
        [args.quoteLineId, args.companyId]
      );
      await client.query(
        `
          DELETE FROM "quoteMakeMethod"
          WHERE "quoteLineId" = $1
            AND "parentMaterialId" IS NOT NULL
            AND "companyId" = $2
        `,
        [args.quoteLineId, args.companyId]
      );
    } else {
      await client.query(
        `
          DELETE FROM "quoteMaterial"
          WHERE "quoteMakeMethodId" = $1 AND "companyId" = $2
        `,
        [args.rootQuoteMakeMethodId, args.companyId]
      );
    }
  }

  if (args.parts.billOfProcess) {
    if (!args.parts.billOfMaterial && operationIdList.length > 0) {
      await client.query(
        `
          UPDATE "quoteMaterial"
          SET "quoteOperationId" = NULL,
              "updatedAt" = NOW(),
              "updatedBy" = $1
          WHERE "quoteOperationId" = ANY($2::text[])
            AND "companyId" = $3
        `,
        [args.userId, operationIdList, args.companyId]
      );
    }

    await deleteQuoteOperationChildren(client, operationIdList, args.companyId);
    if (args.fullLine) {
      await client.query(
        `
          DELETE FROM "quoteOperation"
          WHERE "quoteLineId" = $1 AND "companyId" = $2
        `,
        [args.quoteLineId, args.companyId]
      );
    } else {
      await client.query(
        `
          DELETE FROM "quoteOperation"
          WHERE "quoteMakeMethodId" = $1 AND "companyId" = $2
        `,
        [args.rootQuoteMakeMethodId, args.companyId]
      );
    }
  }
}

async function updateQuoteMakeMethodVersion(
  client: PoolClient,
  args: {
    quoteMakeMethodId: string;
    version: unknown;
    companyId: string;
    userId: string;
  }
) {
  await client.query(
    `
      UPDATE "quoteMakeMethod"
      SET version = $1,
          "updatedAt" = NOW(),
          "updatedBy" = $2
      WHERE id = $3 AND "companyId" = $4
    `,
    [
      toNumber(args.version, 1),
      args.userId,
      args.quoteMakeMethodId,
      args.companyId
    ]
  );
}

async function copyMethodTreeToQuote(
  client: PoolClient,
  args: {
    sourceMakeMethodId: string;
    quoteId: string;
    quoteLineId: string;
    quoteMakeMethodId: string;
    locationId: string | null;
    companyId: string;
    userId: string;
    parts: MethodParts;
  }
) {
  const operationIdBySourceId = new Map<string, string>();

  if (args.parts.billOfProcess) {
    const sourceOperations = await queryMany<Row>(
      client,
      `
        SELECT *
        FROM "methodOperation"
        WHERE "makeMethodId" = $1 AND "companyId" = $2
        ORDER BY "order", id
      `,
      [args.sourceMakeMethodId, args.companyId]
    );

    for (const operation of sourceOperations) {
      const quoteOperationId = await cloneMethodOperationToQuote(
        client,
        operation,
        {
          quoteId: args.quoteId,
          quoteLineId: args.quoteLineId,
          quoteMakeMethodId: args.quoteMakeMethodId,
          companyId: args.companyId,
          userId: args.userId,
          parts: args.parts
        }
      );
      operationIdBySourceId.set(operation.id, quoteOperationId);
    }
  }

  if (!args.parts.billOfMaterial) return;

  const sourceMaterials = await queryMany<Row>(
    client,
    `
      SELECT *
      FROM "methodMaterial"
      WHERE "makeMethodId" = $1 AND "companyId" = $2
      ORDER BY "order", id
    `,
    [args.sourceMakeMethodId, args.companyId]
  );

  for (const material of sourceMaterials) {
    const item = await getItemForJobMaterial(
      client,
      material.itemId,
      args.companyId
    );
    const childMakeMethodId =
      material.materialMakeMethodId ??
      (material.methodType === "Make to Order"
        ? await getActiveMakeMethod(client, material.itemId, args.companyId).then(
            (method) => method.id
          )
        : null);
    const quoteMaterialId = nanoid();
    const sourceOperationId = material.methodOperationId;
    const quoteOperationId =
      typeof sourceOperationId === "string"
        ? operationIdBySourceId.get(sourceOperationId)
        : null;

    await insertRow(client, "quoteMaterial", {
      id: quoteMaterialId,
      quoteId: args.quoteId,
      quoteLineId: args.quoteLineId,
      quoteMakeMethodId: args.quoteMakeMethodId,
      quoteOperationId: quoteOperationId ?? null,
      itemId: material.itemId,
      itemType: material.itemType,
      kit: material.kit ?? false,
      methodType: material.methodType,
      order: material.order,
      description: item.name ?? material.itemId,
      quantity: toNumber(material.quantity, 0),
      scrapQuantity: toNumber(material.scrapQuantity, 0),
      storageUnitId: null,
      unitCost: toNumber(item.unitCost, 0),
      unitOfMeasureCode: item.unitOfMeasureCode,
      companyId: args.companyId,
      createdAt: new Date(),
      createdBy: args.userId,
      customFields: {}
    });

    if (material.methodType === "Make to Order" && childMakeMethodId) {
      const childQuoteMakeMethodId = nanoid();
      await insertRow(client, "quoteMakeMethod", {
        id: childQuoteMakeMethodId,
        quoteId: args.quoteId,
        quoteLineId: args.quoteLineId,
        parentMaterialId: quoteMaterialId,
        itemId: material.itemId,
        quantityPerParent: toNumber(material.quantity, 0),
        version: toNumber(item.makeMethodVersion, 1),
        companyId: args.companyId,
        createdAt: new Date(),
        createdBy: args.userId,
        customFields: {}
      });

      if (childMakeMethodId !== args.sourceMakeMethodId) {
        await copyMethodTreeToQuote(client, {
          ...args,
          sourceMakeMethodId: childMakeMethodId,
          quoteMakeMethodId: childQuoteMakeMethodId
        });
      }
    }
  }
}

async function cloneMethodOperationToQuote(
  client: PoolClient,
  operation: Row,
  args: {
    quoteId: string;
    quoteLineId: string;
    quoteMakeMethodId: string;
    companyId: string;
    userId: string;
    parts: MethodParts;
  }
) {
  const quoteOperationId = nanoid();
  await insertRow(client, "quoteOperation", {
    id: quoteOperationId,
    quoteId: args.quoteId,
    quoteLineId: args.quoteLineId,
    quoteMakeMethodId: args.quoteMakeMethodId,
    processId: operation.processId,
    procedureId: operation.procedureId,
    workCenterId: operation.workCenterId,
    description: operation.description,
    setupTime: operation.setupTime,
    setupUnit: operation.setupUnit,
    laborTime: operation.laborTime,
    laborUnit: operation.laborUnit,
    laborRate: 0,
    machineTime: operation.machineTime,
    machineUnit: operation.machineUnit,
    machineRate: operation.machineRate ?? 0,
    operationLeadTime: operation.operationLeadTime ?? 0,
    operationMinimumCost: operation.operationMinimumCost ?? 0,
    operationOrder: operation.operationOrder,
    operationType: operation.operationType,
    operationUnitCost: operation.operationUnitCost ?? 0,
    operationSupplierProcessId: operation.operationSupplierProcessId,
    order: operation.order,
    overheadRate: 0,
    workInstruction: args.parts.workInstructions ? operation.workInstruction : {},
    companyId: args.companyId,
    createdAt: new Date(),
    createdBy: args.userId,
    customFields: {}
  });

  if (args.parts.tools) {
    await cloneMethodOperationChildrenToTarget(client, {
      sourceTable: "methodOperationTool",
      targetTable: "quoteOperationTool",
      sourceOperationId: operation.id,
      targetOperationId: quoteOperationId,
      companyId: args.companyId,
      userId: args.userId
    });
  }

  if (!operation.procedureId) {
    if (args.parts.parameters) {
      await cloneMethodOperationChildrenToTarget(client, {
        sourceTable: "methodOperationParameter",
        targetTable: "quoteOperationParameter",
        sourceOperationId: operation.id,
        targetOperationId: quoteOperationId,
        companyId: args.companyId,
        userId: args.userId
      });
    }

    if (args.parts.steps) {
      await cloneMethodOperationChildrenToTarget(client, {
        sourceTable: "methodOperationStep",
        targetTable: "quoteOperationStep",
        sourceOperationId: operation.id,
        targetOperationId: quoteOperationId,
        companyId: args.companyId,
        userId: args.userId
      });
    }
  }

  return quoteOperationId;
}

async function cloneMethodOperationChildrenToJob(
  client: PoolClient,
  args: {
    sourceTable: string;
    targetTable: string;
    sourceOperationId: string;
    targetOperationId: string;
    companyId: string;
    userId: string;
  }
) {
  return cloneMethodOperationChildrenToTarget(client, {
    sourceTable: args.sourceTable,
    targetTable: args.targetTable,
    sourceOperationId: args.sourceOperationId,
    targetOperationId: args.targetOperationId,
    companyId: args.companyId,
    userId: args.userId
  });
}

async function cloneMethodOperationChildrenToTarget(
  client: PoolClient,
  args: {
    sourceTable: string;
    targetTable: string;
    sourceOperationId: string;
    targetOperationId: string;
    companyId: string;
    userId: string;
  }
) {
  const rows = await queryMany<Row>(
    client,
    `
      SELECT *
      FROM ${quoteIdent(args.sourceTable)}
      WHERE "operationId" = $1 AND "companyId" = $2
      ORDER BY "createdAt", id
    `,
    [args.sourceOperationId, args.companyId]
  );

  for (const row of rows) {
    await insertRow(client, args.targetTable, {
      ...row,
      id: nanoid(),
      operationId: args.targetOperationId,
      createdAt: new Date(),
      createdBy: args.userId,
      updatedAt: args.targetTable.endsWith("Tool") ? new Date() : null,
      updatedBy: null
    });
  }
}

async function cloneMethodOperation(
  client: PoolClient,
  operation: Row,
  args: {
    targetMakeMethodId: string;
    companyId: string;
    userId: string;
    parts: MethodParts;
  }
) {
  const newOperationId = nanoid();
  await insertRow(client, "methodOperation", {
    ...operation,
    id: newOperationId,
    makeMethodId: args.targetMakeMethodId,
    workInstruction: args.parts.workInstructions ? operation.workInstruction : {},
    createdBy: args.userId,
    updatedBy: operation.updatedBy ?? null
  });

  if (args.parts.tools) {
    await cloneChildRows(client, {
      table: "methodOperationTool",
      sourceColumn: "operationId",
      sourceId: operation.id,
      targetId: newOperationId,
      companyId: args.companyId,
      userId: args.userId
    });
  }

  if (!operation.procedureId) {
    if (args.parts.parameters) {
      await cloneChildRows(client, {
        table: "methodOperationParameter",
        sourceColumn: "operationId",
        sourceId: operation.id,
        targetId: newOperationId,
        companyId: args.companyId,
        userId: args.userId
      });
    }

    if (args.parts.steps) {
      await cloneChildRows(client, {
        table: "methodOperationStep",
        sourceColumn: "operationId",
        sourceId: operation.id,
        targetId: newOperationId,
        companyId: args.companyId,
        userId: args.userId
      });
    }
  }

  return newOperationId;
}

async function cloneJobOperationToMethod(
  client: PoolClient,
  operation: Row,
  args: {
    targetMakeMethodId: string;
    companyId: string;
    userId: string;
    parts: MethodParts;
  }
) {
  const methodOperationId = nanoid();
  await insertRow(client, "methodOperation", {
    id: methodOperationId,
    makeMethodId: args.targetMakeMethodId,
    processId: operation.processId,
    procedureId: operation.procedureId,
    workCenterId: operation.workCenterId,
    description: operation.description ?? "",
    setupTime: toNumber(operation.setupTime, 0),
    setupUnit: operation.setupUnit ?? "Total Hours",
    laborTime: toNumber(operation.laborTime, 0),
    laborUnit: operation.laborUnit ?? "Total Hours",
    machineTime: toNumber(operation.machineTime, 0),
    machineUnit: operation.machineUnit ?? "Total Hours",
    operationLeadTime: toNumber(operation.operationLeadTime, 0),
    operationMinimumCost: toNumber(operation.operationMinimumCost, 0),
    operationOrder: operation.operationOrder ?? "After Previous",
    operationType: operation.operationType ?? "Inside",
    operationUnitCost: toNumber(operation.operationUnitCost, 0),
    operationSupplierProcessId: operation.operationSupplierProcessId,
    order: toNumber(operation.order, 1),
    tags: operation.tags ?? [],
    workInstruction: args.parts.workInstructions ? operation.workInstruction : {},
    companyId: args.companyId,
    createdAt: new Date(),
    createdBy: args.userId,
    customFields: operation.customFields ?? {}
  });

  await cloneOperationChildrenToMethod(client, {
    sourcePrefix: "job",
    sourceOperationId: operation.id,
    targetOperationId: methodOperationId,
    hasProcedure: !!operation.procedureId,
    companyId: args.companyId,
    userId: args.userId,
    parts: args.parts
  });

  return methodOperationId;
}

async function cloneQuoteOperationToMethod(
  client: PoolClient,
  operation: Row,
  args: {
    targetMakeMethodId: string;
    companyId: string;
    userId: string;
    parts: MethodParts;
  }
) {
  const methodOperationId = nanoid();
  await insertRow(client, "methodOperation", {
    id: methodOperationId,
    makeMethodId: args.targetMakeMethodId,
    processId: operation.processId,
    procedureId: operation.procedureId,
    workCenterId: operation.workCenterId,
    description: operation.description ?? "",
    setupTime: toNumber(operation.setupTime, 0),
    setupUnit: operation.setupUnit ?? "Total Hours",
    laborTime: toNumber(operation.laborTime, 0),
    laborUnit: operation.laborUnit ?? "Total Hours",
    machineTime: toNumber(operation.machineTime, 0),
    machineUnit: operation.machineUnit ?? "Total Hours",
    operationLeadTime: toNumber(operation.operationLeadTime, 0),
    operationMinimumCost: toNumber(operation.operationMinimumCost, 0),
    operationOrder: operation.operationOrder ?? "After Previous",
    operationType: operation.operationType ?? "Inside",
    operationUnitCost: toNumber(operation.operationUnitCost, 0),
    operationSupplierProcessId: operation.operationSupplierProcessId,
    order: toNumber(operation.order, 1),
    tags: operation.tags ?? [],
    workInstruction: args.parts.workInstructions ? operation.workInstruction : {},
    companyId: args.companyId,
    createdAt: new Date(),
    createdBy: args.userId,
    customFields: operation.customFields ?? {}
  });

  await cloneOperationChildrenToMethod(client, {
    sourcePrefix: "quote",
    sourceOperationId: operation.id,
    targetOperationId: methodOperationId,
    hasProcedure: !!operation.procedureId,
    companyId: args.companyId,
    userId: args.userId,
    parts: args.parts
  });

  return methodOperationId;
}

async function cloneOperationChildrenToMethod(
  client: PoolClient,
  args: {
    sourcePrefix: "job" | "quote";
    sourceOperationId: string;
    targetOperationId: string;
    hasProcedure: boolean;
    companyId: string;
    userId: string;
    parts: MethodParts;
  }
) {
  const tablePrefix = args.sourcePrefix === "job" ? "job" : "quote";

  if (args.parts.tools) {
    const tools = await queryMany<Row>(
      client,
      `
        SELECT *
        FROM ${quoteIdent(`${tablePrefix}OperationTool`)}
        WHERE "operationId" = $1 AND "companyId" = $2
        ORDER BY "createdAt", id
      `,
      [args.sourceOperationId, args.companyId]
    );

    for (const tool of tools) {
      await insertRow(client, "methodOperationTool", {
        id: nanoid(),
        operationId: args.targetOperationId,
        toolId: tool.toolId,
        quantity: toNumber(tool.quantity, 0),
        companyId: args.companyId,
        createdAt: new Date(),
        createdBy: args.userId,
        updatedAt: new Date()
      });
    }
  }

  if (args.hasProcedure) return;

  if (args.parts.parameters) {
    const parameters = await queryMany<Row>(
      client,
      `
        SELECT *
        FROM ${quoteIdent(`${tablePrefix}OperationParameter`)}
        WHERE "operationId" = $1 AND "companyId" = $2
        ORDER BY "createdAt", id
      `,
      [args.sourceOperationId, args.companyId]
    );

    for (const parameter of parameters) {
      await insertRow(client, "methodOperationParameter", {
        id: nanoid(),
        operationId: args.targetOperationId,
        key: parameter.key,
        value: parameter.value,
        companyId: args.companyId,
        createdAt: new Date(),
        createdBy: args.userId
      });
    }
  }

  if (args.parts.steps) {
    const steps = await queryMany<Row>(
      client,
      `
        SELECT *
        FROM ${quoteIdent(`${tablePrefix}OperationStep`)}
        WHERE "operationId" = $1 AND "companyId" = $2
        ORDER BY "sortOrder", id
      `,
      [args.sourceOperationId, args.companyId]
    );

    for (const step of steps) {
      await insertRow(client, "methodOperationStep", {
        id: nanoid(),
        operationId: args.targetOperationId,
        name: step.name,
        type: step.type,
        description: step.description,
        fileTypes: step.fileTypes,
        listValues: step.listValues,
        maxValue: step.maxValue,
        minValue: step.minValue,
        required: step.required,
        sortOrder: step.sortOrder,
        unitOfMeasureCode: step.unitOfMeasureCode,
        companyId: args.companyId,
        createdAt: new Date(),
        createdBy: args.userId
      });
    }
  }
}

async function cloneChildRows(
  client: PoolClient,
  args: {
    table: string;
    sourceColumn: string;
    sourceId: string;
    targetId: string;
    companyId: string;
    userId: string;
  }
) {
  const rows = await queryMany<Row>(
    client,
    `
      SELECT *
      FROM ${quoteIdent(args.table)}
      WHERE ${quoteIdent(args.sourceColumn)} = $1 AND "companyId" = $2
      ORDER BY "createdAt", id
    `,
    [args.sourceId, args.companyId]
  );

  for (const row of rows) {
    await insertRow(client, args.table, {
      ...row,
      id: nanoid(),
      [args.sourceColumn]: args.targetId,
      createdBy: args.userId,
      updatedBy: row.updatedBy ?? null
    });
  }
}

async function syncProcedureToOperation(
  client: PoolClient,
  args: GetMethodArgs
) {
  const procedure = await getProcedure(client, args.sourceId, args.companyId);
  const operation = await queryOneRequired<Row>(
    client,
    `
      SELECT *
      FROM "jobOperation"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.targetId, args.companyId],
    "Failed to get operation"
  );

  const procedureSteps = await queryMany<Row>(
    client,
    `
      SELECT *
      FROM "procedureStep"
      WHERE "procedureId" = $1 AND "companyId" = $2
      ORDER BY "sortOrder", id
    `,
    [args.sourceId, args.companyId]
  );
  const procedureParameters = await queryMany<Row>(
    client,
    `
      SELECT *
      FROM "procedureParameter"
      WHERE "procedureId" = $1 AND "companyId" = $2
      ORDER BY "createdAt", id
    `,
    [args.sourceId, args.companyId]
  );
  const existingSteps = await queryMany<Row>(
    client,
    `
      SELECT *
      FROM "jobOperationStep"
      WHERE "operationId" = $1 AND "companyId" = $2
      ORDER BY "sortOrder", id
    `,
    [args.targetId, args.companyId]
  );

  for (const existingStep of existingSteps) {
    const matchingProcedureStep = procedureSteps.find(
      (step) => step.name === existingStep.name && step.type === existingStep.type
    );

    if (matchingProcedureStep) {
      await client.query(
        `
          UPDATE "jobOperationStep"
          SET description = $1,
              "fileTypes" = $2,
              "listValues" = $3,
              "maxValue" = $4,
              "minValue" = $5,
              required = $6,
              "sortOrder" = $7,
              "unitOfMeasureCode" = $8,
              "updatedAt" = NOW(),
              "updatedBy" = $9
          WHERE id = $10 AND "companyId" = $11
        `,
        [
          matchingProcedureStep.description,
          matchingProcedureStep.fileTypes,
          matchingProcedureStep.listValues,
          matchingProcedureStep.maxValue,
          matchingProcedureStep.minValue,
          matchingProcedureStep.required,
          matchingProcedureStep.sortOrder,
          matchingProcedureStep.unitOfMeasureCode,
          args.userId,
          existingStep.id,
          args.companyId
        ]
      );
    } else {
      await client.query(
        `DELETE FROM "jobOperationStep" WHERE id = $1 AND "companyId" = $2`,
        [existingStep.id, args.companyId]
      );
    }
  }

  await client.query(
    `
      DELETE FROM "jobOperationParameter"
      WHERE "operationId" = $1 AND "companyId" = $2
    `,
    [args.targetId, args.companyId]
  );

  for (const procedureStep of procedureSteps) {
    const alreadyExists = existingSteps.some(
      (step) => step.name === procedureStep.name && step.type === procedureStep.type
    );
    if (alreadyExists) continue;

    await insertRow(client, "jobOperationStep", {
      id: nanoid(),
      operationId: args.targetId,
      name: procedureStep.name,
      type: procedureStep.type,
      description: procedureStep.description,
      fileTypes: procedureStep.fileTypes,
      listValues: procedureStep.listValues,
      maxValue: procedureStep.maxValue,
      minValue: procedureStep.minValue,
      required: procedureStep.required,
      sortOrder: procedureStep.sortOrder,
      unitOfMeasureCode: procedureStep.unitOfMeasureCode,
      companyId: args.companyId,
      createdAt: new Date(),
      createdBy: args.userId,
      updatedBy: args.userId
    });
  }

  for (const parameter of procedureParameters) {
    await insertRow(client, "jobOperationParameter", {
      id: nanoid(),
      operationId: args.targetId,
      key: parameter.key,
      value: parameter.value,
      companyId: args.companyId,
      createdAt: new Date(),
      createdBy: args.userId,
      updatedBy: args.userId
    });
  }

  await client.query(
    `
      UPDATE "jobOperation"
      SET "workInstruction" = $1,
          "procedureId" = $2,
          "updatedAt" = NOW(),
          "updatedBy" = $3
      WHERE id = $4 AND "companyId" = $5
    `,
    [
      JSON.stringify(procedure.content ?? {}),
      procedure.id,
      args.userId,
      operation.id,
      args.companyId
    ]
  );
}

async function clearMakeMethodContents(
  client: PoolClient,
  args: {
    makeMethodId: string;
    companyId: string;
    userId: string;
    parts: MethodParts;
  }
) {
  const operationIds = await queryMany<{ id: string }>(
    client,
    `
      SELECT id
      FROM "methodOperation"
      WHERE "makeMethodId" = $1 AND "companyId" = $2
    `,
    [args.makeMethodId, args.companyId]
  );
  const operationIdList = operationIds.map((row) => row.id);

  if (args.parts.billOfMaterial) {
    await client.query(
      `
        DELETE FROM "methodMaterial"
        WHERE "makeMethodId" = $1 AND "companyId" = $2
      `,
      [args.makeMethodId, args.companyId]
    );
  }

  if (args.parts.billOfProcess) {
    if (!args.parts.billOfMaterial && operationIdList.length > 0) {
      await client.query(
        `
          UPDATE "methodMaterial"
          SET "methodOperationId" = NULL,
              "updatedAt" = NOW(),
              "updatedBy" = $1
          WHERE "methodOperationId" = ANY($2::text[])
            AND "companyId" = $3
        `,
        [args.userId, operationIdList, args.companyId]
      );
    }

    await deleteMethodOperationChildren(
      client,
      operationIdList,
      args.companyId
    );
    await client.query(
      `
        DELETE FROM "methodOperation"
        WHERE "makeMethodId" = $1 AND "companyId" = $2
      `,
      [args.makeMethodId, args.companyId]
    );
  }
}

async function assertMakeMethodCanBeOverwritten(
  client: PoolClient,
  args: {
    makeMethod: Row;
    companyId: string;
  }
) {
  const itemReplenishment = await queryOneRequired<Row>(
    client,
    `
      SELECT "requiresConfiguration"
      FROM "itemReplenishment"
      WHERE "itemId" = $1 AND "companyId" = $2
    `,
    [args.makeMethod.itemId, args.companyId],
    "Failed to get item replenishment"
  );

  if (itemReplenishment.requiresConfiguration) {
    throw new Error("Cannot override method of configured item");
  }
}

async function createQuoteOpportunity(
  client: PoolClient,
  args: { customerId: string; companyId: string }
) {
  const id = nanoid();
  await insertRow(client, "opportunity", {
    id,
    customerId: args.customerId,
    companyId: args.companyId
  });
  return id;
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

async function getNextRevisionId(
  client: PoolClient,
  quoteReadableId: string,
  companyId: string
) {
  const row = await queryOne<{ value: string | number }>(
    client,
    `
      SELECT COALESCE(MAX("revisionId"), 0) + 1 AS value
      FROM "quote"
      WHERE "quoteId" = $1 AND "companyId" = $2
    `,
    [quoteReadableId, companyId]
  );
  return toNumber(row?.value, 1);
}

function addDaysAsDateString(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildStorageUnitIds(locationId: unknown, storageUnitId: unknown) {
  return typeof locationId === "string" && locationId
    ? { [locationId]: typeof storageUnitId === "string" ? storageUnitId : null }
    : {};
}

async function getMaterialUnitOfMeasureCode(
  client: PoolClient,
  args: { material: Row; companyId: string }
) {
  if (
    typeof args.material.unitOfMeasureCode === "string" &&
    args.material.unitOfMeasureCode
  ) {
    return args.material.unitOfMeasureCode;
  }

  const item = await getItemForJobMaterial(
    client,
    args.material.itemId,
    args.companyId
  );
  if (!item.unitOfMeasureCode) {
    throw new Error("Material item is missing unit of measure");
  }
  return item.unitOfMeasureCode;
}

async function getActiveMakeMethod(
  client: PoolClient,
  itemId: string,
  companyId: string
) {
  return queryOneRequired<Row>(
    client,
    `
      SELECT *
      FROM "makeMethod"
      WHERE "itemId" = $1 AND "companyId" = $2 AND status = 'Active'
      ORDER BY version DESC, "createdAt" DESC
      LIMIT 1
    `,
    [itemId, companyId],
    "Failed to get make method"
  );
}

async function getMakeMethod(
  client: PoolClient,
  makeMethodId: string,
  companyId: string
) {
  return queryOneRequired<Row>(
    client,
    `
      SELECT *
      FROM "makeMethod"
      WHERE id = $1 AND "companyId" = $2
    `,
    [makeMethodId, companyId],
    "Failed to get make method"
  );
}

async function getQuoteMakeMethod(
  client: PoolClient,
  quoteMakeMethodId: string,
  companyId: string
) {
  return queryOneRequired<Row>(
    client,
    `
      SELECT *
      FROM "quoteMakeMethod"
      WHERE id = $1 AND "companyId" = $2
    `,
    [quoteMakeMethodId, companyId],
    "Failed to get quote make method"
  );
}

async function getProcedure(
  client: PoolClient,
  procedureId: string,
  companyId: string
) {
  return queryOneRequired<Row>(
    client,
    `
      SELECT *
      FROM "procedure"
      WHERE id = $1 AND "companyId" = $2
    `,
    [procedureId, companyId],
    "Failed to get procedure"
  );
}

async function getItemForJobMaterial(
  client: PoolClient,
  itemId: string,
  companyId: string
) {
  return queryOneRequired<Row>(
    client,
    `
      SELECT
        i.id,
        i.name,
        i.type,
        i."itemTrackingType",
        i."unitOfMeasureCode",
        COALESCE(ir."scrapPercentage", 0) AS "scrapPercentage",
        COALESCE(ic."unitCost", 0) AS "unitCost",
        amm.version AS "makeMethodVersion"
      FROM item i
      LEFT JOIN "itemReplenishment" ir
        ON ir."itemId" = i.id AND ir."companyId" = i."companyId"
      LEFT JOIN "itemCost" ic
        ON ic."itemId" = i.id AND ic."companyId" = i."companyId"
      LEFT JOIN "activeMakeMethods" amm
        ON amm."itemId" = i.id AND amm."companyId" = i."companyId"
      WHERE i.id = $1 AND i."companyId" = $2
    `,
    [itemId, companyId],
    "Item not found"
  );
}

async function deleteMethodOperationChildren(
  client: PoolClient,
  operationIds: string[],
  companyId: string
) {
  if (operationIds.length === 0) return;
  for (const table of [
    "methodOperationTool",
    "methodOperationParameter",
    "methodOperationStep"
  ]) {
    await client.query(
      `
        DELETE FROM ${quoteIdent(table)}
        WHERE "operationId" = ANY($1::text[]) AND "companyId" = $2
      `,
      [operationIds, companyId]
    );
  }
}

async function deleteJobOperationChildren(
  client: PoolClient,
  operationIds: string[],
  companyId: string
) {
  if (operationIds.length === 0) return;
  for (const table of [
    "jobOperationTool",
    "jobOperationParameter",
    "jobOperationStep"
  ]) {
    await client.query(
      `
        DELETE FROM ${quoteIdent(table)}
        WHERE "operationId" = ANY($1::text[]) AND "companyId" = $2
      `,
      [operationIds, companyId]
    );
  }
}

async function deleteQuoteOperationChildren(
  client: PoolClient,
  operationIds: string[],
  companyId: string
) {
  if (operationIds.length === 0) return;
  for (const table of [
    "quoteOperationTool",
    "quoteOperationParameter",
    "quoteOperationStep"
  ]) {
    await client.query(
      `
        DELETE FROM ${quoteIdent(table)}
        WHERE "operationId" = ANY($1::text[]) AND "companyId" = $2
      `,
      [operationIds, companyId]
    );
  }
}

async function insertRow(
  client: PoolClient,
  table: string,
  row: Record<string, unknown>
) {
  const entries = Object.entries(row).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return;

  const columns = entries.map(([column]) => quoteIdent(column)).join(", ");
  const placeholders = entries.map((_, index) => `$${index + 1}`).join(", ");
  const jsonbColumns = jsonbColumnsByTable[table] ?? new Set<string>();
  const values = entries.map(([column, value]) =>
    jsonbColumns.has(column) && value !== null ? JSON.stringify(value) : value
  );

  await client.query(
    `INSERT INTO ${quoteIdent(table)} (${columns}) VALUES (${placeholders})`,
    values
  );
}

function quoteIdent(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
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

function toNumber(value: unknown, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled get-method type: ${String(value)}`);
}
