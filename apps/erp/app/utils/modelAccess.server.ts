import { notFound, THUMBNAIL_SERVICE_TOKEN } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { timingSafeEqual } from "node:crypto";

export function getModelAccessToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }

  return new URL(request.url).searchParams.get("token");
}

export function isValidModelAccessToken(token: string | null) {
  if (!THUMBNAIL_SERVICE_TOKEN || !token) {
    return false;
  }

  const expected = Buffer.from(THUMBNAIL_SERVICE_TOKEN);
  const actual = Buffer.from(token);

  return (
    expected.byteLength === actual.byteLength && timingSafeEqual(expected, actual)
  );
}

export async function requireModelAccess(request: Request, companyId: string) {
  const token = getModelAccessToken(request);
  if (isValidModelAccessToken(token)) {
    return { token };
  }

  const auth = await requirePermissions(request, {});
  if (auth.companyId !== companyId) {
    throw notFound("model not found");
  }

  return { token: null };
}
