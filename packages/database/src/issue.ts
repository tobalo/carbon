import { nanoid } from "nanoid";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";
import { getPostgresConnectionPool } from "./postgres.ts";

const childTrackedEntitySchema = z.object({
  trackedEntityId: z.string(),
  quantity: z.number()
});

export const issueArgsValidator = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("convertEntity"),
    trackedEntityId: z.string(),
    newRevision: z.string(),
    quantity: z.number().positive().default(1),
    companyId: z.string(),
    userId: z.string()
  }),
  z.object({
    type: z.literal("jobCompleteMakeToOrder"),
    jobId: z.string(),
    quantityComplete: z.number(),
    companyId: z.string(),
    userId: z.string()
  }),
  z.object({
    type: z.literal("jobOperation"),
    quantity: z.number(),
    id: z.string(),
    companyId: z.string(),
    userId: z.string()
  }),
  z.object({
    type: z.literal("jobOperationBatchComplete"),
    trackedEntityId: z.string().optional(),
    companyId: z.string(),
    userId: z.string(),
    quantity: z.number(),
    jobOperationId: z.string(),
    notes: z.string().optional(),
    laborProductionEventId: z.string().optional(),
    machineProductionEventId: z.string().optional(),
    setupProductionEventId: z.string().optional()
  }),
  z.object({
    type: z.literal("jobOperationSerialComplete"),
    trackedEntityId: z.string().optional(),
    companyId: z.string(),
    userId: z.string(),
    quantity: z.number(),
    jobOperationId: z.string(),
    notes: z.string().optional(),
    laborProductionEventId: z.string().optional(),
    machineProductionEventId: z.string().optional(),
    setupProductionEventId: z.string().optional()
  }),
  z.object({
    type: z.literal("partToOperation"),
    id: z.string(),
    itemId: z.string(),
    quantity: z.number(),
    adjustmentType: z.enum([
      "Set Quantity",
      "Positive Adjmt.",
      "Negative Adjmt."
    ]),
    materialId: z.string().optional(),
    companyId: z.string(),
    userId: z.string()
  }),
  z.object({
    type: z.literal("scrapTrackedEntity"),
    trackedEntityId: z.string(),
    materialId: z.string(),
    parentTrackedEntityId: z.string().optional(),
    companyId: z.string(),
    userId: z.string()
  }),
  z.object({
    type: z.literal("trackedEntitiesToOperation"),
    materialId: z.string().optional(),
    jobOperationId: z.string().optional(),
    itemId: z.string().optional(),
    parentTrackedEntityId: z.string(),
    children: z.array(childTrackedEntitySchema),
    overrideExpired: z.boolean().optional(),
    overrideReason: z.string().optional(),
    companyId: z.string(),
    userId: z.string()
  }),
  z.object({
    type: z.literal("unconsumeTrackedEntities"),
    materialId: z.string(),
    parentTrackedEntityId: z.string(),
    children: z.array(childTrackedEntitySchema),
    companyId: z.string(),
    userId: z.string()
  }),
  z.object({
    type: z.literal("maintenanceDispatchInventory"),
    maintenanceDispatchId: z.string(),
    itemId: z.string(),
    unitOfMeasureCode: z.string(),
    quantity: z.number(),
    companyId: z.string(),
    userId: z.string()
  }),
  z.object({
    type: z.literal("maintenanceDispatchTrackedEntities"),
    maintenanceDispatchId: z.string(),
    itemId: z.string(),
    unitOfMeasureCode: z.string(),
    children: z.array(childTrackedEntitySchema),
    overrideExpired: z.boolean().optional(),
    overrideReason: z.string().optional(),
    companyId: z.string(),
    userId: z.string()
  }),
  z.object({
    type: z.literal("maintenanceDispatchUnconsume"),
    maintenanceDispatchItemId: z.string(),
    children: z.array(childTrackedEntitySchema),
    companyId: z.string(),
    userId: z.string()
  }),
  z.object({
    type: z.literal("maintenanceDispatchUnissue"),
    maintenanceDispatchItemId: z.string(),
    companyId: z.string(),
    userId: z.string()
  })
]);

type IssueArgs = z.infer<typeof issueArgsValidator>;
type Row = QueryResultRow & Record<string, any>;

let issuePool: Pool | null = null;

export async function issue(args: IssueArgs) {
  if (!args.companyId) throw new Error("Payload is missing companyId");
  if (!args.userId) throw new Error("Payload is missing userId");

  const pool = getIssuePool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [
      args.userId
    ]);

    const response = await issueInTransaction(client, args);

    await client.query("COMMIT");
    return response;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function closeIssuePool() {
  if (!issuePool) return;
  await issuePool.end();
  issuePool = null;
}

function getIssuePool() {
  issuePool ??= getPostgresConnectionPool(
    Number(process.env.DATABASE_SERVICE_POOL_SIZE ?? 5),
    { kind: "service" }
  );
  return issuePool;
}

async function issueInTransaction(client: PoolClient, args: IssueArgs) {
  switch (args.type) {
    case "jobOperation":
      await issueJobOperationMaterials(client, args);
      return { success: true };
    case "partToOperation":
      await issuePartToOperation(client, args);
      return { success: true };
    case "maintenanceDispatchInventory":
      return issueMaintenanceDispatchInventory(client, args);
    case "maintenanceDispatchTrackedEntities":
      return issueMaintenanceDispatchTrackedEntities(client, args);
    case "maintenanceDispatchUnconsume":
      return issueMaintenanceDispatchUnconsume(client, args);
    case "maintenanceDispatchUnissue":
      return issueMaintenanceDispatchUnissue(client, args);
    case "trackedEntitiesToOperation":
      return issueTrackedEntitiesToOperation(client, args);
    case "unconsumeTrackedEntities":
      return issueUnconsumeTrackedEntities(client, args);
    case "convertEntity":
      return issueConvertEntity(client, args);
    case "scrapTrackedEntity":
      return issueScrapTrackedEntity(client, args);
    case "jobOperationBatchComplete":
      return issueJobOperationBatchComplete(client, args);
    case "jobOperationSerialComplete":
      return issueJobOperationSerialComplete(client, args);
    case "jobCompleteMakeToOrder":
      return issueJobCompleteMakeToOrder(client, args);
    default:
      assertNever(args);
  }
}

async function issueJobOperationMaterials(
  client: PoolClient,
  args: Extract<IssueArgs, { type: "jobOperation" }>
) {
  const materials = await queryMany<Row>(
    client,
    `
      SELECT *
      FROM "jobMaterial"
      WHERE "jobOperationId" = $1
        AND "companyId" = $2
        AND "itemType" = ANY($3::text[])
        AND "methodType" <> 'Make to Order'
        AND COALESCE("estimatedQuantity", 0) > 0
        AND "requiresBatchTracking" = false
        AND "requiresSerialTracking" = false
      ORDER BY "order", id
    `,
    [args.id, args.companyId, ["Material", "Part", "Consumable"]]
  );
  if (materials.length === 0) return;
  const firstMaterial = materials[0];
  if (!firstMaterial) return;

  const job = await queryOneRequired<Row>(
    client,
    `
      SELECT j.id, j."jobId", j."locationId"
      FROM "job" j
      WHERE j.id = $1 AND j."companyId" = $2
    `,
    [firstMaterial.jobId, args.companyId],
    "Job not found"
  );
  if (!job.locationId) throw new Error("Job location is required");

  for (const material of materials) {
    const quantityToIssue = toNumber(material.quantity) * args.quantity;
    const storageUnitId =
      material.storageUnitId ??
      (material.defaultStorageUnit
        ? await getPickMethodDefaultStorageUnit(
            client,
            material.itemId,
            job.locationId,
            args.companyId
          )
        : null) ??
      (await getStorageUnitWithHighestQuantity(
        client,
        material.itemId,
        job.locationId,
        args.companyId
      ));
    const item = await queryOneRequired<Row>(
      client,
      `SELECT "itemTrackingType" FROM "item" WHERE id = $1 AND "companyId" = $2`,
      [material.itemId, args.companyId],
      "Item not found"
    );

    if (item.itemTrackingType === "Inventory") {
      await insertItemLedgerEntry(client, {
        entryType: "Consumption",
        documentType: "Job Consumption",
        documentId: material.jobId,
        itemId: material.itemId,
        quantity: -quantityToIssue,
        locationId: job.locationId,
        storageUnitId,
        trackedEntityId: null,
        trackedEntityStatus: null,
        companyId: args.companyId,
        userId: args.userId
      });
      await updatePickMethodDefaultStorageUnitIfNeeded(client, {
        itemId: material.itemId,
        locationId: job.locationId,
        storageUnitId,
        companyId: args.companyId,
        userId: args.userId
      });
    }

    await client.query(
      `
        UPDATE "jobMaterial"
        SET "quantityIssued" = COALESCE("quantityIssued", 0) + $1,
            "updatedAt" = NOW(),
            "updatedBy" = $2
        WHERE id = $3 AND "companyId" = $4
      `,
      [quantityToIssue, args.userId, material.id, args.companyId]
    );
  }
}

