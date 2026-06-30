import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type ObjectReference = {
  bucket: string;
  key: string;
};

export type DownloadedObject = {
  body: ArrayBuffer;
  contentLength?: number;
  contentType?: string;
  etag?: string;
};

type ListedObjectMetadata = Record<string, unknown> & {
  eTag?: string;
  key?: string;
  size?: number;
};

export type ListedObject = {
  name: string;
  bucket_id: string;
  owner: string;
  id: string | null;
  updated_at: string;
  created_at: string;
  last_accessed_at: string;
  metadata: ListedObjectMetadata;
  buckets: {
    id: string;
    name: string;
    owner: string;
    created_at: string;
    updated_at: string;
    public: boolean;
  };
};

export type ListedFileObject = ListedObject & {
  id: string;
};

export type StorageResult<T> =
  | {
      data: T;
      error: null;
    }
  | {
      data: null;
      error: Error;
    };

type ListObjectsOptions = {
  limit?: number;
  offset?: number;
  recursive?: boolean;
  search?: string;
  sortBy?: {
    column: "name" | "updated_at" | "created_at";
    order?: "asc" | "desc";
  };
};

type UploadObjectOptions = ObjectReference & {
  body: ArrayBuffer | Blob | string | Uint8Array;
  cacheControl?: string;
  contentType?: string;
};

type CopyObjectOptions = {
  source: ObjectReference;
  destination: ObjectReference;
};

type MoveObjectOptions = CopyObjectOptions;

type RetryOptions = {
  attempts?: number;
  delayMs?: number;
};

type SignedDownloadUrlOptions = ObjectReference & {
  expiresIn?: number;
};

let storageClient: S3Client | undefined;

const nonEmptyEnv = (name: string) => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

const isNotFoundError = (error: unknown) => {
  const caught = error as {
    $metadata?: { httpStatusCode?: number };
    Code?: string;
    code?: string;
    name?: string;
  };
  return (
    caught.$metadata?.httpStatusCode === 404 ||
    caught.name === "NotFound" ||
    caught.name === "NoSuchKey" ||
    caught.Code === "NoSuchKey" ||
    caught.code === "NoSuchKey"
  );
};

const delay = (delayMs: number) =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

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

  const config: S3ClientConfig = {
    endpoint,
    forcePathStyle: parseBoolean(
      nonEmptyEnv("CARBON_STORAGE_FORCE_PATH_STYLE"),
      Boolean(endpoint)
    ),
    region:
      nonEmptyEnv("CARBON_STORAGE_REGION") ??
      nonEmptyEnv("AWS_REGION") ??
      "us-east-1"
  };

  if (accessKeyId && secretAccessKey) {
    config.credentials = {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {})
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
      key: `${bucket}/${normalizedKey}`
    };
  }

  const bucketPrefix = nonEmptyEnv("CARBON_STORAGE_BUCKET_PREFIX") ?? "";
  return {
    bucket: `${bucketPrefix}${bucket}`,
    key: normalizedKey
  };
};

const normalizePrefix = (prefix = "") => {
  const normalized = prefix.replace(/^\/+|\/+$/g, "");
  return normalized ? `${normalized}/` : "";
};

const stripLogicalBucketPrefix = (bucket: string, key: string) => {
  if (!nonEmptyEnv("CARBON_STORAGE_BUCKET")) return key;

  const logicalPrefix = `${bucket}/`;
  return key.startsWith(logicalPrefix) ? key.slice(logicalPrefix.length) : key;
};

const bucketInfo = (bucket: string) => ({
  id: bucket,
  name: bucket,
  owner: "",
  created_at: "",
  updated_at: "",
  public: false
});

const compareListObjects = (
  sortBy: ListObjectsOptions["sortBy"],
  a: ListedObject,
  b: ListedObject
) => {
  const column = sortBy?.column ?? "name";
  const order = sortBy?.order === "desc" ? -1 : 1;
  return order * a[column].localeCompare(b[column]);
};

export const isListedFileObject = (
  object: ListedObject
): object is ListedFileObject => object.id !== null;

