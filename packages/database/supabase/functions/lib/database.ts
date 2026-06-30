// Aliased it as pg so can be imported as-is in Node environment
import { Pool } from "pg";
import {
  getPostgresClient,
  getPostgresConnectionPool
} from "../../../src/postgres/index.ts";
import type { KyselyDatabase } from "../../../src/postgres/index.ts";
import { PostgresDriver } from "./driver.ts";

export type DB = KyselyDatabase;

export const getConnectionPool = getPostgresConnectionPool;

export function getDatabaseClient<_>(pool: Pool) {
  return getPostgresClient(pool, PostgresDriver);
}