async function issuePartToOperation(
  client: PoolClient,
  args: Extract<IssueArgs, { type: "partToOperation" }>
) {
  const jobOperation = await queryOneRequired<Row>(
    client,
    `
      SELECT jo.id, jo."jobId", jo."jobMakeMethodId", j."locationId"
      FROM "jobOperation" jo
      JOIN "job" j ON j.id = jo."jobId"
      WHERE jo.id = $1 AND jo."companyId" = $2
    `,
    [args.id, args.companyId],
    "Job operation not found"
  );
  const item = await queryOneRequired<Row>(
    client,
    `
      SELECT id, name, type, "itemTrackingType"
      FROM "item"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.itemId, args.companyId],
    "Item not found"
  );

  if (args.materialId) {
    const material = await queryOneRequired<Row>(
      client,
      `SELECT * FROM "jobMaterial" WHERE id = $1 AND "companyId" = $2`,
      [args.materialId, args.companyId],
      "Job material not found"
    );
    const quantityToIssue =
      args.adjustmentType === "Set Quantity"
        ? args.quantity - toNumber(material.quantityIssued)
        : args.quantity;
    const ledgerQuantity =
      args.adjustmentType === "Positive Adjmt."
        ? quantityToIssue
        : -quantityToIssue;
    const storageUnitId =
      material.storageUnitId ??
      (material.defaultStorageUnit
        ? await getPickMethodDefaultStorageUnit(
            client,
            args.itemId,
            jobOperation.locationId,
            args.companyId
          )
        : null) ??
      (await getStorageUnitWithHighestQuantity(
        client,
        args.itemId,
        jobOperation.locationId,
        args.companyId
      ));

    if (material.methodType !== "Make to Order" && item.itemTrackingType === "Inventory") {
      await insertItemLedgerEntry(client, {
        entryType: "Consumption",
        documentType: "Job Consumption",
        documentId: material.jobId,
        itemId: material.itemId,
        quantity: ledgerQuantity,
        locationId: jobOperation.locationId,
        storageUnitId,
        trackedEntityId: null,
        trackedEntityStatus: null,
        companyId: args.companyId,
        userId: args.userId
      });
    }

    await client.query(
      `
        UPDATE "jobMaterial"
        SET "quantityIssued" = COALESCE("quantityIssued", 0) + $1,
            "updatedAt" = NOW(),
            "updatedBy" = $2
        WHERE id = $3 AND "companyId" = $4
      `,
      [quantityToIssue, args.userId, args.materialId, args.companyId]
    );
    return;
  }

  const storageUnitId =
    item.itemTrackingType === "Inventory"
      ? await getStorageUnitWithHighestQuantity(
          client,
          args.itemId,
          jobOperation.locationId,
          args.companyId
        )
      : null;
  const materialId = nanoid();
  const order = await getNextJobMaterialOrder(
    client,
    jobOperation.jobId,
    args.companyId
  );

  await client.query(
    `
      INSERT INTO "jobMaterial" (
        id, "jobId", "jobMakeMethodId", "jobOperationId", "itemId",
        "itemType", description, "methodType", quantity, "quantityIssued",
        "estimatedQuantity", "itemScrapPercentage", "scrapQuantity", kit,
        "requiresBatchTracking", "requiresSerialTracking", "unitCost",
        "unitOfMeasureCode", "order", "storageUnitId", "companyId",
        "createdAt", "createdBy"
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, 'Pull from Inventory', 0, $8, 0, 0, 0,
        false, false, false, 0, 'EA', $9, $10, $11, NOW(), $12
      )
    `,
    [
      materialId,
      jobOperation.jobId,
      jobOperation.jobMakeMethodId,
      args.id,
      args.itemId,
      item.type ?? "Part",
      item.name ?? "",
      args.quantity,
      order,
      storageUnitId,
      args.companyId,
      args.userId
    ]
  );

  if (item.itemTrackingType === "Inventory") {
    await insertItemLedgerEntry(client, {
      entryType: "Consumption",
      documentType: "Job Consumption",
      documentId: jobOperation.jobId,
      itemId: args.itemId,
      quantity:
        args.adjustmentType === "Positive Adjmt." ? args.quantity : -args.quantity,
      locationId: jobOperation.locationId,
      storageUnitId,
      trackedEntityId: null,
      trackedEntityStatus: null,
      companyId: args.companyId,
      userId: args.userId
    });
  }
}

async function issueTrackedEntitiesToOperation(
  client: PoolClient,
  args: Extract<IssueArgs, { type: "trackedEntitiesToOperation" }>
) {
  if (!args.parentTrackedEntityId) throw new Error("Parent ID is required");
  if (args.children.length === 0) throw new Error("Children are required");

  const jobMaterial = args.materialId
    ? await queryOneRequired<Row>(
        client,
        `SELECT * FROM "jobMaterial" WHERE id = $1 AND "companyId" = $2`,
        [args.materialId, args.companyId],
        "Job material not found"
      )
    : await createTrackedJobMaterialForOperation(client, {
        jobOperationId: args.jobOperationId,
        itemId: args.itemId,
        children: args.children,
        companyId: args.companyId,
        userId: args.userId
      });
  const job = await queryOneRequired<Row>(
    client,
    `
      SELECT id, "locationId"
      FROM "job"
      WHERE id = $1 AND "companyId" = $2
    `,
    [jobMaterial.jobId, args.companyId],
    "Job not found"
  );
  const item = await queryOneRequired<Row>(
    client,
    `
      SELECT "readableIdWithRevision"
      FROM "item"
      WHERE id = $1 AND "companyId" = $2
    `,
    [jobMaterial.itemId, args.companyId],
    "Item not found"
  );
  const parentTrackedEntity = await queryOneRequired<Row>(
    client,
    `
      SELECT *
      FROM "trackedEntity"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.parentTrackedEntityId, args.companyId],
    "Parent tracked entity not found"
  );
  const consumeActivityId = nanoid();

  await insertTrackedActivity(client, {
    id: consumeActivityId,
    type: "Consume",
    sourceDocument: "Job Material",
    sourceDocumentId: jobMaterial.id,
    sourceDocumentReadableId: item.readableIdWithRevision ?? "",
    attributes: {
      Job: job.id,
      "Job Make Method": jobMaterial.jobMakeMethodId,
      "Job Material": jobMaterial.id,
      Employee: args.userId
    },
    companyId: args.companyId,
    userId: args.userId
  });
  await insertTrackedActivityOutput(client, {
    trackedActivityId: consumeActivityId,
    trackedEntityId: args.parentTrackedEntityId,
    quantity: toNumber(parentTrackedEntity.quantity),
    companyId: args.companyId,
    userId: args.userId
  });

  const splitEntities: Array<{
    originalId: string;
    newId: string;
    readableId: string;
    quantity: number;
  }> = [];

  for (const child of args.children) {
    const trackedEntity = await getTrackedEntityForUpdate(client, {
      trackedEntityId: child.trackedEntityId,
      companyId: args.companyId
    });
    const quantity = toNumber(child.quantity);
    const entityQuantity = toNumber(trackedEntity.quantity);

    if (trackedEntity.status !== "Available") {
      throw new Error("Tracked entity is not available");
    }
    if (quantity <= 0 || quantity > entityQuantity) {
      throw new Error("Invalid tracked entity quantity");
    }

    const sourceLedger = await getLatestTrackedEntityLedger(client, {
      trackedEntityId: trackedEntity.id,
      companyId: args.companyId
    });

    if (entityQuantity !== quantity) {
      const remainingQuantity = entityQuantity - quantity;
      const newTrackedEntityId = nanoid();
      const splitActivityId = nanoid();

      splitEntities.push({
        originalId: trackedEntity.id,
        newId: newTrackedEntityId,
        readableId: trackedEntity.sourceDocumentReadableId ?? "",
        quantity: remainingQuantity
      });

      await insertTrackedActivity(client, {
        id: splitActivityId,
        type: "Split",
        sourceDocument: "Job Material",
        sourceDocumentId: jobMaterial.id,
        sourceDocumentReadableId: item.readableIdWithRevision ?? "",
        attributes: {
          "Original Quantity": entityQuantity,
          "Consumed Quantity": quantity,
          "Remaining Quantity": remainingQuantity,
          "Split Entity ID": newTrackedEntityId
        },
        companyId: args.companyId,
        userId: args.userId
      });
      await insertTrackedActivityInput(client, {
        trackedActivityId: splitActivityId,
        trackedEntityId: trackedEntity.id,
        quantity: entityQuantity,
        companyId: args.companyId,
        userId: args.userId
      });
      await insertTrackedEntity(client, {
        id: newTrackedEntityId,
        sourceDocumentId: trackedEntity.sourceDocumentId,
        sourceDocument: "Item",
        sourceDocumentReadableId: trackedEntity.sourceDocumentReadableId,
        quantity: remainingQuantity,
        status: "Available",
        attributes: trackedEntity.attributes ?? {},
        itemId: trackedEntity.itemId ?? trackedEntity.sourceDocumentId,
        expirationDate: trackedEntity.expirationDate,
        companyId: args.companyId,
        userId: args.userId
      });
      await client.query(
        `
          UPDATE "trackedEntity"
          SET quantity = $1,
              attributes = $2
          WHERE id = $3 AND "companyId" = $4
        `,
        [
          quantity,
          JSON.stringify({
            ...(trackedEntity.attributes ?? {}),
            "Split Entity ID": newTrackedEntityId
          }),
          trackedEntity.id,
          args.companyId
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
        trackedEntityId: trackedEntity.id,
        quantity,
        companyId: args.companyId,
        userId: args.userId
      });

      if (jobMaterial.methodType !== "Make to Order") {
        await insertItemLedgerRow(client, {
          entryType: "Negative Adjmt.",
          documentType: "Batch Split",
          documentId: splitActivityId,
          documentLineId: null,
          itemId: trackedEntity.sourceDocumentId,
          quantity: -entityQuantity,
          locationId: job.locationId,
          storageUnitId: sourceLedger?.storageUnitId ?? null,
          trackedEntityId: trackedEntity.id,
          companyId: args.companyId,
          userId: args.userId
        });
        await insertItemLedgerRow(client, {
          entryType: "Positive Adjmt.",
          documentType: "Batch Split",
          documentId: splitActivityId,
          documentLineId: null,
          itemId: trackedEntity.sourceDocumentId,
          quantity,
          locationId: job.locationId,
          storageUnitId: sourceLedger?.storageUnitId ?? null,
          trackedEntityId: trackedEntity.id,
          companyId: args.companyId,
          userId: args.userId
        });
        await insertItemLedgerRow(client, {
          entryType: "Positive Adjmt.",
          documentType: "Batch Split",
          documentId: splitActivityId,
          documentLineId: null,
          itemId: trackedEntity.sourceDocumentId,
          quantity: remainingQuantity,
          locationId: job.locationId,
          storageUnitId: sourceLedger?.storageUnitId ?? null,
          trackedEntityId: newTrackedEntityId,
          companyId: args.companyId,
          userId: args.userId
        });
      }
    }

    await client.query(
      `
        UPDATE "trackedEntity"
        SET status = 'Consumed'
        WHERE id = $1 AND "companyId" = $2
      `,
      [trackedEntity.id, args.companyId]
    );
    await insertTrackedActivityInput(client, {
      trackedActivityId: consumeActivityId,
      trackedEntityId: trackedEntity.id,
      quantity,
      companyId: args.companyId,
      userId: args.userId
    });

    if (jobMaterial.methodType !== "Make to Order") {
      await insertItemLedgerRow(client, {
        entryType: "Consumption",
        documentType: "Job Consumption",
        documentId: job.id,
        documentLineId: jobMaterial.id,
        itemId: trackedEntity.sourceDocumentId,
        quantity: -quantity,
        locationId: job.locationId,
        storageUnitId: sourceLedger?.storageUnitId ?? null,
        trackedEntityId: trackedEntity.id,
        companyId: args.companyId,
        userId: args.userId
      });
    }
  }

  const totalQuantity = args.children.reduce(
    (sum, child) => sum + toNumber(child.quantity),
    0
  );
  await client.query(
    `
      UPDATE "jobMaterial"
      SET "quantityIssued" = COALESCE("quantityIssued", 0) + $1,
          "updatedAt" = NOW(),
          "updatedBy" = $2
      WHERE id = $3 AND "companyId" = $4
    `,
    [totalQuantity, args.userId, jobMaterial.id, args.companyId]
  );

  return { success: true, splitEntities };
}

