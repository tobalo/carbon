import { getCarbonServiceClient } from "@carbon/auth/client.server";
import type { DatabaseQueryClient } from "@carbon/database/query-client";
import type z from "zod";
import { markdownToTiptap } from "./richtext";
import { LinearIssueSchema } from "./types";
import { mapLinearStatusToCarbonStatus } from "./utils";

export async function getLinearIntegration(
  client: DatabaseQueryClient,
  companyId: string
) {
  return await client
    .from("companyIntegration")
    .select("*")
    .eq("companyId", companyId)
    .eq("id", "linear")
    .eq("active", true)
    .limit(1);
}

export async function linkActionToLinearIssue(
  client: DatabaseQueryClient,
  companyId: string,
  input: {
    actionId: string;
    issue: z.infer<typeof LinearIssueSchema>;
    assignee?: string | null;
    syncNotes?: boolean;
  }
) {
  const { data, success } = LinearIssueSchema.safeParse(input.issue);

  if (!success) return null;

  // Convert Linear description (markdown) to Tiptap format for notes
  let notes: any = undefined;
  if (input.syncNotes && data.description) {
    try {
      notes = markdownToTiptap(data.description);
    } catch (e) {
      console.error("Failed to convert Linear description to Tiptap:", e);
    }
  }

  const updateData: Record<string, any> = {
    assignee: input.assignee,
    status: mapLinearStatusToCarbonStatus(data.state.type!),
    dueDate: data.dueDate
  };

  // Only update notes if we successfully converted the description
  if (notes !== undefined) {
    updateData.notes = notes;
  }

  // Update the task fields
  const result = await client
    .from("nonConformanceActionTask")
    .update(updateData)
    .eq("companyId", companyId)
    .eq("id", input.actionId)
    .select("nonConformanceId");

  // Upsert the Linear mapping in externalIntegrationMapping
  // Use the service client to bypass RLS (no DELETE policy for authenticated users)
  const serviceClientForLink = getCarbonServiceClient();
  await serviceClientForLink
    .from("externalIntegrationMapping")
    .delete()
    .eq("entityType", "nonConformanceActionTask")
    .eq("entityId", input.actionId)
    .eq("integration", "linear")
    .eq("companyId", companyId);

  await client.from("externalIntegrationMapping").insert({
    entityType: "nonConformanceActionTask",
    entityId: input.actionId,
    integration: "linear",
    externalId: data.id,
    metadata: data as any,
    companyId
  });

  return result;
}

export const getCompanyEmployees = async (
  client: DatabaseQueryClient,
  companyId: string,
  emails: string[]
) => {
  if (emails.length === 0) return [];

  const users = await client
    .from("user")
    .select("id, email")
    .in("email", emails);

  if (users.error || !users.data?.length) return [];

  const usersById = new Map(users.data.map((user) => [user.id, user]));
  const memberships = await client
    .from("userToCompany")
    .select("userId")
    .eq("companyId", companyId)
    .eq("role", "employee")
    .in("userId", Array.from(usersById.keys()));

  if (memberships.error) return [];

  return (memberships.data ?? []).flatMap((membership) => {
    const user = usersById.get(membership.userId);
    return user
      ? [{ userId: membership.userId, user: { email: user.email } }]
      : [];
  });
};

export async function unlinkActionFromLinearIssue(
  client: DatabaseQueryClient,
  companyId: string,
  input: {
    actionId: string;
    assignee?: string | null;
  }
) {
  // Delete the Linear mapping using the service client to bypass RLS
  const serviceClient = getCarbonServiceClient();
  await serviceClient
    .from("externalIntegrationMapping")
    .delete()
    .eq("entityType", "nonConformanceActionTask")
    .eq("entityId", input.actionId)
    .eq("integration", "linear")
    .eq("companyId", companyId);

  // Return the nonConformanceId for the action task
  return client
    .from("nonConformanceActionTask")
    .select("nonConformanceId")
    .eq("companyId", companyId)
    .eq("id", input.actionId);
}

export const getLinearIssueFromExternalId = async (
  client: DatabaseQueryClient,
  companyId: string,
  actionId: string
) => {
  const { data: mapping } = await client
    .from("externalIntegrationMapping")
    .select("metadata")
    .eq("entityType", "nonConformanceActionTask")
    .eq("entityId", actionId)
    .eq("integration", "linear")
    .eq("companyId", companyId)
    .maybeSingle();

  if (!mapping) return null;

  const { data } = LinearIssueSchema.safeParse(mapping.metadata);

  if (!data) return null;

  return data;
};
