import { error, success } from "@carbon/auth";
import { deleteAuthAccount } from "@carbon/auth/auth.server";
import { getCarbonServiceClient } from "@carbon/auth/client.server";
import { authProvider } from "@carbon/auth/provider";
import { flash, requireAuthSession } from "@carbon/auth/session.server";
import {
  deactivateCustomer,
  deactivateEmployee,
  deactivateSupplier
} from "@carbon/auth/users.server";
import type {
  Json,
  QueryDatabase
} from "@carbon/database/schema";
import { redis } from "@carbon/kv";

import type { CarbonDatabaseClient } from "@carbon/database/query-client";
import { redirect } from "react-router";
import { getSupplierContact } from "~/modules/purchasing";
import { getCustomerContact } from "~/modules/sales";
import type {
  CompanyPermission,
  EmployeeInsert,
  EmployeeTypePermission,
  InviteInsert,
  Module,
  Permission,
  User
} from "~/modules/users";
import { getPermissionsByEmployeeType } from "~/modules/users";
import type { Result } from "~/types";
import { path } from "~/utils/path";
import { insertEmployeeJob } from "../people/people.service";

async function createAuthUser(args: {
  email: string;
  password?: string;
  id?: string;
}) {
  try {
    const user = await authProvider.createUser({
      email: args.email.toLowerCase(),
      password: args.password ?? crypto.randomUUID(),
      emailVerified: true,
      id: args.id
    });

    return { data: { user: { id: user.userId } }, error: null };
  } catch (err) {
    return {
      data: { user: null },
      error: {
        message: err instanceof Error ? err.message : "Failed to create user"
      }
    };
  }
}

export async function acceptInvite(
  serviceClient: CarbonDatabaseClient<QueryDatabase>,
  code: string,
  email?: string
) {
  const invite = await serviceClient
    .from("invite")
    .select("*")
    .eq("code", code)
    .is("acceptedAt", null)
    .is("revokedAt", null)
    .single();

  if (invite.error) return invite;

  if (email && invite.data.email !== email) {
    throw new Error(
      "Invite code does not match email. Please logout and try again."
    );
  }

  const user = await getUserByEmail(invite.data.email);
  if (user.error) return user;

  const activationFunction =
    invite.data.role === "employee"
      ? activateEmployee
      : invite.data.role === "customer"
        ? activateCustomer
        : invite.data.role === "supplier"
          ? activateSupplier
          : null;

  if (!activationFunction) {
    return {
      data: null,
      error: {
        message: "Invalid invite role"
      }
    };
  }

  const [activate, addUser, setPermissions] = await Promise.all([
    activationFunction(serviceClient, {
      userId: user.data.id,
      companyId: invite.data.companyId
    }),
    addUserToCompany(serviceClient, {
      userId: user.data.id,
      companyId: invite.data.companyId,
      role: invite.data.role
    }),
    setUserPermissions(
      serviceClient,
      user.data.id,
      invite.data.companyId,
      invite.data.permissions as Record<string, string[]>
    )
  ]);

  if (activate.error) {
    console.error(activate.error);
    await rollbackInvite(serviceClient, {
      userId: user.data.id,
      companyId: invite.data.companyId
    });
    return activate;
  }

  if (addUser.error) {
    console.error(addUser.error);
    await rollbackInvite(serviceClient, {
      userId: user.data.id,
      companyId: invite.data.companyId
    });
    return addUser;
  }

  if (setPermissions.error) {
    console.error(setPermissions.error);
    await rollbackInvite(serviceClient, {
      userId: user.data.id,
      companyId: invite.data.companyId
    });
    return setPermissions;
  }

  return serviceClient
    .from("invite")
    .update({ acceptedAt: new Date().toISOString() })
    .eq("code", code)
    .eq("companyId", invite.data.companyId)
    .is("acceptedAt", null)
    .is("revokedAt", null)
    .select("*")
    .single();
}

async function activateCustomer(
  client: CarbonDatabaseClient<QueryDatabase>,
  {
    userId,
    companyId
  }: {
    userId: string;
    companyId: string;
  }
) {
  const result = await client
    .from("customerAccount")
    .update({ active: true })
    .eq("id", userId)
    .eq("companyId", companyId)
    .select("id");

  if (!result.error && (!result.data || result.data.length === 0)) {
    return {
      data: null,
      error: {
        message: `Customer account not found for user ${userId} in company ${companyId}. The account may have been deleted during deactivation.`
      }
    };
  }

  return result;
}

