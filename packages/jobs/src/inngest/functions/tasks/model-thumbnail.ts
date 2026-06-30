import { getCarbonServiceRole } from "@carbon/auth/client.server";
import { CARBON_API_URL, CARBON_PUBLIC_KEY, VERCEL_URL } from "@carbon/env";
import { uploadObject } from "@carbon/object-storage/server";
import { inngest } from "../../client";

export const modelThumbnailFunction = inngest.createFunction(
  { id: "model-thumbnail", retries: 3 },
  { event: "carbon/model-thumbnail" },
  async ({ event, step }) => {
    const { modelId, companyId } = event.data;

    const isLocal =
      VERCEL_URL === undefined || VERCEL_URL.includes("localhost");

    const getModelUrl = (id: string) => {
      if (isLocal) return `http://localhost:3000/file/model/${id}`;
      const domain = VERCEL_URL?.startsWith("https://")
        ? VERCEL_URL
        : `https://${VERCEL_URL}`;
      return `${domain}/file/model/${id}`;
    };

    if (isLocal) {
      console.log("Skipping model-thumbnail task on local", {
        payload: event.data
      });
      return;
    }

    await step.run("generate-and-upload-thumbnail", async () => {
      console.log("Starting model-thumbnail task", { payload: event.data });
      const client = getCarbonServiceRole();

      const url = getModelUrl(modelId);
      const imageUrl = `${CARBON_API_URL}/functions/v1/thumbnail`;

      const response = await fetch(imageUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CARBON_PUBLIC_KEY}`
        },
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
        bucket: "private",
        key: thumbnailPath,
        body: await response.arrayBuffer(),
        contentType: "image/png"
      });

      const result = await client
        .from("modelUpload")
        .update({
          thumbnailPath
        })
        .eq("id", modelId);

      if (result.error) {
        console.error("Failed to update thumbnail path", {
          error: result.error
        });
      }
    });
  }
);
