import { getCarbonServiceClient } from "@carbon/auth/client.server";
import { Ratelimit, redis } from "@carbon/kv";
import { assertCompanyPath, downloadObject } from "@carbon/storage";
import { supportedModelTypes } from "@carbon/utils";
import type { LoaderFunctionArgs } from "react-router";
import { getJobByOperationId } from "~/modules/production";
import { getCustomerPortal } from "~/modules/shared/shared.service";

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

function isExpired(date: string | null | undefined) {
  return Boolean(date && new Date(date) < new Date());
}

export let loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { id } = params;
  if (!id) {
    throw new Error("Customer ID is required");
  }

  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1";
  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "1 m"), // 10 downloads per minute
    analytics: true
  });
  const { success } = await ratelimit.limit(ip);

  if (!success) {
    return new Response(null, { status: 429 });
  }

  const serviceClient = getCarbonServiceClient();
  const customer = await getCustomerPortal(serviceClient, id);

  if (customer.error) {
    console.error(customer.error);
    throw new Error("Customer not found");
  }

  if (!customer.data?.customerId) {
    console.error(customer.error);
    throw new Error("Customer not found");
  }
  const customerData = customer.data;

  if (isExpired(customerData.expiresAt)) {
    return new Response(null, { status: 403 });
  }

  let path = params["*"];
  if (!path) throw new Error("Path not found");

  try {
    path = assertCompanyPath(customerData.companyId, decodeURIComponent(path));
  } catch {
    return new Response(null, { status: 403 });
  }

  const pathMatch = path.match(/^([^/]+)\/job\/([^/]+)\/[^/]+$/);
  const companyId = pathMatch?.[1];
  const operationId = pathMatch?.[2];

  const fileType = path.split(".").pop()?.toLowerCase();

  if (companyId !== customerData.companyId) {
    return new Response(null, { status: 403 });
  }

  if (!operationId) {
    return new Response(null, { status: 403 });
  }

  const job = await getJobByOperationId(serviceClient, operationId, {
    companyId: customerData.companyId
  });

  if (job.error) {
    console.error(job.error);
    return new Response(null, { status: 403 });
  }

  if (job.data.companyId !== customerData.companyId) {
    return new Response(null, { status: 403 });
  }

  if (job.data.customerId !== customerData.customerId) {
    return new Response(null, { status: 403 });
  }

  if (
    !fileType ||
    (!(fileType in supportedFileTypes) &&
      !supportedModelTypes.includes(fileType))
  )
    throw new Error(`File type ${fileType} not supported`);
  const contentType = supportedFileTypes[fileType];

  const storageCompanyId = customerData.companyId;
  const storageKey = path;

  async function downloadFile() {
    return downloadObject({ companyId: storageCompanyId, key: storageKey });
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
    "Cache-Control": "private, max-age=31536000, immutable"
  });
  return new Response(fileData, { status: 200, headers });
};
