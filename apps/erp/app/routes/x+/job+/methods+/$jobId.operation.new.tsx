import { assertIsPost, error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import {
  jobOperationValidator,
  recalculateJobMakeMethodRequirements,
  recalculateJobOperationDependencies,
  upsertJobOperation
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
  const validation = await validator(jobOperationValidator).validate(formData);

  if (validation.error) {
    return validationError(validation.error);
  }

  const job = await client
    .from("job")
    .select("id")
    .eq("id", jobId)
    .eq("companyId", companyId)
    .single();
  if (job.error) {
    return data(
      { id: null },
      await flash(request, error(job.error, "Job not found"))
    );
  }

  const insertJobOperation = await upsertJobOperation(client, {
    ...validation.data,
    jobId,
    companyId,
    createdBy: userId,
    customFields: setCustomFields(formData)
  });
  if (insertJobOperation.error) {
    return data(
      {
        id: null
      },
      await flash(
        request,
        error(insertJobOperation.error, "Failed to insert job operation")
      )
    );
  }

  const jobOperationId = insertJobOperation.data?.id;
  if (!jobOperationId) {
    return data(
      {
        id: null
      },
      await flash(
        request,
        error(insertJobOperation, "Failed to insert job operation")
      )
    );
  }

  const [recalculateResult, recalculateDependencies] = await Promise.all([
    recalculateJobMakeMethodRequirements(client, {
      id: validation.data.jobMakeMethodId,
      companyId,
      userId
    }),
    recalculateJobOperationDependencies(client, {
      jobId,
      companyId,
      userId
    })
  ]);

  if (recalculateResult.error) {
    return data(
      { id: jobOperationId },
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
      { id: jobOperationId },
      await flash(
        request,
        error(
          recalculateDependencies.error,
          "Failed to recalculate job operation dependencies"
        )
      )
    );
  }

  return {
    id: jobOperationId,
    success: true,
    message: "Operation created"
  };
}
