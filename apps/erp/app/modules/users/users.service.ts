import type { QueryDatabase } from "@carbon/database/schema";
import { fetchAllFromTable } from "@carbon/database";
import type { CarbonDatabaseClient } from "@carbon/database/query-client";
import type { GenericQueryFilters } from "~/utils/query";
import { setGenericQueryFilters } from "~/utils/query";
import { capitalize } from "~/utils/string";
import { sanitize } from "@carbon/utils";
import type { CompanyPermission } from "./types";

export async function deleteEmployeeType(
  client: CarbonDatabaseClient<QueryDatabase>,
  employeeTypeId: string
) {
  return client
    .from("employeeType")
    .delete()
    .eq("id", employeeTypeId)
    .eq("protected", false);
}

export async function deleteGroup(
  client: CarbonDatabaseClient<QueryDatabase>,
  groupId: string
) {
  return client.from("group").delete().eq("id", groupId);
}

export async function getCompaniesForUser(
  client: CarbonDatabaseClient<QueryDatabase>,
  userId: string
) {
  const { data, error } = await client
    .from("userToCompany")
    .select("companyId")
    .eq("userId", userId);

  if (error) {
    console.log(`Failed to get companies for user ${userId}`, error);
    return [];
  }

  return data?.map((row) => row.companyId) ?? [];
}

export async function getCustomers(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  // TODO: this breaks on customerType filters -- convert to view
  let query = client
    .from("customerAccount")
    .select(
      `active, user!inner(id, fullName, firstName, lastName, email, avatarUrl),
      customer!inner(name, customerType!left(name))`,
      { count: "exact" }
    )
    .eq("companyId", companyId);

  if (args.search) {
    query = query.ilike("user.fullName", `%${args.search}%`);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "user(lastName)", ascending: true }
  ]);
  return query;
}

export async function getEmployee(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  companyId: string
) {
  return client
    .from("employees")
    .select("*")
    .eq("id", id)
    .eq("companyId", companyId)
    .single();
}

export async function getUnrevokedInviteEmails(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("invite")
    .select("email")
    .eq("companyId", companyId)
    .is("acceptedAt", null)
    .is("revokedAt", null);
}

export async function getEmployees(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client
    .from("employees")
    .select("*", { count: "exact" })
    .eq("companyId", companyId);

  if (args.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  // Default to active employees when the user hasn't explicitly filtered on
  // active status. The Active/Inactive dropdown still works because picking
  // a value puts an `active:eq:...` filter in the URL, which overrides this.
  const hasActiveFilter = args.filters?.some((f) => f.column === "active");
  if (!hasActiveFilter) {
    query = query.eq("active", true);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "lastName", ascending: true }
  ]);
  return query;
}

/**
 * Gets console operators — users with @console.internal emails.
 * Uses the employees view (which joins user + employee) and filters
 * by the synthetic email pattern since there's no FK from employee to user
 * for the direct query adapter to use directly.
 *
 * TODO: After running db:generate, replace email pattern filter with
 * .eq("isConsoleOperator", true) once the column is in the employees view.
 */
export async function getConsoleOperators(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client
    .from("employees")
    .select("*", { count: "exact" })
    .eq("companyId", companyId)
    .like("email", "%@console.internal");

  if (args.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "lastName", ascending: true }
  ]);
  return query;
}

export async function getEmployeeType(
  client: CarbonDatabaseClient<QueryDatabase>,
  employeeTypeId: string
) {
  return client
    .from("employeeType")
    .select("*")
    .eq("id", employeeTypeId)
    .single();
}

export async function getEmployeeTypes(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("employeeType")
    .select("*", { count: "exact" })
    .eq("companyId", companyId);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "name", ascending: true }
    ]);
  }

  return query;
}

export async function getInvitable(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("employeesAcrossCompanies")
    .select("*")
    .eq("active", true)
    .not("companyId", "cs", `{"${companyId}"}`)
    .order("lastName");
}

export async function getModules(client: CarbonDatabaseClient<QueryDatabase>) {
  return client.from("modules").select("name").order("name");
}

export async function getGroup(
  client: CarbonDatabaseClient<QueryDatabase>,
  groupId: string
) {
  return client.from("group").select("id, name").eq("id", groupId).single();
}

export async function getGroupMembers(
  client: CarbonDatabaseClient<QueryDatabase>,
  groupId: string
) {
  return client
    .from("groupMembers")
    .select("name, groupId, memberGroupId, memberUserId")
    .eq("groupId", groupId);
}

export async function getGroups(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & {
    search: string | null;
    uid: string | null;
  }
) {
  let query = client
    .rpc("groups_query", {
      _uid: args?.uid ?? "",
      _name: args?.search ?? ""
    })
    .eq("companyId", companyId);

  if (args) query = setGenericQueryFilters(query, args);

  return query;
}

