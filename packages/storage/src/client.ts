import { S3Client } from "@aws-sdk/client-s3";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export const S3_REGION = process.env.S3_REGION ?? "auto";
export const S3_ENDPOINT = process.env.S3_ENDPOINT;
export const PRIVATE_BUCKET = requireEnv("S3_PRIVATE_BUCKET");
export const PUBLIC_BUCKET = requireEnv("S3_PUBLIC_BUCKET");

export const s3 = new S3Client({
  region: S3_REGION,
  endpoint: S3_ENDPOINT,
  forcePathStyle: Boolean(S3_ENDPOINT),
  credentials: {
    accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY")
  }
});
