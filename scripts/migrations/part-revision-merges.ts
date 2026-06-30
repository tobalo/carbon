import { parse } from "csv-parse";
import * as dotenv from "dotenv";
import { createReadStream } from "fs";
import { homedir } from "os";
import { resolve } from "path";
import { getPostgresConnectionPool } from "../../packages/database/src/client.ts";
dotenv.config();

const COMPANY_ID = "*****************";
const PROD: boolean = true;
const READ_ONLY: boolean = false;

const sourceFile = resolve(homedir(), "Downloads/******.csv");
const columns = ["ID", "OLD", "NEW", "REVISION"];

const parser = parse({
  delimiter: ",",
  columns,
  fromLine: 2, // Skip header row
});

const databaseUrl = PROD
  ? (process.env.PROD_CARBON_DATABASE_URL ??
    process.env.PROD_DATABASE_URL ??
    process.env.PROD_POSTGRES_URL ??
    process.env.CARBON_DATABASE_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL)
  : (process.env.CARBON_DATABASE_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL);

if (!databaseUrl) {
  throw new Error(
    PROD
      ? "PROD_CARBON_DATABASE_URL, PROD_DATABASE_URL, PROD_POSTGRES_URL, CARBON_DATABASE_URL, DATABASE_URL, or POSTGRES_URL is not defined"
      : "CARBON_DATABASE_URL, DATABASE_URL, or POSTGRES_URL is not defined"
  );
}

process.env.CARBON_DATABASE_URL = databaseUrl;

const readStream = createReadStream(sourceFile);
const pgPool = getPostgresConnectionPool(1);

(async () => {
  const company = await pgPool.query<{ name: string }>(
    `SELECT name FROM company WHERE id = $1 LIMIT 1`,
    [COMPANY_ID]
  );

  if (company.rowCount === 0) {
    console.error("Error fetching company: company not found");
  }

  const rows: {
    ID: string;
    OLD: string;
    NEW: string;
    REVISION: string;
  }[] = [];

  readStream
    .pipe(parser)
    .on("data", (row) => {
      rows.push(row);
    })
    .on("end", async () => {
      try {
        const fetchErrors: string[] = [];
        const updateErrors: string[] = [];

        for (const row of rows) {
          console.log(`Fetching ${row.OLD.trim()}`);
          const [item, oldPart, newPart] = await Promise.all([
            pgPool.query<{ id: string }>(
              `SELECT id FROM item WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
              [row.ID.trim(), COMPANY_ID]
            ),
            pgPool.query<{ id: string }>(
              `SELECT id FROM part WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
              [row.OLD.trim(), COMPANY_ID]
            ),
            pgPool.query<{ id: string }>(
              `SELECT id FROM part WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
              [row.NEW.trim(), COMPANY_ID]
            ),
          ]);

          const itemId = item.rows[0]?.id;
          const oldPartId = oldPart.rows[0]?.id;

          if (!itemId || !oldPartId) {
            console.log(`Failed to fetch ${row.OLD.trim()}`);
            fetchErrors.push(row.OLD.trim());
            continue;
          }

          // @ts-ignore
          if (READ_ONLY === false) {
            console.log(`Updating ${row.OLD.trim()}`);

            const itemUpdate = await pgPool.query(
              `
              UPDATE item
              SET "readableId" = $1, revision = $2
              WHERE id = $3 AND "companyId" = $4
              `,
              [row.NEW.trim(), row.REVISION.trim(), itemId, COMPANY_ID]
            );

            if (itemUpdate.rowCount === 0) {
              console.log(`Failed to update item ${row.OLD.trim()}`);
              console.log(itemUpdate);
              updateErrors.push(row.OLD.trim());
            }

            if (newPart.rowCount > 0) {
              const oldPartDelete = await pgPool.query(
                `DELETE FROM part WHERE id = $1 AND "companyId" = $2`,
                [oldPartId, COMPANY_ID]
              );

              if (itemUpdate.rowCount === 0 || oldPartDelete.rowCount === 0) {
                console.log(`Failed to update ${row.OLD.trim()}`);
                console.log(itemUpdate, oldPartDelete);
                updateErrors.push(row.OLD.trim());
              }
            } else {
              const oldPartUpdate = await pgPool.query(
                `UPDATE part SET id = $1 WHERE id = $2 AND "companyId" = $3`,
                [row.NEW.trim(), oldPartId, COMPANY_ID]
              );
              if (itemUpdate.rowCount === 0 || oldPartUpdate.rowCount === 0) {
                console.log(`Failed to update ${row.OLD.trim()}`);
                console.log(itemUpdate, oldPartUpdate);
                updateErrors.push(row.OLD.trim());
              }
            }
          }
        }

        if (fetchErrors.length > 0) {
          console.error("Failed to fetch the following items:");
          console.log(fetchErrors);
        }

        if (updateErrors.length > 0) {
          console.error("Failed to update the following items:");
          console.log(updateErrors);
        }
      } finally {
        await pgPool.end();
      }
    })
    .on("error", async (error) => {
      console.error("Error processing CSV:", error);
      await pgPool.end();
    });
})();
