import type { MutableRefObject } from "react";
import type { StoreApi } from "zustand";
import { CARBON_API_URL, CARBON_PUBLIC_KEY } from "../../config/env";

const PER_ATTEMPT_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 2;
const BACKOFF_MS = [500, 1000];
const RETRYABLE_STATUS = new Set([500, 502, 503, 504, 512, 408, 524]);
const REALTIME_SUBSCRIBE_STATES = {
  SUBSCRIBED: "SUBSCRIBED",
  TIMED_OUT: "TIMED_OUT",
  CLOSED: "CLOSED",
  CHANNEL_ERROR: "CHANNEL_ERROR"
} as const;

type QueryResult<T = Record<string, any>[]> = {
  data: T;
  error: CarbonPostgrestError | null;
  count?: number | null;
  status?: number;
  statusText?: string;
};
type CarbonPostgrestError = {
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};
type AuthResult<T = any> = {
  data: T;
  error: CarbonAuthError | null;
};
type CarbonAuthError = {
  message: string;
  status?: number;
  name?: string;
};
type ClientOptions = {
  accessToken?: string;
  headers?: Record<string, string>;
};
type FetchOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};
type RealtimeStatus =
  (typeof REALTIME_SUBSCRIBE_STATES)[keyof typeof REALTIME_SUBSCRIBE_STATES];
type RealtimeSubscribeCallback = (
  status: RealtimeStatus,
  error?: unknown
) => void | Promise<void>;
type RealtimeBinding = {
  type: string;
  filter?: Record<string, unknown>;
  callback: (payload: any) => void;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const fetchWithRetry: typeof fetch = async (input, init) => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const timeoutSignal = AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS);
    const signal = init?.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;

    try {
      const response = await fetch(input, { ...init, signal });
      if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_RETRIES) {
        await sleep(BACKOFF_MS[attempt] ?? 1000);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (init?.signal?.aborted) throw error;
      if (attempt >= MAX_RETRIES) throw error;
      await sleep(BACKOFF_MS[attempt] ?? 1000);
    }
  }
  throw lastError;
};