async function activateEmployee(
  client: CarbonDatabaseClient<QueryDatabase>,
  {
    userId,
    companyId
  }: {
    userId: string;
    companyId: string;
  }
) {
  const result = await client
    .from("employee")
    .update({ active: true })
    .eq("id", userId)
    .eq("companyId", companyId)
    .select("id");

  if (!result.error && (!result.data || result.data.length === 0)) {
    return {
      data: null,
      error: {
        message: `Employee record not found for user ${userId} in company ${companyId}. The record may have been deleted during deactivation.`
      }
    };
  }

  return result;
}

async function activateSupplier(
  client: CarbonDatabaseClient<QueryDatabase>,
  {
    userId,
    companyId
  }: {
    userId: string;
    companyId: string;
  }
) {
  const result = await client
    .from("supplierAccount")
    .update({ active: true })
    .eq("id", userId)
    .eq("companyId", companyId)
    .select("id");

  if (!result.error && (!result.data || result.data.length === 0)) {
    return {
      data: null,
      error: {
        message: `Supplier account not found for user ${userId} in company ${companyId}. The account may have been deleted during deactivation.`
      }
    };
  }

  return result;
}

export async function addUserToCompany(
  client: CarbonDatabaseClient<QueryDatabase>,
  userToCompany: {
    userId: string;
    companyId: string;
    role: "employee" | "customer" | "supplier";
  }
) {
  return client.from("userToCompany").insert(userToCompany);
}

export async function createCustomerAccount(
  client: CarbonDatabaseClient<QueryDatabase>,
  {
    id,
    customerId,
    companyId,
    createdBy
  }: {
    id: string;
    customerId: string;
    companyId: string;
    createdBy: string;
  }
): Promise<
  | { success: false; message: string }
  | { success: true; code: string; userId: string; email: string }
> {
  const customerContact = await getCustomerContact(client, id, customerId);
  if (
    customerContact.error ||
    customerContact.data === null ||
    customerContact.data.contact === null ||
    !customerContact.data.contact.email
  ) {
    return { success: false, message: "Failed to get customer contact" };
  }

  const { email, firstName, lastName } = customerContact.data.contact;

  const permissions = makeCustomerPermissions(companyId);
  const serviceClient = getCarbonServiceClient();
  const user = await getUserByEmail(email);
  let userId = "";
  let isNewUser = false;

  if (user.data) {
    userId = user.data.id;
  } else {
    isNewUser = true;
    const createAuth = await createAuthUser({
      email: email.toLowerCase(),
      password: crypto.randomUUID()
    });

    if (createAuth.error || !createAuth.data.user) {
      return {
        success: false,
        message: createAuth.error?.message ?? "Failed to create user"
      };
    }

    userId = createAuth.data.user.id;
    const createCarbonUser = await createUser(serviceClient, {
      id: userId,
      email: email.toLowerCase(),
      firstName: firstName ?? "",
      lastName: lastName ?? "",
      avatarUrl: null
    });

    if (createCarbonUser.error) {
      await deleteAuthAccount(serviceClient, userId);
      return { success: false, message: createCarbonUser.error.message };
    }
  }

  const code = crypto.randomUUID();
  const [contactUpdate, customerAccountInsert, inviteInsert] =
    await Promise.all([
      client
        .from("customerContact")
        .update({ userId })
        .eq("id", id)
        .eq("customerId", customerId),
      insertCustomerAccount(client, {
        id: userId,
        customerId,
        companyId
      }),
      insertInvite(serviceClient, {
        role: "customer",
        permissions,
        email,
        companyId,
        createdBy,
        code
      })
    ]);

  if (contactUpdate.error) {
    if (isNewUser) {
      await deleteAuthAccount(serviceClient, userId);
    } else {
      await deactivateCustomer(serviceClient, userId, companyId);
    }
    return { success: false, message: contactUpdate.error.message };
  }

  if (customerAccountInsert.error) {
    if (isNewUser) {
      await deleteAuthAccount(serviceClient, userId);
    } else {
      await deactivateCustomer(serviceClient, userId, companyId);
    }
    return { success: false, message: customerAccountInsert.error.message };
  }

  if (inviteInsert.error) {
    if (isNewUser) {
      await deleteAuthAccount(serviceClient, userId);
    } else {
      await deactivateCustomer(serviceClient, userId, companyId);
    }
    return { success: false, message: inviteInsert.error.message };
  }

  return { success: true, code, userId, email };
}

