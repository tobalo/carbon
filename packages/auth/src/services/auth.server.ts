import type { DatabaseQueryClient } from "@carbon/database/query-client";
import { checkApiKeyRateLimit } from "@carbon/database/ratelimit";
import { Edition, Plan } from "@carbon/utils";
import { createHash } from "crypto";
import { redirect } from "react-router";
import {
  CarbonEdition,
  REFRESH_ACCESS_TOKEN_THRESHOLD,
  STRIPE_BYPASS_COMPANY_IDS,
  VERCEL_URL
} from "../config/env";
import { getCarbon } from "../lib/carbon";
import { getCarbonAPIKeyClient } from "../lib/carbon/client";
import { getCarbonServiceClient } from "../lib/carbon/client.server";
import { authProvider } from "../provider";
import type { Session as ProviderSession } from "../provider";
import type { AuthSession } from "../types";
import { path } from "../utils/path";
import { error } from "../utils/result";
import { verifyConsolePinPayload } from "./console.server";
import {
  destroyAuthSession,
  flash,
  requireAuthSession
} from "./session.server";
import { getCompaniesForUser } from "./users";
import { getUserClaims } from "./users.server";

export async function createEmailAuthAccount(
  email: string,
  password: string,
  meta?: Record<string, unknown>
) {
  const user = await authProvider.createUser({
    email,
    password,
    emailVerified: true,
    metadata: meta
  });

  return { id: user.userId, email };
}

export async function deleteAuthAccount(
  client: DatabaseQueryClient,
  userId: string
) {
  const [, carbonDelete] = await Promise.all([
    authProvider.deleteUser(userId),
    client.from("user").delete().eq("id", userId)
  ]);

  if (carbonDelete.error) return null;

  return true;
}

export async function getAuthAccountByAccessToken(accessToken: string) {
  const session = await authProvider.getSessionByAccessToken(accessToken);

  if (!session) return null;

  return {
    id: session.userId,
    email: session.email
  };
}

/** Hash an API key using SHA-256 for secure storage/lookup */
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

type ApiKeyRecord = {
  id: string;
  companyId: string;
  companyGroupId: string;
  createdBy: string;
  scopes: Record<string, string[]>;
  rateLimit: number;
  rateLimitWindow: "1m" | "1h" | "1d";
  expiresAt: string | null;
};

type ExternalAccountScope = {
  role: string | null;
  customerId: string | null;
  supplierId: string | null;
};

export function assertCustomerAccountScope(
  scope: Pick<ExternalAccountScope, "role" | "customerId">,
  customerId: string | null | undefined
) {
  if (
    scope.role === "customer" &&
    (!customerId || scope.customerId !== customerId)
  ) {
    throw new Response("Customer account scope mismatch", { status: 403 });
  }
}

export function assertSupplierAccountScope(
  scope: Pick<ExternalAccountScope, "role" | "supplierId">,
  supplierId: string | null | undefined
) {
  if (
    scope.role === "supplier" &&
    (!supplierId || scope.supplierId !== supplierId)
  ) {
    throw new Response("Supplier account scope mismatch", { status: 403 });
  }
}

async function getCompanyIdFromAPIKey(apiKey: string) {
  const serviceClient = getCarbonServiceClient();
  const keyHash = hashApiKey(apiKey);
  const apiKeyRecord = await serviceClient
    .from("apiKey")
    .select(
      "id, companyId, createdBy, scopes, rateLimit, rateLimitWindow, expiresAt"
    )
    .eq("keyHash", keyHash)
    .single();

  if (apiKeyRecord.error || !apiKeyRecord.data) {
    return apiKeyRecord;
  }

  const company = await serviceClient
    .from("company")
    .select("companyGroupId")
    .eq("id", apiKeyRecord.data.companyId)
    .single();

  if (company.error || !company.data) {
    return { data: null, error: company.error };
  }

  return {
    data: {
      ...apiKeyRecord.data,
      companyGroupId: company.data.companyGroupId ?? ""
    },
    error: null
  };
}

function makeAuthSession(
  providerSession: ProviderSession | null,
  companyId: string,
  companyGroupId: string
): AuthSession | null {
  if (!providerSession) return null;

  const sessionToken = providerSession.refreshToken || providerSession.accessToken;

  if (!sessionToken)
    throw new Error("User should have a session token");

  if (!providerSession.email)
    throw new Error("User should have an email");

  const expiresAt = Math.floor(providerSession.expiresAt.getTime() / 1000);

  return {
    accessToken: providerSession.accessToken,
    companyId,
    companyGroupId,
    refreshToken: sessionToken,
    userId: providerSession.userId,
    email: providerSession.email,
    expiresIn: Math.max(
      expiresAt - Math.floor(Date.now() / 1000) - REFRESH_ACCESS_TOKEN_THRESHOLD,
      0
    ),
    expiresAt
  };
}

