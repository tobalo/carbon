export type JobQueryClient = {
  from(table: string): any;
  rpc(fn: string, params?: Record<string, unknown>): any;
};