export async function createEmployeeAccount(
  client: CarbonDatabaseClient<QueryDatabase>,
  {
    email,
    firstName,
    lastName,
    employeeType,
    locationId,
    companyId,
    createdBy
  }: {
    email: string;
    firstName: string;
    lastName: string;
    employeeType: string;
    locationId: string;
    companyId: string;
    createdBy: string;
  }
): Promise<
  | { success: false; message: string }
  | { success: true; code: string; userId: string }
> {
  const employeeTypePermissions = await getPermissionsByEmployeeType(
    client,
    employeeType
  );
  if (employeeTypePermissions.error) {
    return { success: false, message: employeeTypePermissions.error.message };
  }

  const permissions = makePermissionsFromEmployeeType(employeeTypePermissions);
  const serviceClient = getCarbonServiceClient();
  const user = await getUserByEmail(email);
  let userId = "";
  let isNewUser = false;

  if (user.data) {
    userId = user.data.id;

    const existingEmployee = await client
      .from("employee")
      .select("id")
      .eq("id", userId)
      .eq("companyId", companyId)
      .maybeSingle();

    if (existingEmployee.data) {
      return {
        success: false,
        message: "This user is already an employee in this company"
      };
    }
  } else {
    isNewUser = true;
    const createAuth = await createAuthUser({
      email: email.toLowerCase(),
      password: crypto.randomUUID()
    });

    if (createAuth.error || !createAuth.data.user) {
      return {
        success: false,
        message: createAuth.error?.message ?? "Failed to create user"
      };
    }

    userId = createAuth.data.user.id;
    const createCarbonUser = await createUser(serviceClient, {
      id: userId,
      email: email.toLowerCase(),
      firstName,
      lastName,
      avatarUrl: null
    });

    if (createCarbonUser.error) {
      await deleteAuthAccount(serviceClient, userId);
      return { success: false, message: createCarbonUser.error.message };
    }
  }

  const code = crypto.randomUUID();
  const [employeeInsert, jobInsert, inviteInsert] = await Promise.all([
    insertEmployee(client, {
      id: userId,
      employeeTypeId: employeeType,
      active: false,
      companyId
    }),
    insertEmployeeJob(client, {
      id: userId,
      companyId,
      locationId
    }),
    insertInvite(serviceClient, {
      role: "employee",
      permissions,
      email,
      companyId,
      createdBy,
      code
    })
  ]);

  if (employeeInsert.error) {
    if (isNewUser) {
      await deleteAuthAccount(serviceClient, userId);
    }
    return { success: false, message: employeeInsert.error.message };
  }

  if (jobInsert.error) {
    if (isNewUser) {
      await deleteAuthAccount(serviceClient, userId);
    } else {
      await deactivateEmployee(serviceClient, userId, companyId);
    }
    return { success: false, message: jobInsert.error.message };
  }

  if (inviteInsert.error) {
    if (isNewUser) {
      await deleteAuthAccount(serviceClient, userId);
    } else {
      await deactivateEmployee(serviceClient, userId, companyId);
    }
    return { success: false, message: inviteInsert.error.message };
  }

  return { success: true, code, userId };
}

export async function createSupplierAccount(
  client: CarbonDatabaseClient<QueryDatabase>,
  {
    id,
    supplierId,
    companyId,
    createdBy
  }: {
    id: string;
    supplierId: string;
    companyId: string;
    createdBy: string;
  }
): Promise<
  | { success: false; message: string }
  | { success: true; code: string; userId: string; email: string }
