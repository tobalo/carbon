import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { closeSyncPool, sync } from "../src/sync.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-sync-smoke-${process.pid}`;
const database = "carbon";
const ownerUrl = (port: number) =>
  `postgresql://carbon:carbon@127.0.0.1:${port}/${database}`;
const appUrl = (port: number) =>
  `postgresql://carbon_app:carbon_app@127.0.0.1:${port}/${database}`;
const serviceUrl = (port: number) =>
  `postgresql://carbon_service:carbon_service@127.0.0.1:${port}/${database}`;

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const port = await getFreePort();
  let containerStarted = false;
  let pool: Pool | null = null;

  try {
    run("docker", [
      "run",
      "-d",
      "--name",
      containerName,
      "-e",
      "POSTGRES_USER=carbon",
      "-e",
      "POSTGRES_PASSWORD=carbon",
      "-e",
      `POSTGRES_DB=${database}`,
      "-p",
      `127.0.0.1:${port}:5432`,
      "-v",
      `${initScriptsDir}:/docker-entrypoint-initdb.d:ro`,
      image
    ]);
    containerStarted = true;

    await waitForPostgres(ownerUrl(port));
    migrate(port);

    process.env.DATABASE_MIGRATION_URL = ownerUrl(port);
    process.env.DATABASE_SERVICE_URL = serviceUrl(port);
    process.env.DATABASE_URL = appUrl(port);
    process.env.JOBS_DATABASE_URL = serviceUrl(port);

    pool = new Pool({
      connectionString: serviceUrl(port),
      max: 1
    });

    await setupSyncFixture(pool);
    const result = await sync({
      type: "onshape",
      makeMethodId: "mm_top_active",
      companyId: "co1",
      userId: "user1",
      data: [
        {
          index: "1",
          readableId: "ASM-1",
          revision: "A",
          name: "Assembly",
          quantity: 2,
          replenishmentSystem: "Make",
          defaultMethodType: "Make to Order",
          data: { source: "asm" }
        },
        {
          index: "1.1",
          readableId: "BUY-1",
          name: "Purchased",
          quantity: 3,
          replenishmentSystem: "Buy",
          defaultMethodType: "Purchase to Order",
          data: { source: "buy" }
        },
        {
          index: "2",
          id: "item_existing_make",
          readableId: "EX-MAKE",
          name: "Existing Make",
          quantity: 5,
          replenishmentSystem: "Make",
          defaultMethodType: "Make to Order",
          data: { source: "existing-make" }
        },
        {
          index: "3",
          id: "item_existing_buy",
          readableId: "EX-BUY",
          name: "Existing Buy",
          quantity: 7,
          replenishmentSystem: "Buy",
          defaultMethodType: "Pull from Inventory",
          data: { source: "existing-buy" }
        }
      ]
    });

    await verifySync(pool, result.makeMethodId);

    console.log("Sync function smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- Onshape draft make-method creation verified");
    console.log("- item/material/mapping sync and operation copying verified");
  } finally {
    await closeSyncPool();
    await pool?.end().catch(() => undefined);
    if (containerStarted) {
      try {
        run("docker", ["rm", "-f", containerName], { stdio: "ignore" });
      } catch {
        // Best-effort cleanup after a failed smoke run.
      }
    }
  }
}

function migrate(port: number) {
  run(
    "pnpm",
    ["--filter", "@carbon/database", "db:migrate"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        DATABASE_MIGRATION_URL: ownerUrl(port),
        DATABASE_URL: appUrl(port),
        DATABASE_SERVICE_URL: serviceUrl(port),
        JOBS_DATABASE_URL: serviceUrl(port)
      },
      stdio: "pipe"
    }
  );
}

function run(command: string, args: string[], options = {}) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 128,
      ...options
    });
  } catch (error) {
    const failure = error as {
      stdout?: Buffer | string;
      stderr?: Buffer | string;
    };
    const detail = [
      `Command failed: ${command} ${args.join(" ")}`,
      failure.stdout?.toString(),
      failure.stderr?.toString()
    ]
      .filter(Boolean)
      .join("\n");
    throw new Error(detail);
  }
}

