import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { closeCreatePool, create } from "../src/create.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-create-smoke-${process.pid}`;
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

    await setupCreateFixture(pool);
    await create({
      type: "nonConformanceTasks",
      id: "nc1",
      companyId: "co1",
      userId: "user1"
    });
    await verifyNonConformanceTasks(pool);

    await create({
      type: "purchaseOrderFromJob",
      jobId: "job1",
      purchaseOrdersBySupplierId: { supplier1: "new" },
      companyId: "co1",
      userId: "user1"
    });
    await verifyPurchaseOrderFromJob(pool);

    console.log("Create function smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- non-conformance task/reviewer materialization verified");
    console.log("- outside-processing purchase order creation verified");
  } finally {
    await closeCreatePool();
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

async function setupCreateFixture(db: Pool) {
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
    INSERT INTO "currency" (
      id, code, active, "exchangeRate", "decimalPlaces", "companyGroupId",
      "createdAt", "createdBy"
    )
    VALUES ('cur1', 'USD', true, 1, 2, 'cg1', NOW(), 'user1');

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
      'proc1', 'Outside Process', true, 'co1', NOW(), 'user1',
      false, 'Hours/Piece', 'Outside'
    );

    INSERT INTO "nonConformanceRequiredAction" (
      id, name, "companyId", "createdAt", "createdBy", active, "systemType"
    )
    VALUES
      ('act_keep', 'Keep', 'co1', NOW(), 'user1', true, '"Containment"'::jsonb),
      ('act_new', 'New', 'co1', NOW(), 'user1', true, '"Corrective"'::jsonb),
      ('act_old', 'Old', 'co1', NOW(), 'user1', true, '"Preventive"'::jsonb);
    INSERT INTO "nonConformanceType" (
      id, name, "companyId", "createdAt", "createdBy", "customFields"
    )
    VALUES ('nct1', 'Type', 'co1', NOW(), 'user1', '{}'::jsonb);
    INSERT INTO "nonConformanceWorkflow" (
      id, name, active, source, priority, "companyId", "createdAt", "createdBy",
      content
    )
    VALUES (
      'workflow1', 'Workflow', true, 'Internal', 'Medium', 'co1', NOW(), 'user1',
      '{"content":[{"type":"paragraph","content":[{"type":"text","text":"Workflow body"}]}]}'::jsonb
    );
    INSERT INTO "nonConformance" (
      id, "nonConformanceId", name, source, status, priority, quantity,
      "openDate", "locationId", "nonConformanceTypeId",
      "nonConformanceWorkflowId", description, content, "requiredActionIds",
      "approvalRequirements", "companyId", "createdAt", "createdBy"
    )
    VALUES (
      'nc1', 'NC-1', 'NCR', 'Internal', 'Registered', 'Medium', 1,
      CURRENT_DATE, 'loc1', 'nct1', 'workflow1', 'Description',
      '{}'::jsonb, ARRAY['act_keep', 'act_new'], '["MRB"]'::jsonb,
      'co1', NOW(), 'user1'
    );
    INSERT INTO "nonConformanceActionTask" (
      id, "nonConformanceId", "actionTypeId", "sortOrder", status, notes,
      "companyId", "createdAt", "createdBy"
    )
    VALUES
      ('task_keep', 'nc1', 'act_keep', 1, 'Pending', '{}'::jsonb, 'co1', NOW(), 'user1'),
      ('task_old', 'nc1', 'act_old', 2, 'Pending', '{}'::jsonb, 'co1', NOW(), 'user1');
    INSERT INTO "nonConformanceApprovalTask" (
      id, "nonConformanceId", "approvalType", "sortOrder", status, notes,
      "companyId", "createdAt", "createdBy"
    )
    VALUES (
      'approval_old', 'nc1', '"OLD"'::jsonb, 0, 'Pending', '{}'::jsonb,
      'co1', NOW(), 'user1'
    );

    INSERT INTO "sequence" (
      id, name, "table", prefix, suffix, "next", size, step, "companyId"
    )
    VALUES ('seq_po', 'Purchase Order', 'purchaseOrder', 'PO-', NULL, 0, 4, 1, 'co1');

    INSERT INTO "supplier" (
      id, name, "companyId", "createdAt", "createdBy", "currencyCode",
      embedding, "taxPercent"
    )
    VALUES ('supplier1', 'Supplier', 'co1', NOW(), 'user1', 'USD', '[0]', 0);
    INSERT INTO "supplierProcess" (
      id, "supplierId", "processId", "companyId", "createdAt", "createdBy",
      "leadTime", "minimumCost"
    )
    VALUES ('sp1', 'supplier1', 'proc1', 'co1', NOW(), 'user1', 5, 12);

    INSERT INTO "item" (
      id, name, description, "readableId", "readableIdWithRevision", active,
      "companyId", "createdAt", "createdBy", embedding, "itemTrackingType",
      "replenishmentSystem", "requiresInspection", type, "unitOfMeasureCode"
    )
    VALUES (
      'item1', 'Part', 'Part description', 'PART', 'PART', true,
      'co1', NOW(), 'user1', '[0]', 'Inventory', 'Make', false, 'Part', 'EA'
    );
    INSERT INTO "job" (
      id, "jobId", "itemId", "locationId", "companyId", "createdAt", "createdBy",
      "deadlineType", priority, quantity, "productionQuantity",
      "quantityComplete", "quantityReceivedToInventory", "quantityShipped",
      "scrapQuantity", status, "unitOfMeasureCode"
    )
    VALUES (
      'job1', 'J-1', 'item1', 'loc1', 'co1', NOW(), 'user1',
      'No Deadline', 0, 1, 1, 0, 0, 0, 0, 'Draft', 'EA'
    );
    INSERT INTO "jobMakeMethod" (
      id, "itemId", "jobId", "companyId", "createdAt", "createdBy",
      "itemScrapPercentage", "quantityPerParent", "requiresBatchTracking",
      "requiresSerialTracking", version
    )
    VALUES (
      'jmm1', 'item1', 'job1', 'co1', NOW(), 'user1',
      0, 1, false, false, 1
    );
    INSERT INTO "jobOperation" (
      id, "jobId", "jobMakeMethodId", "companyId", "createdAt", "createdBy",
      "laborRate", "laborTime", "laborUnit", "machineTime", "machineUnit",
      "operationLeadTime", "operationMinimumCost", "operationOrder",
      "operationQuantity", "operationSupplierProcessId", "operationType",
      "operationUnitCost", "order", "overheadRate", priority, "processId",
      "setupTime", "setupUnit", status, "workInstruction"
    )
    VALUES (
      'op1', 'job1', 'jmm1', 'co1', NOW(), 'user1',
      0, 0, 'Hours/Piece', 0, 'Hours/Piece', 0, 12, 'After Previous',
      2, 'sp1', 'Outside', 4, 1, 0, 0, 'proc1', 0, 'Hours/Piece',
      'Todo', '{}'::jsonb
    );
  `);
}

async function verifyNonConformanceTasks(db: Pool) {
  await assertCount(
    db,
    `SELECT count(*) FROM "nonConformanceActionTask" WHERE "nonConformanceId" = 'nc1'`,
    2,
    "action tasks"
  );
  await assertCount(
    db,
    `SELECT count(*) FROM "nonConformanceActionTask" WHERE id = 'task_old'`,
    0,
    "deleted obsolete action task"
  );
  await assertCount(
    db,
    `SELECT count(*) FROM "nonConformanceApprovalTask" WHERE "approvalType" = '"MRB"'::jsonb`,
    1,
    "MRB approval task"
  );
  await assertCount(
    db,
    `SELECT count(*) FROM "nonConformanceApprovalTask" WHERE id = 'approval_old'`,
    0,
    "deleted obsolete approval task"
  );
  await assertCount(
    db,
    `SELECT count(*) FROM "nonConformanceReviewer" WHERE "nonConformanceId" = 'nc1'`,
    2,
    "MRB reviewers"
  );

  const content = await db.query<{ content: { content?: unknown[] } }>(
    `SELECT content FROM "nonConformance" WHERE id = 'nc1'`
  );
  const blocks = content.rows[0]?.content?.content ?? [];
  if (blocks.length !== 2) {
    throw new Error(`expected NCR content backfill to contain 2 blocks, got ${blocks.length}`);
  }
}

async function verifyPurchaseOrderFromJob(db: Pool) {
  await assertCount(
    db,
    `SELECT count(*) FROM "purchaseOrder" WHERE "jobId" = 'job1'`,
    1,
    "outside-processing purchase order"
  );
  await assertCount(
    db,
    `SELECT count(*) FROM "purchaseOrderLine" WHERE "jobOperationId" = 'op1'`,
    1,
    "outside-processing purchase order line"
  );

  const row = await db.query<{
    purchaseOrderId: string;
    purchaseQuantity: string;
    supplierUnitPrice: string;
  }>(
    `SELECT po."purchaseOrderId", pol."purchaseQuantity", pol."supplierUnitPrice"
     FROM "purchaseOrder" po
     JOIN "purchaseOrderLine" pol ON pol."purchaseOrderId" = po.id
     WHERE pol."jobOperationId" = 'op1'`
  );
  const line = row.rows[0];
  if (
    line?.purchaseOrderId !== "PO-0001" ||
    Number(line.purchaseQuantity) !== 2 ||
    Number(line.supplierUnitPrice) !== 6
  ) {
    throw new Error(
      `unexpected purchase order line values: ${JSON.stringify(line)}`
    );
  }
}

async function assertCount(
  db: Pool,
  sql: string,
  expected: number,
  label: string
) {
  const count = Number((await db.query(sql)).rows[0]?.count ?? 0);
  if (count !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${count}`);
  }
}
