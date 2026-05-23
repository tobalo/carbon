import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { getPostgresConnectionPool } from "./postgres";
import { schema } from "./schema";

export { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

export type DrizzleDb = NodePgDatabase<typeof schema>;

export type AuthContext =
  | { kind: "user"; userId: string }
  | { kind: "apiKey"; apiKey: string }
  | { kind: "service" };

const appPool = getPostgresConnectionPool(
  Number(process.env.DATABASE_POOL_SIZE ?? 10)
);
const servicePool = getPostgresConnectionPool(
  Number(process.env.DATABASE_SERVICE_POOL_SIZE ?? 5),
  { kind: "service" }
);

export function getDrizzleClient(pool: Pool): DrizzleDb {
  return drizzle(pool, { schema });
}

export const db = getDrizzleClient(appPool);
export const dbService = getDrizzleClient(servicePool);

export async function withAuth<T>(
  ctx: AuthContext,
  fn: (tx: DrizzleDb) => Promise<T>
): Promise<T> {
  if (ctx.kind === "service") {
    return fn(dbService);
  }

  return db.transaction(async (tx) => {
    if (ctx.kind === "user") {
      await tx.execute(
        sql`select set_config('app.user_id', ${ctx.userId}, true)`
      );
    } else {
      await tx.execute(
        sql`select set_config('app.api_key_id', ${ctx.apiKey}, true)`
      );
    }

    return fn(tx as DrizzleDb);
  });
}
