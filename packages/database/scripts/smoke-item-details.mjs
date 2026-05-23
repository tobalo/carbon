import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const initScriptsDir = resolve(repoRoot, "packages/dev/docker/postgres");
const image = "pgvector/pgvector:pg18-trixie";
const containerName = `carbon-pg18-item-detail-smoke-${process.pid}`;
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
    await verifyItemDetailCompanyScope(pool);

    console.log("Item detail RPC smoke passed");
    console.log("- pg18-trixie Docker migration apply succeeded");
    console.log("- item detail RPCs require company_id and drop legacy signatures");
    console.log("- part, tool, material, consumable, and naming lookups isolate company rows");
    console.log("- material supplier and taxonomy joins stay company-scoped");
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
        'get_part_details',
        'get_tool_details',
        'get_material_details',
        'get_consumable_details',
        'get_material_naming_details'
      )
    ORDER BY proname, args
  `);

  const signatures = new Set(
    result.rows.map((row) => `${row.proname}(${row.args})`)
  );
  const expected = [
    "get_consumable_details(item_id text, company_id text)",
    "get_material_details(item_id text, company_id text)",
    "get_material_naming_details(readable_id text, company_id text)",
    "get_part_details(item_id text, company_id text)",
    "get_tool_details(item_id text, company_id text)"
  ];

  for (const signature of expected) {
    if (!signatures.has(signature)) {
      throw new Error(`Missing expected item detail function: ${signature}`);
    }
  }

  for (const signature of signatures) {
    if (
      signature === "get_consumable_details(item_id text)" ||
      signature === "get_material_details(item_id text)" ||
      signature === "get_material_naming_details(readable_id text)" ||
      signature === "get_part_details(item_id text)" ||
      signature === "get_tool_details(item_id text)"
    ) {
      throw new Error(`Legacy unscoped item detail function remains: ${signature}`);
    }
  }
}

async function setupFixtures(db) {
  await db.query("BEGIN");

  try {
    await db.query("SET LOCAL session_replication_role = replica");
    await db.query(`
      INSERT INTO "unitOfMeasure" (
        id, code, name, active, "companyId", "createdAt", "createdBy"
      )
      VALUES
        ('uom-co1', 'EA', 'Each co1', true, 'co1', NOW(), 'user-co1'),
        ('uom-co2', 'EA', 'Each co2', true, 'co2', NOW(), 'user-co2')
    `);

    await db.query(`
      INSERT INTO "modelUpload" (
        id, "companyId", "createdBy", "modelPath", name, size, "thumbnailPath"
      )
      VALUES
        (
          'model-part-co1', 'co1', 'user-co1', 'co1/part.step',
          'Part model co1', 42, 'co1/part.png'
        ),
        (
          'model-material-co1', 'co1', 'user-co1', 'co1/material.step',
          'Material model co1', 84, 'co1/material.png'
        ),
        (
          'model-part-co2', 'co2', 'user-co2', 'co2/part.step',
          'Part model co2', 126, 'co2/part.png'
        )
    `);

    await db.query(`
      INSERT INTO "item" (
        id, name, "readableId", "readableIdWithRevision", revision, active,
        "companyId", "createdAt", "createdBy", embedding, "itemTrackingType",
        "replenishmentSystem", "requiresInspection", type,
        "unitOfMeasureCode", "defaultMethodType", "modelUploadId"
      )
      VALUES
        (
          'part-item-co1', 'Part co1', 'PART-CO1', 'PART-CO1/A', 'A', true,
          'co1', NOW(), 'user-co1', '[0]', 'Inventory', 'Make', false,
          'Part', 'EA', 'Make to Order', 'model-part-co1'
        ),
        (
          'part-item-co1-rev-b', 'Part co1 rev B', 'PART-CO1',
          'PART-CO1/B', 'B', true, 'co1', NOW(), 'user-co1', '[0]',
          'Inventory', 'Make', false, 'Part', 'EA', 'Make to Order',
          NULL
        ),
        (
          'part-item-co2', 'Part co2', 'PART-CO2', 'PART-CO2/A', 'A', true,
          'co2', NOW(), 'user-co2', '[0]', 'Inventory', 'Make', false,
          'Part', 'EA', 'Make to Order', 'model-part-co2'
        ),
        (
          'tool-item-co1', 'Tool co1', 'TOOL-CO1', 'TOOL-CO1/A', 'A', true,
          'co1', NOW(), 'user-co1', '[0]', 'Inventory', 'Buy', false,
          'Tool', 'EA', 'Pull from Inventory', NULL
        ),
        (
          'tool-item-co2', 'Tool co2', 'TOOL-CO2', 'TOOL-CO2/A', 'A', true,
          'co2', NOW(), 'user-co2', '[0]', 'Inventory', 'Buy', false,
          'Tool', 'EA', 'Pull from Inventory', NULL
        ),
        (
          'material-item-co1', 'Material co1', 'MAT-CO1', 'MAT-CO1/A',
          'A', true, 'co1', NOW(), 'user-co1', '[0]', 'Inventory', 'Buy',
          false, 'Material', 'EA', 'Purchase to Order', 'model-material-co1'
        ),
        (
          'material-item-co2', 'Material co2', 'MAT-CO2', 'MAT-CO2/A',
          'A', true, 'co2', NOW(), 'user-co2', '[0]', 'Inventory', 'Buy',
          false, 'Material', 'EA', 'Purchase to Order', NULL
        ),
        (
          'consumable-item-co1', 'Consumable co1', 'CONS-CO1',
          'CONS-CO1/A', 'A', true, 'co1', NOW(), 'user-co1', '[0]',
          'Inventory', 'Buy', false, 'Consumable', 'EA',
          'Pull from Inventory', NULL
        ),
        (
          'consumable-item-co2', 'Consumable co2', 'CONS-CO2',
          'CONS-CO2/A', 'A', true, 'co2', NOW(), 'user-co2', '[0]',
          'Inventory', 'Buy', false, 'Consumable', 'EA',
          'Pull from Inventory', NULL
        )
    `);

    await db.query(`
      INSERT INTO "part" (
        id, approved, "companyId", "createdAt", "createdBy", "customFields", tags
      )
      VALUES
        ('PART-CO1', true, 'co1', NOW(), 'user-co1', '{"source":"co1"}', ARRAY['co1']),
        ('PART-CO2', true, 'co2', NOW(), 'user-co2', '{"source":"co2"}', ARRAY['co2'])
    `);

    await db.query(`
      INSERT INTO "tool" (
        id, approved, "companyId", "createdAt", "createdBy", "customFields", tags
      )
      VALUES
        ('TOOL-CO1', true, 'co1', NOW(), 'user-co1', '{"source":"co1"}', ARRAY['co1']),
        ('TOOL-CO2', true, 'co2', NOW(), 'user-co2', '{"source":"co2"}', ARRAY['co2'])
    `);

    await db.query(`
      INSERT INTO "materialForm" (
        id, code, name, "companyId", "createdAt", "createdBy"
      )
      VALUES
        ('form-co1', 'SHT', 'Sheet co1', 'co1', NOW(), 'user-co1'),
        ('form-co2', 'BAD', 'Sheet co2', 'co2', NOW(), 'user-co2')
    `);
    await db.query(`
      INSERT INTO "materialSubstance" (
        id, code, name, "companyId", "createdAt", "createdBy"
      )
      VALUES
        ('substance-co1', 'AL', 'Aluminum co1', 'co1', NOW(), 'user-co1'),
        ('substance-co2', 'CU', 'Copper co2', 'co2', NOW(), 'user-co2')
    `);
    await db.query(`
      INSERT INTO "materialType" (
        id, code, name, "companyId", "materialFormId", "materialSubstanceId"
      )
      VALUES
        ('type-co1', '6061', '6061 Plate co1', 'co1', 'form-co1', 'substance-co1'),
        ('type-co2', '110', 'Copper Plate co2', 'co2', 'form-co2', 'substance-co2')
    `);
    await db.query(`
      INSERT INTO "materialDimension" (
        id, name, "companyId", "materialFormId", "isMetric"
      )
      VALUES
        ('dimension-co1', '1 x 2 co1', 'co1', 'form-co1', false),
        ('dimension-co2', '3 x 4 co2', 'co2', 'form-co2', false)
    `);
    await db.query(`
      INSERT INTO "materialFinish" (
        id, name, "companyId", "materialSubstanceId"
      )
      VALUES
        ('finish-co1', 'Mill co1', 'co1', 'substance-co1'),
        ('finish-co2', 'Polished co2', 'co2', 'substance-co2')
    `);
    await db.query(`
      INSERT INTO "materialGrade" (
        id, name, "companyId", "materialSubstanceId"
      )
      VALUES
        ('grade-co1', 'T6 co1', 'co1', 'substance-co1'),
        ('grade-co2', 'H02 co2', 'co2', 'substance-co2')
    `);

    await db.query(`
      INSERT INTO "material" (
        id, approved, "companyId", "createdAt", "createdBy",
        "materialFormId", "materialSubstanceId", "materialTypeId",
        "dimensionId", "finishId", "gradeId", "customFields", tags
      )
      VALUES
        (
          'MAT-CO1', true, 'co1', NOW(), 'user-co1',
          'form-co1', 'substance-co1', 'type-co1',
          'dimension-co1', 'finish-co1', 'grade-co1',
          '{"source":"co1"}', ARRAY['co1']
        ),
        (
          'MAT-CO2', true, 'co2', NOW(), 'user-co2',
          'form-co2', 'substance-co2', 'type-co2',
          'dimension-co2', 'finish-co2', 'grade-co2',
          '{"source":"co2"}', ARRAY['co2']
        )
    `);

    await db.query(`
      INSERT INTO "consumable" (
        id, approved, "companyId", "createdAt", "createdBy", "customFields", tags
      )
      VALUES
        ('CONS-CO1', true, 'co1', NOW(), 'user-co1', '{"source":"co1"}', ARRAY['co1']),
        ('CONS-CO2', true, 'co2', NOW(), 'user-co2', '{"source":"co2"}', ARRAY['co2'])
    `);

    await db.query(`
      INSERT INTO "itemCost" (
        "companyId", "costingMethod", "costIsAdjusted", "createdAt",
        "createdBy", "itemId", "standardCost", "unitCost"
      )
      VALUES
        ('co1', 'Standard', false, NOW(), 'user-co1', 'part-item-co1', 10, 10),
        ('co2', 'Standard', false, NOW(), 'user-co2', 'part-item-co1', 99, 99),
        ('co1', 'Standard', false, NOW(), 'user-co1', 'material-item-co1', 20, 20),
        ('co2', 'Standard', false, NOW(), 'user-co2', 'material-item-co1', 200, 200)
    `);

    await db.query(`
      INSERT INTO "supplierPart" (
        id, active, "companyId", "conversionFactor", "createdAt",
        "createdBy", "itemId", "supplierId", "supplierPartId"
      )
      VALUES
        (
          'supplier-part-co1', true, 'co1', 1, NOW(), 'user-co1',
          'material-item-co1', 'supplier-co1', 'SUP-CO1'
        ),
        (
          'supplier-part-co2-leak', true, 'co2', 1, NOW(), 'user-co2',
          'material-item-co1', 'supplier-co2', 'SUP-CO2'
        ),
        (
          'supplier-consumable-co1', true, 'co1', 1, NOW(), 'user-co1',
          'consumable-item-co1', 'supplier-co1', 'CONS-SUP-CO1'
        ),
        (
          'supplier-consumable-co2-leak', true, 'co2', 1, NOW(), 'user-co2',
          'consumable-item-co1', 'supplier-co2', 'CONS-SUP-CO2'
        )
    `);

    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function verifyItemDetailCompanyScope(db) {
  const part = await expectSingleRow(
    db,
    `SELECT id, "companyId", "modelSize", "revisions"
     FROM get_part_details('part-item-co1', 'co1')`
  );
  expectEqual(part.id, "part-item-co1", "part detail id");
  expectEqual(part.companyId, "co1", "part detail company");
  expectEqual(Number(part.modelSize), 42, "part model size cast");
  if (!Array.isArray(part.revisions) || part.revisions.length !== 2) {
    throw new Error("Expected part revisions to stay within co1 readableId scope");
  }

  await expectNoRows(
    db,
    `SELECT id FROM get_part_details('part-item-co2', 'co1')`
  );
  await expectNoRows(
    db,
    `SELECT id FROM get_tool_details('tool-item-co2', 'co1')`
  );
  await expectIds(
    db,
    `SELECT id FROM get_tool_details('tool-item-co1', 'co1')`,
    ["tool-item-co1"]
  );
  await expectNoRows(
    db,
    `SELECT id FROM get_material_details('material-item-co2', 'co1')`
  );
  await expectNoRows(
    db,
    `SELECT id FROM get_consumable_details('consumable-item-co2', 'co1')`
  );

  const material = await expectSingleRow(
    db,
    `SELECT
       id,
       "companyId",
       "modelSize",
       "supplierIds",
       "materialForm",
       "materialSubstance",
       "materialType",
       "dimensions",
       "finish",
       "grade"
     FROM get_material_details('material-item-co1', 'co1')`
  );
  expectEqual(material.id, "material-item-co1", "material detail id");
  expectEqual(material.companyId, "co1", "material detail company");
  expectEqual(Number(material.modelSize), 84, "material model size cast");
  expectEqual(material.supplierIds, "SUP-CO1", "material supplier scope");
  expectEqual(material.materialForm, "Sheet co1", "material form scope");
  expectEqual(material.materialSubstance, "Aluminum co1", "material substance scope");
  expectEqual(material.materialType, "6061 Plate co1", "material type scope");
  expectEqual(material.dimensions, "1 x 2 co1", "material dimension scope");
  expectEqual(material.finish, "Mill co1", "material finish scope");
  expectEqual(material.grade, "T6 co1", "material grade scope");

  const consumable = await expectSingleRow(
    db,
    `SELECT id, "supplierIds"
     FROM get_consumable_details('consumable-item-co1', 'co1')`
  );
  expectEqual(consumable.id, "consumable-item-co1", "consumable detail id");
  expectEqual(
    consumable.supplierIds,
    "CONS-SUP-CO1",
    "consumable supplier scope"
  );

  const naming = await expectSingleRow(
    db,
    `SELECT *
     FROM get_material_naming_details('MAT-CO1', 'co1')`
  );
  expectEqual(naming.id, "MAT-CO1", "material naming id");
  expectEqual(naming.shape, "Sheet co1", "material naming shape scope");
  expectEqual(naming.shapeCode, "SHT", "material naming shape code scope");
  expectEqual(
    naming.substance,
    "Aluminum co1",
    "material naming substance scope"
  );
  expectEqual(naming.materialType, "6061 Plate co1", "material naming type scope");

  await expectNoRows(
    db,
    `SELECT id FROM get_material_naming_details('MAT-CO2', 'co1')`
  );
}

async function expectSingleRow(db, sql) {
  const result = await db.query(sql);

  if (result.rows.length !== 1) {
    throw new Error(
      `Expected one row for ${sql}, got ${result.rows.length}: ${JSON.stringify(
        result.rows
      )}`
    );
  }

  return result.rows[0];
}

async function expectNoRows(db, sql) {
  const result = await db.query(sql);

  if (result.rows.length !== 0) {
    throw new Error(
      `Expected no rows for ${sql}, got ${JSON.stringify(result.rows)}`
    );
  }
}

async function expectIds(db, sql, expectedIds) {
  const result = await db.query(sql);
  const actualIds = result.rows.map((row) => row.id).sort();
  const expected = [...expectedIds].sort();

  if (JSON.stringify(actualIds) !== JSON.stringify(expected)) {
    throw new Error(
      `Unexpected ids for ${sql}: expected ${JSON.stringify(
        expected
      )}, got ${JSON.stringify(actualIds)}`
    );
  }
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) {
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