async function issueUnconsumeTrackedEntities(
  client: PoolClient,
  args: Extract<IssueArgs, { type: "unconsumeTrackedEntities" }>
) {
  if (!args.parentTrackedEntityId) throw new Error("Parent ID is required");
  if (args.children.length === 0) throw new Error("Children are required");

  const jobMaterial = await queryOneRequired<Row>(
    client,
    `SELECT * FROM "jobMaterial" WHERE id = $1 AND "companyId" = $2`,
    [args.materialId, args.companyId],
    "Job material not found"
  );
  const job = await queryOneRequired<Row>(
    client,
    `
      SELECT id, "locationId"
      FROM "job"
      WHERE id = $1 AND "companyId" = $2
    `,
    [jobMaterial.jobId, args.companyId],
    "Job not found"
  );
  const item = await queryOneRequired<Row>(
    client,
    `
      SELECT "readableIdWithRevision"
      FROM "item"
      WHERE id = $1 AND "companyId" = $2
    `,
    [jobMaterial.itemId, args.companyId],
    "Item not found"
  );
  const activityId = nanoid();

  await insertTrackedActivity(client, {
    id: activityId,
    type: "Unconsume",
    sourceDocument: "Job Material",
    sourceDocumentId: jobMaterial.id,
    sourceDocumentReadableId: item.readableIdWithRevision ?? "",
    attributes: {
      Job: job.id,
      "Job Make Method": jobMaterial.jobMakeMethodId,
      "Job Material": jobMaterial.id,
      Employee: args.userId
    },
    companyId: args.companyId,
    userId: args.userId
  });

  for (const child of args.children) {
    const trackedEntity = await getTrackedEntityForUpdate(client, {
      trackedEntityId: child.trackedEntityId,
      companyId: args.companyId
    });
    const quantity = toNumber(child.quantity);

    if (trackedEntity.status !== "Consumed") {
      throw new Error("Tracked entity is not in consumed status");
    }

    const sourceLedger = await getLatestTrackedEntityLedger(client, {
      trackedEntityId: child.trackedEntityId,
      companyId: args.companyId
    });

    await client.query(
      `
        UPDATE "trackedEntity"
        SET status = 'Available'
        WHERE id = $1 AND "companyId" = $2
      `,
      [child.trackedEntityId, args.companyId]
    );
    await insertTrackedActivityOutput(client, {
      trackedActivityId: activityId,
      trackedEntityId: child.trackedEntityId,
      quantity,
      companyId: args.companyId,
      userId: args.userId
    });

    if (jobMaterial.methodType !== "Make to Order") {
      await insertItemLedgerRow(client, {
        entryType: "Consumption",
        documentType: "Job Consumption",
        documentId: job.id,
        documentLineId: jobMaterial.id,
        itemId: trackedEntity.sourceDocumentId,
        quantity,
        locationId: job.locationId,
        storageUnitId: sourceLedger?.storageUnitId ?? null,
        trackedEntityId: child.trackedEntityId,
        companyId: args.companyId,
        userId: args.userId
      });
    }
  }

  const totalQuantity = args.children.reduce(
    (sum, child) => sum + toNumber(child.quantity),
    0
  );
  await client.query(
    `
      UPDATE "jobMaterial"
      SET "quantityIssued" = GREATEST(0, COALESCE("quantityIssued", 0) - $1),
          "updatedAt" = NOW(),
          "updatedBy" = $2
      WHERE id = $3 AND "companyId" = $4
    `,
    [totalQuantity, args.userId, jobMaterial.id, args.companyId]
  );

  return { success: true };
}

