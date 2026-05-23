import { setTimeout as sleep } from "node:timers/promises";
import { execa } from "execa";
import pg from "pg";
import { waitForPort } from "../helpers.js";

// ---------------------------------------------------------------------------
// Readiness gates
// ---------------------------------------------------------------------------

// Block until each tcp:<port> accepts on 127.0.0.1. `onProgress` fires once
// per port as it opens so a stuck service is visible instead of a silent hang.
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

// Block until postgres accepts queries (TCP-open != ready; init scripts run
// after the port opens).
export async function waitForPostgres(port: number, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await withClient(port, (c) => c.query("SELECT 1"));
      return;
    } catch {
      // postgres still initializing; retry until deadline
    }
    await sleep(1000);
  }
  throw new Error(`postgres did not accept queries within ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// Schema migrations
// ---------------------------------------------------------------------------

export async function applyMigrations(
  root: string,
  dbPort: number
): Promise<{ applied: boolean }> {
  const databaseUrl = `postgresql://carbon:carbon@localhost:${dbPort}/carbon`;
  const r = await execa(
    "pnpm",
    ["--filter", "@carbon/database", "db:migrate"],
    {
      cwd: root,
      reject: false,
      env: {
        DATABASE_MIGRATION_URL: databaseUrl,
        DATABASE_URL: databaseUrl,
        DATABASE_SERVICE_URL: databaseUrl,
        JOBS_DATABASE_URL: databaseUrl
      }
    }
  );

  if (r.exitCode !== 0) {
    process.stderr.write(r.stderr?.toString() ?? "");
    process.stdout.write(r.stdout?.toString() ?? "");
    throw new Error(`drizzle migrations failed (exit ${r.exitCode})`);
  }

  const output = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  return { applied: !/no migrations|already up to date/i.test(output) };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

type HostPgOpts = {
  user?: string;
  password?: string;
  database?: string;
};

async function withClient<T>(
  port: number,
  fn: (client: pg.Client) => Promise<T>,
  opts: HostPgOpts = {}
): Promise<T> {
  const client = new pg.Client({
    host: "127.0.0.1",
    port,
    user: opts.user ?? "carbon",
    password: opts.password ?? "carbon",
    database: opts.database ?? "carbon"
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}