> {
  const supplierContact = await getSupplierContact(client, id, supplierId);
  if (
    supplierContact.error ||
    supplierContact.data === null ||
    supplierContact.data.contact === null ||
    !supplierContact.data.contact.email
  ) {
    return { success: false, message: "Failed to get supplier contact" };
  }

  const { email, firstName, lastName } = supplierContact.data.contact;

  const permissions = makeSupplierPermissions(companyId);
  const serviceClient = getCarbonServiceClient();
  const user = await getUserByEmail(email);
  let userId = "";
  let isNewUser = false;

  if (user.data) {
    userId = user.data.id;
  } else {
    isNewUser = true;
    const createAuth = await createAuthUser({
      email: email.toLowerCase(),
      password: crypto.randomUUID()
    });

    if (createAuth.error || !createAuth.data.user) {
      return {
        success: false,
        message: createAuth.error?.message ?? "Failed to create user"
      };
    }

    userId = createAuth.data.user.id;
    const createCarbonUser = await createUser(serviceClient, {
      id: userId,
      email: email.toLowerCase(),
      firstName: firstName ?? "",
      lastName: lastName ?? "",
      avatarUrl: null
    });

    if (createCarbonUser.error) {
      await deleteAuthAccount(serviceClient, userId);
      return { success: false, message: createCarbonUser.error.message };
    }
  }

  const code = crypto.randomUUID();
  const [contactUpdate, supplierAccountInsert, inviteInsert] =
    await Promise.all([
      client
        .from("supplierContact")
        .update({ userId })
        .eq("id", id)
        .eq("supplierId", supplierId),
      insertSupplierAccount(client, {
        id: userId,
        supplierId,
        companyId
      }),
      insertInvite(serviceClient, {
        role: "supplier",
        permissions,
        email,
        companyId,
        createdBy,
        code
      })
    ]);

  if (contactUpdate.error) {
    if (isNewUser) {
      await deleteAuthAccount(serviceClient, userId);
    } else {
      await deactivateSupplier(serviceClient, userId, companyId);
    }
    return { success: false, message: contactUpdate.error.message };
  }

  if (supplierAccountInsert.error) {
    if (isNewUser) {
      await deleteAuthAccount(serviceClient, userId);
    } else {
      await deactivateSupplier(serviceClient, userId, companyId);
    }
    return { success: false, message: supplierAccountInsert.error.message };
  }

  if (inviteInsert.error) {
    if (isNewUser) {
      await deleteAuthAccount(serviceClient, userId);
    } else {
      await deactivateSupplier(serviceClient, userId, companyId);
    }
    return { success: false, message: inviteInsert.error.message };
  }

  return { success: true, code, userId, email };
}

async function createUser(
  client: CarbonDatabaseClient<QueryDatabase>,
  user: Omit<User, "fullName">
) {
  const { data, error } = await insertUser(client, user);

  if (error) {
    await deleteAuthAccount(client, user.id);
  }

  return { data, error };
}

export async function getClaims(
  client: CarbonDatabaseClient<QueryDatabase>,
  uid: string,
  company?: string
) {
  return client.rpc("get_claims", { uid, company: company ?? "" });
}

export async function getCurrentUser(
  request: Request,
  client: CarbonDatabaseClient<QueryDatabase>
) {
  const { userId } = await requireAuthSession(request);

  const user = await getUser(client, userId);
  if (user?.error || user?.data === null) {
    throw redirect(
      path.to.authenticatedRoot,
      await flash(request, error(user.error, "Failed to get user"))
    );
  }

  return user.data;
}

export function getPermissionCacheKey(userId: string, companyId: string) {
  return `permissions:${userId}:${companyId}`;
}

export function getLegacyPermissionCacheKey(userId: string) {
  return `permissions:${userId}`;
}

export async function getUser(client: CarbonDatabaseClient<QueryDatabase>, id: string) {
  return client
    .from("user")
    .select("*")
    .eq("id", id)
    .eq("active", true)
    .single();
}

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

export async function getUserGroups(
  client: CarbonDatabaseClient<QueryDatabase>,
  userId: string
) {
  return client.rpc("groups_for_user", { uid: userId });
}

export async function getUserDefaults(
  client: CarbonDatabaseClient<QueryDatabase>,
  userId: string,
  companyId: string
) {
  return client
    .from("userDefaults")
    .select("*")
    .eq("userId", userId)
    .eq("companyId", companyId)
    .maybeSingle();
}

export async function getModulePreferences(
  client: CarbonDatabaseClient<QueryDatabase>,
  userId: string,
  companyId: string
) {
  return client
    .from("userModulePreference")
    .select("module, position, hidden")
    .eq("userId", userId)
    .eq("companyId", companyId)
    .order("position");
}

