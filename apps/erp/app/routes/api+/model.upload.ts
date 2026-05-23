// import { error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { trigger } from "@carbon/jobs";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "parts"
  });

  const formData = await request.formData();
  const modelId = formData.get("modelId") as string;
  const name = formData.get("name") as string;
  const modelPath = formData.get("modelPath") as string;
  const size = parseInt(formData.get("size") as string);

  const itemId = formData.get("itemId") as string | null;
  const salesRfqLineId = formData.get("salesRfqLineId") as string | null;
  const quoteLineId = formData.get("quoteLineId") as string | null;
  const salesOrderLineId = formData.get("salesOrderLineId") as string | null;
  const jobId = formData.get("jobId") as string | null;

  if (!modelId) {
    throw new Error("File ID is required");
  }
  if (!name) {
    throw new Error("Name is required");
  }
  if (!modelPath) {
    throw new Error("Model path is required");
  }
  if (!modelPath.startsWith(`${companyId}/models/`)) {
    throw new Error("Model path must belong to the current company");
  }

  const modelRecord = await client.from("modelUpload").insert({
    id: modelId,
    modelPath,
    name,
    size,
    companyId,
    createdBy: userId
  });

  if (modelRecord.error) {
    throw new Error("Failed to record upload: " + modelRecord.error.message);
  }

  if (itemId) {
    await client
      .from("item")
      .update({ modelUploadId: modelId })
      .eq("id", itemId)
      .eq("companyId", companyId);
  }
  if (salesRfqLineId) {
    await client
      .from("salesRfqLine")
      .update({ modelUploadId: modelId })
      .eq("id", salesRfqLineId)
      .eq("companyId", companyId);
  }
  if (quoteLineId) {
    await client
      .from("quoteLine")
      .update({ modelUploadId: modelId })
      .eq("id", quoteLineId)
      .eq("companyId", companyId);
  }
  if (salesOrderLineId) {
    await client
      .from("salesOrderLine")
      .update({ modelUploadId: modelId })
      .eq("id", salesOrderLineId)
      .eq("companyId", companyId);
  }
  if (jobId) {
    await client
      .from("job")
      .update({ modelUploadId: modelId })
      .eq("id", jobId)
      .eq("companyId", companyId);
  }

  await trigger("model-thumbnail", {
    companyId,
    modelId
  });

  return {
    success: true
  };
}