export async function getGroupEmails(
  client: CarbonDatabaseClient<QueryDatabase>,
  groupIds: string[]
): Promise<string[]> {
  if (!groupIds || groupIds.length === 0) return [];

  const userIdsResult = (await client.rpc("users_for_groups", {
    groups: groupIds
  })) as { data: string[]; error: unknown };

  if (userIdsResult.error || !Array.isArray(userIdsResult.data)) return [];

  return getUserEmails(client, userIdsResult.data);
}

export async function getPermissionsByEmployeeType(
  client: CarbonDatabaseClient<QueryDatabase>,
  employeeTypeId: string
) {
  return client
    .from("employeeTypePermission")
    .select("view, create, update, delete, module")
    .eq("employeeTypeId", employeeTypeId);
}

export async function getSuppliers(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  // TODO: this breaks on supplierType filters -- convert to view
  let query = client
    .from("supplierAccount")
    .select(
      `active, user!inner(id, fullName, firstName, lastName, email, avatarUrl),
      supplier!inner(name, supplierType!left(name))`,
      { count: "exact" }
    )
    .eq("companyId", companyId);

  if (args.search) {
    query = query.ilike("user.fullName", `%${args.search}%`);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "user(lastName)", ascending: true }
  ]);
  return query;
}

export async function getUsers(client: CarbonDatabaseClient<QueryDatabase>) {
  return fetchAllFromTable<{
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    avatarUrl: string | null;
  }>(
    client,
    "user",
    "id, firstName, lastName, fullName, email, avatarUrl",
    (query) => query.eq("active", true).order("lastName")
  );
}

export async function getUserEmails(
  client: CarbonDatabaseClient<QueryDatabase>,
  userIds: string[]
): Promise<string[]> {
  if (!userIds || userIds.length === 0) return [];

  const result = await client
    .from("user")
    .select("email")
    .in("id", userIds)
    .eq("active", true);

  if (result.error || !result.data) return [];

  return result.data
    .map((u) => u.email)
    .filter((email): email is string => !!email);
}

export async function insertEmployeeType(
  client: CarbonDatabaseClient<QueryDatabase>,
  employeeType: { name: string; companyId: string }
) {
  return client
    .from("employeeType")
    .insert([employeeType])
    .select("id")
    .single();
}

export async function insertGroup(
  client: CarbonDatabaseClient<QueryDatabase>,
  group: { name: string; companyId: string }
) {
  return client.from("group").insert(group).select("*").single();
}

export async function upsertEmployeeType(
  client: CarbonDatabaseClient<QueryDatabase>,
  employeeType:
    | { name: string; companyId: string }
    | { id: string; name: string }
) {
  if ("id" in employeeType) {
    return client
      .from("employeeType")
      .update(sanitize(employeeType))
      .eq("id", employeeType.id)
      .select("id")
      .single();
  }
  return client
    .from("employeeType")
    .insert([employeeType])
    .select("id")
    .single();
}

export async function upsertEmployeeTypePermissions(
  client: CarbonDatabaseClient<QueryDatabase>,
  employeeTypeId: string,
  companyId: string,
  permissions: { name: string; permission: CompanyPermission }[]
) {
  const employeeTypePermissions = permissions.map(({ name, permission }) => ({
    employeeTypeId,
    module: capitalize(name) as "Accounting",
    view: permission.view ? [companyId] : [],
    create: permission.create ? [companyId] : [],
    update: permission.update ? [companyId] : [],
    delete: permission.delete ? [companyId] : []
  }));

  return client.from("employeeTypePermission").upsert(employeeTypePermissions);
}

export async function upsertGroup(
  client: CarbonDatabaseClient<QueryDatabase>,
  {
    id,
    name,
    companyId
  }: {
    id: string;
    name: string;
    companyId: string;
  }
) {
  return client.from("group").upsert([{ id, name, companyId }]);
}

export async function upsertGroupMembers(
  client: CarbonDatabaseClient<QueryDatabase>,
  groupId: string,
  selections: string[]
) {
  const deleteExisting = await client
    .from("membership")
    .delete()
    .eq("groupId", groupId);

  if (deleteExisting.error) return deleteExisting;

  // separate each id according to whether it is a group or a user
  const memberGroups = selections
    .filter((id) => id.startsWith("group_"))
    .map((id) => ({
      groupId,
      memberGroupId: id.slice(6)
    }));

  const memberUsers = selections
    .filter((id) => id.startsWith("user_"))
    .map((id) => ({
      groupId,
      memberUserId: id.slice(5)
    }));

  return client.from("membership").insert([...memberGroups, ...memberUsers]);
}
