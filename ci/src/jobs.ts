import { $ } from "execa";

import { closeWorkspaceDatabase, getJobWorkspaces } from "./workspaces";

type Workspace = {
  id: number;
  url_erp: string | null;
};

async function jobs(): Promise<void> {
  console.log("✅ 🌱 Starting background jobs sync");

  const workspaces = await getJobWorkspaces();

  let hasErrors = false;

  for (const workspace of workspaces as Workspace[]) {
    const { id, url_erp } = workspace;

    if (!url_erp) {
      console.log(`⏭️ Skipping workspace ${id} — no url_erp`);
      continue;
    }

    try {
      console.log(`✅ 🔄 Syncing jobs for workspace ${id} (${url_erp})`);
      await $`curl -X PUT https://${url_erp}/api/inngest`;
      console.log(`✅ 🐓 Successfully synced jobs for workspace ${id}`);
    } catch (err) {
      console.error(`🔴 🍳 Failed to sync jobs for workspace ${id}`, err);
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.error("🔴 Jobs sync completed with errors");
    process.exit(1);
  }

  console.log("✅ All jobs synced successfully");
}

jobs()
  .catch((error) => {
    console.error("🔴 Unexpected error during jobs sync", error);
    process.exitCode = 1;
  })
  .finally(closeWorkspaceDatabase);
