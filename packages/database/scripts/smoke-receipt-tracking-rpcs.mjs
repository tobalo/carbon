import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-receipt-tracking-smoke-${process.pid}`;
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
    await verifyOwnerReceiptTrackingScope(ownerPool);
    await verifyAppReceiptTrackingScope(appPool);

    console.log("Receipt tracking RPC smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- receipt tracking RPC signatures require company scope");
    console.log("- batch/serial writes resolve receipt, line, item, and shelf-life data by company");
    console.log("- cross-company tracked entity IDs cannot be updated");
    console.log("- carbon_app rejects Better Auth users outside the requested company");
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
        'resolve_shelf_life_start_for_receipt',
        'update_receipt_line_batch_tracking',
        'update_receipt_line_serial_tracking'
      )
    ORDER BY proname, args
  `);

  const signatures = new Set(
    result.rows.map((row) => `${row.proname}(${row.args})`)
  );
  const expected = [
    "resolve_shelf_life_start_for_receipt(p_item_id text, p_receipt_id text, p_company_id text)",
    "update_receipt_line_batch_tracking(p_company_id text, p_receipt_line_id text, p_receipt_id text, p_batch_number text, p_quantity numeric, p_tracked_entity_id text, p_properties jsonb)",
    "update_receipt_line_serial_tracking(p_company_id text, p_receipt_line_id text, p_receipt_id text, p_serial_number text, p_index integer, p_tracked_entity_id text, p_expiry_date text)"
  ];

  for (const signature of expected) {
    if (!signatures.has(signature)) {
      throw new Error(`Missing expected receipt tracking function: ${signature}`);
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
      INSERT INTO "item" (
        id, name, "readableId", "readableIdWithRevision", revision, active,
        "companyId", "createdAt", "createdBy", embedding, "itemTrackingType",
        "replenishmentSystem", "requiresInspection", type, "unitOfMeasureCode"
      )
      VALUES
        (
          'item-batch-co1', 'Batch item co1', 'BATCH-CO1', 'BATCH-CO1/A', 'A', true,
          'co1', NOW(), 'user-co1', '[0]', 'Batch',
          'Buy', false, 'Part', 'EA'
        ),
        (
          'item-serial-co1', 'Serial item co1', 'SERIAL-CO1', 'SERIAL-CO1/A', 'A', true,
          'co1', NOW(), 'user-co1', '[0]', 'Serial',
          'Buy', false, 'Part', 'EA'
        ),
        (
          'item-co2', 'Item co2', 'ITEM-CO2', 'ITEM-CO2/A', 'A', true,
          'co2', NOW(), 'user-co2', '[0]', 'Batch',
          'Buy', false, 'Part', 'EA'
        )
    `);

    await db.query(`
      INSERT INTO "itemShelfLife" (
        "calculateFromBom", "companyId", "createdAt", "createdBy",
        days, "itemId", mode, "triggerTiming"
      )
      VALUES
        (false, 'co1', NOW(), 'user-co1', 10, 'item-batch-co1', 'Fixed Duration', 'After'),
        (false, 'co1', NOW(), 'user-co1', 5, 'item-serial-co1', 'Fixed Duration', 'After'),
        (false, 'co2', NOW(), 'user-co2', 99, 'item-co2', 'Fixed Duration', 'After')
    `);

    await db.query(`
      INSERT INTO "receipt" (
        id, "companyId", "createdAt", "createdBy", "postingDate",
        "receiptId", status, "supplierId"
      )
      VALUES
        ('receipt-co1', 'co1', NOW(), 'user-co1', DATE '2026-01-01', 'R-CO1', 'Draft', 'supplier-co1'),
        ('receipt-co2', 'co2', NOW(), 'user-co2', DATE '2026-02-01', 'R-CO2', 'Draft', 'supplier-co2')
    `);

    await db.query(`
      INSERT INTO "receiptLine" (
        id, "companyId", "createdAt", "createdBy", "itemId",
        "orderQuantity", "outstandingQuantity", "receiptId",
        "receivedQuantity", "requiresBatchTracking", "requiresSerialTracking",
        "unitOfMeasure", "unitPrice"
      )
      VALUES
        ('line-batch-co1', 'co1', NOW(), 'user-co1', 'item-batch-co1', 10, 10, 'receipt-co1', 0, true, false, 'EA', 1),
        ('line-serial-co1', 'co1', NOW(), 'user-co1', 'item-serial-co1', 1, 1, 'receipt-co1', 0, false, true, 'EA', 1),
        ('line-co2', 'co2', NOW(), 'user-co2', 'item-co2', 10, 10, 'receipt-co2', 0, true, false, 'EA', 1)
    `);

    await db.query(`
      INSERT INTO "trackedEntity" (
        id, quantity, status, "sourceDocument", "sourceDocumentId",
        "sourceDocumentReadableId", "readableId", attributes, "companyId",
        "createdBy", "createdAt", "itemId"
      )
      VALUES (
        'tracked-cross-company', 1, 'On Hold', 'Item', 'item-co2',
        'ITEM-CO2/A', 'CROSS', '{}'::jsonb, 'co2', 'user-co2', NOW(), 'item-co2'
      )
    `);

    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function verifyOwnerReceiptTrackingScope(db) {
  await db.query(`
    SELECT update_receipt_line_batch_tracking(
      'co1',
      'line-batch-co1',
      'receipt-co1',
      'BATCH-001',
      5,
      NULL,
      '{}'::jsonb
    )
  `);

  const batch = await db.query(`
    SELECT id, quantity, "readableId", attributes, "companyId", "expirationDate"
    FROM "trackedEntity"
    WHERE attributes->>'Receipt Line' = 'line-batch-co1'
  `);
  expectEqual(batch.rows.length, 1, "created batch tracked entity count");
  expectEqual(batch.rows[0].companyId, "co1", "batch tracked entity company");
  expectEqual(batch.rows[0].readableId, "BATCH-001", "batch readable id");
  expectEqual(dateOnly(batch.rows[0].expirationDate), "2026-01-11", "batch shelf-life expiration");

  await db.query(
    `
      SELECT update_receipt_line_batch_tracking(
        'co1',
        'line-batch-co1',
        'receipt-co1',
        'BATCH-002',
        7,
        $1,
        '{"color":"blue"}'::jsonb
      )
    `,
    [batch.rows[0].id]
  );

  const updatedBatch = await db.query(
    `
      SELECT quantity, "readableId", attributes
      FROM "trackedEntity"
      WHERE id = $1
    `,
    [batch.rows[0].id]
  );
  expectEqual(updatedBatch.rows[0].quantity, "7", "updated batch quantity");
  expectEqual(updatedBatch.rows[0].readableId, "BATCH-002", "updated batch readable id");
  expectEqual(updatedBatch.rows[0].attributes.color, "blue", "updated batch custom property");

  await expectOwnerError(
    db,
    `
      SELECT update_receipt_line_batch_tracking(
        'co1',
        'line-batch-co1',
        'receipt-co2',
        'BAD',
        1,
        NULL,
        '{}'::jsonb
      )
    `,
    /Receipt line not found/
  );

  await expectOwnerError(
    db,
    `
      SELECT update_receipt_line_batch_tracking(
        'co1',
        'line-batch-co1',
        'receipt-co1',
        'BAD',
        1,
        'tracked-cross-company',
        '{}'::jsonb
      )
    `,
    /different company/
  );

  await db.query(`
    SELECT update_receipt_line_serial_tracking(
      'co1',
      'line-serial-co1',
      'receipt-co1',
      'SERIAL-001',
      0,
      NULL,
      NULL
    )
  `);

  const serial = await db.query(`
    SELECT "readableId", attributes, "companyId", "expirationDate"
    FROM "trackedEntity"
    WHERE attributes->>'Receipt Line' = 'line-serial-co1'
  `);
  expectEqual(serial.rows.length, 1, "created serial tracked entity count");
  expectEqual(serial.rows[0].companyId, "co1", "serial tracked entity company");
  expectEqual(serial.rows[0].readableId, "SERIAL-001", "serial readable id");
  expectEqual(dateOnly(serial.rows[0].expirationDate), "2026-01-06", "serial shelf-life expiration");

  await expectOwnerError(
    db,
    `
      SELECT update_receipt_line_serial_tracking(
        'co1',
        'line-serial-co1',
        'receipt-co1',
        'BAD-SERIAL',
        1,
        'tracked-cross-company',
        NULL
      )
    `,
    /different company/
  );
}

async function verifyAppReceiptTrackingScope(db) {
  await withAppUser(db, "user-co1", (client) =>
    client.query(`
      SELECT update_receipt_line_batch_tracking(
        'co1',
        'line-batch-co1',
        'receipt-co1',
        'BATCH-APP',
        3,
        NULL,
        '{}'::jsonb
      )
    `)
  );

  await expectAppError(
    db,
    "user-co2",
    (client) =>
      client.query(`
        SELECT update_receipt_line_serial_tracking(
          'co1',
          'line-serial-co1',
          'receipt-co1',
          'SERIAL-BAD',
          2,
          NULL,
          NULL
        )
      `),
    /Insufficient permissions/
  );
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

async function expectAppError(pool, userId, fn, pattern) {
  try {
    await withAppUser(pool, userId, fn);
  } catch (error) {
    if (!pattern.test(error.message)) {
      throw error;
    }
    return;
  }

  throw new Error(`Expected ${userId} to fail with ${pattern}`);
}

async function expectOwnerError(db, sql, pattern) {
  try {
    await db.query(sql);
  } catch (error) {
    if (!pattern.test(error.message)) {
      throw error;
    }
    return;
  }

  throw new Error(`Expected owner query to fail with ${pattern}`);
}

function expectEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Unexpected ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function dateOnly(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
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
