import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { closePostReceiptPool, postReceipt } from "../src/post-receipt.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-post-receipt-smoke-${process.pid}`;
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

    await setupPostReceiptFixture(pool);
    await postReceipt({
      type: "post",
      receiptId: "receipt1",
      companyId: "co1",
      userId: "user1"
    });
    await verifyPostedReceipt(pool);

    await postReceipt({
      type: "void",
      receiptId: "receipt1",
      companyId: "co1",
      userId: "user1"
    });
    await verifyVoidedReceipt(pool);

    console.log("Post-receipt smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- purchase-order receipt posting verified");
    console.log("- item-ledger reversal and PO quantity rollback verified");
  } finally {
    await closePostReceiptPool();
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

async function setupPostReceiptFixture(db: Pool) {
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

    INSERT INTO "location" (
      id, name, "companyId", "createdAt", "createdBy", "addressLine1",
      city, "postalCode", "stateProvince", timezone
    )
    VALUES (
      'loc1', 'Main', 'co1', NOW(), 'user1', '1 Main', 'Austin',
      '78701', 'TX', 'America/Chicago'
    );

    INSERT INTO "supplier" (
      id, name, "companyId", "createdAt", "createdBy", "currencyCode",
      embedding, "taxPercent"
    )
    VALUES ('supplier1', 'Supplier', 'co1', NOW(), 'user1', 'USD', '[0]', 0);

    INSERT INTO "supplierInteraction" (id, "supplierId", "companyId")
    VALUES ('si1', 'supplier1', 'co1');

    INSERT INTO "item" (
      id, name, "readableId", "readableIdWithRevision", active, "companyId",
      "createdAt", "createdBy", embedding, "itemTrackingType",
      "replenishmentSystem", "requiresInspection", type, "unitOfMeasureCode"
    )
    VALUES (
      'item1', 'Part', 'PART', 'PART', true, 'co1', NOW(), 'user1',
      '[0]', 'Inventory', 'Buy', false, 'Part', 'EA'
    );

    INSERT INTO "purchaseOrder" (
      id, "purchaseOrderId", "purchaseOrderType", "revisionId", status,
      "supplierId", "supplierInteractionId", "companyId", "createdAt",
      "createdBy", "currencyCode", "exchangeRate"
    )
    VALUES (
      'po1', 'PO-1', 'Purchase', 0, 'To Receive and Invoice',
      'supplier1', 'si1', 'co1', NOW(), 'user1', 'USD', 1
    );

    INSERT INTO "purchaseOrderLine" (
      id, "purchaseOrderId", "purchaseOrderLineType", "itemId", "locationId",
      "purchaseQuantity", "quantityReceived", "quantityToReceive",
      "purchaseUnitOfMeasureCode", "inventoryUnitOfMeasureCode",
      "conversionFactor", "unitPrice", "supplierUnitPrice",
      "exchangeRate", "invoicedComplete", "receivedComplete",
      "requiresInspection", "sortOrder", "supplierShippingCost",
      "supplierTaxAmount", "companyId", "createdAt", "createdBy"
    )
    VALUES (
      'pol1', 'po1', 'Part', 'item1', 'loc1', 5, 0, 5, 'EA', 'EA',
      1, 10, 10, 1, false, false, false, 1, 0, 0,
      'co1', NOW(), 'user1'
    );

    INSERT INTO "receipt" (
      id, "receiptId", status, "sourceDocument", "sourceDocumentId",
      "sourceDocumentReadableId", "locationId", "supplierId", "companyId",
      "createdAt", "createdBy"
    )
    VALUES (
      'receipt1', 'REC-1', 'Pending', to_jsonb('Purchase Order'::text),
      'po1', 'PO-1', 'loc1', 'supplier1', 'co1', NOW(), 'user1'
    );

    INSERT INTO "receiptLine" (
      id, "receiptId", "lineId", "itemId", "locationId", "orderQuantity",
      "outstandingQuantity", "receivedQuantity", "requiresBatchTracking",
      "requiresSerialTracking", "unitOfMeasure", "unitPrice",
      "conversionFactor", "companyId", "createdAt", "createdBy"
    )
    VALUES (
      'rl1', 'receipt1', 'pol1', 'item1', 'loc1', 5, 5, 5,
      false, false, 'EA', 10, 1, 'co1', NOW(), 'user1'
    );
  `);
}

async function verifyPostedReceipt(db: Pool) {
  await assertText(
    db,
    `SELECT status FROM "receipt" WHERE id = 'receipt1'`,
    "Posted",
    "posted receipt status"
  );
  await assertText(
    db,
    `SELECT "postedBy" AS value FROM "receipt" WHERE id = 'receipt1'`,
    "user1",
    "posted by"
  );
  await assertQuantity(
    db,
    `SELECT "quantityReceived" AS quantity FROM "purchaseOrderLine" WHERE id = 'pol1'`,
    5,
    "received purchase order quantity"
  );
  await assertText(
    db,
    `SELECT status FROM "purchaseOrder" WHERE id = 'po1'`,
    "To Invoice",
    "purchase order status after receipt"
  );
  await assertQuantity(
    db,
    `
      SELECT COALESCE(SUM(quantity), 0) AS quantity
      FROM "itemLedger"
      WHERE "documentId" = 'receipt1'
        AND "documentType" #>> '{}' = 'Purchase Receipt'
    `,
    5,
    "purchase receipt item ledger quantity"
  );
}

async function verifyVoidedReceipt(db: Pool) {
  await assertText(
    db,
    `SELECT status FROM "receipt" WHERE id = 'receipt1'`,
    "Voided",
    "voided receipt status"
  );
  await assertQuantity(
    db,
    `SELECT "quantityReceived" AS quantity FROM "purchaseOrderLine" WHERE id = 'pol1'`,
    0,
    "voided purchase order quantity"
  );
  await assertText(
    db,
    `SELECT status FROM "purchaseOrder" WHERE id = 'po1'`,
    "To Receive and Invoice",
    "purchase order status after void"
  );
  await assertQuantity(
    db,
    `
      SELECT COALESCE(SUM(quantity), 0) AS quantity
      FROM "itemLedger"
      WHERE "documentId" = 'receipt1'
        AND "documentType" #>> '{}' = 'Purchase Receipt'
    `,
    0,
    "voided purchase receipt item ledger quantity"
  );
}

async function assertText(
  db: Pool,
  query: string,
  expected: string,
  label: string
) {
  const result = await db.query<{ status?: string; value?: string }>(query);
  const row = result.rows[0] ?? {};
  assertEqual(row.status ?? row.value, expected, label);
}

async function assertQuantity(
  db: Pool,
  query: string,
  expected: number,
  label: string
) {
  const result = await db.query<{ quantity: string | number }>(query);
  assertEqual(Number(result.rows[0]?.quantity ?? 0), expected, label);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}
