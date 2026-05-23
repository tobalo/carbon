import { assertIsPost, error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { recalculateJobOperationDependencies } from "~/modules/production";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId, userId } = await requirePermissions(request, {
    delete: "production"
  });

  const { id, jobId } = params;
  if (!id) {
    throw new Error("id not found");
  }

  if (!jobId) {
    throw new Error("jobId not found");
  }

  const deleteMaterial = await client
    .from("jobMaterial")
    .delete()
    .eq("id", id)
    .eq("jobId", jobId)
    .eq("companyId", companyId);
  if (deleteMaterial.error) {
    return data(
      {
        id: null
      },
      await flash(
        request,
        error(deleteMaterial.error, "Failed to delete job material")
      )
    );
  }

  const recalculateResult = await recalculateJobOperationDependencies(
    client,
    {
      jobId,
      companyId,
      userId
    }
  );

  if (recalculateResult?.error) {
    return data(
      {
        success: false,
        error: "Failed to recalculate job operation dependencies"
      },
      { status: 400 }
    );
  }

  return {};
}
