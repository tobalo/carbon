import { S3_PUBLIC_BASE_URL } from "../config/env";

export function getPublicStorageUrl(path: string, bucket?: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const normalizedPath = path.replace(/^\/+/, "");
  const key = bucket
    ? `${bucket.replace(/^\/+|\/+$/g, "")}/${normalizedPath}`
    : normalizedPath;

  if (!S3_PUBLIC_BASE_URL) {
    return key;
  }

  return `${S3_PUBLIC_BASE_URL.replace(/\/+$/, "")}/${key}`;
}
