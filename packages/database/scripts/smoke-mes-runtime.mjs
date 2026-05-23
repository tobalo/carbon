import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-mes-runtime-smoke-${process.pid}`;
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
    await verifyMesCompanyScope(pool);

    console.log("MES runtime smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- MES operation RPCs require company_id and isolate company rows");
    console.log("- MES employee, assigned, work-center, active-count, and step-record RPCs verified");
    console.log("- MES traceability lineage RPCs require p_company_id");
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
        'get_active_job_operations_by_location',
        'get_active_job_operations_by_employee',
        'get_active_job_count',
        'get_assigned_job_operations',
        'get_job_operation_step_records',
        'get_job_operations_by_work_center',
        'get_job_operation_by_id',
        'get_recent_job_operations_by_employee',
        'get_direct_descendants_of_tracked_entity_strict',
        'get_direct_ancestors_of_tracked_entity_strict'
      )
    ORDER BY proname, args
  `);

  const signatures = new Set(
    result.rows.map((row) => `${row.proname}(${row.args})`)
  );
  const expected = [
    "get_active_job_operations_by_location(location_id text, company_id text, work_center_ids text[])",
    "get_active_job_operations_by_employee(employee_id text, company_id text)",
    "get_active_job_count(employee_id text, company_id text)",
    "get_assigned_job_operations(user_id text, company_id text)",
    "get_job_operation_step_records(p_job_id text, p_company_id text)",
    "get_job_operations_by_work_center(work_center_id text, location_id text, company_id text)",
    "get_job_operation_by_id(operation_id text, company_id text)",
    "get_recent_job_operations_by_employee(employee_id text, company_id text)",
    "get_direct_descendants_of_tracked_entity_strict(p_tracked_entity_id text, p_company_id text)",
    "get_direct_ancestors_of_tracked_entity_strict(p_tracked_entity_id text, p_company_id text)"
  ];

  for (const signature of expected) {
    if (!signatures.has(signature)) {
      throw new Error(`Missing expected MES runtime function: ${signature}`);
    }
  }

  for (const signature of signatures) {
    if (
      signature === "get_job_operation_by_id(operation_id text)" ||
      signature ===
        "get_active_job_operations_by_location(location_id text, work_center_ids text[])" ||
      signature ===
        "get_job_operation_step_records(p_job_id text)" ||
      signature ===
        "get_job_operations_by_work_center(work_center_id text, location_id text)" ||
      signature ===
        "get_direct_descendants_of_tracked_entity_strict(p_tracked_entity_id text)" ||
      signature ===
        "get_direct_ancestors_of_tracked_entity_strict(p_tracked_entity_id text)"
    ) {
      throw new Error(`Legacy unscoped MES runtime function remains: ${signature}`);
    }
  }
}

