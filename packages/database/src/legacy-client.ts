export type LegacyPostgrestClient = {
  from(table: string): any;
  rpc(functionName: string, args?: Record<string, unknown>): any;
};
