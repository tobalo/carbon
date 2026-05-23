import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-intercompany-smoke-${process.pid}`;
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
    await verifyCommonParentScope(ownerPool);
    await verifyAppIntercompanyScope(ownerPool, appPool);

    console.log("Intercompany RPC smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- intercompany RPC signatures are present");
    console.log("- matching, balance, and elimination stay company-group scoped");
    console.log("- Better Auth user context cannot be spoofed via p_user_id");
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
        'matchIntercompanyTransactions',
        'findLowestCommonParent',
        'generateEliminationEntries',
        'getIntercompanyBalance'
      )
    ORDER BY proname, args
  `);

  const signatures = new Set(
    result.rows.map((row) => `${row.proname}(${row.args})`)
  );
  const expected = [
    "findLowestCommonParent(p_company_group_id text, p_company_a text, p_company_b text)",
    "generateEliminationEntries(p_company_group_id text, p_user_id text)",
    "getIntercompanyBalance(p_company_group_id text)",
    "matchIntercompanyTransactions(p_company_group_id text)"
  ];

  for (const signature of expected) {
    if (!signatures.has(signature)) {
      throw new Error(`Missing expected intercompany function: ${signature}`);
    }
  }
}

async function setupFixtures(db) {
  await db.query("BEGIN");

  try {
    await db.query("SET LOCAL session_replication_role = replica");
    await db.query(`
      INSERT INTO "companyGroup" (id, name, "createdAt", "createdBy")
      VALUES
        ('cg1', 'Company group 1', NOW(), 'user-cg1'),
        ('cg2', 'Company group 2', NOW(), 'user-cg2')
    `);

    await db.query(`
      INSERT INTO "user" (
        id, email, "firstName", "lastName", "fullName", about,
        "acknowledgedITAR", "createdAt", flags, "isConsoleOperator"
      )
      VALUES
        ('user-cg1', 'cg1@example.com', 'CG', 'One', 'CG One', '', true, NOW(), '{}'::jsonb, false),
        ('user-cg2', 'cg2@example.com', 'CG', 'Two', 'CG Two', '', true, NOW(), '{}'::jsonb, false)
    `);

    await db.query(`
      INSERT INTO "company" (
        id, active, "auditLogEnabled", "baseCurrencyCode", "companyGroupId",
        "createdAt", "isEliminationEntity", name, "parentCompanyId",
        "suggestionNotificationGroup"
      )
      VALUES
        ('co-parent', true, false, 'USD', 'cg1', NOW(), false, 'Parent', NULL, ARRAY[]::text[]),
        ('co-src', true, false, 'USD', 'cg1', NOW(), false, 'Source', 'co-parent', ARRAY[]::text[]),
        ('co-tgt', true, false, 'USD', 'cg1', NOW(), false, 'Target', 'co-parent', ARRAY[]::text[]),
        ('co-elim', true, false, 'USD', 'cg1', NOW(), true, 'Elimination', 'co-parent', ARRAY[]::text[]),
        ('co-other', true, false, 'USD', 'cg2', NOW(), false, 'Other Group', NULL, ARRAY[]::text[])
    `);

    await db.query(`
      INSERT INTO "userToCompany" ("userId", "companyId", role)
      VALUES
        ('user-cg1', 'co-parent', 'employee'),
        ('user-cg1', 'co-src', 'employee'),
        ('user-cg1', 'co-tgt', 'employee'),
        ('user-cg1', 'co-elim', 'employee'),
        ('user-cg2', 'co-other', 'employee')
    `);

    await db.query(`
      INSERT INTO "account" (
        id, active, class, "companyGroupId", "consolidatedRate", "createdAt",
        "createdBy", "incomeBalance", "isGroup", "isSystem", name, number,
        "parentId"
      )
      VALUES
        ('acct-ar', true, 'Asset', 'cg1', 'Current', NOW(), 'user-cg1', 'Balance Sheet', false, false, 'Intercompany AR', '1200', NULL),
        ('acct-ap', true, 'Liability', 'cg1', 'Current', NOW(), 'user-cg1', 'Balance Sheet', false, false, 'Intercompany AP', '2200', NULL),
        ('acct-other', true, 'Asset', 'cg2', 'Current', NOW(), 'user-cg2', 'Balance Sheet', false, false, 'Other Asset', '1200', NULL)
    `);

    await db.query(`
      INSERT INTO "accountingPeriod" (
        id, "companyId", "createdAt", "createdBy", "startDate", "endDate",
        status
      )
      VALUES (
        'period-elim', 'co-elim', NOW(), 'user-cg1',
        DATE '2026-01-01', DATE '2026-12-31', 'Active'
      )
    `);

    await db.query(`
      INSERT INTO "journal" (
        id, "companyId", "createdAt", "createdBy", "journalEntryId",
        "postingDate", status
      )
      VALUES
        ('journal-src', 'co-src', NOW(), 'user-cg1', 'JE-SRC', DATE '2026-01-15', 'Posted'),
        ('journal-tgt', 'co-tgt', NOW(), 'user-cg1', 'JE-TGT', DATE '2026-01-15', 'Posted'),
        ('journal-other', 'co-other', NOW(), 'user-cg2', 'JE-OTHER', DATE '2026-01-15', 'Posted')
    `);

    await db.query(`
      INSERT INTO "journalLine" (
        id, "accountId", accrual, amount, "companyId", "createdAt",
        description, "journalId", "journalLineReference", quantity
      )
      VALUES
        ('line-a', 'acct-ar', false, 100, 'co-src', NOW(), 'Source IC', 'journal-src', 'a', 1),
        ('line-b', 'acct-ap', false, -100, 'co-tgt', NOW(), 'Target IC', 'journal-tgt', 'b', 1),
        ('line-cross-company', 'acct-ar', false, 25, 'co-other', NOW(), 'Mismatched line', 'journal-other', 'c', 1),
        ('line-other', 'acct-other', false, 500, 'co-other', NOW(), 'Other group IC', 'journal-other', 'd', 1)
    `);

    await db.query(`
      INSERT INTO "intercompanyTransaction" (
        id, amount, "companyGroupId", "createdAt", "currencyCode",
        description, "sourceCompanyId", "sourceJournalLineId", status,
        "targetCompanyId", "targetJournalLineId"
      )
      VALUES
        ('ict-a', 100, 'cg1', NOW(), 'USD', 'Source to target', 'co-src', 'line-a', 'Unmatched', 'co-tgt', NULL),
        ('ict-b', 100, 'cg1', NOW(), 'USD', 'Target to source', 'co-tgt', 'line-b', 'Unmatched', 'co-src', NULL),
        ('ict-bad', 25, 'cg1', NOW(), 'USD', 'Bad source line scope', 'co-src', 'line-cross-company', 'Matched', 'co-tgt', NULL),
        ('ict-cross-a', 500, 'cg1', NOW(), 'USD', 'Cross group target', 'co-src', 'line-a', 'Unmatched', 'co-other', NULL),
        ('ict-cross-b', 500, 'cg1', NOW(), 'USD', 'Cross group source', 'co-other', 'line-other', 'Unmatched', 'co-src', NULL)
    `);

    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function verifyCommonParentScope(db) {
  const sameGroup = await db.query(`
    SELECT "findLowestCommonParent"('cg1', 'co-src', 'co-tgt') AS value
  `);
  expectEqual(sameGroup.rows[0]?.value, "co-parent", "same-group parent");

  const crossGroup = await db.query(`
    SELECT "findLowestCommonParent"('cg1', 'co-src', 'co-other') AS value
  `);
  expectEqual(crossGroup.rows[0]?.value, null, "cross-group parent");
}

async function verifyAppIntercompanyScope(ownerDb, appDb) {
  await withAppUser(appDb, "user-cg1", async (db) => {
    const balance = await db.query(`
      SELECT "sourceCompanyId", "targetCompanyId", "balance"
      FROM "getIntercompanyBalance"('cg1')
      ORDER BY "sourceCompanyId", "targetCompanyId"
    `);

    if (balance.rows.some((row) => row.targetCompanyId === "co-other")) {
      throw new Error(`Expected cross-group target to be excluded: ${JSON.stringify(balance.rows)}`);
    }
  });

  await withAppUser(appDb, "user-cg1", async (db) => {
    const matched = await db.query(`
      SELECT id, status, "matchedWithId"
      FROM "matchIntercompanyTransactions"('cg1')
      WHERE id IN ('ict-a', 'ict-b')
      ORDER BY id
    `);

    expectEqual(
      matched.rows.map((row) => row.status),
      ["Matched", "Matched"],
      "matched transaction statuses"
    );
    expectEqual(matched.rows[0]?.matchedWithId, "line-b", "ict-a match");
    expectEqual(matched.rows[1]?.matchedWithId, "line-a", "ict-b match");
  });

  const crossStatuses = await ownerDb.query(`
    SELECT id, status, "targetJournalLineId"
    FROM "intercompanyTransaction"
    WHERE id IN ('ict-cross-a', 'ict-cross-b')
    ORDER BY id
  `);
  expectEqual(
    crossStatuses.rows.map((row) => [row.id, row.status, row.targetJournalLineId]),
    [
      ["ict-cross-a", "Unmatched", null],
      ["ict-cross-b", "Unmatched", null]
    ],
    "cross-group match state"
  );

  await expectAppError(
    appDb,
    "user-cg1",
    async (db) => {
      await db.query(`SELECT "generateEliminationEntries"('cg1', 'spoof-user')`);
    },
    /User context mismatch/
  );

  await withAppUser(appDb, "user-cg1", async (db) => {
    const result = await db.query(`
      SELECT "generateEliminationEntries"('cg1', 'user-cg1') AS count
    `);
    expectEqual(Number(result.rows[0]?.count), 2, "elimination journal count");
  });

  const eliminated = await ownerDb.query(`
    SELECT id, status, "eliminationJournalId"
    FROM "intercompanyTransaction"
    WHERE id IN ('ict-a', 'ict-b', 'ict-bad')
    ORDER BY id
  `);
  expectEqual(
    eliminated.rows.map((row) => [row.id, row.status, Boolean(row.eliminationJournalId)]),
    [
      ["ict-a", "Eliminated", true],
      ["ict-b", "Eliminated", true],
      ["ict-bad", "Matched", false]
    ],
    "elimination status"
  );

  const eliminationLines = await ownerDb.query(`
    SELECT "journalLineReference"
    FROM "journalLine"
    WHERE "companyId" = 'co-elim'
    ORDER BY "journalLineReference"
  `);
  const references = eliminationLines.rows.map((row) => row.journalLineReference);
  if (!references.includes("ic-elim-ict-a") || !references.includes("ic-elim-ict-b")) {
    throw new Error(`Expected valid elimination lines, got ${JSON.stringify(references)}`);
  }
  if (references.includes("ic-elim-ict-bad")) {
    throw new Error(`Expected mismatched source line to be skipped, got ${JSON.stringify(references)}`);
  }
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

  throw new Error(`Expected app error matching ${pattern}`);
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