async function issueScrapTrackedEntity(
  client: PoolClient,
  args: Extract<IssueArgs, { type: "scrapTrackedEntity" }>
) {
  const trackedEntity = await getTrackedEntityForUpdate(client, {
    trackedEntityId: args.trackedEntityId,
    companyId: args.companyId
  });
  const jobMaterial = await queryOneRequired<Row>(
    client,
    `SELECT * FROM "jobMaterial" WHERE id = $1 AND "companyId" = $2`,
    [args.materialId, args.companyId],
    "Job material not found"
  );
  const job = await queryOneRequired<Row>(
    client,
    `
      SELECT id, "locationId"
      FROM "job"
      WHERE id = $1 AND "companyId" = $2
    `,
    [jobMaterial.jobId, args.companyId],
    "Job not found"
  );
  const item = await queryOneRequired<Row>(
    client,
    `
      SELECT "readableIdWithRevision"
      FROM "item"
      WHERE id = $1 AND "companyId" = $2
    `,
    [jobMaterial.itemId, args.companyId],
    "Item not found"
  );
  const quantity = toNumber(trackedEntity.quantity);
  const sourceLedger = await getLatestTrackedEntityLedger(client, {
    trackedEntityId: args.trackedEntityId,
    companyId: args.companyId
  });
  const activityId = nanoid();

  await insertTrackedActivity(client, {
    id: activityId,
    type: "Consume",
    sourceDocument: "Job Material",
    sourceDocumentId: args.materialId,
    sourceDocumentReadableId: item.readableIdWithRevision ?? "",
    attributes: {
      Job: job.id,
      "Job Make Method": jobMaterial.jobMakeMethodId,
      "Job Material": jobMaterial.id,
      Employee: args.userId,
      Scrapped: true
    },
    companyId: args.companyId,
    userId: args.userId
  });
  await insertTrackedActivityInput(client, {
    trackedActivityId: activityId,
    trackedEntityId: args.trackedEntityId,
    quantity,
    companyId: args.companyId,
    userId: args.userId
  });

  if (args.parentTrackedEntityId) {
    await insertTrackedActivityOutput(client, {
      trackedActivityId: activityId,
      trackedEntityId: args.parentTrackedEntityId,
      quantity,
      companyId: args.companyId,
      userId: args.userId
    });
  }

  await client.query(
    `
      UPDATE "trackedEntity"
      SET status = 'Consumed'
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.trackedEntityId, args.companyId]
  );

  if (jobMaterial.methodType !== "Make to Order") {
    await insertItemLedgerRow(client, {
      entryType: "Consumption",
      documentType: "Job Consumption",
      documentId: job.id,
      documentLineId: jobMaterial.id,
      itemId: trackedEntity.sourceDocumentId,
      quantity: -quantity,
      locationId: job.locationId ?? sourceLedger?.locationId ?? null,
      storageUnitId: sourceLedger?.storageUnitId ?? null,
      trackedEntityId: args.trackedEntityId,
      companyId: args.companyId,
      userId: args.userId
    });
  }

  await client.query(
    `
      UPDATE "jobMaterial"
      SET "quantityIssued" = COALESCE("quantityIssued", 0) + $1,
          "updatedAt" = NOW(),
          "updatedBy" = $2
      WHERE id = $3 AND "companyId" = $4
    `,
    [quantity, args.userId, args.materialId, args.companyId]
  );

  return { success: true };
}

async function issueConvertEntity(
  client: PoolClient,
  args: Extract<IssueArgs, { type: "convertEntity" }>
) {
  const trackedEntity = await getTrackedEntityForUpdate(client, {
    trackedEntityId: args.trackedEntityId,
    companyId: args.companyId
  });
  if (!trackedEntity.sourceDocumentId) {
    throw new Error("Tracked entity has no source document");
  }

  const oldItem = await queryOneRequired<Row>(
    client,
    `
      SELECT *
      FROM "item"
      WHERE id = $1 AND "companyId" = $2
    `,
    [trackedEntity.sourceDocumentId, args.companyId],
    "Item not found"
  );

  let newItem = await queryOne<Row>(
    client,
    `
      SELECT id, "readableId", revision, "readableIdWithRevision"
      FROM "item"
      WHERE "readableId" = $1
        AND revision = $2
        AND "companyId" = $3
      LIMIT 1
    `,
    [oldItem.readableId, args.newRevision, args.companyId]
  );

  if (!newItem) {
    const newItemId = nanoid();
    const newReadableIdWithRevision = getReadableIdWithRevision(
      oldItem.readableId,
      args.newRevision
    );

    await client.query(
      `
        INSERT INTO "item" (
          id, active, assignee, "companyId", "createdAt", "createdBy",
          "defaultMethodType", description, embedding, "itemTrackingType",
          "modelUploadId", name, notes, "readableId",
          "readableIdWithRevision", "replenishmentSystem",
          "requiresInspection", revision, "thumbnailPath", "trackingMethod",
          type, "unitOfMeasureCode"
        )
        SELECT
          $1, active, assignee, "companyId", NOW(), $2,
          "defaultMethodType", description, embedding, "itemTrackingType",
          "modelUploadId", name, notes, "readableId", $3,
          "replenishmentSystem", "requiresInspection", $4,
          "thumbnailPath", "trackingMethod", type, "unitOfMeasureCode"
        FROM "item"
        WHERE id = $5 AND "companyId" = $6
      `,
      [
        newItemId,
        args.userId,
        newReadableIdWithRevision,
        args.newRevision,
        oldItem.id,
        args.companyId
      ]
    );

    if (oldItem.type === "Part") {
      await client.query(
        `
          INSERT INTO "part" (
            id, approved, "companyId", "createdAt", "createdBy"
          )
          VALUES ($1, false, $2, NOW(), $3)
          ON CONFLICT (id) DO NOTHING
        `,
        [oldItem.readableId, args.companyId, args.userId]
      );
    }

    newItem = await queryOneRequired<Row>(
      client,
      `
        SELECT id, "readableId", revision, "readableIdWithRevision"
        FROM "item"
        WHERE id = $1 AND "companyId" = $2
      `,
      [newItemId, args.companyId],
      "Converted item not found"
    );
  }

  const oldItemCost = await queryOne<Row>(
    client,
    `
      SELECT *
      FROM "itemCost"
      WHERE "itemId" = $1 AND "companyId" = $2
      LIMIT 1
    `,
    [oldItem.id, args.companyId]
  );
  if (oldItemCost) {
    const oldQuantity = toNumber(trackedEntity.quantity);
    const newUnitCost =
      (oldQuantity * toNumber(oldItemCost.unitCost)) / args.quantity;
    const updateCost = await client.query(
      `
        UPDATE "itemCost"
        SET "unitCost" = $1,
            "costIsAdjusted" = true,
            "updatedAt" = NOW(),
            "updatedBy" = $2
        WHERE "itemId" = $3 AND "companyId" = $4
      `,
      [newUnitCost, args.userId, newItem.id, args.companyId]
    );

    if (updateCost.rowCount === 0) {
      await client.query(
        `
          INSERT INTO "itemCost" (
            "companyId", "costingMethod", "costIsAdjusted", "createdAt",
            "createdBy", "customFields", "itemId", "itemPostingGroupId",
            "standardCost", tags, "unitCost", "updatedAt", "updatedBy"
          )
          VALUES (
            $1, $2::"itemCostingMethod", true, NOW(), $3, $4, $5, $6,
            $7, $8, $9, NOW(), $3
          )
        `,
        [
          args.companyId,
          oldItemCost.costingMethod ?? "Standard",
          args.userId,
          JSON.stringify(oldItemCost.customFields ?? {}),
          newItem.id,
          oldItemCost.itemPostingGroupId ?? null,
          toNumber(oldItemCost.standardCost),
          oldItemCost.tags ?? [],
          newUnitCost
        ]
      );
    }
  }

  const activityId = nanoid();
  await insertTrackedActivity(client, {
    id: activityId,
    type: "Convert",
    sourceDocument: "Revision Conversion",
    sourceDocumentId: args.trackedEntityId,
    sourceDocumentReadableId: newItem.readableIdWithRevision ?? "",
    attributes: {
      "Old Revision": oldItem.revision,
      "New Revision": args.newRevision,
      "Old Item ID": oldItem.id,
      "New Item ID": newItem.id
    },
    companyId: args.companyId,
    userId: args.userId
  });
  await insertTrackedActivityInput(client, {
    trackedActivityId: activityId,
    trackedEntityId: args.trackedEntityId,
    quantity: toNumber(trackedEntity.quantity),
    companyId: args.companyId,
    userId: args.userId
  });

  await client.query(
    `
      UPDATE "trackedEntity"
      SET "sourceDocumentId" = $1,
          "sourceDocumentReadableId" = $2,
          quantity = $3,
          "itemId" = $1
      WHERE id = $4 AND "companyId" = $5
    `,
    [
      newItem.id,
      newItem.readableIdWithRevision ?? newItem.readableId,
      args.quantity,
      args.trackedEntityId,
      args.companyId
    ]
  );
  await insertTrackedActivityOutput(client, {
    trackedActivityId: activityId,
    trackedEntityId: args.trackedEntityId,
    quantity: args.quantity,
    companyId: args.companyId,
    userId: args.userId
  });

  const sourceLedger = await getLatestTrackedEntityLedger(client, {
    trackedEntityId: args.trackedEntityId,
    companyId: args.companyId
  });
  await insertItemLedgerRow(client, {
    entryType: "Negative Adjmt.",
    documentType: "Batch Split",
    documentId: activityId,
    documentLineId: null,
    itemId: oldItem.id,
    quantity: -toNumber(trackedEntity.quantity),
    locationId: sourceLedger?.locationId ?? null,
    storageUnitId: sourceLedger?.storageUnitId ?? null,
    trackedEntityId: args.trackedEntityId,
    companyId: args.companyId,
    userId: args.userId
  });
  await insertItemLedgerRow(client, {
    entryType: "Positive Adjmt.",
    documentType: "Batch Split",
    documentId: activityId,
    documentLineId: null,
    itemId: newItem.id,
    quantity: args.quantity,
    locationId: sourceLedger?.locationId ?? null,
    storageUnitId: sourceLedger?.storageUnitId ?? null,
    trackedEntityId: args.trackedEntityId,
    companyId: args.companyId,
    userId: args.userId
  });

  return {
    success: true,
    message: "Entity converted successfully",
    convertedEntity: {
      trackedEntityId: args.trackedEntityId,
      readableId: newItem.readableIdWithRevision ?? newItem.readableId,
      quantity: args.quantity
    }
  };
}

async function issueJobOperationBatchComplete(
  client: PoolClient,
  args: Extract<IssueArgs, { type: "jobOperationBatchComplete" }>
) {
  if (!args.trackedEntityId) throw new Error("Tracked entity is required");

  const jobOperation = await queryOneRequired<Row>(
    client,
    `
      SELECT *
      FROM "jobOperation"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.jobOperationId, args.companyId],
    "Job operation not found"
  );
  if (!jobOperation.jobMakeMethodId) throw new Error("Job operation not found");

  const previousProductionQuantity = await getPreviousProductionQuantity(
    client,
    args.jobOperationId,
    args.companyId
  );

  await insertProductionQuantity(client, args);

  const trackedEntity = await getTrackedEntityForUpdate(client, {
    trackedEntityId: args.trackedEntityId,
    companyId: args.companyId
  });

  if (trackedEntity.status !== "Consumed") {
    const activityId = nanoid();
    await insertTrackedActivity(client, {
      id: activityId,
      type: "Produce",
      sourceDocument: "Job Operation",
      sourceDocumentId: args.jobOperationId,
      sourceDocumentReadableId: args.jobOperationId,
      attributes: {
        "Job Operation": args.jobOperationId,
        Employee: args.userId,
        Quantity: args.quantity
      },
      companyId: args.companyId,
      userId: args.userId
    });
    await insertTrackedActivityOutput(client, {
      trackedActivityId: activityId,
      trackedEntityId: args.trackedEntityId,
      quantity: args.quantity,
      companyId: args.companyId,
      userId: args.userId
    });

    await client.query(
      `
        UPDATE "trackedEntity"
        SET status = 'Available',
            quantity = $1
        WHERE id = $2 AND "companyId" = $3
      `,
      [
        previousProductionQuantity + args.quantity,
        args.trackedEntityId,
        args.companyId
      ]
    );
  }

  await issueJobOperationMaterials(client, {
    type: "jobOperation",
    id: args.jobOperationId,
    quantity: args.quantity,
    companyId: args.companyId,
    userId: args.userId
  });

  return { success: true };
}

