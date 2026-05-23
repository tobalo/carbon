import { getCarbonServiceClient } from "@carbon/auth/client.server";
import { syncIssueFromJiraSchema, trigger } from "@carbon/jobs";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { getIntegration } from "../../modules/settings";
import { verifyIntegrationWebhookSignature } from "../../modules/settings/settings.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { companyId } = params;
  if (!companyId) {
    return data({ success: false }, { status: 400 });
  }

  return {
    success: true
  };
}
export async function action({ request, params }: ActionFunctionArgs) {
  const { companyId } = params;

  if (!companyId) {
    return data({ success: false }, { status: 400 });
  }

  const serviceClient = getCarbonServiceClient();

  const integration = await getIntegration(serviceClient, "jira", companyId);

  if (integration.error) {
    return data(
      { success: false, error: "Integration query failed" },
      { status: 400 }
    );
  }

  if (!integration.data) {
    return data(
      { success: false, error: "Integration not configured" },
      { status: 400 }
    );
  }

  if (!integration.data.active) {
    return data(
      { success: false, error: "Integration not active" },
      { status: 400 }
    );
  }

  const bodyText = await request.text();
  if (
    !verifyIntegrationWebhookSignature(
      request,
      integration.data.metadata,
      bodyText
    )
  ) {
    return data(
      { success: false, error: "Invalid webhook signature" },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return data({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = syncIssueFromJiraSchema.safeParse({
    companyId,
    event: body
  });

  if (!parsed.success) {
    return data(
      { success: false, error: parsed.error.format() },
      { status: 400 }
    );
  }

  try {
    await trigger("sync-issue-from-jira", parsed.data);
    return { success: true };
  } catch (err) {
    console.error(err);
    return data({ success: false }, { status: 500 });
  }
}
