export type LegacyPostgrestFunctionsClient = {
  from(table: string): any;
  rpc(functionName: string, args?: Record<string, unknown>): any;
  functions: {
    invoke<T = unknown>(
      name: string,
      options?: {
        body?: unknown;
        headers?: Record<string, string>;
        region?: unknown;
      }
    ): Promise<{ data: T | null; error: { message: string } | null }>;
  };
};
