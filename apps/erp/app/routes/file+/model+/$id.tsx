import { notFound } from "@carbon/auth";
import { getCarbonServiceClient } from "@carbon/auth/client.server";
import { ModelViewer } from "@carbon/react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import {
  getModelAccessToken,
  isValidModelAccessToken,
  requireModelAccess
} from "~/utils/modelAccess.server";
import { getPublicModelUrl } from "~/utils/path";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const client = getCarbonServiceClient();
  const { id } = params;
  if (!id) throw notFound("id not found");

  const model = await client
    .from("modelUpload")
    .select("*")
    .eq("id", id)
    .single();
  if (!model.data) throw notFound("model not found");

  const { token } = await requireModelAccess(request, model.data.companyId);
  const modelAccessToken = isValidModelAccessToken(token)
    ? token
    : getModelAccessToken(request);
  const modelUrl = `${getPublicModelUrl(model.data.modelPath)}${
    isValidModelAccessToken(modelAccessToken)
      ? `?token=${encodeURIComponent(modelAccessToken!)}`
      : ""
  }`;

  return { model: model.data, modelUrl };
}

export default function ModelRoute() {
  const { model, modelUrl } = useLoaderData<typeof loader>();

  return (
    <div className="w-screen h-screen bg-white p-0 m-0">
      <ModelViewer
        mode="light"
        key={model.modelPath}
        file={null}
        url={modelUrl}
        withProperties={false}
      />
    </div>
  );
}
