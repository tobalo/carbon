import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-accounting-reporting-smoke-${process.pid}`;
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
    await verifyAccountingReportScope(pool);

    console.log("Accounting reporting RPC smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- accounting report RPC signatures are present");
    console.log("- journal lines and translation company context stay company-group scoped");
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
        'accountTreeBalances',
        'accountTreeBalancesByCompany',
        'trialBalance',
        'translateTrialBalance'
      )
    ORDER BY proname, args
  `);

  const signatures = new Set(
    result.rows.map((row) => `${row.proname}(${row.args})`)
  );
  const expected = [
    "accountTreeBalances(p_company_group_id text, from_date date, to_date date)",
    "accountTreeBalancesByCompany(p_company_group_id text, p_company_id text, from_date date, to_date date)",
    "translateTrialBalance(p_company_group_id text, p_company_id text, p_target_currency text, p_period_end date, p_period_start date)",
    "trialBalance(p_company_group_id text, p_company_id text, from_date date, to_date date)"
  ];

  for (const signature of expected) {
    if (!signatures.has(signature)) {
      throw new Error(`Missing expected accounting reporting function: ${signature}`);
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
        ('cg1', 'Company group 1', NOW(), 'user-co1'),
        ('cg2', 'Company group 2', NOW(), 'user-co2')
    `);

    await db.query(`
      INSERT INTO "company" (
        id, active, "auditLogEnabled", "baseCurrencyCode", "companyGroupId",
        "createdAt", "isEliminationEntity", name, "suggestionNotificationGroup"
      )
      VALUES
        ('co1', true, false, 'USD', 'cg1', NOW(), false, 'Company 1', ARRAY[]::text[]),
        ('co2', true, false, 'EUR', 'cg2', NOW(), false, 'Company 2', ARRAY[]::text[])
    `);

    await db.query(`
      INSERT INTO "account" (
        id, active, class, "companyGroupId", "consolidatedRate", "createdAt",
        "createdBy", "incomeBalance", "isGroup", "isSystem", name, number,
        "parentId"
      )
      VALUES
        ('asset-root', true, 'Asset', 'cg1', 'Current', NOW(), 'user-co1', 'Balance Sheet', true, true, 'Assets', '1000', NULL),
        ('cash-leaf', true, 'Asset', 'cg1', 'Current', NOW(), 'user-co1', 'Balance Sheet', false, false, 'Cash', '1010', 'asset-root'),
        ('asset-root-cg2', true, 'Asset', 'cg2', 'Current', NOW(), 'user-co2', 'Balance Sheet', true, true, 'Assets CG2', '1000', NULL)
    `);

    await db.query(`
      INSERT INTO "journal" (
        id, "companyId", "createdAt", "createdBy", "journalEntryId",
        "postingDate", status
      )
      VALUES
        ('journal-co1', 'co1', NOW(), 'user-co1', 'JE-CO1', DATE '2026-01-15', 'Posted'),
        ('journal-co2', 'co2', NOW(), 'user-co2', 'JE-CO2', DATE '2026-01-15', 'Posted')
    `);

    await db.query(`
      INSERT INTO "journalLine" (
        id, "accountId", accrual, amount, "companyId", "createdAt",
        "journalId", "journalLineReference", quantity
      )
      VALUES
        ('line-co1', 'cash-leaf', false, 100, 'co1', NOW(), 'journal-co1', '1', 1),
        ('line-cross-group', 'cash-leaf', false, 999, 'co2', NOW(), 'journal-co2', '2', 1),
        ('line-mismatched-journal', 'cash-leaf', false, 50, 'co1', NOW(), 'journal-co2', '3', 1)
    `);

    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function verifyAccountingReportScope(db) {
  const tree = await db.query(`
    SELECT "accountId", "balance", "balanceAtDate", "netChange"
    FROM "accountTreeBalances"('cg1', DATE '2026-01-01', DATE '2026-12-31')
    WHERE "accountId" IN ('asset-root', 'cash-leaf')
    ORDER BY "accountId"
  `);

  const root = tree.rows.find((row) => row.accountId === "asset-root");
  const cash = tree.rows.find((row) => row.accountId === "cash-leaf");

  expectNumeric(root?.balance, 100, "group root balance");
  expectNumeric(root?.balanceAtDate, 100, "group root balance at date");
  expectNumeric(root?.netChange, 100, "group root net change");
  expectNumeric(cash?.balance, 100, "leaf balance");

  const byCompany = await db.query(`
    SELECT "accountId", "balance", "balanceAtDate", "netChange"
    FROM "accountTreeBalancesByCompany"('cg1', 'co1', DATE '2026-01-01', DATE '2026-12-31')
    WHERE "accountId" = 'cash-leaf'
  `);

  expectNumeric(byCompany.rows[0]?.balance, 100, "company leaf balance");
  expectNumeric(byCompany.rows[0]?.balanceAtDate, 100, "company leaf balance at date");
  expectNumeric(byCompany.rows[0]?.netChange, 100, "company leaf net change");

  const trial = await db.query(`
    SELECT "accountId", "debitBalance", "creditBalance", "netChange"
    FROM "trialBalance"('cg1', 'co1', DATE '2026-01-01', DATE '2026-12-31')
  `);

  if (trial.rows.length !== 1) {
    throw new Error(`Expected one trial balance row, got ${JSON.stringify(trial.rows)}`);
  }

  expectEqual(trial.rows[0].accountId, "cash-leaf", "trial balance account");
  expectNumeric(trial.rows[0].debitBalance, 100, "trial balance debit");
  expectNumeric(trial.rows[0].creditBalance, 0, "trial balance credit");
  expectNumeric(trial.rows[0].netChange, 100, "trial balance net change");

  const translated = await db.query(`
    SELECT "accountId", "localBalance", "exchangeRate", "translatedBalance"
    FROM "translateTrialBalance"('cg1', 'co1', 'USD', DATE '2026-12-31', DATE '2026-01-01')
  `);

  if (translated.rows.length !== 1) {
    throw new Error(
      `Expected one translated balance row, got ${JSON.stringify(translated.rows)}`
    );
  }

  expectEqual(translated.rows[0].accountId, "cash-leaf", "translated account");
  expectNumeric(translated.rows[0].localBalance, 100, "translated local balance");
  expectNumeric(translated.rows[0].exchangeRate, 1, "translated same-currency rate");
  expectNumeric(translated.rows[0].translatedBalance, 100, "translated balance");

  const crossGroupTranslation = await db.query(`
    SELECT "accountId"
    FROM "translateTrialBalance"('cg1', 'co2', 'USD', DATE '2026-12-31', DATE '2026-01-01')
  `);

  if (crossGroupTranslation.rows.length !== 0) {
    throw new Error(
      `Expected no cross-group translation rows, got ${JSON.stringify(crossGroupTranslation.rows)}`
    );
  }
}

function expectEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Unexpected ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function expectNumeric(actual, expected, label) {
  const numeric = actual === null || actual === undefined ? actual : Number(actual);

  if (numeric !== expected) {
    throw new Error(
      `Unexpected ${label}: expected ${expected}, got ${JSON.stringify(actual)}`
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
