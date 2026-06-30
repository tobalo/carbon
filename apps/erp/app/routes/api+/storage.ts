import { requirePermissions } from "@carbon/auth/auth.server";
import {
  moveObject,
  removeObjects,
  uploadObject
} from "@carbon/object-storage/server";
import type { ActionFunctionArgs } from "react-router";

type StorageMutationAction = "upload" | "remove" | "move";
type StorageAuthMode = "permission" | "authenticated";
type StorageUploadAccess = "create" | "update";

const badRequest = (message: string) =>
  Response.json({ data: null, error: { message } }, { status: 400 });

const forbidden = (message: string) =>
  Response.json({ data: null, error: { message } }, { status: 403 });

const storageNamespacePermissions: Record<string, string[]> = {
  accounting: ["accounting"],
  "default-attachments": ["settings", "purchasing"],
  documents: ["documents"],
  inventory: ["inventory"],
  job: ["production"],
  logos: ["settings"],
  maintenance: ["resources"],
  models: ["parts"],
  opportunity: ["sales"],
  "opportunity-line": ["sales"],
  parts: ["parts"],
  procedures: ["production"],
  quality: ["quality"],
  "supplier-interaction": ["purchasing"],
  "supplier-interaction-line": ["purchasing"],
  "tax-certificates": ["sales", "purchasing"],
  thumbnails: ["parts"],
  training: ["people"]
};

const authenticatedStorageNamespaces = new Set([
  "imports",
  "person",
  "suggestions"
]);

const parseString = (value: FormDataEntryValue | null) =>
  typeof value === "string" ? value : "";

const parseHeader = (request: Request, name: string) =>
  request.headers.get(name)?.trim() ?? "";

const parseAction = (value: string): StorageMutationAction | null => {
  if (value === "upload" || value === "remove" || value === "move") {
    return value;
  }
  return null;
};

const parseAuthMode = (value: string): StorageAuthMode => {
  if (value === "authenticated") return "authenticated";
  return "permission";
};

const parseUploadAccess = (value: string): StorageUploadAccess => {
  if (value === "create") return "create";
  return "update";
};

const assertCompanyStoragePath = (key: string, companyId: string) => {
  const normalized = key.replace(/^\/+/, "");
  if (!normalized.startsWith(`${companyId}/`)) {
    throw forbidden("Storage path is outside the current company");
  }
  return normalized;
};

const assertPermissionCanMutatePath = (key: string, permission: string) => {
  const namespace = key.split("/")[1];
  const allowedPermissions = storageNamespacePermissions[namespace];

  if (!allowedPermissions?.includes(permission)) {
    throw forbidden("Storage path is outside the requested permission");
  }
};

const assertAuthenticatedStoragePath = (key: string) => {
  const namespace = key.split("/")[1];

  if (!authenticatedStorageNamespaces.has(namespace)) {
    throw forbidden("Storage path is outside authenticated upload access");
  }
};

const assertFeedbackStoragePath = (key: string) => {
  const normalized = key.replace(/^\/+/, "");
  if (!normalized || normalized.includes("/") || normalized.includes("..")) {
    throw forbidden("Storage path is outside feedback upload access");
  }
  return normalized;
};

const assertAvatarStoragePath = (key: string, userId: string) => {
  const normalized = key.replace(/^\/+/, "");
  if (
    !normalized ||
    normalized.includes("/") ||
    normalized.includes("..") ||
    !normalized.startsWith(`${userId}.`)
  ) {
    throw forbidden("Storage path is outside avatar upload access");
  }
  return normalized;
};

