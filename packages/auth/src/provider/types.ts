export type User = {
  id: string;
  email: string;
  emailVerified: boolean;
  metadata?: Record<string, unknown>;
};

export type Session = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  expiresAt: Date;
};

export interface AuthProvider {
  createUser(args: {
    email: string;
    password?: string;
    emailVerified?: boolean;
    id?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ userId: string }>;
  deleteUser(userId: string): Promise<void>;
  getUserById(userId: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  adminSetPassword(userId: string, password: string): Promise<void>;
  signInWithPassword(args: {
    email: string;
    password: string;
  }): Promise<Session>;
  sendMagicLink(args: {
    email: string;
    redirectTo: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  generateMagicLink(args: {
    email: string;
    redirectTo: string;
  }): Promise<{ url: string }>;
  verifyMagicLinkToken(token: string): Promise<Session>;
  refreshSession(refreshToken: string): Promise<Session>;
  getSessionByAccessToken(accessToken: string): Promise<Session | null>;
  getSessionFromRequest(request: Request): Promise<Session | null>;
  revokeSession(accessToken: string): Promise<void>;
  updatePassword(args: {
    accessToken: string;
    newPassword: string;
  }): Promise<void>;
}
