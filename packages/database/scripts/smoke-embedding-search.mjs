import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-vector-smoke-${process.pid}`;
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
  let servicePool = null;

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

    ownerPool = new Pool({
      connectionString: ownerUrl(port),
      max: 1
    });
    servicePool = new Pool({
      connectionString: serviceUrl(port),
      max: 1
    });

    await verifyRuntime(ownerPool);
    await setupFixtures(ownerPool);
    await verifyItemSearch(servicePool);
    await verifySupplierSearch(servicePool);

    console.log("Embedding search smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- pgvector extension and vector distance operator verified");
    console.log("- item/supplier search ordering, limit cap, and company filter verified");
  } finally {
    await ownerPool?.end().catch(() => undefined);
    await servicePool?.end().catch(() => undefined);
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

  if (!row.vectorVersion) {
    throw new Error("Expected a pgvector extension version");
  }
}

async function setupFixtures(db) {
  await db.query("BEGIN");

  try {
    await db.query("SET LOCAL session_replication_role = replica");

    for (const item of itemFixtures()) {
      await db.query(
        `
          INSERT INTO "item" (
            id, name, "readableId", active, "companyId", "createdAt",
            "createdBy", embedding, "itemTrackingType",
            "replenishmentSystem", "requiresInspection", type
          )
          VALUES (
            $1, $2, $3, true, $4, NOW(), 'smoke-user', $5::vector,
            'Inventory', $6, false, $7
          )
        `,
        [
          item.id,
          item.name,
          item.readableId,
          item.companyId,
          item.embedding,
          item.replenishmentSystem,
          item.type
        ]
      );
    }

    for (const supplier of supplierFixtures()) {
      await db.query(
        `
          INSERT INTO "supplier" (
            id, name, "companyId", "createdAt", embedding, "taxPercent"
          )
          VALUES ($1, $2, $3, NOW(), $4::vector, 0)
        `,
        [
          supplier.id,
          supplier.name,
          supplier.companyId,
          supplier.embedding
        ]
      );
    }

    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function verifyItemSearch(db) {
  const ordered = await db.query(
    `
      SELECT id, similarity
      FROM items_search($1::vector, $2::float, $3::int, $4::text)
    `,
    [vector([1, 0, 0]), 0.9, 2, "co1"]
  );

  assertEqual(ordered.rows.length, 2, "item search ordered row count");
  assertEqual(ordered.rows[0]?.id, "item-near", "item search closest item");
  assertEqual(ordered.rows[1]?.id, "item-mid", "item search second item");
  assertDescendingSimilarity(ordered.rows, "item search similarity ordering");

  const tenantLeak = ordered.rows.some((row) => row.id === "item-other-company");
  if (tenantLeak) {
    throw new Error("item search returned a row from a different company");
  }

  const capped = await db.query(
    `
      SELECT count(*)::int AS count
      FROM items_search($1::vector, $2::float, $3::int, $4::text)
    `,
    [vector([1, 0, 0]), -1, 20, "co1"]
  );
  assertEqual(capped.rows[0]?.count, 10, "item search limit cap");
}

async function verifySupplierSearch(db) {
  const ordered = await db.query(
    `
      SELECT id, similarity
      FROM suppliers_search($1::vector, $2::float, $3::int, $4::text)
    `,
    [vector([1, 0, 0]), 0.9, 5, "co1"]
  );

  assertEqual(ordered.rows.length, 2, "supplier search ordered row count");
  assertEqual(
    ordered.rows[0]?.id,
    "supplier-near",
    "supplier search closest supplier"
  );
  assertEqual(
    ordered.rows[1]?.id,
    "supplier-mid",
    "supplier search second supplier"
  );
  assertDescendingSimilarity(ordered.rows, "supplier search similarity ordering");

  const tenantLeak = ordered.rows.some(
    (row) => row.id === "supplier-other-company"
  );
  if (tenantLeak) {
    throw new Error("supplier search returned a row from a different company");
  }
}

function itemFixtures() {
  return [
    item("item-near", "Nearest Item", "ITM-NEAR", "co1", [1, 0, 0]),
    item("item-mid", "Middle Item", "ITM-MID", "co1", [0.9, 0.1, 0]),
    item("item-far", "Far Item", "ITM-FAR", "co1", [0, 1, 0]),
    item(
      "item-other-company",
      "Other Company Item",
      "ITM-OTHER",
      "co2",
      [1, 0, 0]
    ),
    ...Array.from({ length: 11 }, (_, index) =>
      item(
        `item-cap-${index}`,
        `Cap Item ${index}`,
        `ITM-CAP-${index}`,
        "co1",
        [0.7, 0.3, 0]
      )
    )
  ];
}

function item(id, name, readableId, companyId, values) {
  return {
    id,
    name,
    readableId,
    companyId,
    embedding: vector(values),
    replenishmentSystem: "Make",
    type: "Part"
  };
}

function supplierFixtures() {
  return [
    supplier("supplier-near", "Nearest Supplier", "co1", [1, 0, 0]),
    supplier("supplier-mid", "Middle Supplier", "co1", [0.9, 0.1, 0]),
    supplier("supplier-far", "Far Supplier", "co1", [0, 1, 0]),
    supplier(
      "supplier-other-company",
      "Other Company Supplier",
      "co2",
      [1, 0, 0]
    )
  ];
}

function supplier(id, name, companyId, values) {
  return {
    id,
    name,
    companyId,
    embedding: vector(values)
  };
}

function vector(values) {
  return `[${values.join(",")}]`;
}

function assertDescendingSimilarity(rows, label) {
  for (let index = 1; index < rows.length; index += 1) {
    const previous = Number(rows[index - 1].similarity);
    const current = Number(rows[index].similarity);

    if (previous < current) {
      throw new Error(
        `${label}: expected row ${index - 1} (${previous}) to rank before row ${index} (${current})`
      );
    }
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
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
