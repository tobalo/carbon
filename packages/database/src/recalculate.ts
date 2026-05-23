import type { Pool, PoolClient, QueryResultRow } from "pg";
import { getPostgresConnectionPool } from "./postgres.ts";

type RecalculateArgs =
  | {
      type: "jobRequirements";
      id: string;
      companyId: string;
      userId: string;
    }
  | {
      type: "jobMakeMethodRequirements";
      id: string;
      companyId: string;
      userId: string;
    };

type JobMakeMethodRow = {
  id: string;
  itemId: string;
  jobId: string;
  parentMaterialId: string | null;
};

type JobMaterialRow = {
  id: string;
  methodType: string;
  estimatedQuantity: string | number | null;
  quantity: string | number;
};

type JobRow = {
  id: string;
  quantity: string | number;
  productionQuantity: string | number | null;
};

type JobMethodRow = {
  jobId: string;
  methodMaterialId: string;
  jobMakeMethodId: string;
  jobMaterialMakeMethodId: string | null;
  itemId: string;
  quantity: string | number;
  methodType: string;
  parentMaterialId: string | null;
  isRoot: boolean;
};

type JobMethodTreeItem = {
  id: string;
  data: JobMethodRow;
  children: JobMethodTreeItem[];
};

let recalculatePool: Pool | null = null;

