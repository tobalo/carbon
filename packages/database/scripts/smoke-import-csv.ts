import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { closeImportCsvPool, importCsvRows } from "../src/import-csv.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-import-csv-smoke-${process.pid}`;
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

    await setupImportFixture(pool);
    await importCsvRows({
      table: "customer",
      records: [
        {
          ExternalId: "CUST-1",
          Name: "Acme",
          TaxId: "TAX-1"
        }
      ],
      columnMappings: {
        id: "ExternalId",
        name: "Name",
        taxId: "TaxId"
      },
      companyId: "co1",
      userId: "user1"
    });
    await verifyCustomerImport(pool, "Acme", "TAX-1");

    await importCsvRows({
      table: "customer",
      records: [
        {
          ExternalId: "CUST-1",
          Name: "Acme Updated",
          TaxId: "TAX-2"
        }
      ],
      columnMappings: {
        id: "ExternalId",
        name: "Name",
        taxId: "TaxId"
      },
      companyId: "co1",
      userId: "user1"
    });
    await verifyCustomerImport(pool, "Acme Updated", "TAX-2");
    await assertCount(pool, `SELECT count(*) FROM "customer"`, 1, "customers");

    await importCsvRows({
      table: "part",
      records: [
        {
          ExternalId: "PART-1",
          PartNumber: "P-100",
          Revision: "A",
          Name: "Widget",
          Tracking: "Inventory",
          Unit: "EA"
        }
      ],
      columnMappings: {
        id: "ExternalId",
        readableId: "PartNumber",
        revision: "Revision",
        name: "Name",
        itemTrackingType: "Tracking",
        unitOfMeasureCode: "Unit"
      },
      companyId: "co1",
      userId: "user1"
    });
    await verifyPartImport(pool);

    console.log("Import-csv smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- customer import and re-import verified");
    console.log("- part item/type-specific rows and CSV mapping verified");
  } finally {
    await closeImportCsvPool();
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

async function setupImportFixture(db: Pool) {
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

    INSERT INTO "unitOfMeasure" (
      id, code, name, active, "companyId", "createdAt", "createdBy"
    )
    VALUES ('uom1', 'EA', 'Each', true, 'co1', NOW(), 'user1');
  `);
}

async function verifyCustomerImport(db: Pool, name: string, taxId: string) {
  const customer = await one<{ id: string; name: string }>(
    db,
    `SELECT id, name FROM "customer" WHERE name = $1`,
    [name]
  );
  assertEqual(customer.name, name, "customer name");
  const tax = await one<{ taxId: string }>(
    db,
    `SELECT "taxId" FROM "customerTax" WHERE "customerId" = $1`,
    [customer.id]
  );
  assertEqual(tax.taxId, taxId, "customer tax id");
  await assertCount(
    db,
    `SELECT count(*)
     FROM "externalIntegrationMapping"
     WHERE "entityType" = 'customer'
       AND integration = 'csv'
       AND "externalId" = 'CUST-1'
       AND "entityId" = $1`,
    1,
    "customer CSV mapping",
    [customer.id]
  );
}

async function verifyPartImport(db: Pool) {
  const item = await one<{
    id: string;
    readableId: string;
    readableIdWithRevision: string;
    type: string;
  }>(
    db,
    `SELECT id, "readableId", "readableIdWithRevision", type
     FROM "item"
     WHERE "readableId" = 'P-100'`
  );
  assertEqual(item.type, "Part", "item type");
  assertEqual(
    item.readableIdWithRevision,
    "P-100.A",
    "readable id with revision"
  );
  await assertCount(db, `SELECT count(*) FROM "part" WHERE id = 'P-100'`, 1, "part row");
  await assertCount(
    db,
    `SELECT count(*)
     FROM "externalIntegrationMapping"
     WHERE "entityType" = 'item'
       AND integration = 'csv'
       AND "externalId" = 'part:PART-1'
       AND "entityId" = $1`,
    1,
    "part CSV mapping",
    [item.id]
  );
}

async function assertCount(
  db: Pool,
  query: string,
  expected: number,
  label: string,
  values: unknown[] = []
) {
  const result = await db.query<{ count: string }>(query, values);
  assertEqual(Number(result.rows[0]?.count ?? 0), expected, label);
}

async function one<T extends Record<string, unknown>>(
  db: Pool,
  query: string,
  values: unknown[] = []
) {
  const result = await db.query<T>(query, values);
  const row = result.rows[0];
  if (!row) throw new Error(`Expected one row for query: ${query}`);
  return row;
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}
