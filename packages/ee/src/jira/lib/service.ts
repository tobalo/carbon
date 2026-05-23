import { getCarbonServiceClient } from "@carbon/auth/client.server";
import type { DatabaseQueryClient } from "@carbon/database/query-client";
import { adfToTiptap } from "./richtext";
import type { JiraCredentials, JiraIssue, JiraIssueMapping } from "./types";
import { JiraIssueMappingSchema } from "./types";
import { mapJiraStatusToCarbonStatus } from "./utils";

/**
 * Get the Jira integration for a company.
 */
export async function getJiraIntegration(
  client: DatabaseQueryClient,
  companyId: string
) {
  return await client
    .from("companyIntegration")
    .select("*")
    .eq("companyId", companyId)
    .eq("id", "jira")
    .eq("active", true)
    .limit(1);
}

/**
 * Update Jira credentials in the integration metadata.
 */
export async function updateJiraCredentials(
  client: DatabaseQueryClient,
  companyId: string,
  credentials: JiraCredentials
) {
  const { data: current } = await getJiraIntegration(client, companyId);
  const integration = current?.[0];

  if (!integration) {
    throw new Error("Jira integration not found");
  }

  const metadata = integration.metadata as Record<string, any>;

  return await client
    .from("companyIntegration")
    .update({
      metadata: {
        ...metadata,
        credentials
      } as any
    })
    .eq("companyId", companyId)
    .eq("id", "jira")
    .eq("active", true);
}

/**
 * Convert a Jira issue to the mapping format for storage.
 */
export function issueToMapping(
  issue: JiraIssue,
  siteUrl: string
): JiraIssueMapping {
  return {
    id: issue.id,
    key: issue.key,
    summary: issue.fields.summary,
    url: `${siteUrl}/browse/${issue.key}`,
    status: {
      name: issue.fields.status.name,
      category: issue.fields.status.statusCategory.key
    },
    assignee: issue.fields.assignee
      ? {
          emailAddress: issue.fields.assignee.emailAddress,
          displayName: issue.fields.assignee.displayName
        }
      : null
  };
}

/**
 * Link an action task to a Jira issue.
 */
export async function linkActionToJiraIssue(
  client: DatabaseQueryClient,
  companyId: string,
  input: {
    actionId: string;
    issue: JiraIssue;
    siteUrl: string;
    assignee?: string | null;
    syncNotes?: boolean;
  }
) {
  const mapping = issueToMapping(input.issue, input.siteUrl);

  // Convert Jira description (ADF) to Tiptap format for notes
  let notes: any = undefined;
  if (input.syncNotes && input.issue.fields.description) {
    try {
      notes = adfToTiptap(input.issue.fields.description);
    } catch (e) {
      console.error("Failed to convert Jira description to Tiptap:", e);
    }
  }

  const updateData: Record<string, any> = {
    assignee: input.assignee,
    status: mapJiraStatusToCarbonStatus(
      input.issue.fields.status.statusCategory.key
    ),
    dueDate: input.issue.fields.duedate
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

  // Delete any existing Jira mapping for this action
  // Use the service client to bypass RLS (no DELETE policy for authenticated users)
  const serviceClientForLink = getCarbonServiceClient();
  await serviceClientForLink
    .from("externalIntegrationMapping")
    .delete()
    .eq("entityType", "nonConformanceActionTask")
    .eq("entityId", input.actionId)
    .eq("integration", "jira")
    .eq("companyId", companyId);

  // Create the new mapping
  await client.from("externalIntegrationMapping").insert({
    entityType: "nonConformanceActionTask",
    entityId: input.actionId,
    integration: "jira",
    externalId: input.issue.id,
    metadata: mapping as any,
    companyId
  });

  return result;
}

/**
 * Unlink an action task from a Jira issue.
 */
export async function unlinkActionFromJiraIssue(
  client: DatabaseQueryClient,
  companyId: string,
  input: {
    actionId: string;
    assignee?: string | null;
  }
) {
  // Delete the Jira mapping using the service client to bypass RLS
  const serviceClient = getCarbonServiceClient();
  await serviceClient
    .from("externalIntegrationMapping")
    .delete()
    .eq("entityType", "nonConformanceActionTask")
    .eq("entityId", input.actionId)
    .eq("integration", "jira")
    .eq("companyId", companyId);

  // Return the nonConformanceId for the action task
  return client
    .from("nonConformanceActionTask")
    .select("nonConformanceId")
    .eq("companyId", companyId)
    .eq("id", input.actionId);
}

/**
 * Get Jira issue metadata from the external integration mapping.
 */
export const getJiraIssueFromExternalId = async (
  client: DatabaseQueryClient,
  companyId: string,
  actionId: string
): Promise<JiraIssueMapping | null> => {
  const { data: mapping } = await client
    .from("externalIntegrationMapping")
    .select("metadata")
    .eq("entityType", "nonConformanceActionTask")
    .eq("entityId", actionId)
    .eq("integration", "jira")
    .eq("companyId", companyId)
    .maybeSingle();

  if (!mapping) return null;

  const { data } = JiraIssueMappingSchema.safeParse(mapping.metadata);

  if (!data) return null;

  return data;
};

/**
 * Get employees that match email addresses.
 */
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

/**
 * Update the cached Jira issue metadata in the mapping.
 */
export async function updateJiraIssueMapping(
  client: DatabaseQueryClient,
  companyId: string,
  actionId: string,
  mapping: JiraIssueMapping
) {
  return await client
    .from("externalIntegrationMapping")
    .update({ metadata: mapping as any })
    .eq("entityType", "nonConformanceActionTask")
    .eq("entityId", actionId)
    .eq("integration", "jira")
    .eq("companyId", companyId);
}
