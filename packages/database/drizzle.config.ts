import { defineConfig } from "drizzle-kit";

const migrationUrl =
  process.env.DATABASE_MIGRATION_URL ?? process.env.CARBON_CONTROL_DATABASE_URL;

if (!migrationUrl) {
  throw new Error(
    "DATABASE_MIGRATION_URL or CARBON_CONTROL_DATABASE_URL is required for Drizzle migrations"
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: migrationUrl
  },
  strict: true,
  verbose: true
});