async function issueJobOperationSerialComplete(
  client: PoolClient,
  args: Extract<IssueArgs, { type: "jobOperationSerialComplete" }>
) {
  if (!args.trackedEntityId) throw new Error("Tracked entity is required");

  const jobOperation = await queryOneRequired<Row>(
    client,
    `
      SELECT *
      FROM "jobOperation"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.jobOperationId, args.companyId],
    "Job operation not found"
  );
  if (!jobOperation.jobMakeMethodId) throw new Error("Job operation not found");

  const trackedEntities = await queryMany<Row>(
    client,
    `
      SELECT *
      FROM "trackedEntity"
      WHERE attributes->>'Job Make Method' = $1
        AND "companyId" = $2
      ORDER BY "createdAt" ASC
    `,
    [jobOperation.jobMakeMethodId, args.companyId]
  );
  if (trackedEntities.length === 0) {
    throw new Error("Tracked entities not found");
  }

  const operationAttribute = `Operation ${args.jobOperationId}`;
  const relatedTrackedEntities = trackedEntities.filter((entity) =>
    Object.prototype.hasOwnProperty.call(
      entity.attributes ?? {},
      operationAttribute
    )
  );

  await insertProductionQuantity(client, args);

  const trackedEntity = await getTrackedEntityForUpdate(client, {
    trackedEntityId: args.trackedEntityId,
    companyId: args.companyId
  });

  if (trackedEntity.status !== "Consumed") {
    await client.query(
      `
        UPDATE "trackedEntity"
        SET status = 'Available',
            quantity = 1,
            attributes = $1
        WHERE id = $2 AND "companyId" = $3
      `,
      [
        JSON.stringify({
          ...(trackedEntity.attributes ?? {}),
          [operationAttribute]: relatedTrackedEntities.length + 1
        }),
        args.trackedEntityId,
        args.companyId
      ]
    );
  }

  let newTrackedEntityId: string | undefined;
  const operationQuantity = toNumber(jobOperation.operationQuantity);
  if (trackedEntities.length < operationQuantity) {
    newTrackedEntityId = nanoid();
    await insertTrackedEntity(client, {
      id: newTrackedEntityId,
      sourceDocumentId: trackedEntity.sourceDocumentId,
      sourceDocument: trackedEntity.sourceDocument,
      sourceDocumentReadableId: trackedEntity.sourceDocumentReadableId,
      quantity: 1,
      status: "Reserved",
      attributes: trackedEntity.attributes ?? {},
      itemId: trackedEntity.itemId ?? null,
      expirationDate: trackedEntity.expirationDate,
      companyId: args.companyId,
      userId: args.userId
    });
  }

  await issueJobOperationMaterials(client, {
    type: "jobOperation",
    id: args.jobOperationId,
    quantity: args.quantity,
    companyId: args.companyId,
    userId: args.userId
  });

  return { success: true, newTrackedEntityId };
}

async function issueJobCompleteMakeToOrder(
  client: PoolClient,
  args: Extract<IssueArgs, { type: "jobCompleteMakeToOrder" }>
) {
  await client.query(
    `SELECT complete_job_to_inventory($1, $2, NULL::text, NULL::text, $3, $4)`,
    [args.jobId, args.quantityComplete, args.companyId, args.userId]
  );
  return { success: true };
}

async function issueMaintenanceDispatchInventory(
  client: PoolClient,
  args: Extract<IssueArgs, { type: "maintenanceDispatchInventory" }>
) {
  const dispatch = await queryOneRequired<Row>(
    client,
    `
      SELECT id, "maintenanceDispatchId", "locationId"
      FROM "maintenanceDispatch"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.maintenanceDispatchId, args.companyId],
    "Maintenance dispatch not found"
  );
  const item = await queryOneRequired<Row>(
    client,
    `SELECT id, "itemTrackingType" FROM "item" WHERE id = $1 AND "companyId" = $2`,
    [args.itemId, args.companyId],
    "Item not found"
  );
  const dispatchItemId = nanoid();

  await client.query(
    `
      INSERT INTO "maintenanceDispatchItem" (
        id, "maintenanceDispatchId", "itemId", "unitOfMeasureCode", quantity,
        "companyId", "createdAt", "createdBy"
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
    `,
    [
      dispatchItemId,
      args.maintenanceDispatchId,
      args.itemId,
      args.unitOfMeasureCode,
      args.quantity,
      args.companyId,
      args.userId
    ]
  );

  if (item.itemTrackingType !== "Serial" && item.itemTrackingType !== "Batch") {
    const storageUnitId = dispatch.locationId
      ? await getStorageUnitWithHighestQuantity(
          client,
          args.itemId,
          dispatch.locationId,
          args.companyId
        )
      : null;
    await insertItemLedgerEntry(client, {
      entryType: "Consumption",
      documentType: "Maintenance Consumption",
      documentId: dispatch.id,
      itemId: args.itemId,
      quantity: -args.quantity,
      locationId: dispatch.locationId,
      storageUnitId,
      trackedEntityId: null,
      trackedEntityStatus: null,
      companyId: args.companyId,
      userId: args.userId
    });
  }

  return {
    success: true,
    message: "Material issued successfully",
    maintenanceDispatchItemId: dispatchItemId
  };
}

