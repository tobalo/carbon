import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { closeIssuePool, issue } from "../src/issue.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-issue-smoke-${process.pid}`;
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

    await setupIssueFixture(pool);

    await issue({
      type: "jobOperation",
      id: "op1",
      quantity: 3,
      companyId: "co1",
      userId: "user1"
    });
    await assertQuantity(
      pool,
      `SELECT "quantityIssued" AS quantity FROM "jobMaterial" WHERE id = 'mat1'`,
      6,
      "job material issued quantity"
    );
    await assertLedgerQuantity(
      pool,
      "Job Consumption",
      -6,
      "job operation consumption"
    );

    await issue({
      type: "partToOperation",
      id: "op1",
      materialId: "mat1",
      itemId: "item1",
      quantity: 1,
      adjustmentType: "Negative Adjmt.",
      companyId: "co1",
      userId: "user1"
    });
    await assertQuantity(
      pool,
      `SELECT "quantityIssued" AS quantity FROM "jobMaterial" WHERE id = 'mat1'`,
      7,
      "manual material adjustment quantity"
    );
    await assertLedgerQuantity(
      pool,
      "Job Consumption",
      -7,
      "manual material adjustment consumption"
    );

    await issue({
      type: "trackedEntitiesToOperation",
      materialId: "mat-batch",
      parentTrackedEntityId: "te-parent",
      children: [{ trackedEntityId: "te-job-batch1", quantity: 2 }],
      companyId: "co1",
      userId: "user1"
    });
    await assertQuantity(
      pool,
      `SELECT "quantityIssued" AS quantity FROM "jobMaterial" WHERE id = 'mat-batch'`,
      2,
      "tracked job material issued quantity"
    );
    await assertText(
      pool,
      `SELECT status AS value FROM "trackedEntity" WHERE id = 'te-job-batch1'`,
      "Consumed",
      "tracked job entity consumed"
    );
    await assertQuantity(
      pool,
      `SELECT count(*) AS quantity FROM "trackedEntity" WHERE "sourceDocumentId" = 'item-batch' AND status = 'Available' AND quantity = 2`,
      1,
      "tracked job split remainder"
    );
    await assertLedgerQuantity(
      pool,
      "Batch Split",
      0,
      "tracked job split ledger balance"
    );
    await assertLedgerQuantity(
      pool,
      "Job Consumption",
      -9,
      "tracked job issue consumption"
    );

    await issue({
      type: "unconsumeTrackedEntities",
      materialId: "mat-batch",
      parentTrackedEntityId: "te-parent",
      children: [{ trackedEntityId: "te-job-batch1", quantity: 2 }],
      companyId: "co1",
      userId: "user1"
    });
    await assertText(
      pool,
      `SELECT status AS value FROM "trackedEntity" WHERE id = 'te-job-batch1'`,
      "Available",
      "tracked job entity unconsumed"
    );
    await assertQuantity(
      pool,
      `SELECT "quantityIssued" AS quantity FROM "jobMaterial" WHERE id = 'mat-batch'`,
      0,
      "tracked job material unconsumed quantity"
    );
    await assertLedgerQuantity(
      pool,
      "Job Consumption",
      -7,
      "tracked job unconsume reversal"
    );

    await issue({
      type: "scrapTrackedEntity",
      trackedEntityId: "te-scrap",
      materialId: "mat-batch",
      parentTrackedEntityId: "te-parent",
      companyId: "co1",
      userId: "user1"
    });
    await assertText(
      pool,
      `SELECT status AS value FROM "trackedEntity" WHERE id = 'te-scrap'`,
      "Consumed",
      "tracked job scrap entity consumed"
    );
    await assertQuantity(
      pool,
      `SELECT "quantityIssued" AS quantity FROM "jobMaterial" WHERE id = 'mat-batch'`,
      1,
      "tracked job scrap issued quantity"
    );
    await assertText(
      pool,
      `SELECT attributes->>'Scrapped' AS value FROM "trackedActivity" WHERE "sourceDocumentId" = 'mat-batch' ORDER BY "createdAt" DESC LIMIT 1`,
      "true",
      "tracked job scrap activity"
    );
    await assertLedgerQuantity(
      pool,
      "Job Consumption",
      -8,
      "tracked job scrap consumption"
    );

    const dispatchIssue = await issue({
      type: "maintenanceDispatchInventory",
      maintenanceDispatchId: "md1",
      itemId: "item1",
      unitOfMeasureCode: "EA",
      quantity: 2,
      companyId: "co1",
      userId: "user1"
    });
    await assertQuantity(
      pool,
      `SELECT quantity FROM "maintenanceDispatchItem" WHERE id = '${dispatchIssue.maintenanceDispatchItemId}'`,
      2,
      "maintenance dispatch item quantity"
    );
    await assertLedgerQuantity(
      pool,
      "Maintenance Consumption",
      -2,
      "maintenance issue consumption"
    );

    await issue({
      type: "maintenanceDispatchUnissue",
      maintenanceDispatchItemId: dispatchIssue.maintenanceDispatchItemId,
      companyId: "co1",
      userId: "user1"
    });
    await assertQuantity(
      pool,
      `SELECT count(*) AS quantity FROM "maintenanceDispatchItem" WHERE id = '${dispatchIssue.maintenanceDispatchItemId}'`,
      0,
      "maintenance dispatch item removal"
    );
    await assertLedgerQuantity(
      pool,
      "Maintenance Consumption",
      0,
      "maintenance unissue reversal"
    );

    const trackedIssue = await issue({
      type: "maintenanceDispatchTrackedEntities",
      maintenanceDispatchId: "md1",
      itemId: "item-batch",
      unitOfMeasureCode: "EA",
      children: [{ trackedEntityId: "te-batch1", quantity: 2 }],
      companyId: "co1",
      userId: "user1"
    });
    await assertQuantity(
      pool,
      `SELECT quantity FROM "maintenanceDispatchItem" WHERE id = '${trackedIssue.maintenanceDispatchItemId}'`,
      2,
      "tracked maintenance dispatch item quantity"
    );
    await assertText(
      pool,
      `SELECT status AS value FROM "trackedEntity" WHERE id = 'te-batch1'`,
      "Consumed",
      "tracked maintenance entity consumed"
    );
    await assertQuantity(
      pool,
      `SELECT quantity FROM "trackedEntity" WHERE id = 'te-batch1'`,
      2,
      "tracked maintenance split consumed quantity"
    );
    await assertQuantity(
      pool,
      `SELECT count(*) AS quantity FROM "trackedEntity" WHERE "sourceDocumentId" = 'item-batch' AND status = 'Available' AND quantity = 3`,
      1,
      "tracked maintenance split remainder"
    );
    await assertQuantity(
      pool,
      `SELECT count(*) AS quantity FROM "maintenanceDispatchItemTrackedEntity" WHERE "maintenanceDispatchItemId" = '${trackedIssue.maintenanceDispatchItemId}'`,
      1,
      "tracked maintenance junction count"
    );
    await assertLedgerQuantity(
      pool,
      "Batch Split",
      0,
      "tracked maintenance split ledger balance"
    );
    await assertLedgerQuantity(
      pool,
      "Maintenance Consumption",
      -2,
      "tracked maintenance issue consumption"
    );

    await issue({
      type: "maintenanceDispatchUnconsume",
      maintenanceDispatchItemId: trackedIssue.maintenanceDispatchItemId,
      children: [{ trackedEntityId: "te-batch1", quantity: 2 }],
      companyId: "co1",
      userId: "user1"
    });
    await assertText(
      pool,
      `SELECT status AS value FROM "trackedEntity" WHERE id = 'te-batch1'`,
      "Available",
      "tracked maintenance entity unconsumed"
    );
    await assertQuantity(
      pool,
      `SELECT count(*) AS quantity FROM "maintenanceDispatchItemTrackedEntity" WHERE "maintenanceDispatchItemId" = '${trackedIssue.maintenanceDispatchItemId}'`,
      0,
      "tracked maintenance junction removal"
    );
    await assertLedgerQuantity(
      pool,
      "Maintenance Consumption",
      0,
      "tracked maintenance unconsume reversal"
    );

    const trackedUnissue = await issue({
      type: "maintenanceDispatchTrackedEntities",
      maintenanceDispatchId: "md1",
      itemId: "item-batch",
      unitOfMeasureCode: "EA",
      children: [{ trackedEntityId: "te-batch2", quantity: 1 }],
      companyId: "co1",
      userId: "user1"
    });
    await issue({
      type: "maintenanceDispatchUnissue",
      maintenanceDispatchItemId: trackedUnissue.maintenanceDispatchItemId,
      companyId: "co1",
      userId: "user1"
    });
    await assertText(
      pool,
      `SELECT status AS value FROM "trackedEntity" WHERE id = 'te-batch2'`,
      "Available",
      "tracked maintenance unissue entity returned"
    );
    await assertQuantity(
      pool,
      `SELECT count(*) AS quantity FROM "maintenanceDispatchItem" WHERE id = '${trackedUnissue.maintenanceDispatchItemId}'`,
      0,
      "tracked maintenance unissue item removal"
    );
    await assertLedgerQuantity(
      pool,
      "Maintenance Consumption",
      0,
      "tracked maintenance unissue reversal"
    );

    const converted = await issue({
      type: "convertEntity",
      trackedEntityId: "te-convert",
      newRevision: "A",
      quantity: 12,
      companyId: "co1",
      userId: "user1"
    });
    assertEqual(
      converted.convertedEntity?.readableId,
      "BATCH.A",
      "converted tracked entity readable id"
    );
    await assertText(
      pool,
      `SELECT "sourceDocumentReadableId" AS value FROM "trackedEntity" WHERE id = 'te-convert'`,
      "BATCH.A",
      "converted tracked entity source readable id"
    );
    await assertQuantity(
      pool,
      `SELECT quantity FROM "trackedEntity" WHERE id = 'te-convert'`,
      12,
      "converted tracked entity quantity"
    );
    await assertQuantity(
      pool,
      `SELECT "unitCost" AS quantity FROM "itemCost" WHERE "itemId" = (SELECT "sourceDocumentId" FROM "trackedEntity" WHERE id = 'te-convert')`,
      2.5,
      "converted item unit cost"
    );
    await assertLedgerQuantity(
      pool,
      "Batch Split",
      6,
      "converted tracked entity ledger balance"
    );

    await issue({
      type: "jobOperationBatchComplete",
      jobOperationId: "op-batch",
      trackedEntityId: "te-op-batch",
      quantity: 3,
      notes: "batch complete",
      companyId: "co1",
      userId: "user1"
    });
    await assertQuantity(
      pool,
      `SELECT COALESCE(SUM(quantity), 0) AS quantity FROM "productionQuantity" WHERE "jobOperationId" = 'op-batch' AND type = 'Production'`,
      3,
      "batch operation production quantity"
    );
    await assertText(
      pool,
      `SELECT status AS value FROM "trackedEntity" WHERE id = 'te-op-batch'`,
      "Available",
      "batch operation entity available"
    );
    await assertQuantity(
      pool,
      `SELECT quantity FROM "trackedEntity" WHERE id = 'te-op-batch'`,
      3,
      "batch operation entity quantity"
    );

    const serialComplete = await issue({
      type: "jobOperationSerialComplete",
      jobOperationId: "op-serial",
      trackedEntityId: "te-op-serial1",
      quantity: 1,
      notes: "serial complete",
      companyId: "co1",
      userId: "user1"
    });
    await assertQuantity(
      pool,
      `SELECT COALESCE(SUM(quantity), 0) AS quantity FROM "productionQuantity" WHERE "jobOperationId" = 'op-serial' AND type = 'Production'`,
      1,
      "serial operation production quantity"
    );
    await assertText(
      pool,
      `SELECT status AS value FROM "trackedEntity" WHERE id = 'te-op-serial1'`,
      "Available",
      "serial operation entity available"
    );
    await assertQuantity(
      pool,
      `SELECT attributes->>'Operation op-serial' AS quantity FROM "trackedEntity" WHERE id = 'te-op-serial1'`,
      1,
      "serial operation attribute index"
    );
    await assertText(
      pool,
      `SELECT status AS value FROM "trackedEntity" WHERE id = '${serialComplete.newTrackedEntityId}'`,
      "Reserved",
      "serial operation next entity reserved"
    );

    console.log("Issue smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- non-tracked job material issue verified");
    console.log("- manual part-to-operation adjustment verified");
    console.log("- tracked job material issue and unconsume verified");
    console.log("- tracked job material scrap verified");
    console.log("- maintenance issue and unissue verified");
    console.log("- tracked maintenance issue, unconsume, and unissue verified");
    console.log("- tracked entity conversion verified");
    console.log("- tracked operation batch and serial completion verified");
  } finally {
    await closeIssuePool();
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

async function setupIssueFixture(db: Pool) {
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
    VALUES
      (
        'item1', 'Part', 'PART', 'PART', true, 'co1', NOW(), 'user1',
        '[0]', 'Inventory', 'Buy', false, 'Part', 'EA', 'Pull from Inventory'
      ),
      (
        'item-batch', 'Batch Part', 'BATCH', 'BATCH', true, 'co1', NOW(),
        'user1', '[0]', 'Batch', 'Buy', false, 'Part', 'EA',
        'Pull from Inventory'
      );

    INSERT INTO "process" (
      id, name, active, "completeAllOnScan", "defaultStandardFactor",
      "processType", "companyId", "createdAt", "createdBy"
    )
    VALUES (
      'proc1', 'Cut', true, false, 'Total Hours', 'Inside',
      'co1', NOW(), 'user1'
    );

    INSERT INTO "job" (
      id, "jobId", "itemId", "locationId", "deadlineType", priority,
      quantity, "quantityComplete", "quantityReceivedToInventory",
      "quantityShipped", "scrapQuantity", status, "unitOfMeasureCode",
      "companyId", "createdAt", "createdBy"
    )
    VALUES (
      'job1', 'JOB-1', 'item1', 'loc1', 'No Deadline', 1, 1, 0, 0,
      0, 0, 'Ready', 'EA', 'co1', NOW(), 'user1'
    );

    INSERT INTO "jobMakeMethod" (
      id, "itemId", "jobId", "itemScrapPercentage", "quantityPerParent",
      "requiresBatchTracking", "requiresSerialTracking", version,
      "companyId", "createdAt", "createdBy"
    )
    VALUES (
      'jmm1', 'item1', 'job1', 0, 1, false, false, 1,
      'co1', NOW(), 'user1'
    ),
    (
      'jmm-batch', 'item-batch', 'job1', 0, 1, true, false, 1,
      'co1', NOW(), 'user1'
    ),
    (
      'jmm-serial', 'item-batch', 'job1', 0, 1, false, true, 1,
      'co1', NOW(), 'user1'
    );

    INSERT INTO "jobOperation" (
      id, "jobId", "jobMakeMethodId", "processId", status, "laborRate",
      "laborTime", "laborUnit", "machineTime", "machineUnit",
      "operationLeadTime", "operationMinimumCost", "operationOrder",
      "operationQuantity", "operationType", "operationUnitCost", "order",
      "overheadRate", priority, "setupTime", "setupUnit", "workInstruction",
      "companyId", "createdAt", "createdBy"
    )
    VALUES
      (
        'op1', 'job1', 'jmm1', 'proc1', 'Ready', 0, 0, 'Total Hours',
        0, 'Total Hours', 0, 0, 'After Previous', 1, 'Inside', 0, 1, 0,
        1, 0, 'Total Hours', '{}'::jsonb, 'co1', NOW(), 'user1'
      ),
      (
        'op-batch', 'job1', 'jmm-batch', 'proc1', 'Ready', 0, 0,
        'Total Hours', 0, 'Total Hours', 0, 0, 'After Previous', 5,
        'Inside', 0, 2, 0, 1, 0, 'Total Hours', '{}'::jsonb, 'co1',
        NOW(), 'user1'
      ),
      (
        'op-serial', 'job1', 'jmm-serial', 'proc1', 'Ready', 0, 0,
        'Total Hours', 0, 'Total Hours', 0, 0, 'After Previous', 2,
        'Inside', 0, 3, 0, 1, 0, 'Total Hours', '{}'::jsonb, 'co1',
        NOW(), 'user1'
      );

    INSERT INTO "jobMaterial" (
      id, "jobId", "jobMakeMethodId", "jobOperationId", "itemId",
      "itemType", description, "methodType", quantity, "quantityIssued",
      "estimatedQuantity", "itemScrapPercentage", "scrapQuantity", kit,
      "requiresBatchTracking", "requiresSerialTracking", "unitCost",
      "unitOfMeasureCode", "order", "companyId", "createdAt", "createdBy"
    )
    VALUES
      (
        'mat1', 'job1', 'jmm1', 'op1', 'item1', 'Part', 'Part',
        'Pull from Inventory', 2, 0, 2, 0, 0, false, false, false, 0,
        'EA', 1, 'co1', NOW(), 'user1'
      ),
      (
        'mat-batch', 'job1', 'jmm1', 'op1', 'item-batch', 'Part',
        'Batch Part', 'Pull from Inventory', 2, 0, 2, 0, 0, false,
        true, false, 0, 'EA', 2, 'co1', NOW(), 'user1'
      );

    INSERT INTO "maintenanceDispatch" (
      id, "maintenanceDispatchId", content, "locationId", "oeeImpact",
      priority, severity, source, status, "companyId", "createdAt", "createdBy"
    )
    VALUES (
      'md1', 'MD-1', '{}'::jsonb, 'loc1', 'No Impact', 'Low',
      'Preventive', 'Reactive', 'Open', 'co1', NOW(), 'user1'
    );

    INSERT INTO "trackedEntity" (
      id, "sourceDocumentId", "sourceDocument", "sourceDocumentReadableId",
      quantity, status, attributes, "itemId", "companyId", "createdAt",
      "createdBy"
    )
    VALUES
      (
        'te-batch1', 'item-batch', 'Item', 'BATCH', 5, 'Available',
        '{}'::jsonb, 'item-batch', 'co1', NOW(), 'user1'
      ),
      (
        'te-batch2', 'item-batch', 'Item', 'BATCH', 1, 'Available',
        '{}'::jsonb, 'item-batch', 'co1', NOW(), 'user1'
      ),
      (
        'te-job-batch1', 'item-batch', 'Item', 'BATCH', 4, 'Available',
        '{}'::jsonb, 'item-batch', 'co1', NOW(), 'user1'
      ),
      (
        'te-scrap', 'item-batch', 'Item', 'BATCH', 1, 'Available',
        '{}'::jsonb, 'item-batch', 'co1', NOW(), 'user1'
      ),
      (
        'te-convert', 'item-batch', 'Item', 'BATCH', 6, 'Available',
        '{}'::jsonb, 'item-batch', 'co1', NOW(), 'user1'
      ),
      (
        'te-parent', 'item1', 'Job', 'JOB-1', 1, 'Available',
        '{}'::jsonb, 'item1', 'co1', NOW(), 'user1'
      ),
      (
        'te-op-batch', 'item-batch', 'Job Production', 'BATCH', 0,
        'Reserved', '{"Job Make Method":"jmm-batch"}'::jsonb,
        'item-batch', 'co1', NOW(), 'user1'
      ),
      (
        'te-op-serial1', 'item-batch', 'Job Production', 'BATCH', 1,
        'Reserved', '{"Job Make Method":"jmm-serial"}'::jsonb,
        'item-batch', 'co1', NOW(), 'user1'
      );

    INSERT INTO "itemCost" (
      "companyId", "costingMethod", "costIsAdjusted", "createdAt",
      "createdBy", "itemId", "standardCost", "unitCost"
    )
    VALUES (
      'co1', 'Standard', false, NOW(), 'user1', 'item-batch', 5, 5
    );

    SELECT insert_item_ledger_entry(
      'Positive Adjmt.'::"itemLedgerType", 'Opening Balance', 'opening1',
      'co1', 'item1', 10, 'loc1', NULL, NULL, NULL, 'user1'
    );
    SELECT insert_item_ledger_entry(
      'Positive Adjmt.'::"itemLedgerType", 'Opening Balance', 'opening-batch1',
      'co1', 'item-batch', 5, 'loc1', NULL, 'te-batch1', 'Available', 'user1'
    );
    SELECT insert_item_ledger_entry(
      'Positive Adjmt.'::"itemLedgerType", 'Opening Balance', 'opening-batch2',
      'co1', 'item-batch', 1, 'loc1', NULL, 'te-batch2', 'Available', 'user1'
    );
    SELECT insert_item_ledger_entry(
      'Positive Adjmt.'::"itemLedgerType", 'Opening Balance', 'opening-job-batch1',
      'co1', 'item-batch', 4, 'loc1', NULL, 'te-job-batch1', 'Available', 'user1'
    );
    SELECT insert_item_ledger_entry(
      'Positive Adjmt.'::"itemLedgerType", 'Opening Balance', 'opening-scrap',
      'co1', 'item-batch', 1, 'loc1', NULL, 'te-scrap', 'Available', 'user1'
    );
    SELECT insert_item_ledger_entry(
      'Positive Adjmt.'::"itemLedgerType", 'Opening Balance', 'opening-convert',
      'co1', 'item-batch', 6, 'loc1', NULL, 'te-convert', 'Available', 'user1'
    );
  `);
}

async function assertLedgerQuantity(
  db: Pool,
  documentType: string,
  expected: number,
  label: string
) {
  await assertQuantity(
    db,
    `
      SELECT COALESCE(SUM(quantity), 0) AS quantity
      FROM "itemLedger"
      WHERE "documentType" #>> '{}' = '${documentType}'
    `,
    expected,
    label
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

async function assertText(
  db: Pool,
  query: string,
  expected: string,
  label: string
) {
  const result = await db.query<{ value: string }>(query);
  assertEqual(result.rows[0]?.value, expected, label);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}
