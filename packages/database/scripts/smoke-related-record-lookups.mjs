import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-related-record-smoke-${process.pid}`;
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
    await verifyRelatedRecordCompanyScope(pool);

    console.log("Related-record lookup RPC smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- related-record lookup RPCs require company_id");
    console.log("- opportunity RFQ, quote, and sales order rows stay company-scoped");
    console.log("- supplier interaction RFQ, quote, order, and invoice rows stay company-scoped");
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
        'get_opportunity_with_related_records',
        'get_supplier_interaction_with_related_records'
      )
    ORDER BY proname, args
  `);

  const signatures = new Set(
    result.rows.map((row) => `${row.proname}(${row.args})`)
  );
  const expected = [
    "get_opportunity_with_related_records(opportunity_id text, company_id text)",
    "get_supplier_interaction_with_related_records(supplier_interaction_id text, company_id text)"
  ];

  for (const signature of expected) {
    if (!signatures.has(signature)) {
      throw new Error(`Missing expected related-record function: ${signature}`);
    }
  }

  for (const signature of signatures) {
    if (
      signature === "get_opportunity_with_related_records(opportunity_id text)" ||
      signature ===
        "get_supplier_interaction_with_related_records(supplier_interaction_id text)"
    ) {
      throw new Error(`Legacy unscoped related-record function remains: ${signature}`);
    }
  }
}

