import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-job-completion-smoke-${process.pid}`;
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
      image,
    ]);
    containerStarted = true;

    await waitForPostgres(ownerUrl(port));
    migrate(port);
    psql(jobCompletionSmokeSql(), port, { stdio: "pipe" });
    psqlApp(purchasedPriceAppScopeSql(), port, { stdio: "pipe" });

    console.log("Job completion smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- accounting completion/backflush cumulative deltas verified");
    console.log("- tracked batch/serial completion storage-unit behavior verified");
    console.log("- FIFO backflush cost-layer depletion verified");
    console.log("- production-event edge cases verified");
    console.log("- production event and job close function ports verified");
    console.log("- purchased-price function port and Better Auth company gate verified");
  } finally {
    if (!containerStarted) {
      return;
    }

    try {
      run("docker", ["rm", "-f", containerName], { stdio: "ignore" });
    } catch {
      // Best-effort cleanup after a failed smoke run.
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
        JOBS_DATABASE_URL: serviceUrl(port),
      },
      stdio: "pipe",
    }
  );
}

function psql(sql, port, options = {}) {
  return run("psql", [ownerUrl(port), "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    ...options,
  });
}

function psqlApp(sql, port, options = {}) {
  return run("psql", [appUrl(port), "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    ...options,
  });
}

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 128,
      ...options,
    });
  } catch (error) {
    const detail = [
      `Command failed: ${command} ${args.join(" ")}`,
      error.stdout?.toString(),
      error.stderr?.toString(),
    ]
      .filter(Boolean)
      .join("\n");
    throw new Error(detail);
  }
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

function jobCompletionSmokeSql() {
  return String.raw`