/**
 * Determines the effective user based on console mode and pin-in state.
 * If console mode is on and an operator is pinned in, returns
 * the operator's ID. Otherwise returns the session user's ID.
 *
 * Console mode is read from the auth session; pin-in state is
 * still read from the `console-pin-{companyId}` cookie.
 */
async function getEffectiveUser(
  request: Request,
  companyId: string,
  sessionUserId: string,
  consoleMode: boolean
): Promise<string> {
  if (!consoleMode) return sessionUserId;

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return sessionUserId;

  // Parse only the pin-in cookie we need
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [key, ...rest] = c.trim().split("=");
      return [key, decodeURIComponent(rest.join("="))];
    })
  );

  const pinRaw = cookies[`console-pin-${companyId}`];
  if (!pinRaw) return sessionUserId;

  const pinIn = verifyConsolePinPayload(pinRaw);
  if (!pinIn) return sessionUserId;

  const elapsed = Date.now() - pinIn.pinnedAt;
  if (elapsed > 3600000) return sessionUserId;

  const employee = await getCarbonServiceClient()
    .from("employee")
    .select("id")
    .eq("id", pinIn.userId)
    .eq("companyId", companyId)
    .eq("active", true)
    .maybeSingle();

  if (employee.error || !employee.data) {
    return sessionUserId;
  }

  return pinIn.userId;
}

async function getExternalAccountScope(
  userId: string,
  companyId: string,
  role: string | null
): Promise<ExternalAccountScope> {
  if (role === "customer") {
    const account = await getCarbonServiceClient()
      .from("customerAccount")
      .select("customerId")
      .eq("id", userId)
      .eq("companyId", companyId)
      .eq("active", true)
      .maybeSingle();

    if (account.error || !account.data?.customerId) {
      throw new Response("Customer account scope not found", { status: 403 });
    }

    return {
      role,
      customerId: account.data.customerId,
      supplierId: null
    };
  }

  if (role === "supplier") {
    const account = await getCarbonServiceClient()
      .from("supplierAccount")
      .select("supplierId")
      .eq("id", userId)
      .eq("companyId", companyId)
      .eq("active", true)
      .maybeSingle();

    if (account.error || !account.data?.supplierId) {
      throw new Response("Supplier account scope not found", { status: 403 });
    }

    return {
      role,
      customerId: null,
      supplierId: account.data.supplierId
    };
  }

  return {
    role,
    customerId: null,
    supplierId: null
  };
}

