import { carbonServiceRoleKey } from "./env.ts";

const bearerToken = (authorizationHeader: string | null) =>
  authorizationHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";

export function isTrustedBearer(authorizationHeader: string | null): boolean {
  const envKey = carbonServiceRoleKey();
  const token = bearerToken(authorizationHeader);
  if (!token) return false;
  if (token === envKey) return true;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  try {
    const role = (JSON.parse(atob(parts[1]!)) as { role?: string }).role;
    return role === "service_role";
  } catch {
    return false;
  }
}

export function requireTrustedBearer(authorizationHeader: string | null) {
  if (!authorizationHeader) {
    throw new Error("Authorization header or API key header is required");
  }

  if (!isTrustedBearer(authorizationHeader)) {
    throw new Error("Valid authorization is required");
  }
}
