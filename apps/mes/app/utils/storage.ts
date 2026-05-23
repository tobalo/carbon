type UploadStorageObjectArgs = {
  bucket: "private" | "feedback";
  path: string;
  file: File;
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
