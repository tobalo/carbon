import { requirePermissions } from "@carbon/auth/auth.server";
import { downloadObjectWithRetry } from "@carbon/object-storage/server";
import type { LoaderFunctionArgs } from "react-router";

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
  const { companyId } = await requirePermissions(request, {});
  const { bucket } = params;
  let path = params["*"];

  if (!bucket) throw new Error("Bucket not found");
  if (!path) throw new Error("Path not found");

  const fileType = path.split(".").pop()?.toLowerCase();

  if (!fileType) {
    return new Response(null, { status: 400 });
  }
  const contentType = supportedFileTypes[fileType];

  // Check if the decoded path includes companyId for security
  const decodedPath = decodeURIComponent(path);
  if (!decodedPath.includes(companyId)) {
    return new Response(null, { status: 403 });
  }

  const fileData = await downloadObjectWithRetry({
    bucket,
    key: decodedPath
  });
  if (!fileData) {
    throw new Error("Failed to download file after retry");
  }

  const headers = new Headers({
    "Cache-Control": "private, max-age=31536000, immutable"
  });

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  return new Response(fileData.body, { status: 200, headers });
};
