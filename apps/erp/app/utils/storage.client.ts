import { path } from "~/utils/path";

type StorageError = {
  message: string;
};

type StorageResult<T> =
  | {
      data: T;
      error: null;
    }
  | {
      data: null;
      error: StorageError;
    };

type UploadOptions = {
  permission: string;
  access?: "create" | "update";
  cacheControl?: string;
  contentType?: string;
};

type RemoveOptions = {
  permission: string;
};

type MoveOptions = {
  sourcePermission: string;
  destinationPermission: string;
};

type AuthenticatedUploadOptions = {
  bucket?: "avatars" | "feedback" | "private";
  cacheControl?: string;
  contentType?: string;
};

const parseStorageResponse = async <T>(
  response: Response
): Promise<StorageResult<T>> => {
  const payload = (await response
    .json()
    .catch(() => null)) as StorageResult<T> | null;

  if (!response.ok) {
    return {
      data: null,
      error: {
        message: payload?.error?.message ?? "Storage request failed"
      }
    };
  }

  if (!payload) {
    return {
      data: null,
      error: { message: "Storage response was empty" }
    };
  }

  return payload;
};

const storageHeaders = (
  action: "upload" | "remove",
  permission: string,
  access?: UploadOptions["access"]
) => ({
  "x-carbon-storage-action": action,
  "x-carbon-storage-permission": permission,
  ...(access ? { "x-carbon-storage-access": access } : {})
});

const moveStorageHeaders = (options: MoveOptions) => ({
  "x-carbon-storage-action": "move",
  "x-carbon-storage-permission": options.destinationPermission,
  "x-carbon-storage-source-permission": options.sourcePermission,
  "x-carbon-storage-destination-permission": options.destinationPermission
});

const authenticatedStorageHeaders = {
  "x-carbon-storage-action": "upload",
  "x-carbon-storage-auth": "authenticated"
};

export const uploadPrivateFile = async (
  storagePath: string,
  file: File,
  options: UploadOptions
) => {
  const formData = new FormData();
  formData.append("intent", "upload");
  formData.append("bucket", "private");
  formData.append("path", storagePath);
  formData.append("file", file);
  if (options.cacheControl) {
    formData.append("cacheControl", options.cacheControl);
  }
  if (options.contentType) {
    formData.append("contentType", options.contentType);
  }

  return parseStorageResponse<{ path: string }>(
    await fetch(path.to.api.storage, {
      method: "POST",
      headers: storageHeaders("upload", options.permission, options.access),
      body: formData
    })
  );
};

export const uploadAuthenticatedFile = async (
  storagePath: string,
  file: File,
  options: AuthenticatedUploadOptions = {}
) => {
  const formData = new FormData();
  formData.append("intent", "upload");
  formData.append("bucket", options.bucket ?? "private");
  formData.append("path", storagePath);
  formData.append("file", file);
  if (options.cacheControl) {
    formData.append("cacheControl", options.cacheControl);
  }
  if (options.contentType) {
    formData.append("contentType", options.contentType);
  }

  return parseStorageResponse<{ path: string }>(
    await fetch(path.to.api.storage, {
      method: "POST",
      headers: authenticatedStorageHeaders,
      body: formData
    })
  );
};

export const removePrivateFiles = async (
  storagePaths: string[],
  options: RemoveOptions
) => {
  const formData = new FormData();
  formData.append("intent", "remove");
  formData.append("bucket", "private");
  formData.append("paths", JSON.stringify(storagePaths));

  return parseStorageResponse<null>(
    await fetch(path.to.api.storage, {
      method: "POST",
      headers: storageHeaders("remove", options.permission),
      body: formData
    })
  );
};

export const uploadPublicFile = async (
  storagePath: string,
  file: File,
  options: UploadOptions
) => {
  const formData = new FormData();
  formData.append("intent", "upload");
  formData.append("bucket", "public");
  formData.append("path", storagePath);
  formData.append("file", file);
  if (options.cacheControl) {
    formData.append("cacheControl", options.cacheControl);
  }
  if (options.contentType) {
    formData.append("contentType", options.contentType);
  }

  return parseStorageResponse<{ path: string }>(
    await fetch(path.to.api.storage, {
      method: "POST",
      headers: storageHeaders("upload", options.permission, options.access),
      body: formData
    })
  );
};

export const removePublicFiles = async (
  storagePaths: string[],
  options: RemoveOptions
) => {
  const formData = new FormData();
  formData.append("intent", "remove");
  formData.append("bucket", "public");
  formData.append("paths", JSON.stringify(storagePaths));

  return parseStorageResponse<null>(
    await fetch(path.to.api.storage, {
      method: "POST",
      headers: storageHeaders("remove", options.permission),
      body: formData
    })
  );
};

export const removeAuthenticatedFiles = async (
  storagePaths: string[],
  options: { bucket: "avatars" }
) => {
  const formData = new FormData();
  formData.append("intent", "remove");
  formData.append("bucket", options.bucket);
  formData.append("paths", JSON.stringify(storagePaths));

  return parseStorageResponse<null>(
    await fetch(path.to.api.storage, {
      method: "POST",
      headers: {
        ...authenticatedStorageHeaders,
        "x-carbon-storage-action": "remove"
      },
      body: formData
    })
  );
};

export const movePrivateFile = async (
  sourcePath: string,
  destinationPath: string,
  options: MoveOptions
) => {
  const formData = new FormData();
  formData.append("intent", "move");
  formData.append("bucket", "private");
  formData.append("sourcePath", sourcePath);
  formData.append("destinationPath", destinationPath);

  return parseStorageResponse<{ path: string }>(
    await fetch(path.to.api.storage, {
      method: "POST",
      headers: moveStorageHeaders(options),
      body: formData
    })
  );
};
