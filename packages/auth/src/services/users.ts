import type { Json } from "@carbon/database";
import { getPublicStorageUrl } from "../config/env";
import type { CarbonClient, Permission } from "../types";

export async function getClaims(
  client: CarbonClient,
  uid: string,
  company?: string
) {
  return client.rpc("get_claims", { uid, company: company ?? "" });
}

export function getPermissionCacheKey(userId: string) {
  return `permissions:${userId}`;
}

export async function getCompanies(client: CarbonClient, userId: string) {
  const companies = await client
    .from("companies")
    .select("*, companyGroup(name)")
    .eq("userId", userId)
    .order("name");

  if (companies.error) {
    return companies;
  }

  return {
    data: companies.data.map(({ companyGroup, ...company }) => ({
      ...company,
      companyGroupName: (companyGroup as { name: string } | null)?.name ?? null,
      logoLightIcon: company.logoLightIcon
        ? (getPublicStorageUrl("public", company.logoLightIcon) ??
          company.logoLightIcon)
        : null,
      logoDarkIcon: company.logoDarkIcon
        ? (getPublicStorageUrl("public", company.logoDarkIcon) ??
          company.logoDarkIcon)
        : null,
      logoLight: company.logoLight
        ? (getPublicStorageUrl("public", company.logoLight) ??
          company.logoLight)
        : null,
      logoDark: company.logoDark
        ? (getPublicStorageUrl("public", company.logoDark) ?? company.logoDark)
        : null
    })),
    error: null
  };
}

export async function getCompaniesForUser(
  client: CarbonClient,
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

  return data?.map((row) => row.companyId) ?? [];
}

export async function getUser(client: CarbonClient, id: string) {
  return client
    .from("user")
    .select("*")
    .eq("id", id)
    .eq("active", true)
    .single();
}

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
