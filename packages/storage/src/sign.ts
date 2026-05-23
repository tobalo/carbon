import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type PutObjectCommandInput
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PRIVATE_BUCKET, PUBLIC_BUCKET, s3 } from "./client";
import {
  assertCompanyPath,
  companyKey,
  companyPrefix,
  normalizeStorageKey
} from "./path";

export type StorageObject = {
  name: string;
  key: string;
  size: number;
  updatedAt: Date | null;
};

export type FileObject = {
  name: string;
  bucket_id: string;
  owner: string;
  id: string;
  updated_at: string;
  created_at: string;
  last_accessed_at: string;
  metadata: Record<string, any>;
  buckets: any;
};

export type StorageError = {
  message: string;
  statusCode?: string;
  error?: string;
};

export async function signUpload(args: {
  companyId: string;
  path: string;
  contentType: string;
  expiresIn?: number;
}) {
  const key = companyKey(args.companyId, args.path);
  const command = new PutObjectCommand({
    Bucket: PRIVATE_BUCKET,
    Key: key,
    ContentType: args.contentType
  });

  return {
    key,
    url: await getSignedUrl(s3, command, { expiresIn: args.expiresIn ?? 300 })
  };
}

export async function signPrivateUpload(args: {
  companyId: string;
  key: string;
  contentType: string;
  expiresIn?: number;
}) {
  const key = assertCompanyPath(args.companyId, args.key);
  const command = new PutObjectCommand({
    Bucket: PRIVATE_BUCKET,
    Key: key,
    ContentType: args.contentType
  });

  return {
    key,
    url: await getSignedUrl(s3, command, { expiresIn: args.expiresIn ?? 300 })
  };
}

export async function signPublicUpload(args: {
  key: string;
  contentType: string;
  expiresIn?: number;
}) {
  const key = normalizeStorageKey(args.key);
  const command = new PutObjectCommand({
    Bucket: PUBLIC_BUCKET,
    Key: key,
    ContentType: args.contentType
  });

  return {
    key,
    url: await getSignedUrl(s3, command, { expiresIn: args.expiresIn ?? 300 })
  };
}

export async function uploadObject(args: {
  companyId: string;
  key: string;
  body: PutObjectCommandInput["Body"];
  contentType?: string;
}) {
  const key = assertCompanyPath(args.companyId, args.key);

  return s3.send(
    new PutObjectCommand({
      Bucket: PRIVATE_BUCKET,
      Key: key,
      Body: args.body,
      ContentType: args.contentType
    })
  );
}

export async function downloadObject(args: { companyId: string; key: string }) {
  const key = assertCompanyPath(args.companyId, args.key);

  const result = await s3.send(
    new GetObjectCommand({
      Bucket: PRIVATE_BUCKET,
      Key: key
    })
  );

  const body = result.Body as
    | { transformToByteArray?: () => Promise<Uint8Array> }
    | undefined;

  if (!body?.transformToByteArray) {
    return null;
  }

  const bytes = await body.transformToByteArray();
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

export async function signDownload(args: {
  companyId: string;
  key: string;
  expiresIn?: number;
}) {
  const key = assertCompanyPath(args.companyId, args.key);
  const command = new GetObjectCommand({
    Bucket: PRIVATE_BUCKET,
    Key: key
  });

  return getSignedUrl(s3, command, { expiresIn: args.expiresIn ?? 900 });
}

export async function removeObject(args: { companyId: string; key: string }) {
  const key = assertCompanyPath(args.companyId, args.key);
  return s3.send(
    new DeleteObjectCommand({
      Bucket: PRIVATE_BUCKET,
      Key: key
    })
  );
}

export async function removePublicObject(args: { key: string }) {
  const key = normalizeStorageKey(args.key);
  return s3.send(
    new DeleteObjectCommand({
      Bucket: PUBLIC_BUCKET,
      Key: key
    })
  );
}

export async function moveObject(args: {
  companyId: string;
  fromKey: string;
  toKey: string;
}) {
  const fromKey = assertCompanyPath(args.companyId, args.fromKey);
  const toKey = assertCompanyPath(args.companyId, args.toKey);

  await s3.send(
    new CopyObjectCommand({
      Bucket: PRIVATE_BUCKET,
      CopySource: `${PRIVATE_BUCKET}/${encodeURIComponent(fromKey).replace(
        /%2F/g,
        "/"
      )}`,
      Key: toKey
    })
  );

  return removeObject({ companyId: args.companyId, key: fromKey });
}

export async function listObjects(args: {
  companyId: string;
  prefix: string;
  maxKeys?: number;
}) {
  const prefix = companyPrefix(args.companyId, args.prefix);
  const result = await s3.send(
    new ListObjectsV2Command({
      Bucket: PRIVATE_BUCKET,
      Prefix: prefix,
      MaxKeys: args.maxKeys
    })
  );

  return (result.Contents ?? []).map<StorageObject>((object) => ({
    name: object.Key?.split("/").at(-1) ?? "",
    key: object.Key ?? "",
    size: object.Size ?? 0,
    updatedAt: object.LastModified ?? null
  }));
}

export function toStorageFileObject(
  object: StorageObject,
  bucket: string
): FileObject {
  const updatedAt = object.updatedAt?.toISOString() ?? "";

  return {
    name: object.name,
    bucket_id: bucket,
    owner: object.key.split("/")[0] ?? "",
    id: object.key,
    updated_at: updatedAt,
    created_at: updatedAt,
    last_accessed_at: updatedAt,
    metadata: {
      size: object.size
    },
    buckets: null
  };
}
