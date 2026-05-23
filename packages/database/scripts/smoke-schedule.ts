import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { closeSchedulePool, schedule } from "../src/schedule.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-schedule-smoke-${process.pid}`;
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

    await setupScheduleFixture(pool);
    const result = await schedule({
      jobId: "job1",
      companyId: "co1",
      userId: "user1",
      mode: "initial",
      direction: "backward"
    });

    assertEqual(result.success, true, "schedule success");
    assertEqual(result.operationsScheduled, 2, "operations scheduled");
    assertEqual(result.conflictsDetected, 0, "conflicts detected");
    assertEqual(result.assemblyDepth, 1, "assembly depth");
    assertEqual(
      result.workCentersAffected.join(","),
      "wc1",
      "work centers affected"
    );

    await verifySchedule(pool);
    await verifyScheduleRpcs(pool);

    console.log("Schedule smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- operation dependency and job readiness verified");
    console.log("- dates, work center assignment, and priorities verified");
    console.log("- schedule board RPCs require company scope and isolate rows");
  } finally {
    await closeSchedulePool();
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

async function setupScheduleFixture(db: Pool) {
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
    VALUES
      ('cg1', 'Group', NOW(), 'user1'),
      ('cg2', 'Other Group', NOW(), 'user1');
    INSERT INTO "company" (
      id, name, active, "companyGroupId", "baseCurrencyCode", "createdAt",
      "auditLogEnabled", "isEliminationEntity", "suggestionNotificationGroup"
    )
    VALUES
      (
        'co1', 'Company', true, 'cg1', 'USD', NOW(), false, false, ARRAY[]::text[]
      ),
      (
        'co2', 'Other Company', true, 'cg2', 'USD', NOW(), false, false, ARRAY[]::text[]
      );

    INSERT INTO "unitOfMeasure" (
      id, code, name, active, "companyId", "createdAt", "createdBy"
    )
    VALUES
      ('uom1', 'EA', 'Each', true, 'co1', NOW(), 'user1'),
      ('uom2', 'EA', 'Each', true, 'co2', NOW(), 'user1');

    INSERT INTO "location" (
      id, name, "companyId", "createdAt", "createdBy", "addressLine1",
      city, "postalCode", "stateProvince", timezone
    )
    VALUES
      (
        'loc1', 'Main', 'co1', NOW(), 'user1', '1 Main', 'Austin',
        '78701', 'TX', 'America/Chicago'
      ),
      (
        'loc2', 'Other Main', 'co2', NOW(), 'user1', '2 Main', 'Austin',
        '78701', 'TX', 'America/Chicago'
      );

    INSERT INTO "process" (
      id, name, active, "companyId", "createdAt", "createdBy",
      "completeAllOnScan", "defaultStandardFactor", "processType"
    )
    VALUES
      (
        'proc1', 'Cut', true, 'co1', NOW(), 'user1',
        false, 'Hours/Piece', 'Inside'
      ),
      (
        'proc2', 'Other Cut', true, 'co2', NOW(), 'user1',
        false, 'Hours/Piece', 'Inside'
      );

    INSERT INTO "workCenter" (
      id, name, active, "companyId", "createdAt", "createdBy",
      "defaultStandardFactor", "laborRate", "machineRate", "overheadRate",
      "locationId"
    )
    VALUES (
      'wc1', 'Saw', true, 'co1', NOW(), 'user1',
      'Hours/Piece', 0, 0, 0, 'loc1'
    );

    INSERT INTO "workCenterProcess" (
      "workCenterId", "processId", "companyId", "createdAt", "createdBy"
    )
    VALUES ('wc1', 'proc1', 'co1', NOW(), 'user1');

    INSERT INTO "item" (
      id, name, "readableId", "readableIdWithRevision", active, "companyId",
      "createdAt", "createdBy", embedding, "itemTrackingType",
      "replenishmentSystem", "requiresInspection", type, "unitOfMeasureCode"
    )
    VALUES (
      'item_root', 'Root', 'ROOT', 'ROOT', true, 'co1', NOW(), 'user1',
      '[0]', 'Inventory', 'Make', false, 'Part', 'EA'
    ),
    (
      'item_other', 'Other Root', 'OTHER', 'OTHER', true, 'co2', NOW(), 'user1',
      '[0]', 'Inventory', 'Make', false, 'Part', 'EA'
    );

    INSERT INTO "job" (
      id, "jobId", "itemId", "locationId", "companyId", "createdAt",
      "createdBy", "deadlineType", "dueDate", priority, quantity,
      "productionQuantity", "quantityComplete", "quantityReceivedToInventory",
      "quantityShipped", "scrapQuantity", status, "unitOfMeasureCode"
    )
    VALUES (
      'job1', 'J-1', 'item_root', 'loc1', 'co1', NOW(), 'user1',
      'Soft Deadline', CURRENT_DATE + INTERVAL '20 days', 1, 10, 10,
      0, 0, 0, 0, 'Planned', 'EA'
    ),
    (
      'job2', 'J-2', 'item_other', 'loc2', 'co2', NOW(), 'user1',
      'Soft Deadline', CURRENT_DATE + INTERVAL '20 days', 1, 10, 10,
      0, 0, 0, 0, 'Ready', 'EA'
    ),
    (
      'job3', 'J-3', 'item_root', 'loc1', 'co1', NOW(), 'user1',
      'Soft Deadline', NULL, 1, 10, 10,
      0, 0, 0, 0, 'Ready', 'EA'
    ),
    (
      'job4', 'J-4', 'item_other', 'loc2', 'co2', NOW(), 'user1',
      'Soft Deadline', NULL, 1, 10, 10,
      0, 0, 0, 0, 'Ready', 'EA'
    );

    INSERT INTO "jobMakeMethod" (
      id, "itemId", "jobId", "companyId", "createdAt", "createdBy",
      "itemScrapPercentage", "quantityPerParent", "requiresBatchTracking",
      "requiresSerialTracking", version
    )
    VALUES (
      'jmm_root', 'item_root', 'job1', 'co1', NOW(), 'user1',
      0, 1, false, false, 1
    ),
    (
      'jmm_other', 'item_other', 'job2', 'co2', NOW(), 'user1',
      0, 1, false, false, 1
    ),
    (
      'jmm_unscheduled_co1', 'item_root', 'job3', 'co1', NOW(), 'user1',
      0, 1, false, false, 1
    ),
    (
      'jmm_unscheduled_co2', 'item_other', 'job4', 'co2', NOW(), 'user1',
      0, 1, false, false, 1
    );

    INSERT INTO "jobOperation" (
      id, "jobId", "jobMakeMethodId", "companyId", "createdAt", "createdBy",
      "laborRate", "laborTime", "laborUnit", "machineTime", "machineUnit",
      "operationLeadTime", "operationMinimumCost", "operationOrder",
      "operationQuantity", "operationType", "operationUnitCost", "order",
      "overheadRate", priority, "processId", "setupTime", "setupUnit",
      status, "workInstruction"
    )
    VALUES
      ('op1', 'job1', 'jmm_root', 'co1', NOW(), 'user1', 0, 8, 'Total Hours', 0, 'Total Hours', 0, 0, 'After Previous', 1, 'Inside', 0, 1, 0, 0, 'proc1', 0, 'Total Hours', 'Todo', '{}'::jsonb),
      ('op2', 'job1', 'jmm_root', 'co1', NOW(), 'user1', 0, 8, 'Total Hours', 0, 'Total Hours', 0, 0, 'After Previous', 1, 'Inside', 0, 2, 0, 0, 'proc1', 0, 'Total Hours', 'Todo', '{}'::jsonb);
  `);
}

async function verifySchedule(db: Pool) {
  await assertCount(
    db,
    `
      SELECT count(*)
      FROM "jobOperationDependency"
      WHERE "jobId" = 'job1'
        AND "operationId" = 'op2'
        AND "dependsOnId" = 'op1'
    `,
    1,
    "operation dependency"
  );
  await assertText(
    db,
    `SELECT status FROM "job" WHERE id = 'job1'`,
    "Ready",
    "job status"
  );
  await assertText(
    db,
    `SELECT status FROM "jobOperation" WHERE id = 'op1'`,
    "Ready",
    "root operation status"
  );
  await assertText(
    db,
    `SELECT "workCenterId" FROM "jobOperation" WHERE id = 'op1'`,
    "wc1",
    "op1 work center"
  );
  await assertText(
    db,
    `SELECT "workCenterId" FROM "jobOperation" WHERE id = 'op2'`,
    "wc1",
    "op2 work center"
  );
  await assertCount(
    db,
    `
      SELECT count(*)
      FROM "jobOperation"
      WHERE id IN ('op1', 'op2')
        AND "startDate" IS NOT NULL
        AND "dueDate" IS NOT NULL
        AND COALESCE("hasConflict", false) = false
    `,
    2,
    "scheduled operations without conflicts"
  );
  await assertNumber(
    db,
    `SELECT priority FROM "jobOperation" WHERE id = 'op1'`,
    1,
    "op1 priority"
  );
  await assertNumber(
    db,
    `SELECT priority FROM "jobOperation" WHERE id = 'op2'`,
    2,
    "op2 priority"
  );
}

async function verifyScheduleRpcs(db: Pool) {
  const signatures = await db.query<{ signature: string }>(`
    SELECT proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND proname IN ('get_jobs_by_date_range', 'get_unscheduled_jobs')
  `);
  const actual = new Set(signatures.rows.map((row) => row.signature));
  const expected = [
    "get_jobs_by_date_range(location_id text, company_id text, start_date date, end_date date)",
    "get_unscheduled_jobs(location_id text, company_id text)"
  ];

  for (const signature of expected) {
    if (!actual.has(signature)) {
      throw new Error(`Missing expected schedule RPC: ${signature}`);
    }
  }

  for (const signature of actual) {
    if (
      signature ===
        "get_jobs_by_date_range(location_id text, start_date date, end_date date)" ||
      signature === "get_unscheduled_jobs(location_id text)"
    ) {
      throw new Error(`Legacy unscoped schedule RPC remains: ${signature}`);
    }
  }

  await assertCount(
    db,
    `
      SELECT count(*)
      FROM get_jobs_by_date_range(
        'loc1',
        'co1',
        CURRENT_DATE - 1,
        CURRENT_DATE + 30
      )
      WHERE id = 'job1'
    `,
    1,
    "co1 dated schedule RPC"
  );
  await assertCount(
    db,
    `
      SELECT count(*)
      FROM get_jobs_by_date_range(
        'loc2',
        'co1',
        CURRENT_DATE - 1,
        CURRENT_DATE + 30
      )
    `,
    0,
    "cross-company dated schedule RPC"
  );
  await assertCount(
    db,
    `
      SELECT count(*)
      FROM get_jobs_by_date_range(
        'loc2',
        'co2',
        CURRENT_DATE - 1,
        CURRENT_DATE + 30
      )
      WHERE id = 'job2'
    `,
    1,
    "co2 dated schedule RPC"
  );
  await assertCount(
    db,
    `
      SELECT count(*)
      FROM get_unscheduled_jobs('loc1', 'co1')
      WHERE id = 'job3'
    `,
    1,
    "co1 unscheduled schedule RPC"
  );
  await assertCount(
    db,
    `
      SELECT count(*)
      FROM get_unscheduled_jobs('loc2', 'co1')
    `,
    0,
    "cross-company unscheduled schedule RPC"
  );
  await assertCount(
    db,
    `
      SELECT count(*)
      FROM get_unscheduled_jobs('loc2', 'co2')
      WHERE id = 'job4'
    `,
    1,
    "co2 unscheduled schedule RPC"
  );
}

async function assertText(
  db: Pool,
  query: string,
  expected: string,
  label: string
) {
  const result = await db.query<{ value?: string; status?: string; workCenterId?: string }>(
    query
  );
  const row = result.rows[0] ?? {};
  assertEqual(
    row.value ?? row.status ?? row.workCenterId,
    expected,
    label
  );
}

async function assertNumber(
  db: Pool,
  query: string,
  expected: number,
  label: string
) {
  const result = await db.query<{ priority: string | number }>(query);
  assertEqual(Number(result.rows[0]?.priority ?? 0), expected, label);
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
