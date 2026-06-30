export type LegacyRealtimeSubscribeStatus =
  | "SUBSCRIBED"
  | "TIMED_OUT"
  | "CLOSED"
  | "CHANNEL_ERROR";

export type LegacyRealtimeChannel = {
  on(
    type: string,
    filter: Record<string, unknown>,
    callback: (payload: any) => void
  ): LegacyRealtimeChannel;
  on(type: string, callback: (payload: any) => void): LegacyRealtimeChannel;
  on(...args: any[]): LegacyRealtimeChannel;
  subscribe(
    callback?: (
      status: LegacyRealtimeSubscribeStatus,
      error?: unknown
    ) => void | Promise<void>
  ): LegacyRealtimeChannel;
  unsubscribe(): Promise<unknown>;
};

export type LegacyCarbonClient = {
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
  realtime: {
    setAuth(accessToken: string): void | Promise<void>;
  };
  channel(topic: string): any;
  removeChannel(channel: any): Promise<unknown>;
  [property: string]: any;
};