export async function recalculate(args: RecalculateArgs) {
  if (!args.id) throw new Error("Payload is missing id");
  if (!args.companyId) throw new Error("Payload is missing companyId");
  if (!args.userId) throw new Error("Payload is missing userId");

  const pool = getRecalculatePool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    switch (args.type) {
      case "jobRequirements":
        await recalculateJob(client, args.id, args.companyId);
        break;
      case "jobMakeMethodRequirements":
        await recalculateJobMakeMethod(client, args.id, args.companyId);
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

export async function closeRecalculatePool() {
  if (!recalculatePool) return;
  await recalculatePool.end();
  recalculatePool = null;
}

function getRecalculatePool() {
  recalculatePool ??= getPostgresConnectionPool(
    Number(process.env.DATABASE_SERVICE_POOL_SIZE ?? 5),
    { kind: "service" }
  );
  return recalculatePool;
}

async function recalculateJob(
  client: PoolClient,
  jobId: string,
  companyId: string
) {
  const [job, jobMakeMethod] = await Promise.all([
    queryOne<JobRow>(
      client,
      `SELECT id, quantity, "productionQuantity"
       FROM "job"
       WHERE id = $1 AND "companyId" = $2`,
      [jobId, companyId]
    ),
    queryOne<JobMakeMethodRow>(
      client,
      `SELECT id, "itemId", "jobId", "parentMaterialId"
       FROM "jobMakeMethod"
       WHERE "jobId" = $1
         AND "parentMaterialId" IS NULL
         AND "companyId" = $2`,
      [jobId, companyId]
    )
  ]);

  if (!job) throw new Error(`Job not found for id: ${jobId}`);
  if (!jobMakeMethod) {
    throw new Error(`Root job make method not found for job: ${jobId}`);
  }

  const tree = await getJobMethodTreeByMakeMethodId(
    client,
    jobMakeMethod.id,
    null
  );
  const root = tree[0];
  if (!root) throw new Error("Method tree not found");

  await updateJobQuantities(client, root, toNumber(job.quantity, 1));
}

async function recalculateJobMakeMethod(
  client: PoolClient,
  jobMakeMethodId: string,
  companyId: string
) {
  const jobMakeMethod = await queryOne<JobMakeMethodRow>(
    client,
    `SELECT id, "itemId", "jobId", "parentMaterialId"
     FROM "jobMakeMethod"
     WHERE id = $1 AND "companyId" = $2`,
    [jobMakeMethodId, companyId]
  );

  if (!jobMakeMethod) {
    throw new Error(`Job make method not found for id: ${jobMakeMethodId}`);
  }

  let parentQuantity = 1;

  if (jobMakeMethod.parentMaterialId) {
    const jobMaterial = await queryOne<JobMaterialRow>(
      client,
      `SELECT id, "methodType", "estimatedQuantity", quantity
       FROM "jobMaterial"
       WHERE id = $1 AND "companyId" = $2`,
      [jobMakeMethod.parentMaterialId, companyId]
    );

    if (!jobMaterial) {
      throw new Error(
        `Job material not found for id: ${jobMakeMethod.parentMaterialId}`
      );
    }

    if (jobMaterial.methodType !== "Make to Order") {
      return;
    }

    parentQuantity = toNumber(
      jobMaterial.estimatedQuantity ?? jobMaterial.quantity,
      1
    );
  } else {
    const job = await queryOne<JobRow>(
      client,
      `SELECT id, quantity, "productionQuantity"
       FROM "job"
       WHERE id = $1 AND "companyId" = $2`,
      [jobMakeMethod.jobId, companyId]
    );

    if (!job) throw new Error(`Job not found for id: ${jobMakeMethod.jobId}`);
    parentQuantity = toNumber(job.productionQuantity ?? 1, 1);
  }

  const tree = await getJobMethodTreeByMakeMethodId(
    client,
    jobMakeMethod.id,
    jobMakeMethod.parentMaterialId
  );
  const root = tree[0];
  if (!root) throw new Error("Method tree not found");

  await updateJobQuantities(client, root, parentQuantity);
}

async function getJobMethodTreeByMakeMethodId(
  client: PoolClient,
  makeMethodId: string,
  parentMaterialId: string | null
) {
  const rows = await queryMany<JobMethodRow>(
    client,
    `WITH RECURSIVE material AS (
       SELECT
         "jobId",
         id,
         id AS "jobMakeMethodId",
         'Make to Order'::"methodType" AS "methodType",
         id AS "jobMaterialMakeMethodId",
         "itemId",
         'Part'::text AS "itemType",
         1::numeric AS quantity,
         0::numeric AS "unitCost",
         "parentMaterialId",
         1::double precision AS "order",
         true AS "isRoot",
         false AS kit,
         version,
         NULL::text AS "storageUnitId"
       FROM "jobMakeMethod"
       WHERE id = $1
       UNION
       SELECT
         child."jobId",
         child.id,
         child."jobMakeMethodId",
         child."methodType",
         child."jobMaterialMakeMethodId",
         child."itemId",
         child."itemType",
         child.quantity,
         child."unitCost",
         parent.id AS "parentMaterialId",
         child."order",
         false AS "isRoot",
         child.kit,
         child.version,
         child."storageUnitId"
       FROM "jobMaterialWithMakeMethodId" child
       JOIN material parent
         ON parent."jobMaterialMakeMethodId" = child."jobMakeMethodId"
       WHERE parent."methodType" = 'Make to Order'
     )
     SELECT
       material."jobId",
       material.id AS "methodMaterialId",
       material."jobMakeMethodId",
       material."jobMaterialMakeMethodId",
       material."itemId",
       material.quantity,
       material."methodType",
       material."parentMaterialId",
       material."isRoot"
     FROM material
     ORDER BY material."order"`,
    [makeMethodId]
  );
  return rowsToTree(rows, parentMaterialId);
}

function rowsToTree(rows: JobMethodRow[], parentMaterialId: string | null) {
  const roots: JobMethodTreeItem[] = [];
  const lookup: Record<string, JobMethodTreeItem> = {};

  for (const row of rows) {
    const id = row.methodMaterialId;
    const parentId = row.parentMaterialId;

    lookup[id] ??= { id, data: row, children: [] };
    lookup[id].data = row;

    const item = lookup[id];
    if (parentId === parentMaterialId || parentId === undefined) {
      roots.push(item);
      continue;
    }

    if (!parentId) {
      continue;
    }

    lookup[parentId] ??= {
      id: parentId,
      data: row,
      children: []
    };
    lookup[parentId].children.push(item);
  }

  return roots;
}

async function updateJobQuantities(
  client: PoolClient,
  item: JobMethodTreeItem,
  parentEstimatedQuantity = 1
) {
  const itemQuantity = toNumber(item.data.quantity, 1);
  const targetQuantity = item.data.isRoot
    ? parentEstimatedQuantity
    : itemQuantity * parentEstimatedQuantity;

  let scrapPercentage = 0;
  if (item.data.methodType === "Make to Order") {
    const jobMaterial = await queryOne<{
      itemScrapPercentage: string | number | null;
    }>(
      client,
      `SELECT "itemScrapPercentage"
       FROM "jobMaterial"
       WHERE id = $1`,
      [item.id]
    );

    if (toNumber(jobMaterial?.itemScrapPercentage, 0) > 0) {
      scrapPercentage = toNumber(jobMaterial?.itemScrapPercentage, 0);
    } else {
      const itemReplenishment = await queryOne<{
        scrapPercentage: string | number | null;
      }>(
        client,
        `SELECT "scrapPercentage"
         FROM "itemReplenishment"
         WHERE "itemId" = $1`,
        [item.data.itemId]
      );
      scrapPercentage = toNumber(itemReplenishment?.scrapPercentage, 0);
    }
  }

  const scrapQuantity =
    item.data.methodType === "Make to Order" ? targetQuantity * scrapPercentage : 0;
  const totalWithScrap = Math.ceil(targetQuantity + scrapQuantity);
  const estimatedQuantity =
    item.data.methodType === "Make to Order" ? targetQuantity : totalWithScrap;

  await client.query(
    `UPDATE "jobMaterial"
     SET "scrapQuantity" = $1,
         "estimatedQuantity" = $2
     WHERE id = $3`,
    [scrapQuantity, estimatedQuantity, item.id]
  );

  if (item.data.jobMaterialMakeMethodId) {
    const jobMakeMethod = await queryOne<{
      trackedEntityId: string | null;
      requiresSerialTracking: boolean;
    }>(
      client,
      `SELECT "trackedEntityId", "requiresSerialTracking"
       FROM "jobMakeMethod"
       WHERE id = $1`,
      [item.data.jobMaterialMakeMethodId]
    );

    await Promise.all([
      client.query(
        `UPDATE "jobMakeMethod"
         SET "quantityPerParent" = $1
         WHERE id = $2`,
        [itemQuantity, item.data.jobMaterialMakeMethodId]
      ),
      client.query(
        `UPDATE "jobOperation"
         SET "targetQuantity" = $1,
             "operationQuantity" = $2
         WHERE "jobMakeMethodId" = $3`,
        [targetQuantity, totalWithScrap, item.data.jobMaterialMakeMethodId]
      )
    ]);

    if (jobMakeMethod?.trackedEntityId) {
      await client.query(
        `UPDATE "trackedEntity"
         SET quantity = $1
         WHERE id = $2`,
        [
          jobMakeMethod.requiresSerialTracking ? 1 : totalWithScrap,
          jobMakeMethod.trackedEntityId
        ]
      );
    }
  }

  for (const child of item.children) {
    await updateJobQuantities(client, child, totalWithScrap);
  }
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

function toNumber(value: string | number | null | undefined, fallback: number) {
  if (value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported recalculate type: ${JSON.stringify(value)}`);
}
