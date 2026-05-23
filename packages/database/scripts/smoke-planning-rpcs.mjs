import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-planning-rpcs-smoke-${process.pid}`;
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
  let pool = null;

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

    pool = new Pool({ connectionString: ownerUrl(port), max: 1 });
    await verifyRuntime(pool);
    await verifyFunctionShape(pool);
    await setupFixtures(pool);
    await verifyPurchasingPlanningScope(pool);
    await verifyProductionPlanningScope(pool);

    console.log("Planning RPC smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- planning RPCs require company_id and location_id");
    console.log("- replenishment, planning, model, supplier, demand, and supply rows stay company-scoped");
  } finally {
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

async function verifyRuntime(db) {
  const result = await db.query(`
    SELECT
      current_setting('server_version') AS "serverVersion",
      extversion AS "vectorVersion"
    FROM pg_extension
    WHERE extname = 'vector'
  `);
  const row = result.rows[0];

  if (!row) {
    throw new Error("Expected the vector extension to be installed");
  }

  if (!String(row.serverVersion).startsWith("18.")) {
    throw new Error(`Expected PostgreSQL 18, got ${row.serverVersion}`);
  }
}

async function verifyFunctionShape(db) {
  const result = await db.query(`
    SELECT
      proname,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND proname IN (
        'planning_projection_rows',
        'get_purchasing_planning',
        'get_production_planning',
        'get_production_projections'
      )
    ORDER BY proname, args
  `);

  const signatures = new Set(
    result.rows.map((row) => `${row.proname}(${row.args})`)
  );
  const expected = [
    'get_production_planning(company_id text, location_id text, periods text[])',
    'get_production_projections(company_id text, location_id text, periods text[])',
    'get_purchasing_planning(company_id text, location_id text, periods text[])',
    'planning_projection_rows(company_id text, location_id text, periods text[], replenishment_system "itemReplenishmentSystem")'
  ];

  for (const signature of expected) {
    if (!signatures.has(signature)) {
      throw new Error(`Missing expected planning function: ${signature}`);
    }
  }
}

async function setupFixtures(db) {
  await db.query("BEGIN");

  try {
    await db.query("SET LOCAL session_replication_role = replica");
    await db.query(`
      INSERT INTO "location" (
        id, name, "companyId", "createdAt", "createdBy", "addressLine1",
        city, "stateProvince", "postalCode", timezone
      )
      VALUES
        ('loc-co1', 'Location co1', 'co1', NOW(), 'user-co1', '1 Main', 'Austin', 'TX', '78701', 'UTC'),
        ('loc-co2', 'Location co2', 'co2', NOW(), 'user-co2', '2 Main', 'Austin', 'TX', '78702', 'UTC')
    `);

    await db.query(`
      INSERT INTO "modelUpload" (
        id, "companyId", "createdBy", "modelPath", name, size, "thumbnailPath"
      )
      VALUES ('model-leak-co2', 'co2', 'user-co2', 'co2/leak.step', 'Leak model', 42, 'co2/leak.png')
    `);

    await db.query(`
      INSERT INTO "item" (
        id, name, "readableId", "readableIdWithRevision", revision, active,
        "companyId", "createdAt", "createdBy", embedding, "itemTrackingType",
        "modelUploadId", "replenishmentSystem", "requiresInspection", type,
        "unitOfMeasureCode"
      )
      VALUES
        ('buy-co1', 'Buy co1', 'BUY-CO1', 'BUY-CO1/A', 'A', true, 'co1', NOW(), 'user-co1', '[0]', 'Inventory', 'model-leak-co2', 'Buy', false, 'Part', 'EA'),
        ('make-co1', 'Make co1', 'MAKE-CO1', 'MAKE-CO1/A', 'A', true, 'co1', NOW(), 'user-co1', '[0]', 'Inventory', 'model-leak-co2', 'Make', false, 'Part', 'EA'),
        ('buy-cross-child', 'Cross child buy', 'BUY-X', 'BUY-X/A', 'A', true, 'co1', NOW(), 'user-co1', '[0]', 'Inventory', NULL, 'Buy', false, 'Part', 'EA'),
        ('make-cross-child', 'Cross child make', 'MAKE-X', 'MAKE-X/A', 'A', true, 'co1', NOW(), 'user-co1', '[0]', 'Inventory', NULL, 'Make', false, 'Part', 'EA'),
        ('buy-co2', 'Buy co2', 'BUY-CO2', 'BUY-CO2/A', 'A', true, 'co2', NOW(), 'user-co2', '[0]', 'Inventory', NULL, 'Buy', false, 'Part', 'EA')
    `);

    await db.query(`
      INSERT INTO "itemReplenishment" (
        "companyId", "conversionFactor", "createdAt", "createdBy", "itemId",
        "leadTime", "lotSize", "manufacturingBlocked", "preferredSupplierId",
        "purchasingBlocked", "requiresConfiguration", "scrapPercentage"
      )
      VALUES
        ('co1', 1, NOW(), 'user-co1', 'buy-co1', 7, 5, false, 'supplier-co1', false, false, 0),
        ('co1', 1, NOW(), 'user-co1', 'make-co1', 9, 3, false, NULL, false, false, 0),
        ('co2', 1, NOW(), 'user-co2', 'buy-cross-child', 99, 99, false, 'supplier-leak', false, false, 0),
        ('co2', 1, NOW(), 'user-co2', 'make-cross-child', 99, 99, false, NULL, false, false, 0)
    `);

    await db.query(`
      INSERT INTO "itemPlanning" (
        "companyId", "createdAt", "createdBy", critical,
        "demandAccumulationIncludesInventory", "demandAccumulationPeriod",
        "demandAccumulationSafetyStock", "itemId", "locationId",
        "maximumInventoryQuantity", "maximumOrderQuantity",
        "minimumOrderQuantity", "orderMultiple", "reorderingPolicy",
        "reorderPoint", "reorderQuantity"
      )
      VALUES
        ('co1', NOW(), 'user-co1', false, false, 1, 0, 'buy-co1', 'loc-co1', 50, 0, 0, 0, 'Manual Reorder', 0, 0),
        ('co1', NOW(), 'user-co1', false, false, 1, 0, 'make-co1', 'loc-co1', 50, 0, 0, 0, 'Manual Reorder', 0, 0),
        ('co2', NOW(), 'user-co2', false, false, 1, 0, 'buy-cross-child', 'loc-co1', 99, 99, 99, 99, 'Fixed Reorder Quantity', 99, 99),
        ('co2', NOW(), 'user-co2', false, false, 1, 0, 'make-cross-child', 'loc-co1', 99, 99, 99, 99, 'Fixed Reorder Quantity', 99, 99)
    `);

    await db.query(`
      INSERT INTO "supplierPart" (
        id, active, "companyId", "conversionFactor", "createdAt", "createdBy",
        "itemId", "minimumOrderQuantity", "supplierId", "supplierPartId",
        "supplierUnitOfMeasureCode", "unitPrice"
      )
      VALUES
        ('supplier-part-co1', true, 'co1', 1, NOW(), 'user-co1', 'buy-co1', 2, 'supplier-co1', 'SUP-BUY', 'EA', 10),
        ('supplier-part-leak', true, 'co2', 1, NOW(), 'user-co2', 'buy-co1', 99, 'supplier-leak', 'SUP-LEAK', 'EA', 99)
    `);

    await db.query(`
      INSERT INTO "itemLedger" (
        id, "companyId", "createdAt", "createdBy", "entryNumber",
        "entryType", "itemId", "locationId", "postingDate", quantity
      )
      VALUES
        ('ledger-buy-co1', 'co1', NOW(), 'user-co1', 1, 'Positive Adjmt.', 'buy-co1', 'loc-co1', CURRENT_DATE, 10),
        ('ledger-make-co1', 'co1', NOW(), 'user-co1', 2, 'Positive Adjmt.', 'make-co1', 'loc-co1', CURRENT_DATE, 5),
        ('ledger-buy-co2', 'co2', NOW(), 'user-co2', 3, 'Positive Adjmt.', 'buy-co1', 'loc-co1', CURRENT_DATE, 100)
    `);

    await db.query(`
      INSERT INTO "demandActual" (
        "actualQuantity", "companyId", "createdAt", "createdBy", "itemId",
        "locationId", "periodId", "sourceType", "updatedAt", "updatedBy"
      )
      VALUES
        (4, 'co1', NOW(), 'user-co1', 'buy-co1', 'loc-co1', 'p1', 'Sales Order', NOW(), 'user-co1'),
        (2, 'co1', NOW(), 'user-co1', 'make-co1', 'loc-co1', 'p1', 'Sales Order', NOW(), 'user-co1'),
        (50, 'co2', NOW(), 'user-co2', 'buy-co1', 'loc-co1', 'p1', 'Sales Order', NOW(), 'user-co2')
    `);

    await db.query(`
      INSERT INTO "supplyForecast" (
        "companyId", "createdAt", "createdBy", "forecastQuantity", "itemId",
        "locationId", "periodId", "updatedAt", "updatedBy"
      )
      VALUES
        ('co1', NOW(), 'user-co1', 3, 'buy-co1', 'loc-co1', 'p2', NOW(), 'user-co1'),
        ('co1', NOW(), 'user-co1', 4, 'make-co1', 'loc-co1', 'p2', NOW(), 'user-co1'),
        ('co2', NOW(), 'user-co2', 80, 'buy-co1', 'loc-co1', 'p1', NOW(), 'user-co2')
    `);

    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function verifyPurchasingPlanningScope(db) {
  const result = await db.query(`
    SELECT
      id,
      "thumbnailPath",
      "leadTime",
      "lotSize",
      "suppliers",
      "preferredSupplierId",
      "week1",
      "week2",
      "quantityToOrder"
    FROM get_purchasing_planning('co1', 'loc-co1', ARRAY['p1', 'p2']::text[])
    ORDER BY id
  `);

  if (result.rows.length !== 1) {
    throw new Error(
      `Expected 1 purchasing planning row, got ${JSON.stringify(result.rows)}`
    );
  }

  const row = result.rows[0];

  expectEqual(row.id, "buy-co1", "purchasing item id");
  expectEqual(row.thumbnailPath, null, "cross-company planning model thumbnail");
  expectNumeric(row.leadTime, 7, "purchasing lead time");
  expectNumeric(row.lotSize, 5, "purchasing lot size");
  expectEqual(row.preferredSupplierId, "supplier-co1", "preferred supplier");
  expectNumeric(row.week1, 6, "purchasing week1 projection");
  expectNumeric(row.week2, 9, "purchasing week2 projection");
  expectNumeric(row.quantityToOrder, 0, "manual purchasing quantity");
  expectEqual(row.suppliers?.length, 1, "company-scoped supplier count");
  expectEqual(row.suppliers[0].id, "supplier-part-co1", "supplier part id");
  expectEqual(row.suppliers[0].supplierId, "supplier-co1", "supplier id");
  expectEqual(row.suppliers[0].supplierPartId, "SUP-BUY", "supplier part readable id");
  expectNumeric(row.suppliers[0].minimumOrderQuantity, 2, "supplier minimum order");
  expectNumeric(row.suppliers[0].conversionFactor, 1, "supplier conversion factor");
  expectNumeric(row.suppliers[0].unitPrice, 10, "supplier unit price");
}

async function verifyProductionPlanningScope(db) {
  const planning = await db.query(`
    SELECT id, "thumbnailPath", "leadTime", "lotSize", "week1", "week2", "quantityToOrder"
    FROM get_production_planning('co1', 'loc-co1', ARRAY['p1', 'p2']::text[])
    ORDER BY id
  `);

  if (planning.rows.length !== 1) {
    throw new Error(
      `Expected 1 production planning row, got ${JSON.stringify(planning.rows)}`
    );
  }

  const row = planning.rows[0];

  expectEqual(row.id, "make-co1", "production item id");
  expectEqual(row.thumbnailPath, null, "cross-company production model thumbnail");
  expectNumeric(row.leadTime, 9, "production lead time");
  expectNumeric(row.lotSize, 3, "production lot size");
  expectNumeric(row.week1, 3, "production week1 projection");
  expectNumeric(row.week2, 7, "production week2 projection");
  expectNumeric(row.quantityToOrder, 0, "manual production quantity");

  const projections = await db.query(`
    SELECT id, "week1", "week2"
    FROM get_production_projections('co1', 'loc-co1', ARRAY['p1', 'p2']::text[])
    ORDER BY id
  `);

  if (projections.rows.length !== 1) {
    throw new Error(
      `Expected 1 production projection row, got ${JSON.stringify(projections.rows)}`
    );
  }

  expectEqual(projections.rows[0].id, "make-co1", "production projection item id");
  expectNumeric(projections.rows[0].week1, 3, "projection week1");
  expectNumeric(projections.rows[0].week2, 7, "projection week2");
}

function expectEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Unexpected ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function expectNumeric(actual, expected, label) {
  const numeric = actual === null || actual === undefined ? actual : Number(actual);

  if (numeric !== expected) {
    throw new Error(
      `Unexpected ${label}: expected ${expected}, got ${JSON.stringify(actual)}`
    );
  }
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

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
