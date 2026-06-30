import { setTimeout as sleep } from "node:timers/promises";
import { log } from "@clack/prompts";
import { execa } from "execa";
import { join } from "pathe";
import pg from "pg";
import { waitForPort } from "../helpers.js";

// ---------------------------------------------------------------------------
// Readiness gates
// ---------------------------------------------------------------------------

// Block until each tcp:<port> accepts on 127.0.0.1. `onProgress` fires once
// per port as it opens — caller streams these into a spinner subtitle so a
// stuck service (e.g. inngest pulling its container) is visible instead of a
// 60s silent hang.
export async function waitForTcp(
  targets: string[],
  opts: { onProgress?: (line: string) => void } = {}
) {
  const ports = targets.map((t) => {
    const m = t.match(/^tcp:(\d+)$/);
    if (!m)
      throw new Error(`waitForTcp: bad target "${t}" (expected tcp:<port>)`);
    return Number(m[1]);
  });
  const total = ports.length;
  let opened = 0;
  await Promise.all(
    ports.map(async (p) => {
      await waitForPort(p, 60_000);
      opened += 1;
      opts.onProgress?.(`tcp:${p} open (${opened}/${total})`);
    })
  );
}

// Block until postgres accepts queries (TCP-open ≠ ready — init scripts run
// after the port opens).
export async function waitForPostgres(port: number, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await withClient(port, (c) => c.query("SELECT 1"));
      return;
    } catch {
      // postgres still initializing — retry until deadline
    }
    await sleep(1000);
  }
  throw new Error(`postgres did not accept queries within ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// Schema migrations
// ---------------------------------------------------------------------------

// Applies Carbon SQL migrations directly through Postgres and records history in
// carbon_migrations.schema_migrations. The runner mirrors existing legacy
// migration history once, so already-applied worktrees do not replay the full
// migration set.
export async function applyMigrations(
  root: string,
  dbPort: number
): Promise<{ applied: boolean }> {
  const dbUrl = `postgresql://supabase_admin:postgres@localhost:${dbPort}/postgres`;
  const args = [
    "--filter",
    "@carbon/database",
    "exec",
    "tsx",
    "src/migrations/apply.ts",
    "--db-url",
    dbUrl,
    "--migrations-dir",
    join(root, "packages/database/migrations")
  ];

  // Retry up to 3 times on deadlock — background services (PostgREST,
  // Realtime) hold catalog locks that race with CREATE POLICY / ALTER TABLE.
  const MAX_RETRIES = 3;
  const execOpts = { cwd: root, reject: false, preferLocal: true };
  // Inferred from the call so `r` is the string-encoded result (not execa's
  // buffer overload) and is definitely assigned after the loop.
  let r = await execa("pnpm", args, execOpts);
  for (let attempt = 1; attempt < MAX_RETRIES && r.exitCode !== 0; attempt++) {
    const output = `${r.stderr ?? ""}\n${r.stdout ?? ""}`;
    if (!/deadlock detected/i.test(output)) break;
    log.warn(
      `deadlock during migration (attempt ${attempt}/${MAX_RETRIES}) — retrying in 3s`
    );
    await sleep(3000);
    r = await execa("pnpm", args, execOpts);
  }
  if (r.exitCode !== 0) {
    process.stderr.write(r.stderr?.toString() ?? "");
    process.stdout.write(r.stdout?.toString() ?? "");
    throw new Error(`pnpm ${args.join(" ")} failed (exit ${r.exitCode})`);
  }
  const appliedCount = Number(
    (r.stdout ?? "").match(/CARBON_MIGRATIONS_APPLIED=(\d+)/)?.[1] ?? "0"
  );
  const applied = appliedCount > 0;
  return { applied };
}

// ---------------------------------------------------------------------------
// Smoke-test user
// ---------------------------------------------------------------------------

const SMOKE_TEST_EMAIL = "test@carbon.ms";

export async function ensureSmokeTestUser(
  root: string,
  dbPort: number,
  apiPort: number
): Promise<{ seeded: boolean }> {
  const exists = await withClient(dbPort, async (c) => {
    const r = await c.query<{ count: string }>(
      `SELECT count(*)::text FROM "user" WHERE email = $1`,
      [SMOKE_TEST_EMAIL]
    );
    return Number(r.rows[0]?.count) > 0;
  });

  if (exists) return { seeded: false };

  const dbUrl = `postgresql://supabase_admin:postgres@localhost:${dbPort}/postgres`;
  const apiUrl = `http://localhost:${apiPort}`;
  await execa(
    "pnpm",
    [
      "--filter",
      "@carbon/database",
      "run",
      "db:seed:dev",
      "--",
      "--email",
      SMOKE_TEST_EMAIL
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        CARBON_API_URL: apiUrl,
        CARBON_DATABASE_URL: dbUrl,
        NODE_TLS_REJECT_UNAUTHORIZED: "0"
      },
      stdio: "pipe"
    }
  );

  return { seeded: true };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

type HostPgOpts = {
  user?: string;
  password?: string;
  database?: string;
};

// Host-side Postgres connection. `pg` avoids a host `psql` install —
// previously a hidden requirement that bit at least one engineer.
async function withClient<T>(
  port: number,
  fn: (c: pg.Client) => Promise<T>,
  opts: HostPgOpts = {}
): Promise<T> {
  const client = new pg.Client({
    host: "127.0.0.1",
    port,
    user: opts.user ?? "postgres",
    password: opts.password ?? "postgres",
    database: opts.database ?? "postgres"
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
