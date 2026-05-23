import { requirePermissions } from "@carbon/auth/auth.server";
import {
  assertCompanyPath,
  normalizeStorageKey,
  removeObject,
  removePublicObject
} from "@carbon/storage";
import type { ActionFunctionArgs } from "react-router";

type RemoveRequest = {
  bucket?: string;
  path?: string;
  paths?: string[];
};

function getStoragePaths(body: RemoveRequest) {
  if (Array.isArray(body.paths)) {
    return body.paths;
  }

  return typeof body.path === "string" ? [body.path] : [];
}

export async function action({ request }: ActionFunctionArgs) {
  const { companyId, userId } = await requirePermissions(request, {});
  const body = (await request.json()) as RemoveRequest;
  const bucket = body.bucket ?? "private";
  const paths = getStoragePaths(body)
    .filter((path) => typeof path === "string")
    .map((path) => path.replace(/^\/+/, ""));

  if (paths.length === 0) {
    return Response.json({ error: "Missing path" }, { status: 400 });
  }

  for (const storagePath of paths) {
    if (bucket === "private") {
      let key: string;
      try {
        key = assertCompanyPath(companyId, storagePath);
      } catch {
        return Response.json(
          { error: "Invalid private path" },
          { status: 403 }
        );
      }

      await removeObject({ companyId, key });
      continue;
    }

    if (bucket === "public") {
      let key: string;
      try {
        key = assertCompanyPath(companyId, storagePath);
      } catch {
        return Response.json(
          { error: "Invalid public path" },
          { status: 403 }
        );
      }

      await removePublicObject({ key });
      continue;
    }

    if (bucket === "feedback") {
      let key: string;
      try {
        key = normalizeStorageKey(`feedback/${storagePath}`);
      } catch {
        return Response.json(
          { error: "Invalid feedback path" },
          { status: 400 }
        );
      }

      await removePublicObject({ key });
      continue;
    }

    if (bucket === "avatars") {
      let key: string;
      try {
        const normalizedPath = normalizeStorageKey(storagePath);
        if (
          normalizedPath.includes("/") ||
          (normalizedPath !== userId && !normalizedPath.startsWith(`${userId}.`))
        ) {
          return Response.json(
            { error: "Invalid avatar path" },
            { status: 403 }
          );
        }
        key = normalizeStorageKey(`avatars/${normalizedPath}`);
      } catch {
        return Response.json(
          { error: "Invalid avatar path" },
          { status: 400 }
        );
      }

      await removePublicObject({ key });
      continue;
    }

    return Response.json({ error: "Unsupported bucket" }, { status: 400 });
  }

  return Response.json({ data: {} });
}
