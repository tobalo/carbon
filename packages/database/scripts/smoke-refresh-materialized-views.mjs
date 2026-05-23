import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-refresh-mviews-smoke-${process.pid}`;
const database = "carbon";
const ownerUrl = (port) =>
  `postgresql://carbon:carbon@127.0.0.1:${port}/${database}`;
const appUrl = (port) =>
  `postgresql://carbon_app:carbon_app@127.0.0.1:${port}/${database}`;
const serviceUrl = (port) =>
  `postgresql://carbon_service:carbon_service@127.0.0.1:${port}/${database}`;

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const port = await getFreePort();
  let containerStarted = false;
  let ownerPool = null;
  let appPool = null;
  let servicePool = null;

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

    ownerPool = new Pool({ connectionString: ownerUrl(port), max: 1 });
    appPool = new Pool({ connectionString: appUrl(port), max: 1 });
    servicePool = new Pool({ connectionString: serviceUrl(port), max: 1 });

    await setupFixtures(ownerPool);
    await verifyAppCannotRefresh(appPool);
    await verifyViewIsStaleBeforeRefresh(ownerPool);
    await servicePool.query(`SELECT refresh_item_stock_quantities()`);
    await verifyRefreshedQuantities(ownerPool);

    console.log("Refresh materialized views smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- refresh_item_stock_quantities service-only execute verified");
    console.log("- itemStockQuantities refresh behavior verified");
  } finally {
    await ownerPool?.end().catch(() => undefined);
    await appPool?.end().catch(() => undefined);
    await servicePool?.end().catch(() => undefined);
    if (containerStarted) {
      try {
        run("docker", ["rm", "-f", containerName], { stdio: "ignore" });
      } catch {
        // Best-effort cleanup after a failed smoke run.
      }
    }
  }
}

function migrate(port) {
  run("pnpm", ["--filter", "@carbon/database", "db:migrate"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATABASE_MIGRATION_URL: ownerUrl(port),
      DATABASE_URL: appUrl(port),
      DATABASE_SERVICE_URL: serviceUrl(port),
      JOBS_DATABASE_URL: serviceUrl(port)
    },
    stdio: "pipe"
  });
}

async function setupFixtures(db) {
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

    INSERT INTO "item" (
      id, name, "readableId", "readableIdWithRevision", active, "companyId",
      "createdAt", "createdBy", embedding, "itemTrackingType",
      "replenishmentSystem", "requiresInspection", type, "unitOfMeasureCode",
      "defaultMethodType"
    )
    VALUES (
      'item1', 'Part', 'PART', 'PART', true, 'co1', NOW(), 'user1',
      '[0]', 'Batch', 'Buy', false, 'Part', 'EA', 'Pull from Inventory'
    );

    INSERT INTO "itemLedger" (
      id, "companyId", "createdAt", "createdBy", "entryNumber",
      "entryType", "itemId", "locationId", "postingDate", quantity,
      "trackedEntityStatus"
    )
    VALUES
      ('ledger1', 'co1', NOW(), 'user1', 1, 'Positive Adjmt.', 'item1', 'loc1', CURRENT_DATE, 5, NULL),
      ('ledger2', 'co1', NOW(), 'user1', 2, 'Positive Adjmt.', 'item1', 'loc1', CURRENT_DATE, 2, '"Rejected"'::jsonb),
      ('ledger3', 'co1', NOW(), 'user1', 3, 'Positive Adjmt.', 'item1', NULL, CURRENT_DATE, 7, NULL);
  `);
}

async function verifyAppCannotRefresh(db) {
  try {
    await db.query(`SELECT refresh_item_stock_quantities()`);
  } catch (error) {
    if (error?.code === "42501" || error?.code === "42883") {
      return;
    }
    throw error;
  }

  throw new Error("carbon_app unexpectedly executed refresh_item_stock_quantities()");
}

async function verifyViewIsStaleBeforeRefresh(db) {
  const result = await db.query(`
    SELECT COUNT(*)::int AS count
    FROM "itemStockQuantities"
    WHERE "itemId" = 'item1'
  `);
  if (result.rows[0]?.count !== 0) {
    throw new Error("itemStockQuantities updated before explicit refresh");
  }
}

async function verifyRefreshedQuantities(db) {
  const result = await db.query(`
    SELECT "locationId", "quantityOnHand"::numeric::float8 AS quantity
    FROM "itemStockQuantities"
    WHERE "itemId" = 'item1'
      AND "companyId" = 'co1'
    ORDER BY "locationId"
  `);
  const rows = result.rows.map((row) => [row.locationId, row.quantity]);

  assertDeepEqual(
    rows,
    [
      ["", 7],
      ["loc1", 5]
    ],
    "refreshed item stock quantities"
  );
}

async function waitForPostgres(connectionString) {
  const deadline = Date.now() + 60_000;
  let lastError;

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

  throw new Error(
    `Timed out waiting for ${image} to initialize carbon roles.${
      lastError ? ` Last error: ${lastError.message}` : ""
    }`
  );
}

function getFreePort() {
  return new Promise((resolvePort, reject) => {
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

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 128,
      ...options
    });
  } catch (error) {
    const detail = [
      `Command failed: ${command} ${args.join(" ")}`,
      error.stdout?.toString(),
      error.stderr?.toString()
    ]
      .filter(Boolean)
      .join("\n");
    throw new Error(detail);
  }
}

function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