const bytesToArrayBuffer = (bytes: Uint8Array) => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
};

const bodyToArrayBuffer = async (body: GetObjectCommandOutput["Body"]) => {
  if (!body) return new ArrayBuffer(0);

  const transformable = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
  };
  if (typeof transformable.transformToByteArray === "function") {
    return bytesToArrayBuffer(await transformable.transformToByteArray());
  }

  const blobLike = body as {
    arrayBuffer?: () => Promise<ArrayBuffer>;
  };
  if (typeof blobLike.arrayBuffer === "function") {
    return blobLike.arrayBuffer();
  }

  if (body instanceof Uint8Array) return bytesToArrayBuffer(body);

  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
    chunks.push(
      typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk
    );
  }

  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes.buffer;
};

const toUploadBody = async (body: UploadObjectOptions["body"]) => {
  if (typeof body === "string") return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }

  return new Uint8Array(await body.arrayBuffer());
};

const copySource = (reference: ObjectReference) => {
  const object = resolveStorageObject(reference);
  return encodeURIComponent(`${object.bucket}/${object.key}`).replaceAll(
    "%2F",
    "/"
  );
};

export const downloadObject = async (reference: ObjectReference) => {
  const object = resolveStorageObject(reference);
  const result = await getStorageClient().send(
    new GetObjectCommand({
      Bucket: object.bucket,
      Key: object.key
    })
  );

  return {
    body: await bodyToArrayBuffer(result.Body),
    contentLength: result.ContentLength,
    contentType: result.ContentType,
    etag: result.ETag
  } satisfies DownloadedObject;
};

export const downloadObjectWithRetry = async (
  reference: ObjectReference,
  { attempts = 2, delayMs = 1000 }: RetryOptions = {}
) => {
  let error: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await downloadObject(reference);
    } catch (caught) {
      error = caught;
      if (attempt < attempts) await delay(delayMs);
    }
  }

  console.error(error);
  return null;
};

export const createSignedDownloadUrl = async ({
  bucket,
  key,
  expiresIn = 3600
}: SignedDownloadUrlOptions) => {
  const object = resolveStorageObject({ bucket, key });
  return getSignedUrl(
    getStorageClient(),
    new GetObjectCommand({
      Bucket: object.bucket,
      Key: object.key
    }),
    { expiresIn }
  );
};

