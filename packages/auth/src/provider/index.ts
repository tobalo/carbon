import { AUTH_PROVIDER } from "../config/env";
import { betterAuthServer, BetterAuthProvider } from "./better-auth";
import type { AuthProvider } from "./types";

if (AUTH_PROVIDER !== "better_auth") {
  throw new Error(`Unsupported AUTH_PROVIDER: ${AUTH_PROVIDER}`);
}

export const authProvider: AuthProvider = new BetterAuthProvider();
export { betterAuthServer };
export type { AuthProvider, Session, User } from "./types";
