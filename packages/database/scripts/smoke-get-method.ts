import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { closeGetMethodPool, getMethod } from "../src/get-method.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-get-method-smoke-${process.pid}`;
const database = "carbon";
const ownerUrl = (port: number) =>
  `postgresql://carbon:carbon@127.0.0.1:${port}/${database}`;
const appUrl = (port: number) =>
  `postgresql://carbon_app:carbon_app@127.0.0.1:${port}/${database}`;
const serviceUrl = (port: number) =>
  `postgresql://carbon_service:carbon_service@127.0.0.1:${port}/${database}`;
const allParts = {
  billOfMaterial: true,
  billOfProcess: true,
  parameters: true,
  tools: true,
  steps: true,
  workInstructions: true
};

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

    await setupGetMethodFixture(pool);

    await getMethod({
      type: "itemToItem",
      sourceId: "item-source",
      targetId: "item-target",
      companyId: "co1",
      userId: "user1",
      parts: allParts
    });
    await verifyMethodCopy(pool, "mm-target", "itemToItem");

    await getMethod({
      type: "makeMethodToMakeMethod",
      sourceId: "mm-source",
      targetId: "mm-target2",
      companyId: "co1",
      userId: "user1",
      parts: allParts
    });
    await verifyMethodCopy(pool, "mm-target2", "makeMethodToMakeMethod");

    await getMethod({
      type: "itemToJob",
      sourceId: "item-source",
      targetId: "job2",
      companyId: "co1",
      userId: "user1",
      parts: allParts
    });
    await verifyJobMethodCopy(pool);

    await getMethod({
      type: "itemToQuoteLine",
      sourceId: "item-source",
      targetId: "quote1:ql1",
      companyId: "co1",
      userId: "user1",
      parts: allParts
    });
    await verifyQuoteMethodCopy(pool);

    await getMethod({
      type: "quoteLineToJob",
      sourceId: "quote1:ql1",
      targetId: "job3",
      companyId: "co1",
      userId: "user1",
      parts: allParts
    });
    await verifyQuoteLineToJob(pool);

    await getMethod({
      type: "quoteLineToQuoteLine",
      sourceId: "quote1:ql1",
      targetId: "quote1:ql2",
      companyId: "co1",
      userId: "user1",
      parts: allParts
    });
    await verifyQuoteLineCopy(pool);

    await getMethod({
      type: "jobToItem",
      sourceId: "job2",
      targetId: "mm-save-job",
      companyId: "co1",
      userId: "user1",
      parts: allParts
    });
    await verifyMethodCopy(pool, "mm-save-job", "jobToItem");

    await getMethod({
      type: "jobMakeMethodToItem",
      sourceId: "jmm-job2-root",
      targetId: "mm-save-job-method",
      companyId: "co1",
      userId: "user1",
      parts: allParts
    });
    await verifyMethodCopy(pool, "mm-save-job-method", "jobMakeMethodToItem");

    await getMethod({
      type: "quoteLineToItem",
      sourceId: "quote1:ql1",
      targetId: "mm-save-quote-line",
      companyId: "co1",
      userId: "user1",
      parts: allParts
    });
    await verifyMethodCopy(pool, "mm-save-quote-line", "quoteLineToItem");

    const rootQuoteMakeMethodId = await getRequiredText(
      pool,
      `
        SELECT id AS value
        FROM "quoteMakeMethod"
        WHERE "quoteLineId" = 'ql1'
          AND "parentMaterialId" IS NULL
          AND "companyId" = 'co1'
        LIMIT 1
      `,
      "root quote make method id"
    );
    await getMethod({
      type: "quoteMakeMethodToItem",
      sourceId: rootQuoteMakeMethodId,
      targetId: "mm-save-quote-method",
      companyId: "co1",
      userId: "user1",
      parts: allParts
    });
    await verifyMethodCopy(
      pool,
      "mm-save-quote-method",
      "quoteMakeMethodToItem"
    );

    const quoteCopy = (await getMethod({
      type: "quoteToQuote",
      sourceId: "quote1",
      targetId: "",
      companyId: "co1",
      userId: "user1",
      parts: allParts
    })) as { newQuoteId?: string };
    if (!quoteCopy.newQuoteId) {
      throw new Error("quoteToQuote duplicate did not return newQuoteId");
    }
    await verifyQuoteCopy(pool, quoteCopy.newQuoteId, {
      label: "quoteToQuote duplicate",
      revision: false
    });

    const quoteRevision = (await getMethod({
      type: "quoteToQuote",
      sourceId: "quote1",
      targetId: "quote1",
      companyId: "co1",
      userId: "user1",
      parts: allParts
    })) as { newQuoteId?: string };
    if (!quoteRevision.newQuoteId) {
      throw new Error("quoteToQuote revision did not return newQuoteId");
    }
    await verifyQuoteCopy(pool, quoteRevision.newQuoteId, {
      label: "quoteToQuote revision",
      revision: true
    });

    await getMethod({
      type: "procedureToOperation",
      sourceId: "proc-template1",
      targetId: "job-op1",
      companyId: "co1",
      userId: "user1",
      parts: allParts
    });
    await verifyProcedureSync(pool);

    console.log("Get-method smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- item-to-item method copy verified");
    console.log("- method-to-method copy verified");
    console.log("- item-to-job method expansion verified");
    console.log("- item-to-quote-line method expansion verified");
    console.log("- quote-line-to-job method copy verified");
    console.log("- quote-line-to-quote-line method copy verified");
    console.log("- job-to-item method save-back verified");
    console.log("- job-make-method-to-item save-back verified");
    console.log("- quote-line-to-item method save-back verified");
    console.log("- quote-make-method-to-item save-back verified");
    console.log("- quote-to-quote duplicate verified");
    console.log("- quote-to-quote revision verified");
    console.log("- procedure-to-operation sync verified");
  } finally {
    await closeGetMethodPool();
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

async function setupGetMethodFixture(db: Pool) {
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

    INSERT INTO "sequence" (
      id, "table", name, prefix, suffix, next, size, step, "companyId"
    )
    VALUES ('seq-quote', 'quote', 'Quote', 'Q-', NULL, 1, 4, 1, 'co1');

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
        'item-source', 'Source Part', 'SRC', 'SRC', true, 'co1', NOW(),
        'user1', '[0]', 'Inventory', 'Make', false, 'Part', 'EA',
        'Make to Order'
      ),
      (
        'item-target', 'Target Part', 'TGT', 'TGT', true, 'co1', NOW(),
        'user1', '[0]', 'Inventory', 'Make', false, 'Part', 'EA',
        'Make to Order'
      ),
      (
        'item-target2', 'Target Part 2', 'TGT2', 'TGT2', true, 'co1', NOW(),
        'user1', '[0]', 'Inventory', 'Make', false, 'Part', 'EA',
        'Make to Order'
      ),
      (
        'item-material', 'Material', 'MAT', 'MAT', true, 'co1', NOW(),
        'user1', '[0]', 'Inventory', 'Buy', false, 'Material', 'EA',
        'Pull from Inventory'
      ),
      (
        'item-tool', 'Tool', 'TOOL', 'TOOL', true, 'co1', NOW(),
        'user1', '[0]', 'Inventory', 'Buy', false, 'Tool', 'EA',
        'Pull from Inventory'
      );

    INSERT INTO "itemReplenishment" (
      "itemId", "companyId", "conversionFactor", "createdAt", "createdBy",
      "leadTime", "manufacturingBlocked", "purchasingBlocked",
      "requiresConfiguration", "scrapPercentage"
    )
    VALUES
      ('item-source', 'co1', 1, NOW(), 'user1', 0, false, false, false, 0),
      ('item-target', 'co1', 1, NOW(), 'user1', 0, false, false, false, 0),
      ('item-target2', 'co1', 1, NOW(), 'user1', 0, false, false, false, 0),
      ('item-material', 'co1', 1, NOW(), 'user1', 0, false, false, false, 0),
      ('item-tool', 'co1', 1, NOW(), 'user1', 0, false, false, false, 0);

    INSERT INTO "customer" (
      id, name, "companyId", "createdAt", "createdBy", embedding, "taxPercent"
    )
    VALUES ('customer1', 'Customer', 'co1', NOW(), 'user1', '[0]', 0);

    INSERT INTO "process" (
      id, name, active, "completeAllOnScan", "defaultStandardFactor",
      "processType", "companyId", "createdAt", "createdBy"
    )
    VALUES (
      'process1', 'Cut', true, false, 'Total Hours', 'Inside',
      'co1', NOW(), 'user1'
    );

    INSERT INTO "makeMethod" (
      id, "itemId", status, version, "companyId", "createdAt", "createdBy"
    )
    VALUES
      ('mm-source', 'item-source', 'Active', 1, 'co1', NOW(), 'user1'),
      ('mm-target', 'item-target', 'Active', 1, 'co1', NOW(), 'user1'),
      ('mm-target2', 'item-target2', 'Draft', 1, 'co1', NOW(), 'user1'),
      ('mm-save-job', 'item-target2', 'Draft', 2, 'co1', NOW(), 'user1'),
      ('mm-save-job-method', 'item-target2', 'Draft', 3, 'co1', NOW(), 'user1'),
      ('mm-save-quote-line', 'item-target2', 'Draft', 4, 'co1', NOW(), 'user1'),
      ('mm-save-quote-method', 'item-target2', 'Draft', 5, 'co1', NOW(), 'user1');

    INSERT INTO "methodOperation" (
      id, "makeMethodId", "processId", description, "setupTime", "setupUnit",
      "laborTime", "laborUnit", "machineTime", "machineUnit", "operationOrder",
      "operationType", "order", "workInstruction", "companyId", "createdAt",
      "createdBy"
    )
    VALUES
      (
        'src-op', 'mm-source', 'process1', 'Source operation', 0,
        'Total Hours', 1, 'Total Hours', 0, 'Total Hours', 'After Previous',
        'Inside', 1, '{"body":"source"}'::jsonb, 'co1', NOW(), 'user1'
      ),
      (
        'stale-op', 'mm-target', 'process1', 'Stale operation', 0,
        'Total Hours', 1, 'Total Hours', 0, 'Total Hours', 'After Previous',
        'Inside', 1, '{}'::jsonb, 'co1', NOW(), 'user1'
      );

    INSERT INTO "methodOperationTool" (
      id, "operationId", "toolId", quantity, "companyId", "createdAt",
      "createdBy", "updatedAt"
    )
    VALUES ('src-tool', 'src-op', 'item-tool', 1, 'co1', NOW(), 'user1', NOW());

    INSERT INTO "methodOperationParameter" (
      id, "operationId", key, value, "companyId", "createdAt", "createdBy"
    )
    VALUES ('src-param', 'src-op', 'speed', 'fast', 'co1', NOW(), 'user1');

    INSERT INTO "methodOperationStep" (
      id, "operationId", name, type, description, "sortOrder", "companyId",
      "createdAt", "createdBy"
    )
    VALUES (
      'src-step', 'src-op', 'Inspect', 'Checkbox', '{"text":"look"}'::jsonb,
      1, 'co1', NOW(), 'user1'
    );

    INSERT INTO "methodMaterial" (
      id, "makeMethodId", "methodOperationId", "itemId", "itemType", kit,
      "methodType", "order", quantity, "scrapQuantity", "sourcingType",
      "storageUnitIds", "unitOfMeasureCode", "companyId", "createdAt",
      "createdBy"
    )
    VALUES
      (
        'src-material', 'mm-source', 'src-op', 'item-material', 'Material',
        false, 'Pull from Inventory', 1, 2, 0, 'Specified',
        '[]'::jsonb, 'EA', 'co1', NOW(), 'user1'
      ),
      (
        'stale-material', 'mm-target', 'stale-op', 'item-material', 'Material',
        false, 'Pull from Inventory', 1, 1, 0, 'Specified',
        '[]'::jsonb, 'EA', 'co1', NOW(), 'user1'
      );

    INSERT INTO "job" (
      id, "jobId", "itemId", "locationId", "deadlineType", priority,
      quantity, "quantityComplete", "quantityReceivedToInventory",
      "quantityShipped", "scrapQuantity", status, "unitOfMeasureCode",
      "companyId", "createdAt", "createdBy"
    )
    VALUES (
      'job1', 'JOB-1', 'item-source', 'loc1', 'No Deadline', 1, 1, 0, 0,
      0, 0, 'Ready', 'EA', 'co1', NOW(), 'user1'
    ),
    (
      'job2', 'JOB-2', 'item-source', 'loc1', 'No Deadline', 1, 3, 0, 0,
      0, 0, 'Ready', 'EA', 'co1', NOW(), 'user1'
    ),
    (
      'job3', 'JOB-3', 'item-source', 'loc1', 'No Deadline', 1, 3, 0, 0,
      0, 0, 'Ready', 'EA', 'co1', NOW(), 'user1'
    );

    INSERT INTO "jobMakeMethod" (
      id, "itemId", "jobId", "itemScrapPercentage", "quantityPerParent",
      "requiresBatchTracking", "requiresSerialTracking", version,
      "companyId", "createdAt", "createdBy"
    )
    VALUES
      (
        'jmm-job2-root', 'item-source', 'job2', 0, 1, false, false, 1,
        'co1', NOW(), 'user1'
      ),
      (
        'jmm-job3-root', 'item-source', 'job3', 0, 1, false, false, 1,
        'co1', NOW(), 'user1'
      );

    INSERT INTO "jobOperation" (
      id, "jobId", "processId", status, "laborRate", "laborTime",
      "laborUnit", "machineTime", "machineUnit", "operationLeadTime",
      "operationMinimumCost", "operationOrder", "operationType",
      "operationUnitCost", "order", "overheadRate", priority, "setupTime",
      "setupUnit", "workInstruction", "companyId", "createdAt", "createdBy"
    )
    VALUES (
      'job-op1', 'job1', 'process1', 'Ready', 0, 0, 'Total Hours', 0,
      'Total Hours', 0, 0, 'After Previous', 'Inside', 0, 1, 0, 1, 0,
      'Total Hours', '{}'::jsonb, 'co1', NOW(), 'user1'
    );

    INSERT INTO "procedure" (
      id, name, status, version, content, "processId", "companyId",
      "createdAt", "createdBy"
    )
    VALUES (
      'proc-template1', 'Procedure', 'Active', 1, '{"body":"procedure"}'::jsonb,
      'process1', 'co1', NOW(), 'user1'
    );

    INSERT INTO "procedureStep" (
      id, "procedureId", name, type, description, "minValue", "maxValue",
      "sortOrder", "companyId", "createdAt", "createdBy"
    )
    VALUES
      (
        'proc-step1', 'proc-template1', 'Check', 'Measurement',
        '{"text":"updated"}'::jsonb, 1, 5, 1, 'co1', NOW(), 'user1'
      ),
      (
        'proc-step2', 'proc-template1', 'Measure', 'Value',
        '{"text":"new"}'::jsonb, NULL, NULL, 2, 'co1', NOW(), 'user1'
      );

    INSERT INTO "procedureParameter" (
      id, "procedureId", key, value, "companyId", "createdAt", "createdBy"
    )
    VALUES ('proc-param1', 'proc-template1', 'torque', '12', 'co1', NOW(), 'user1');

    INSERT INTO "jobOperationStep" (
      id, "operationId", name, type, description, "minValue", "maxValue",
      "sortOrder", "companyId", "createdAt", "createdBy"
    )
    VALUES
      (
        'job-step-match', 'job-op1', 'Check', 'Measurement',
        '{"text":"old"}'::jsonb, 0, 1, 1, 'co1', NOW(), 'user1'
      ),
      (
        'job-step-stale', 'job-op1', 'Stale', 'Value',
        '{}'::jsonb, NULL, NULL, 2, 'co1', NOW(), 'user1'
      );

    INSERT INTO "jobOperationParameter" (
      id, "operationId", key, value, "companyId", "createdAt", "createdBy"
    )
    VALUES ('job-param-stale', 'job-op1', 'old', 'value', 'co1', NOW(), 'user1');

    INSERT INTO "quote" (
      id, "quoteId", "revisionId", status, "customerId", "currencyCode",
      "locationId", "companyId", "createdAt", "createdBy"
    )
    VALUES (
      'quote1', 'Q-1', 0, 'Draft', 'customer1', 'USD',
      'loc1', 'co1', NOW(), 'user1'
    );

    INSERT INTO "quotePayment" (
      id, "invoiceCustomerId", "companyId", "updatedBy"
    )
    VALUES ('quote1', 'customer1', 'co1', 'user1');

    INSERT INTO "quoteShipment" (
      id, "locationId", "shippingCost", "companyId", "updatedBy"
    )
    VALUES ('quote1', 'loc1', 5, 'co1', 'user1');

    INSERT INTO "quoteLine" (
      id, "quoteId", "quoteRevisionId", description, "itemId", "itemType",
      "methodType", quantity, "sortOrder", status, "taxPercent",
      "unitPricePrecision", "unitOfMeasureCode", "companyId", "createdBy"
    )
    VALUES
      (
        'ql1', 'quote1', 0, 'Quote line', 'item-source', 'Part',
        'Make to Order', ARRAY[3]::numeric[], 1, 'Not Started', 0, 2,
        'EA', 'co1', 'user1'
      ),
      (
        'ql2', 'quote1', 0, 'Copied quote line', 'item-source', 'Part',
        'Make to Order', ARRAY[3]::numeric[], 2, 'Not Started', 0, 2,
        'EA', 'co1', 'user1'
      );

    INSERT INTO "quoteLinePrice" (
      "quoteId", "quoteLineId", quantity, "unitPrice", "shippingCost",
      "leadTime", "discountPercent", "exchangeRate", "categoryMarkups",
      "createdAt", "createdBy"
    )
    VALUES (
      'quote1', 'ql1', 3, 10, 0, 0, 0, 1, '{}'::jsonb, NOW(), 'user1'
    );
  `);
}

async function verifyMethodCopy(db: Pool, makeMethodId: string, label: string) {
  await assertQuantity(
    db,
    `SELECT count(*) AS quantity FROM "methodMaterial" WHERE "makeMethodId" = '${makeMethodId}'`,
    1,
    `${label} material count`
  );
  await assertQuantity(
    db,
    `SELECT count(*) AS quantity FROM "methodOperation" WHERE "makeMethodId" = '${makeMethodId}'`,
    1,
    `${label} operation count`
  );
  await assertQuantity(
    db,
    `
      SELECT count(*) AS quantity
      FROM "methodMaterial" mm
      JOIN "methodOperation" mo ON mo.id = mm."methodOperationId"
      WHERE mm."makeMethodId" = '${makeMethodId}'
        AND mo."makeMethodId" = '${makeMethodId}'
    `,
    1,
    `${label} material operation link`
  );
  await assertQuantity(
    db,
    `
      SELECT count(*) AS quantity
      FROM "methodOperationTool" mot
      JOIN "methodOperation" mo ON mo.id = mot."operationId"
      WHERE mo."makeMethodId" = '${makeMethodId}'
    `,
    1,
    `${label} operation tool count`
  );
  await assertQuantity(
    db,
    `
      SELECT count(*) AS quantity
      FROM "methodOperationParameter" mop
      JOIN "methodOperation" mo ON mo.id = mop."operationId"
      WHERE mo."makeMethodId" = '${makeMethodId}'
    `,
    1,
    `${label} operation parameter count`
  );
  await assertQuantity(
    db,
    `
      SELECT count(*) AS quantity
      FROM "methodOperationStep" mos
      JOIN "methodOperation" mo ON mo.id = mos."operationId"
      WHERE mo."makeMethodId" = '${makeMethodId}'
    `,
    1,
    `${label} operation step count`
  );
}

async function verifyJobMethodCopy(db: Pool) {
  await assertQuantity(
    db,
    `SELECT count(*) AS quantity FROM "jobOperation" WHERE "jobId" = 'job2'`,
    1,
    "itemToJob operation count"
  );
  await assertQuantity(
    db,
    `SELECT count(*) AS quantity FROM "jobMaterial" WHERE "jobId" = 'job2'`,
    1,
    "itemToJob material count"
  );
  await assertQuantity(
    db,
    `
      SELECT count(*) AS quantity
      FROM "jobMaterial" jm
      JOIN "jobOperation" jo ON jo.id = jm."jobOperationId"
      WHERE jm."jobId" = 'job2' AND jo."jobId" = 'job2'
    `,
    1,
    "itemToJob material operation link"
  );
  await assertQuantity(
    db,
    `
      SELECT "estimatedQuantity" AS quantity
      FROM "jobMaterial"
      WHERE "jobId" = 'job2' AND "itemId" = 'item-material'
    `,
    6,
    "itemToJob estimated quantity"
  );
  await assertQuantity(
    db,
    `
      SELECT count(*) AS quantity
      FROM "jobOperationTool" jot
      JOIN "jobOperation" jo ON jo.id = jot."operationId"
      WHERE jo."jobId" = 'job2'
    `,
    1,
    "itemToJob operation tool count"
  );
  await assertQuantity(
    db,
    `
      SELECT count(*) AS quantity
      FROM "jobOperationParameter" jop
      JOIN "jobOperation" jo ON jo.id = jop."operationId"
      WHERE jo."jobId" = 'job2'
    `,
    1,
    "itemToJob operation parameter count"
  );
  await assertQuantity(
    db,
    `
      SELECT count(*) AS quantity
      FROM "jobOperationStep" jos
      JOIN "jobOperation" jo ON jo.id = jos."operationId"
      WHERE jo."jobId" = 'job2'
    `,
    1,
    "itemToJob operation step count"
  );
}

async function verifyQuoteMethodCopy(db: Pool) {
  await assertQuantity(
    db,
    `SELECT count(*) AS quantity FROM "quoteMakeMethod" WHERE "quoteLineId" = 'ql1'`,
    1,
    "itemToQuoteLine make method count"
  );
  await assertQuantity(
    db,
    `SELECT count(*) AS quantity FROM "quoteOperation" WHERE "quoteLineId" = 'ql1'`,
    1,
    "itemToQuoteLine operation count"
  );
  await assertQuantity(
    db,
    `SELECT count(*) AS quantity FROM "quoteMaterial" WHERE "quoteLineId" = 'ql1'`,
    1,
    "itemToQuoteLine material count"
  );
  await assertQuantity(
    db,
    `
      SELECT count(*) AS quantity
      FROM "quoteMaterial" qm
      JOIN "quoteOperation" qo ON qo.id = qm."quoteOperationId"
      WHERE qm."quoteLineId" = 'ql1' AND qo."quoteLineId" = 'ql1'
    `,
    1,
    "itemToQuoteLine material operation link"
  );
  await assertQuantity(
    db,
    `
      SELECT count(*) AS quantity
      FROM "quoteOperationTool" qot
      JOIN "quoteOperation" qo ON qo.id = qot."operationId"
      WHERE qo."quoteLineId" = 'ql1'
    `,
    1,
    "itemToQuoteLine operation tool count"
  );
  await assertQuantity(
    db,
    `
      SELECT count(*) AS quantity
      FROM "quoteOperationParameter" qop
      JOIN "quoteOperation" qo ON qo.id = qop."operationId"
      WHERE qo."quoteLineId" = 'ql1'
    `,
    1,
    "itemToQuoteLine operation parameter count"
  );
  await assertQuantity(
    db,
    `
      SELECT count(*) AS quantity
      FROM "quoteOperationStep" qos
      JOIN "quoteOperation" qo ON qo.id = qos."operationId"
      WHERE qo."quoteLineId" = 'ql1'
    `,
    1,
    "itemToQuoteLine operation step count"
  );
}

async function verifyQuoteLineToJob(db: Pool) {
  await assertQuantity(
    db,
    `SELECT count(*) AS quantity FROM "jobOperation" WHERE "jobId" = 'job3'`,
    1,
    "quoteLineToJob operation count"
  );
  await assertQuantity(
    db,
    `SELECT count(*) AS quantity FROM "jobMaterial" WHERE "jobId" = 'job3'`,
    1,
    "quoteLineToJob material count"
  );
  await assertQuantity(
    db,
    `
      SELECT count(*) AS quantity
      FROM "jobMaterial" jm
      JOIN "jobOperation" jo ON jo.id = jm."jobOperationId"
      WHERE jm."jobId" = 'job3' AND jo."jobId" = 'job3'
    `,
    1,
    "quoteLineToJob material operation link"
  );
  await assertQuantity(
    db,
    `
      SELECT "estimatedQuantity" AS quantity
      FROM "jobMaterial"
      WHERE "jobId" = 'job3' AND "itemId" = 'item-material'
    `,
    6,
    "quoteLineToJob estimated quantity"
  );
  await assertQuantity(
    db,
    `
      SELECT count(*) AS quantity
      FROM "jobOperationTool" jot
      JOIN "jobOperation" jo ON jo.id = jot."operationId"
      WHERE jo."jobId" = 'job3'
    `,
    1,
    "quoteLineToJob operation tool count"
  );
  await assertQuantity(
    db,
    `
      SELECT count(*) AS quantity
      FROM "jobOperationParameter" jop
      JOIN "jobOperation" jo ON jo.id = jop."operationId"
      WHERE jo."jobId" = 'job3'
    `,
    1,
    "quoteLineToJob operation parameter count"
  );
  await assertQuantity(
    db,
    `
      SELECT count(*) AS quantity
      FROM "jobOperationStep" jos
      JOIN "jobOperation" jo ON jo.id = jos."operationId"
      WHERE jo."jobId" = 'job3'
    `,
    1,
    "quoteLineToJob operation step count"
  );
}

async function verifyQuoteLineCopy(db: Pool) {
  await assertQuantity(
    db,
    `SELECT count(*) AS quantity FROM "quoteMakeMethod" WHERE "quoteLineId" = 'ql2'`,
    1,
    "quoteLineToQuoteLine make method count"
  );
  await assertQuantity(
    db,
    `SELECT count(*) AS quantity FROM "quoteOperation" WHERE "quoteLineId" = 'ql2'`,
    1,
    "quoteLineToQuoteLine operation count"
  );
  await assertQuantity(
    db,
    `SELECT count(*) AS quantity FROM "quoteMaterial" WHERE "quoteLineId" = 'ql2'`,
    1,
    "quoteLineToQuoteLine material count"
  );
  await assertQuantity(
    db,
    `
      SELECT count(*) AS quantity
      FROM "quoteMaterial" qm
      JOIN "quoteOperation" qo ON qo.id = qm."quoteOperationId"
      WHERE qm."quoteLineId" = 'ql2' AND qo."quoteLineId" = 'ql2'
    `,
    1,
    "quoteLineToQuoteLine material operation link"
  );
  await assertQuantity(
    db,
    `
      SELECT count(*) AS quantity
      FROM "quoteOperationTool" qot
      JOIN "quoteOperation" qo ON qo.id = qot."operationId"
      WHERE qo."quoteLineId" = 'ql2'
    `,
    1,
    "quoteLineToQuoteLine operation tool count"
  );
  await assertQuantity(
    db,
    `
      SELECT count(*) AS quantity
      FROM "quoteOperationParameter" qop
      JOIN "quoteOperation" qo ON qo.id = qop."operationId"
      WHERE qo."quoteLineId" = 'ql2'
    `,
    1,
    "quoteLineToQuoteLine operation parameter count"
  );
  await assertQuantity(
    db,
    `
      SELECT count(*) AS quantity
      FROM "quoteOperationStep" qos
      JOIN "quoteOperation" qo ON qo.id = qos."operationId"
      WHERE qo."quoteLineId" = 'ql2'
    `,
    1,
    "quoteLineToQuoteLine operation step count"
  );
}

async function verifyQuoteCopy(
  db: Pool,
  quoteId: string,
  args: { label: string; revision: boolean }
) {
  const quoteIdLiteral = sqlLiteral(quoteId);
  await assertQuantity(
    db,
    `SELECT count(*) AS quantity FROM "quote" WHERE id = ${quoteIdLiteral}`,
    1,
    `${args.label} quote count`
  );
  await assertQuantity(
    db,
    `SELECT count(*) AS quantity FROM "quotePayment" WHERE id = ${quoteIdLiteral}`,
    1,
    `${args.label} payment count`
  );
  await assertQuantity(
    db,
    `SELECT count(*) AS quantity FROM "quoteShipment" WHERE id = ${quoteIdLiteral}`,
    1,
    `${args.label} shipment count`
  );
  await assertQuantity(
    db,
    `SELECT count(*) AS quantity FROM "quoteLine" WHERE "quoteId" = ${quoteIdLiteral}`,
    2,
    `${args.label} line count`
  );
  await assertQuantity(
    db,
    `SELECT count(*) AS quantity FROM "quoteLinePrice" WHERE "quoteId" = ${quoteIdLiteral}`,
    1,
    `${args.label} price count`
  );
  await assertQuantity(
    db,
    `SELECT count(*) AS quantity FROM "quoteMakeMethod" WHERE "quoteId" = ${quoteIdLiteral} AND "parentMaterialId" IS NULL`,
    2,
    `${args.label} root method count`
  );
  await assertQuantity(
    db,
    `SELECT count(*) AS quantity FROM "quoteOperation" WHERE "quoteId" = ${quoteIdLiteral}`,
    2,
    `${args.label} operation count`
  );
  await assertQuantity(
    db,
    `SELECT count(*) AS quantity FROM "quoteMaterial" WHERE "quoteId" = ${quoteIdLiteral}`,
    2,
    `${args.label} material count`
  );

  if (args.revision) {
    await assertText(
      db,
      `SELECT "quoteId" AS value FROM "quote" WHERE id = ${quoteIdLiteral}`,
      "Q-1",
      `${args.label} quote readable id`
    );
    await assertQuantity(
      db,
      `SELECT "revisionId" AS quantity FROM "quote" WHERE id = ${quoteIdLiteral}`,
      1,
      `${args.label} revision id`
    );
  }
}

async function verifyProcedureSync(db: Pool) {
  await assertQuantity(
    db,
    `SELECT count(*) AS quantity FROM "jobOperationStep" WHERE "operationId" = 'job-op1'`,
    2,
    "procedure step count"
  );
  await assertQuantity(
    db,
    `SELECT "maxValue" AS quantity FROM "jobOperationStep" WHERE id = 'job-step-match'`,
    5,
    "procedure matching step update"
  );
  await assertQuantity(
    db,
    `SELECT count(*) AS quantity FROM "jobOperationStep" WHERE id = 'job-step-stale'`,
    0,
    "procedure stale step removal"
  );
  await assertQuantity(
    db,
    `SELECT count(*) AS quantity FROM "jobOperationParameter" WHERE "operationId" = 'job-op1' AND key = 'torque'`,
    1,
    "procedure parameter replacement"
  );
  await assertText(
    db,
    `SELECT "procedureId" AS value FROM "jobOperation" WHERE id = 'job-op1'`,
    "proc-template1",
    "procedure id update"
  );
  await assertText(
    db,
    `SELECT "workInstruction"->>'body' AS value FROM "jobOperation" WHERE id = 'job-op1'`,
    "procedure",
    "procedure work instruction update"
  );
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

async function getRequiredText(db: Pool, query: string, label: string) {
  const result = await db.query<{ value: string }>(query);
  const value = result.rows[0]?.value;
  if (!value) throw new Error(`${label}: expected a value`);
  return value;
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

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

function sqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}
