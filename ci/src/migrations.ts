import { $ } from "execa";

import {
  closeWorkspaceDatabase,
  getMigrationWorkspaces,
  markWorkspaceSeeded,
} from "./workspaces";

export type Workspace = {
  id: number;
  name: string;
  slug: string;
  active: boolean;
  seeded: boolean;
  connection_string: string | null;
  database_url: string | null;
  anon_key: string | null;
  service_role_key: string | null;
};

async function migrate(): Promise<void> {
  console.log("✅ 🌱 Starting migrations");

  const workspaces = await getMigrationWorkspaces();

  let hasErrors = false;

  console.log("✅ 🛩️ Successfully retreived workspaces");

  for await (const workspace of workspaces as Workspace[]) {
    try {
      console.log(`✅ 🥚 Migrating ${workspace.id}`);
      const {
        connection_string,
        database_url,
        service_role_key,
        anon_key,
      } = workspace;
      if (!database_url) {
        console.log(`🔴🍳 Missing database url for ${workspace.id}`);
        hasErrors = true;
        continue;
      }

      if (!connection_string?.startsWith("postgresql://")) {
        console.log(
          `🔴🍳 Missing direct Postgres connection string for ${workspace.id}`
        );
        hasErrors = true;
        continue;
      }

      console.log(`✅ 🔑 Setting up environment for ${workspace.id}`);
      const carbon = $({
        env: {
          CARBON_API_URL: database_url,
          CARBON_DATABASE_URL: connection_string,
          CARBON_PUBLIC_KEY: anon_key ?? undefined,
          CARBON_SERVICE_ROLE_KEY: service_role_key ?? undefined,
          PGSSLMODE: "disable",
        },
        cwd: "..",
      });

      console.log(`✅ 🐣 Starting migrations for ${workspace.id}`);
      await carbon`pnpm --filter @carbon/database exec tsx src/migrations/apply.ts --db-url ${connection_string} --migrations-dir packages/database/migrations`;

      if (!workspace.seeded) {
        try {
          console.log(`✅ 🌱 Seeding ${workspace.id}`);
          await carbon`tsx packages/database/src/seed.ts`;
          await markWorkspaceSeeded(workspace.id);

          // TODO: run the seed.sql file
        } catch (e) {
          console.error(`🔴 🍳 Failed to seed ${workspace.id}`, e);
        }
      }

      console.log(`✅ 🐓 Successfully migrated ${workspace.id}`);
    } catch (error) {
      console.error(`🔴 🍳 Failed to migrate ${workspace.id}`, error);
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.error("🔴 Migration completed with errors");
    process.exit(1);
  }

  console.log("✅ All migrations completed successfully");
}

migrate()
  .catch((error) => {
    console.error("🔴 Unexpected error during migration", error);
    process.exitCode = 1;
  })
  .finally(closeWorkspaceDatabase);
