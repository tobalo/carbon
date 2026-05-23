import { error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { recalculateJobRequirements } from "~/modules/production";
import { path, requestReferrer } from "~/utils/path";

export async function action({ request, params }: ActionFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "production",
    role: "employee"
  });
  const { jobId } = params;
  if (!jobId) throw new Error("Could not find jobId");

  const job = await client
    .from("job")
    .select("id")
    .eq("id", jobId)
    .eq("companyId", companyId)
    .single();
  if (job.error) {
    throw redirect(
      requestReferrer(request) ?? path.to.job(jobId),
      await flash(request, error(job.error, "Job not found"))
    );
  }

  const recalculate = await recalculateJobRequirements(client, {
    id: jobId,
    companyId,
    userId
  });
  if (recalculate.error) {
    throw redirect(
      requestReferrer(request) ?? path.to.job(jobId),
      await flash(
        request,
        error(recalculate.error, "Failed to recalculate job requirements")
      )
    );
  }

  throw redirect(
    requestReferrer(request) ?? path.to.job(jobId),
    await flash(request, success("Updated job"))
  );
}
