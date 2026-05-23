import { requirePermissions } from "@carbon/auth/auth.server";
import type { LoaderFunctionArgs } from "react-router";
import { fetchJobStepRecords } from "~/modules/inventory/lineage.server";
import type { StepRecord } from "~/modules/inventory/ui/Traceability/utils";

export async function loader({ request }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    view: "inventory",
    bypassRls: true
  });

  const url = new URL(request.url);
  const activityId = url.searchParams.get("activityId");

  if (!activityId) {
    return Response.json({ stepRecords: [] as StepRecord[] });
  }

  const activityRes = await client
    .from("trackedActivity")
    .select("attributes")
    .eq("id", activityId)
    .eq("companyId", companyId)
    .maybeSingle();

  const jobId = (activityRes.data?.attributes as Record<string, unknown> | null)
    ?.Job;

  if (typeof jobId !== "string" || !jobId) {
    return Response.json({ stepRecords: [] as StepRecord[] });
  }

  const stepRecords = await fetchJobStepRecords(client, jobId, companyId);
  return Response.json({ stepRecords });
}
