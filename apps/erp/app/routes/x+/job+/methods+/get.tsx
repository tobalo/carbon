import { requirePermissions } from "@carbon/auth/auth.server";
import { validationError, validator } from "@carbon/form";
import type { ActionFunctionArgs } from "react-router";
import { data, redirect } from "react-router";
import {
  getJobMethodValidator,
  recalculateJobOperationDependencies,
  recalculateJobRequirements,
  upsertJobMaterialMakeMethod,
  upsertJobMethod
} from "~/modules/production";
import { path, requestReferrer } from "~/utils/path";

export async function action({ request }: ActionFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "production"
  });

  const formData = await request.formData();
  const type = formData.get("type") as string;
  const configurationStr = formData.get("configuration") as string | null;
  const configuration = configurationStr
    ? JSON.parse(configurationStr)
    : undefined;

  const validation = await validator(getJobMethodValidator).validate(formData);
  if (validation.error) {
    return validationError(validation.error);
  }

  if (["item", "quoteLine"].includes(type)) {
    const targetJob = await client
      .from("job")
      .select("id")
      .eq("id", validation.data.targetId)
      .eq("companyId", companyId)
      .single();
    if (targetJob.error) {
      return data({ error: "Target job not found" }, { status: 404 });
    }

    if (type === "item") {
      const sourceItem = await client
        .from("item")
        .select("id")
        .eq("id", validation.data.sourceId)
        .eq("companyId", companyId)
        .single();
      if (sourceItem.error) {
        return data({ error: "Source item not found" }, { status: 404 });
      }
    } else {
      const sourceQuoteLine = await client
        .from("quoteLine")
        .select("id")
        .eq("id", validation.data.sourceId)
        .eq("companyId", companyId)
        .single();
      if (sourceQuoteLine.error) {
        return data({ error: "Source quote line not found" }, { status: 404 });
      }
    }

    const jobMethodPayload: any = {
      ...validation.data,
      companyId,
      userId,
      parts: {
        billOfMaterial: validation.data.billOfMaterial,
        billOfProcess: validation.data.billOfProcess,
        parameters: validation.data.parameters,
        tools: validation.data.tools,
        steps: validation.data.steps,
        workInstructions: validation.data.workInstructions
      }
    };

    // Only add configuration if it exists
    if (configuration !== undefined && type === "item") {
      jobMethodPayload.configuration = configuration;
    }

    const jobMethod = await upsertJobMethod(
      client,
      type === "item" ? "itemToJob" : "quoteLineToJob",
      jobMethodPayload
    );

    const [calculateQuantities, calculateDependencies] = await Promise.all([
      recalculateJobRequirements(client, {
        id: validation.data.targetId,
        companyId: companyId,
        userId: userId
      }),
      recalculateJobOperationDependencies(client, {
        jobId: validation.data.targetId,
        companyId: companyId,
        userId: userId
      })
    ]);

    if (calculateQuantities.error) {
      return {
        error: "Failed to calculate job quantities"
      };
    }

    if (calculateDependencies.error) {
      return {
        error: "Failed to calculate job dependencies"
      };
    }

    return {
      error: jobMethod.error ? "Failed to get job method" : null
    };
  }

  if (type === "method") {
    const targetMethod = await client
      .from("jobMakeMethod")
      .select("id")
      .eq("id", validation.data.targetId)
      .eq("companyId", companyId)
      .single();
    if (targetMethod.error) {
      return data({ error: "Target job method not found" }, { status: 404 });
    }

    const sourceItem = await client
      .from("item")
      .select("id")
      .eq("id", validation.data.sourceId)
      .eq("companyId", companyId)
      .single();
    if (sourceItem.error) {
      return data({ error: "Source item not found" }, { status: 404 });
    }

    const makeMethodPayload: any = {
      ...validation.data,
      companyId,
      userId,
      parts: {
        billOfMaterial: validation.data.billOfMaterial,
        billOfProcess: validation.data.billOfProcess,
        parameters: validation.data.parameters,
        tools: validation.data.tools,
        steps: validation.data.steps,
        workInstructions: validation.data.workInstructions
      }
    };

    // Only add configuration if it exists
    if (configuration !== undefined) {
      makeMethodPayload.configuration = configuration;
    }

    const makeMethod = await upsertJobMaterialMakeMethod(
      client,
      makeMethodPayload
    );

    if (makeMethod.error) {
      return {
        error: makeMethod.error
          ? "Failed to update method from job method"
          : null
      };
    }

    throw redirect(requestReferrer(request) ?? path.to.jobs);
  }

  return data({ error: "Invalid type" }, { status: 400 });
}