export async function requirePermissions(
  request: Request,
  requiredPermissions: {
    view?: string | string[];
    create?: string | string[];
    update?: string | string[];
    delete?: string | string[];
    role?: string;
    bypassRls?: boolean;
  }
): Promise<{
  client: DatabaseQueryClient;
  companyId: string;
  companyGroupId: string;
  email: string;
  userId: string;
  sessionUserId: string;
  consoleMode: boolean;
  role: string | null;
  customerId: string | null;
  supplierId: string | null;
}> {
  const apiKey = request.headers.get("carbon-key");

  if (apiKey) {
    const company = await getCompanyIdFromAPIKey(apiKey);
    if (company.data) {
      const apiKeyData = company.data as unknown as ApiKeyRecord;
      const companyId = apiKeyData.companyId;
      const companyGroupId = apiKeyData.companyGroupId;
      const userId = apiKeyData.createdBy;

      // Check expiration
      if (apiKeyData.expiresAt && new Date(apiKeyData.expiresAt) < new Date()) {
        throw new Response("API key has expired", { status: 401 });
      }

      // Check rate limit via Postgres function
      const serviceClient = getCarbonServiceClient();
      const rl = await checkApiKeyRateLimit(
        serviceClient,
        apiKeyData.id,
        apiKeyData.rateLimit,
        apiKeyData.rateLimitWindow
      );
      if (!rl.success) {
        throw new Response("Rate limit exceeded", {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "X-RateLimit-Limit": rl.limit.toString(),
            "X-RateLimit-Remaining": rl.remaining.toString(),
            "X-RateLimit-Reset": rl.resetAt.toString(),
            "Retry-After": Math.ceil(
              (rl.resetAt - Date.now()) / 1000
            ).toString()
          }
        });
      }

      // Update lastUsedAt (fire-and-forget)
      void serviceClient
        .from("apiKey")
        .update({ lastUsedAt: new Date().toISOString() } as any)
        .eq("id" as any, apiKeyData.id)
        .eq("companyId" as any, companyId);

      // Check scopes against required permissions
      const scopes = apiKeyData.scopes ?? {};
      const scopeCheckPassed = Object.entries(requiredPermissions).every(
        ([action, permission]) => {
          if (action === "bypassRls" || action === "role") return true;
          if (typeof permission === "string") {
            const scopeKey = `${permission}_${action}`;
            return scopeKey in scopes && scopes[scopeKey]?.includes(companyId);
          } else if (Array.isArray(permission)) {
            return permission.every((p) => {
              const scopeKey = `${p}_${action}`;
              return (
                scopeKey in scopes && scopes[scopeKey]?.includes(companyId)
              );
            });
          }
          return false;
        }
      );

      if (!scopeCheckPassed) {
        throw new Response("API key lacks required permissions", {
          status: 403
        });
      }

      // Plan gate: API access is a Business-tier feature. Block Starter
      // companies from authenticating with their API key. Self-hosted editions
      // and bypass-listed companies are never gated.
      if (CarbonEdition === Edition.Cloud) {
        const isBypass = STRIPE_BYPASS_COMPANY_IDS
          ? STRIPE_BYPASS_COMPANY_IDS.split(",")
              .map((id: string) => id.trim())
              .includes(companyId)
          : false;

        if (!isBypass) {
          const { data: planData } = await serviceClient
            .from("companyPlan")
            .select("planId")
            .eq("id", companyId)
            .single();

          if (planData?.planId === Plan.Starter) {
            throw new Response(
              "API access requires the Business plan and above. Please upgrade your plan to use API keys.",
              { status: 403 }
            );
          }
        }
      }

      const client = getCarbonAPIKeyClient(
        apiKeyData.id
      ) as unknown as DatabaseQueryClient;
      return {
        client,
        companyId,
        companyGroupId,
        userId,
        sessionUserId: userId,
        email: "",
        consoleMode: false,
        role: null,
        customerId: null,
        supplierId: null
      };
    }
  }

  const { accessToken, companyId, companyGroupId, email, userId } =
    await requireAuthSession(request);
  const authSession = await requireAuthSession(request);
  const consoleMode = authSession.console === companyId;

  const myClaims = await getUserClaims(userId, companyId);
  const effectiveUserId = await getEffectiveUser(
    request,
    companyId,
    userId,
    consoleMode
  );
  const externalAccountScope = await getExternalAccountScope(
    effectiveUserId,
    companyId,
    myClaims.role
  );

  // early exit if no requiredPermissions are required
  if (Object.keys(requiredPermissions).length === 0) {
    return {
      client:
        requiredPermissions.bypassRls && myClaims.role === "employee"
          ? getCarbonServiceClient()
          : (getCarbon(accessToken, effectiveUserId) as unknown as DatabaseQueryClient),
      companyId,
      companyGroupId,
      email,
      userId: effectiveUserId,
      sessionUserId: userId,
      consoleMode,
      ...externalAccountScope
    };
  }

  const hasRequiredPermissions = Object.entries(requiredPermissions).every(
    ([action, permission]) => {
      if (action === "bypassRls") return true;
      if (typeof permission === "string") {
        if (action === "role") {
          return myClaims.role === permission;
        }
        if (!(permission in myClaims.permissions)) return false;
        const permissionForCompany =
          myClaims.permissions[permission]?.[
            action as "view" | "create" | "update" | "delete"
          ];
        return (
          permissionForCompany?.includes("0") || // 0 is the wildcard for all companies
          permissionForCompany?.includes(companyId) ||
          false
        );
      } else if (Array.isArray(permission)) {
        return permission.every((p) => {
          const permissionForCompany =
            myClaims.permissions[p]?.[
              action as "view" | "create" | "update" | "delete"
            ];
          return permissionForCompany?.includes(companyId) ?? false;
        });
      } else {
        return false;
      }
    }
  );

  if (!hasRequiredPermissions) {
    if (myClaims.role === null) {
      throw redirect("/", await destroyAuthSession(request));
    }
    throw redirect(
      path.to.authenticatedRoot,
      await flash(
        request,
        error({ myClaims: myClaims, requiredPermissions }, "Access Denied")
      )
    );
  }

  return {
    client:
      !!requiredPermissions.bypassRls && myClaims.role === "employee"
        ? getCarbonServiceClient()
        : (getCarbon(accessToken, effectiveUserId) as unknown as DatabaseQueryClient),
    companyId,
    companyGroupId,
    email,
    userId: effectiveUserId,
    sessionUserId: userId,
    consoleMode,
    ...externalAccountScope
  };
}

