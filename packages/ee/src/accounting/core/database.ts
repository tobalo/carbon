import { getDrizzleClient } from "@carbon/database/drizzle";
import { getPostgresConnectionPool } from "@carbon/database/postgres";

export function createAccountingDatabaseClient(connections = 10) {
  const pool = getPostgresConnectionPool(connections, { kind: "jobs" });
  const database = getDrizzleClient(pool);

  return {
    database,
    close: () => pool.end()
  };
}
