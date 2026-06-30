import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const CARBON_MIGRATIONS_SCHEMA = "carbon_migrations";
const CARBON_MIGRATIONS_TABLE = `${CARBON_MIGRATIONS_SCHEMA}.schema_migrations`;

export type MigrationFile = {
  fileName: string;
  name: string;
  path: string;
  sql: string;
  version: string;
};

export type ApplyMigrationsOptions = {
  connectionString: string;
  migrationsDir: string;
  repairStale?: boolean;
};

export type ApplyMigrationsResult = {
  applied: boolean;
  appliedCount: number;
  repairedCount: number;
};

export async function applyCarbonMigrations({
  connectionString,
  migrationsDir,
  repairStale = true
}: ApplyMigrationsOptions): Promise<ApplyMigrationsResult> {
  const migrations = await loadMigrationFiles(migrationsDir);
  const localByVersion = new Map(
    migrations.map((migration) => [migration.version, migration])
  );

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    await ensureCarbonMigrationTable(client);
    const repairedCount = repairStale
      ? await repairStaleCarbonHistory(client, localByVersion)
      : 0;

    const appliedVersions = await getAppliedCarbonVersions(client);
    let appliedCount = 0;

    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) continue;
      await applyMigration(client, migration);
      appliedVersions.add(migration.version);
      appliedCount += 1;
    }

    return {
      applied: appliedCount > 0,
      appliedCount,
      repairedCount
    };
  } finally {
    await client.end();
  }
}

async function loadMigrationFiles(migrationsDir: string) {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const migrations: MigrationFile[] = [];
  const seenVersions = new Set<string>();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".sql")) continue;
    const match = entry.name.match(/^(\d+)_(.+)\.sql$/u);
    if (!match) continue;

    const [, version, name] = match;
    if (!version || !name) continue;
    if (seenVersions.has(version)) {
      throw new Error(`Duplicate migration version ${version}`);
    }
    seenVersions.add(version);

    const path = resolve(migrationsDir, entry.name);
    migrations.push({
      fileName: entry.name,
      name,
      path,
      sql: await readFile(path, "utf8"),
      version
    });
  }

  migrations.sort((a, b) => a.fileName.localeCompare(b.fileName));
  return migrations;
}

async function ensureCarbonMigrationTable(client: pg.Client) {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${CARBON_MIGRATIONS_SCHEMA}`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${CARBON_MIGRATIONS_TABLE} (
      version text PRIMARY KEY,
      name text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function repairStaleCarbonHistory(
  client: pg.Client,
  localByVersion: Map<string, MigrationFile>
) {
  const applied = await getAppliedCarbonVersions(client);
  const stale = [...applied].filter((version) => !localByVersion.has(version));
  for (const version of stale) {
    await client.query(
      `DELETE FROM ${CARBON_MIGRATIONS_TABLE} WHERE version = $1`,
      [version]
    );
  }
  return stale.length;
}

async function getAppliedCarbonVersions(client: pg.Client) {
  const result = await client.query<{ version: string }>(
    `SELECT version FROM ${CARBON_MIGRATIONS_TABLE} ORDER BY version`
  );
  return new Set(result.rows.map((row) => row.version));
}

async function applyMigration(client: pg.Client, migration: MigrationFile) {
  console.log(`Applying migration ${migration.fileName}`);

  try {
    await client.query(migration.sql);
    await client.query(
      `
      INSERT INTO ${CARBON_MIGRATIONS_TABLE} (version, name)
      VALUES ($1, $2)
      `,
      [migration.version, migration.name]
    );
  } catch (error) {
    throw new Error(`Failed to apply ${migration.fileName}`, { cause: error });
  }
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg?.startsWith("--")) continue;
    if (arg === "--no-repair-stale") {
      args.set("repair-stale", false);
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      args.set(arg.slice(2), true);
      continue;
    }
    args.set(arg.slice(2), value);
    i += 1;
  }
  return args;
}

function getCliConnectionString(args: Map<string, string | boolean>) {
  const value =
    asString(args.get("db-url")) ??
    process.env.CARBON_DATABASE_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL;
  if (!value) {
    throw new Error(
      "CARBON_DATABASE_URL, DATABASE_URL, or POSTGRES_URL is required"
    );
  }
  return value;
}

function asString(value: string | boolean | undefined) {
  return typeof value === "string" ? value : undefined;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const migrationsDir =
    asString(args.get("migrations-dir")) ??
    resolve(process.cwd(), "migrations");

  const result = await applyCarbonMigrations({
    connectionString: getCliConnectionString(args),
    migrationsDir,
    repairStale: args.get("repair-stale") !== false
  });

  console.log(`CARBON_MIGRATIONS_APPLIED=${result.appliedCount}`);
  console.log(`CARBON_MIGRATIONS_REPAIRED_STALE=${result.repairedCount}`);
}

if (process.argv[1]?.endsWith("apply.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