export async function resetPassword(accessToken: string, password: string) {
  await authProvider.updatePassword({ accessToken, newPassword: password });

  return true;
}

export async function sendInviteByEmail(
  email: string,
  data?: Record<string, unknown>
) {
  const { url } = await authProvider.generateMagicLink({
    email,
    redirectTo: `${VERCEL_URL}`
  });

  return { data: { properties: { action_link: url }, user: data }, error: null };
}

export async function sendMagicLink(email: string) {
  await authProvider.sendMagicLink({
    email,
    redirectTo: `${VERCEL_URL}`
  });

  return { data: null, error: null };
}

export async function signInWithBypassEmail(
  email: string
): Promise<AuthSession | null> {
  const client = getCarbonServiceClient();
  const { url } = await authProvider.generateMagicLink({
    email,
    redirectTo: `${VERCEL_URL}`
  });
  const token = new URL(url).searchParams.get("token");
  if (!token) return null;

  const providerSession = await authProvider.verifyMagicLinkToken(token);
  const companies = await getCompaniesForUser(client, providerSession.userId);
  const { data: companyRecord } = await client
    .from("company")
    .select("companyGroupId")
    .eq("id", companies?.[0] ?? "")
    .single();

  return makeAuthSession(
    providerSession,
    companies?.[0] ?? "",
    companyRecord?.companyGroupId ?? ""
  );
}

export async function signInWithMagicLinkToken(
  token: string
): Promise<AuthSession | null> {
  const client = getCarbonServiceClient();
  const providerSession = await authProvider.verifyMagicLinkToken(token);
  const companies = await getCompaniesForUser(client, providerSession.userId);
  const companyId = companies?.[0] ?? "";

  const { data: companyRecord } = await client
    .from("company")
    .select("companyGroupId")
    .eq("id", companyId)
    .single();

  return makeAuthSession(
    providerSession,
    companyId,
    companyRecord?.companyGroupId ?? ""
  );
}

export async function signInWithRequest(
  request: Request,
  preferredCompanyId?: string
): Promise<AuthSession | null> {
  const client = getCarbonServiceClient();
  const providerSession = await authProvider.getSessionFromRequest(request);
  if (!providerSession) return null;

  const companies = await getCompaniesForUser(client, providerSession.userId);
  const companyId =
    preferredCompanyId && companies?.includes(preferredCompanyId)
      ? preferredCompanyId
      : (companies?.[0] ?? "");

  const { data: companyRecord } = await client
    .from("company")
    .select("companyGroupId")
    .eq("id", companyId)
    .single();

  return makeAuthSession(
    providerSession,
    companyId,
    companyRecord?.companyGroupId ?? ""
  );
}

export async function signInWithEmail(email: string, password: string) {
  const client = getCarbonServiceClient();
  const providerSession = await authProvider.signInWithPassword({
    email,
    password
  });

  const companies = await getCompaniesForUser(client, providerSession.userId);

  const { data: companyRecord } = await client
    .from("company")
    .select("companyGroupId")
    .eq("id", companies?.[0] ?? "")
    .single();

  return makeAuthSession(
    providerSession,
    companies?.[0] ?? "",
    companyRecord?.companyGroupId ?? ""
  );
}

export async function refreshAccessToken(
  refreshToken?: string,
  companyId?: string,
  companyGroupId?: string
): Promise<AuthSession | null> {
  if (!refreshToken) return null;

  const providerSession = await authProvider.refreshSession(refreshToken);
  const client = getCarbonServiceClient();
  const companies = await getCompaniesForUser(client, providerSession.userId);
  const refreshedCompanyId =
    companyId && companies.includes(companyId)
      ? companyId
      : (companies[0] ?? "");

  if (!refreshedCompanyId) {
    return makeAuthSession(providerSession, "", "");
  }

  const { data: companyRecord } = await client
    .from("company")
    .select("companyGroupId")
    .eq("id", refreshedCompanyId)
    .single();

  return makeAuthSession(
    providerSession,
    refreshedCompanyId,
    companyRecord?.companyGroupId ?? companyGroupId ?? ""
  );
}

export async function verifyAuthSession(authSession: AuthSession) {
  const authAccount = await getAuthAccountByAccessToken(
    authSession.accessToken
  );

  return Boolean(authAccount);
}
