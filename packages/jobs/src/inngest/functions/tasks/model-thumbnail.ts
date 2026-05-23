import {
  THUMBNAIL_SERVICE_TOKEN,
  THUMBNAIL_SERVICE_URL,
  VERCEL_URL
} from "@carbon/auth";
import { getCarbonServiceClient } from "@carbon/auth/client.server";
import { uploadObject } from "@carbon/storage";
import { inngest } from "../../client";

export const modelThumbnailFunction = inngest.createFunction(
  { id: "model-thumbnail", retries: 3 },
  { event: "carbon/model-thumbnail" },
  async ({ event, step }) => {
    const { modelId, companyId } = event.data;

    const isLocal =
      VERCEL_URL === undefined || VERCEL_URL.includes("localhost");

    const getModelUrl = (id: string) => {
      const token = THUMBNAIL_SERVICE_TOKEN
        ? `?token=${encodeURIComponent(THUMBNAIL_SERVICE_TOKEN)}`
        : "";
      if (isLocal) return `http://localhost:3000/file/model/${id}${token}`;
      const domain = VERCEL_URL?.startsWith("https://")
        ? VERCEL_URL
        : `https://${VERCEL_URL}`;
      return `${domain}/file/model/${id}${token}`;
    };

    if (isLocal) {
      console.log("Skipping model-thumbnail task on local", {
        payload: event.data
      });
      return;
    }

    await step.run("generate-and-upload-thumbnail", async () => {
      console.log("Starting model-thumbnail task", { payload: event.data });
      const client = getCarbonServiceClient();

      if (!THUMBNAIL_SERVICE_URL) {
        throw new Error("THUMBNAIL_SERVICE_URL is not set");
      }

      const model = await client
        .from("modelUpload")
        .select("id")
        .eq("id", modelId)
        .eq("companyId", companyId)
        .single();

      if (model.error || !model.data) {
        console.warn("Skipping model-thumbnail task for missing model", {
          modelId,
          companyId,
          error: model.error
        });
        return;
      }

      const url = getModelUrl(modelId);

      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };

      if (THUMBNAIL_SERVICE_TOKEN) {
        headers.Authorization = `Bearer ${THUMBNAIL_SERVICE_TOKEN}`;
      }

      const response = await fetch(THUMBNAIL_SERVICE_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ url })
      });

      if (response.status !== 200) {
        console.log("Failed to generate thumbnail", { response });
        throw new Error("Failed to generate thumbnail");
      }

      const fileName = `${modelId}.png`;
      const thumbnailPath = `${companyId}/thumbnails/${modelId}/${fileName}`;

      console.log("Uploading thumbnail", { fileName });

      await uploadObject({
        companyId,
        key: thumbnailPath,
        body: new Uint8Array(await response.arrayBuffer()),
        contentType: "image/png"
      });

      const result = await client
        .from("modelUpload")
        .update({
          thumbnailPath
        })
        .eq("id", modelId)
        .eq("companyId", companyId);

      if (result.error) {
        console.error("Failed to update thumbnail path", {
          error: result.error
        });
      }
    });
  }
);
