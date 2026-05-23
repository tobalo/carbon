import { invokeFunction } from "@carbon/auth/functions.server";
import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  jobStatus,
  recalculateJobRequirements,
  runMRP,
  updateJobStatus
} from "~/modules/production";
import { path, requestReferrer } from "~/utils/path";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "production"
  });

  const { jobId: id } = params;
  if (!id) throw new Error("Could not find id");

  const url = new URL(request.url);
  const shouldSchedule = url.searchParams.get("schedule") === "1";

  const formData = await request.formData();
  const status = formData.get("status") as (typeof jobStatus)[number];
  const selectedPurchaseOrdersBySupplierId = formData.get(
    "selectedPurchaseOrdersBySupplierId"
  ) as string | null;

  if (!status || !jobStatus.includes(status)) {
    throw redirect(
      path.to.job(id),
      await flash(request, error(null, "Invalid status"))
    );
  }

  if (status === "Ready") {
    const { data: job } = await client
      .from("job")
      .select("itemId")
      .eq("id", id)
      .eq("companyId", companyId)
      .single();
    const replenishment = job?.itemId
      ? await client
          .from("itemReplenishment")
          .select("manufacturingBlocked")
          .eq("itemId", job.itemId)
          .eq("companyId", companyId)
          .single()
      : { data: null };

    if (replenishment.data?.manufacturingBlocked) {
      throw redirect(
        requestReferrer(request) ?? path.to.job(id),
        await flash(request, error(null, "Manufacturing is blocked"))
      );
    }
  }

  if (["Planned", "Ready"].includes(status)) {
    await recalculateJobRequirements(client, {
      id,
      companyId,
      userId
    });
    await runMRP(client, {
      type: "job",
      id,
      companyId,
      userId
    });
  }

  if (["Ready", "Planned"].includes(status) && shouldSchedule) {
    try {
      const purchaseOrdersBySupplierId = JSON.parse(
        selectedPurchaseOrdersBySupplierId ?? "{}"
      );

      const [scheduler] = await Promise.all([
        invokeFunction("schedule", {
          body: {
            jobId: id,
            companyId,
            userId,
            mode: "initial",
            direction: "backward"
          },
        }),
        invokeFunction("create", {
          body: {
            type: "purchaseOrderFromJob",
            jobId: id,
            purchaseOrdersBySupplierId,
            companyId,
            userId
          },
        })
      ]);

      if (scheduler.error) {
        throw redirect(
          requestReferrer(request) ?? path.to.job(id),
          await flash(request, error(scheduler.error, "Failed to schedule job"))
        );
      }

      if (status === "Ready") {
        await client
          .from("job")
          .update({
            releasedDate: new Date().toISOString()
          })
          .eq("id", id)
          .eq("companyId", companyId);
      }
    } catch (err) {
      console.error(err);
      throw redirect(
        requestReferrer(request) ?? path.to.job(id),
        await flash(request, error(err, "Failed to schedule job"))
      );
    }
  }

  const update = await updateJobStatus(client, {
    id,
    status,
    assignee: ["Cancelled"].includes(status) ? null : undefined,
    updatedBy: userId,
    companyId
  });
  if (update.error) {
    throw redirect(
      requestReferrer(request) ?? path.to.job(id),
      await flash(request, error(update.error, "Failed to update job status"))
    );
  }

  if (status === "Closed") {
    await invokeFunction("close-job", {
      body: { jobId: id, userId, companyId }
    });
  }

  if (status === "Planned") {
    throw redirect(
      path.to.jobMaterials(id),
      await flash(request, success("Job marked as planned"))
    );
  }

  throw redirect(
    requestReferrer(request) ?? path.to.job(id),
    await flash(request, success("Updated job status"))
  );
}
