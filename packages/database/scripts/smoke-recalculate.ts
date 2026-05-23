import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import {
  closeRecalculatePool,
  recalculate
} from "../src/recalculate.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-recalculate-smoke-${process.pid}`;
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

    await setupRecalculateFixture(pool);
    await recalculate({
      type: "jobRequirements",
      id: "job1",
      companyId: "co1",
      userId: "user1"
    });
    await verifyJobRecalculate(pool);

    await verifyJobMakeMethodRecalculate(pool);

    console.log("Recalculate smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- recalculate Node/Postgres route service verified");
    console.log("- job material, make-method, and operation quantities verified");
  } finally {
    await closeRecalculatePool();
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

async function setupRecalculateFixture(db: Pool) {
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

    INSERT INTO "location" (
      id, name, "companyId", "createdAt", "createdBy", "addressLine1",
      city, "postalCode", "stateProvince", timezone
    )
    VALUES (
      'loc1', 'Main', 'co1', NOW(), 'user1', '1 Main', 'Austin',
      '78701', 'TX', 'America/Chicago'
    );

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
      "replenishmentSystem", "requiresInspection", type, "unitOfMeasureCode"
    )
    VALUES
      ('item_root', 'Root', 'ROOT', 'ROOT', true, 'co1', NOW(), 'user1', '[0]', 'Inventory', 'Make', false, 'Part', 'EA'),
      ('item_child', 'Child', 'CHILD', 'CHILD', true, 'co1', NOW(), 'user1', '[0]', 'Inventory', 'Make', false, 'Part', 'EA'),
      ('item_buy', 'Buy', 'BUY', 'BUY', true, 'co1', NOW(), 'user1', '[0]', 'Inventory', 'Buy', false, 'Material', 'EA');

    INSERT INTO "itemReplenishment" (
      "itemId", "companyId", "createdAt", "createdBy", "conversionFactor",
      "leadTime", "manufacturingBlocked", "purchasingBlocked",
      "requiresConfiguration", "scrapPercentage"
    )
    VALUES
      ('item_root', 'co1', NOW(), 'user1', 1, 0, false, false, false, 0),
      ('item_child', 'co1', NOW(), 'user1', 1, 0, false, false, false, 0),
      ('item_buy', 'co1', NOW(), 'user1', 1, 0, false, false, false, 0);

    INSERT INTO "job" (
      id, "jobId", "itemId", "locationId", "companyId", "createdAt", "createdBy",
      "deadlineType", priority, quantity, "productionQuantity",
      "quantityComplete", "quantityReceivedToInventory", "quantityShipped",
      "scrapQuantity", status, "unitOfMeasureCode"
    )
    VALUES (
      'job1', 'J-1', 'item_root', 'loc1', 'co1', NOW(), 'user1',
      'No Deadline', 0, 10, 7, 0, 0, 0, 0, 'Draft', 'EA'
    );

    INSERT INTO "jobMakeMethod" (
      id, "itemId", "jobId", "companyId", "createdAt", "createdBy",
      "itemScrapPercentage", "quantityPerParent", "requiresBatchTracking",
      "requiresSerialTracking", version
    )
    VALUES (
      'jmm_root', 'item_root', 'job1', 'co1', NOW(), 'user1',
      0, 1, false, false, 1
    );

    INSERT INTO "jobMaterial" (
      id, "itemId", description, "itemType", "jobId", "jobMakeMethodId",
      "companyId", "createdAt", "createdBy", "itemScrapPercentage",
      kit, "methodType", "order", quantity, "requiresBatchTracking",
      "requiresSerialTracking", "scrapQuantity", "unitCost", "unitOfMeasureCode"
    )
    VALUES (
      'jm_child', 'item_child', 'Child', 'Part', 'job1', 'jmm_root',
      'co1', NOW(), 'user1', 0.1, false, 'Make to Order', 1, 2,
      false, false, 0, 0, 'EA'
    );

    INSERT INTO "jobMakeMethod" (
      id, "itemId", "jobId", "parentMaterialId", "companyId", "createdAt",
      "createdBy", "itemScrapPercentage", "quantityPerParent",
      "requiresBatchTracking", "requiresSerialTracking", version
    )
    VALUES (
      'jmm_child', 'item_child', 'job1', 'jm_child', 'co1', NOW(),
      'user1', 0, 1, false, false, 1
    );

    INSERT INTO "jobMaterial" (
      id, "itemId", description, "itemType", "jobId", "jobMakeMethodId",
      "companyId", "createdAt", "createdBy", "itemScrapPercentage",
      kit, "methodType", "order", quantity, "requiresBatchTracking",
      "requiresSerialTracking", "scrapQuantity", "unitCost", "unitOfMeasureCode"
    )
    VALUES (
      'jm_buy', 'item_buy', 'Buy', 'Material', 'job1', 'jmm_child',
      'co1', NOW(), 'user1', 0, false, 'Pull from Inventory', 2, 3,
      false, false, 0, 0, 'EA'
    );

    INSERT INTO "jobOperation" (
      id, "jobId", "jobMakeMethodId", "companyId", "createdAt", "createdBy",
      "laborRate", "laborTime", "laborUnit", "machineTime", "machineUnit",
      "operationLeadTime", "operationMinimumCost", "operationOrder",
      "operationType", "operationUnitCost", "order", "overheadRate",
      priority, "processId", "setupTime", "setupUnit", status,
      "workInstruction"
    )
    VALUES
      ('op_root', 'job1', 'jmm_root', 'co1', NOW(), 'user1', 0, 0, 'Hours/Piece', 0, 'Hours/Piece', 0, 0, 'After Previous', 'Inside', 0, 1, 0, 0, 'proc1', 0, 'Hours/Piece', 'Todo', '{}'::jsonb),
      ('op_child', 'job1', 'jmm_child', 'co1', NOW(), 'user1', 0, 0, 'Hours/Piece', 0, 'Hours/Piece', 0, 0, 'After Previous', 'Inside', 0, 2, 0, 0, 'proc1', 0, 'Hours/Piece', 'Todo', '{}'::jsonb);
  `);
}

async function verifyJobRecalculate(db: Pool) {
  await assertQuantity(
    db,
    `SELECT "estimatedQuantity" FROM "jobMaterial" WHERE id = 'jm_child'`,
    20,
    "child make material estimated quantity"
  );
  await assertQuantity(
    db,
    `SELECT "scrapQuantity" FROM "jobMaterial" WHERE id = 'jm_child'`,
    2,
    "child make material scrap quantity"
  );
  await assertQuantity(
    db,
    `SELECT "estimatedQuantity" FROM "jobMaterial" WHERE id = 'jm_buy'`,
    66,
    "grandchild buy material estimated quantity"
  );
  await assertQuantity(
    db,
    `SELECT "quantityPerParent" FROM "jobMakeMethod" WHERE id = 'jmm_child'`,
    2,
    "child make method quantity per parent"
  );
  await assertQuantity(
    db,
    `SELECT "targetQuantity" FROM "jobOperation" WHERE id = 'op_child'`,
    20,
    "child operation target quantity"
  );
  await assertQuantity(
    db,
    `SELECT "operationQuantity" FROM "jobOperation" WHERE id = 'op_child'`,
    22,
    "child operation quantity including scrap"
  );
}

async function verifyJobMakeMethodRecalculate(db: Pool) {
  await db.query(
    `UPDATE "jobMaterial" SET "estimatedQuantity" = 0, "scrapQuantity" = 0 WHERE id = 'jm_buy'`
  );

  await recalculate({
    type: "jobMakeMethodRequirements",
    id: "jmm_child",
    companyId: "co1",
    userId: "user1"
  });

  await assertQuantity(
    db,
    `SELECT "estimatedQuantity" FROM "jobMaterial" WHERE id = 'jm_buy'`,
    60,
    "subtree buy material estimated quantity"
  );
}

async function assertQuantity(
  db: Pool,
  sql: string,
  expected: number,
  label: string
) {
  const result = await db.query(sql);
  const row = result.rows[0] ?? {};
  const column = Object.keys(row)[0];
  const value = Number(column ? row[column] : NaN);
  if (value !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${value}`);
  }
}