export const objectExists = async (reference: ObjectReference) => {
  const object = resolveStorageObject(reference);
  try {
    await getStorageClient().send(
      new HeadObjectCommand({
        Bucket: object.bucket,
        Key: object.key
      })
    );
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
};

export const uploadObject = async ({
  bucket,
  key,
  body,
  cacheControl,
  contentType
}: UploadObjectOptions) => {
  const object = resolveStorageObject({ bucket, key });
  await getStorageClient().send(
    new PutObjectCommand({
      Body: await toUploadBody(body),
      Bucket: object.bucket,
      CacheControl: cacheControl,
      ContentType: contentType,
      Key: object.key
    })
  );

  return {
    path: key
  };
};

export const copyObject = async ({
  source,
  destination
}: CopyObjectOptions) => {
  const object = resolveStorageObject(destination);
  await getStorageClient().send(
    new CopyObjectCommand({
      Bucket: object.bucket,
      CopySource: copySource(source),
      Key: object.key
    })
  );
};

export const moveObject = async (options: MoveObjectOptions) => {
  await copyObject(options);
  await removeObjects(options.source.bucket, [options.source.key]);
};

export const listObjects = async (
  bucket: string,
  prefix = "",
  options: ListObjectsOptions = {}
) => {
  const normalizedPrefix = normalizePrefix(prefix);
  const resolvedPrefix = resolveStorageObject({
    bucket,
    key: normalizedPrefix
  }).key;
  const resolvedBucket = resolveStorageObject({ bucket, key: "" }).bucket;
  const maxKeys = Math.min(
    Math.max((options.limit ?? 1000) + (options.offset ?? 0), 1),
    1000
  );
  const objects: ListedObject[] = [];
  let continuationToken: string | undefined;

  do {
    const result = await getStorageClient().send(
      new ListObjectsV2Command({
        Bucket: resolvedBucket,
        ContinuationToken: continuationToken,
        Delimiter: options.recursive ? undefined : "/",
        MaxKeys: maxKeys,
        Prefix: resolvedPrefix
      })
    );

    for (const commonPrefix of result.CommonPrefixes ?? []) {
      if (!commonPrefix.Prefix) continue;
      const name = commonPrefix.Prefix.slice(resolvedPrefix.length).replace(
        /\/$/u,
        ""
      );
      if (!name || name.includes("/")) continue;
      if (options.search && !name.includes(options.search)) continue;
      objects.push({
        name,
        bucket_id: bucket,
        owner: "",
        id: null,
        updated_at: "",
        created_at: "",
        last_accessed_at: "",
        metadata: {},
        buckets: bucketInfo(bucket)
      });
    }

    for (const object of result.Contents ?? []) {
      if (!object.Key || object.Key === resolvedPrefix) continue;
      const logicalKey = stripLogicalBucketPrefix(bucket, object.Key);
      const name = object.Key.slice(resolvedPrefix.length);
      if (!name || (!options.recursive && name.includes("/"))) continue;
      if (options.search && !name.includes(options.search)) continue;

      const timestamp = object.LastModified?.toISOString() ?? "";
      objects.push({
        name,
        bucket_id: bucket,
        owner: "",
        id: object.ETag?.replaceAll('"', "") ?? logicalKey,
        updated_at: timestamp,
        created_at: timestamp,
        last_accessed_at: timestamp,
        metadata: {
          eTag: object.ETag,
          key: logicalKey,
          size: object.Size ?? 0
        },
        buckets: bucketInfo(bucket)
      });
    }

    continuationToken = result.NextContinuationToken;
  } while (continuationToken && objects.length < maxKeys);

  return objects
    .sort((a, b) => compareListObjects(options.sortBy, a, b))
    .slice(
      options.offset ?? 0,
      (options.offset ?? 0) + (options.limit ?? 1000)
    );
};

export const listObjectsResult = async (
  bucket: string,
  prefix = "",
  options: ListObjectsOptions = {}
): Promise<StorageResult<ListedObject[]>> => {
  try {
    return {
      data: await listObjects(bucket, prefix, options),
      error: null
    };
  } catch (error) {
    return {
      data: null,
      error: toError(error)
    };
  }
};

const chunk = <T>(values: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};

export const removeObjects = async (bucket: string, keys: string[]) => {
  if (keys.length === 0) return;

  const resolvedBucket = resolveStorageObject({ bucket, key: "" }).bucket;
  for (const keyChunk of chunk(keys, 1000)) {
    const result = await getStorageClient().send(
      new DeleteObjectsCommand({
        Bucket: resolvedBucket,
        Delete: {
          Objects: keyChunk.map((key) => ({
            Key: resolveStorageObject({ bucket, key }).key
          })),
          Quiet: true
        }
      })
    );

    if (result.Errors && result.Errors.length > 0) {
      throw new Error(
        `Failed to remove ${result.Errors.length} object(s): ${result.Errors.map(
          (error) => error.Key ?? error.Code ?? "unknown"
        ).join(", ")}`
      );
    }
  }
};

export const removeObjectsResult = async (
  bucket: string,
  keys: string[]
): Promise<StorageResult<null>> => {
  try {
    await removeObjects(bucket, keys);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: toError(error) };
  }
};

export const listObjectKeysRecursive = async (bucket: string, prefix = "") => {
  const objects = await listObjects(bucket, prefix, { recursive: true });
  return objects
    .filter(isListedFileObject)
    .map((object) => object.metadata.key)
    .filter((key): key is string => typeof key === "string");
};

export const removeObjectsByPrefix = async (bucket: string, prefix: string) => {
  const keys = await listObjectKeysRecursive(bucket, prefix);
  await removeObjects(bucket, keys);
  return keys.length;
};