function requireApiUrl() {
  if (!CARBON_API_URL) {
    throw new Error("CARBON_API_URL is not configured");
  }
  return CARBON_API_URL.replace(/\/+$/u, "");
}

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/+$/u, "")}/${path.replace(/^\/+/u, "")}`;
}

function parseJson(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function postgrestErrorFromBody(
  body: unknown,
  fallback: string
): CarbonPostgrestError {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    return {
      message: typeof record.message === "string" ? record.message : fallback,
      details: typeof record.details === "string" ? record.details : null,
      hint: typeof record.hint === "string" ? record.hint : null,
      code: typeof record.code === "string" ? record.code : null
    };
  }
  return { message: typeof body === "string" ? body : fallback };
}

function authErrorFromBody(body: unknown, response: Response): CarbonAuthError {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const message =
      record.msg ?? record.message ?? record.error_description ?? record.error;
    return {
      message: typeof message === "string" ? message : response.statusText,
      status: response.status,
      name: typeof record.error === "string" ? record.error : undefined
    };
  }
  return {
    message: typeof body === "string" ? body : response.statusText,
    status: response.status
  };
}

function encodeFilterValue(value: unknown): string {
  if (value === null) return "null";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value))
    return `{${value.map(encodeFilterValue).join(",")}}`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function encodeInValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function mergePrefer(
  headers: Record<string, string>,
  value: string | undefined
) {
  if (!value) return;
  headers.Prefer = headers.Prefer ? `${headers.Prefer},${value}` : value;
}

function setPreferReturn(
  headers: Record<string, string>,
  value: "minimal" | "representation"
) {
  const existing = headers.Prefer?.split(",").filter(
    (part) => !part.startsWith("return=")
  );
  headers.Prefer = [...(existing ?? []), `return=${value}`].join(",");
}

function countFromContentRange(value: string | null) {
  if (!value) return null;
  const total = value.split("/")[1];
  if (!total || total === "*") return null;
  const parsed = Number.parseInt(total, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

class CarbonPostgrestQueryBuilder<T = Record<string, any>[]>
  implements PromiseLike<QueryResult<T>>
{
  private method: string;
  private body: unknown;
  private params = new URLSearchParams();
  private headers: Record<string, string> = {};
  private accept = "application/json";
  private signal?: AbortSignal;
  private maybeSingleResult = false;
  private shouldReturnSingle = false;

  constructor(
    private readonly client: CarbonClientImpl,
    private readonly path: string,
    options: {
      method?: string;
      body?: unknown;
      params?: Record<string, string | undefined>;
    } = {}
  ) {
    this.method = options.method ?? "GET";
    this.body = options.body;
    for (const [key, value] of Object.entries(options.params ?? {})) {
      if (value !== undefined) this.params.set(key, value);
    }
  }

  select(
    columns = "*",
    options: { head?: boolean; count?: "exact" | "planned" | "estimated" } = {}
  ) {
    this.params.set("select", columns.replace(/\s+/gu, ""));
    if (this.method !== "GET" && this.method !== "HEAD") {
      setPreferReturn(this.headers, "representation");
    }
    if (options.head) this.method = "HEAD";
    if (options.count) mergePrefer(this.headers, `count=${options.count}`);
    return this;
  }

  insert(
    values: unknown,
    options: {
      count?: "exact" | "planned" | "estimated";
      defaultToNull?: boolean;
    } = {}
  ) {
    this.method = "POST";
    this.body = values;
    setPreferReturn(this.headers, "minimal");
    if (options.count) mergePrefer(this.headers, `count=${options.count}`);
    if (options.defaultToNull === false) {
      mergePrefer(this.headers, "missing=default");
    }
    return this;
  }

  upsert(
    values: unknown,
    options: {
      count?: "exact" | "planned" | "estimated";
      ignoreDuplicates?: boolean;
      onConflict?: string;
      defaultToNull?: boolean;
    } = {}
  ) {
    this.method = "POST";
    this.body = values;
    mergePrefer(
      this.headers,
      `resolution=${options.ignoreDuplicates ? "ignore" : "merge"}-duplicates`
    );
    setPreferReturn(this.headers, "minimal");
    if (options.count) mergePrefer(this.headers, `count=${options.count}`);
    if (options.defaultToNull === false) {
      mergePrefer(this.headers, "missing=default");
    }
    if (options.onConflict) this.params.set("on_conflict", options.onConflict);
    return this;
  }

  update(
    values: unknown,
    options: { count?: "exact" | "planned" | "estimated" } = {}
  ) {
    this.method = "PATCH";
    this.body = values;
    setPreferReturn(this.headers, "minimal");
    if (options.count) mergePrefer(this.headers, `count=${options.count}`);
    return this;
  }

  delete(options: { count?: "exact" | "planned" | "estimated" } = {}) {
    this.method = "DELETE";
    setPreferReturn(this.headers, "minimal");
    if (options.count) mergePrefer(this.headers, `count=${options.count}`);
    return this;
  }

  eq(column: string, value: unknown) {
    return this.filter(column, "eq", value);
  }

  neq(column: string, value: unknown) {
    return this.filter(column, "neq", value);
  }

  gt(column: string, value: unknown) {
    return this.filter(column, "gt", value);
  }

  gte(column: string, value: unknown) {
    return this.filter(column, "gte", value);
  }

  lt(column: string, value: unknown) {
    return this.filter(column, "lt", value);
  }

  lte(column: string, value: unknown) {
    return this.filter(column, "lte", value);
  }

  like(column: string, value: string) {
    return this.filter(column, "like", value);
  }

  ilike(column: string, value: string) {
    return this.filter(column, "ilike", value);
  }

  is(column: string, value: unknown) {
    return this.filter(column, "is", value);
  }

  in(column: string, values: unknown[]) {
    this.params.append(column, `in.(${values.map(encodeInValue).join(",")})`);
    return this;
  }

  contains(column: string, value: unknown) {
    return this.filter(column, "cs", value);
  }

  containedBy(column: string, value: unknown) {
    return this.filter(column, "cd", value);
  }

  overlaps(column: string, value: unknown) {
    return this.filter(column, "ov", value);
  }

  textSearch(
    column: string,
    query: string,
    options: { type?: "plain" | "phrase" | "websearch"; config?: string } = {}
  ) {
    const operator =
      options.type === "plain"
        ? "plfts"
        : options.type === "phrase"
          ? "phfts"
          : options.type === "websearch"
            ? "wfts"
            : "fts";
    const config = options.config ? `(${options.config})` : "";
    this.params.append(column, `${operator}${config}.${query}`);
    return this;
  }

  match(query: Record<string, unknown>) {
    for (const [column, value] of Object.entries(query)) {
      this.eq(column, value);
    }
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    this.params.append(column, `not.${operator}.${encodeFilterValue(value)}`);
    return this;
  }

  or(
    filters: string,
    options: { referencedTable?: string; foreignTable?: string } = {}
  ) {
    const table = options.referencedTable ?? options.foreignTable;
    this.params.append(table ? `${table}.or` : "or", `(${filters})`);
    return this;
  }

  filter(column: string, operator: string, value: unknown) {
    this.params.append(column, `${operator}.${encodeFilterValue(value)}`);
    return this;
  }

  order(
    column: string,
    options: {
      ascending?: boolean;
      nullsFirst?: boolean;
      referencedTable?: string;
      foreignTable?: string;
    } = {}
  ) {
    const table = options.referencedTable ?? options.foreignTable;
    const key = table ? `${table}.order` : "order";
    const direction = options.ascending === false ? "desc" : "asc";
    const nulls =
      options.nullsFirst === undefined
        ? ""
        : options.nullsFirst
          ? ".nullsfirst"
          : ".nullslast";
    this.params.append(key, `${column}.${direction}${nulls}`);
    return this;
  }

  limit(
    count: number,
    options: { referencedTable?: string; foreignTable?: string } = {}
  ) {
    const table = options.referencedTable ?? options.foreignTable;
    this.params.set(table ? `${table}.limit` : "limit", String(count));
    return this;
  }

  range(
    from: number,
    to: number,
    options: { referencedTable?: string; foreignTable?: string } = {}
  ) {
    const table = options.referencedTable ?? options.foreignTable;
    this.params.set(table ? `${table}.offset` : "offset", String(from));
    this.params.set(table ? `${table}.limit` : "limit", String(to - from + 1));
    return this;
  }

  single(): CarbonPostgrestQueryBuilder<Record<string, any>> {
    this.shouldReturnSingle = true;
    this.accept = "application/vnd.pgrst.object+json";
    return this as unknown as CarbonPostgrestQueryBuilder<Record<string, any>>;
  }

  maybeSingle(): CarbonPostgrestQueryBuilder<Record<string, any>> {
    this.shouldReturnSingle = true;
    this.maybeSingleResult = true;
    this.accept = "application/vnd.pgrst.object+json";
    return this as unknown as CarbonPostgrestQueryBuilder<Record<string, any>>;
  }

  abortSignal(signal: AbortSignal) {
    this.signal = signal;
    return this;
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ) {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null) {
    return this.execute().finally(onfinally ?? undefined);
  }

  private async execute(): Promise<QueryResult<T>> {
    const url = new URL(joinUrl(requireApiUrl(), `/rest/v1/${this.path}`));
    for (const [key, value] of this.params.entries()) {
      url.searchParams.append(key, value);
    }

    const headers: Record<string, string> = {
      Accept: this.accept,
      ...this.headers
    };

    if (this.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await this.client.fetch(url.toString(), {
      method: this.method,
      headers,
      body: this.body === undefined ? undefined : JSON.stringify(this.body),
      signal: this.signal
    });
    const text = await response.text();
    const parsed = parseJson(text);
    const count = countFromContentRange(response.headers.get("content-range"));

    if (!response.ok) {
      const error = postgrestErrorFromBody(parsed, response.statusText);
      if (
        this.maybeSingleResult &&
        (response.status === 404 ||
          response.status === 406 ||
          error.code === "PGRST116")
      ) {
        return {
          data: null as T,
          error: null,
          count,
          status: response.status,
          statusText: response.statusText
        };
      }
      return {
        data: null as T,
        error,
        count,
        status: response.status,
        statusText: response.statusText
      };
    }

    return {
      data: parsed as T,
      error: null,
      count,
      status: response.status,
      statusText: response.statusText
    };
  }
}

class CarbonRealtimeChannel {
  readonly bindings: RealtimeBinding[] = [];
  readonly topic: string;
  joinRef: string | null = null;
  state: "closed" | "joining" | "joined" = "closed";
  subscribeCallback?: RealtimeSubscribeCallback;

  constructor(
    private readonly realtime: CarbonRealtimeClient,
    topic: string
  ) {
    this.topic = topic.startsWith("realtime:") ? topic : `realtime:${topic}`;
  }

  on(
    type: string,
    filterOrCallback: Record<string, unknown> | ((payload: any) => void),
    maybeCallback?: (payload: any) => void
  ) {
    const callback =
      typeof filterOrCallback === "function" ? filterOrCallback : maybeCallback;
    if (!callback) return this;

    this.bindings.push({
      type,
      filter:
        typeof filterOrCallback === "function" ? undefined : filterOrCallback,
      callback
    });
    return this;
  }

  subscribe(callback?: RealtimeSubscribeCallback) {
    this.subscribeCallback = callback;
    this.realtime.subscribe(this);
    return this;
  }

  unsubscribe() {
    return this.realtime.unsubscribe(this);
  }

  dispatch(event: string, payload: unknown) {
    const data =
      payload && typeof payload === "object" && "data" in payload
        ? (payload as { data: unknown }).data
        : payload;

    for (const binding of this.bindings) {
      if (binding.type === event || binding.type === "*") {
        binding.callback(data);
      }
    }
  }

  notify(status: RealtimeStatus, error?: unknown) {
    void this.subscribeCallback?.(status, error);
  }

  joinPayload(accessToken: string | null) {
    const postgresChanges = this.bindings
      .filter((binding) => binding.type === "postgres_changes")
      .map((binding) => binding.filter ?? {});

    return {
      config: {
        broadcast: { ack: false, self: false },
        presence: { key: "" },
        postgres_changes: postgresChanges
      },
      access_token: accessToken
    };
  }
}

class CarbonRealtimeClient {
  private socket: WebSocket | null = null;
  private ref = 1;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private readonly channels = new Set<CarbonRealtimeChannel>();
  private readonly pendingJoins = new Map<string, CarbonRealtimeChannel>();
  private accessToken: string | null = null;

  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string
  ) {}

  setAuth(accessToken: string) {
    this.accessToken = accessToken;
    for (const channel of this.channels) {
      if (channel.state === "joined") {
        this.push(channel.topic, "access_token", { access_token: accessToken });
      }
    }
  }

  channel(topic: string) {
    return new CarbonRealtimeChannel(this, topic);
  }

  removeChannel(channel: CarbonRealtimeChannel) {
    return this.unsubscribe(channel);
  }

  subscribe(channel: CarbonRealtimeChannel) {
    this.channels.add(channel);
    if (typeof WebSocket === "undefined") {
      channel.notify(
        REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR,
        new Error("WebSocket is not available")
      );
      return;
    }

    const socket = this.ensureSocket();
    if (socket.readyState === WebSocket.OPEN) {
      this.join(channel);
    }
  }

  async unsubscribe(channel: CarbonRealtimeChannel) {
    this.channels.delete(channel);
    if (channel.state !== "closed") {
      this.push(channel.topic, "phx_leave", {});
    }
    channel.state = "closed";
    channel.notify(REALTIME_SUBSCRIBE_STATES.CLOSED);

    if (this.channels.size === 0) {
      this.closeSocket();
    }
  }

  private ensureSocket() {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.CONNECTING ||
        this.socket.readyState === WebSocket.OPEN)
    ) {
      return this.socket;
    }

    const url = new URL(joinUrl(this.apiUrl, "/realtime/v1/websocket"));
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("apikey", this.apiKey);
    url.searchParams.set("vsn", "1.0.0");

    this.socket = new WebSocket(url.toString());
    this.socket.addEventListener("open", () => {
      this.startHeartbeat();
      for (const channel of this.channels) {
        this.join(channel);
      }
    });
    this.socket.addEventListener("message", (event) => {
      this.handleMessage(event.data);
    });
    this.socket.addEventListener("close", () => {
      this.stopHeartbeat();
      for (const channel of this.channels) {
        channel.state = "closed";
        channel.notify(REALTIME_SUBSCRIBE_STATES.CLOSED);
      }
    });
    this.socket.addEventListener("error", (error) => {
      for (const channel of this.channels) {
        channel.notify(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR, error);
      }
    });
    return this.socket;
  }

  private join(channel: CarbonRealtimeChannel) {
    if (channel.state === "joining" || channel.state === "joined") return;
    channel.state = "joining";
    const ref = this.nextRef();
    channel.joinRef = ref;
    this.pendingJoins.set(ref, channel);
    this.push(
      channel.topic,
      "phx_join",
      channel.joinPayload(this.accessToken),
      ref
    );
  }

  private push(
    topic: string,
    event: string,
    payload: unknown,
    existingRef?: string
  ) {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const ref = existingRef ?? this.nextRef();
    socket.send(JSON.stringify([null, ref, topic, event, payload]));
  }

  private handleMessage(raw: unknown) {
    const message = parseJson(String(raw));
    if (!Array.isArray(message) || message.length < 5) return;

    const [, ref, topic, event, payload] = message as [
      string | null,
      string | null,
      string,
      string,
      any
    ];

    if (event === "phx_reply" && ref) {
      const channel = this.pendingJoins.get(ref);
      if (channel) {
        this.pendingJoins.delete(ref);
        if (payload?.status === "ok") {
          channel.state = "joined";
          channel.notify(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
        } else {
          channel.state = "closed";
          channel.notify(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR, payload);
        }
      }
      return;
    }

    for (const channel of this.channels) {
      if (channel.topic === topic) {
        channel.dispatch(event, payload);
      }
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      this.push("phoenix", "heartbeat", {});
    }, 25_000);
  }

  private stopHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private closeSocket() {
    this.stopHeartbeat();
    this.socket?.close();
    this.socket = null;
    this.pendingJoins.clear();
  }

  private nextRef() {
    this.ref += 1;
    return String(this.ref);
  }
}

class CarbonAuthClient {
  admin: {
    createUser: (
      attributes: Record<string, unknown>
    ) => Promise<AuthResult<any>>;
    deleteUser: (userId: string) => Promise<AuthResult<any>>;
    inviteUserByEmail: (
      email: string,
      options?: { redirectTo?: string; data?: Record<string, unknown> }
    ) => Promise<AuthResult<any>>;
    generateLink: (
      attributes: Record<string, unknown>
    ) => Promise<AuthResult<any>>;
  };

  constructor(private readonly client: CarbonClientImpl) {
    this.admin = {
      createUser: () => this.unsupportedAuthApi(),
      deleteUser: () => this.unsupportedAuthApi(),
      inviteUserByEmail: () => this.unsupportedAuthApi(),
      generateLink: () => this.unsupportedAuthApi()
    };
  }

  getUser(accessToken?: string) {
    return this.unsupportedAuthApi({ accessToken });
  }

  updateUser(attributes: Record<string, unknown>) {
    return this.unsupportedAuthApi(attributes);
  }

  signInWithOtp(options: {
    email: string;
    options?: {
      emailRedirectTo?: string;
      data?: Record<string, unknown>;
      shouldCreateUser?: boolean;
    };
  }) {
    return this.unsupportedAuthApi(options);
  }

  verifyOtp(attributes: Record<string, unknown>) {
    return this.unsupportedAuthApi(attributes);
  }

  signInWithPassword(attributes: { email: string; password: string }) {
    return this.unsupportedAuthApi(attributes);
  }

  refreshSession(attributes: { refresh_token: string }) {
    return this.unsupportedAuthApi(attributes);
  }

  signInWithOAuth(options: {
    provider: string;
    options?: { redirectTo?: string; scopes?: string };
  }): Promise<AuthResult<{ provider: string; url: string }>> {
    return this.signInWithBetterAuthOAuth(options);
  }

  private getBetterAuthBaseUrl() {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/api/auth`;
    }
    return joinUrl(requireApiUrl(), "/api/auth");
  }

  private mapProvider(provider: string) {
    return provider === "azure" ? "microsoft" : provider;
  }

  private parseScopes(scopes: string | undefined) {
    if (!scopes) return undefined;
    return scopes
      .split(/[,\s]+/u)
      .map((scope) => scope.trim())
      .filter(Boolean);
  }

  private async signInWithBetterAuthOAuth(options: {
    provider: string;
    options?: { redirectTo?: string; scopes?: string };
  }): Promise<AuthResult<{ provider: string; url: string }>> {
    const response = await this.client.fetch(
      joinUrl(this.getBetterAuthBaseUrl(), "/sign-in/social"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          provider: this.mapProvider(options.provider),
          callbackURL: options.options?.redirectTo,
          scopes: this.parseScopes(options.options?.scopes),
          disableRedirect: true
        })
      }
    );
    const body = parseJson(await response.text());

    if (!response.ok) {
      return {
        data: null as unknown as { provider: string; url: string },
        error: authErrorFromBody(body, response)
      };
    }

    const url =
      body && typeof body === "object" && "url" in body
        ? String((body as { url?: unknown }).url ?? "")
        : "";

    if (!url) {
      return {
        data: null as unknown as { provider: string; url: string },
        error: { message: "Auth provider did not return a redirect URL" }
      };
    }

    if (typeof window !== "undefined") {
      window.location.assign(url);
    }

    return {
      data: { provider: options.provider, url },
      error: null
    };
  }

  private unsupportedAuthApi<T = any>(
    details?: unknown
  ): Promise<AuthResult<T>> {
    return Promise.resolve({
      data: null as T,
      error: {
        message:
          "This auth method is server-owned by Better Auth and is no longer available on the browser Carbon client.",
        ...(details ? { details } : {})
      } as CarbonAuthError
    });
  }
}

