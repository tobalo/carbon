import { createHash, randomBytes } from "node:crypto";
import { sendEmail } from "@carbon/lib/resend.server";
import { jwtVerify, SignJWT } from "jose";
import {
  CARBON_AUTH_JWT_SECRET,
  REFRESH_ACCESS_TOKEN_THRESHOLD,
  RESEND_DOMAIN,
  VERCEL_URL
} from "../../config/env";
import type { AuthSession } from "../../types";
import { getCarbonServiceRole } from "../carbon/client.server";
import { getBetterAuth } from "./server";

const ACCESS_TOKEN_EXPIRES_IN = 60 * 60;
const MAGIC_LINK_EXPIRES_IN = 5 * 60;
const MAGIC_LINK_IDENTIFIER_PREFIX = "carbon-magic-link:";

type BetterAuthContext = Awaited<ReturnType<typeof getBetterAuth>["$context"]>;
type BetterAuthUser = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  emailVerified?: boolean;
};
type BetterAuthSession = {
  token: string;
  userId: string;
  expiresAt: Date | string | number;
};
type BetterAuthSessionRecord = {
  session: BetterAuthSession;
  user: BetterAuthUser;
};

type CreateAuthUserOptions = {
  id?: string;
  email: string;
  password?: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  image?: string | null;
  emailVerified?: boolean;
};

function requireJwtSecret() {
  if (!CARBON_AUTH_JWT_SECRET) {
    throw new Error("CARBON_AUTH_JWT_SECRET is required for Carbon auth");
  }
  return new TextEncoder().encode(CARBON_AUTH_JWT_SECRET);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function splitName(name: string | null | undefined) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" ")
  };
}

