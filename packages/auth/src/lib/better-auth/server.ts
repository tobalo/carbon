import { getPostgresConnectionPool } from "@carbon/database/client";
import { type BetterAuthOptions, betterAuth } from "better-auth";

export const BETTER_AUTH_BASE_PATH = "/api/auth";

export const betterAuthTableNames = {
  account: "better_auth_account",
  session: "better_auth_session",
  user: "better_auth_user",
  verification: "better_auth_verification"
} as const;

type BetterAuthInstance = ReturnType<typeof betterAuth>;

let pool: ReturnType<typeof getPostgresConnectionPool> | undefined;
let auth: BetterAuthInstance | undefined;

function getPool() {
  pool ??= getPostgresConnectionPool(10);
  return pool;
}

function env(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function requireEnv(name: string) {
  const value = env(name);
  if (!value) throw new Error(`${name} is required for Better Auth`);
  return value;
}

function originFromUrl(value: string | null | undefined) {
  if (!value) return undefined;

  try {
    const url = value.includes("://") ? value : `https://${value}`;
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function getTrustedOrigins(request?: Request) {
  const origins = new Set<string>();

  for (const value of [
    env("CARBON_API_URL"),
    env("VERCEL_URL"),
    env("BETTER_AUTH_URL"),
    env("CARBON_APP_URL"),
    env("CARBON_ERP_URL"),
    env("ERP_URL"),
    request?.url,
    request?.headers.get("origin"),
    request?.headers.get("referer")
  ]) {
    const origin = originFromUrl(value);
    if (origin) origins.add(origin);
  }

  return [...origins];
}

function getSocialProviders(): BetterAuthOptions["socialProviders"] {
  const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {};
  const googleClientId = env("CARBON_AUTH_EXTERNAL_GOOGLE_CLIENT_ID");
  const googleClientSecret = env("CARBON_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET");
  const azureClientId = env("CARBON_AUTH_EXTERNAL_AZURE_CLIENT_ID");
  const azureClientSecret = env("CARBON_AUTH_EXTERNAL_AZURE_CLIENT_SECRET");

  if (googleClientId && googleClientSecret) {
    socialProviders.google = {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      disableImplicitSignUp: true
    };
  }

  if (azureClientId && azureClientSecret) {
    socialProviders.microsoft = {
      clientId: azureClientId,
      clientSecret: azureClientSecret,
      disableImplicitSignUp: true
    };
  }

  return Object.keys(socialProviders).length ? socialProviders : undefined;
}

function getBaseURL() {
  for (const value of [
    env("BETTER_AUTH_URL"),
    env("VERCEL_URL"),
    env("CARBON_APP_URL"),
    env("CARBON_ERP_URL"),
    env("ERP_URL")
  ]) {
    const origin = originFromUrl(value);
    if (origin) return origin;
  }
  return undefined;
}

function getBetterAuthOptions(): BetterAuthOptions {
  return {
    appName: "Carbon",
    basePath: BETTER_AUTH_BASE_PATH,
    baseURL: getBaseURL(),
    database: getPool(),
    secret: requireEnv("CARBON_AUTH_JWT_SECRET"),
    trustedOrigins: getTrustedOrigins,
    socialProviders: getSocialProviders(),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true
    },
    user: {
      modelName: betterAuthTableNames.user
    },
    session: {
      modelName: betterAuthTableNames.session
    },
    account: {
      modelName: betterAuthTableNames.account
    },
    verification: {
      modelName: betterAuthTableNames.verification
    },
    rateLimit: {
      enabled: true
    },
    advanced: {
      trustedProxyHeaders: true
    }
  };
}

export function getBetterAuth() {
  auth ??= betterAuth(getBetterAuthOptions());
  return auth;
}

export function handleBetterAuthRequest(request: Request) {
  return getBetterAuth().handler(request);
}
