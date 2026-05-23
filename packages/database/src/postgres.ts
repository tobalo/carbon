import { Pool } from "pg";

type PoolKind = "app" | "service" | "jobs";

type PoolOptions = {
  kind?: PoolKind;
  connectionString?: string;
};

function isBrowserRuntime() {
  if (typeof globalThis.window !== "undefined") {
    return true;
  }

  return false;
}

function getEnv(name: string) {
  if (isBrowserRuntime()) {
    return undefined;
  }

  return process.env[name];
}

function getDatabaseUrl(kind: PoolKind) {
  if (kind === "service") {
    return getEnv("DATABASE_SERVICE_URL");
  }

  if (kind === "jobs") {
    return getEnv("JOBS_DATABASE_URL");
  }

  return getEnv("DATABASE_URL");
}

function requiredDatabaseUrlName(kind: PoolKind) {
  if (kind === "service") return "DATABASE_SERVICE_URL";
  if (kind === "jobs") return "JOBS_DATABASE_URL";
  return "DATABASE_URL";
}

export function getPostgresConnectionPool(
  connections: number,
  options: PoolOptions = {}
): Pool {
  if (isBrowserRuntime()) {
    throw new Error(
      "getPostgresConnectionPool is not supported in browser environments"
    );
  }

  const connectionString =
    options.connectionString ?? getDatabaseUrl(options.kind ?? "app");

  if (!connectionString) {
    throw new Error(`${requiredDatabaseUrlName(options.kind ?? "app")} is not set`);
  }

  return new Pool({
    connectionString,
    max: connections
  });
}
