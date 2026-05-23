import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-radan-smoke-${process.pid}`;
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

    await verifyRuntime(ownerPool);
    await verifyFunctionShape(ownerPool);
    await setupFixtures(ownerPool);
    await verifyOwnerRadanScope(ownerPool);
    await verifyAppRadanScope(appPool);

    console.log("Radan integration RPC smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- get_radan_v1 keeps jobs, operations, make methods, and locations company-scoped");
    console.log("- material export metadata cannot leak from cross-company job material rows");
    console.log("- request-scoped carbon_app context only sees the caller's Better Auth company membership");
  } finally {
    await ownerPool?.end().catch(() => undefined);
    await appPool?.end().catch(() => undefined);
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
      AND proname = 'get_radan_v1'
    ORDER BY proname, args
  `);

  const signatures = new Set(
    result.rows.map((row) => `${row.proname}(${row.args})`)
  );

  if (!signatures.has("get_radan_v1(company_id text, processes text[])")) {
    throw new Error("Missing expected Radan function: get_radan_v1(company_id text, processes text[])");
  }
}

async function setupFixtures(db) {
  await db.query("BEGIN");

  try {
    await db.query("SET LOCAL session_replication_role = replica");
    await db.query(`
      INSERT INTO "user" (
        id, email, "firstName", "lastName", "fullName", about,
        "acknowledgedITAR", "createdAt", flags, "isConsoleOperator"
      )
      VALUES
        ('user-co1', 'co1@example.com', 'Company', 'One', 'Company One', '', true, NOW(), '{}'::jsonb, false),
        ('user-co2', 'co2@example.com', 'Company', 'Two', 'Company Two', '', true, NOW(), '{}'::jsonb, false)
    `);

    await db.query(`
      INSERT INTO "companyGroup" (id, name, "createdAt", "createdBy")
      VALUES
        ('cg1', 'Company group 1', NOW(), 'user-co1'),
        ('cg2', 'Company group 2', NOW(), 'user-co2')
    `);

    await db.query(`
      INSERT INTO "company" (
        id, active, "auditLogEnabled", "baseCurrencyCode", "companyGroupId",
        "createdAt", "isEliminationEntity", name, "parentCompanyId",
        "suggestionNotificationGroup"
      )
      VALUES
        ('co1', true, false, 'USD', 'cg1', NOW(), false, 'Company 1', NULL, ARRAY[]::text[]),
        ('co2', true, false, 'USD', 'cg2', NOW(), false, 'Company 2', NULL, ARRAY[]::text[])
    `);

    await db.query(`
      INSERT INTO "userToCompany" ("userId", "companyId", role)
      VALUES
        ('user-co1', 'co1', 'employee'),
        ('user-co2', 'co2', 'employee')
    `);

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
      INSERT INTO "materialSubstance" (
        id, code, "companyId", "createdAt", "createdBy", "customFields", name
      )
      VALUES
        ('substance-co1', 'S1', 'co1', NOW(), 'user-co1', '{}'::jsonb, 'Substance co1'),
        ('substance-leak-co2', 'SX', 'co2', NOW(), 'user-co2', '{}'::jsonb, 'Substance leak')
    `);

    await db.query(`
      INSERT INTO "materialForm" (
        id, code, "companyId", "createdAt", "createdBy", "customFields", name
      )
      VALUES
        ('form-co1', 'F1', 'co1', NOW(), 'user-co1', '{}'::jsonb, 'Form co1'),
        ('form-leak-co2', 'FX', 'co2', NOW(), 'user-co2', '{}'::jsonb, 'Form leak')
    `);

    await db.query(`
      INSERT INTO "materialDimension" (
        id, "companyId", "isMetric", "materialFormId", name
      )
      VALUES
        ('dimension-co1', 'co1', true, 'form-co1', 'Dimension co1'),
        ('dimension-leak-co2', 'co2', true, 'form-leak-co2', 'Dimension leak')
    `);

    await db.query(`
      INSERT INTO "materialFinish" (
        id, "companyId", "materialSubstanceId", name
      )
      VALUES
        ('finish-co1', 'co1', 'substance-co1', 'Finish co1'),
        ('finish-leak-co2', 'co2', 'substance-leak-co2', 'Finish leak')
    `);

    await db.query(`
      INSERT INTO "materialGrade" (
        id, "companyId", "materialSubstanceId", name
      )
      VALUES
        ('grade-co1', 'co1', 'substance-co1', 'Grade co1'),
        ('grade-leak-co2', 'co2', 'substance-leak-co2', 'Grade leak')
    `);

    await db.query(`
      INSERT INTO "material" (
        id, approved, "companyId", "createdAt", "createdBy", "customFields",
        "dimensionId", "finishId", "gradeId", "materialFormId", "materialSubstanceId"
      )
      VALUES
        ('MAT-CO1', true, 'co1', NOW(), 'user-co1', '{}'::jsonb, 'dimension-co1', 'finish-co1', 'grade-co1', 'form-co1', 'substance-co1'),
        ('MAT-LEAK', true, 'co2', NOW(), 'user-co2', '{}'::jsonb, 'dimension-leak-co2', 'finish-leak-co2', 'grade-leak-co2', 'form-leak-co2', 'substance-leak-co2')
    `);

    await db.query(`
      INSERT INTO "item" (
        id, name, "readableId", "readableIdWithRevision", revision, active,
        "companyId", "createdAt", "createdBy", embedding, "itemTrackingType",
        "replenishmentSystem", "requiresInspection", type, "unitOfMeasureCode"
      )
      VALUES
        (
          'item-fg-co1', 'Finished good co1', 'FG-CO1', 'FG-CO1/A', 'A', true,
          'co1', NOW(), 'user-co1', '[0]', 'Inventory',
          'Make', false, 'Part', 'EA'
        ),
        (
          'item-fg-co2', 'Finished good co2', 'FG-CO2', 'FG-CO2/A', 'A', true,
          'co2', NOW(), 'user-co2', '[0]', 'Inventory',
          'Make', false, 'Part', 'EA'
        ),
        (
          'item-mat-co1', 'Material co1', 'MAT-CO1', 'MAT-CO1/A', 'A', true,
          'co1', NOW(), 'user-co1', '[0]', 'Inventory',
          'Buy', false, 'Material', 'EA'
        ),
        (
          'item-mat-shadow-co1', 'Material shadow co1', 'MAT-LEAK', 'MAT-LEAK/A', 'A', true,
          'co1', NOW(), 'user-co1', '[0]', 'Inventory',
          'Buy', false, 'Material', 'EA'
        ),
        (
          'item-mat-leak-co2', 'Material leak co2', 'MAT-LEAK', 'MAT-LEAK/A', 'A', true,
          'co2', NOW(), 'user-co2', '[0]', 'Inventory',
          'Buy', false, 'Material', 'EA'
        )
    `);

    await db.query(`
      INSERT INTO "salesOrder" (
        id, "companyId", "createdAt", "createdBy", "currencyCode",
        "customerId", "revisionId", "salesOrderId", status
      )
      VALUES
        ('so-co1', 'co1', NOW(), 'user-co1', 'USD', 'customer-co1', 1, 'SO-CO1', 'Confirmed'),
        ('so-co2', 'co2', NOW(), 'user-co2', 'USD', 'customer-co2', 1, 'SO-LEAK', 'Confirmed')
    `);

    await db.query(`
      INSERT INTO "salesOrderLine" (
        id, "addOnCost", "companyId", "createdAt", "createdBy",
        "invoicedComplete", "methodType", "nonTaxableAddOnCost",
        "requiresInspection", "salesOrderId", "salesOrderLineType",
        "sentComplete", "shippingCost", "sortOrder", status, "taxPercent"
      )
      VALUES
        ('sol-co1', 0, 'co1', NOW(), 'user-co1', false, 'Make to Order', 0, false, 'so-co1', 'Part', false, 0, 1, 'Ordered', 0),
        ('sol-co2', 0, 'co2', NOW(), 'user-co2', false, 'Make to Order', 0, false, 'so-co2', 'Part', false, 0, 1, 'Ordered', 0)
    `);

    await db.query(`
      INSERT INTO "job" (
        id, "companyId", "createdAt", "createdBy", "deadlineType", "dueDate",
        "itemId", "jobId", "locationId", priority, quantity,
        "quantityComplete", "quantityReceivedToInventory", "quantityShipped",
        "salesOrderId", "salesOrderLineId", "scrapQuantity", status,
        "unitOfMeasureCode"
      )
      VALUES
        ('job-good', 'co1', NOW(), 'user-co1', 'No Deadline', DATE '2026-01-15', 'item-fg-co1', 'J-GOOD', 'loc-co1', 1, 10, 0, 0, 0, 'so-co1', 'sol-co1', 0, 'Ready', 'EA'),
        ('job-cross-sales', 'co1', NOW(), 'user-co1', 'No Deadline', DATE '2026-01-16', 'item-fg-co1', 'J-CROSS-SALES', 'loc-co1', 2, 10, 0, 0, 0, 'so-co2', 'sol-co2', 0, 'Ready', 'EA'),
        ('job-cross-location', 'co1', NOW(), 'user-co1', 'No Deadline', DATE '2026-01-17', 'item-fg-co1', 'J-CROSS-LOCATION', 'loc-co2', 3, 10, 0, 0, 0, NULL, NULL, 0, 'Ready', 'EA')
    `);

    await db.query(`
      INSERT INTO "jobMakeMethod" (
        id, "companyId", "createdAt", "createdBy", "itemId",
        "itemScrapPercentage", "jobId", "quantityPerParent",
        "requiresBatchTracking", "requiresSerialTracking", version
      )
      VALUES
        ('jmm-good', 'co1', NOW(), 'user-co1', 'item-fg-co1', 0, 'job-good', 1, false, false, 1),
        ('jmm-cross-sales', 'co1', NOW(), 'user-co1', 'item-fg-co1', 0, 'job-cross-sales', 1, false, false, 1),
        ('jmm-cross-company', 'co2', NOW(), 'user-co2', 'item-fg-co2', 0, 'job-good', 1, false, false, 1)
    `);

    await db.query(`
      INSERT INTO "jobMaterial" (
        id, "companyId", "createdAt", "createdBy", description,
        "itemId", "itemScrapPercentage", "itemType", "jobId",
        "jobMakeMethodId", kit, "methodType", "order", quantity,
        "requiresBatchTracking", "requiresSerialTracking", "scrapQuantity",
        "unitCost"
      )
      VALUES
        ('jm-good', 'co1', NOW(), 'user-co1', 'Material co1', 'item-mat-co1', 0, 'Material', 'job-good', 'jmm-good', false, 'Pull from Inventory', 10, 1, false, false, 0, 0),
        ('jm-cross-sales', 'co1', NOW(), 'user-co1', 'Material shadow co1', 'item-mat-shadow-co1', 0, 'Material', 'job-cross-sales', 'jmm-cross-sales', false, 'Pull from Inventory', 10, 1, false, false, 0, 0),
        ('jm-leak', 'co2', NOW(), 'user-co2', 'Material leak co2', 'item-mat-leak-co2', 0, 'Material', 'job-good', 'jmm-good', false, 'Pull from Inventory', 99, 1, false, false, 0, 0)
    `);

    await db.query(`
      INSERT INTO "jobOperation" (
        id, "companyId", "createdAt", "createdBy", description, "jobId",
        "jobMakeMethodId", "laborRate", "laborTime", "laborUnit",
        "machineRate", "machineTime", "machineUnit", "operationLeadTime",
        "operationMinimumCost", "operationOrder", "operationQuantity",
        "operationType", "operationUnitCost", "order", "overheadRate",
        priority, "processId", "quantityComplete", "quantityScrapped",
        "setupTime", "setupUnit", status, tags, "workCenterId",
        "workInstruction"
      )
      VALUES
        ('op-good', 'co1', NOW(), 'user-co1', 'Good operation', 'job-good', 'jmm-good', 0, 1, 'Hours/Piece', 0, 1, 'Hours/Piece', 0, 0, 'After Previous', 10, 'Inside', 0, 10, 0, 1, 'cut', 0, 0, 0, 'Total Minutes', 'Ready', ARRAY['co1']::text[], 'wc-co1', '{}'::jsonb),
        ('op-cross-sales', 'co1', NOW(), 'user-co1', 'Cross-sales operation', 'job-cross-sales', 'jmm-cross-sales', 0, 1, 'Hours/Piece', 0, 1, 'Hours/Piece', 0, 0, 'After Previous', 10, 'Inside', 0, 20, 0, 2, 'cut', 0, 0, 0, 'Total Minutes', 'Ready', ARRAY['co1']::text[], 'wc-co1', '{}'::jsonb),
        ('op-cross-location', 'co1', NOW(), 'user-co1', 'Cross-location operation', 'job-cross-location', 'jmm-good', 0, 1, 'Hours/Piece', 0, 1, 'Hours/Piece', 0, 0, 'After Previous', 10, 'Inside', 0, 30, 0, 3, 'cut', 0, 0, 0, 'Total Minutes', 'Ready', ARRAY['co1']::text[], 'wc-co1', '{}'::jsonb),
        ('op-cross-company', 'co2', NOW(), 'user-co2', 'Cross-company operation', 'job-good', 'jmm-good', 0, 1, 'Hours/Piece', 0, 1, 'Hours/Piece', 0, 0, 'After Previous', 10, 'Inside', 0, 40, 0, 4, 'cut', 0, 0, 0, 'Total Minutes', 'Ready', ARRAY['co2']::text[], 'wc-co2', '{}'::jsonb),
        ('op-cross-jmm', 'co1', NOW(), 'user-co1', 'Cross-make-method operation', 'job-good', 'jmm-cross-company', 0, 1, 'Hours/Piece', 0, 1, 'Hours/Piece', 0, 0, 'After Previous', 10, 'Inside', 0, 50, 0, 5, 'cut', 0, 0, 0, 'Total Minutes', 'Ready', ARRAY['co1']::text[], 'wc-co1', '{}'::jsonb),
        ('op-other-process', 'co1', NOW(), 'user-co1', 'Other process operation', 'job-good', 'jmm-good', 0, 1, 'Hours/Piece', 0, 1, 'Hours/Piece', 0, 0, 'After Previous', 10, 'Inside', 0, 60, 0, 6, 'waterjet', 0, 0, 0, 'Total Minutes', 'Ready', ARRAY['co1']::text[], 'wc-co1', '{}'::jsonb),
        ('op-done', 'co1', NOW(), 'user-co1', 'Done operation', 'job-good', 'jmm-good', 0, 1, 'Hours/Piece', 0, 1, 'Hours/Piece', 0, 0, 'After Previous', 10, 'Inside', 0, 70, 0, 7, 'cut', 0, 0, 0, 'Total Minutes', 'Done', ARRAY['co1']::text[], 'wc-co1', '{}'::jsonb)
    `);

    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function verifyOwnerRadanScope(db) {
  const rows = await fetchRadanRows(db, "co1", ["cut"]);
  assertRadanRows(rows, "owner co1 cut");

  const otherProcessRows = await fetchRadanRows(db, "co1", ["laser"]);
  expectEqual(otherProcessRows.length, 0, "owner co1 process-filtered row count");

  const co2Rows = await fetchRadanRows(db, "co2", ["cut"]);
  expectEqual(co2Rows.length, 0, "owner co2 row count");
}

async function verifyAppRadanScope(db) {
  const co1Rows = await withAppUser(db, "user-co1", (client) =>
    fetchRadanRows(client, "co1", ["cut"])
  );
  assertRadanRows(co1Rows, "carbon_app user-co1 cut");

  const co2AsCo1Rows = await withAppUser(db, "user-co2", (client) =>
    fetchRadanRows(client, "co1", ["cut"])
  );
  expectEqual(
    co2AsCo1Rows.length,
    0,
    "carbon_app user-co2 row count for co1 parameter"
  );
}

async function fetchRadanRows(db, companyId, processes) {
  const result = await db.query(
    `
      SELECT *
      FROM get_radan_v1($1, $2::text[])
      ORDER BY "id"
    `,
    [companyId, processes]
  );
  return result.rows;
}

function assertRadanRows(rows, label) {
  const ids = rows.map((row) => row.id);
  expectEqual(ids, ["op-cross-sales", "op-good"], `${label} operation ids`);

  const byId = new Map(rows.map((row) => [row.id, row]));
  const good = byId.get("op-good");
  const crossSales = byId.get("op-cross-sales");

  expectEqual(good.materialItemReadableId, "MAT-CO1", `${label} good material item`);
  expectEqual(good.materialSubstance, "Substance co1", `${label} good material substance`);
  expectEqual(good.materialForm, "Form co1", `${label} good material form`);
  expectEqual(good.materialDimension, "Dimension co1", `${label} good material dimension`);
  expectEqual(good.materialFinish, "Finish co1", `${label} good material finish`);
  expectEqual(good.materialGrade, "Grade co1", `${label} good material grade`);
  expectEqual(good.salesOrderReadableId, "SO-CO1", `${label} good sales order readable id`);
  expectEqual(good.salesOrderId, "so-co1", `${label} good sales order id`);

  expectEqual(
    crossSales.salesOrderReadableId,
    null,
    `${label} cross-company sales order readable id`
  );
  expectEqual(crossSales.salesOrderId, null, `${label} cross-company sales order id`);
  expectEqual(
    crossSales.materialItemReadableId,
    "MAT-LEAK",
    `${label} shadow material item readable id`
  );
  expectEqual(crossSales.materialSubstance, null, `${label} shadow material substance`);
  expectEqual(crossSales.materialForm, null, `${label} shadow material form`);
  expectEqual(crossSales.materialDimension, null, `${label} shadow material dimension`);
  expectEqual(crossSales.materialFinish, null, `${label} shadow material finish`);
  expectEqual(crossSales.materialGrade, null, `${label} shadow material grade`);
}

async function withAppUser(pool, userId, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function expectEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Unexpected ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
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
