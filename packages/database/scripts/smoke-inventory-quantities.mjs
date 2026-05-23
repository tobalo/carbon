import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-inventory-quantities-smoke-${process.pid}`;
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
    await verifyItemStorageUnitQuantities(pool);
    await verifyJobQuantityOnHand(pool);
    await verifyInventoryQuantities(pool);

    console.log("Inventory quantity RPC smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- inventory quantity RPCs require company_id and location_id");
    console.log("- storage-unit, tracked-entity, model, planning, and taxonomy metadata stay company-scoped");
    console.log("- child supply/demand rows cannot leak across parent document scope");
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
        'get_item_quantities_by_tracking_id',
        'get_job_quantity_on_hand',
        'get_inventory_quantities'
      )
    ORDER BY proname, args
  `);

  const signatures = new Set(
    result.rows.map((row) => `${row.proname}(${row.args})`)
  );
  const expected = [
    "get_inventory_quantities(company_id text, location_id text)",
    "get_item_quantities_by_tracking_id(item_id text, company_id text, location_id text)",
    "get_job_quantity_on_hand(job_id text, company_id text, location_id text)"
  ];

  for (const signature of expected) {
    if (!signatures.has(signature)) {
      throw new Error(`Missing expected inventory quantity function: ${signature}`);
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
      INSERT INTO "materialDimension" (
        id, "companyId", "isMetric", "materialFormId", name
      )
      VALUES ('dim-leak-co2', 'co2', true, 'form-leak-co2', 'Dimension leak')
    `);
    await db.query(`
      INSERT INTO "materialFinish" (
        id, "companyId", "materialSubstanceId", name
      )
      VALUES ('finish-leak-co2', 'co2', 'substance-leak-co2', 'Finish leak')
    `);
    await db.query(`
      INSERT INTO "materialGrade" (
        id, "companyId", "materialSubstanceId", name
      )
      VALUES ('grade-leak-co2', 'co2', 'substance-leak-co2', 'Grade leak')
    `);
    await db.query(`
      INSERT INTO "materialType" (
        id, code, "companyId", "materialFormId", "materialSubstanceId", name
      )
      VALUES ('material-type-leak-co2', 'LEAK', 'co2', 'form-leak-co2', 'substance-leak-co2', 'Material type leak')
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
          'item-material-co1', 'Material co1', 'MAT-CO1', 'MAT-CO1/A', 'A', true,
          'co1', NOW(), 'user-co1', '[0]', 'Inventory',
          NULL, 'Buy', false, 'Material', 'EA'
        ),
        (
          'item-fg-co1', 'Finished good co1', 'FG-CO1', 'FG-CO1/A', 'A', true,
          'co1', NOW(), 'user-co1', '[0]', 'Inventory',
          NULL, 'Make', false, 'Part', 'EA'
        ),
        (
          'item-co2', 'Item co2', 'ITEM-CO2', 'ITEM-CO2/A', 'A', true,
          'co2', NOW(), 'user-co2', '[0]', 'Inventory',
          NULL, 'Buy', false, 'Part', 'EA'
        )
    `);

    await db.query(`
      INSERT INTO "material" (
        id, approved, "companyId", "createdAt", "createdBy", "dimensionId",
        "finishId", "gradeId", "materialFormId", "materialSubstanceId",
        "materialTypeId"
      )
      VALUES (
        'MAT-CO1', true, 'co1', NOW(), 'user-co1', 'dim-leak-co2',
        'finish-leak-co2', 'grade-leak-co2', 'form-leak-co2',
        'substance-leak-co2', 'material-type-leak-co2'
      )
    `);

    await db.query(`
      INSERT INTO "storageUnit" (
        id, name, active, "locationId", "storageTypeIds", "companyId",
        "createdAt", "createdBy"
      )
      VALUES
        ('su-co1', 'Storage co1', true, 'loc-co1', ARRAY['storage-type-co1']::text[], 'co1', NOW(), 'user-co1'),
        ('su-leak-co2', 'Storage leak co2', true, 'loc-co1', ARRAY['storage-type-leak']::text[], 'co2', NOW(), 'user-co2'),
        ('su-co2', 'Storage co2', true, 'loc-co2', ARRAY[]::text[], 'co2', NOW(), 'user-co2')
    `);

    await db.query(`
      INSERT INTO "trackedEntity" (
        id, attributes, "companyId", "createdAt", "createdBy", "itemId",
        quantity, "readableId", "sourceDocument", "sourceDocumentId", status
      )
      VALUES (
        'tracked-leak-co2', '{}'::jsonb, 'co2', NOW(), 'user-co2', 'item-co1',
        7, 'TRACK-LEAK', 'Receipt', 'receipt-leak', 'Available'
      )
    `);

    await db.query(`
      INSERT INTO "itemLedger" (
        id, "companyId", "createdAt", "createdBy", "entryNumber",
        "entryType", "itemId", "locationId", "postingDate", quantity,
        "storageUnitId", "trackedEntityId"
      )
      VALUES
        ('ledger-co1', 'co1', NOW(), 'user-co1', 1, 'Positive Adjmt.', 'item-co1', 'loc-co1', CURRENT_DATE, 5, 'su-co1', NULL),
        ('ledger-cross-metadata', 'co1', NOW(), 'user-co1', 2, 'Positive Adjmt.', 'item-co1', 'loc-co1', CURRENT_DATE, 7, 'su-leak-co2', 'tracked-leak-co2'),
        ('ledger-co2', 'co2', NOW(), 'user-co2', 3, 'Positive Adjmt.', 'item-co2', 'loc-co1', CURRENT_DATE, 99, 'su-co1', NULL)
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
      VALUES (
        'co2', NOW(), 'user-co2', false, false, 99, 99,
        'item-co1', 'loc-co1', 99, 99, 99, 99,
        'Fixed Reorder Quantity', 99, 99
      )
    `);

    await db.query(`
      INSERT INTO "job" (
        id, "companyId", "createdAt", "createdBy", "deadlineType", "itemId",
        "jobId", "locationId", priority, "productionQuantity", quantity,
        "quantityComplete", "quantityReceivedToInventory", "quantityShipped",
        "scrapQuantity", status, "unitOfMeasureCode"
      )
      VALUES
        (
          'job-co1', 'co1', NOW(), 'user-co1', 'No Deadline', 'item-fg-co1',
          'JOB-CO1', 'loc-co1', 1, 1, 1, 0, 0, 0, 0, 'Ready', 'EA'
        ),
        (
          'job-demand-parent-co1', 'co1', NOW(), 'user-co1', 'No Deadline', 'item-fg-co1',
          'JOB-DEMAND-CO1', 'loc-co1', 1, 1, 1, 0, 0, 0, 0, 'Ready', 'EA'
        ),
        (
          'job-production-leak', 'co2', NOW(), 'user-co2', 'No Deadline', 'item-co1',
          'JOB-PROD-LEAK', 'loc-co1', 1, 29, 29, 0, 0, 0, 0, 'Ready', 'EA'
        )
    `);

    await db.query(`
      INSERT INTO "jobMaterial" (
        id, "companyId", "createdAt", "createdBy", description, "itemId",
        "itemScrapPercentage", "itemType", "jobId", "jobMakeMethodId", kit,
        "methodType", "order", quantity, "estimatedQuantity",
        "quantityIssued", "quantityToIssue", "requiresBatchTracking",
        "requiresSerialTracking", "scrapQuantity", "storageUnitId",
        "unitCost", "unitOfMeasureCode"
      )
      VALUES
        (
          'job-material-co1', 'co1', NOW(), 'user-co1', 'Scoped material',
          'item-co1', 0, 'Part', 'job-co1', 'job-make-method-co1', false,
          'Pull from Inventory', 1, 2, 4, 1, 0, false, false, 0,
          'su-co1', 0, 'EA'
        ),
        (
          'job-material-demand-leak', 'co2', NOW(), 'user-co2', 'Cross-company demand',
          'item-co1', 0, 'Part', 'job-demand-parent-co1', 'job-make-method-leak', false,
          'Pull from Inventory', 1, 31, 31, 0, 31, false, false, 0,
          'su-co1', 0, 'EA'
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

    await db.query(`
      INSERT INTO "salesOrder" (
        id, "salesOrderId", "customerId", "currencyCode", "revisionId",
        status, "locationId", "companyId", "createdAt", "createdBy"
      )
      VALUES (
        'sales-order-co1', 'SO-CO1', 'customer-co1', 'USD', 0,
        'Confirmed', 'loc-co1', 'co1', NOW(), 'user-co1'
      )
    `);

    await db.query(`
      INSERT INTO "salesOrderLine" (
        id, "salesOrderId", "itemId", "locationId", "methodType",
        "quantityToSend", "salesOrderLineType", "unitOfMeasureCode",
        "addOnCost", "nonTaxableAddOnCost", "shippingCost", "sortOrder",
        "taxPercent", "invoicedComplete", "requiresInspection", "sentComplete",
        status, "companyId", "createdAt", "createdBy"
      )
      VALUES (
        'sales-order-line-leak', 'sales-order-co1', 'item-co1', 'loc-co1',
        'Pull from Inventory', 23, 'Part', 'EA', 0, 0, 0, 1, 0, false,
        false, false, 'Ordered', 'co2', NOW(), 'user-co2'
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

    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function verifyItemStorageUnitQuantities(db) {
  const result = await db.query(`
    SELECT
      "storageUnitId",
      "storageUnitName",
      "trackedEntityId",
      "readableId",
      quantity
    FROM get_item_quantities_by_tracking_id('item-co1', 'co1', 'loc-co1')
    ORDER BY "storageUnitId", "trackedEntityId" NULLS FIRST
  `);

  if (result.rows.length !== 2) {
    throw new Error(
      `Expected 2 item storage rows, got ${JSON.stringify(result.rows)}`
    );
  }

  const primary = result.rows.find((row) => row.storageUnitId === "su-co1");
  const crossMetadata = result.rows.find(
    (row) => row.storageUnitId === "su-leak-co2"
  );

  expectEqual(primary?.storageUnitName, "Storage co1", "scoped storage name");
  expectEqual(primary?.readableId, null, "primary tracked readable id");
  expectNumeric(primary?.quantity, 5, "primary storage quantity");

  expectEqual(
    crossMetadata?.storageUnitName,
    null,
    "cross-company storage-unit metadata"
  );
  expectEqual(
    crossMetadata?.trackedEntityId,
    "tracked-leak-co2",
    "cross-company tracked entity id from ledger"
  );
  expectEqual(
    crossMetadata?.readableId,
    null,
    "cross-company tracked-entity readable id"
  );
  expectNumeric(crossMetadata?.quantity, 7, "cross metadata ledger quantity");
}

async function verifyJobQuantityOnHand(db) {
  const result = await db.query(`
    SELECT *
    FROM get_job_quantity_on_hand('job-co1', 'co1', 'loc-co1')
  `);

  if (result.rows.length !== 1) {
    throw new Error(
      `Expected 1 job material quantity row, got ${JSON.stringify(result.rows)}`
    );
  }

  const row = result.rows[0];

  expectEqual(row.id, "job-material-co1", "job material id");
  expectEqual(row.itemReadableId, "ITEM-CO1", "job material item");
  expectEqual(row.thumbnailPath, null, "cross-company model thumbnail");
  expectEqual(row.storageUnitName, "Storage co1", "job storage-unit metadata");
  expectNumeric(row.quantityOnHandInStorageUnit, 5, "on-hand in storage unit");
  expectNumeric(row.quantityOnHandNotInStorageUnit, 7, "on-hand outside storage unit");
  expectNumeric(row.quantityOnSalesOrder, 0, "cross-company sales demand");
  expectNumeric(row.quantityOnPurchaseOrder, 0, "cross-company purchase supply");
  expectNumeric(row.quantityOnProductionOrder, 0, "cross-company production supply");
  expectNumeric(
    row.quantityFromProductionOrderInStorageUnit,
    0,
    "cross-company production demand in storage"
  );
  expectNumeric(
    row.quantityFromProductionOrderNotInStorageUnit,
    0,
    "cross-company production demand outside storage"
  );
  expectNumeric(row.quantityInTransitToStorageUnit, 0, "cross-company transfers");
}

async function verifyInventoryQuantities(db) {
  const result = await db.query(`
    SELECT *
    FROM get_inventory_quantities('co1', 'loc-co1')
    WHERE id IN ('item-co1', 'item-material-co1')
    ORDER BY id
  `);

  if (result.rows.length !== 2) {
    throw new Error(
      `Expected 2 inventory quantity rows, got ${JSON.stringify(result.rows)}`
    );
  }

  const item = result.rows.find((row) => row.id === "item-co1");
  const material = result.rows.find((row) => row.id === "item-material-co1");

  expectEqual(item?.thumbnailPath, null, "inventory cross-company model thumbnail");
  expectEqual(item?.reorderingPolicy, null, "cross-company item planning policy");
  expectEqual(item?.reorderPoint, null, "cross-company item planning quantity");
  expectNumeric(item?.quantityOnHand, 12, "inventory on-hand quantity");
  expectNumeric(item?.quantityOnSalesOrder, 0, "inventory sales demand");
  expectNumeric(item?.quantityOnPurchaseOrder, 0, "inventory purchase supply");
  expectNumeric(item?.quantityOnProductionOrder, 0, "inventory production supply");
  expectNumeric(item?.quantityOnProductionDemand, 0, "inventory production demand");
  expectEqual(
    item?.storageTypeIds,
    ["storage-type-co1"],
    "company-scoped storage type IDs"
  );
  expectEqual(
    item?.storageUnitIds,
    ["su-co1"],
    "company-scoped storage unit IDs"
  );

  expectEqual(material?.dimension, null, "cross-company material dimension");
  expectEqual(material?.finish, null, "cross-company material finish");
  expectEqual(material?.grade, null, "cross-company material grade");
  expectEqual(material?.materialType, null, "cross-company material type");
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