async function issueMaintenanceDispatchTrackedEntities(
  client: PoolClient,
  args: Extract<IssueArgs, { type: "maintenanceDispatchTrackedEntities" }>
) {
  if (args.children.length === 0) {
    throw new Error("At least one tracked entity is required");
  }

  const dispatch = await queryOneRequired<Row>(
    client,
    `
      SELECT id, "maintenanceDispatchId", "locationId"
      FROM "maintenanceDispatch"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.maintenanceDispatchId, args.companyId],
    "Maintenance dispatch not found"
  );
  const item = await queryOneRequired<Row>(
    client,
    `
      SELECT id, "readableIdWithRevision"
      FROM "item"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.itemId, args.companyId],
    "Item not found"
  );
  const totalQuantity = args.children.reduce(
    (sum, child) => sum + toNumber(child.quantity),
    0
  );
  const dispatchItemId = nanoid();

  await client.query(
    `
      INSERT INTO "maintenanceDispatchItem" (
        id, "maintenanceDispatchId", "itemId", "unitOfMeasureCode", quantity,
        "companyId", "createdAt", "createdBy"
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
    `,
    [
      dispatchItemId,
      args.maintenanceDispatchId,
      args.itemId,
      args.unitOfMeasureCode,
      totalQuantity,
      args.companyId,
      args.userId
    ]
  );

  const consumeActivityId = nanoid();
  await insertTrackedActivity(client, {
    id: consumeActivityId,
    type: "Consume",
    sourceDocument: "Maintenance Dispatch Item",
    sourceDocumentId: dispatchItemId,
    sourceDocumentReadableId: item.readableIdWithRevision ?? "",
    attributes: {
      "Maintenance Dispatch": dispatch.maintenanceDispatchId,
      "Maintenance Dispatch Item": dispatchItemId,
      Employee: args.userId
    },
    companyId: args.companyId,
    userId: args.userId
  });

  const splitEntities: Array<{
    originalId: string;
    newId: string;
    readableId: string;
    quantity: number;
  }> = [];

  for (const child of args.children) {
    const trackedEntity = await getTrackedEntityForUpdate(client, {
      trackedEntityId: child.trackedEntityId,
      companyId: args.companyId
    });
    const quantity = toNumber(child.quantity);
    const entityQuantity = toNumber(trackedEntity.quantity);

    if (trackedEntity.status !== "Available") {
      throw new Error("Tracked entity is not available");
    }
    if (quantity <= 0 || quantity > entityQuantity) {
      throw new Error("Invalid tracked entity quantity");
    }

    const sourceLedger = await getLatestTrackedEntityLedger(client, {
      trackedEntityId: trackedEntity.id,
      companyId: args.companyId
    });

    if (entityQuantity !== quantity) {
      const remainingQuantity = entityQuantity - quantity;
      const newTrackedEntityId = nanoid();
      const splitActivityId = nanoid();

      splitEntities.push({
        originalId: trackedEntity.id,
        newId: newTrackedEntityId,
        readableId: trackedEntity.sourceDocumentReadableId ?? "",
        quantity: remainingQuantity
      });

      await insertTrackedActivity(client, {
        id: splitActivityId,
        type: "Split",
        sourceDocument: "Maintenance Dispatch Item",
        sourceDocumentId: dispatchItemId,
        sourceDocumentReadableId: item.readableIdWithRevision ?? "",
        attributes: {
          "Original Quantity": entityQuantity,
          "Consumed Quantity": quantity,
          "Remaining Quantity": remainingQuantity,
          "Split Entity ID": newTrackedEntityId
        },
        companyId: args.companyId,
        userId: args.userId
      });
      await insertTrackedActivityInput(client, {
        trackedActivityId: splitActivityId,
        trackedEntityId: trackedEntity.id,
        quantity: entityQuantity,
        companyId: args.companyId,
        userId: args.userId
      });
      await insertTrackedEntity(client, {
        id: newTrackedEntityId,
        sourceDocumentId: trackedEntity.sourceDocumentId,
        sourceDocument: "Item",
        sourceDocumentReadableId: trackedEntity.sourceDocumentReadableId,
        quantity: remainingQuantity,
        status: "Available",
        attributes: trackedEntity.attributes ?? {},
        itemId: trackedEntity.itemId ?? trackedEntity.sourceDocumentId,
        expirationDate: trackedEntity.expirationDate,
        companyId: args.companyId,
        userId: args.userId
      });
      await client.query(
        `
          UPDATE "trackedEntity"
          SET quantity = $1,
              attributes = $2
          WHERE id = $3 AND "companyId" = $4
        `,
        [
          quantity,
          JSON.stringify({
            ...(trackedEntity.attributes ?? {}),
            "Split Entity ID": newTrackedEntityId
          }),
          trackedEntity.id,
          args.companyId
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
        trackedEntityId: trackedEntity.id,
        quantity,
        companyId: args.companyId,
        userId: args.userId
      });

      await insertItemLedgerRow(client, {
        entryType: "Negative Adjmt.",
        documentType: "Batch Split",
        documentId: splitActivityId,
        documentLineId: null,
        itemId: trackedEntity.sourceDocumentId,
        quantity: -entityQuantity,
        locationId: dispatch.locationId,
        storageUnitId: sourceLedger?.storageUnitId ?? null,
        trackedEntityId: trackedEntity.id,
        companyId: args.companyId,
        userId: args.userId
      });
      await insertItemLedgerRow(client, {
        entryType: "Positive Adjmt.",
        documentType: "Batch Split",
        documentId: splitActivityId,
        documentLineId: null,
        itemId: trackedEntity.sourceDocumentId,
        quantity,
        locationId: dispatch.locationId,
        storageUnitId: sourceLedger?.storageUnitId ?? null,
        trackedEntityId: trackedEntity.id,
        companyId: args.companyId,
        userId: args.userId
      });
      await insertItemLedgerRow(client, {
        entryType: "Positive Adjmt.",
        documentType: "Batch Split",
        documentId: splitActivityId,
        documentLineId: null,
        itemId: trackedEntity.sourceDocumentId,
        quantity: remainingQuantity,
        locationId: dispatch.locationId,
        storageUnitId: sourceLedger?.storageUnitId ?? null,
        trackedEntityId: newTrackedEntityId,
        companyId: args.companyId,
        userId: args.userId
      });
    }

    await client.query(
      `
        UPDATE "trackedEntity"
        SET status = 'Consumed'
        WHERE id = $1 AND "companyId" = $2
      `,
      [trackedEntity.id, args.companyId]
    );
    await insertTrackedActivityInput(client, {
      trackedActivityId: consumeActivityId,
      trackedEntityId: trackedEntity.id,
      quantity,
      companyId: args.companyId,
      userId: args.userId
    });
    await insertMaintenanceDispatchTrackedEntity(client, {
      maintenanceDispatchItemId: dispatchItemId,
      trackedEntityId: trackedEntity.id,
      quantity,
      companyId: args.companyId,
      userId: args.userId
    });
    await insertItemLedgerRow(client, {
      entryType: "Consumption",
      documentType: "Maintenance Consumption",
      documentId: dispatch.id,
      documentLineId: dispatchItemId,
      itemId: trackedEntity.sourceDocumentId,
      quantity: -quantity,
      locationId: dispatch.locationId,
      storageUnitId: sourceLedger?.storageUnitId ?? null,
      trackedEntityId: trackedEntity.id,
      companyId: args.companyId,
      userId: args.userId
    });
  }

  return {
    success: true,
    message: "Material issued successfully",
    maintenanceDispatchItemId: dispatchItemId,
    splitEntities
  };
}

async function issueMaintenanceDispatchUnconsume(
  client: PoolClient,
  args: Extract<IssueArgs, { type: "maintenanceDispatchUnconsume" }>
) {
  await unconsumeMaintenanceDispatchTrackedEntities(client, {
    maintenanceDispatchItemId: args.maintenanceDispatchItemId,
    children: args.children,
    companyId: args.companyId,
    userId: args.userId
  });

  return {
    success: true,
    message: "Material unconsumed successfully"
  };
}

async function issueMaintenanceDispatchUnissue(
  client: PoolClient,
  args: Extract<IssueArgs, { type: "maintenanceDispatchUnissue" }>
) {
  const dispatchItem = await queryOneRequired<Row>(
    client,
    `
      SELECT *
      FROM "maintenanceDispatchItem"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.maintenanceDispatchItemId, args.companyId],
    "Maintenance dispatch item not found"
  );
  const trackedEntityCount = await queryOne<{ count: string }>(
    client,
    `
      SELECT count(*) AS count
      FROM "maintenanceDispatchItemTrackedEntity"
      WHERE "maintenanceDispatchItemId" = $1 AND "companyId" = $2
    `,
    [args.maintenanceDispatchItemId, args.companyId]
  );
  if (Number(trackedEntityCount?.count ?? 0) > 0) {
    const trackedEntities = await queryMany<{
      trackedEntityId: string;
      quantity: number | string;
    }>(
      client,
      `
        SELECT "trackedEntityId", quantity
        FROM "maintenanceDispatchItemTrackedEntity"
        WHERE "maintenanceDispatchItemId" = $1 AND "companyId" = $2
      `,
      [args.maintenanceDispatchItemId, args.companyId]
    );
    await unconsumeMaintenanceDispatchTrackedEntities(client, {
      maintenanceDispatchItemId: args.maintenanceDispatchItemId,
      children: trackedEntities.map((entity) => ({
        trackedEntityId: entity.trackedEntityId,
        quantity: toNumber(entity.quantity)
      })),
      companyId: args.companyId,
      userId: args.userId
    });
    await client.query(
      `
        DELETE FROM "maintenanceDispatchItem"
        WHERE id = $1 AND "companyId" = $2
      `,
      [args.maintenanceDispatchItemId, args.companyId]
    );
    return {
      success: true,
      message: "Item unissued and removed successfully"
    };
  }

  const dispatch = await queryOneRequired<Row>(
    client,
    `
      SELECT id, "locationId"
      FROM "maintenanceDispatch"
      WHERE id = $1 AND "companyId" = $2
    `,
    [dispatchItem.maintenanceDispatchId, args.companyId],
    "Maintenance dispatch not found"
  );
  const item = await queryOneRequired<Row>(
    client,
    `SELECT id, "itemTrackingType" FROM "item" WHERE id = $1 AND "companyId" = $2`,
    [dispatchItem.itemId, args.companyId],
    "Item not found"
  );

  if (item.itemTrackingType !== "Serial" && item.itemTrackingType !== "Batch") {
    const originalLedger = await queryOne<Row>(
      client,
      `
        SELECT "storageUnitId"
        FROM "itemLedger"
        WHERE "documentLineId" = $1
          AND "documentType" #>> '{}' = 'Maintenance Consumption'
          AND "companyId" = $2
        ORDER BY "createdAt" DESC
      `,
      [args.maintenanceDispatchItemId, args.companyId]
    );

    await insertItemLedgerEntry(client, {
      entryType: "Consumption",
      documentType: "Maintenance Consumption",
      documentId: dispatch.id,
      itemId: dispatchItem.itemId,
      quantity: toNumber(dispatchItem.quantity),
      locationId: dispatch.locationId,
      storageUnitId: originalLedger?.storageUnitId ?? null,
      trackedEntityId: null,
      trackedEntityStatus: null,
      companyId: args.companyId,
      userId: args.userId
    });
  }

  await client.query(
    `
      DELETE FROM "maintenanceDispatchItem"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.maintenanceDispatchItemId, args.companyId]
  );

  return {
    success: true,
    message: "Item unissued and removed successfully"
  };
}