async function setupFixtures(db) {
  await db.query("BEGIN");

  try {
    await db.query("SET LOCAL session_replication_role = replica");
    await db.query(`
      INSERT INTO "job" (
        id, "companyId", "createdAt", "createdBy", "deadlineType", "itemId",
        "jobId", "locationId", priority, quantity, "quantityComplete",
        "quantityReceivedToInventory", "quantityShipped", "scrapQuantity",
        status, "unitOfMeasureCode"
      )
      VALUES
        (
          'job-co1', 'co1', NOW(), 'user-co1', 'No Deadline', 'item-co1',
          'JOB-CO1', 'loc-shared', 1, 1, 0, 0, 0, 0, 'Ready', 'EA'
        ),
        (
          'job-co2', 'co2', NOW(), 'user-co2', 'No Deadline', 'item-co2',
          'JOB-CO2', 'loc-shared', 1, 1, 0, 0, 0, 0, 'Ready', 'EA'
        )
    `);
    await db.query(`
      INSERT INTO "jobOperation" (
        id, "companyId", "createdAt", "createdBy", "assignee", "jobId",
        "laborRate", "laborTime", "laborUnit", "machineTime", "machineUnit",
        "operationLeadTime", "operationMinimumCost", "operationOrder",
        "operationType", "operationUnitCost", "order", "overheadRate",
        priority, "processId", "setupTime", "setupUnit", status,
        "workCenterId", "workInstruction"
      )
      VALUES
        (
          'op-co1', 'co1', NOW(), 'user-co1', 'user-co1', 'job-co1', 0,
          0, 'Total Minutes', 0, 'Total Minutes', 0, 0, 'After Previous',
          'Inside', 0, 1, 0, 1, 'proc-co1', 0, 'Total Minutes', 'Ready',
          'wc-shared', '{}'::jsonb
        ),
        (
          'op-co2', 'co2', NOW(), 'user-co2', 'user-co2', 'job-co2', 0,
          0, 'Total Minutes', 0, 'Total Minutes', 0, 0, 'After Previous',
          'Inside', 0, 1, 0, 1, 'proc-co2', 0, 'Total Minutes', 'Ready',
          'wc-shared', '{}'::jsonb
        )
    `);
    await db.query(`
      INSERT INTO "productionEvent" (
        id, "companyId", "createdAt", "createdBy", "employeeId",
        "jobOperationId", "postedToGL", "startTime", "workCenterId"
      )
      VALUES
        (
          'pe-active-co1', 'co1', NOW(), 'user-co1', 'user-co1',
          'op-co1', false, NOW()::text, 'wc-shared'
        ),
        (
          'pe-active-co2', 'co2', NOW(), 'user-co2', 'user-co2',
          'op-co2', false, NOW()::text, 'wc-shared'
        )
    `);
    await db.query(`
      INSERT INTO "productionQuantity" (
        id, "companyId", "createdAt", "createdBy", "jobOperationId",
        quantity, type
      )
      VALUES
        ('pq-co1', 'co1', NOW(), 'user-co1', 'op-co1', 1, 'Production'),
        ('pq-co2', 'co2', NOW(), 'user-co2', 'op-co2', 1, 'Production')
    `);
    await db.query(`
      INSERT INTO "jobOperationStep" (
        id, "companyId", "createdAt", "createdBy", "operationId",
        name, "sortOrder", type
      )
      VALUES
        (
          'step-co1', 'co1', NOW(), 'user-co1', 'op-co1',
          'Record co1', 1, 'Value'
        ),
        (
          'step-co2', 'co2', NOW(), 'user-co2', 'op-co2',
          'Record co2', 1, 'Value'
        )
    `);
    await db.query(`
      INSERT INTO "jobOperationStepRecord" (
        id, "companyId", "createdAt", "createdBy", "index",
        "jobOperationStepId", value
      )
      VALUES
        ('step-record-co1', 'co1', NOW(), 'user-co1', 1, 'step-co1', 'ok'),
        ('step-record-co2', 'co2', NOW(), 'user-co2', 1, 'step-co2', 'ok')
    `);
    await db.query(`
      INSERT INTO "trackedEntity" (
        id, "companyId", "createdAt", "createdBy", attributes, quantity,
        "sourceDocument", "sourceDocumentId", status
      )
      VALUES
        (
          'te-source-co1', 'co1', NOW(), 'user-co1', '{}'::jsonb, 1,
          'Job Production', 'op-co1', 'Available'
        ),
        (
          'te-child-co1', 'co1', NOW(), 'user-co1', '{}'::jsonb, 1,
          'Job Material', 'op-co1', 'Available'
        ),
        (
          'te-source-co2', 'co2', NOW(), 'user-co2', '{}'::jsonb, 1,
          'Job Production', 'op-co2', 'Available'
        ),
        (
          'te-child-co2', 'co2', NOW(), 'user-co2', '{}'::jsonb, 1,
          'Job Material', 'op-co2', 'Available'
        )
    `);
    await db.query(`
      INSERT INTO "trackedActivity" (
        id, "companyId", "createdAt", "createdBy", attributes, type
      )
      VALUES
        ('ta-co1', 'co1', NOW(), 'user-co1', '{}'::jsonb, 'MES smoke'),
        ('ta-co2', 'co2', NOW(), 'user-co2', '{}'::jsonb, 'MES smoke')
    `);
    await db.query(`
      INSERT INTO "trackedActivityOutput" (
        "trackedActivityId", "trackedEntityId", quantity, "companyId",
        "createdAt", "createdBy"
      )
      VALUES
        ('ta-co1', 'te-source-co1', 1, 'co1', NOW(), 'user-co1'),
        ('ta-co2', 'te-source-co2', 1, 'co2', NOW(), 'user-co2')
    `);
    await db.query(`
      INSERT INTO "trackedActivityInput" (
        "trackedActivityId", "trackedEntityId", quantity, "companyId",
        "createdAt", "createdBy"
      )
      VALUES
        ('ta-co1', 'te-child-co1', 1, 'co1', NOW(), 'user-co1'),
        ('ta-co2', 'te-child-co2', 1, 'co2', NOW(), 'user-co2')
    `);

    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function verifyMesCompanyScope(db) {
  await expectIds(
    db,
    `SELECT id FROM get_job_operation_by_id('op-co1', 'co1')`,
    ["op-co1"]
  );
  await expectIds(
    db,
    `SELECT id FROM get_job_operation_by_id('op-co2', 'co1')`,
    []
  );
  await expectIds(
    db,
    `SELECT id FROM get_active_job_operations_by_location(
      'loc-shared',
      'co1',
      ARRAY[]::text[]
    )`,
    ["op-co1"]
  );
  await expectIds(
    db,
    `SELECT id FROM get_active_job_operations_by_location(
      'loc-shared',
      'co2',
      ARRAY['wc-shared']::text[]
    )`,
    ["op-co2"]
  );
  await expectIds(
    db,
    `SELECT id FROM get_active_job_operations_by_employee('user-co1', 'co1')`,
    ["op-co1"]
  );
  await expectIds(
    db,
    `SELECT id FROM get_active_job_operations_by_employee('user-co2', 'co1')`,
    []
  );
  await expectIds(
    db,
    `SELECT id FROM get_recent_job_operations_by_employee('user-co1', 'co1')`,
    ["op-co1"]
  );
  await expectIds(
    db,
    `SELECT id FROM get_recent_job_operations_by_employee('user-co2', 'co1')`,
    []
  );
  await expectIds(
    db,
    `SELECT id FROM get_assigned_job_operations('user-co1', 'co1')`,
    ["op-co1"]
  );
  await expectIds(
    db,
    `SELECT id FROM get_assigned_job_operations('user-co2', 'co1')`,
    []
  );
  await expectIds(
    db,
    `SELECT id FROM get_job_operations_by_work_center(
      'wc-shared',
      'loc-shared',
      'co1'
    )`,
    ["op-co1"]
  );
  await expectIds(
    db,
    `SELECT id FROM get_job_operations_by_work_center(
      'wc-shared',
      'loc-shared',
      'co2'
    )`,
    ["op-co2"]
  );
  await expectScalar(
    db,
    `SELECT get_active_job_count('user-co1', 'co1') AS value`,
    1
  );
  await expectScalar(
    db,
    `SELECT get_active_job_count('user-co2', 'co1') AS value`,
    0
  );
  await expectIds(
    db,
    `SELECT id FROM get_job_operation_step_records('job-co1', 'co1')`,
    ["step-record-co1"]
  );
  await expectIds(
    db,
    `SELECT id FROM get_job_operation_step_records('job-co2', 'co1')`,
    []
  );
  await expectIds(
    db,
    `SELECT id FROM get_job_operation_step_records('job-co2', 'co2')`,
    ["step-record-co2"]
  );
  await expectIds(
    db,
    `SELECT id FROM get_direct_descendants_of_tracked_entity_strict(
      'te-source-co1',
      'co1'
    )`,
    ["te-child-co1"]
  );
  await expectIds(
    db,
    `SELECT id FROM get_direct_descendants_of_tracked_entity_strict(
      'te-source-co1',
      'co2'
    )`,
    []
  );
  await expectIds(
    db,
    `SELECT id FROM get_direct_ancestors_of_tracked_entity_strict(
      'te-child-co2',
      'co2'
    )`,
    ["te-source-co2"]
  );
  await expectIds(
    db,
    `SELECT id FROM get_direct_ancestors_of_tracked_entity_strict(
      'te-child-co2',
      'co1'
    )`,
    []
  );
}

async function expectIds(db, sql, expectedIds) {
  const result = await db.query(sql);
  const actualIds = result.rows.map((row) => row.id).sort();
  const expected = [...expectedIds].sort();

  if (JSON.stringify(actualIds) !== JSON.stringify(expected)) {
    throw new Error(
      `Unexpected ids for ${sql}: expected ${JSON.stringify(
        expected
      )}, got ${JSON.stringify(actualIds)}`
    );
  }
}

async function expectScalar(db, sql, expectedValue) {
  const result = await db.query(sql);
  const actual = Number(result.rows[0]?.value ?? NaN);

  if (actual !== expectedValue) {
    throw new Error(
      `Unexpected value for ${sql}: expected ${expectedValue}, got ${actual}`
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
