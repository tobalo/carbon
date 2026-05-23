import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import {
  closeSeedCompanyPool,
  seedCompany
} from "../src/seed-company.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-seed-company-smoke-${process.pid}`;
const database = "carbon";
const ownerUrl = (port: number) =>
  `postgresql://carbon:carbon@127.0.0.1:${port}/${database}`;
const appUrl = (port: number) =>
  `postgresql://carbon_app:carbon_app@127.0.0.1:${port}/${database}`;
const serviceUrl = (port: number) =>
  `postgresql://carbon_service:carbon_service@127.0.0.1:${port}/${database}`;
const companyId = "0123456789abcdefghij";
const userId = "usr_seed";

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

    await setupCompany(pool);
    await seedCompany({ companyId, userId });
    await verifySeed(pool);

    console.log("Seed company smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- seed-company Node/Postgres route service verified");
    console.log(
      "- company defaults, permissions, accounting seeds, and lookups verified"
    );
  } finally {
    await closeSeedCompanyPool();
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

async function setupCompany(db: Pool) {
  await db.query(`INSERT INTO "currencyCode" (code, name) VALUES ('USD', 'USD')`);
  await db.query(
    `INSERT INTO "user" (
       id, email, "firstName", "lastName", "fullName", about,
       "acknowledgedITAR", "isConsoleOperator", flags, "createdAt", active
     )
     VALUES (
       $1, 'seed@example.com', 'Seed', 'User', 'Seed User', '',
       true, false, '{}'::jsonb, NOW(), true
     )`,
    [userId]
  );
  await db.query(
    `INSERT INTO "company" (
       id, name, active, "baseCurrencyCode", "countryCode", "createdAt",
       "auditLogEnabled", "isEliminationEntity", "suggestionNotificationGroup"
     )
     VALUES ($1, 'Seed Company', true, 'USD', 'US', NOW(), false, false, ARRAY[]::text[])`,
    [companyId]
  );
}

async function verifySeed(db: Pool) {
  const expectedCounts: Array<[string, string, number]> = [
    ["company group", `SELECT count(*) FROM "companyGroup"`, 1],
    ["user company membership", `SELECT count(*) FROM "userToCompany"`, 1],
    ["company groups", `SELECT count(*) FROM "group"`, 3],
    ["admin employee", `SELECT count(*) FROM "employee"`, 1],
    ["customer statuses", `SELECT count(*) FROM "customerStatus"`, 5],
    ["scrap reasons", `SELECT count(*) FROM "scrapReason"`, 3],
    ["payment terms", `SELECT count(*) FROM "paymentTerm"`, 8],
    ["units of measure", `SELECT count(*) FROM "unitOfMeasure"`, 17],
    ["gauge types", `SELECT count(*) FROM "gaugeType"`, 20],
    ["failure modes", `SELECT count(*) FROM "maintenanceFailureMode"`, 10],
    ["non-conformance types", `SELECT count(*) FROM "nonConformanceType"`, 10],
    [
      "non-conformance required actions",
      `SELECT count(*) FROM "nonConformanceRequiredAction"`,
      12
    ],
    ["sequences", `SELECT count(*) FROM "sequence"`, 16],
    ["currencies", `SELECT count(*) FROM "currency"`, 118],
    ["accounts", `SELECT count(*) FROM "account"`, 64],
    ["account defaults", `SELECT count(*) FROM "accountDefault"`, 1],
    ["fiscal settings", `SELECT count(*) FROM "fiscalYearSettings"`, 1],
    [
      "admin module permissions",
      `SELECT count(*) FROM "employeeTypePermission"`,
      15
    ]
  ];

  for (const [label, sql, expected] of expectedCounts) {
    const count = Number((await db.query(sql)).rows[0]?.count ?? 0);
    assertEqual(count, expected, label);
  }

  const company = await db.query<{
    companyGroupId: string | null;
  }>(`SELECT "companyGroupId" FROM "company" WHERE id = $1`, [companyId]);
  if (!company.rows[0]?.companyGroupId) {
    throw new Error("companyGroupId was not assigned");
  }

  const permissions = await db.query<{
    permissions: Record<string, string[]>;
  }>(`SELECT permissions FROM "userPermission" WHERE id = $1`, [userId]);
  const accountingView = permissions.rows[0]?.permissions?.accounting_view ?? [];
  if (!accountingView.includes(companyId)) {
    throw new Error("accounting_view permission was not assigned");
  }

  const defaults = await db.query<{ missing: string[] }>(
    `SELECT ARRAY(
       SELECT key
       FROM jsonb_each_text(to_jsonb("accountDefault"))
       WHERE key <> 'updatedBy' AND value IS NULL
     ) AS missing
     FROM "accountDefault"
     WHERE "companyId" = $1`,
    [companyId]
  );
  const missingDefaults = defaults.rows[0]?.missing ?? [];
  if (missingDefaults.length > 0) {
    throw new Error(`account defaults missing: ${missingDefaults.join(", ")}`);
  }
}

function assertEqual(actual: number, expected: number, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function run(
  command: string,
  args: string[],
  options: Parameters<typeof execFileSync>[2] = {}
) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 128,
      ...options
    });
  } catch (error) {
    const detail = [
      `Command failed: ${command} ${args.join(" ")}`,
      error instanceof Error && "stdout" in error
        ? String(error.stdout ?? "")
        : "",
      error instanceof Error && "stderr" in error
        ? String(error.stderr ?? "")
        : ""
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
