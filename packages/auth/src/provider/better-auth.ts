import { dbService } from "@carbon/database/drizzle";
import {
  authAccountTable,
  authSchema,
  authSessionTable,
  authUserTable
} from "@carbon/database/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { hashPassword } from "better-auth/crypto";
import { admin, bearer, magicLink } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import {
  AZURE_CLIENT_ID,
  AZURE_CLIENT_SECRET,
  BETTER_AUTH_SECRET,
  ERP_URL,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  SESSION_MAX_AGE
} from "../config/env";
import { getCarbonServiceClient } from "../lib/carbon/client.server";
import type { AuthProvider, Session, User } from "./types";

type BetterAuthSession = {
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  session?: {
    token?: string;
    expiresAt?: string | Date;
  };
  user?: { id: string; email: string; emailVerified?: boolean };
  expiresAt?: string | Date;
};

const MAGIC_LINK_REQUEST_ID_KEY = "magicLinkRequestId";
const generatedMagicLinks = new Map<string, string>();

type AuthUserRow = typeof authUserTable.$inferSelect;

function toProviderUser(user: AuthUserRow | undefined): User | null {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    metadata: {}
  };
}

function getGeneratedMagicLinkKey(
  email: string,
  metadata?: Record<string, unknown>
) {
  const requestId = metadata?.[MAGIC_LINK_REQUEST_ID_KEY];
  return typeof requestId === "string" && requestId
    ? requestId
    : email.toLowerCase();
}

async function getExistingCarbonUserIdByEmail(email: string) {
  const normalizedEmail = email.toLowerCase();
  const existing = await getCarbonServiceClient()
    .from("user")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existing.error) {
    throw new Error(
      `Failed to read Carbon user ${normalizedEmail}: ${existing.error.message}`
    );
  }

  return existing.data?.id ?? null;
}

export const betterAuthServer = betterAuth({
  database: drizzleAdapter(dbService, {
    provider: "pg",
    schema: authSchema
  }),
  user: {
    modelName: "authUser"
  },
  session: {
    modelName: "authSession"
  },
  account: {
    modelName: "authAccount"
  },
  verification: {
    modelName: "authVerification"
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (typeof user.email !== "string") return;

          const existingCarbonUserId = await getExistingCarbonUserIdByEmail(
            user.email
          );
          if (!existingCarbonUserId) return;

          return { data: { id: existingCarbonUserId } };
        }
      }
    }
  },
  secret: BETTER_AUTH_SECRET,
  baseURL: ERP_URL,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true
  },
  socialProviders: {
    google: GOOGLE_CLIENT_ID
      ? {
          clientId: GOOGLE_CLIENT_ID,
          clientSecret: GOOGLE_CLIENT_SECRET ?? ""
        }
      : undefined,
    microsoft: AZURE_CLIENT_ID
      ? {
          clientId: AZURE_CLIENT_ID,
          clientSecret: AZURE_CLIENT_SECRET ?? ""
        }
      : undefined
  },
  plugins: [
    admin(),
    bearer(),
    magicLink({
      sendMagicLink: async ({ email, url, metadata }) => {
        generatedMagicLinks.set(getGeneratedMagicLinkKey(email, metadata), url);
      }
    })
  ]
});

const authApi = betterAuthServer.api as Record<
  string,
  ((args?: any) => any) | undefined
>;

function callAuthApi<T>(name: string, args?: unknown): Promise<T> {
  const endpoint = authApi[name];
  if (!endpoint)
    throw new Error(`Better Auth endpoint is unavailable: ${name}`);
  return endpoint(args) as Promise<T>;
}

function normalizeSession(session: BetterAuthSession | null): Session | null {
  if (!session?.user?.id || !session.user.email) return null;

  const accessToken =
    session.accessToken ?? session.token ?? session.session?.token ?? "";
  if (!accessToken) return null;

  return {
    accessToken,
    refreshToken: session.refreshToken ?? accessToken,
    userId: session.user.id,
    email: session.user.email,
    expiresAt: session.expiresAt
      ? new Date(session.expiresAt)
      : session.session?.expiresAt
        ? new Date(session.session.expiresAt)
        : new Date(Date.now() + SESSION_MAX_AGE * 1000)
  };
}

