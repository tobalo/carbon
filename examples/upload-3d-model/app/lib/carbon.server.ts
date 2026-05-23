import {
  getServiceDatabaseQueryClient,
  type DatabaseQueryClient,
  type QueryError
} from "@carbon/database/query-client";
import { uploadObject } from "@carbon/storage";
import {
  CARBON_APP_URL,
  CARBON_COMPANY_ID
} from "~/config";

class CarbonClient {
  private readonly appUrl: string = CARBON_APP_URL;
  private readonly client: DatabaseQueryClient;
  private readonly companyId: string = CARBON_COMPANY_ID;

  constructor() {
    this.client = getServiceDatabaseQueryClient();
  }

  private getPublicModelUrl(path: string) {
    return `${this.appUrl}/file/model/public/${path}`;
  }

  async uploadModel(
    file: File
  ): Promise<{ data: ModelUpload | null; error: QueryError | null }> {
    const { nanoid } = await import("nanoid");

    const modelId = nanoid();
    const fileExtension = file.name.split(".").pop();
    const fileName = `${this.companyId}/models/${modelId}.${fileExtension}`;

    const [fileUpload, recordInsert] = await Promise.all([
      uploadPrivateFile({
        companyId: this.companyId,
        key: fileName,
        file,
        contentType: file.type
      }),
      this.client.from("modelUpload").insert({
        id: modelId,
        modelPath: fileName,
        size: file.size,
        name: file.name,
        companyId: this.companyId,
        createdBy: "system"
      })
    ]);

    if (fileUpload.error) {
      return {
        data: null,
        error: fileUpload.error as unknown as QueryError
      };
    }

    if (recordInsert.error) {
      return {
        data: null,
        error: recordInsert.error as QueryError
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

    const thumbnailUpload = await uploadPrivateFile({
      companyId: this.companyId,
      key: thumbnailPath,
      file,
      contentType: "image/png"
    });

    if (thumbnailUpload.error) {
      return {
        data: null,
        error: thumbnailUpload.error as unknown as QueryError
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

async function uploadPrivateFile(args: {
  companyId: string;
  key: string;
  file: File;
  contentType?: string;
}): Promise<{ data: { path: string } | null; error: QueryError | null }> {
  try {
    await uploadObject({
      companyId: args.companyId,
      key: args.key,
      body: new Uint8Array(await args.file.arrayBuffer()),
      contentType: args.contentType
    });
    return { data: { path: args.key }, error: null };
  } catch (error) {
    return { data: null, error: toQueryError(error) };
  }
}

function toQueryError(error: unknown): QueryError {
  if (error instanceof Error) {
    return { message: error.message, name: error.name };
  }
  return { message: String(error) };
}

export type ModelUpload = {
  id: string;
  name: string;
  extension: string;
  url: string;
};
