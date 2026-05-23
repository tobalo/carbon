import { $ } from "execa";

import { fetchWorkspaces, markWorkspaceSeeded } from "./client";

export type Workspace = {
  id: number;
  name: string;
  slug: string;
  active: boolean;
  seeded: boolean;
  connection_string: string | null;
  database_url: string | null;
};

async function migrate(): Promise<void> {
  console.log("✅ 🌱 Starting migrations");

  const workspaces = await fetchWorkspaces<Workspace>();

  let hasErrors = false;

  console.log("✅ 🛩️ Successfully retreived workspaces");

  for await (const workspace of workspaces) {
    try {
      console.log(`✅ 🥚 Migrating ${workspace.id}`);
      const databaseUrl = workspace.connection_string ?? workspace.database_url;
      if (!databaseUrl?.startsWith("postgres")) {
        console.log(`🔴🍳 Missing database url for ${workspace.id}`);
        continue;
      }

      console.log(`✅ 🔑 Setting up environment for ${workspace.id}`);

      const $$ = $({
        env: {
          DATABASE_MIGRATION_URL: databaseUrl,
          DATABASE_URL: databaseUrl,
          DATABASE_SERVICE_URL: databaseUrl,
          JOBS_DATABASE_URL: databaseUrl,
        },
        cwd: "..",
        stdio: "inherit",
      });

      console.log(`✅ 🐣 Starting migrations for ${workspace.id}`);

      await $$`pnpm --filter @carbon/database db:migrate`;

      if (!workspace.seeded) {
        try {
          console.log(`✅ 🌱 Seeding ${workspace.id}`);
          await $$`pnpm --filter @carbon/database db:seed`;
          await markWorkspaceSeeded(workspace.id);
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

migrate().catch((error) => {
  console.error("🔴 Unexpected error during migration", error);
  process.exit(1);
});
