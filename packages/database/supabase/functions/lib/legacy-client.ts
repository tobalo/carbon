export type LegacyPostgrestClient = {
  from(table: string): any;
  rpc(functionName: string, args?: Record<string, unknown>): any;
  auth: {
    setSession(session: {
      access_token: string;
      refresh_token: string;
    }): PromiseLike<unknown>;
    getUser(): PromiseLike<{ data?: { user?: { id?: string } | null } | null }>;
  };
};
