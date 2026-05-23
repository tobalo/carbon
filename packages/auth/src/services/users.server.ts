import type { Json } from "@carbon/database/schema";
import { redis } from "@carbon/kv";
import { updateSubscriptionQuantityForCompany } from "@carbon/stripe/stripe.server";
import { Edition } from "@carbon/utils";
import { CarbonEdition } from "../config/env";
import { getCarbonServiceClient } from "../lib/carbon/client.server";
import type { Permission, Result } from "../types";
import { error, success } from "../utils/result";
import {
  getClaims,
  getLegacyPermissionCacheKey,
  getPermissionCacheKey,
  makePermissionsFromClaims
} from "./users";

type QueryClient = {
  from(table: string): any;
};

export async function getUserByEmail(email: string) {
  return getCarbonServiceClient()
    .from("user")
    .select("*")
    .eq("email", email.toLowerCase())
    .single();
}

export async function getUserClaims(userId: string, companyId: string) {
  let claims: {
    permissions: Record<string, Permission>;
    role: string | null;
  } | null = null;

  try {
    const cachedClaims = await redis.get(
      getPermissionCacheKey(userId, companyId)
    );
    if (cachedClaims) {
      claims = JSON.parse(cachedClaims) as {
        permissions: Record<string, Permission>;
        role: string | null;
      };
    }
  } catch (e) {
    console.error("Failed to get claims from redis", e);
  } finally {
    // if we don't have permissions from redis, get them from the database
    if (!claims) {
      // TODO: move this service client call up a level
      const rawClaims = await getClaims(
        getCarbonServiceClient(),
        userId,
        companyId
      );
      if (rawClaims.error || rawClaims.data === null) {
        console.error(rawClaims);
        throw new Error("Failed to get claims");
      }

      // convert rawClaims to permissions
      claims = makePermissionsFromClaims(rawClaims.data as Json[]);

      // store claims in redis
      await redis.set(
        getPermissionCacheKey(userId, companyId),
        JSON.stringify(claims)
      );

      if (!claims) {
        throw new Error("Failed to get claims");
      }
    }

    return claims;
  }
}

export async function deactivateCustomer(
  serviceClient: QueryClient,
  userId: string,
  companyId: string
): Promise<Result> {
  const currentPermissions = await serviceClient
    .from("userPermission")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (currentPermissions.error) {
    return error(currentPermissions.error, "Failed to get user permissions");
  }

  const permissions = Object.entries(
    (currentPermissions.data?.permissions ?? {}) as Record<string, string[]>
  ).reduce<Record<string, string[]>>((acc, [key, value]) => {
    acc[key] = value.filter((id) => id !== companyId);
    return acc;
  }, {});

  const companyGroups = await serviceClient
    .from("group")
    .select("id")
    .eq("companyId", companyId);

  const groupIds =
    companyGroups.data?.map((g: { id: string }) => g.id) ?? [];

  const [updatePermissions, userToCompanyDelete, customerAccountDelete] =
    await Promise.all([
      serviceClient
        .from("userPermission")
        .update({ permissions })
        .eq("id", userId),
      serviceClient
        .from("userToCompany")
        .delete()
        .eq("userId", userId)
        .eq("companyId", companyId),
      serviceClient
        .from("customerAccount")
        .delete()
        .eq("id", userId)
        .eq("companyId", companyId),
      ...(groupIds.length > 0
        ? [
            serviceClient
              .from("membership")
              .delete()
              .eq("memberUserId", userId)
              .in("groupId", groupIds)
          ]
        : [])
    ]);

  if (updatePermissions.error) {
    return error(updatePermissions.error, "Failed to update user permissions");
  }

  if (userToCompanyDelete.error) {
    return error(
      userToCompanyDelete.error,
      "Failed to remove user from company"
    );
  }

  if (customerAccountDelete.error) {
    return error(
      customerAccountDelete.error,
      "Failed to remove customer account"
    );
  }

  return success("Sucessfully deactivated customer");
}

export async function deactivateEmployee(
  serviceClient: QueryClient,
  userId: string,
  companyId: string
): Promise<Result> {
  const currentPermissions = await serviceClient
    .from("userPermission")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (currentPermissions.error) {
    return error(currentPermissions.error, "Failed to get user permissions");
  }

  const permissions = Object.entries(
    (currentPermissions.data?.permissions ?? {}) as Record<string, string[]>
  ).reduce<Record<string, string[]>>((acc, [key, value]) => {
    acc[key] = value.filter((id) => id !== companyId);
    return acc;
  }, {});

  const companyGroups = await serviceClient
    .from("group")
    .select("id")
    .eq("companyId", companyId);

  const groupIds =
    companyGroups.data?.map((g: { id: string }) => g.id) ?? [];

  const [updatePermissions, userToCompanyDelete, employeeDeactivate] =
    await Promise.all([
      serviceClient
        .from("userPermission")
        .update({ permissions })
        .eq("id", userId),
      serviceClient
        .from("userToCompany")
        .delete()
        .eq("userId", userId)
        .eq("companyId", companyId),
      serviceClient
        .from("employee")
        .update({ active: false })
        .eq("id", userId)
        .eq("companyId", companyId),
      serviceClient
        .from("employeeJob")
        .delete()
        .eq("id", userId)
        .eq("companyId", companyId),
      ...(groupIds.length > 0
        ? [
            serviceClient
              .from("membership")
              .delete()
              .eq("memberUserId", userId)
              .in("groupId", groupIds)
          ]
        : [])
    ]);

  if (updatePermissions.error) {
    return error(updatePermissions.error, "Failed to update user permissions");
  }

  if (userToCompanyDelete.error) {
    return error(
      userToCompanyDelete.error,
      "Failed to remove user from company"
    );
  }

  if (employeeDeactivate.error) {
    return error(employeeDeactivate.error, "Failed to deactivate employee");
  }

  return success("Sucessfully deactivated employee");
}