export async function upsertModulePreferences(
  client: CarbonDatabaseClient<QueryDatabase>,
  userId: string,
  companyId: string,
  preferences: { module: string; position: number; hidden: boolean }[]
) {
  return client.from("userModulePreference").upsert(
    preferences.map((p) => ({
      userId,
      companyId,
      module: p.module,
      position: p.position,
      hidden: p.hidden,
      updatedAt: new Date().toISOString()
    })),
    { onConflict: "userId,companyId,module" }
  );
}

async function insertCustomerAccount(
  client: CarbonDatabaseClient<QueryDatabase>,
  customerAccount: {
    id: string;
    customerId: string;
    companyId: string;
  }
) {
  return client
    .from("customerAccount")
    .insert(customerAccount)
    .select("id")
    .single();
}

export async function insertEmployee(
  client: CarbonDatabaseClient<QueryDatabase>,
  employee: EmployeeInsert
) {
  return client.from("employee").insert([employee]).select("*").single();
}

export async function insertInvite(
  client: CarbonDatabaseClient<QueryDatabase>,
  invite: InviteInsert
) {
  return client
    .from("invite")
    .upsert([{ ...invite, acceptedAt: null, revokedAt: null }], {
      onConflict: "email, companyId",
      ignoreDuplicates: false
    })
    .select("*")
    .single();
}

async function insertSupplierAccount(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierAccount: {
    id: string;
    supplierId: string;
    companyId: string;
  }
) {
  return client
    .from("supplierAccount")
    .insert(supplierAccount)
    .select("id")
    .single();
}

async function insertUser(
  client: CarbonDatabaseClient<QueryDatabase>,
  user: Omit<User, "fullName" | "createdAt">
) {
  return client.from("user").upsert([user]).select("*");
}

/**
 * Creates a console-only operator: a lightweight user record that can pin in
 * at MES terminals without needing email, password, or a provider auth account.
 *
 * Uses a synthetic email ({uuid}@console.internal) to satisfy the NOT NULL
 * constraint. No auth.users entry is created — operators cannot log in.
 */
export async function createConsoleOperator(
  client: CarbonDatabaseClient<QueryDatabase>,
  {
    firstName,
    lastName,
    employeeType,
    locationId,
    companyId,
    createdBy
  }: {
    firstName: string;
    lastName: string;
    employeeType: string;
    locationId: string;
    companyId: string;
    createdBy: string;
  }
): Promise<
  | { success: false; message: string }
  | { success: true; userId: string; name: string }
> {
  const serviceClient = getCarbonServiceClient();
  const userId = crypto.randomUUID();
  const syntheticEmail = `${userId}@console.internal`;

  // 1. Insert user record (no provider auth account)
  // Note: isConsoleOperator field added by migration 20260319000000_console-mode.sql
  // Type will be available after db:generate runs
  const userInsert = await serviceClient
    .from("user")
    .insert({
      id: userId,
      email: syntheticEmail,
      firstName,
      lastName,
      avatarUrl: null,
      active: true,
      isConsoleOperator: true
    } as any)
    .select("*")
    .single();

  if (userInsert.error) {
    return { success: false, message: userInsert.error.message };
  }

  // 2. Insert employee (auto-active, no invite needed)
  const employeeInsert = await insertEmployee(client, {
    id: userId,
    employeeTypeId: employeeType,
    active: true,
    companyId
  });

  if (employeeInsert.error) {
    // Cleanup: remove user
    await serviceClient.from("user").delete().eq("id", userId);
    return { success: false, message: employeeInsert.error.message };
  }

  // 3. Insert employeeJob
  const jobInsert = await insertEmployeeJob(client, {
    id: userId,
    companyId,
    locationId
  });

  if (jobInsert.error) {
    // Cleanup
    await serviceClient.from("employee").delete().eq("id", userId);
    await serviceClient.from("user").delete().eq("id", userId);
    return { success: false, message: jobInsert.error.message };
  }

  // 4. Add to userToCompany (for billing/plan counting)
  const companyLink = await serviceClient
    .from("userToCompany")
    .insert({ userId, companyId, role: "employee" as const })
    .select("*")
    .single();

  if (companyLink.error) {
    // Non-critical — operator still works without this
    console.error(
      "Failed to link console operator to company:",
      companyLink.error
    );
  }

  return {
    success: true,
    userId,
    name: `${firstName} ${lastName}`
  };
}

