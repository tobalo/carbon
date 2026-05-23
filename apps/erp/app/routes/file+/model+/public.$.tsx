import { notFound } from "@carbon/auth";
import {
  assertCompanyPath,
  downloadObject,
  normalizeStorageKey
} from "@carbon/storage";
import { supportedModelTypes } from "@carbon/utils";
import type { LoaderFunctionArgs } from "react-router";
import { requireModelAccess } from "~/utils/modelAccess.server";

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
  flac: "audio/flac"
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  const path = params["*"] ? decodeURIComponent(params["*"]) : null;

  if (!path) throw new Error("Path not found");

  let storageKey: string;
  try {
    storageKey = normalizeStorageKey(path);
  } catch {
    throw notFound("Invalid path");
  }

  if (!storageKey.split("/").includes("models")) {
    throw notFound("Invalid path");
  }

  const fileType = storageKey.split(".").pop()?.toLowerCase();

  if (
    !fileType ||
    (!(fileType in supportedFileTypes) &&
      !supportedModelTypes.includes(fileType))
  )
    throw new Error(`File type ${fileType} not supported`);
  const contentType = supportedFileTypes[fileType];
  const companyId = storageKey.split("/")[0];
  if (!companyId) throw new Error("Company ID not found");
  assertCompanyPath(companyId, storageKey);
  await requireModelAccess(request, companyId);

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
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Access-Control-Allow-Origin": "*", // Allow cross-origin requests
    "Access-Control-Allow-Methods": "GET", // Only allow GET requests
    "Access-Control-Allow-Headers": "Content-Type" // Allow Content-Type header
  });
  return new Response(fileData, { status: 200, headers });
}
