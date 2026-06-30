import * as dotenv from "dotenv";
import { getPostgresConnectionPool } from "./client.ts";
import { devPrices } from "./seed/index.ts";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function seed() {
  const pgPool = getPostgresConnectionPool(1);

  try {
    await pgPool.query(
      `
      INSERT INTO config (id, "apiUrl", "anonKey")
      VALUES ($1, $2, $3)
      ON CONFLICT (id)
      DO UPDATE SET
        "apiUrl" = EXCLUDED."apiUrl",
        "anonKey" = EXCLUDED."anonKey"
      `,
      [true, resolveApiUrl(), resolvePublicKey()]
    );

    for (const [id, { stripePriceId, name }] of Object.entries(devPrices)) {
      await pgPool.query(
        `
        INSERT INTO "plan" (id, "stripePriceId", name)
        VALUES ($1, $2, $3)
        ON CONFLICT (id)
        DO UPDATE SET
          "stripePriceId" = EXCLUDED."stripePriceId",
          name = EXCLUDED.name
        `,
        [id, stripePriceId, name]
      );
    }
  } finally {
    await pgPool.end();
  }
}

// Postgres triggers + edge functions call back to the API from inside the
// docker network, so the public portless hostname (https://<branch>.api.dev)
// won't resolve. Use host.docker.internal with the worktree's PORT_API
// (written to .env.local by `crbn up`). Cloud runs (e.g. CI seeding a fresh
// workspace) have no PORT_API and an external API URL — return as-is.
function resolveApiUrl(): string {
  const apiUrl = process.env.CARBON_API_URL;
  if (!apiUrl) {
    throw new Error("seed: CARBON_API_URL is required");
  }
  const port = process.env.PORT_API;
  const isCrbnDevHost =
    /\.api\.dev(\/|$)/.test(apiUrl) || apiUrl.includes("localhost");
  if (!isCrbnDevHost) return apiUrl;
  if (!port) {
    throw new Error(
      "seed: CARBON_API_URL looks like a crbn dev host but PORT_API is unset — run via `crbn` so .env.local is loaded."
    );
  }
  return `http://host.docker.internal:${port}`;
}

function resolvePublicKey(): string {
  const publicKey = process.env.CARBON_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error("seed: CARBON_PUBLIC_KEY is required");
  }
  return publicKey;
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