class CarbonClientImpl {
  readonly auth = new CarbonAuthClient(this);
  readonly realtime: CarbonRealtimeClient;

  constructor(
    private readonly carbonKey: string,
    private readonly options: ClientOptions = {}
  ) {
    this.realtime = new CarbonRealtimeClient(requireApiUrl(), carbonKey);
  }

  from<T = Record<string, any>[]>(table: string) {
    return new CarbonPostgrestQueryBuilder<T>(this, encodeURIComponent(table));
  }

  rpc<T = any>(
    functionName: string,
    args: Record<string, unknown> = {},
    options: {
      head?: boolean;
      get?: boolean;
      count?: "exact" | "planned" | "estimated";
    } = {}
  ) {
    const builder = new CarbonPostgrestQueryBuilder<T>(
      this,
      `rpc/${encodeURIComponent(functionName)}`,
      {
        method: options.get || options.head ? "GET" : "POST",
        body: options.get || options.head ? undefined : args
      }
    );
    if (options.head) builder.select("*", { head: true });
    if (options.count) {
      builder.select("*", { count: options.count, head: options.head });
    }
    if (options.get) {
      for (const [key, value] of Object.entries(args)) {
        builder.filter(key, "eq", value);
      }
    }
    return builder;
  }

  functions = {
    invoke: async <T = unknown>(
      name: string,
      options: {
        body?: unknown;
        headers?: Record<string, string>;
        region?: unknown;
      } = {}
    ): Promise<{ data: T | null; error: { message: string } | null }> => {
      const response = await this.fetch(
        joinUrl(requireApiUrl(), `/functions/v1/${name}`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(options.headers ?? {})
          },
          body: JSON.stringify(options.body ?? {})
        }
      );
      const body = parseJson(await response.text());
      if (!response.ok) {
        const error = postgrestErrorFromBody(body, response.statusText);
        return { data: null, error: { message: error.message } };
      }
      return { data: body as T, error: null };
    }
  };

  channel(topic: string) {
    return this.realtime.channel(topic);
  }

  removeChannel(channel: CarbonRealtimeChannel) {
    return this.realtime.removeChannel(channel);
  }

  async fetch(input: string, init: FetchOptions = {}) {
    return fetchWithRetry(input, {
      ...init,
      headers: {
        apikey: this.carbonKey,
        Authorization: `Bearer ${this.options.accessToken ?? this.carbonKey}`,
        ...(this.options.headers ?? {}),
        ...(init.headers ?? {})
      }
    });
  }
}

export type CarbonBrowserClient = CarbonClientImpl;
export type CarbonClient = CarbonClientImpl;

export const getCarbonClient = (
  carbonKey: string,
  accessToken?: string
): CarbonClient => {
  return new CarbonClientImpl(carbonKey, { accessToken });
};

export const getCarbonAPIKeyClient = (apiKey: string) => {
  return new CarbonClientImpl(CARBON_PUBLIC_KEY!, {
    headers: {
      "carbon-key": apiKey
    }
  });
};

export const createCarbonWithAuthGetter = (
  store: MutableRefObject<StoreApi<{ accessToken: string }>>
) => {
  const client = new CarbonClientImpl(CARBON_PUBLIC_KEY!);
  const originalFetch = client.fetch.bind(client);
  client.fetch = (input: string, init: FetchOptions = {}) => {
    const state = store.current?.getState();
    const accessToken = state?.accessToken;
    return originalFetch(input, {
      ...init,
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(init.headers ?? {})
      }
    });
  };
  return client;
};

export const getCarbon = (accessToken?: string) => {
  return getCarbonClient(CARBON_PUBLIC_KEY!, accessToken);
};

export const carbonClient = getCarbon();