async function waitForPostgres(connectionString: string) {
  const deadline = Date.now() + 60_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const pool = new Pool({ connectionString, max: 1 });
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT 1 FROM pg_roles WHERE rolname = 'carbon_service'
        ) AS "serviceRoleReady"
      `);
      await pool.end();

      if (result.rows[0]?.serviceRoleReady === true) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(500);
  }

  const detail =
    lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(
    `Timed out waiting for ${image} to initialize carbon roles.${detail}`
  );
}

function getFreePort() {
  return new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") {
          reject(new Error("Could not allocate a local TCP port"));
          return;
        }

        resolvePort(address.port);
      });
    });
  });
}

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function setupSyncFixture(db: Pool) {
  await db.query(`
    INSERT INTO "user" (
      id, email, "firstName", "lastName", "fullName", about,
      "acknowledgedITAR", "isConsoleOperator", flags, "createdAt", active
    )
    VALUES (
      'user1', 'user1@example.com', 'Test', 'User', 'Test User', '',
      false, false, '{}'::jsonb, NOW(), true
    );

    INSERT INTO "currencyCode" (code, name) VALUES ('USD', 'US Dollar');
    INSERT INTO "companyGroup" (id, name, "createdAt", "createdBy")
    VALUES ('cg1', 'Group', NOW(), 'user1');
    INSERT INTO "company" (
      id, name, active, "companyGroupId", "baseCurrencyCode", "createdAt",
      "auditLogEnabled", "isEliminationEntity", "suggestionNotificationGroup"
    )
    VALUES (
      'co1', 'Company', true, 'cg1', 'USD', NOW(), false, false, ARRAY[]::text[]
    );

    INSERT INTO "unitOfMeasure" (
      id, code, name, active, "companyId", "createdAt", "createdBy"
    )
    VALUES ('uom1', 'EA', 'Each', true, 'co1', NOW(), 'user1');
    INSERT INTO "process" (
      id, name, active, "companyId", "createdAt", "createdBy",
      "completeAllOnScan", "defaultStandardFactor", "processType"
    )
    VALUES (
      'proc1', 'Cut', true, 'co1', NOW(), 'user1',
      false, 'Hours/Piece', 'Inside'
    );

    INSERT INTO "item" (
      id, name, "readableId", "readableIdWithRevision", active, "companyId",
      "createdAt", "createdBy", embedding, "itemTrackingType",
      "replenishmentSystem", "requiresInspection", type, "unitOfMeasureCode",
      revision, "defaultMethodType"
    )
    VALUES
      ('item_top', 'Top', 'TOP', 'TOP', true, 'co1', NOW(), 'user1', '[0]', 'Inventory', 'Make', false, 'Part', 'EA', '0', 'Make to Order'),
      ('item_existing_make', 'Existing Make', 'EX-MAKE', 'EX-MAKE', true, 'co1', NOW(), 'user1', '[0]', 'Inventory', 'Make', false, 'Part', 'EA', '0', 'Make to Order'),
      ('item_existing_buy', 'Existing Buy', 'EX-BUY', 'EX-BUY', true, 'co1', NOW(), 'user1', '[0]', 'Inventory', 'Buy', false, 'Part', 'EA', '0', 'Pull from Inventory'),
      ('tool1', 'Tool', 'TOOL', 'TOOL', true, 'co1', NOW(), 'user1', '[0]', 'Inventory', 'Buy', false, 'Tool', 'EA', '0', 'Purchase to Order');

    INSERT INTO "part" (
      id, approved, "companyId", "createdAt", "createdBy"
    )
    VALUES
      ('TOP', false, 'co1', NOW(), 'user1'),
      ('EX-MAKE', false, 'co1', NOW(), 'user1'),
      ('EX-BUY', false, 'co1', NOW(), 'user1');

    INSERT INTO "makeMethod" (
      id, "itemId", version, status, "companyId", "createdAt", "createdBy"
    )
    VALUES
      ('mm_top_active', 'item_top', 1, 'Active', 'co1', NOW(), 'user1'),
      ('mm_existing_make_active', 'item_existing_make', 1, 'Active', 'co1', NOW(), 'user1');

    INSERT INTO "methodOperation" (
      id, "companyId", "createdAt", "createdBy", description, "laborTime",
      "laborUnit", "machineTime", "machineUnit", "makeMethodId",
      "operationOrder", "operationType", "order", "processId", "setupTime",
      "setupUnit", "workInstruction"
    )
    VALUES
      ('op_top', 'co1', NOW(), 'user1', 'Top op', 1, 'Hours/Piece', 0, 'Hours/Piece',
       'mm_top_active', 'After Previous', 'Inside', 1, 'proc1', 0, 'Hours/Piece', '{}'::jsonb),
      ('op_existing_make', 'co1', NOW(), 'user1', 'Existing make op', 2, 'Hours/Piece', 0, 'Hours/Piece',
       'mm_existing_make_active', 'After Previous', 'Inside', 1, 'proc1', 0, 'Hours/Piece', '{}'::jsonb);

    INSERT INTO "methodOperationTool" (
      id, "operationId", "toolId", quantity, "companyId", "createdAt",
      "createdBy", "updatedAt"
    )
    VALUES ('tool_ref', 'op_existing_make', 'tool1', 1, 'co1', NOW(), 'user1', NOW());

    INSERT INTO "methodOperationParameter" (
      id, "operationId", key, value, "companyId", "createdAt", "createdBy"
    )
    VALUES ('param_ref', 'op_existing_make', 'speed', 'fast', 'co1', NOW(), 'user1');

    INSERT INTO "methodOperationStep" (
      id, "operationId", name, type, "sortOrder", "companyId", "createdAt",
      "createdBy"
    )
    VALUES ('step_ref', 'op_existing_make', 'Inspect', 'Checkbox', 1, 'co1', NOW(), 'user1');

    INSERT INTO "externalIntegrationMapping" (
      id, "entityType", "entityId", integration, "externalId", metadata,
      "companyId", "allowDuplicateExternalId", "createdAt", "createdBy",
      "updatedAt"
    )
    VALUES (
      'old_map', 'item', 'item_existing_buy', 'onshapeData', 'EX-BUY',
      '{"stale":true}'::jsonb, 'co1', false, NOW(), 'user1', NOW()
    );
  `);
}

async function verifySync(db: Pool, draftMakeMethodId: string) {
  if (draftMakeMethodId === "mm_top_active") {
    throw new Error("Expected sync to create or reuse a draft make method");
  }

  const draft = await one<{
    id: string;
    itemId: string;
    version: string;
    status: string;
  }>(
    db,
    `SELECT id, "itemId", version, status
     FROM "makeMethod"
     WHERE id = $1`,
    [draftMakeMethodId]
  );

  assertEqual(draft.itemId, "item_top", "top draft item");
  assertEqual(Number(draft.version), 2, "top draft version");
  assertEqual(draft.status, "Draft", "top draft status");

  await assertCount(
    db,
    `SELECT count(*) FROM "methodOperation"
     WHERE "makeMethodId" = $1 AND description = 'Top op'`,
    1,
    "copied top operation",
    [draftMakeMethodId]
  );

  const asmItem = await one<{ id: string; readableIdWithRevision: string }>(
    db,
    `SELECT id, "readableIdWithRevision"
     FROM "item"
     WHERE "readableId" = 'ASM-1' AND "companyId" = 'co1'`
  );
  assertEqual(
    asmItem.readableIdWithRevision,
    "ASM-1.A",
    "new item readable id with revision"
  );

  const buyItem = await one<{ id: string }>(
    db,
    `SELECT id FROM "item" WHERE "readableId" = 'BUY-1' AND "companyId" = 'co1'`
  );

  await assertCount(
    db,
    `SELECT count(*) FROM "part" WHERE id IN ('ASM-1', 'BUY-1')`,
    2,
    "created part rows"
  );

  const topMaterials = await all<{
    itemId: string;
    quantity: string;
    materialMakeMethodId: string | null;
    order: string;
  }>(
    db,
    `SELECT "itemId", quantity, "materialMakeMethodId", "order"
     FROM "methodMaterial"
     WHERE "makeMethodId" = $1
     ORDER BY "order"`,
    [draftMakeMethodId]
  );

  assertEqual(topMaterials.length, 3, "top material count");
  assertEqual(topMaterials[0]?.itemId, asmItem.id, "assembly material order");
  assertEqual(Number(topMaterials[0]?.quantity), 2, "assembly material quantity");
  assertTruthy(
    topMaterials[0]?.materialMakeMethodId,
    "assembly child make method"
  );
  assertEqual(
    topMaterials[1]?.itemId,
    "item_existing_make",
    "existing make material order"
  );
  assertEqual(Number(topMaterials[1]?.quantity), 5, "existing make quantity");
  assertTruthy(
    topMaterials[1]?.materialMakeMethodId,
    "existing make child draft"
  );
  assertEqual(
    topMaterials[2]?.itemId,
    "item_existing_buy",
    "existing buy material order"
  );
  assertEqual(
    topMaterials[2]?.materialMakeMethodId,
    null,
    "existing buy does not create make method"
  );

  await assertCount(
    db,
    `SELECT count(*)
     FROM "methodMaterial"
     WHERE "makeMethodId" = $1 AND "itemId" = $2 AND quantity = 3`,
    1,
    "nested purchased material",
    [topMaterials[0]?.materialMakeMethodId, buyItem.id]
  );

  const existingMakeDraftId = topMaterials[1]?.materialMakeMethodId;
  await assertCount(
    db,
    `SELECT count(*)
     FROM "methodOperation"
     WHERE "makeMethodId" = $1 AND description = 'Existing make op'`,
    1,
    "copied child operation",
    [existingMakeDraftId]
  );
  const copiedOperation = await one<{ id: string }>(
    db,
    `SELECT id
     FROM "methodOperation"
     WHERE "makeMethodId" = $1 AND description = 'Existing make op'`,
    [existingMakeDraftId]
  );
  await assertCount(
    db,
    `SELECT count(*) FROM "methodOperationTool" WHERE "operationId" = $1`,
    1,
    "copied operation tool",
    [copiedOperation.id]
  );
  await assertCount(
    db,
    `SELECT count(*) FROM "methodOperationParameter" WHERE "operationId" = $1`,
    1,
    "copied operation parameter",
    [copiedOperation.id]
  );
  await assertCount(
    db,
    `SELECT count(*) FROM "methodOperationStep" WHERE "operationId" = $1`,
    1,
    "copied operation step",
    [copiedOperation.id]
  );

  await assertCount(
    db,
    `SELECT count(*)
     FROM "externalIntegrationMapping"
     WHERE integration = 'onshapeData'
       AND "externalId" IN ('ASM-1.A', 'BUY-1', 'EX-MAKE', 'EX-BUY')
       AND "companyId" = 'co1'`,
    4,
    "Onshape data mappings"
  );

  const updatedMapping = await one<{ metadata: { source?: string } }>(
    db,
    `SELECT metadata
     FROM "externalIntegrationMapping"
     WHERE integration = 'onshapeData' AND "entityId" = 'item_existing_buy'`
  );
  assertEqual(
    updatedMapping.metadata.source,
    "existing-buy",
    "updated existing mapping metadata"
  );
}

async function one<T>(
  db: Pool,
  text: string,
  values: unknown[] = []
): Promise<T> {
  const result = await db.query(text, values);
  const row = result.rows[0];
  if (!row) throw new Error(`Expected one row for query: ${text}`);
  return row;
}

async function all<T>(
  db: Pool,
  text: string,
  values: unknown[] = []
): Promise<T[]> {
  const result = await db.query(text, values);
  return result.rows;
}

async function assertCount(
  db: Pool,
  sql: string,
  expected: number,
  label: string,
  values: unknown[] = []
) {
  const result = await db.query(sql, values);
  const actual = Number(result.rows[0]?.count ?? 0);
  assertEqual(actual, expected, label);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertTruthy(actual: unknown, label: string) {
  if (!actual) {
    throw new Error(`${label}: expected a truthy value`);
  }
}
