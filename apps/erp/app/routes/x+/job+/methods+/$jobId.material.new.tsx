import { assertIsPost, error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import {
  jobMaterialValidator,
  recalculateJobMakeMethodRequirements,
  recalculateJobOperationDependencies,
  upsertJobMaterial,
  upsertJobMaterialMakeMethod
} from "~/modules/production";
import { setCustomFields } from "~/utils/form";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId, userId } = await requirePermissions(request, {
    create: "production"
  });

  const { jobId } = params;
  if (!jobId) {
    throw new Error("jobId not found");
  }

  const formData = await request.formData();
  const validation = await validator(jobMaterialValidator).validate(formData);

  if (validation.error) {
    return validationError(validation.error);
  }

  const job = await client
    .from("job")
    .select("id, status")
    .eq("id", jobId)
    .eq("companyId", companyId)
    .single();
  if (job.error) {
    return data(
      { id: null },
      await flash(request, error(job.error, "Job not found"))
    );
  }

  const insertJobMaterial = await upsertJobMaterial(client, {
    ...validation.data,
    jobId,
    companyId,
    createdBy: userId,
    customFields: setCustomFields(formData)
  });
  if (insertJobMaterial.error) {
    return data(
      {
        id: null
      },
      await flash(
        request,
        error(insertJobMaterial.error, "Failed to insert job material")
      )
    );
  }

  const jobMaterialId = insertJobMaterial.data?.id;
  if (!jobMaterialId) {
    return data(
      {
        id: null
      },
      await flash(
        request,
        error(insertJobMaterial, "Failed to insert job material")
      )
    );
  }

  const isReleased = !["Draft", "Planned"].includes(job.data?.status ?? "");

  if (validation.data.methodType === "Make to Order") {
    const materialMakeMethod = await client
      .from("jobMaterialWithMakeMethodId")
      .select("*")
      .eq("id", jobMaterialId)
      .eq("companyId", companyId)
      .single();
    if (materialMakeMethod.error) {
      return data(
        {
          id: null
        },
        await flash(
          request,
          error(materialMakeMethod.error, "Failed to get material make method")
        )
      );
    }
    const makeMethod = await upsertJobMaterialMakeMethod(client, {
      sourceId: validation.data.itemId,
      targetId: materialMakeMethod.data?.jobMaterialMakeMethodId!,
      companyId,
      userId
    });

    if (makeMethod.error) {
      return data(
        {
          id: jobMaterialId
        },
        await flash(
          request,
          error(makeMethod.error, "Failed to insert job material make method")
        )
      );
    }
  }

  // Recalculate for ALL material types if job is released
  if (isReleased) {
    const promises = [
      recalculateJobMakeMethodRequirements(client, {
        id: validation.data.jobMakeMethodId,
        companyId,
        userId
      })
    ];

    if (validation.data.jobOperationId) {
      promises.push(
        recalculateJobOperationDependencies(client, {
          jobId,
          companyId,
          userId
        })
      );
    }

    const [recalculateResult, recalculateDependencies] =
      await Promise.all(promises);

    if (recalculateResult.error) {
      return data(
        { id: jobMaterialId },
        await flash(
          request,
          error(
            recalculateResult.error,
            "Failed to recalculate job make method requirements"
          )
        )
      );
    }

    if (recalculateDependencies?.error) {
      return data(
        { id: jobMaterialId },
        await flash(
          request,
          error(
            recalculateDependencies.error,
            "Failed to recalculate job operation dependencies"
          )
        )
      );
    }
  }

  return {
    id: jobMaterialId,
    success: true,
    message: "Material created"
  };
}