async function unconsumeMaintenanceDispatchTrackedEntities(
  client: PoolClient,
  args: {
    maintenanceDispatchItemId: string;
    children: Array<{ trackedEntityId: string; quantity: number }>;
    companyId: string;
    userId: string;
  }
) {
  if (args.children.length === 0) {
    throw new Error("At least one tracked entity is required");
  }

  const dispatchItem = await queryOneRequired<Row>(
    client,
    `
      SELECT *
      FROM "maintenanceDispatchItem"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.maintenanceDispatchItemId, args.companyId],
    "Maintenance dispatch item not found"
  );
  const dispatch = await queryOneRequired<Row>(
    client,
    `
      SELECT id, "maintenanceDispatchId", "locationId"
      FROM "maintenanceDispatch"
      WHERE id = $1 AND "companyId" = $2
    `,
    [dispatchItem.maintenanceDispatchId, args.companyId],
    "Maintenance dispatch not found"
  );
  const item = await queryOneRequired<Row>(
    client,
    `
      SELECT id, "readableIdWithRevision"
      FROM "item"
      WHERE id = $1 AND "companyId" = $2
    `,
    [dispatchItem.itemId, args.companyId],
    "Item not found"
  );
  const activityId = nanoid();

  await insertTrackedActivity(client, {
    id: activityId,
    type: "Unconsume",
    sourceDocument: "Maintenance Dispatch Item",
    sourceDocumentId: args.maintenanceDispatchItemId,
    sourceDocumentReadableId: item.readableIdWithRevision ?? "",
    attributes: {
      "Maintenance Dispatch": dispatch.maintenanceDispatchId,
      "Maintenance Dispatch Item": args.maintenanceDispatchItemId,
      Employee: args.userId
    },
    companyId: args.companyId,
    userId: args.userId
  });

  for (const child of args.children) {
    const trackedEntity = await getTrackedEntityForUpdate(client, {
      trackedEntityId: child.trackedEntityId,
      companyId: args.companyId
    });
    const quantity = toNumber(child.quantity);

    if (trackedEntity.status !== "Consumed") {
      throw new Error("Tracked entity is not in consumed status");
    }

    const sourceLedger = await getLatestTrackedEntityLedger(client, {
      trackedEntityId: child.trackedEntityId,
      companyId: args.companyId
    });

    await client.query(
      `
        UPDATE "trackedEntity"
        SET status = 'Available'
        WHERE id = $1 AND "companyId" = $2
      `,
      [child.trackedEntityId, args.companyId]
    );
    await insertTrackedActivityOutput(client, {
      trackedActivityId: activityId,
      trackedEntityId: child.trackedEntityId,
      quantity,
      companyId: args.companyId,
      userId: args.userId
    });
    await client.query(
      `
        DELETE FROM "maintenanceDispatchItemTrackedEntity"
        WHERE "maintenanceDispatchItemId" = $1
          AND "trackedEntityId" = $2
          AND "companyId" = $3
      `,
      [
        args.maintenanceDispatchItemId,
        child.trackedEntityId,
        args.companyId
      ]
    );
    await insertItemLedgerRow(client, {
      entryType: "Consumption",
      documentType: "Maintenance Consumption",
      documentId: dispatch.id,
      documentLineId: args.maintenanceDispatchItemId,
      itemId: trackedEntity.sourceDocumentId,
      quantity,
      locationId: dispatch.locationId,
      storageUnitId: sourceLedger?.storageUnitId ?? null,
      trackedEntityId: child.trackedEntityId,
      companyId: args.companyId,
      userId: args.userId
    });
  }

  const totalQuantity = args.children.reduce(
    (sum, child) => sum + toNumber(child.quantity),
    0
  );
  await client.query(
    `
      UPDATE "maintenanceDispatchItem"
      SET quantity = GREATEST(0, quantity - $1),
          "updatedAt" = NOW(),
          "updatedBy" = $2
      WHERE id = $3 AND "companyId" = $4
    `,
    [
      totalQuantity,
      args.userId,
      args.maintenanceDispatchItemId,
      args.companyId
    ]
  );
}

async function createTrackedJobMaterialForOperation(
  client: PoolClient,
  args: {
    jobOperationId?: string;
    itemId?: string;
    children: Array<{ quantity: number }>;
    companyId: string;
    userId: string;
  }
) {
  if (!args.jobOperationId || !args.itemId) {
    throw new Error("Either materialId or both jobOperationId and itemId must be provided");
  }

  const jobOperation = await queryOneRequired<Row>(
    client,
    `
      SELECT id, "jobId", "jobMakeMethodId"
      FROM "jobOperation"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.jobOperationId, args.companyId],
    "Job operation not found"
  );
  const item = await queryOneRequired<Row>(
    client,
    `
      SELECT id, name, type, "itemTrackingType", "defaultMethodType",
             "unitOfMeasureCode"
      FROM "item"
      WHERE id = $1 AND "companyId" = $2
    `,
    [args.itemId, args.companyId],
    "Item not found"
  );
  const itemCost = await queryOne<Row>(
    client,
    `
      SELECT "unitCost"
      FROM "itemCost"
      WHERE "itemId" = $1 AND "companyId" = $2
    `,
    [args.itemId, args.companyId]
  );
  const materialId = nanoid();
  const totalQuantity = args.children.reduce(
    (sum, child) => sum + toNumber(child.quantity),
    0
  );
  const order = await getNextJobMaterialOrder(
    client,
    jobOperation.jobId,
    args.companyId
  );

  await client.query(
    `
      INSERT INTO "jobMaterial" (
        id, "jobId", "jobMakeMethodId", "jobOperationId", "itemId",
        "itemType", description, "methodType", quantity, "quantityIssued",
        "estimatedQuantity", "itemScrapPercentage", "scrapQuantity", kit,
        "requiresBatchTracking", "requiresSerialTracking", "unitCost",
        "unitOfMeasureCode", "order", "companyId", "createdAt", "createdBy"
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, 0, $9, 0, 0, 0, false, $10, $11,
        $12, $13, $14, $15, NOW(), $16
      )
    `,
    [
      materialId,
      jobOperation.jobId,
      jobOperation.jobMakeMethodId,
      args.jobOperationId,
      args.itemId,
      item.type ?? "Part",
      item.name ?? "",
      item.defaultMethodType ?? "Pull from Inventory",
      totalQuantity,
      item.itemTrackingType === "Batch",
      item.itemTrackingType === "Serial",
      toNumber(itemCost?.unitCost, 0),
      item.unitOfMeasureCode ?? "EA",
      order,
      args.companyId,
      args.userId
    ]
  );

  return queryOneRequired<Row>(
    client,
    `SELECT * FROM "jobMaterial" WHERE id = $1 AND "companyId" = $2`,
    [materialId, args.companyId],
    "Job material not found"
  );
}

async function getPickMethodDefaultStorageUnit(
  client: PoolClient,
  itemId: string,
  locationId: string,
  companyId: string
) {
  const row = await queryOne<{ defaultStorageUnitId: string | null }>(
    client,
    `
      SELECT "defaultStorageUnitId"
      FROM "pickMethod"
      WHERE "itemId" = $1 AND "locationId" = $2 AND "companyId" = $3
    `,
    [itemId, locationId, companyId]
  );
  return row?.defaultStorageUnitId ?? null;
}

