import { assertIsPost, error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { recalculateJobOperationDependencies } from "~/modules/production";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "production"
  });

  const formData = await request.formData();
  const updateMap = formData.get("updates") as string;

  const { jobId } = params;
  if (!jobId) {
    return data(
      {},
      await flash(request, error(null, "Failed to receive a job id"))
    );
  }

  if (!updateMap) {
    return data(
      {},
      await flash(request, error(null, "Failed to receive a new sort order"))
    );
  }

  const updates = Object.entries(JSON.parse(updateMap)).map(
    ([id, orderString]) => ({
      id,
      order: Number(orderString),
      updatedBy: userId
    })
  );

  const updateSortOrders = await Promise.all(
    updates.map(({ id, order, updatedBy }) =>
      client
        .from("jobOperation")
        .update({ order, updatedBy })
        .eq("id", id)
        .eq("jobId", jobId)
        .eq("companyId", companyId)
    )
  );
  if (updateSortOrders.some((update) => update.error))
    return data(
      {},
      await flash(
        request,
        error(updateSortOrders, "Failed to update sort order")
      )
    );

  if (jobId) {
    const recalculateDependencies = await recalculateJobOperationDependencies(
      client,
      {
        jobId: jobId,
        companyId: companyId,
        userId: userId
      }
    );
    if (recalculateDependencies.error)
      return data(
        {},
        await flash(
          request,
          error(recalculateDependencies, "Failed to recalculate dependencies")
        )
      );
  } else {
    return data(
      {},
      await flash(
        request,
        error(null, "Failed to receive a job id to recalculate dependencies")
      )
    );
  }

  return null;
}
