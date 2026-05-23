import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-method-tree-smoke-${process.pid}`;
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
    await verifyMethodTreeCompanyScope(pool);

    console.log("Method tree RPC smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- item, job, and quote method-tree RPCs require company_id");
    console.log("- recursive method rows reject cross-company IDs");
    console.log("- item method cost, active-method fallback, and external mappings stay company-scoped");
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

async function verifyFunctionShape(db) {
  const result = await db.query(`
    SELECT
      proname,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND proname IN (
        'get_method_tree',
        'get_job_method',
        'get_quote_methods',
        'get_quote_methods_by_method_id'
      )
    ORDER BY proname, args
  `);

  const signatures = new Set(
    result.rows.map((row) => `${row.proname}(${row.args})`)
  );
  const expected = [
    "get_job_method(jid text, company_id text)",
    "get_method_tree(uid text, company_id text)",
    "get_quote_methods(qid text, company_id text)",
    "get_quote_methods_by_method_id(mid text, company_id text)"
  ];

  for (const signature of expected) {
    if (!signatures.has(signature)) {
      throw new Error(`Missing expected method-tree function: ${signature}`);
    }
  }

  for (const signature of signatures) {
    if (
      signature === "get_job_method(jid text)" ||
      signature === "get_method_tree(uid text)" ||
      signature === "get_quote_methods(qid text)" ||
      signature === "get_quote_methods_by_method_id(mid text)"
    ) {
      throw new Error(`Legacy unscoped method-tree function remains: ${signature}`);
    }
  }
}

async function setupFixtures(db) {
  await db.query("BEGIN");

  try {
    await db.query("SET LOCAL session_replication_role = replica");
    await db.query(`
      INSERT INTO "item" (
        id, name, "readableId", "readableIdWithRevision", revision, active,
        "companyId", "createdAt", "createdBy", embedding, "itemTrackingType",
        "replenishmentSystem", "requiresInspection", type, "unitOfMeasureCode"
      )
      VALUES
        (
          'item-root-co1', 'Root co1', 'ROOT-CO1', 'ROOT-CO1/A', 'A', true,
          'co1', NOW(), 'user-co1', '[0]', 'Inventory', 'Make', false,
          'Part', 'EA'
        ),
        (
          'item-child-co1', 'Child co1', 'CHILD-CO1', 'CHILD-CO1/A', 'A', true,
          'co1', NOW(), 'user-co1', '[0]', 'Inventory', 'Make', false,
          'Part', 'EA'
        ),
        (
          'item-leaf-co1', 'Leaf co1', 'LEAF-CO1', 'LEAF-CO1/A', 'A', true,
          'co1', NOW(), 'user-co1', '[0]', 'Inventory', 'Buy', false,
          'Material', 'EA'
        ),
        (
          'item-root-co2', 'Root co2', 'ROOT-CO2', 'ROOT-CO2/A', 'A', true,
          'co2', NOW(), 'user-co2', '[0]', 'Inventory', 'Make', false,
          'Part', 'EA'
        )
    `);

    await db.query(`
      INSERT INTO "itemCost" (
        "companyId", "costingMethod", "costIsAdjusted", "createdAt",
        "createdBy", "itemId", "standardCost", "unitCost"
      )
      VALUES
        ('co1', 'Standard', false, NOW(), 'user-co1', 'item-root-co1', 10, 10),
        ('co1', 'Standard', false, NOW(), 'user-co1', 'item-child-co1', 20, 20),
        ('co1', 'Standard', false, NOW(), 'user-co1', 'item-leaf-co1', 30, 30),
        ('co2', 'Standard', false, NOW(), 'user-co2', 'item-root-co1', 999, 999),
        ('co2', 'Standard', false, NOW(), 'user-co2', 'item-child-co1', 999, 999)
    `);

    await db.query(`
      INSERT INTO "externalIntegrationMapping" (
        id, "allowDuplicateExternalId", "companyId", "createdAt", "entityId",
        "entityType", "externalId", integration, "updatedAt"
      )
      VALUES
        (
          'eim-co1', false, 'co1', NOW(), 'item-child-co1',
          'item', 'EXT-CO1', 'onshape', NOW()
        ),
        (
          'eim-co2-leak', false, 'co2', NOW(), 'item-child-co1',
          'item', 'EXT-CO2', 'onshape-leak', NOW()
        )
    `);

    await db.query(`
      INSERT INTO "makeMethod" (
        id, "companyId", "createdAt", "createdBy", "itemId", status, version
      )
      VALUES
        ('mm-root-co1', 'co1', NOW(), 'user-co1', 'item-root-co1', 'Active', 1),
        ('mm-child-co1', 'co1', NOW(), 'user-co1', 'item-child-co1', 'Active', 1),
        ('mm-root-co2', 'co2', NOW(), 'user-co2', 'item-root-co2', 'Active', 1),
        ('mm-child-co2-leak', 'co2', NOW(), 'user-co2', 'item-child-co1', 'Active', 99)
    `);
    await db.query(`
      INSERT INTO "methodMaterial" (
        id, "companyId", "createdAt", "createdBy", "itemId", "itemType", kit,
        "makeMethodId", "methodType", "order", quantity, "scrapQuantity",
        "sourcingType", "storageUnitIds", "unitOfMeasureCode"
      )
      VALUES
        (
          'mmat-child-co1', 'co1', NOW(), 'user-co1', 'item-child-co1',
          'Part', false, 'mm-root-co1', 'Pull from Inventory', 1, 2, 0,
          'Specified', '[]'::jsonb, 'EA'
        ),
        (
          'mmat-leaf-co1', 'co1', NOW(), 'user-co1', 'item-leaf-co1',
          'Material', false, 'mm-child-co1', 'Purchase to Order', 2, 3, 0,
          'Specified', '[]'::jsonb, 'EA'
        ),
        (
          'mmat-child-co2', 'co2', NOW(), 'user-co2', 'item-root-co2',
          'Part', false, 'mm-root-co2', 'Purchase to Order', 1, 4, 0,
          'Specified', '[]'::jsonb, 'EA'
        )
    `);

    await db.query(`
      INSERT INTO "job" (
        id, "companyId", "createdAt", "createdBy", "deadlineType", "itemId",
        "jobId", "locationId", priority, quantity, "quantityComplete",
        "quantityReceivedToInventory", "quantityShipped", "scrapQuantity",
        status, "unitOfMeasureCode"
      )
      VALUES
        (
          'job-co1', 'co1', NOW(), 'user-co1', 'No Deadline', 'item-root-co1',
          'JOB-CO1', 'loc-co1', 1, 1, 0, 0, 0, 0, 'Ready', 'EA'
        ),
        (
          'job-co2', 'co2', NOW(), 'user-co2', 'No Deadline', 'item-root-co2',
          'JOB-CO2', 'loc-co2', 1, 1, 0, 0, 0, 0, 'Ready', 'EA'
        )
    `);
    await db.query(`
      INSERT INTO "jobMakeMethod" (
        id, "companyId", "createdAt", "createdBy", "itemId",
        "itemScrapPercentage", "jobId", "parentMaterialId",
        "quantityPerParent", "requiresBatchTracking", "requiresSerialTracking",
        version
      )
      VALUES
        (
          'jmm-root-co1', 'co1', NOW(), 'user-co1', 'item-root-co1',
          0, 'job-co1', NULL, 1, false, false, 1
        ),
        (
          'jmm-child-co1', 'co1', NOW(), 'user-co1', 'item-child-co1',
          0, 'job-co1', 'jmat-child-co1', 1, false, false, 1
        ),
        (
          'jmm-root-co2', 'co2', NOW(), 'user-co2', 'item-root-co2',
          0, 'job-co2', NULL, 1, false, false, 1
        )
    `);
    await db.query(`
      INSERT INTO "jobMaterial" (
        id, "companyId", "createdAt", "createdBy", description, "itemId",
        "itemScrapPercentage", "itemType", "jobId", "jobMakeMethodId", kit,
        "methodType", "order", quantity, "requiresBatchTracking",
        "requiresSerialTracking", "scrapQuantity", "unitCost", "unitOfMeasureCode"
      )
      VALUES
        (
          'jmat-child-co1', 'co1', NOW(), 'user-co1', 'Job child co1',
          'item-child-co1', 0, 'Part', 'job-co1', 'jmm-root-co1', false,
          'Make to Order', 2, 1, false, false, 0, 20, 'EA'
        ),
        (
          'jmat-child-co2', 'co2', NOW(), 'user-co2', 'Job child co2',
          'item-root-co2', 0, 'Part', 'job-co2', 'jmm-root-co2', false,
          'Purchase to Order', 2, 1, false, false, 0, 40, 'EA'
        )
    `);

    await db.query(`
      INSERT INTO "quoteMakeMethod" (
        id, "companyId", "createdAt", "createdBy", "itemId",
        "parentMaterialId", "quantityPerParent", "quoteId", "quoteLineId",
        version
      )
      VALUES
        (
          'qmm-root-co1', 'co1', NOW(), 'user-co1', 'item-root-co1',
          NULL, 1, 'quote-co1', 'quote-line-co1', 1
        ),
        (
          'qmm-child-co1', 'co1', NOW(), 'user-co1', 'item-child-co1',
          'qmat-child-co1', 1, 'quote-co1', 'quote-line-co1', 1
        ),
        (
          'qmm-root-co2', 'co2', NOW(), 'user-co2', 'item-root-co2',
          NULL, 1, 'quote-co2', 'quote-line-co2', 1
        )
    `);
    await db.query(`
      INSERT INTO "quoteMaterial" (
        id, "companyId", "createdAt", "createdBy", description, "itemId",
        "itemType", kit, "methodType", "order", quantity, "quoteId",
        "quoteLineId", "quoteMakeMethodId", "scrapQuantity", "unitCost",
        "unitOfMeasureCode"
      )
      VALUES
        (
          'qmat-child-co1', 'co1', NOW(), 'user-co1', 'Quote child co1',
          'item-child-co1', 'Part', false, 'Make to Order', 2, 1,
          'quote-co1', 'quote-line-co1', 'qmm-root-co1', 0, 20, 'EA'
        ),
        (
          'qmat-child-co2', 'co2', NOW(), 'user-co2', 'Quote child co2',
          'item-root-co2', 'Part', false, 'Purchase to Order', 2, 1,
          'quote-co2', 'quote-line-co2', 'qmm-root-co2', 0, 40, 'EA'
        )
    `);

    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function verifyMethodTreeCompanyScope(db) {
  const itemRows = await rows(
    db,
    `SELECT
       "methodMaterialId",
       "materialMakeMethodId",
       "itemId",
       "unitCost",
       "externalId"
     FROM get_method_tree('mm-root-co1', 'co1')`
  );
  expectIds(itemRows, ["mm-root-co1", "mmat-child-co1", "mmat-leaf-co1"]);
  const root = itemRows.find((row) => row.methodMaterialId === "mm-root-co1");
  const child = itemRows.find((row) => row.methodMaterialId === "mmat-child-co1");
  expectEqual(Number(root?.unitCost), 10, "root item cost company scope");
  expectEqual(
    child?.materialMakeMethodId,
    "mm-child-co1",
    "active method fallback company scope"
  );
  expectEqual(
    child?.externalId,
    { onshape: "EXT-CO1" },
    "external integration mapping company scope"
  );

  await expectNoRows(
    db,
    `SELECT "methodMaterialId" FROM get_method_tree('mm-root-co2', 'co1')`
  );

  const jobRows = await rows(
    db,
    `SELECT "methodMaterialId", "jobMakeMethodId", "jobMaterialMakeMethodId"
     FROM get_job_method('job-co1', 'co1')`
  );
  expectIds(jobRows, ["jmm-root-co1", "jmat-child-co1"]);
  await expectNoRows(
    db,
    `SELECT "methodMaterialId" FROM get_job_method('job-co2', 'co1')`
  );

  const quoteRows = await rows(
    db,
    `SELECT "methodMaterialId", "quoteMakeMethodId", "quoteMaterialMakeMethodId", "externalId"
     FROM get_quote_methods('quote-co1', 'co1')`
  );
  expectIds(quoteRows, ["qmm-root-co1", "qmat-child-co1"]);
  await expectNoRows(
    db,
    `SELECT "methodMaterialId" FROM get_quote_methods('quote-co2', 'co1')`
  );

  const quoteMethodRows = await rows(
    db,
    `SELECT "methodMaterialId"
     FROM get_quote_methods_by_method_id('qmm-root-co1', 'co1')`
  );
  expectIds(quoteMethodRows, ["qmm-root-co1", "qmat-child-co1"]);
  await expectNoRows(
    db,
    `SELECT "methodMaterialId"
     FROM get_quote_methods_by_method_id('qmm-root-co2', 'co1')`
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

function expectIds(actualRows, expectedIds) {
  const actual = actualRows.map((row) => row.methodMaterialId).sort();
  const expected = [...expectedIds].sort();

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Unexpected method ids: expected ${JSON.stringify(
        expected
      )}, got ${JSON.stringify(actual)}`
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