function getDisplayName(options: CreateAuthUserOptions) {
  const explicitName = options.name?.trim();
  if (explicitName) return explicitName;
  return [options.firstName, options.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
}

function getNameParts(options: CreateAuthUserOptions | BetterAuthUser) {
  if ("firstName" in options || "lastName" in options) {
    const firstName = options.firstName?.trim() ?? "";
    const lastName = options.lastName?.trim() ?? "";
    if (firstName || lastName) return { firstName, lastName };
  }
  return splitName(options.name);
}

function getMagicLinkIdentifier(token: string) {
  const hash = createHash("sha256").update(token).digest("hex");
  return `${MAGIC_LINK_IDENTIFIER_PREFIX}${hash}`;
}

function getCallbackBaseURL() {
  const value = VERCEL_URL?.trim();
  if (!value) return null;
  if (value.includes("://")) return value;
  if (value.startsWith("localhost") || value.startsWith("127.0.0.1")) {
    return `http://${value}`;
  }
  return `https://${value}`;
}

async function getBetterAuthContext(): Promise<BetterAuthContext> {
  return getBetterAuth().$context;
}

async function ensurePublicUser(
  user: BetterAuthUser,
  options: Partial<CreateAuthUserOptions> = {}
) {
  const { firstName, lastName } = getNameParts({
    ...user,
    ...(options as Partial<CreateAuthUserOptions>)
  });
  const serviceRole = getCarbonServiceRole();
  const email = normalizeEmail(user.email);

  const publicUser = await serviceRole.from("user").upsert([
    {
      id: user.id,
      email,
      active: true,
      firstName,
      lastName,
      avatarUrl: user.image ?? null,
      about: ""
    }
  ]);
  if (publicUser.error) throw new Error(publicUser.error.message);

  const publicUserPermission = await serviceRole
    .from("userPermission")
    .upsert([{ id: user.id }]);
  if (publicUserPermission.error) {
    throw new Error(publicUserPermission.error.message);
  }
}

async function linkCredentialAccount(
  ctx: BetterAuthContext,
  userId: string,
  password: string
) {
  const hashedPassword = await ctx.password.hash(password);
  const accounts = await ctx.internalAdapter.findAccounts(userId);
  const existingCredential = accounts.find(
    (account) => account.providerId === "credential"
  );

  if (existingCredential) {
    await ctx.internalAdapter.updatePassword(userId, hashedPassword);
    return;
  }

  await ctx.internalAdapter.linkAccount({
    accountId: userId,
    providerId: "credential",
    password: hashedPassword,
    userId
  });
}

async function mintCarbonAccessToken(user: BetterAuthUser) {
  const secret = requireJwtSecret();
  return new SignJWT({
    sub: user.id,
    email: user.email,
    aud: "authenticated",
    role: "authenticated"
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_EXPIRES_IN}s`)
    .sign(secret);
}

async function toAuthSession(
  record: BetterAuthSessionRecord,
  companyId: string,
  companyGroupId: string
): Promise<AuthSession> {
  return {
    accessToken: await mintCarbonAccessToken(record.user),
    refreshToken: record.session.token,
    userId: record.user.id,
    companyId,
    companyGroupId,
    email: record.user.email,
    expiresIn: ACCESS_TOKEN_EXPIRES_IN - REFRESH_ACCESS_TOKEN_THRESHOLD,
    expiresAt: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_EXPIRES_IN
  };
}

function isSessionExpired(session: BetterAuthSession) {
  return new Date(session.expiresAt).getTime() <= Date.now();
}

export async function createBetterAuthUser(options: CreateAuthUserOptions) {
  const ctx = await getBetterAuthContext();
  const email = normalizeEmail(options.email);

  if (await ctx.internalAdapter.findUserByEmail(email)) return null;

  const user = (await ctx.internalAdapter.createUser({
    ...(options.id ? { id: options.id } : {}),
    email,
    emailVerified: options.emailVerified ?? true,
    image: options.image ?? null,
    name: getDisplayName(options)
  })) as BetterAuthUser | null;

  if (!user) return null;

  if (options.password) {
    await linkCredentialAccount(ctx, user.id, options.password);
  }

  try {
    await ensurePublicUser(user, options);
  } catch (error) {
    await ctx.internalAdapter.deleteUser(user.id);
    throw error;
  }

  return user;
}

export async function deleteBetterAuthUser(userId: string) {
  const ctx = await getBetterAuthContext();
  await ctx.internalAdapter.deleteUserSessions(userId);
  await ctx.internalAdapter.deleteUser(userId);
}

export async function setBetterAuthUserPassword(
  userId: string,
  password: string
) {
  const ctx = await getBetterAuthContext();
  const user = (await ctx.internalAdapter.findUserById(
    userId
  )) as BetterAuthUser | null;
  if (!user) return false;

  await linkCredentialAccount(ctx, userId, password);
  return true;
}

export async function getBetterAuthUserById(userId: string) {
  const ctx = await getBetterAuthContext();
  return (await ctx.internalAdapter.findUserById(
    userId
  )) as BetterAuthUser | null;
}

export async function getBetterAuthUserByEmail(email: string) {
  const ctx = await getBetterAuthContext();
  const result = await ctx.internalAdapter.findUserByEmail(
    normalizeEmail(email)
  );
  return (result?.user ?? null) as BetterAuthUser | null;
}

export async function getBetterAuthUserByAccessToken(accessToken: string) {
  try {
    const { payload } = await jwtVerify(accessToken, requireJwtSecret(), {
      audience: "authenticated"
    });
    if (typeof payload.sub !== "string") return null;
    return getBetterAuthUserById(payload.sub);
  } catch {
    return null;
  }
}

export async function signInBetterAuthUserWithPassword(
  email: string,
  password: string,
  companyId: string,
  companyGroupId: string
) {
  const ctx = await getBetterAuthContext();
  const authUser = await ctx.internalAdapter.findUserByEmail(
    normalizeEmail(email),
    { includeAccounts: true }
  );
  if (!authUser) return null;

  const credential = authUser.accounts.find(
    (account) => account.providerId === "credential"
  );
  if (!credential?.password) return null;

  const isValid = await ctx.password.verify({
    hash: credential.password,
    password
  });
  if (!isValid) return null;

  const session = (await ctx.internalAdapter.createSession(
    authUser.user.id
  )) as BetterAuthSession | null;
  if (!session) return null;

  return toAuthSession(
    { session, user: authUser.user as BetterAuthUser },
    companyId,
    companyGroupId
  );
}

export async function createBetterAuthSessionForUser(
  userId: string,
  companyId: string,
  companyGroupId: string
) {
  const ctx = await getBetterAuthContext();
  const user = (await ctx.internalAdapter.findUserById(
    userId
  )) as BetterAuthUser | null;
  if (!user) return null;

  const session = (await ctx.internalAdapter.createSession(
    user.id
  )) as BetterAuthSession | null;
  if (!session) return null;

  return toAuthSession({ session, user }, companyId, companyGroupId);
}

export async function refreshBetterAuthSession(
  sessionToken: string,
  companyId: string,
  companyGroupId: string
) {
  const ctx = await getBetterAuthContext();
  const record = (await ctx.internalAdapter.findSession(
    sessionToken
  )) as BetterAuthSessionRecord | null;
  if (!record || isSessionExpired(record.session)) return null;

  return toAuthSession(record, companyId, companyGroupId);
}

export async function verifyBetterAuthSession(authSession: AuthSession) {
  const ctx = await getBetterAuthContext();
  const record = (await ctx.internalAdapter.findSession(
    authSession.refreshToken
  )) as BetterAuthSessionRecord | null;
  if (!record || isSessionExpired(record.session)) return false;

  const user = await getBetterAuthUserByAccessToken(authSession.accessToken);
  return Boolean(user && user.id === record.user.id);
}

export async function sendBetterAuthMagicLink(
  email: string,
  redirectTo?: string
) {
  try {
    const ctx = await getBetterAuthContext();
    const normalizedEmail = normalizeEmail(email);
    const user = await ctx.internalAdapter.findUserByEmail(normalizedEmail);
    if (!user?.user) {
      return { data: null, error: { message: "User not found" } };
    }

    const token = randomBytes(32).toString("base64url");
    await ctx.internalAdapter.createVerificationValue({
      identifier: getMagicLinkIdentifier(token),
      value: JSON.stringify({ email: normalizedEmail }),
      expiresAt: new Date(Date.now() + MAGIC_LINK_EXPIRES_IN * 1000)
    });

    const callbackBaseURL = getCallbackBaseURL();
    if (!callbackBaseURL) {
      return { data: null, error: { message: "VERCEL_URL is not configured" } };
    }

    const url = new URL("/callback", callbackBaseURL);
    url.searchParams.set("token", token);
    if (redirectTo) url.searchParams.set("redirectTo", redirectTo);

    const html = [
      "<p>Sign in to Carbon by clicking the link below.</p>",
      `<p><a href="${url.toString()}">Sign in to Carbon</a></p>`,
      "<p>This link expires in 5 minutes.</p>"
    ].join("");

    const result = await sendEmail({
      from: `Carbon <no-reply@${RESEND_DOMAIN}>`,
      to: normalizedEmail,
      subject: "Sign in to Carbon",
      html
    });

    if (result.error) return { data: null, error: result.error };
    return { data: { status: true }, error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

export async function consumeBetterAuthMagicLink(token: string) {
  const ctx = await getBetterAuthContext();
  const record = await ctx.internalAdapter.consumeVerificationValue(
    getMagicLinkIdentifier(token)
  );
  if (!record || new Date(record.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  const parsed = JSON.parse(record.value) as { email?: string };
  if (!parsed.email) return null;

  const authUser = await ctx.internalAdapter.findUserByEmail(parsed.email);
  if (!authUser?.user) return null;

  const session = (await ctx.internalAdapter.createSession(
    authUser.user.id
  )) as BetterAuthSession | null;
  if (!session) return null;

  return {
    refreshToken: session.token,
    userId: authUser.user.id,
    email: authUser.user.email
  };
}

export async function getBetterAuthCallbackSession(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (token) return consumeBetterAuthMagicLink(token);

  const session = await getBetterAuth().api.getSession({
    headers: request.headers
  });
  if (!session?.session || !session.user) return null;

  return {
    refreshToken: session.session.token,
    userId: session.user.id,
    email: session.user.email
  };
}
