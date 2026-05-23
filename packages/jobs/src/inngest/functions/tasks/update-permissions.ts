import type { Result } from "@carbon/auth";
import {
  error,
  getClaims,
  getLegacyPermissionCacheKey,
  getPermissionCacheKey,
  success
} from "@carbon/auth";
import { getCarbonServiceClient } from "@carbon/auth/client.server";
import { redis } from "@carbon/kv";
import { inngest } from "../../client";
import type { JobQueryClient } from "../../../lib/query-client";

export const updatePermissionsFunction = inngest.createFunction(
  { id: "update-permissions", retries: 3 },
  { event: "carbon/update-permissions" },
  async ({ event, step }) => {
    const serviceClient = getCarbonServiceClient();
    const payload = event.data;

    const result = await step.run("update-permissions", async () => {
      console.info(`Permission Update for ${payload.id}`);
      const { success, message } = await updatePermissions(
        serviceClient,
        payload
      );
      if (success) {
        console.info(`Permission Update for ${payload.id} succeeded`);
      } else {
        console.error(`Permission Update for ${payload.id} failed: ${message}`);
      }
      return { success, message };
    });

    return result;
  }
);

export async function updatePermissions(
  client: JobQueryClient,
  {
    id,
    permissions,
    companyId,
    addOnly = false
  }: {
    id: string;
    addOnly: boolean;
    permissions: Record<
      string,
      { view: boolean; create: boolean; update: boolean; delete: boolean }
    >;
    companyId: string;
  }
): Promise<Result> {
  if (await client.rpc("is_claims_admin")) {
    const membership = await client
      .from("userToCompany")
      .select("userId")
      .eq("userId", id)
      .eq("companyId", companyId)
      .maybeSingle();

    if (membership.error) {
      return error(membership.error, "Failed to verify user company access");
    }

    if (!membership.data) {
      return error(null, "User is not a member of the requested company");
    }

    const claims = await getClaims(client, id, companyId);

    if (claims.error) return error(claims.error, "Failed to get claims");

    const updatedPermissions = (
      typeof claims.data !== "object" ||
      Array.isArray(claims.data) ||
      claims.data === null
        ? {}
        : claims.data
    ) as Record<string, string[]>;
    delete updatedPermissions.role;

    // add any missing claims to the current claims
    Object.keys(permissions).forEach((name) => {
      const module = name.toLowerCase();
      if (!(`${module}_view` in updatedPermissions)) {
        updatedPermissions[`${module}_view`] = [];
      }
      if (!(`${module}_create` in updatedPermissions)) {
        updatedPermissions[`${module}_create`] = [];
      }
      if (!(`${module}_update` in updatedPermissions)) {
        updatedPermissions[`${module}_update`] = [];
      }
      if (!(`${module}_delete` in updatedPermissions)) {
        updatedPermissions[`${module}_delete`] = [];
      }
    });

    if (addOnly) {
      Object.entries(permissions).forEach(([name, permission]) => {
        const module = name.toLowerCase();
        if (
          permission.view &&
          !updatedPermissions[`${module}_view`]?.includes(companyId)
        ) {
          updatedPermissions[`${module}_view`]!.push(companyId);
        }
        if (
          permission.create &&
          !updatedPermissions[`${module}_create`]?.includes(companyId)
        ) {
          updatedPermissions[`${module}_create`]!.push(companyId);
        }
        if (
          permission.update &&
          !updatedPermissions[`${module}_update`]?.includes(companyId)
        ) {
          updatedPermissions[`${module}_update`]!.push(companyId);
        }
        if (
          permission.delete &&
          !updatedPermissions[`${module}_delete`]?.includes(companyId)
        ) {
          updatedPermissions[`${module}_delete`]!.push(companyId);
        }
      });
    } else {
      Object.entries(permissions).forEach(([name, permission]) => {
        const module = name.toLowerCase();
        if (permission.view) {
          if (!updatedPermissions[`${module}_view`]?.includes(companyId)) {
            updatedPermissions[`${module}_view`] = [
              ...(updatedPermissions[`${module}_view`] ?? []),
              companyId
            ];
          }
        } else {
          updatedPermissions[`${module}_view`] = (
            updatedPermissions[`${module}_view`] as string[]
          ).filter((c: string) => c !== companyId);
        }

        if (permission.create) {
          if (!updatedPermissions[`${module}_create`]?.includes(companyId)) {
            updatedPermissions[`${module}_create`] = [
              ...(updatedPermissions[`${module}_create`] ?? []),
              companyId
            ];
          }
        } else {
          updatedPermissions[`${module}_create`] = (
            updatedPermissions[`${module}_create`] as string[]
          ).filter((c: string) => c !== companyId);
        }

        if (permission.update) {
          if (!updatedPermissions[`${module}_update`]?.includes(companyId)) {
            updatedPermissions[`${module}_update`] = [
              ...(updatedPermissions[`${module}_update`] ?? []),
              companyId
            ];
          }
        } else {
          updatedPermissions[`${module}_update`] = (
            updatedPermissions[`${module}_update`] as string[]
          ).filter((c: string) => c !== companyId);
        }

        if (permission.delete) {
          if (!updatedPermissions[`${module}_delete`]?.includes(companyId)) {
            updatedPermissions[`${module}_delete`] = [
              ...(updatedPermissions[`${module}_delete`] ?? []),
              companyId
            ];
          }
        } else {
          updatedPermissions[`${module}_delete`] = (
            updatedPermissions[`${module}_delete`] as string[]
          ).filter((c: string) => c !== companyId);
        }
      });
    }

    const permissionsUpdate = await client
      .from("userPermission")
      .update({ permissions: updatedPermissions })
      .eq("id", id);
    if (permissionsUpdate.error)
      return error(permissionsUpdate.error, "Failed to update claims");

    await redis.del(
      getPermissionCacheKey(id, companyId),
      getLegacyPermissionCacheKey(id)
    );

    return success("Permissions updated");
  } else {
    return error(null, "You do not have permission to update permissions");
  }
}
