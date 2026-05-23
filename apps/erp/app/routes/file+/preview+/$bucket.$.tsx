import { requirePermissions } from "@carbon/auth/auth.server";
import { assertCompanyPath, downloadObject } from "@carbon/storage";
import type { LoaderFunctionArgs } from "react-router";
import { canReadDocumentPath } from "~/modules/documents";

const supportedFileTypes: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  svg: "image/svg+xml",
  avif: "image/avif",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  wmv: "video/x-ms-wmv",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  dxf: "application/dxf",
  dwg: "application/dxf",
  stl: "application/stl",
  obj: "application/obj",
  glb: "application/glb",
  gltf: "application/gltf",
  fbx: "application/fbx",
  ply: "application/ply",
  off: "application/off",
  step: "application/step"
};

export let loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { client, companyId, userId } = await requirePermissions(request, {});
  const { bucket } = params;
  let path = params["*"];

  if (!bucket) throw new Error("Bucket not found");
  if (!path) throw new Error("Path not found");

  // Don't decode the path here - let the storage route handle the URL encoding
  // path = decodeURIComponent(path);

  const fileType = path.split(".").pop()?.toLowerCase();

  if (!fileType) {
    return new Response(null, { status: 400 });
  }
  const contentType = supportedFileTypes[fileType];

  let storageKey: string;
  try {
    storageKey = assertCompanyPath(companyId, decodeURIComponent(path));
  } catch {
    return new Response(null, { status: 403 });
  }

  if (bucket === "private") {
    const documentAccess = await canReadDocumentPath(client, storageKey, userId);
    if (documentAccess.error) {
      return new Response(null, { status: 403 });
    }
  }

  async function downloadFile() {
    return downloadObject({ companyId, key: storageKey });
  }

  let fileData = await downloadFile();
  if (!fileData) {
    // Wait for a second and try again
    await new Promise((resolve) => setTimeout(resolve, 1000));
    fileData = await downloadFile();
    if (!fileData) {
      throw new Error("Failed to download file after retry");
    }
  }

  const headers = new Headers({
    "Cache-Control": "private, max-age=31536000, immutable"
  });

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  return new Response(fileData, { status: 200, headers });
};