const parsePaths = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((path): path is string => typeof path === "string")
      : [];
  } catch {
    return [];
  }
};

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return badRequest("Expected POST");
  }

  const action = parseAction(parseHeader(request, "x-carbon-storage-action"));
  const authMode = parseAuthMode(parseHeader(request, "x-carbon-storage-auth"));
  const permission = parseHeader(request, "x-carbon-storage-permission");
  const sourcePermission =
    parseHeader(request, "x-carbon-storage-source-permission") || permission;
  const destinationPermission =
    parseHeader(request, "x-carbon-storage-destination-permission") ||
    permission;
  const uploadAccess = parseUploadAccess(
    parseHeader(request, "x-carbon-storage-access")
  );

  if (!action) {
    return badRequest("Expected storage action");
  }

  if (authMode === "authenticated" && action === "move") {
    return forbidden("Authenticated storage does not support moves");
  }

  if (authMode === "permission" && !permission) {
    return badRequest("Expected storage permission");
  }

  if (
    authMode === "permission" &&
    action === "move" &&
    (!sourcePermission || !destinationPermission)
  ) {
    return badRequest("Expected source and destination storage permissions");
  }

  const { companyId, userId } = await requirePermissions(
    request,
    authMode === "authenticated"
      ? {}
      : action === "upload"
        ? { [uploadAccess]: permission }
        : action === "move"
          ? { delete: sourcePermission, update: destinationPermission }
          : { delete: permission }
  );

  const formData = await request.formData();
  const intent = parseString(formData.get("intent"));
  const bucket = parseString(formData.get("bucket")) || "private";

  if (intent !== action) {
    return badRequest("Storage action does not match request intent");
  }

  if (
    authMode === "permission" &&
    bucket !== "private" &&
    bucket !== "public"
  ) {
    return forbidden("Only private and public storage are supported");
  }

  if (
    authMode === "authenticated" &&
    bucket !== "private" &&
    bucket !== "feedback" &&
    bucket !== "avatars"
  ) {
    return forbidden(
      "Only private, feedback, and avatar storage are supported"
    );
  }

  if (intent === "upload") {
    const rawKey = parseString(formData.get("path"));
    const key =
      authMode === "authenticated" && bucket === "feedback"
        ? assertFeedbackStoragePath(rawKey)
        : authMode === "authenticated" && bucket === "avatars"
          ? assertAvatarStoragePath(rawKey, userId)
          : assertCompanyStoragePath(rawKey, companyId);

    if (authMode === "authenticated") {
      if (bucket === "private") {
        assertAuthenticatedStoragePath(key);
      }
    } else {
      assertPermissionCanMutatePath(key, permission);
    }

    const file = formData.get("file");

    if (!(file instanceof File)) {
      return badRequest("Expected file");
    }

    const result = await uploadObject({
      bucket,
      key,
      body: await file.arrayBuffer(),
      cacheControl: parseString(formData.get("cacheControl")) || undefined,
      contentType:
        parseString(formData.get("contentType")) || file.type || undefined
    });

    return Response.json({ data: result, error: null });
  }

  if (intent === "remove") {
    const keys = parsePaths(formData.get("paths")).map((path) =>
      authMode === "authenticated" && bucket === "avatars"
        ? assertAvatarStoragePath(path, userId)
        : assertCompanyStoragePath(path, companyId)
    );

    if (keys.length === 0) {
      return badRequest("Expected at least one path");
    }

    if (authMode === "authenticated") {
      if (bucket !== "avatars") {
        return forbidden("Authenticated storage only supports avatar removals");
      }
    } else {
      for (const key of keys) {
        assertPermissionCanMutatePath(key, permission);
      }
    }

    await removeObjects(bucket, keys);
    return Response.json({ data: null, error: null });
  }

  if (intent === "move") {
    const sourceKey = assertCompanyStoragePath(
      parseString(formData.get("sourcePath")),
      companyId
    );
    const destinationKey = assertCompanyStoragePath(
      parseString(formData.get("destinationPath")),
      companyId
    );

    if (!sourceKey || !destinationKey) {
      return badRequest("Expected source and destination paths");
    }

    assertPermissionCanMutatePath(sourceKey, sourcePermission);
    assertPermissionCanMutatePath(destinationKey, destinationPermission);

    await moveObject({
      source: { bucket, key: sourceKey },
      destination: { bucket, key: destinationKey }
    });

    return Response.json({ data: { path: destinationKey }, error: null });
  }

  return badRequest("Unknown storage intent");
}
