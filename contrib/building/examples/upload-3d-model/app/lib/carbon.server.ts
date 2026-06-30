import { uploadObject } from "@carbon/object-storage/server";
import {
  CARBON_API_KEY,
  CARBON_API_URL,
  CARBON_APP_URL,
  CARBON_COMPANY_ID,
  CARBON_PUBLIC_KEY
} from "~/config";
import {
  createPostgrestClient,
  type PostgrestClient,
  type PostgrestError
} from "./postgrest-client";

const storageError = (error: unknown): PostgrestError => ({
  code: "STORAGE_ERROR",
  details: "",
  hint: "",
  message: error instanceof Error ? error.message : String(error),
  name: "StorageError"
});

class CarbonClient {
  private readonly appUrl: string = CARBON_APP_URL;
  private readonly client: PostgrestClient;
  private readonly companyId: string = CARBON_COMPANY_ID;
  constructor() {
    this.client = createPostgrestClient({
      apiUrl: CARBON_API_URL,
      carbonKey: CARBON_API_KEY,
      publicKey: CARBON_PUBLIC_KEY
    });
  }

  private getPublicModelUrl(path: string) {
    return `${this.appUrl}/file/model/public/${path}`;
  }

  async uploadModel(
    file: File
  ): Promise<
    { data: ModelUpload; error: null } | { data: null; error: PostgrestError }
  > {
    const { nanoid } = await import("nanoid");

    const modelId = nanoid();
    const fileExtension = file.name.split(".").pop();
    const fileName = `${this.companyId}/models/${modelId}.${fileExtension}`;

    try {
      await uploadObject({
        bucket: "private",
        key: fileName,
        body: file
      });
    } catch (error) {
      return {
        data: null,
        error: storageError(error)
      };
    }

    const recordInsert = await this.client.from("modelUpload").insert({
      id: modelId,
      modelPath: fileName,
      size: file.size,
      name: file.name,
      companyId: this.companyId,
      createdBy: "system"
    });

    if (recordInsert.error) {
      return {
        data: null,
        error: recordInsert.error
      };
    }

    return {
      data: {
        id: modelId,
        name: file.name,
        extension: fileExtension!,
        url: this.getPublicModelUrl(fileName)
      },
      error: null
    };
  }

  async uploadThumbnail(file: File, modelId: string) {
    const { nanoid } = await import("nanoid");

    const thumbnailId = nanoid();
    const thumbnailPath = `${this.companyId}/thumbnails/${thumbnailId}.png`;

    try {
      await uploadObject({
        bucket: "private",
        key: thumbnailPath,
        body: file,
        contentType: "image/png"
      });
    } catch (error) {
      return {
        data: null,
        error: storageError(error)
      };
    }

    const updateModel = await this.client
      .from("modelUpload")
      .update({ thumbnailPath })
      .eq("id", modelId);
    if (updateModel.error) {
      return updateModel;
    }

    return {
      data: {
        id: thumbnailId
      },
      error: null
    };
  }
}

const carbon = new CarbonClient();

export { carbon };

export type ModelUpload = {
  id: string;
  name: string;
  extension: string;
  url: string;
};
