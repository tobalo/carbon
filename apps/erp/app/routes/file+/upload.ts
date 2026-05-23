import { requirePermissions } from "@carbon/auth/auth.server";
import {
  assertCompanyPath,
  normalizeStorageKey,
  signPrivateUpload,
  signPublicUpload
} from "@carbon/storage";
import type { ActionFunctionArgs } from "react-router";

type UploadRequest = {
  bucket?: string;
  path?: string;
  contentType?: string;
};

export async function action({ request }: ActionFunctionArgs) {
  const { companyId, userId } = await requirePermissions(request, {});
  const body = (await request.json()) as UploadRequest;
  const bucket = body.bucket ?? "private";
  const contentType = body.contentType || "application/octet-stream";
  const storagePath =
    typeof body.path === "string" ? body.path.replace(/^\/+/, "") : "";

  if (!storagePath) {
    return Response.json({ error: "Missing path" }, { status: 400 });
  }

  if (bucket === "private") {
    let key: string;
    try {
      key = assertCompanyPath(companyId, storagePath);
    } catch {
      return Response.json({ error: "Invalid private path" }, { status: 403 });
    }

    const signed = await signPrivateUpload({
      companyId,
      key,
      contentType
    });

    return Response.json({ path: signed.key, url: signed.url });
  }

  if (bucket === "public") {
    let key: string;
    try {
      key = assertCompanyPath(companyId, storagePath);
    } catch {
      return Response.json({ error: "Invalid public path" }, { status: 403 });
    }

    const signed = await signPublicUpload({
      key,
      contentType
    });

    return Response.json({ path: signed.key, url: signed.url });
  }

  if (bucket === "feedback") {
    let key: string;
    try {
      key = normalizeStorageKey(`feedback/${storagePath}`);
    } catch {
      return Response.json({ error: "Invalid feedback path" }, { status: 400 });
    }

    const signed = await signPublicUpload({
      key,
      contentType
    });

    return Response.json({
      path: signed.key.slice("feedback/".length),
      url: signed.url
    });
  }

  if (bucket === "avatars") {
    let key: string;
    try {
      const normalizedPath = normalizeStorageKey(storagePath);
      if (
        normalizedPath.includes("/") ||
        (normalizedPath !== userId && !normalizedPath.startsWith(`${userId}.`))
      ) {
        return Response.json({ error: "Invalid avatar path" }, { status: 403 });
      }
      key = normalizeStorageKey(`avatars/${normalizedPath}`);
    } catch {
      return Response.json({ error: "Invalid avatar path" }, { status: 400 });
    }

    const signed = await signPublicUpload({
      key,
      contentType
    });

    return Response.json({
      path: signed.key.slice("avatars/".length),
      url: signed.url
    });
  }

  return Response.json({ error: "Unsupported bucket" }, { status: 400 });
}
