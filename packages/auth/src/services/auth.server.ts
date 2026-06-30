import { checkApiKeyRateLimit } from "@carbon/database/ratelimit";
import { Edition, Plan } from "@carbon/utils";
import { createHash } from "crypto";
import { redirect } from "react-router";
import { CarbonEdition, STRIPE_BYPASS_COMPANY_IDS } from "../config/env";
import {
  createBetterAuthSessionForUser,
  createBetterAuthUser,
  deleteBetterAuthUser,
  getBetterAuthUserByAccessToken,
  getBetterAuthUserByEmail,
  refreshBetterAuthSession,
  sendBetterAuthMagicLink,
  setBetterAuthUserPassword,
  signInBetterAuthUserWithPassword,
  verifyBetterAuthSession
} from "../lib/better-auth/session.server";
import { getCarbon } from "../lib/carbon";
import { getCarbonAPIKeyClient } from "../lib/carbon/client";
import { getCarbonServiceRole } from "../lib/carbon/client.server";
import type { AuthSession, CarbonClient } from "../types";
import { path } from "../utils/path";
import { error } from "../utils/result";
import { isCarbonOwnedCompany } from "./company.server";
import {
  destroyAuthSession,
  flash,
  requireAuthSession
} from "./session.server";
import { getCompaniesForUser } from "./users";
import { getUserClaims } from "./users.server";

export { getBetterAuthCallbackSession } from "../lib/better-auth/session.server";

export async function createEmailAuthAccount(
  email: string,
  password: string,
  meta?: Record<string, unknown>
) {
  const user = await createBetterAuthUser({
    id: typeof meta?.id === "string" ? meta.id : undefined,
    email,
    password,
    emailVerified: true,
    firstName: typeof meta?.firstName === "string" ? meta.firstName : "",
    lastName: typeof meta?.lastName === "string" ? meta.lastName : "",
    name: typeof meta?.name === "string" ? meta.name : undefined
  });

  return user;
}

export async function deleteAuthAccount(client: CarbonClient, userId: string) {
  const [authDelete, userDelete] = await Promise.all([
    deleteBetterAuthUser(userId).then(
      () => ({ error: null }),
      (error) => ({
        error: {
          message: error instanceof Error ? error.message : String(error)
        }
      })
    ),
    client.from("user").delete().eq("id", userId)
  ]);

  if (authDelete.error || userDelete.error) return null;

  return true;
}

export async function getAuthAccountByAccessToken(accessToken: string) {
  const user = await getBetterAuthUserByAccessToken(accessToken);

  return user;
}

/** Hash an API key using SHA-256 for secure storage/lookup */
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/** Hash an OAuth token or secret using SHA-256 for secure storage/lookup */
export function hashOAuthSecret(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
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

function getCompanyIdFromAPIKey(apiKey: string) {
  const serviceRole = getCarbonServiceRole();
  const keyHash = hashApiKey(apiKey);
  return serviceRole
    .from("apiKey")
    .select(
      "id, companyId, ...company(companyGroupId), createdBy, scopes, rateLimit, rateLimitWindow, expiresAt"
    )
    .eq("keyHash", keyHash)
    .single();
}

/**
 * Determines the effective user based on console mode and pin-in state.
 * If console mode is on and an operator is pinned in, returns
 * the operator's ID. Otherwise returns the session user's ID.
 *
 * Console mode is read from the auth session; pin-in state is
 * still read from the `console-pin-{companyId}` cookie.
 */
function getEffectiveUser(
  request: Request,
  companyId: string,
  sessionUserId: string,
  consoleMode: boolean
): string {
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

  try {
    const pinIn = JSON.parse(pinRaw);
    const elapsed = Date.now() - pinIn.pinnedAt;
    if (elapsed > 3600000) return sessionUserId;
    return pinIn.userId ?? sessionUserId;
  } catch {
    return sessionUserId;
  }
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
  client: CarbonClient;
  companyId: string;
  companyGroupId: string;
  email: string;
  userId: string;
  sessionUserId: string;
  consoleMode: boolean;
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
      const serviceRole = getCarbonServiceRole();
      const rl = await checkApiKeyRateLimit(
        serviceRole,
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
      void serviceRole
        .from("apiKey")
        .update({ lastUsedAt: new Date().toISOString() } as any)
        .eq("id" as any, apiKeyData.id);

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
          const { data: planData } = await serviceRole
            .from("companyPlan")
            .select("planId")
            .eq("id", companyId)
            .single();

          if (
            planData?.planId === Plan.Starter &&
            !(await isCarbonOwnedCompany(companyId))
          ) {
            throw new Response(
              "API access requires the Business plan and above. Please upgrade your plan to use API keys.",
              { status: 403 }
            );
          }
        }
      }

      const client = getCarbonAPIKeyClient(apiKey);

      return {
        client,
        companyId,
        companyGroupId,
        userId,
        sessionUserId: userId,
        email: "",
        consoleMode: false
      };
    }
  }

  const authSession = await requireAuthSession(request);
  const { accessToken, companyId, companyGroupId, email, userId } = authSession;
  const consoleMode = authSession.console === companyId;

  const myClaims = await getUserClaims(userId, companyId);

  // early exit if no requiredPermissions are required
  if (Object.keys(requiredPermissions).length === 0) {
    return {
      client:
        requiredPermissions.bypassRls && myClaims.role === "employee"
          ? getCarbonServiceRole()
          : getCarbon(accessToken),
      companyId,
      companyGroupId,
      email,
      userId: getEffectiveUser(request, companyId, userId, consoleMode),
      sessionUserId: userId,
      consoleMode
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
        ? getCarbonServiceRole()
        : getCarbon(accessToken),
    companyId,
    companyGroupId,
    email,
    userId: getEffectiveUser(request, companyId, userId, consoleMode),
    sessionUserId: userId,
    consoleMode
  };
}