async function getStorageUnitWithHighestQuantity(
  client: PoolClient,
  itemId: string,
  locationId: string,
  companyId: string
) {
  const row = await queryOne<{ storageUnitId: string | null }>(
    client,
    `
      SELECT "storageUnitId"
      FROM "itemLedger"
      WHERE "itemId" = $1
        AND "locationId" = $2
        AND "companyId" = $3
      GROUP BY "storageUnitId"
      HAVING SUM(quantity) > 0
      ORDER BY SUM(quantity) DESC NULLS LAST
      LIMIT 1
    `,
    [itemId, locationId, companyId]
  );
  return row?.storageUnitId ?? null;
}

async function updatePickMethodDefaultStorageUnitIfNeeded(
  client: PoolClient,
  args: {
    itemId: string;
    locationId: string | null;
    storageUnitId: string | null;
    companyId: string;
    userId: string;
  }
) {
  if (!args.locationId || !args.storageUnitId) return;
  await client.query(
    `
      UPDATE "pickMethod"
      SET "defaultStorageUnitId" = COALESCE("defaultStorageUnitId", $1),
          "updatedAt" = NOW(),
          "updatedBy" = $2
      WHERE "itemId" = $3
        AND "locationId" = $4
        AND "companyId" = $5
    `,
    [
      args.storageUnitId,
      args.userId,
      args.itemId,
      args.locationId,
      args.companyId
    ]
  );
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

async function insertItemLedgerRow(
  client: PoolClient,
  args: {
    entryType: string;
    documentType: string;
    documentId: string | null;
    documentLineId: string | null;
    companyId: string;
    itemId: string;
    quantity: number;
    locationId: string | null;
    storageUnitId: string | null;
    trackedEntityId: string | null;
    userId: string;
  }
) {
  await client.query(
    `
      INSERT INTO "itemLedger" (
        id, "entryNumber", "entryType", "documentType", "documentId",
        "documentLineId", "companyId", "itemId", quantity, "locationId",
        "storageUnitId", "trackedEntityId", "postingDate", "createdAt",
        "createdBy"
      )
      VALUES (
        $1, next_item_ledger_entry_number($2), $3::"itemLedgerType",
        to_jsonb($4::text), $5, $6, $2, $7, $8, $9, $10, $11,
        CURRENT_DATE, NOW(), $12
      )
    `,
    [
      nanoid(),
      args.companyId,
      args.entryType,
      args.documentType,
      args.documentId,
      args.documentLineId,
      args.itemId,
      args.quantity,
      args.locationId,
      args.storageUnitId,
      args.trackedEntityId,
      args.userId
    ]
  );
  await updatePickMethodDefaultStorageUnitIfNeeded(client, {
    itemId: args.itemId,
    locationId: args.locationId,
    storageUnitId: args.storageUnitId,
    companyId: args.companyId,
    userId: args.userId
  });
}

async function insertTrackedActivity(
  client: PoolClient,
  args: {
    id: string;
    type: string;
    sourceDocument: string;
    sourceDocumentId: string;
    sourceDocumentReadableId: string;
    attributes: Record<string, unknown>;
    companyId: string;
    userId: string;
  }
) {
  await client.query(
    `
      INSERT INTO "trackedActivity" (
        id, type, "sourceDocument", "sourceDocumentId",
        "sourceDocumentReadableId", attributes, "companyId", "createdAt",
        "createdBy"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
    `,
    [
      args.id,
      args.type,
      args.sourceDocument,
      args.sourceDocumentId,
      args.sourceDocumentReadableId,
      JSON.stringify(args.attributes),
      args.companyId,
      args.userId
    ]
  );
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
    `
      INSERT INTO "trackedActivityInput" (
        "trackedActivityId", "trackedEntityId", quantity, "companyId",
        "createdAt", "createdBy"
      )
      VALUES ($1, $2, $3, $4, NOW(), $5)
    `,
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
    `
      INSERT INTO "trackedActivityOutput" (
        "trackedActivityId", "trackedEntityId", quantity, "companyId",
        "createdAt", "createdBy"
      )
      VALUES ($1, $2, $3, $4, NOW(), $5)
    `,
    [
      args.trackedActivityId,
      args.trackedEntityId,
      args.quantity,
      args.companyId,
      args.userId
    ]
  );
}

async function insertTrackedEntity(
  client: PoolClient,
  args: {
    id: string;
    sourceDocumentId: string;
    sourceDocument: string;
    sourceDocumentReadableId: string | null;
    quantity: number;
    status: string;
    attributes: Record<string, unknown>;
    itemId: string | null;
    expirationDate: string | null;
    companyId: string;
    userId: string;
  }
) {
  await client.query(
    `
      INSERT INTO "trackedEntity" (
        id, "sourceDocumentId", "sourceDocument", "sourceDocumentReadableId",
        quantity, status, attributes, "itemId", "expirationDate", "companyId",
        "createdAt", "createdBy"
      )
      VALUES ($1, $2, $3, $4, $5, $6::"trackedEntityStatus", $7, $8, $9, $10, NOW(), $11)
    `,
    [
      args.id,
      args.sourceDocumentId,
      args.sourceDocument,
      args.sourceDocumentReadableId,
      args.quantity,
      args.status,
      JSON.stringify(args.attributes),
      args.itemId,
      args.expirationDate,
      args.companyId,
      args.userId
    ]
  );
}

async function insertProductionQuantity(
  client: PoolClient,
  args:
    | Extract<IssueArgs, { type: "jobOperationBatchComplete" }>
    | Extract<IssueArgs, { type: "jobOperationSerialComplete" }>
) {
  await client.query(
    `
      INSERT INTO "productionQuantity" (
        id, "jobOperationId", type, quantity, "setupProductionEventId",
        "laborProductionEventId", "machineProductionEventId", notes,
        "companyId", "createdAt", "createdBy"
      )
      VALUES (
        $1, $2, 'Production', $3, $4, $5, $6, $7, $8, NOW(), $9
      )
    `,
    [
      nanoid(),
      args.jobOperationId,
      args.quantity,
      args.setupProductionEventId ?? null,
      args.laborProductionEventId ?? null,
      args.machineProductionEventId ?? null,
      args.notes ?? null,
      args.companyId,
      args.userId
    ]
  );
}

async function insertMaintenanceDispatchTrackedEntity(
  client: PoolClient,
  args: {
    maintenanceDispatchItemId: string;
    trackedEntityId: string;
    quantity: number;
    companyId: string;
    userId: string;
  }
) {
  await client.query(
    `
      INSERT INTO "maintenanceDispatchItemTrackedEntity" (
        id, "maintenanceDispatchItemId", "trackedEntityId", quantity,
        "companyId", "createdAt", "createdBy"
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), $6)
    `,
    [
      nanoid(),
      args.maintenanceDispatchItemId,
      args.trackedEntityId,
      args.quantity,
      args.companyId,
      args.userId
    ]
  );
}

async function getTrackedEntityForUpdate(
  client: PoolClient,
  args: { trackedEntityId: string; companyId: string }
) {
  return queryOneRequired<Row>(
    client,
    `
      SELECT *
      FROM "trackedEntity"
      WHERE id = $1 AND "companyId" = $2
      FOR UPDATE
    `,
    [args.trackedEntityId, args.companyId],
    "Tracked entity not found"
  );
}

async function getLatestTrackedEntityLedger(
  client: PoolClient,
  args: { trackedEntityId: string; companyId: string }
) {
  return queryOne<Row>(
    client,
    `
      SELECT *
      FROM "itemLedger"
      WHERE "trackedEntityId" = $1 AND "companyId" = $2
      ORDER BY "createdAt" DESC, "entryNumber" DESC
      LIMIT 1
    `,
    [args.trackedEntityId, args.companyId]
  );
}

async function getNextJobMaterialOrder(
  client: PoolClient,
  jobId: string,
  companyId: string
) {
  const row = await queryOne<{ nextOrder: string | number }>(
    client,
    `
      SELECT COALESCE(MAX("order"), 0) + 1 AS "nextOrder"
      FROM "jobMaterial"
      WHERE "jobId" = $1 AND "companyId" = $2
    `,
    [jobId, companyId]
  );
  return toNumber(row?.nextOrder, 1);
}

async function getPreviousProductionQuantity(
  client: PoolClient,
  jobOperationId: string,
  companyId: string
) {
  const row = await queryOne<{ quantity: string | number }>(
    client,
    `
      SELECT COALESCE(SUM(quantity), 0) AS quantity
      FROM "productionQuantity"
      WHERE "jobOperationId" = $1
        AND "companyId" = $2
        AND type = 'Production'
    `,
    [jobOperationId, companyId]
  );
  return toNumber(row?.quantity);
}

function toNumber(value: unknown, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

function getReadableIdWithRevision(readableId: string, revision?: string | null) {
  if (revision && revision !== "0") return `${readableId}.${revision}`;
  return readableId;
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
  throw new Error(`Unhandled issue type: ${JSON.stringify(value)}`);
}