export class BetterAuthProvider implements AuthProvider {
  async createUser(args: {
    email: string;
    password?: string;
    emailVerified?: boolean;
    id?: string;
    metadata?: Record<string, unknown>;
  }) {
    const password = args.password ?? crypto.randomUUID();
    const data = {
      ...args.metadata,
      ...(args.id ? { id: args.id } : {}),
      ...(args.emailVerified !== undefined
        ? { emailVerified: args.emailVerified }
        : {})
    };
    const result = await callAuthApi<{ user?: { id: string } }>("createUser", {
      body: {
        email: args.email,
        password,
        name: args.email,
        data
      }
    });

    if (!result.user?.id) {
      throw new Error(`Failed to create Better Auth user for ${args.email}`);
    }

    if (args.id && result.user.id !== args.id) {
      await this.deleteUser(result.user.id).catch(() => undefined);
      throw new Error(
        `Better Auth created user ${result.user.id} instead of requested user ${args.id}`
      );
    }

    return { userId: result.user.id };
  }

  async deleteUser(userId: string) {
    await dbService.delete(authUserTable).where(eq(authUserTable.id, userId));
  }

  async getUserById(userId: string): Promise<User | null> {
    const [user] = await dbService
      .select()
      .from(authUserTable)
      .where(eq(authUserTable.id, userId))
      .limit(1);

    return toProviderUser(user);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const [user] = await dbService
      .select()
      .from(authUserTable)
      .where(eq(authUserTable.email, email.toLowerCase()))
      .limit(1);

    return toProviderUser(user);
  }

  async adminSetPassword(userId: string, password: string) {
    const hashedPassword = await hashPassword(password);
    const now = new Date();
    const [account] = await dbService
      .select({ id: authAccountTable.id })
      .from(authAccountTable)
      .where(
        and(
          eq(authAccountTable.userId, userId),
          eq(authAccountTable.providerId, "credential")
        )
      )
      .limit(1);

    if (account) {
      await dbService
        .update(authAccountTable)
        .set({ password: hashedPassword, updatedAt: now })
        .where(eq(authAccountTable.id, account.id));
      return;
    }

    await dbService.insert(authAccountTable).values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: hashedPassword,
      createdAt: now,
      updatedAt: now
    });
  }

  async signInWithPassword(args: { email: string; password: string }) {
    const session = normalizeSession(
      await callAuthApi<BetterAuthSession>("signInEmail", {
        body: args
      })
    );

    if (!session) throw new Error("Better Auth email sign-in failed");
    return session;
  }

  async sendMagicLink(args: {
    email: string;
    redirectTo: string;
    metadata?: Record<string, unknown>;
  }) {
    await callAuthApi("signInMagicLink", {
      headers: new Headers(),
      body: {
        email: args.email.toLowerCase(),
        callbackURL: args.redirectTo,
        metadata: args.metadata
      }
    });
  }

  async generateMagicLink(args: { email: string; redirectTo: string }) {
    const requestId = crypto.randomUUID();
    await this.sendMagicLink({
      ...args,
      metadata: { [MAGIC_LINK_REQUEST_ID_KEY]: requestId }
    });
    const url = generatedMagicLinks.get(requestId);
    if (!url) throw new Error("Better Auth did not generate a magic link");
    generatedMagicLinks.delete(requestId);
    return { url };
  }

  async verifyMagicLinkToken(token: string) {
    const session = normalizeSession(
      await callAuthApi<BetterAuthSession>("magicLinkVerify", {
        headers: new Headers(),
        query: { token }
      })
    );

    if (!session) throw new Error("Better Auth magic link verification failed");
    return session;
  }

  async refreshSession(refreshToken: string) {
    const session = await this.getSessionByAccessToken(refreshToken);

    if (!session) throw new Error("Better Auth session refresh failed");
    return session;
  }

  async getSessionByAccessToken(accessToken: string) {
    return normalizeSession(
      await callAuthApi<BetterAuthSession>("getSession", {
        headers: new Headers({ Authorization: `Bearer ${accessToken}` })
      })
    );
  }

  async getSessionFromRequest(request: Request) {
    return normalizeSession(
      await callAuthApi<BetterAuthSession>("getSession", {
        headers: request.headers
      })
    );
  }

  async revokeSession(accessToken: string) {
    await dbService
      .delete(authSessionTable)
      .where(eq(authSessionTable.token, accessToken));
  }

  async updatePassword(args: { accessToken: string; newPassword: string }) {
    const session = await this.getSessionByAccessToken(args.accessToken);
    if (!session) throw new Error("Invalid access token");
    await this.adminSetPassword(session.userId, args.newPassword);
  }
}