INSERT INTO "user" (
  id, email, "firstName", "lastName", "fullName", about,
  "acknowledgedITAR", "isConsoleOperator", flags, "createdAt"
)
VALUES (
  'user1', 'user1@example.com', 'Test', 'User', 'Test User', '',
  false, false, '{}'::jsonb, NOW()
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

INSERT INTO "userToCompany" ("userId", "companyId", role)
VALUES ('user1', 'co1', 'employee');

INSERT INTO "account" (
  id, name, "companyGroupId", "createdAt", "createdBy", "accountType",
  class, "consolidatedRate", "incomeBalance", active, "isGroup", "isSystem"
)
VALUES
  ('acct_inv', 'Inventory', 'cg1', NOW(), 'user1', 'Inventory', 'Asset', 'Current', 'Balance Sheet', true, false, false),
  ('acct_wip', 'WIP', 'cg1', NOW(), 'user1', 'Inventory', 'Asset', 'Current', 'Balance Sheet', true, false, false),
  ('acct_lab', 'Labor Absorption', 'cg1', NOW(), 'user1', 'Expense', 'Expense', 'Average', 'Income Statement', true, false, false);

INSERT INTO "accountDefault" (
  "companyId", "accumulatedDepreciationAccount",
  "accumulatedDepreciationOnDisposalAccount", "assetAquisitionCostAccount",
  "assetAquisitionCostOnDisposalAccount", "assetDepreciationExpenseAccount",
  "assetGainsAndLossesAccount", "bankCashAccount", "bankForeignCurrencyAccount",
  "bankLocalCurrencyAccount", "costOfGoodsSoldAccount", "currencyTranslationAccount",
  "customerPaymentDiscountAccount", "goodsReceivedNotInvoicedAccount",
  "indirectCostAccount", "interestAccount", "inventoryAccount",
  "inventoryAdjustmentVarianceAccount", "inventoryShippedNotInvoicedAccount",
  "laborAbsorptionAccount", "laborAndMachineVarianceAccount", "lotSizeVarianceAccount",
  "maintenanceAccount", "materialVarianceAccount", "overheadVarianceAccount",
  "payablesAccount", "prepaymentAccount", "purchaseTaxPayableAccount",
  "purchaseVarianceAccount", "receivablesAccount", "retainedEarningsAccount",
  "reverseChargeSalesTaxPayableAccount", "roundingAccount", "salesAccount",
  "salesDiscountAccount", "salesTaxPayableAccount", "serviceChargeAccount",
  "subcontractingVarianceAccount", "supplierPaymentDiscountAccount",
  "workInProgressAccount"
)
VALUES (
  'co1', 'acct_inv', 'acct_inv', 'acct_inv', 'acct_inv', 'acct_inv',
  'acct_inv', 'acct_inv', 'acct_inv', 'acct_inv', 'acct_inv', 'acct_inv',
  'acct_inv', 'acct_inv', 'acct_inv', 'acct_inv', 'acct_inv', 'acct_inv',
  'acct_inv', 'acct_lab', 'acct_inv', 'acct_inv', 'acct_inv', 'acct_inv',
  'acct_inv', 'acct_inv', 'acct_inv', 'acct_inv', 'acct_inv', 'acct_inv',
  'acct_inv', 'acct_inv', 'acct_inv', 'acct_inv', 'acct_inv', 'acct_inv',
  'acct_inv', 'acct_inv', 'acct_inv', 'acct_wip'
);

INSERT INTO "companySettings" (
  id, "accountingEnabled", "consoleEnabled", "digitalQuoteEnabled",
  "digitalQuoteIncludesPurchaseOrders", "digitalQuoteNotificationGroup",
  "enforceInspectionFourEyes", "gaugeCalibrationExpiredNotificationGroup",
  "includeThumbnailsOnPurchasingPdfs", "includeThumbnailsOnSalesPdfs",
  "inventoryJobCompletedNotificationGroup", "inventoryShelfLife",
  "jobTravelerIncludeWorkInstructions", "kanbanOutput", "maintenanceAdvanceDays",
  "maintenanceGenerateInAdvance", "materialGeneratedIds",
  "purchasePriceUpdateTiming", "qualityIssueTarget", "rfqReadyNotificationGroup",
  "salesJobCompletedNotificationGroup", "samplingStandard",
  "supplierQuoteNotificationGroup", "timeCardEnabled", "updateLeadTimesOnReceipt",
  "useMetric"
)
VALUES (
  'co1', true, false, false, false, ARRAY[]::text[], false, ARRAY[]::text[],
  false, false, ARRAY[]::text[], '{}'::jsonb, false, 'label', 0, false, false,
  'Purchase Order Finalize', 0, ARRAY[]::text[], ARRAY[]::text[], 'ANSI_Z1_4',
  ARRAY[]::text[], false, false, true
);

INSERT INTO "location" (
  id, name, "companyId", "createdAt", "createdBy", "addressLine1",
  city, "postalCode", "stateProvince", timezone
)
VALUES (
  'loc1', 'Main', 'co1', NOW(), 'user1', '1 Main', 'Austin',
  '78701', 'TX', 'America/Chicago'
);

INSERT INTO "item" (
  id, name, "readableId", active, "companyId", "createdAt", "createdBy",
  embedding, "itemTrackingType", "replenishmentSystem", "requiresInspection",
  type, "unitOfMeasureCode"
)
VALUES
  ('item1', 'Finished Good', 'FG-1', true, 'co1', NOW(), 'user1', '[0]', 'Inventory', 'Make', false, 'Part', 'EA'),
  ('mat1', 'Material', 'MAT-1', true, 'co1', NOW(), 'user1', '[0]', 'Inventory', 'Buy', false, 'Material', 'EA'),
  ('mat2', 'Purchased Material', 'MAT-2', true, 'co1', NOW(), 'user1', '[0]', 'Inventory', 'Buy', false, 'Material', 'EA');

INSERT INTO "itemCost" (
  "itemId", "companyId", "createdAt", "createdBy", "costingMethod",
  "costIsAdjusted", "standardCost", "unitCost"
)
VALUES
  ('item1', 'co1', NOW(), 'user1', 'Average', false, 0, 0),
  ('mat1', 'co1', NOW(), 'user1', 'Standard', false, 3, 3),
  ('mat2', 'co1', NOW(), 'user1', 'Standard', false, 0, 0);

INSERT INTO "itemReplenishment" (
  "itemId", "companyId", "createdAt", "createdBy", "conversionFactor",
  "leadTime", "manufacturingBlocked", "purchasingBlocked",
  "requiresConfiguration", "scrapPercentage"
)
VALUES (
  'mat2', 'co1', NOW(), 'user1', 1, 0, false, false, false, 0
);

INSERT INTO "job" (
  id, "jobId", "itemId", "companyId", "locationId", "createdAt", "createdBy",
  "deadlineType", priority, quantity, "quantityComplete",
  "quantityReceivedToInventory", "quantityShipped", "scrapQuantity", status,
  "unitOfMeasureCode"
)
VALUES (
  'job1', 'J-1', 'item1', 'co1', 'loc1', NOW(), 'user1', 'No Deadline',
  0, 10, 0, 0, 0, 0, 'Ready', 'EA'
);

INSERT INTO "jobMakeMethod" (
  id, "jobId", "itemId", "companyId", "createdAt", "createdBy",
  "itemScrapPercentage", "quantityPerParent", "requiresBatchTracking",
  "requiresSerialTracking", version
)
VALUES (
  'jmm1', 'job1', 'item1', 'co1', NOW(), 'user1', 0, 1, false, false, 1
);

INSERT INTO "jobMaterial" (
  id, "jobId", "jobMakeMethodId", "itemId", "companyId", "createdAt",
  "createdBy", description, "itemScrapPercentage", "itemType", kit,
  "methodType", "order", quantity, "quantityIssued", "quantityToIssue",
  "estimatedQuantity", "requiresBatchTracking", "requiresSerialTracking",
  "scrapQuantity", "unitCost", "unitOfMeasureCode"
)
VALUES (
  'jm1', 'job1', 'jmm1', 'mat1', 'co1', NOW(), 'user1', 'Material',
  0, 'Material', false, 'Pull from Inventory', 1, 4, 0, 4, 4,
  false, false, 0, 3, 'EA'
);

SELECT complete_job_to_inventory('job1', 5, NULL, 'loc1', 'co1', 'user1');
SELECT complete_job_to_inventory('job1', 8, NULL, 'loc1', 'co1', 'user1');
SELECT complete_job_to_inventory('job1', 8, NULL, 'loc1', 'co1', 'user1');

INSERT INTO "workCenter" (
  id, name, active, "companyId", "createdAt", "createdBy",
  "defaultStandardFactor", "laborRate", "locationId", "machineRate",
  "overheadRate"
)
VALUES (
  'wc1', 'Work Center', true, 'co1', NOW(), 'user1',
  'Total Hours', 50, 'loc1', 80, 0
);

INSERT INTO "process" (
  id, name, active, "companyId", "createdAt", "createdBy",
  "completeAllOnScan", "defaultStandardFactor", "processType"
)
VALUES (
  'proc1', 'Process', true, 'co1', NOW(), 'user1',
  false, 'Total Hours', 'Inside'
);

INSERT INTO "jobOperation" (
  id, "jobId", "jobMakeMethodId", "companyId", "createdAt", "createdBy",
  "laborRate", "laborTime", "laborUnit", "machineRate", "machineTime",
  "machineUnit", "operationLeadTime", "operationMinimumCost",
  "operationOrder", "operationType", "operationUnitCost", "order",
  "overheadRate", priority, "processId", "setupTime", "setupUnit", status,
  "workCenterId", "workInstruction"
)
VALUES (
  'jo1', 'job1', 'jmm1', 'co1', NOW(), 'user1',
  50, 1, 'Total Hours', 80, 0, 'Total Hours', 0, 0,
  'After Previous', 'Inside', 0, 1, 0, 0, 'proc1', 0, 'Total Hours',
  'Ready', 'wc1', '{}'::jsonb
);

INSERT INTO "productionEvent" (
  id, "jobOperationId", "companyId", "createdAt", "createdBy",
  duration, "employeeId", "endTime", "postedToGL", "startTime", type,
  "workCenterId"
)
VALUES (
  'pe1', 'jo1', 'co1', NOW(), 'user1', 3600, 'user1',
  '2026-05-21T09:00:00.000Z', false, '2026-05-21T08:00:00.000Z',
  'Labor', 'wc1'
);

SELECT post_production_event_to_gl('pe1', 'user1', 'co1');
SELECT close_job_to_gl('job1', 'user1', 'co1');

INSERT INTO "supplier" (
  id, name, "companyId", "createdAt", "createdBy", "currencyCode",
  embedding, "taxPercent"
)
VALUES (
  'sup1', 'Supplier', 'co1', NOW(), 'user1', 'USD', '[0]', 0
);

INSERT INTO "supplierInteraction" (id, "supplierId", "companyId")
VALUES ('si1', 'sup1', 'co1');

INSERT INTO "purchaseOrder" (
  id, "purchaseOrderId", "companyId", "createdAt", "createdBy",
  "purchaseOrderType", "revisionId", status, "supplierId",
  "supplierInteractionId", "orderDate"
)
VALUES (
  'po1', 'PO-1', 'co1', NOW(), 'user1', 'Purchase', 0, 'Draft',
  'sup1', 'si1', CURRENT_DATE - INTERVAL '7 days'
);

INSERT INTO "purchaseOrderLine" (
  id, "purchaseOrderId", "companyId", "createdAt", "createdBy",
  "exchangeRate", "invoicedComplete", "itemId", "purchaseOrderLineType",
  "purchaseQuantity", "purchaseUnitOfMeasureCode", "conversionFactor",
  "receivedComplete", "requiresInspection", "sortOrder",
  "supplierShippingCost", "supplierTaxAmount", "unitPrice"
)
VALUES (
  'pol1', 'po1', 'co1', NOW(), 'user1', 1, false, 'mat2', 'Material',
  10, 'EA', 1, false, false, 1, 0, 0, 5
);

SELECT update_purchased_prices('purchaseOrder', 'po1', NULL, 'co1', true, false);

DO $$
DECLARE
  v_quantity_complete numeric;
  v_quantity_received numeric;
  v_quantity_issued numeric;
  v_item_ledger_count integer;
  v_output_qty numeric;
  v_consumption_qty numeric;
  v_cost_ledger_count integer;
  v_journal_count integer;
  v_production_event_count integer;
  v_close_count integer;
  v_wip_balance numeric;
  v_event_posted boolean;
  v_purchase_cost_ledger_count integer;
  v_purchase_cost numeric;
  v_mat2_unit_cost numeric;
  v_supplier_part_count integer;
  v_preferred_supplier text;
  v_period_count integer;
BEGIN
  SELECT "quantityComplete", "quantityReceivedToInventory"
  INTO v_quantity_complete, v_quantity_received
  FROM "job"
  WHERE id = 'job1';

  IF v_quantity_complete != 8 OR v_quantity_received != 8 THEN
    RAISE EXCEPTION 'unexpected job quantities: %, %', v_quantity_complete, v_quantity_received;
  END IF;

  SELECT "quantityIssued" INTO v_quantity_issued
  FROM "jobMaterial"
  WHERE id = 'jm1';

  IF v_quantity_issued != 3.2 THEN
    RAISE EXCEPTION 'unexpected material quantity issued: %', v_quantity_issued;
  END IF;

  SELECT count(*), COALESCE(SUM(quantity) FILTER (WHERE "entryType" = 'Assembly Output'), 0),
         COALESCE(SUM(quantity) FILTER (WHERE "entryType" = 'Consumption'), 0)
  INTO v_item_ledger_count, v_output_qty, v_consumption_qty
  FROM "itemLedger"
  WHERE "documentId" = 'job1';

  IF v_item_ledger_count != 4 OR v_output_qty != 8 OR v_consumption_qty != -3.2 THEN
    RAISE EXCEPTION 'unexpected item ledger values: count %, output %, consumption %',
      v_item_ledger_count, v_output_qty, v_consumption_qty;
  END IF;

  SELECT count(*)
  INTO v_cost_ledger_count
  FROM "costLedger"
  WHERE "documentId" = 'job1';

  IF v_cost_ledger_count != 4 THEN
    RAISE EXCEPTION 'unexpected cost ledger count: %', v_cost_ledger_count;
  END IF;

  SELECT count(*)
  INTO v_journal_count
  FROM "journal"
  WHERE "companyId" = 'co1';

  IF v_journal_count != 6 THEN
    RAISE EXCEPTION 'unexpected journal count: %', v_journal_count;
  END IF;

  SELECT count(*)
  INTO v_production_event_count
  FROM "journal"
  WHERE "companyId" = 'co1'
    AND "sourceType" = to_jsonb('Production Event'::text);

  IF v_production_event_count != 1 THEN
    RAISE EXCEPTION 'unexpected production event journal count: %', v_production_event_count;
  END IF;

  SELECT count(*)
  INTO v_close_count
  FROM "journal"
  WHERE "companyId" = 'co1'
    AND "sourceType" = to_jsonb('Job Close'::text);

  IF v_close_count != 1 THEN
    RAISE EXCEPTION 'unexpected job close journal count: %', v_close_count;
  END IF;

  SELECT COALESCE(SUM(jl.amount), 0)
  INTO v_wip_balance
  FROM "journalLine" jl
  INNER JOIN "journal" j ON j.id = jl."journalId"
  WHERE jl."accountId" = 'acct_wip'
    AND jl."documentId" = 'job1'
    AND j."companyId" = 'co1';

  IF ABS(v_wip_balance) >= 0.01 THEN
    RAISE EXCEPTION 'unexpected remaining WIP balance after close: %', v_wip_balance;
  END IF;

  SELECT "postedToGL"
  INTO v_event_posted
  FROM "productionEvent"
  WHERE id = 'pe1';

  IF v_event_posted IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'production event was not marked posted';
  END IF;

  SELECT count(*), COALESCE(SUM(cost), 0)
  INTO v_purchase_cost_ledger_count, v_purchase_cost
  FROM "costLedger"
  WHERE "documentType" = to_jsonb('Purchase Order'::text)
    AND "documentId" = 'po1'
    AND "companyId" = 'co1';

  IF v_purchase_cost_ledger_count != 1 OR v_purchase_cost != 50 THEN
    RAISE EXCEPTION 'unexpected purchased-price cost ledger values: count %, cost %',
      v_purchase_cost_ledger_count, v_purchase_cost;
  END IF;

  SELECT "unitCost"
  INTO v_mat2_unit_cost
  FROM "itemCost"
  WHERE "itemId" = 'mat2' AND "companyId" = 'co1';

  IF v_mat2_unit_cost != 5 THEN
    RAISE EXCEPTION 'unexpected mat2 unit cost: %', v_mat2_unit_cost;
  END IF;

  SELECT count(*)
  INTO v_supplier_part_count
  FROM "supplierPart"
  WHERE "itemId" = 'mat2'
    AND "supplierId" = 'sup1'
    AND "companyId" = 'co1'
    AND "unitPrice" = 5
    AND "conversionFactor" = 1
    AND "supplierUnitOfMeasureCode" = 'EA';

  IF v_supplier_part_count != 1 THEN
    RAISE EXCEPTION 'unexpected supplier part count: %', v_supplier_part_count;
  END IF;

  SELECT "preferredSupplierId"
  INTO v_preferred_supplier
  FROM "itemReplenishment"
  WHERE "itemId" = 'mat2' AND "companyId" = 'co1';

  IF v_preferred_supplier != 'sup1' THEN
    RAISE EXCEPTION 'unexpected preferred supplier: %', v_preferred_supplier;
  END IF;

  SELECT count(*)
  INTO v_period_count
  FROM "accountingPeriod"
  WHERE "companyId" = 'co1' AND status = 'Active';

  IF v_period_count != 1 THEN
    RAISE EXCEPTION 'unexpected active accounting period count: %', v_period_count;
  END IF;
END;
$$;

INSERT INTO "storageUnit" (
  id, name, active, "locationId", "storageTypeIds", "companyId",
  "createdAt", "createdBy"
)
VALUES (
  'su1', 'Shelf 1', true, 'loc1', ARRAY[]::text[], 'co1',
  NOW(), 'user1'
);

INSERT INTO "item" (
  id, name, "readableId", active, "companyId", "createdAt", "createdBy",
  embedding, "itemTrackingType", "replenishmentSystem", "requiresInspection",
  type, "unitOfMeasureCode"
)
VALUES
  ('item-batch', 'Batch Finished Good', 'BFG-1', true, 'co1', NOW(), 'user1', '[0]', 'Batch', 'Make', false, 'Part', 'EA'),
  ('item-serial', 'Serial Finished Good', 'SFG-1', true, 'co1', NOW(), 'user1', '[0]', 'Serial', 'Make', false, 'Part', 'EA');

INSERT INTO "itemCost" (
  "itemId", "companyId", "createdAt", "createdBy", "costingMethod",
  "costIsAdjusted", "standardCost", "unitCost"
)
VALUES
  ('item-batch', 'co1', NOW(), 'user1', 'Average', false, 0, 0),
  ('item-serial', 'co1', NOW(), 'user1', 'Average', false, 0, 0);

INSERT INTO "job" (
  id, "jobId", "itemId", "companyId", "locationId", "createdAt", "createdBy",
  "deadlineType", priority, quantity, "quantityComplete",
  "quantityReceivedToInventory", "quantityShipped", "scrapQuantity", status,
  "unitOfMeasureCode"
)
VALUES
  ('job-batch', 'J-BATCH', 'item-batch', 'co1', 'loc1', NOW(), 'user1', 'No Deadline', 0, 10, 0, 0, 0, 0, 'Ready', 'EA'),
  ('job-serial', 'J-SERIAL', 'item-serial', 'co1', 'loc1', NOW(), 'user1', 'No Deadline', 0, 2, 0, 0, 0, 0, 'Ready', 'EA');

INSERT INTO "jobMakeMethod" (
  id, "jobId", "itemId", "companyId", "createdAt", "createdBy",
  "itemScrapPercentage", "quantityPerParent", "requiresBatchTracking",
  "requiresSerialTracking", version
)
VALUES
  ('jmm-batch', 'job-batch', 'item-batch', 'co1', NOW(), 'user1', 0, 1, true, false, 1),
  ('jmm-serial', 'job-serial', 'item-serial', 'co1', NOW(), 'user1', 0, 1, false, true, 1);

INSERT INTO "trackedEntity" (
  id, attributes, "companyId", "createdAt", "createdBy", "itemId",
  quantity, "readableId", "sourceDocument", "sourceDocumentId",
  "sourceDocumentReadableId", status
)
VALUES
  (
    'te-batch', '{"Job Make Method":"jmm-batch"}'::jsonb, 'co1',
    NOW(), 'user1', 'item-batch', 10, 'BATCH-1',
    'Job Make Method', 'jmm-batch', 'J-BATCH', 'Reserved'
  ),
  (
    'te-serial-1', '{"Job Make Method":"jmm-serial"}'::jsonb, 'co1',
    NOW(), 'user1', 'item-serial', 1, 'SER-1',
    'Job Make Method', 'jmm-serial', 'J-SERIAL', 'Reserved'
  ),
  (
    'te-serial-2', '{"Job Make Method":"jmm-serial"}'::jsonb, 'co1',
    NOW(), 'user1', 'item-serial', 1, 'SER-2',
    'Job Make Method', 'jmm-serial', 'J-SERIAL', 'Reserved'
  );

SELECT complete_job_to_inventory('job-batch', 4, 'su1', 'loc1', 'co1', 'user1');
SELECT complete_job_to_inventory('job-serial', 2, 'su1', 'loc1', 'co1', 'user1');

DO $$
DECLARE
  v_batch_ledger_count integer;
  v_batch_quantity numeric;
  v_batch_tracked_entity text;
  v_batch_tracked_status jsonb;
  v_batch_storage_unit text;
  v_batch_pick_method text;
  v_serial_ledger_count integer;
  v_serial_quantity numeric;
  v_serial_entity_count integer;
  v_serial_available_count integer;
  v_serial_storage_unit_count integer;
  v_batch_received numeric;
  v_serial_received numeric;
BEGIN
  SELECT count(*), COALESCE(SUM(quantity), 0), MAX("trackedEntityId"),
         MAX("trackedEntityStatus"::text)::jsonb, MAX("storageUnitId")
  INTO v_batch_ledger_count, v_batch_quantity, v_batch_tracked_entity,
       v_batch_tracked_status, v_batch_storage_unit
  FROM "itemLedger"
  WHERE "documentId" = 'job-batch'
    AND "entryType" = 'Assembly Output';

  IF v_batch_ledger_count != 1
     OR v_batch_quantity != 4
     OR v_batch_tracked_entity != 'te-batch'
     OR v_batch_tracked_status != to_jsonb('Reserved'::text)
     OR v_batch_storage_unit != 'su1' THEN
    RAISE EXCEPTION 'unexpected batch completion ledger values: count %, quantity %, tracked %, status %, storage %',
      v_batch_ledger_count, v_batch_quantity, v_batch_tracked_entity,
      v_batch_tracked_status, v_batch_storage_unit;
  END IF;

  SELECT "defaultStorageUnitId"
  INTO v_batch_pick_method
  FROM "pickMethod"
  WHERE "itemId" = 'item-batch'
    AND "locationId" = 'loc1'
    AND "companyId" = 'co1';

  IF v_batch_pick_method != 'su1' THEN
    RAISE EXCEPTION 'unexpected batch pick method storage unit: %', v_batch_pick_method;
  END IF;

  SELECT count(*), COALESCE(SUM(quantity), 0),
         COUNT(DISTINCT "trackedEntityId"),
         COUNT(*) FILTER (WHERE "trackedEntityStatus" = to_jsonb('Available'::text)),
         COUNT(*) FILTER (WHERE "storageUnitId" = 'su1')
  INTO v_serial_ledger_count, v_serial_quantity, v_serial_entity_count,
       v_serial_available_count, v_serial_storage_unit_count
  FROM "itemLedger"
  WHERE "documentId" = 'job-serial'
    AND "entryType" = 'Assembly Output';

  IF v_serial_ledger_count != 2
     OR v_serial_quantity != 2
     OR v_serial_entity_count != 2
     OR v_serial_available_count != 2
     OR v_serial_storage_unit_count != 2 THEN
    RAISE EXCEPTION 'unexpected serial completion ledger values: count %, quantity %, entities %, available %, storage %',
      v_serial_ledger_count, v_serial_quantity, v_serial_entity_count,
      v_serial_available_count, v_serial_storage_unit_count;
  END IF;

  SELECT count(*)
  INTO v_serial_available_count
  FROM "trackedEntity"
  WHERE id IN ('te-serial-1', 'te-serial-2')
    AND status = 'Available';

  IF v_serial_available_count != 2 THEN
    RAISE EXCEPTION 'serial tracked entities were not marked available: %',
      v_serial_available_count;
  END IF;

  SELECT "quantityReceivedToInventory"
  INTO v_batch_received
  FROM "job"
  WHERE id = 'job-batch';

  SELECT "quantityReceivedToInventory"
  INTO v_serial_received
  FROM "job"
  WHERE id = 'job-serial';

  IF v_batch_received != 4 OR v_serial_received != 2 THEN
    RAISE EXCEPTION 'unexpected tracked job receipt quantities: batch %, serial %',
      v_batch_received, v_serial_received;
  END IF;
END;
$$;

INSERT INTO "item" (
  id, name, "readableId", active, "companyId", "createdAt", "createdBy",
  embedding, "itemTrackingType", "replenishmentSystem", "requiresInspection",
  type, "unitOfMeasureCode"
)
VALUES
  ('item-fifo-fg', 'FIFO Finished Good', 'FIFO-FG', true, 'co1', NOW(), 'user1', '[0]', 'Inventory', 'Make', false, 'Part', 'EA'),
  ('mat-fifo', 'FIFO Material', 'FIFO-MAT', true, 'co1', NOW(), 'user1', '[0]', 'Inventory', 'Buy', false, 'Material', 'EA');

INSERT INTO "itemCost" (
  "itemId", "companyId", "createdAt", "createdBy", "costingMethod",
  "costIsAdjusted", "standardCost", "unitCost"
)
VALUES
  ('item-fifo-fg', 'co1', NOW(), 'user1', 'Average', false, 0, 0),
  ('mat-fifo', 'co1', NOW(), 'user1', 'FIFO', false, 0, 5);

INSERT INTO "job" (
  id, "jobId", "itemId", "companyId", "locationId", "createdAt", "createdBy",
  "deadlineType", priority, quantity, "quantityComplete",
  "quantityReceivedToInventory", "quantityShipped", "scrapQuantity", status,
  "unitOfMeasureCode"
)
VALUES (
  'job-fifo', 'J-FIFO', 'item-fifo-fg', 'co1', 'loc1', NOW(), 'user1',
  'No Deadline', 0, 10, 0, 0, 0, 0, 'Ready', 'EA'
);

INSERT INTO "jobMakeMethod" (
  id, "jobId", "itemId", "companyId", "createdAt", "createdBy",
  "itemScrapPercentage", "quantityPerParent", "requiresBatchTracking",
  "requiresSerialTracking", version
)
VALUES (
  'jmm-fifo', 'job-fifo', 'item-fifo-fg', 'co1', NOW(), 'user1',
  0, 1, false, false, 1
);

INSERT INTO "jobMaterial" (
  id, "jobId", "jobMakeMethodId", "itemId", "companyId", "createdAt",
  "createdBy", description, "itemScrapPercentage", "itemType", kit,
  "methodType", "order", quantity, "quantityIssued", "quantityToIssue",
  "estimatedQuantity", "requiresBatchTracking", "requiresSerialTracking",
  "scrapQuantity", "storageUnitId", "unitCost", "unitOfMeasureCode"
)
VALUES (
  'jm-fifo', 'job-fifo', 'jmm-fifo', 'mat-fifo', 'co1', NOW(),
  'user1', 'FIFO Material', 0, 'Material', false, 'Pull from Inventory',
  1, 10, 0, 10, 10, false, false, 0, 'su1', 5, 'EA'
);

INSERT INTO "costLedger" (
  id, adjustment, "companyId", cost, "costLedgerType", "createdAt",
  "documentId", "documentType", "entryNumber", "itemId", "itemLedgerType",
  "nominalCost", "postingDate", quantity, "remainingQuantity"
)
VALUES
  (
    'cl-fifo-old', false, 'co1', 6, 'Direct Cost', NOW() - INTERVAL '2 days',
    'fifo-layer-old', to_jsonb('Purchase Order'::text), 9001, 'mat-fifo',
    'Purchase', 6, CURRENT_DATE - INTERVAL '2 days', 3, 3
  ),
  (
    'cl-fifo-new', false, 'co1', 50, 'Direct Cost', NOW() - INTERVAL '1 day',
    'fifo-layer-new', to_jsonb('Purchase Order'::text), 9002, 'mat-fifo',
    'Purchase', 50, CURRENT_DATE - INTERVAL '1 day', 10, 10
  );

SELECT complete_job_to_inventory('job-fifo', 5, 'su1', 'loc1', 'co1', 'user1');

DO $$
DECLARE
  v_quantity_issued numeric;
  v_old_remaining numeric;
  v_new_remaining numeric;
  v_consumption_cost numeric;
  v_output_cost numeric;
  v_finished_unit_cost numeric;
  v_wip_balance numeric;
  v_fifo_consumption_qty numeric;
  v_fifo_output_qty numeric;
BEGIN
  SELECT "quantityIssued"
  INTO v_quantity_issued
  FROM "jobMaterial"
  WHERE id = 'jm-fifo';

  IF v_quantity_issued != 5 THEN
    RAISE EXCEPTION 'unexpected FIFO quantity issued: %', v_quantity_issued;
  END IF;

  SELECT "remainingQuantity"
  INTO v_old_remaining
  FROM "costLedger"
  WHERE id = 'cl-fifo-old';

  SELECT "remainingQuantity"
  INTO v_new_remaining
  FROM "costLedger"
  WHERE id = 'cl-fifo-new';

  IF v_old_remaining != 0 OR v_new_remaining != 8 THEN
    RAISE EXCEPTION 'unexpected FIFO layer remaining quantities: old %, new %',
      v_old_remaining, v_new_remaining;
  END IF;

  SELECT COALESCE(SUM(cost), 0), COALESCE(SUM(quantity), 0)
  INTO v_consumption_cost, v_fifo_consumption_qty
  FROM "costLedger"
  WHERE "documentId" = 'job-fifo'
    AND "itemId" = 'mat-fifo'
    AND "itemLedgerType" = 'Consumption';

  IF v_consumption_cost != -16 OR v_fifo_consumption_qty != -5 THEN
    RAISE EXCEPTION 'unexpected FIFO consumption cost ledger: cost %, quantity %',
      v_consumption_cost, v_fifo_consumption_qty;
  END IF;

  SELECT COALESCE(SUM(cost), 0), COALESCE(SUM(quantity), 0)
  INTO v_output_cost, v_fifo_output_qty
  FROM "costLedger"
  WHERE "documentId" = 'job-fifo'
    AND "itemId" = 'item-fifo-fg'
    AND "itemLedgerType" = 'Output';

  IF v_output_cost != 16 OR v_fifo_output_qty != 5 THEN
    RAISE EXCEPTION 'unexpected FIFO output cost ledger: cost %, quantity %',
      v_output_cost, v_fifo_output_qty;
  END IF;

  SELECT "unitCost"
  INTO v_finished_unit_cost
  FROM "itemCost"
  WHERE "itemId" = 'item-fifo-fg'
    AND "companyId" = 'co1';

  IF v_finished_unit_cost != 3.2 THEN
    RAISE EXCEPTION 'unexpected FIFO finished-good unit cost: %',
      v_finished_unit_cost;
  END IF;

  SELECT COALESCE(SUM(jl.amount), 0)
  INTO v_wip_balance
  FROM "journalLine" jl
  INNER JOIN "journal" j ON j.id = jl."journalId"
  WHERE jl."accountId" = 'acct_wip'
    AND jl."documentId" = 'job-fifo'
    AND j."companyId" = 'co1';

  IF ABS(v_wip_balance) >= 0.01 THEN
    RAISE EXCEPTION 'unexpected FIFO WIP balance after receipt: %',
      v_wip_balance;
  END IF;
END;
$$;

INSERT INTO "workCenter" (
  id, name, active, "companyId", "createdAt", "createdBy",
  "defaultStandardFactor", "laborRate", "locationId", "machineRate",
  "overheadRate"
)
VALUES (
  'wc-zero', 'Zero Cost Work Center', true, 'co1', NOW(), 'user1',
  'Total Hours', 0, 'loc1', 0, 0
);

INSERT INTO "jobOperation" (
  id, "jobId", "jobMakeMethodId", "companyId", "createdAt", "createdBy",
  "laborRate", "laborTime", "laborUnit", "machineRate", "machineTime",
  "machineUnit", "operationLeadTime", "operationMinimumCost",
  "operationOrder", "operationType", "operationUnitCost", "order",
  "overheadRate", priority, "processId", "setupTime", "setupUnit", status,
  "workCenterId", "workInstruction"
)
VALUES (
  'jo-events', 'job-fifo', 'jmm-fifo', 'co1', NOW(), 'user1',
  50, 1, 'Total Hours', 80, 1, 'Total Hours', 0, 0,
  'After Previous', 'Inside', 0, 1, 0, 0, 'proc1', 0, 'Total Hours',
  'Ready', 'wc1', '{}'::jsonb
);

INSERT INTO "productionEvent" (
  id, "jobOperationId", "companyId", "createdAt", "createdBy",
  duration, "employeeId", "endTime", "postedToGL", "startTime", type,
  "workCenterId"
)
VALUES
  (
    'pe-incomplete', 'jo-events', 'co1', NOW(), 'user1', 3600, 'user1',
    NULL, false, '2026-05-21T10:00:00.000Z', 'Labor', 'wc1'
  ),
  (
    'pe-zero', 'jo-events', 'co1', NOW(), 'user1', 3600, 'user1',
    '2026-05-21T11:00:00.000Z', false, '2026-05-21T10:00:00.000Z',
    'Labor', 'wc-zero'
  ),
  (
    'pe-machine', 'jo-events', 'co1', NOW(), 'user1', 1800, 'user1',
    '2026-05-21T11:30:00.000Z', false, '2026-05-21T11:00:00.000Z',
    'Machine', 'wc1'
  );

DO $$
DECLARE
  v_incomplete_result jsonb;
  v_zero_result jsonb;
  v_machine_result jsonb;
  v_posted_count integer;
  v_edge_journal_count integer;
  v_machine_wip_amount numeric;
BEGIN
  SELECT post_production_event_to_gl('pe-incomplete', 'user1', 'co1')
  INTO v_incomplete_result;
  SELECT post_production_event_to_gl('pe-zero', 'user1', 'co1')
  INTO v_zero_result;
  SELECT post_production_event_to_gl('pe-machine', 'user1', 'co1')
  INTO v_machine_result;

  IF v_incomplete_result->>'reason' != 'incomplete-event'
     OR (v_incomplete_result->>'posted')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'unexpected incomplete production-event result: %',
      v_incomplete_result;
  END IF;

  IF v_zero_result->>'reason' != 'zero-cost'
     OR (v_zero_result->>'posted')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'unexpected zero-cost production-event result: %',
      v_zero_result;
  END IF;

  IF (v_machine_result->>'posted')::boolean IS DISTINCT FROM true
     OR (v_machine_result->>'amount')::numeric != 40 THEN
    RAISE EXCEPTION 'unexpected machine production-event result: %',
      v_machine_result;
  END IF;

  SELECT count(*)
  INTO v_posted_count
  FROM "productionEvent"
  WHERE id IN ('pe-incomplete', 'pe-zero', 'pe-machine')
    AND "postedToGL" = true;

  IF v_posted_count != 3 THEN
    RAISE EXCEPTION 'production-event edge cases were not marked posted: %',
      v_posted_count;
  END IF;

  SELECT count(*)
  INTO v_edge_journal_count
  FROM "journal"
  WHERE "sourceType" = to_jsonb('Production Event'::text)
    AND "companyId" = 'co1'
    AND description = 'Machine Time - Job J-FIFO';

  IF v_edge_journal_count != 1 THEN
    RAISE EXCEPTION 'unexpected machine production-event journal count: %',
      v_edge_journal_count;
  END IF;

  SELECT COALESCE(SUM(jl.amount), 0)
  INTO v_machine_wip_amount
  FROM "journalLine" jl
  INNER JOIN "journal" j ON j.id = jl."journalId"
  WHERE jl."accountId" = 'acct_wip'
    AND jl."documentId" = 'job-fifo'
    AND j.description = 'Machine Time - Job J-FIFO'
    AND j."companyId" = 'co1';

  IF v_machine_wip_amount != 40 THEN
    RAISE EXCEPTION 'unexpected machine production-event WIP amount: %',
      v_machine_wip_amount;
  END IF;
END;
$$;
`;
}

function purchasedPriceAppScopeSql() {
  return String.raw`
BEGIN;
SELECT set_config('app.user_id', 'user1', true);

SELECT update_purchased_prices('purchaseOrder', 'po1', NULL, 'co1', false, false);

DO $$
BEGIN
  PERFORM update_purchased_prices('purchaseOrder', 'po1', NULL, 'co2', false, false);
  RAISE EXCEPTION 'expected purchased-price company gate to reject co2';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM = 'expected purchased-price company gate to reject co2' THEN
      RAISE;
    END IF;

    IF SQLERRM NOT LIKE '%Insufficient permissions%' THEN
      RAISE EXCEPTION 'unexpected purchased-price company gate error: %', SQLERRM;
    END IF;
END;
$$;

COMMIT;
`;
}
