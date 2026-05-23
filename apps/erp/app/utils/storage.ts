type StorageBucket = "private" | "public" | "feedback" | "avatars";

type UploadStorageObjectArgs = {
  bucket: StorageBucket;
  path: string;
  file: Blob;
};

export async function uploadStorageObject({
  bucket,
  path,
  file
}: UploadStorageObjectArgs): Promise<{
  data: { path: string } | null;
  error: { message: string } | null;
}> {
  const contentType = file.type || "application/octet-stream";
  const signResponse = await fetch("/file/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket, path, contentType })
  });

  if (!signResponse.ok) {
    return {
      data: null,
      error: { message: await signResponse.text() }
    };
  }

  const signed = (await signResponse.json()) as { path: string; url: string };
  const uploadResponse = await fetch(signed.url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file
  });

  if (!uploadResponse.ok) {
    return {
      data: null,
      error: { message: await uploadResponse.text() }
    };
  }

  return {
    data: { path: signed.path },
    error: null
  };
}

export async function removeStorageObjects({
  bucket,
  paths
}: {
  bucket: StorageBucket;
  paths: string[];
}): Promise<{
  data: unknown | null;
  error: { message: string } | null;
}> {
  const removeResponse = await fetch("/file/remove", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket, paths })
  });

  if (!removeResponse.ok) {
    return {
      data: null,
      error: { message: await removeResponse.text() }
    };
  }

  return {
    data: await removeResponse.json(),
    error: null
  };
}
