import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { closeMrpPool, runMrp } from "../src/mrp.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-mrp-smoke-${process.pid}`;
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

    await setupMrpFixture(pool);
    await runMrp({
      type: "company",
      id: "co1",
      companyId: "co1",
      userId: "user1"
    });
    await verifyFirstRun(pool);

    await pool.query(
      `UPDATE "salesOrderLine" SET "quantityToSend" = 3 WHERE id = 'sol1'`
    );
    await runMrp({
      type: "company",
      id: "co1",
      companyId: "co1",
      userId: "user1"
    });
    await verifySecondRun(pool);

    console.log("MRP smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- sales demand actual and BOM forecast verified");
    console.log("- production supply actual and rerun replacement verified");
  } finally {
    await closeMrpPool();
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

async function setupMrpFixture(db: Pool) {
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

    INSERT INTO "customer" (
      id, name, "companyId", "createdAt", "createdBy", embedding, "taxPercent"
    )
    VALUES ('cust1', 'Customer', 'co1', NOW(), 'user1', '[0]', 0);

    INSERT INTO "item" (
      id, name, "readableId", "readableIdWithRevision", active, "companyId",
      "createdAt", "createdBy", embedding, "itemTrackingType",
      "replenishmentSystem", "requiresInspection", type, "unitOfMeasureCode"
    )
    VALUES
      ('item_root', 'Root', 'ROOT', 'ROOT', true, 'co1', NOW(), 'user1', '[0]', 'Inventory', 'Make', false, 'Part', 'EA'),
      ('item_child', 'Child', 'CHILD', 'CHILD', true, 'co1', NOW(), 'user1', '[0]', 'Inventory', 'Buy', false, 'Part', 'EA'),
      ('item_supply', 'Supply', 'SUPPLY', 'SUPPLY', true, 'co1', NOW(), 'user1', '[0]', 'Inventory', 'Make', false, 'Part', 'EA');

    INSERT INTO "itemReplenishment" (
      "itemId", "companyId", "createdAt", "createdBy", "conversionFactor",
      "leadTime", "manufacturingBlocked", "purchasingBlocked",
      "requiresConfiguration", "scrapPercentage"
    )
    VALUES
      ('item_root', 'co1', NOW(), 'user1', 1, 0, false, false, false, 0),
      ('item_child', 'co1', NOW(), 'user1', 1, 0, false, false, false, 0),
      ('item_supply', 'co1', NOW(), 'user1', 1, 0, false, false, false, 0);

    INSERT INTO "makeMethod" (
      id, "itemId", version, status, "companyId", "createdAt", "createdBy"
    )
    VALUES ('mm_root', 'item_root', 1, 'Active', 'co1', NOW(), 'user1');

    INSERT INTO "methodMaterial" (
      id, "itemId", "itemType", kit, "makeMethodId", "methodType", "order",
      quantity, "scrapQuantity", "sourcingType", "storageUnitIds",
      "unitOfMeasureCode", "companyId", "createdAt", "createdBy"
    )
    VALUES (
      'mat_child', 'item_child', 'Part', false, 'mm_root',
      'Purchase to Order', 1, 2, 0, 'Specified', '[]'::jsonb, 'EA',
      'co1', NOW(), 'user1'
    );

    INSERT INTO "salesOrder" (
      id, "salesOrderId", "customerId", "currencyCode", "revisionId",
      status, "locationId", "companyId", "createdAt", "createdBy"
    )
    VALUES (
      'so1', 'SO-1', 'cust1', 'USD', 0, 'To Ship', 'loc1',
      'co1', NOW(), 'user1'
    );

    INSERT INTO "salesOrderLine" (
      id, "salesOrderId", "itemId", "locationId", "methodType",
      "quantityToSend", "salesOrderLineType", "unitOfMeasureCode",
      "addOnCost", "nonTaxableAddOnCost", "shippingCost", "sortOrder",
      "taxPercent", "invoicedComplete", "requiresInspection", "sentComplete",
      status, "companyId", "createdAt", "createdBy"
    )
    VALUES (
      'sol1', 'so1', 'item_root', 'loc1', 'Pull from Inventory', 5, 'Part',
      'EA', 0, 0, 0, 1, 0, false, false, false, 'Ordered',
      'co1', NOW(), 'user1'
    );

    INSERT INTO "job" (
      id, "jobId", "itemId", "locationId", "companyId", "createdAt",
      "createdBy", "deadlineType", "dueDate", priority, quantity,
      "productionQuantity", "quantityComplete", "quantityReceivedToInventory",
      "quantityShipped", "scrapQuantity", status, "unitOfMeasureCode"
    )
    VALUES (
      'job_supply', 'J-SUPPLY', 'item_supply', 'loc1', 'co1', NOW(), 'user1',
      'Soft Deadline', CURRENT_DATE, 0, 2, 2, 0, 0, 0, 0, 'Planned', 'EA'
    );
  `);
}

async function verifyFirstRun(db: Pool) {
  await assertCount(
    db,
    `SELECT count(*) FROM "period" WHERE "periodType" = 'Week'`,
    72,
    "weekly periods"
  );
  await assertQuantity(
    db,
    `SELECT COALESCE(SUM("actualQuantity"), 0) AS quantity
     FROM "demandActual"
     WHERE "itemId" = 'item_root'
       AND "locationId" = 'loc1'
       AND "sourceType" = 'Sales Order'`,
    5,
    "root sales demand actual"
  );
  await assertQuantity(
    db,
    `SELECT COALESCE(SUM("forecastQuantity"), 0) AS quantity
     FROM "demandForecast"
     WHERE "itemId" = 'item_child'
       AND "locationId" = 'loc1'
       AND "forecastMethod" = 'mrp'`,
    10,
    "child MRP demand forecast"
  );
  await assertQuantity(
    db,
    `SELECT COALESCE(SUM("actualQuantity"), 0) AS quantity
     FROM "supplyActual"
     WHERE "itemId" = 'item_supply'
       AND "locationId" = 'loc1'
       AND "sourceType" = 'Production Order'`,
    2,
    "production supply actual"
  );
}

async function verifySecondRun(db: Pool) {
  await assertQuantity(
    db,
    `SELECT COALESCE(SUM("actualQuantity"), 0) AS quantity
     FROM "demandActual"
     WHERE "itemId" = 'item_root'
       AND "locationId" = 'loc1'
       AND "sourceType" = 'Sales Order'`,
    3,
    "updated root sales demand actual"
  );
  await assertQuantity(
    db,
    `SELECT COALESCE(SUM("forecastQuantity"), 0) AS quantity
     FROM "demandForecast"
     WHERE "itemId" = 'item_child'
       AND "locationId" = 'loc1'
       AND "forecastMethod" = 'mrp'`,
    6,
    "updated child MRP demand forecast"
  );
  await assertCount(
    db,
    `SELECT count(*)
     FROM "demandForecast"
     WHERE "itemId" = 'item_child'
       AND "locationId" = 'loc1'
       AND "forecastMethod" = 'mrp'`,
    1,
    "child MRP demand forecast row count"
  );
}

async function assertQuantity(
  db: Pool,
  query: string,
  expected: number,
  label: string
) {
  const result = await db.query<{ quantity: string | number }>(query);
  assertEqual(Number(result.rows[0]?.quantity ?? 0), expected, label);
}

async function assertCount(
  db: Pool,
  query: string,
  expected: number,
  label: string
) {
  const result = await db.query<{ count: string }>(query);
  assertEqual(Number(result.rows[0]?.count ?? 0), expected, label);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}
