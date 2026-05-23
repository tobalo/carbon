import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import {
  closePostStockTransferPool,
  postStockTransfer
} from "../src/post-stock-transfer.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-post-stock-transfer-smoke-${process.pid}`;
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

    await setupStockTransferFixture(pool);

    await postStockTransfer({
      type: "inventory",
      stockTransferId: "st1",
      stockTransferLineId: "line_inventory",
      quantity: 4,
      locationId: "loc1",
      companyId: "co1",
      userId: "user1"
    });
    await verifyInventoryPick(pool);

    await postStockTransfer({
      type: "unpickInventory",
      stockTransferId: "st1",
      stockTransferLineId: "line_inventory",
      locationId: "loc1",
      companyId: "co1",
      userId: "user1"
    });
    await verifyInventoryUnpick(pool);

    await postStockTransfer({
      type: "serial",
      stockTransferId: "st1",
      stockTransferLineId: "line_serial",
      trackedEntityId: "serial1",
      fromStorageUnitId: "su_from",
      locationId: "loc1",
      companyId: "co1",
      userId: "user1"
    });
    await verifySerialPick(pool);

    await postStockTransfer({
      type: "unpickSerial",
      stockTransferId: "st1",
      stockTransferLineId: "line_serial",
      trackedEntityId: "serial1",
      locationId: "loc1",
      companyId: "co1",
      userId: "user1"
    });
    await verifySerialUnpick(pool);

    const batchResult = await postStockTransfer({
      type: "batch",
      stockTransferId: "st1",
      stockTransferLineId: "line_batch_full",
      trackedEntityId: "batch_full",
      fromStorageUnitId: "su_from",
      quantity: 5,
      locationId: "loc1",
      companyId: "co1",
      userId: "user1"
    });
    assertEqual(
      batchResult.warning,
      "Transferred expired tracked entity: batch_full",
      "expired batch warning"
    );
    await verifyBatchPick(pool, "line_batch_full", "batch_full", 5);

    await postStockTransfer({
      type: "unpickBatch",
      stockTransferId: "st1",
      stockTransferLineId: "line_batch_full",
      trackedEntityId: "batch_full",
      locationId: "loc1",
      companyId: "co1",
      userId: "user1"
    });
    await verifyBatchUnpick(pool, "line_batch_full", "batch_full", 5);

    await postStockTransfer({
      type: "batch",
      stockTransferId: "st1",
      stockTransferLineId: "line_batch_split",
      trackedEntityId: "batch_split",
      fromStorageUnitId: "su_from",
      quantity: 4,
      locationId: "loc1",
      companyId: "co1",
      userId: "user1"
    });
    const splitEntityId = await verifyBatchSplitPick(pool);

    await postStockTransfer({
      type: "unpickBatch",
      stockTransferId: "st1",
      stockTransferLineId: "line_batch_split",
      trackedEntityId: "batch_split",
      locationId: "loc1",
      companyId: "co1",
      userId: "user1"
    });
    await verifyBatchSplitUnpick(pool, splitEntityId);

    console.log("Post-stock-transfer smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- inventory and serial pick/unpick verified");
    console.log("- full and split batch pick/unpick verified");
  } finally {
    await closePostStockTransferPool();
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

async function setupStockTransferFixture(db: Pool) {
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

    INSERT INTO "companySettings" (
      id, "accountingEnabled", "consoleEnabled", "digitalQuoteEnabled",
      "digitalQuoteIncludesPurchaseOrders", "digitalQuoteNotificationGroup",
      "enforceInspectionFourEyes", "gaugeCalibrationExpiredNotificationGroup",
      "includeThumbnailsOnPurchasingPdfs", "includeThumbnailsOnSalesPdfs",
      "inventoryJobCompletedNotificationGroup", "inventoryShelfLife",
      "jobTravelerIncludeWorkInstructions", "kanbanOutput", "maintenanceAdvanceDays",
      "maintenanceGenerateInAdvance", "materialGeneratedIds",
      "purchasePriceUpdateTiming", "qualityIssueTarget", "rfqReadyNotificationGroup",
      "salesJobCompletedNotificationGroup", "samplingStandard",
      "supplierQuoteNotificationGroup", "timeCardEnabled", "updateLeadTimesOnReceipt",
      "useMetric"
    )
    VALUES (
      'co1', false, false, false, false, ARRAY[]::text[], false, ARRAY[]::text[],
      false, false, ARRAY[]::text[], '{"expiredEntityPolicy":"Warn"}'::jsonb,
      false, 'label', 0, false, false, 'Purchase Invoice Post', 30,
      ARRAY[]::text[], ARRAY[]::text[], 'ANSI_Z1_4', ARRAY[]::text[],
      false, false, false
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

    INSERT INTO "storageUnit" (
      id, name, active, "locationId", "storageTypeIds", "companyId",
      "createdAt", "createdBy"
    )
    VALUES
      ('su_from', 'From', true, 'loc1', ARRAY[]::text[], 'co1', NOW(), 'user1'),
      ('su_to', 'To', true, 'loc1', ARRAY[]::text[], 'co1', NOW(), 'user1');

    INSERT INTO "item" (
      id, name, "readableId", "readableIdWithRevision", active, "companyId",
      "createdAt", "createdBy", embedding, "itemTrackingType",
      "replenishmentSystem", "requiresInspection", type, "unitOfMeasureCode"
    )
    VALUES
      ('item_inventory', 'Inventory', 'INV', 'INV', true, 'co1', NOW(), 'user1', '[0]', 'Inventory', 'Buy', false, 'Part', 'EA'),
      ('item_serial', 'Serial', 'SER', 'SER', true, 'co1', NOW(), 'user1', '[0]', 'Serial', 'Buy', false, 'Part', 'EA'),
      ('item_batch', 'Batch', 'BAT', 'BAT', true, 'co1', NOW(), 'user1', '[0]', 'Batch', 'Buy', false, 'Part', 'EA');

    INSERT INTO "stockTransfer" (
      id, "stockTransferId", "locationId", status, "companyId", "createdAt",
      "createdBy"
    )
    VALUES ('st1', 'ST-1', 'loc1', 'Draft', 'co1', NOW(), 'user1');

    INSERT INTO "stockTransferLine" (
      id, "stockTransferId", "itemId", quantity, "outstandingQuantity",
      "pickedQuantity", "fromStorageUnitId", "toStorageUnitId",
      "requiresBatchTracking", "requiresSerialTracking", "companyId",
      "createdAt", "createdBy"
    )
    VALUES
      ('line_inventory', 'st1', 'item_inventory', 10, 10, 0, 'su_from', 'su_to', false, false, 'co1', NOW(), 'user1'),
      ('line_serial', 'st1', 'item_serial', 1, 1, 0, 'su_from', 'su_to', false, true, 'co1', NOW(), 'user1'),
      ('line_batch_full', 'st1', 'item_batch', 5, 5, 0, 'su_from', 'su_to', true, false, 'co1', NOW(), 'user1'),
      ('line_batch_split', 'st1', 'item_batch', 4, 4, 0, 'su_from', 'su_to', true, false, 'co1', NOW(), 'user1');

    INSERT INTO "trackedEntity" (
      id, "sourceDocument", "sourceDocumentId", "sourceDocumentReadableId",
      quantity, status, attributes, "itemId", "expirationDate", "companyId",
      "createdAt", "createdBy"
    )
    VALUES
      ('serial1', 'Receipt', 'r1', 'R-1', 1, 'Available', '{}'::jsonb, 'item_serial', NULL, 'co1', NOW(), 'user1'),
      ('batch_full', 'Receipt', 'r2', 'R-2', 5, 'Available', '{}'::jsonb, 'item_batch', '2000-01-01', 'co1', NOW(), 'user1'),
      ('batch_split', 'Receipt', 'r3', 'R-3', 10, 'Available', '{}'::jsonb, 'item_batch', NULL, 'co1', NOW(), 'user1');
  `);
}

async function verifyInventoryPick(db: Pool) {
  await assertLine(db, "line_inventory", { pickedQuantity: 4 });
  await assertLedgerQuantities(db, "item_inventory", [-4, 4]);
}

async function verifyInventoryUnpick(db: Pool) {
  await assertLine(db, "line_inventory", { pickedQuantity: 0 });
  await assertLedgerQuantities(db, "item_inventory", [-4, 4, 4, -4]);
}

async function verifySerialPick(db: Pool) {
  await assertLine(db, "line_serial", {
    pickedQuantity: 1,
    trackedEntityId: "serial1"
  });
  await assertCount(
    db,
    `SELECT count(*)
     FROM "trackedActivity" ta
     JOIN "trackedActivityInput" tai ON tai."trackedActivityId" = ta.id
     WHERE ta.type = 'Transfer'
       AND tai."trackedEntityId" = 'serial1'`,
    1,
    "serial transfer activity"
  );
  await assertLedgerQuantities(db, "item_serial", [-1, 1]);
}

async function verifySerialUnpick(db: Pool) {
  await assertLine(db, "line_serial", {
    pickedQuantity: 0,
    trackedEntityId: null
  });
  await assertCount(
    db,
    `SELECT count(*)
     FROM "trackedActivity" ta
     JOIN "trackedActivityInput" tai ON tai."trackedActivityId" = ta.id
     WHERE ta.type = 'Transfer'
       AND tai."trackedEntityId" = 'serial1'`,
    0,
    "deleted serial transfer activity"
  );
  await assertEntity(db, "serial1", {
    quantity: 1,
    status: "Available",
    shelf: "su_from"
  });
  await assertLedgerQuantities(db, "item_serial", [-1, 1, -1, 1]);
}

async function verifyBatchPick(
  db: Pool,
  lineId: string,
  trackedEntityId: string,
  quantity: number
) {
  await assertLine(db, lineId, {
    pickedQuantity: quantity,
    trackedEntityId
  });
  await assertEntity(db, trackedEntityId, {
    quantity,
    status: "Consumed"
  });
  await assertCount(
    db,
    `SELECT count(*)
     FROM "trackedActivity" ta
     JOIN "trackedActivityInput" tai ON tai."trackedActivityId" = ta.id
     WHERE ta.type = 'Transfer'
       AND tai."trackedEntityId" = $1`,
    1,
    "batch transfer activity",
    [trackedEntityId]
  );
}

async function verifyBatchUnpick(
  db: Pool,
  lineId: string,
  trackedEntityId: string,
  quantity: number
) {
  await assertLine(db, lineId, {
    pickedQuantity: 0,
    trackedEntityId: null
  });
  await assertEntity(db, trackedEntityId, {
    quantity,
    status: "Available",
    shelf: "su_from"
  });
  await assertCount(
    db,
    `SELECT count(*)
     FROM "trackedActivity" ta
     JOIN "trackedActivityInput" tai ON tai."trackedActivityId" = ta.id
     WHERE ta.type = 'Transfer'
       AND tai."trackedEntityId" = $1`,
    0,
    "deleted batch transfer activity",
    [trackedEntityId]
  );
}

async function verifyBatchSplitPick(db: Pool) {
  await assertLine(db, "line_batch_split", {
    pickedQuantity: 4,
    trackedEntityId: "batch_split"
  });
  const entity = await one<{
    quantity: string;
    status: string;
    attributes: Record<string, unknown>;
  }>(
    db,
    `SELECT quantity, status, attributes
     FROM "trackedEntity"
     WHERE id = 'batch_split'`
  );
  assertEqual(Number(entity.quantity), 4, "split original transfer quantity");
  assertEqual(entity.status, "Consumed", "split original consumed");
  const splitEntityId = entity.attributes["Split Entity ID"] as string;
  assertTruthy(splitEntityId, "split entity id");

  await assertEntity(db, splitEntityId, {
    quantity: 6,
    status: "Available"
  });
  await assertCount(
    db,
    `SELECT count(*)
     FROM "trackedActivity"
     WHERE type = 'Split'
       AND "sourceDocumentId" = 'st1'`,
    1,
    "split activity"
  );
  await assertCount(
    db,
    `SELECT count(*)
     FROM "trackedActivityOutput"
     WHERE "trackedEntityId" IN ('batch_split', $1)`,
    2,
    "split activity outputs",
    [splitEntityId]
  );

  return splitEntityId;
}

async function verifyBatchSplitUnpick(db: Pool, splitEntityId: string) {
  await assertLine(db, "line_batch_split", {
    pickedQuantity: 0,
    trackedEntityId: null
  });
  await assertEntity(db, "batch_split", {
    quantity: 10,
    status: "Available"
  });
  await assertEntity(db, splitEntityId, {
    quantity: 0,
    status: "Consumed"
  });
  await assertCount(
    db,
    `SELECT count(*)
     FROM "trackedActivity"
     WHERE type IN ('Split', 'Transfer')
       AND "sourceDocumentId" = 'st1'
       AND id NOT IN (
         SELECT ta.id
         FROM "trackedActivity" ta
         JOIN "trackedActivityInput" tai ON tai."trackedActivityId" = ta.id
         WHERE tai."trackedEntityId" = 'batch_full'
       )`,
    0,
    "deleted split batch activities"
  );
}

async function assertLine(
  db: Pool,
  lineId: string,
  expected: { pickedQuantity: number; trackedEntityId?: string | null }
) {
  const row = await one<{ pickedQuantity: string; trackedEntityId: string | null }>(
    db,
    `SELECT "pickedQuantity", "trackedEntityId"
     FROM "stockTransferLine"
     WHERE id = $1`,
    [lineId]
  );
  assertEqual(
    Number(row.pickedQuantity),
    expected.pickedQuantity,
    `${lineId} picked quantity`
  );
  if ("trackedEntityId" in expected) {
    assertEqual(
      row.trackedEntityId,
      expected.trackedEntityId ?? null,
      `${lineId} tracked entity`
    );
  }
}

async function assertEntity(
  db: Pool,
  trackedEntityId: string,
  expected: { quantity: number; status: string; shelf?: string }
) {
  const row = await one<{
    quantity: string;
    status: string;
    attributes: Record<string, unknown>;
  }>(
    db,
    `SELECT quantity, status, attributes
     FROM "trackedEntity"
     WHERE id = $1`,
    [trackedEntityId]
  );
  assertEqual(
    Number(row.quantity),
    expected.quantity,
    `${trackedEntityId} quantity`
  );
  assertEqual(row.status, expected.status, `${trackedEntityId} status`);
  if (expected.shelf !== undefined) {
    assertEqual(row.attributes.Shelf, expected.shelf, `${trackedEntityId} shelf`);
  }
}

async function assertLedgerQuantities(
  db: Pool,
  itemId: string,
  expected: number[]
) {
  const rows = await all<{ quantity: string }>(
    db,
    `SELECT quantity
     FROM "itemLedger"
     WHERE "itemId" = $1
     ORDER BY "entryNumber"`,
    [itemId]
  );
  assertEqual(
    rows.map((row) => Number(row.quantity)).join(","),
    expected.join(","),
    `${itemId} ledger quantities`
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
