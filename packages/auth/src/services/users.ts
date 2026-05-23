import type { Json } from "@carbon/database/schema";
import type { Permission } from "../types";
import { getPublicStorageUrl } from "../utils/storage";

type QueryClient = {
  rpc(fn: string, params?: Record<string, unknown>): any;
  from(table: string): any;
};

export async function getClaims(
  client: QueryClient,
  uid: string,
  company?: string
) {
  return client.rpc("get_claims", { uid, company: company ?? "" });
}

export function getPermissionCacheKey(userId: string, companyId: string) {
  return `permissions:${userId}:${companyId}`;
}

export function getLegacyPermissionCacheKey(userId: string) {
  return `permissions:${userId}`;
}

export async function getCompanies(
  client: QueryClient,
  userId: string
) {
  const companies = await client
    .from("companies")
    .select("*")
    .eq("userId", userId)
    .order("name");

  if (companies.error) {
    return companies;
  }

  return {
    data: (companies.data as CompanyRecord[]).map((company) => ({
      ...company,
      logoLightIcon: company.logoLightIcon
        ? getPublicStorageUrl(company.logoLightIcon)
        : null,
      logoDarkIcon: company.logoDarkIcon
        ? getPublicStorageUrl(company.logoDarkIcon)
        : null,
      logoLight: company.logoLight
        ? getPublicStorageUrl(company.logoLight)
        : null,
      logoDark: company.logoDark
        ? getPublicStorageUrl(company.logoDark)
        : null
    })),
    error: null
  };
}

export async function getCompaniesForUser(
  client: QueryClient,
  userId: string
) {
  const { data, error } = await client
    .from("userToCompany")
    .select("companyId")
    .eq("userId", userId);

  if (error) {
    console.error(error, `Failed to get companies for user ${userId}`);
    return [];
  }

  return (data as { companyId: string }[] | null)?.map((row) => row.companyId) ?? [];
}

export async function getUser(client: QueryClient, id: string) {
  return client
    .from("user")
    .select("*")
    .eq("id", id)
    .eq("active", true)
    .single();
}

type CompanyRecord = {
  companyGroupName?: string | null;
  logoLightIcon: string | null;
  logoDarkIcon: string | null;
  logoLight: string | null;
  logoDark: string | null;
  [key: string]: unknown;
};

function isClaimPermission(key: string, value: unknown) {
  const action = key.split("_")[1];
  return (
    action !== undefined &&
    ["view", "create", "update", "delete"].includes(action) &&
    Array.isArray(value)
  );
}

export function makePermissionsFromClaims(claims: Json[] | null) {
  if (typeof claims !== "object" || claims === null) return null;
  let permissions: Record<string, Permission> = {};
  let role: string | null = null;

  Object.entries(claims).forEach(([key, value]) => {
    if (isClaimPermission(key, value)) {
      const [module, action] = key.split("_") as [string, string];
      if (!(module in permissions)) {
        permissions[module] = {
          view: [],
          create: [],
          update: [],
          delete: []
        };
      }

      const perm = permissions[module]!;
      switch (action) {
        case "view":
          // biome-ignore lint/complexity/useLiteralKeys: suppressed due to migration
          perm["view"] = value as string[];
          break;
        case "create":
          // biome-ignore lint/complexity/useLiteralKeys: suppressed due to migration
          perm["create"] = value as string[];
          break;
        case "update":
          // biome-ignore lint/complexity/useLiteralKeys: suppressed due to migration
          perm["update"] = value as string[];
          break;
        case "delete":
          // biome-ignore lint/complexity/useLiteralKeys: suppressed due to migration
          perm["delete"] = value as string[];
          break;
      }
    }
  });

  if ("role" in claims) {
    // biome-ignore lint/complexity/useLiteralKeys: suppressed due to migration
    role = claims["role"] as string;
  }

  if ("items" in permissions) {
    // biome-ignore lint/complexity/useLiteralKeys: suppressed due to migration
    delete permissions["items"];
  }

  return { permissions, role };
}
