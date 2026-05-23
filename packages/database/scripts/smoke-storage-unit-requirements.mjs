import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-storage-unit-requirements-smoke-${process.pid}`;
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
    await verifyStorageUnitRequirementScope(pool);

    console.log("Storage-unit requirement RPC smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- storage-unit requirement RPCs require company_id");
    console.log("- item, storage-unit, model-upload, and pick-method joins stay company-scoped");
    console.log("- child demand/supply rows cannot leak across parent document scope");
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
        'get_item_storage_unit_requirements_by_location',
        'get_item_storage_unit_requirements_by_location_and_item'
      )
    ORDER BY proname, args
  `);

  const signatures = new Set(
    result.rows.map((row) => `${row.proname}(${row.args})`)
  );
  const expected = [
    "get_item_storage_unit_requirements_by_location(company_id text, location_id text)",
    "get_item_storage_unit_requirements_by_location_and_item(company_id text, location_id text, item_id text)"
  ];

  for (const signature of expected) {
    if (!signatures.has(signature)) {
      throw new Error(`Missing expected storage-unit function: ${signature}`);
    }
  }

  for (const signature of signatures) {
    if (
      signature === "get_item_storage_unit_requirements_by_location(location_id text)" ||
      signature ===
        "get_item_storage_unit_requirements_by_location_and_item(location_id text, item_id text)"
    ) {
      throw new Error(
        `Legacy unscoped storage-unit requirement function remains: ${signature}`
      );
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
      VALUES
        ('model-leak-co2', 'co2', 'user-co2', 'co2/leak.step', 'Leak model', 42, 'co2/leak.png')
    `);

    await db.query(`
      INSERT INTO "item" (
        id, name, "readableId", "readableIdWithRevision", revision, active,
        "companyId", "createdAt", "createdBy", embedding, "itemTrackingType",
        "modelUploadId", "replenishmentSystem", "requiresInspection", type,
        "unitOfMeasureCode"
      )
      VALUES
        (
          'item-co1', 'Item co1', 'ITEM-CO1', 'ITEM-CO1/A', 'A', true,
          'co1', NOW(), 'user-co1', '[0]', 'Inventory',
          'model-leak-co2', 'Buy', false, 'Part', 'EA'
        ),
        (
          'item-co2', 'Item co2', 'ITEM-CO2', 'ITEM-CO2/A', 'A', true,
          'co2', NOW(), 'user-co2', '[0]', 'Inventory',
          NULL, 'Buy', false, 'Part', 'EA'
        )
    `);

    await db.query(`
      INSERT INTO "storageUnit" (
        id, name, active, "locationId", "storageTypeIds", "companyId",
        "createdAt", "createdBy"
      )
      VALUES
        ('su-co1', 'Storage co1', true, 'loc-co1', ARRAY[]::text[], 'co1', NOW(), 'user-co1'),
        ('su-leak-co2', 'Storage leak co2', true, 'loc-co1', ARRAY[]::text[], 'co2', NOW(), 'user-co2'),
        ('su-co2', 'Storage co2', true, 'loc-co2', ARRAY[]::text[], 'co2', NOW(), 'user-co2')
    `);

    await db.query(`
      INSERT INTO "pickMethod" (
        "companyId", "createdAt", "createdBy", "defaultStorageUnitId",
        "itemId", "locationId"
      )
      VALUES
        ('co1', NOW(), 'user-co1', 'su-co1', 'item-co1', 'loc-co1'),
        ('co2', NOW(), 'user-co2', 'su-leak-co2', 'item-co1', 'loc-co1')
    `);

    await db.query(`
      INSERT INTO "itemLedger" (
        id, "companyId", "createdAt", "createdBy", "entryNumber",
        "entryType", "itemId", "locationId", "postingDate", quantity,
        "storageUnitId"
      )
      VALUES
        ('ledger-co1', 'co1', NOW(), 'user-co1', 1, 'Positive Adjmt.', 'item-co1', 'loc-co1', CURRENT_DATE, 5, 'su-co1'),
        ('ledger-cross-storage', 'co1', NOW(), 'user-co1', 2, 'Positive Adjmt.', 'item-co1', 'loc-co1', CURRENT_DATE, 7, 'su-leak-co2'),
        ('ledger-co2', 'co2', NOW(), 'user-co2', 3, 'Positive Adjmt.', 'item-co2', 'loc-co1', CURRENT_DATE, 99, 'su-co1')
    `);

    await db.query(`
      INSERT INTO "job" (
        id, "companyId", "createdAt", "createdBy", "deadlineType", "itemId",
        "jobId", "locationId", priority, "productionQuantity", quantity,
        "quantityComplete", "quantityReceivedToInventory", "quantityShipped",
        "scrapQuantity", status, "unitOfMeasureCode"
      )
      VALUES (
        'job-co1', 'co1', NOW(), 'user-co1', 'No Deadline', 'item-co1',
        'JOB-CO1', 'loc-co1', 1, 0, 1, 0, 0, 0, 0, 'Ready', 'EA'
      )
    `);

    await db.query(`
      INSERT INTO "jobMaterial" (
        id, "companyId", "createdAt", "createdBy", description, "itemId",
        "itemScrapPercentage", "itemType", "jobId", "jobMakeMethodId", kit,
        "methodType", "order", quantity, "quantityToIssue",
        "requiresBatchTracking", "requiresSerialTracking", "scrapQuantity",
        "storageUnitId", "unitCost", "unitOfMeasureCode"
      )
      VALUES (
        'job-material-leak', 'co2', NOW(), 'user-co2', 'Cross-company demand',
        'item-co1', 0, 'Part', 'job-co1', 'job-make-method-leak', false,
        'Pull from Inventory', 1, 11, 11, false, false, 0, 'su-co1', 0, 'EA'
      )
    `);

    await db.query(`
      INSERT INTO "stockTransfer" (
        id, "stockTransferId", "locationId", status, "companyId",
        "createdAt", "createdBy"
      )
      VALUES (
        'stock-transfer-co1', 'ST-CO1', 'loc-co1', 'Released', 'co1',
        NOW(), 'user-co1'
      )
    `);

    await db.query(`
      INSERT INTO "stockTransferLine" (
        id, "stockTransferId", "itemId", quantity, "outstandingQuantity",
        "pickedQuantity", "fromStorageUnitId", "toStorageUnitId",
        "requiresBatchTracking", "requiresSerialTracking", "companyId",
        "createdAt", "createdBy"
      )
      VALUES
        (
          'stock-transfer-line-from-leak', 'stock-transfer-co1', 'item-co1',
          13, 13, 0, 'su-co1', NULL, false, false, 'co2', NOW(), 'user-co2'
        ),
        (
          'stock-transfer-line-to-leak', 'stock-transfer-co1', 'item-co1',
          17, 17, 0, NULL, 'su-co1', false, false, 'co2', NOW(), 'user-co2'
        )
    `);

    await db.query(`
      INSERT INTO "purchaseOrder" (
        id, "purchaseOrderId", "purchaseOrderType", "revisionId", status,
        "supplierId", "supplierInteractionId", "companyId", "createdAt",
        "createdBy", "currencyCode", "exchangeRate"
      )
      VALUES (
        'purchase-order-co1', 'PO-CO1', 'Purchase', 0, 'To Receive',
        'supplier-co1', 'supplier-interaction-co1', 'co1', NOW(), 'user-co1',
        'USD', 1
      )
    `);

    await db.query(`
      INSERT INTO "purchaseOrderLine" (
        id, "purchaseOrderId", "purchaseOrderLineType", "itemId",
        "locationId", "purchaseQuantity", "quantityReceived",
        "quantityToReceive", "purchaseUnitOfMeasureCode",
        "inventoryUnitOfMeasureCode", "conversionFactor", "unitPrice",
        "supplierUnitPrice", "exchangeRate", "invoicedComplete",
        "receivedComplete", "requiresInspection", "sortOrder",
        "storageUnitId", "supplierShippingCost", "supplierTaxAmount",
        "companyId", "createdAt", "createdBy"
      )
      VALUES (
        'purchase-order-line-leak', 'purchase-order-co1', 'Part', 'item-co1',
        'loc-co1', 19, 0, 19, 'EA', 'EA', 1, 10, 10, 1, false, false,
        false, 1, 'su-co1', 0, 0, 'co2', NOW(), 'user-co2'
      )
    `);

    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function verifyStorageUnitRequirementScope(db) {
  const result = await db.query(`
    SELECT
      "itemId",
      "thumbnailPath",
      "quantityOnHandInStorageUnit",
      "quantityRequiredByStorageUnit",
      "quantityIncoming",
      "storageUnitId",
      "storageUnitName",
      "isDefaultStorageUnit"
    FROM get_item_storage_unit_requirements_by_location('co1', 'loc-co1')
    ORDER BY "storageUnitId"
  `);

  if (result.rows.length !== 2) {
    throw new Error(`Expected 2 scoped rows, got ${JSON.stringify(result.rows)}`);
  }

  const primary = result.rows.find((row) => row.storageUnitId === "su-co1");
  const crossStorage = result.rows.find(
    (row) => row.storageUnitId === "su-leak-co2"
  );

  expectEqual(primary?.itemId, "item-co1", "primary item id");
  expectEqual(primary?.storageUnitName, "Storage co1", "primary storage name");
  expectEqual(Number(primary?.quantityOnHandInStorageUnit), 5, "primary on hand");
  expectEqual(
    Number(primary?.quantityRequiredByStorageUnit),
    0,
    "cross-company demand exclusion"
  );
  expectEqual(
    Number(primary?.quantityIncoming),
    0,
    "cross-company incoming exclusion"
  );
  expectEqual(primary?.thumbnailPath, null, "cross-company model thumbnail");
  expectEqual(primary?.isDefaultStorageUnit, true, "company pick method");

  expectEqual(
    crossStorage?.storageUnitName,
    null,
    "cross-company storage-unit metadata"
  );
  expectEqual(
    Number(crossStorage?.quantityOnHandInStorageUnit),
    7,
    "cross-storage ledger quantity"
  );
  expectEqual(
    crossStorage?.isDefaultStorageUnit,
    false,
    "cross-company pick-method metadata"
  );

  await expectNoRows(
    db,
    `SELECT "itemId"
     FROM get_item_storage_unit_requirements_by_location_and_item(
       'co1',
       'loc-co1',
       'item-co2'
     )`
  );
  await expectNoRows(
    db,
    `SELECT "itemId"
     FROM get_item_storage_unit_requirements_by_location(
       'co2',
       'loc-co1'
     )
     WHERE "itemId" = 'item-co1'`
  );
}

async function expectNoRows(db, sql) {
  const result = await db.query(sql);

  if (result.rows.length !== 0) {
    throw new Error(
      `Expected no rows for ${sql}, got ${JSON.stringify(result.rows)}`
    );
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
