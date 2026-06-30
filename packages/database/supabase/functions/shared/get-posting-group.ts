import type { LegacyPostgrestClient } from "../lib/legacy-client.ts";

export async function getDefaultPostingGroup(
  client: LegacyPostgrestClient,
  companyId: string
) {
  return await client
    .from("accountDefault")
    .select("*")
    .eq("companyId", companyId)
    .single();
}