/**
 * Converts a console-only operator to a full user by adding a provider auth
 * account and updating their email to a real one.
 */
export async function convertConsoleOperatorToUser(
  client: CarbonDatabaseClient<QueryDatabase>,
  {
    userId,
    email,
    employeeType,
    companyId,
    createdBy
  }: {
    userId: string;
    email: string;
    employeeType: string;
    companyId: string;
    createdBy: string;
  }
): Promise<{ success: false; message: string } | { success: true }> {
  const serviceClient = getCarbonServiceClient();

  // Verify the user is a console operator
  // Note: isConsoleOperator field added by migration 20260319000000_console-mode.sql
  const existingUser = await serviceClient
    .from("user")
    .select("*")
    .eq("id", userId)
    .single();

  if (existingUser.error || !(existingUser.data as any)?.isConsoleOperator) {
    return { success: false, message: "User is not a console operator" };
  }

  // Check email isn't already taken
  const emailCheck = await serviceClient
    .from("user")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (emailCheck.data) {
    return { success: false, message: "Email is already in use" };
  }

  // Create provider auth account with the same user ID.
  const createAuth = await createAuthUser({
    id: userId,
    email: email.toLowerCase(),
    password: crypto.randomUUID()
  });

  if (createAuth.error) {
    return { success: false, message: createAuth.error.message };
  }

  // Update user record: real email + no longer console operator
  const updateUser = await serviceClient
    .from("user")
    .update({
      email: email.toLowerCase(),
      isConsoleOperator: false
    } as any)
    .eq("id", userId);

  if (updateUser.error) {
    // Cleanup auth
    await deleteAuthAccount(serviceClient, userId);
    return { success: false, message: updateUser.error.message };
  }

  // Change employee type to the selected type
  await serviceClient
    .from("employee")
    .update({ employeeTypeId: employeeType })
    .eq("id", userId)
    .eq("companyId", companyId);

  // Create invite so user gets the magic link email
  const code = crypto.randomUUID();
  const employee = await client
    .from("employee")
    .select("employeeTypeId")
    .eq("id", userId)
    .eq("companyId", companyId)
    .single();

  if (employee.data?.employeeTypeId) {
    const employeeTypePermissions = await getPermissionsByEmployeeType(
      client,
      employee.data.employeeTypeId
    );

    if (!employeeTypePermissions.error) {
      const permissions = makePermissionsFromEmployeeType(
        employeeTypePermissions
      );

      const inviteResult = await insertInvite(serviceClient, {
        role: "employee",
        permissions,
        email: email.toLowerCase(),
        companyId,
        createdBy,
        code
      });

      if (inviteResult.error) {
        console.error(
          "Failed to create invite for converted operator:",
          inviteResult.error
        );
      }
    }
  }

  return { success: true };
}

function makePermissionsFromEmployeeType({
  data
}: {
  data: {
    view: string[];
    create: string[];
    update: string[];
    delete: string[];
    module: string;
  }[];
}) {
  const permissions: Record<string, string[]> = {};

  data.forEach((permission) => {
    if (!permission.module) {
      throw new Error(
        `Permission module is missing for permission ${JSON.stringify(data)}`
      );
    }

    const module = permission.module.toLowerCase();

    permissions[`${module}_view`] = permission.view;
    permissions[`${module}_create`] = permission.create;
    permissions[`${module}_update`] = permission.update;
    permissions[`${module}_delete`] = permission.delete;
  });

  return permissions;
}

function isClaimPermission(key: string, value: unknown) {
  const action = key.split("_")[1];
  return (
    action !== undefined &&
    ["view", "create", "update", "delete"].includes(action) &&
    Array.isArray(value)
  );
}

function makeCustomerPermissions(companyId: string) {
  // TODO: this should be more dynamic
  const permissions: Record<string, string[]> = {
    documents_view: [companyId],
    documents_create: [companyId],
    documents_update: [companyId],
    documents_delete: [companyId],
    production_view: [companyId],
    sales_view: [companyId],
    parts_view: [companyId]
  };

  return permissions;
}

export function makeEmptyPermissionsFromModules(data: Module[]) {
  return data.reduce<
    Record<string, { name: string; permission: CompanyPermission }>
  >((acc, m) => {
    if (m.name && m.name !== "Messaging") {
      acc[m.name] = {
        name: m.name.toLowerCase(),
        permission: {
          view: false,
          create: false,
          update: false,
          delete: false
        }
      };
    }
    return acc;
  }, {});
}

