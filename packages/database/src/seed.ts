import * as dotenv from "dotenv";
import { getPostgresConnectionPool } from "./postgres.ts";
import { devPrices } from "./seed/index.ts";
import { ensureCurrencyCodes } from "./seed-company.ts";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function seed() {
  const pool = getPostgresConnectionPool(1, { kind: "service" });
  const client = await pool.connect();

  try {
    await ensureCurrencyCodes(client);

    await client.query(
      `INSERT INTO "config" (id, "apiUrl")
       VALUES (true, $1)
       ON CONFLICT (id) DO UPDATE SET
         "apiUrl" = excluded."apiUrl"`,
      [process.env.CARBON_API_URL ?? "http://localhost:3000"]
    );

    for (const [id, { stripePriceId, name }] of Object.entries(devPrices)) {
      await client.query(
        `INSERT INTO "plan" (id, "stripePriceId", name)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET
           "stripePriceId" = excluded."stripePriceId",
           name = excluded.name`,
        [id, stripePriceId, name]
      );
    }
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