export async function deactivateUser(
  serviceClient: QueryClient,
  userId: string,
  companyId: string
) {
  const userToCompany = await serviceClient
    .from("userToCompany")
    .select("role")
    .eq("userId", userId)
    .eq("companyId", companyId)
    .single();

  let result: Result;

  if (userToCompany.error) {
    // No userToCompany row — either pending invite, or already deactivated.
    const user = await serviceClient
      .from("user")
      .select("*")
      .eq("id", userId)
      .single();
    if (user.error) {
      return error(user.error, "Failed to get user");
    }

    const invite = await serviceClient
      .from("invite")
      .select("*")
      .eq("email", user.data?.email)
      .eq("companyId", companyId)
      .is("acceptedAt", null)
      .is("revokedAt", null)
      .maybeSingle();

    if (!invite.data) {
      // No userToCompany and no invite — already fully deactivated.
      return success("User already deactivated");
    }

    if (invite.data.role === "customer") {
      result = await deactivateCustomer(serviceClient, userId, companyId);
    } else if (invite.data.role === "employee") {
      result = await deactivateEmployee(serviceClient, userId, companyId);
    } else if (invite.data.role === "supplier") {
      result = await deactivateSupplier(serviceClient, userId, companyId);
    } else {
      throw new Error("Invalid user role");
    }
  } else {
    if (userToCompany.data?.role === "customer") {
      result = await deactivateCustomer(serviceClient, userId, companyId);
    } else if (userToCompany.data?.role === "employee") {
      result = await deactivateEmployee(serviceClient, userId, companyId);
    } else if (userToCompany.data?.role === "supplier") {
      result = await deactivateSupplier(serviceClient, userId, companyId);
    } else {
      throw new Error("Invalid user role");
    }
  }

  // Clear stale permission cache
  if (result && result.success) {
    await redis.del(
      getPermissionCacheKey(userId, companyId),
      getLegacyPermissionCacheKey(userId)
    );
  }

  // Mark any invite for this user/company as revoked so the link cannot be
  // redeemed and the UI no longer surfaces resend/revoke actions on it.
  if (result && result.success) {
    const userRecord = await serviceClient
      .from("user")
      .select("email")
      .eq("id", userId)
      .single();
    if (!userRecord.error && userRecord.data?.email) {
      await serviceClient
        .from("invite")
        .update({ revokedAt: new Date().toISOString() })
        .eq("email", userRecord.data.email)
        .eq("companyId", companyId)
        .is("acceptedAt", null)
        .is("revokedAt", null);
    }
  }

  return result;
}

export async function deactivateSupplier(
  serviceClient: QueryClient,
  userId: string,
  companyId: string
): Promise<Result> {
  const currentPermissions = await serviceClient
    .from("userPermission")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (currentPermissions.error) {
    return error(currentPermissions.error, "Failed to get user permissions");
  }

  const permissions = Object.entries(
    (currentPermissions.data?.permissions ?? {}) as Record<string, string[]>
  ).reduce<Record<string, string[]>>((acc, [key, value]) => {
    acc[key] = value.filter((id) => id !== companyId);
    return acc;
  }, {});

  const companyGroups = await serviceClient
    .from("group")
    .select("id")
    .eq("companyId", companyId);

  const groupIds =
    companyGroups.data?.map((g: { id: string }) => g.id) ?? [];

  const [updatePermissions, userToCompanyDelete, supplierAccountDelete] =
    await Promise.all([
      serviceClient
        .from("userPermission")
        .update({ permissions })
        .eq("id", userId),
      serviceClient
        .from("userToCompany")
        .delete()
        .eq("userId", userId)
        .eq("companyId", companyId),
      serviceClient
        .from("supplierAccount")
        .delete()
        .eq("id", userId)
        .eq("companyId", companyId),
      ...(groupIds.length > 0
        ? [
            serviceClient
              .from("membership")
              .delete()
              .eq("memberUserId", userId)
              .in("groupId", groupIds)
          ]
        : [])
    ]);

  if (updatePermissions.error) {
    return error(updatePermissions.error, "Failed to update user permissions");
  }

  if (userToCompanyDelete.error) {
    return error(
      userToCompanyDelete.error,
      "Failed to remove user from company"
    );
  }

  if (supplierAccountDelete.error) {
    return error(
      supplierAccountDelete.error,
      "Failed to remove supplier account"
    );
  }

  return success("Sucessfully deactivated supplier");
}