export function makeCompanyPermissionsFromClaims(
  claims: Json[] | null,
  companyId: string
) {
  if (typeof claims !== "object" || claims === null) return null;
  let permissions: Record<string, CompanyPermission> = {};
  let role: string | null = null;

  Object.entries(claims).forEach(([key, value]) => {
    if (isClaimPermission(key, value)) {
      const [module, action] = key.split("_");
      if (!(module in permissions)) {
        permissions[module] = {
          view: false,
          create: false,
          update: false,
          delete: false
        };
      }

      if (!Array.isArray(value)) {
        permissions[module] = {
          view: false,
          create: false,
          update: false,
          delete: false
        };
      } else {
        switch (action) {
          case "view":
            // biome-ignore lint/complexity/useLiteralKeys: suppressed due to migration
            permissions[module]["view"] =
              value.includes("0") || value.includes(companyId);
            break;
          case "create":
            // biome-ignore lint/complexity/useLiteralKeys: suppressed due to migration
            permissions[module]["create"] =
              value.includes("0") || value.includes(companyId);
            break;
          case "update":
            // biome-ignore lint/complexity/useLiteralKeys: suppressed due to migration
            permissions[module]["update"] =
              value.includes("0") || value.includes(companyId);
            break;
          case "delete":
            // biome-ignore lint/complexity/useLiteralKeys: suppressed due to migration
            permissions[module]["delete"] =
              value.includes("0") || value.includes(companyId);
            break;
        }
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

  if ("messaging" in permissions) {
    // biome-ignore lint/complexity/useLiteralKeys: suppressed due to migration
    delete permissions["messaging"];
  }

  return { permissions, role };
}

export function makePermissionsFromClaims(claims: Json[] | null) {
  if (typeof claims !== "object" || claims === null) return null;
  let permissions: Record<string, Permission> = {};
  let role: string | null = null;

  Object.entries(claims).forEach(([key, value]) => {
    if (isClaimPermission(key, value)) {
      const [module, action] = key.split("_");
      if (!(module in permissions)) {
        permissions[module] = {
          view: [],
          create: [],
          update: [],
          delete: []
        };
      }

      switch (action) {
        case "view":
          // biome-ignore lint/complexity/useLiteralKeys: suppressed due to migration
          permissions[module]["view"] = value as string[];
          break;
        case "create":
          // biome-ignore lint/complexity/useLiteralKeys: suppressed due to migration
          permissions[module]["create"] = value as string[];
          break;
        case "update":
          // biome-ignore lint/complexity/useLiteralKeys: suppressed due to migration
          permissions[module]["update"] = value as string[];
          break;
        case "delete":
          // biome-ignore lint/complexity/useLiteralKeys: suppressed due to migration
          permissions[module]["delete"] = value as string[];
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

  if ("messaging" in permissions) {
    // biome-ignore lint/complexity/useLiteralKeys: suppressed due to migration
    delete permissions["messaging"];
  }

  return { permissions, role };
}

export function makeCompanyPermissionsFromEmployeeType(
  data: EmployeeTypePermission[],
  companyId: string
) {
  const result: Record<
    string,
    { name: string; permission: CompanyPermission }
  > = {};
  if (!data) return result;
  data.forEach((permission) => {
    if (!permission.module) {
      throw new Error(
        `Module is missing for permission ${JSON.stringify(permission)}`
      );
    } else {
      result[permission.module] = {
        name: permission.module.toLowerCase(),
        permission: {
          view:
            permission.view.includes("0") ||
            permission.view.includes(companyId),
          create:
            permission.create.includes("0") ||
            permission.create.includes(companyId),
          update:
            permission.update.includes("0") ||
            permission.update.includes(companyId),
          delete:
            permission.delete.includes("0") ||
            permission.delete.includes(companyId)
        }
      };
    }
  });

  if ("items" in result) {
    // biome-ignore lint/complexity/useLiteralKeys: suppressed due to migration
    delete result["items"];
  }

  if ("Messaging" in result) {
    // biome-ignore lint/complexity/useLiteralKeys: suppressed due to migration
    delete result["Messaging"];
  }

  return result;
}

function makeSupplierPermissions(companyId: string) {
  // TODO: this should be more dynamic
  const permissions: Record<string, string[]> = {
    documents_view: [companyId],
    documents_create: [companyId],
    documents_update: [companyId],
    documents_delete: [companyId],
    purchasing_view: [companyId],
    parts_view: [companyId]
  };

  return permissions;
}

export async function getInvite(
  client: CarbonDatabaseClient<QueryDatabase>,
  email: string,
  companyId: string
) {
  return client
    .from("invite")
    .select("*")
    .eq("email", email)
    .eq("companyId", companyId)
    .single();
}

export async function resetPassword(userId: string, password: string) {
  await authProvider.adminSetPassword(userId, password);
  return { data: { user: { id: userId } }, error: null };
}

async function rollbackInvite(
  serviceClient: CarbonDatabaseClient<QueryDatabase>,
  { userId, companyId }: { userId: string; companyId: string }
) {
  await Promise.all([
    serviceClient
      .from("employee")
      .update({ active: false })
      .eq("id", userId)
      .eq("companyId", companyId),
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
    serviceClient
      .from("supplierAccount")
      .delete()
      .eq("id", userId)
      .eq("companyId", companyId)
  ]);
}

async function setUserPermissions(
  client: CarbonDatabaseClient<QueryDatabase>,
  userId: string,
  companyId: string,
  permissions: Record<string, string[]>
) {
  const user = await client
    .from("userPermission")
    .select("permissions")
    .eq("id", userId)
    .maybeSingle();

  const currentPermissions = (user.data?.permissions ?? {}) as Record<
    string,
    string[]
  >;
  const newPermissions = { ...currentPermissions };

  Object.entries(permissions).forEach(([key, value]) => {
    if (key in newPermissions) {
      newPermissions[key] = [...newPermissions[key], ...value];
    } else {
      newPermissions[key] = value;
    }
  });

  const result = await client
    .from("userPermission")
    .upsert({ id: userId, permissions: newPermissions });

  await redis.del(
    getPermissionCacheKey(userId, companyId),
    getLegacyPermissionCacheKey(userId)
  );

  return result;
}

export async function updateEmployee(
  client: CarbonDatabaseClient<QueryDatabase>,
  {
    id,
    employeeType,
    permissions,
    companyId
  }: {
    id: string;
    employeeType: string;
    permissions: Record<string, CompanyPermission>;
    companyId: string;
  }
): Promise<Result> {
  const updateEmployeeEmployeeType = await client
    .from("employee")
    .upsert([{ id, companyId, employeeTypeId: employeeType }]);

  if (updateEmployeeEmployeeType.error)
    return error(updateEmployeeEmployeeType.error, "Failed to update employee");

  return updatePermissions(client, { id, permissions, companyId });
}

export async function updatePermissions(
  client: CarbonDatabaseClient<QueryDatabase>,
  {
    id,
    permissions,
    companyId,
    addOnly = false
  }: {
    id: string;
    permissions: Record<string, CompanyPermission>;
    companyId: string;
    addOnly?: boolean;
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
    // biome-ignore lint/complexity/useLiteralKeys: suppressed due to migration
    delete updatedPermissions["role"];

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
          updatedPermissions[`${module}_view`].push(companyId);
        }
        if (
          permission.create &&
          !updatedPermissions[`${module}_create`]?.includes(companyId)
        ) {
          updatedPermissions[`${module}_create`].push(companyId);
        }
        if (
          permission.update &&
          !updatedPermissions[`${module}_update`]?.includes(companyId)
        ) {
          updatedPermissions[`${module}_update`].push(companyId);
        }
        if (
          permission.delete &&
          !updatedPermissions[`${module}_delete`]?.includes(companyId)
        ) {
          updatedPermissions[`${module}_delete`].push(companyId);
        }
      });
    } else {
      Object.entries(permissions).forEach(([name, permission]) => {
        const module = name.toLowerCase();
        if (permission.view) {
          if (!updatedPermissions[`${module}_view`]?.includes(companyId)) {
            updatedPermissions[`${module}_view`] = [
              ...updatedPermissions[`${module}_view`],
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
              ...updatedPermissions[`${module}_create`],
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
              ...updatedPermissions[`${module}_update`],
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
              ...updatedPermissions[`${module}_delete`],
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

    const permissionsUpdate = await getCarbonServiceClient()
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