export async function resetPassword(accessToken: string, password: string) {
  const user = await getBetterAuthUserByAccessToken(accessToken);
  if (!user) return null;

  return setBetterAuthUserPassword(user.id, password);
}

export async function setAuthAccountPassword(userId: string, password: string) {
  return setBetterAuthUserPassword(userId, password);
}

export async function sendInviteByEmail(
  email: string,
  data?: Record<string, unknown>
) {
  return sendBetterAuthMagicLink(
    email,
    typeof data?.redirectTo === "string" ? data.redirectTo : undefined
  );
}

export async function sendMagicLink(email: string, redirectTo?: string) {
  return sendBetterAuthMagicLink(email, redirectTo);
}

async function getDefaultCompanyForUser(
  userId: string,
  preferredCompanyId?: string,
  preferredCompanyGroupId?: string
) {
  if (preferredCompanyId) {
    return {
      companyId: preferredCompanyId,
      companyGroupId: preferredCompanyGroupId ?? ""
    };
  }

  const client = getCarbonServiceRole();
  const companies = await getCompaniesForUser(client, userId);
  const companyId = companies?.[0] ?? "";
  const { data: companyRecord } = await client
    .from("company")
    .select("companyGroupId")
    .eq("id", companyId)
    .single();

  return {
    companyId,
    companyGroupId: companyRecord?.companyGroupId ?? ""
  };
}

export async function signInWithBypassEmail(
  email: string,
  preferredCompanyId?: string,
  preferredCompanyGroupId?: string
): Promise<AuthSession | null> {
  const user = await getBetterAuthUserByEmail(email);
  if (!user) return null;

  const { companyId, companyGroupId } = await getDefaultCompanyForUser(
    user.id,
    preferredCompanyId,
    preferredCompanyGroupId
  );

  return createBetterAuthSessionForUser(user.id, companyId, companyGroupId);
}

export async function signInWithEmail(email: string, password: string) {
  const user = await getBetterAuthUserByEmail(email);
  if (!user) return null;

  const { companyId, companyGroupId } = await getDefaultCompanyForUser(user.id);

  return signInBetterAuthUserWithPassword(
    email,
    password,
    companyId,
    companyGroupId
  );
}

export async function refreshAccessToken(
  refreshToken?: string,
  companyId?: string,
  companyGroupId?: string
): Promise<AuthSession | null> {
  if (!refreshToken) return null;

  return refreshBetterAuthSession(refreshToken, companyId!, companyGroupId!);
}

export async function verifyAuthSession(authSession: AuthSession) {
  return verifyBetterAuthSession(authSession);
}

export async function signInWithPasskey(
  userId: string,
  email: string
): Promise<AuthSession | null> {
  const user = await getBetterAuthUserByEmail(email);
  if (!user || user.id !== userId) return null;

  const { companyId, companyGroupId } = await getDefaultCompanyForUser(userId);
  return createBetterAuthSessionForUser(userId, companyId, companyGroupId);
}
