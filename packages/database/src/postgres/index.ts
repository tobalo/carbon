import {
  type Driver,
  Kysely,
  PostgresAdapter,
  type PostgresDialectConfig,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type Transaction
} from "kysely";
// Aliased it as pg so can be imported as-is in Node environment
import { Pool } from "pg";
import type { Database } from "../types.ts";
import type { KyselyDatabaseFromGenerated } from "./kysely-schema.ts";

export type KyselyDatabase = KyselyDatabaseFromGenerated<Database>;
export type KyselyTx = Transaction<KyselyDatabase>;
export type KyselyDbTx = KyselyDatabase | KyselyTx;

export type { ExpressionBuilder, Kysely } from "kysely";

export function getRuntime() {
  if (typeof (globalThis as Record<string, unknown>).Deno !== "undefined") {
    return "deno";
  }

  if (typeof globalThis.window !== "undefined") {
    return "browser";
  }

  return "node";
}

export function getPostgresConnectionPool(connections: number): Pool {
  const runtime = getRuntime();

  switch (runtime) {
    case "deno": {
      const deno = (
        globalThis as unknown as {
          Deno: { env: { get(name: string): string | undefined } };
        }
      ).Deno;
      const url =
        deno.env.get("CARBON_DATABASE_URL") ??
        deno.env.get("DATABASE_URL") ??
        deno.env.get("POSTGRES_URL");
      if (!url) {
        throw new Error("CARBON_DATABASE_URL is required");
      }
      // @ts-ignore Compat
      return new Pool(url, connections);
    }
    case "node": {
      const url =
        process.env.CARBON_DATABASE_URL ??
        process.env.DATABASE_URL ??
        process.env.POSTGRES_URL;
      if (!url) {
        throw new Error("CARBON_DATABASE_URL is required");
      }
      return new Pool({
        connectionString: url,
        max: connections
      });
    }

    default:
      throw new Error(
        "getPostgresConnectionPool is not supported in non-server environments"
      );
  }
}

interface PgDriverConstructor {
  new (config: PostgresDialectConfig): Driver;
}

export function getPostgresClient<D = KyselyDatabase>(
  pool: Pool,
  driver: PgDriverConstructor
): Kysely<D> {
  const runtime = getRuntime();

  switch (runtime) {
    case "node":
    case "deno": {
      return new Kysely<D>({
        dialect: {
          createAdapter() {
            return new PostgresAdapter();
          },
          createDriver() {
            return new driver({ pool });
          },
          createIntrospector(db: Kysely<unknown>) {
            return new PostgresIntrospector(db);
          },
          createQueryCompiler() {
            return new PostgresQueryCompiler();
          }
        }
      });
    }

    default:
      throw new Error(
        "getPostgresClient is not supported in non-server environments"
      );
  }
}