async function setupFixtures(db) {
  await db.query("BEGIN");

  try {
    await db.query("SET LOCAL session_replication_role = replica");
    await db.query(`
      INSERT INTO "opportunity" (
        id, "companyId", "customerId", "purchaseOrderDocumentPath",
        "requestForQuoteDocumentPath"
      )
      VALUES
        ('opp-co1', 'co1', 'customer-co1', 'co1/po.pdf', 'co1/rfq.pdf'),
        ('opp-co2', 'co2', 'customer-co2', 'co2/po.pdf', 'co2/rfq.pdf')
    `);

    await db.query(`
      INSERT INTO "salesRfq" (
        id, "companyId", "createdAt", "createdBy", "customerId",
        "opportunityId", "revisionId", "rfqDate", "rfqId", status
      )
      VALUES
        ('sales-rfq-co1', 'co1', NOW(), 'user-co1', 'customer-co1', 'opp-co1', 1, CURRENT_DATE, 'RFQ-CO1', 'Draft'),
        ('sales-rfq-leak', 'co2', NOW(), 'user-co2', 'customer-co2', 'opp-co1', 99, CURRENT_DATE, 'RFQ-LEAK', 'Draft')
    `);

    await db.query(`
      INSERT INTO "quote" (
        id, "companyId", "createdAt", "createdBy", "customerId",
        "opportunityId", "quoteId", "revisionId", status
      )
      VALUES
        ('quote-co1', 'co1', NOW(), 'user-co1', 'customer-co1', 'opp-co1', 'QUOTE-CO1', 1, 'Draft'),
        ('quote-leak', 'co2', NOW(), 'user-co2', 'customer-co2', 'opp-co1', 'QUOTE-LEAK', 99, 'Draft')
    `);

    await db.query(`
      INSERT INTO "salesOrder" (
        id, "companyId", "createdAt", "createdBy", "currencyCode",
        "customerId", "opportunityId", "revisionId", "salesOrderId", status
      )
      VALUES
        ('sales-order-co1', 'co1', NOW(), 'user-co1', 'USD', 'customer-co1', 'opp-co1', 1, 'SO-CO1', 'Draft'),
        ('sales-order-leak', 'co2', NOW(), 'user-co2', 'USD', 'customer-co2', 'opp-co1', 99, 'SO-LEAK', 'Draft')
    `);

    await db.query(`
      INSERT INTO "supplierInteraction" (id, "companyId", "supplierId")
      VALUES
        ('supplier-interaction-co1', 'co1', 'supplier-co1'),
        ('supplier-interaction-co2', 'co2', 'supplier-co2')
    `);

    await db.query(`
      INSERT INTO "supplierQuote" (
        id, "companyId", "createdAt", "createdBy", "quotedDate",
        "revisionId", status, "supplierId", "supplierInteractionId",
        "supplierQuoteId", "supplierQuoteType"
      )
      VALUES
        ('supplier-quote-co1', 'co1', NOW(), 'user-co1', CURRENT_DATE, 1, 'Draft', 'supplier-co1', 'supplier-interaction-co1', 'SQ-CO1', 'Purchase'),
        ('supplier-quote-leak', 'co2', NOW(), 'user-co2', CURRENT_DATE, 99, 'Draft', 'supplier-co2', 'supplier-interaction-co1', 'SQ-LEAK', 'Purchase')
    `);

    await db.query(`
      INSERT INTO "purchasingRfq" (
        id, "companyId", "createdAt", "createdBy", "revisionId",
        "rfqDate", "rfqId", status
      )
      VALUES
        ('purchasing-rfq-co1', 'co1', NOW(), 'user-co1', 1, CURRENT_DATE, 'PRFQ-CO1', 'Draft'),
        ('purchasing-rfq-leak', 'co2', NOW(), 'user-co2', 99, CURRENT_DATE, 'PRFQ-LEAK', 'Draft')
    `);

    await db.query(`
      INSERT INTO "purchasingRfqToSupplierQuote" (
        "companyId", "purchasingRfqId", "supplierQuoteId"
      )
      VALUES
        ('co1', 'purchasing-rfq-co1', 'supplier-quote-co1'),
        ('co2', 'purchasing-rfq-leak', 'supplier-quote-leak')
    `);

    await db.query(`
      INSERT INTO "purchaseOrder" (
        id, "purchaseOrderId", "purchaseOrderType", "revisionId", status,
        "supplierId", "supplierInteractionId", "companyId", "createdAt",
        "createdBy", "currencyCode", "exchangeRate"
      )
      VALUES
        ('purchase-order-co1', 'PO-CO1', 'Purchase', 1, 'Draft', 'supplier-co1', 'supplier-interaction-co1', 'co1', NOW(), 'user-co1', 'USD', 1),
        ('purchase-order-leak', 'PO-LEAK', 'Purchase', 99, 'Draft', 'supplier-co2', 'supplier-interaction-co1', 'co2', NOW(), 'user-co2', 'USD', 1)
    `);

    await db.query(`
      INSERT INTO "purchaseInvoice" (
        id, "companyId", "createdAt", "createdBy", balance, "currencyCode",
        "exchangeRate", "invoiceId", status, subtotal, "supplierInteractionId",
        "totalAmount", "totalDiscount", "totalTax"
      )
      VALUES
        ('purchase-invoice-co1', 'co1', NOW(), 'user-co1', 10, 'USD', 1, 'PI-CO1', 'Draft', 10, 'supplier-interaction-co1', 10, 0, 0),
        ('purchase-invoice-leak', 'co2', NOW(), 'user-co2', 99, 'USD', 1, 'PI-LEAK', 'Draft', 99, 'supplier-interaction-co1', 99, 0, 0)
    `);

    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function verifyRelatedRecordCompanyScope(db) {
  const opportunityRows = await rows(
    db,
    `SELECT *
     FROM get_opportunity_with_related_records('opp-co1', 'co1')`
  );
  expectEqual(opportunityRows.length, 1, "opportunity row count");
  const opportunity = opportunityRows[0];
  expectEqual(ids(opportunity.salesRfqs), ["sales-rfq-co1"], "sales RFQs");
  expectEqual(ids(opportunity.quotes), ["quote-co1"], "quotes");
  expectEqual(ids(opportunity.salesOrders), ["sales-order-co1"], "sales orders");

  await expectNoRows(
    db,
    `SELECT id FROM get_opportunity_with_related_records('opp-co1', 'co2')`
  );

  const supplierRows = await rows(
    db,
    `SELECT *
     FROM get_supplier_interaction_with_related_records(
       'supplier-interaction-co1',
       'co1'
     )`
  );
  expectEqual(supplierRows.length, 1, "supplier interaction row count");
  const supplierInteraction = supplierRows[0];
  expectEqual(
    supplierInteraction.purchasingRfq?.id,
    "purchasing-rfq-co1",
    "purchasing RFQ"
  );
  expectEqual(
    ids(supplierInteraction.supplierQuotes),
    ["supplier-quote-co1"],
    "supplier quotes"
  );
  expectEqual(
    ids(supplierInteraction.purchaseOrders),
    ["purchase-order-co1"],
    "purchase orders"
  );
  expectEqual(
    ids(supplierInteraction.purchaseInvoices),
    ["purchase-invoice-co1"],
    "purchase invoices"
  );

  await expectNoRows(
    db,
    `SELECT id
     FROM get_supplier_interaction_with_related_records(
       'supplier-interaction-co1',
       'co2'
     )`
  );
}

async function rows(db, sql) {
  const result = await db.query(sql);
  return result.rows;
}

async function expectNoRows(db, sql) {
  const result = await db.query(sql);

  if (result.rows.length !== 0) {
    throw new Error(
      `Expected no rows for ${sql}, got ${JSON.stringify(result.rows)}`
    );
  }
}

function ids(value) {
  return (value ?? []).map((row) => row.id).sort();
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
