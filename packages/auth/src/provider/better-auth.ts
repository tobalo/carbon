import { dbService } from "@carbon/database/drizzle";
import { authSchema } from "@carbon/database/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, bearer, magicLink } from "better-auth/plugins";
import {
  AZURE_CLIENT_ID,
  AZURE_CLIENT_SECRET,
  BETTER_AUTH_SECRET,
  ERP_URL,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  SESSION_MAX_AGE
} from "../config/env";
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

const generatedMagicLinks = new Map<string, string>();

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
      sendMagicLink: async ({ email, url }) => {
        generatedMagicLinks.set(email, url);
      }
    })
  ]
});

const authApi = betterAuthServer.api as Record<string, ((args?: any) => any) | undefined>;

function callAuthApi<T>(name: string, args?: unknown): Promise<T> {
  const endpoint = authApi[name];
  if (!endpoint) throw new Error(`Better Auth endpoint is unavailable: ${name}`);
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

    return { userId: result.user.id };
  }

  async deleteUser(userId: string) {
    await callAuthApi("removeUser", {
      body: { userId }
    });
  }

  async getUserById(userId: string): Promise<User | null> {
    const result = await callAuthApi<User | null>("getUser", {
      query: { id: userId }
    });

    return result;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const result = await callAuthApi<{ users?: User[] }>("listUsers", {
      query: { searchField: "email", searchValue: email, searchOperator: "eq" }
    });

    return result.users?.[0] ?? null;
  }

  async adminSetPassword(userId: string, password: string) {
    await callAuthApi("setUserPassword", {
      body: { userId, newPassword: password }
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

  async sendMagicLink(args: { email: string; redirectTo: string }) {
    await callAuthApi("signInMagicLink", {
      headers: new Headers(),
      body: {
        email: args.email,
        callbackURL: args.redirectTo
      }
    });
  }

  async generateMagicLink(args: { email: string; redirectTo: string }) {
    await this.sendMagicLink(args);
    const url = generatedMagicLinks.get(args.email);
    if (!url) throw new Error("Better Auth did not generate a magic link");
    generatedMagicLinks.delete(args.email);
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
    await callAuthApi("revokeSession", {
      headers: new Headers({ Authorization: `Bearer ${accessToken}` }),
      body: { token: accessToken }
    });
  }

  async updatePassword(args: { accessToken: string; newPassword: string }) {
    await callAuthApi("changePassword", {
      body: { newPassword: args.newPassword },
      headers: new Headers({ Authorization: `Bearer ${args.accessToken}` })
    });
  }

}
