import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-rls-smoke-${process.pid}`;
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
  let servicePool = null;

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

    ownerPool = new Pool({
      connectionString: ownerUrl(port),
      max: 1
    });
    appPool = new Pool({
      connectionString: appUrl(port),
      max: 1
    });
    servicePool = new Pool({
      connectionString: serviceUrl(port),
      max: 1
    });

    await verifyRuntime(ownerPool);
    await setupFixtures(ownerPool);
    await verifyFailClosed(appPool);
    await verifyUserContext(appPool);
    await verifyApiKeyContext(appPool);
    await verifyServiceBypass(servicePool);

    console.log("RLS context smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- carbon_app fails closed without user/API-key context");
    console.log("- transaction-local user and API-key context isolate company rows");
    console.log("- carbon_service bypass remains explicit and privileged");
  } finally {
    await ownerPool?.end().catch(() => undefined);
    await appPool?.end().catch(() => undefined);
    await servicePool?.end().catch(() => undefined);
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

async function setupFixtures(db) {
  await db.query("BEGIN");

  try {
    await db.query("SET LOCAL session_replication_role = replica");
    await db.query(`
      INSERT INTO "user" (
        id, email, "firstName", "lastName", "fullName", about,
        "acknowledgedITAR", "isConsoleOperator", flags, "createdAt", active
      )
      VALUES
        (
          'user-co1', 'user-co1@example.com', 'User', 'One', 'User One', '',
          true, false, '{}'::jsonb, NOW(), true
        ),
        (
          'user-co2', 'user-co2@example.com', 'User', 'Two', 'User Two', '',
          true, false, '{}'::jsonb, NOW(), true
        )
    `);
    await db.query(`
      INSERT INTO "userToCompany" ("companyId", role, "userId")
      VALUES
        ('co1', 'employee', 'user-co1'),
        ('co2', 'employee', 'user-co2')
    `);
    await db.query(`
      INSERT INTO "apiKey" (
        id, "companyId", "createdAt", "createdBy", "keyHash",
        "keyPreview", name, "rateLimit", "rateLimitWindow", scopes
      )
      VALUES (
        'api-co1', 'co1', NOW(), 'user-co1', 'hash-co1',
        'co1', 'Company 1 API Key', 1000, '1m', '{}'::jsonb
      )
    `);
    await db.query(`
      INSERT INTO "item" (
        id, name, "readableId", active, "companyId", "createdAt",
        "createdBy", embedding, "itemTrackingType", "replenishmentSystem",
        "requiresInspection", type
      )
      VALUES
        (
          'item-co1', 'Company 1 Item', 'ITM-CO1', true, 'co1', NOW(),
          'user-co1', '[1,0,0]'::vector, 'Inventory', 'Make', false, 'Part'
        ),
        (
          'item-co2', 'Company 2 Item', 'ITM-CO2', true, 'co2', NOW(),
          'user-co2', '[0,1,0]'::vector, 'Inventory', 'Make', false, 'Part'
        )
    `);

    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function verifyFailClosed(db) {
  const count = await countVisibleItems(db);
  assertEqual(count, 0, "carbon_app visible item count without context");

  await assertInsertRejectedWithoutContext(db);
}

async function verifyUserContext(db) {
  await assertContextVisibleItems(db, "app.user_id", "user-co1", ["item-co1"]);
  await assertContextVisibleItems(db, "app.user_id", "user-co2", ["item-co2"]);

  const count = await countVisibleItems(db);
  assertEqual(count, 0, "carbon_app visible item count after user transaction");
}

async function verifyApiKeyContext(db) {
  await assertContextVisibleItems(db, "app.api_key_id", "api-co1", ["item-co1"]);

  const count = await countVisibleItems(db);
  assertEqual(count, 0, "carbon_app visible item count after API-key transaction");
}

async function verifyServiceBypass(db) {
  const result = await db.query(`
    SELECT id
    FROM "item"
    ORDER BY id
  `);

  assertArrayEqual(
    result.rows.map((row) => row.id),
    ["item-co1", "item-co2"],
    "carbon_service visible item ids"
  );
}

async function assertContextVisibleItems(db, settingName, settingValue, expected) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config($1, $2, true)", [
      settingName,
      settingValue
    ]);
    const result = await client.query(`
      SELECT id
      FROM "item"
      ORDER BY id
    `);
    await client.query("COMMIT");

    assertArrayEqual(
      result.rows.map((row) => row.id),
      expected,
      `${settingName}=${settingValue} visible item ids`
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function assertInsertRejectedWithoutContext(db) {
  try {
    await db.query(`
      INSERT INTO "item" (
        id, name, "readableId", active, "companyId", "createdAt",
        "createdBy", embedding, "itemTrackingType", "replenishmentSystem",
        "requiresInspection", type
      )
      VALUES (
        'item-rejected', 'Rejected Item', 'ITM-REJECTED', true, 'co1', NOW(),
        'user-co1', '[1,0,0]'::vector, 'Inventory', 'Make', false, 'Part'
      )
    `);
  } catch (error) {
    if (error.code === "42501") {
      return;
    }

    throw error;
  }

  throw new Error("Expected carbon_app insert without context to be rejected");
}

async function countVisibleItems(db) {
  const result = await db.query(`SELECT count(*)::int AS count FROM "item"`);
  return result.rows[0]?.count;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertArrayEqual(actual, expected, label) {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);

  if (actualText !== expectedText) {
    throw new Error(`${label}: expected ${expectedText}, got ${actualText}`);
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
