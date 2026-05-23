import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-maintenance-location-smoke-${process.pid}`;
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
    await verifyOwnerMaintenanceLocationScope(ownerPool);
    await verifyAppMaintenanceLocationScope(appPool);

    console.log("Maintenance location RPC smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- maintenance location RPC signatures and return types are usable");
    console.log("- dispatch location/work-center joins stay company-scoped");
    console.log("- schedule work-center/location joins stay company-scoped");
    console.log("- carbon_app only sees rows for the Better Auth user's company membership");
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
      AND proname IN (
        'get_maintenance_dispatches_by_location',
        'get_maintenance_schedules_by_location'
      )
    ORDER BY proname, args
  `);

  const signatures = new Set(
    result.rows.map((row) => `${row.proname}(${row.args})`)
  );
  const expected = [
    "get_maintenance_dispatches_by_location(p_company_id text, p_location_id text)",
    "get_maintenance_schedules_by_location(p_company_id text, p_location_id text)"
  ];

  for (const signature of expected) {
    if (!signatures.has(signature)) {
      throw new Error(`Missing expected maintenance location function: ${signature}`);
    }
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
        ('loc-co2', 'Location leak', 'co2', NOW(), 'user-co2', '2 Main', 'Austin', 'TX', '78702', 'UTC')
    `);

    await db.query(`
      INSERT INTO "workCenter" (
        id, active, "companyId", "createdAt", "createdBy",
        "defaultStandardFactor", "laborRate", "locationId", "machineRate",
        name, "overheadRate"
      )
      VALUES
        ('wc-co1', true, 'co1', NOW(), 'user-co1', 'Total Minutes', 0, 'loc-co1', 0, 'Work center co1', 0),
        ('wc-co2', true, 'co2', NOW(), 'user-co2', 'Total Minutes', 0, 'loc-co2', 0, 'Work center leak', 0)
    `);

    await db.query(`
      INSERT INTO "maintenanceDispatch" (
        id, "companyId", content, "createdAt", "createdBy", duration,
        "locationId", "maintenanceDispatchId", "oeeImpact",
        "plannedStartTime", "plannedEndTime", priority, severity, source,
        status, "workCenterId"
      )
      VALUES
        ('dispatch-good', 'co1', '{"kind":"good"}'::jsonb, NOW(), 'user-co1', 15, 'loc-co1', 'MD-GOOD', 'No Impact', '08:00', '09:00', 'Medium', 'Preventive', 'Scheduled', 'Open', 'wc-co1'),
        ('dispatch-cross-workcenter', 'co1', '{"kind":"cross-workcenter"}'::jsonb, NOW(), 'user-co1', 20, 'loc-co1', 'MD-CROSS-WC', 'No Impact', '10:00', '11:00', 'Medium', 'Preventive', 'Scheduled', 'Open', 'wc-co2'),
        ('dispatch-cross-location', 'co1', '{"kind":"cross-location"}'::jsonb, NOW(), 'user-co1', 25, 'loc-co2', 'MD-CROSS-LOC', 'No Impact', '12:00', '13:00', 'Medium', 'Preventive', 'Scheduled', 'Open', 'wc-co1'),
        ('dispatch-other-company', 'co2', '{"kind":"other"}'::jsonb, NOW(), 'user-co2', 30, 'loc-co2', 'MD-OTHER', 'No Impact', '14:00', '15:00', 'Medium', 'Preventive', 'Scheduled', 'Open', 'wc-co2')
    `);

    await db.query(`
      INSERT INTO "maintenanceSchedule" (
        id, active, "companyId", "createdAt", "createdBy", description,
        "estimatedDuration", frequency, friday, "locationId", monday, name,
        priority, saturday, "skipHolidays", sunday, thursday, tuesday,
        wednesday, "workCenterId"
      )
      VALUES
        ('schedule-good', true, 'co1', NOW(), 'user-co1', 'Good schedule', 60, 'Monthly', false, 'loc-co1', true, 'Schedule co1', 'Medium', false, false, false, false, false, true, 'wc-co1'),
        ('schedule-cross-workcenter', true, 'co1', NOW(), 'user-co1', 'Cross schedule', 60, 'Monthly', false, 'loc-co1', true, 'Schedule cross', 'Medium', false, false, false, false, false, true, 'wc-co2'),
        ('schedule-other-company', true, 'co2', NOW(), 'user-co2', 'Other schedule', 60, 'Monthly', false, 'loc-co2', true, 'Schedule other', 'Medium', false, false, false, false, false, true, 'wc-co2')
    `);

    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function verifyOwnerMaintenanceLocationScope(db) {
  const dispatches = await fetchDispatches(db, "co1", "loc-co1");
  assertDispatches(dispatches, "owner co1 loc-co1 dispatches");

  const crossLocationDispatches = await fetchDispatches(db, "co1", "loc-co2");
  expectEqual(crossLocationDispatches.length, 0, "owner co1 loc-co2 dispatch count");

  const schedules = await fetchSchedules(db, "co1", "loc-co1");
  assertSchedules(schedules, "owner co1 loc-co1 schedules");

  const crossLocationSchedules = await fetchSchedules(db, "co1", "loc-co2");
  expectEqual(crossLocationSchedules.length, 0, "owner co1 loc-co2 schedule count");
}

async function verifyAppMaintenanceLocationScope(db) {
  const co1Dispatches = await withAppUser(db, "user-co1", (client) =>
    fetchDispatches(client, "co1", "loc-co1")
  );
  assertDispatches(co1Dispatches, "carbon_app user-co1 loc-co1 dispatches");

  const co1Schedules = await withAppUser(db, "user-co1", (client) =>
    fetchSchedules(client, "co1", "loc-co1")
  );
  assertSchedules(co1Schedules, "carbon_app user-co1 loc-co1 schedules");

  const co2DispatchesForCo1 = await withAppUser(db, "user-co2", (client) =>
    fetchDispatches(client, "co1", "loc-co1")
  );
  expectEqual(
    co2DispatchesForCo1.length,
    0,
    "carbon_app user-co2 dispatch count for co1 parameter"
  );

  const co2SchedulesForCo1 = await withAppUser(db, "user-co2", (client) =>
    fetchSchedules(client, "co1", "loc-co1")
  );
  expectEqual(
    co2SchedulesForCo1.length,
    0,
    "carbon_app user-co2 schedule count for co1 parameter"
  );
}

async function fetchDispatches(db, companyId, locationId) {
  const result = await db.query(
    `
      SELECT *
      FROM get_maintenance_dispatches_by_location($1, $2)
      ORDER BY "id"
    `,
    [companyId, locationId]
  );
  return result.rows;
}

async function fetchSchedules(db, companyId, locationId) {
  const result = await db.query(
    `
      SELECT *
      FROM get_maintenance_schedules_by_location($1, $2)
      ORDER BY "id"
    `,
    [companyId, locationId]
  );
  return result.rows;
}

function assertDispatches(rows, label) {
  expectEqual(
    rows.map((row) => row.id),
    ["dispatch-cross-workcenter", "dispatch-good"],
    `${label} ids`
  );

  const byId = new Map(rows.map((row) => [row.id, row]));
  expectEqual(
    byId.get("dispatch-good").workCenterName,
    "Work center co1",
    `${label} good work center name`
  );
  expectEqual(
    byId.get("dispatch-good").locationName,
    "Location co1",
    `${label} good location name`
  );
  expectEqual(
    byId.get("dispatch-cross-workcenter").workCenterName,
    null,
    `${label} cross-company work center name`
  );
  expectEqual(
    byId.get("dispatch-cross-workcenter").locationName,
    "Location co1",
    `${label} cross-workcenter location name`
  );
  expectEqual(
    byId.get("dispatch-good").plannedStartTime,
    "08:00",
    `${label} text planned start time`
  );
}

function assertSchedules(rows, label) {
  expectEqual(rows.map((row) => row.id), ["schedule-good"], `${label} ids`);
  expectEqual(
    rows[0].workCenterName,
    "Work center co1",
    `${label} work center name`
  );
  expectEqual(rows[0].locationName, "Location co1", `${label} location name`);
  expectEqual(rows[0].estimatedDuration, "60", `${label} numeric duration`);
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
