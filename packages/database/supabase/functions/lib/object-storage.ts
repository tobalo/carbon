import {
  GetObjectCommand,
  S3Client,
} from "npm:@aws-sdk/client-s3@3.1073.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.1073.0";

type ObjectReference = {
  bucket: string;
  key: string;
};

let storageClient: S3Client | undefined;

const nonEmptyEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  return value ? value : undefined;
};

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

const getStorageClient = () => {
  if (storageClient) return storageClient;

  const endpoint = nonEmptyEnv("CARBON_STORAGE_ENDPOINT");
  const accessKeyId =
    nonEmptyEnv("CARBON_STORAGE_ACCESS_KEY_ID") ??
    nonEmptyEnv("AWS_ACCESS_KEY_ID");
  const secretAccessKey =
    nonEmptyEnv("CARBON_STORAGE_SECRET_ACCESS_KEY") ??
    nonEmptyEnv("AWS_SECRET_ACCESS_KEY");
  const sessionToken =
    nonEmptyEnv("CARBON_STORAGE_SESSION_TOKEN") ??
    nonEmptyEnv("AWS_SESSION_TOKEN");

  const config: ConstructorParameters<typeof S3Client>[0] = {
    endpoint,
    forcePathStyle: parseBoolean(
      nonEmptyEnv("CARBON_STORAGE_FORCE_PATH_STYLE"),
      Boolean(endpoint),
    ),
    region:
      nonEmptyEnv("CARBON_STORAGE_REGION") ??
      nonEmptyEnv("AWS_REGION") ??
      "us-east-1",
  };

  if (accessKeyId && secretAccessKey) {
    config.credentials = {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    };
  }

  storageClient = new S3Client(config);
  return storageClient;
};

export const resolveStorageObject = ({ bucket, key }: ObjectReference) => {
  const normalizedKey = key.replace(/^\/+/, "");
  const sharedBucket = nonEmptyEnv("CARBON_STORAGE_BUCKET");

  if (sharedBucket) {
    return {
      bucket: sharedBucket,
      key: `${bucket}/${normalizedKey}`,
    };
  }

  const bucketPrefix = nonEmptyEnv("CARBON_STORAGE_BUCKET_PREFIX") ?? "";
  return {
    bucket: `${bucketPrefix}${bucket}`,
    key: normalizedKey,
  };
};

const streamToBytes = async (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
};

const bodyToBytes = async (body: unknown) => {
  if (!body) return new Uint8Array();
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }

  const transformable = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
  };
  if (typeof transformable.transformToByteArray === "function") {
    return transformable.transformToByteArray();
  }

  const blobLike = body as {
    arrayBuffer?: () => Promise<ArrayBuffer>;
  };
  if (typeof blobLike.arrayBuffer === "function") {
    return new Uint8Array(await blobLike.arrayBuffer());
  }

  const streamLike = body as {
    getReader?: () => ReadableStreamDefaultReader<Uint8Array>;
  };
  if (typeof streamLike.getReader === "function") {
    return streamToBytes(body as ReadableStream<Uint8Array>);
  }

  throw new Error("Unsupported object storage response body");
};

export const downloadObject = async (reference: ObjectReference) => {
  const object = resolveStorageObject(reference);
  const result = await getStorageClient().send(
    new GetObjectCommand({
      Bucket: object.bucket,
      Key: object.key,
    }),
  );

  return {
    body: await bodyToBytes(result.Body),
    contentLength: result.ContentLength,
    contentType: result.ContentType,
    etag: result.ETag,
  };
};

export const downloadObjectText = async (reference: ObjectReference) => {
  const object = await downloadObject(reference);
  return new TextDecoder().decode(object.body);
};

export const createSignedDownloadUrl = async (
  reference: ObjectReference,
  expiresIn = 3600
) => {
  const object = resolveStorageObject(reference);
  return getSignedUrl(
    getStorageClient(),
    new GetObjectCommand({
      Bucket: object.bucket,
      Key: object.key,
    }),
    { expiresIn }
  );
};
