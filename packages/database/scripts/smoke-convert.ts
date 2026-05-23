import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { closeConvertPool, convert } from "../src/convert.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-convert-smoke-${process.pid}`;
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

    await setupConvertFixture(pool);

    await convert({
      type: "methodVersionToActive",
      id: "mm-draft",
      companyId: "co1",
      userId: "user1"
    });
    await verifyMethodActivation(pool);

    const purchaseInvoice = await convert({
      type: "purchaseOrderToPurchaseInvoice",
      id: "po1",
      companyId: "co1",
      userId: "user1"
    });
    await verifyPurchaseInvoice(pool, purchaseInvoice.id);

    const salesInvoice = await convert({
      type: "salesOrderToSalesInvoice",
      id: "so1",
      companyId: "co1",
      userId: "user1"
    });
    await verifySalesInvoice(pool, salesInvoice.id);

    console.log("Convert smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- method activation verified");
    console.log("- purchase and sales invoice conversions verified");
  } finally {
    await closeConvertPool();
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

async function setupConvertFixture(db: Pool) {
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

    INSERT INTO "sequence" (
      id, "table", name, prefix, suffix, next, size, step, "companyId"
    )
    VALUES
      ('seq-pinv', 'purchaseInvoice', 'Purchase Invoice', 'PINV-', NULL, 0, 4, 1, 'co1'),
      ('seq-sinv', 'salesInvoice', 'Sales Invoice', 'SINV-', NULL, 0, 4, 1, 'co1');

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

    INSERT INTO "customer" (
      id, name, "companyId", "createdAt", "createdBy", embedding, "taxPercent"
    )
    VALUES ('customer1', 'Customer', 'co1', NOW(), 'user1', '[0]', 0);

    INSERT INTO "item" (
      id, name, "readableId", "readableIdWithRevision", active, "companyId",
      "createdAt", "createdBy", embedding, "itemTrackingType",
      "replenishmentSystem", "requiresInspection", type, "unitOfMeasureCode",
      "defaultMethodType"
    )
    VALUES
      (
        'item1', 'Part', 'PART', 'PART', true, 'co1', NOW(), 'user1',
        '[0]', 'Inventory', 'Buy', false, 'Part', 'EA', 'Pull from Inventory'
      ),
      (
        'item2', 'Material', 'MAT', 'MAT', true, 'co1', NOW(), 'user1',
        '[0]', 'Inventory', 'Buy', false, 'Material', 'EA', 'Pull from Inventory'
      );

    INSERT INTO "makeMethod" (
      id, "itemId", status, version, "companyId", "createdAt", "createdBy"
    )
    VALUES
      ('mm-active', 'item1', 'Active', 1, 'co1', NOW(), 'user1'),
      ('mm-draft', 'item1', 'Draft', 2, 'co1', NOW(), 'user1');

    INSERT INTO "methodMaterial" (
      id, "makeMethodId", "materialMakeMethodId", "itemId", "itemType",
      "methodType", quantity, "scrapQuantity", "unitOfMeasureCode",
      "sourcingType", "storageUnitIds", kit, "order", "companyId",
      "createdAt", "createdBy"
    )
    VALUES (
      'method-material1', 'mm-draft', 'mm-active', 'item2', 'Material',
      'Make to Order', 1, 0, 'EA', 'Specified', '[]'::jsonb, false, 1,
      'co1', NOW(), 'user1'
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

    INSERT INTO "purchaseOrderPayment" (
      id, "paymentComplete", "companyId"
    )
    VALUES ('po1', false, 'co1');

    INSERT INTO "purchaseOrderDelivery" (
      id, "dropShipment", "locationId", "supplierShippingCost", "companyId"
    )
    VALUES ('po1', false, 'loc1', 0, 'co1');

    INSERT INTO "purchaseOrderLine" (
      id, "purchaseOrderId", "purchaseOrderLineType", "itemId", "locationId",
      "purchaseQuantity", "quantityToInvoice", "purchaseUnitOfMeasureCode",
      "inventoryUnitOfMeasureCode", "conversionFactor", "unitPrice",
      "supplierUnitPrice", "exchangeRate", "invoicedComplete",
      "receivedComplete", "requiresInspection", "sortOrder",
      "supplierShippingCost", "supplierTaxAmount", "companyId", "createdAt",
      "createdBy"
    )
    VALUES (
      'pol1', 'po1', 'Part', 'item1', 'loc1', 5, 5, 'EA', 'EA', 1,
      10, 10, 1, false, false, false, 1, 0, 0, 'co1', NOW(), 'user1'
    );

    INSERT INTO "salesOrder" (
      id, "salesOrderId", "revisionId", status, "customerId", "currencyCode",
      "locationId", "companyId", "createdAt", "createdBy"
    )
    VALUES (
      'so1', 'SO-1', 0, 'To Ship and Invoice', 'customer1', 'USD',
      'loc1', 'co1', NOW(), 'user1'
    );

    INSERT INTO "salesOrderPayment" (
      id, "paymentComplete", "companyId"
    )
    VALUES ('so1', false, 'co1');

    INSERT INTO "salesOrderShipment" (
      id, "dropShipment", "locationId", "shippingCost", "companyId"
    )
    VALUES ('so1', false, 'loc1', 0, 'co1');

    INSERT INTO "salesOrderLine" (
      id, "salesOrderId", "salesOrderLineType", "itemId", "locationId",
      "saleQuantity", "quantityToSend", "quantityToInvoice",
      "quantityInvoiced", "quantitySent", "unitOfMeasureCode", "unitPrice",
      "methodType", "addOnCost", "nonTaxableAddOnCost", "shippingCost",
      "taxPercent", "sortOrder", "invoicedComplete", "sentComplete",
      "requiresInspection", status, "companyId", "createdAt", "createdBy"
    )
    VALUES (
      'sol1', 'so1', 'Part', 'item1', 'loc1', 5, 5, 5, 0, 0, 'EA',
      10, 'Pull from Inventory', 0, 0, 0, 0, 1, false, false,
      false, 'Ordered', 'co1', NOW(), 'user1'
    );
  `);
}

async function verifyMethodActivation(db: Pool) {
  await assertText(
    db,
    `SELECT status FROM "makeMethod" WHERE id = 'mm-draft'`,
    "Active",
    "draft method status"
  );
  await assertText(
    db,
    `SELECT status FROM "makeMethod" WHERE id = 'mm-active'`,
    "Archived",
    "previous active method status"
  );
  await assertText(
    db,
    `SELECT "materialMakeMethodId" AS value FROM "methodMaterial" WHERE id = 'method-material1'`,
    "mm-draft",
    "related material method"
  );
}

async function verifyPurchaseInvoice(db: Pool, invoiceId: string) {
  await assertText(
    db,
    `SELECT status FROM "purchaseInvoice" WHERE id = '${invoiceId}'`,
    "Draft",
    "converted purchase invoice status"
  );
  await assertText(
    db,
    `SELECT "invoiceId" AS value FROM "purchaseInvoice" WHERE id = '${invoiceId}'`,
    "PINV-0001",
    "purchase invoice readable id"
  );
  await assertQuantity(
    db,
    `SELECT quantity FROM "purchaseInvoiceLine" WHERE "invoiceId" = '${invoiceId}'`,
    5,
    "purchase invoice line quantity"
  );
}

async function verifySalesInvoice(db: Pool, invoiceId: string) {
  await assertText(
    db,
    `SELECT status FROM "salesInvoice" WHERE id = '${invoiceId}'`,
    "Draft",
    "converted sales invoice status"
  );
  await assertText(
    db,
    `SELECT "invoiceId" AS value FROM "salesInvoice" WHERE id = '${invoiceId}'`,
    "SINV-0001",
    "sales invoice readable id"
  );
  await assertQuantity(
    db,
    `SELECT quantity FROM "salesInvoiceLine" WHERE "invoiceId" = '${invoiceId}'`,
    5,
    "sales invoice line quantity"
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
