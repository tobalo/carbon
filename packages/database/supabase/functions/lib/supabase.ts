import { createHash } from "node:crypto";
import {
  carbonAuthJwtSecret,
  carbonApiUrl,
  carbonPublicKey,
  carbonServiceRoleKey,
} from "./env.ts";
import { checkApiKeyRateLimit } from "./ratelimit.ts";
import { isTrustedBearer } from "./trusted-auth.ts";

type PostgrestError = {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
  name?: string;
};

type PostgrestResult<T = any> = {
  data: T | null;
  error: PostgrestError | null;
  status: number;
  statusText: string;
  count?: number | null;
};

type SelectOptions = {
  count?: "exact" | "planned" | "estimated";
  head?: boolean;
};

type OrderOptions = {
  ascending?: boolean;
  nullsFirst?: boolean;
  foreignTable?: string;
  referencedTable?: string;
};

type LimitOptions = {
  foreignTable?: string;
  referencedTable?: string;
};

type PostgrestClientOptions = {
  apiUrl: string;
  apiKey: string;
  authorization?: string | null;
  headers?: Record<string, string>;
};

type QueryMethod = "GET" | "POST" | "PATCH" | "DELETE" | "HEAD";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function bearer(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return /^Bearer\s+/i.test(value) ? value : `Bearer ${value}`;
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function decodeJsonSegment<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

async function verifyCarbonJwt(
  token: string
): Promise<Record<string, unknown> | null> {
  const secret = carbonAuthJwtSecret();
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) return null;

  try {
    const header = decodeJsonSegment<{ alg?: string }>(encodedHeader);
    if (header.alg !== "HS256") return null;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const verified = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
    );
    if (!verified) return null;

    const payload = decodeJsonSegment<Record<string, unknown>>(encodedPayload);
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === "number" && payload.exp <= now) return null;
    if (typeof payload.nbf === "number" && payload.nbf > now) return null;
    return payload;
  } catch {
    return null;
  }
}

function valueForFilter(value: unknown): string {
  if (value === null) return "null";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function valueForIn(value: unknown): string {
  const text = valueForFilter(value);
  if (/[,()"\\]/.test(text)) {
    return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return text;
}

function selectColumns(columns: string | string[] = "*"): string {
  return Array.isArray(columns) ? columns.join(",") : columns;
}

function parseCount(headers: Headers): number | null {
  const contentRange = headers.get("content-range");
  if (!contentRange) return null;
  const [, total] = contentRange.split("/");
  if (!total || total === "*") return null;
  const count = Number(total);
  return Number.isFinite(count) ? count : null;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function emptyResult<T>(
  response: Response,
  count: number | null
): PostgrestResult<T> {
  return {
    data: null,
    error: null,
    status: response.status,
    statusText: response.statusText,
    count,
  };
}

class PostgrestQuery<T = any> implements PromiseLike<PostgrestResult<T>> {
  private body: unknown;
  private method: QueryMethod = "GET";
  private readonly params = new URLSearchParams();
  private readonly prefer = new Set<string>();
  private returnRepresentation = false;
  private singular = false;
  private maybeSingular = false;

  constructor(
    private readonly options: PostgrestClientOptions,
    private readonly table: string
  ) {}

  select(columns: string | string[] = "*", options?: SelectOptions) {
    this.params.set("select", selectColumns(columns));
    if (this.method !== "GET" && this.method !== "HEAD") {
      this.returnRepresentation = true;
    }
    if (options?.count) this.prefer.add(`count=${options.count}`);
    if (options?.head) this.method = "HEAD";
    return this;
  }

  insert(body: unknown) {
    this.method = "POST";
    this.body = body;
    return this;
  }

  update(body: unknown) {
    this.method = "PATCH";
    this.body = body;
    return this;
  }

  delete() {
    this.method = "DELETE";
    return this;
  }

  eq(column: string, value: unknown) {
    return this.addFilter(column, "eq", value);
  }

  neq(column: string, value: unknown) {
    return this.addFilter(column, "neq", value);
  }

  gt(column: string, value: unknown) {
    return this.addFilter(column, "gt", value);
  }

  gte(column: string, value: unknown) {
    return this.addFilter(column, "gte", value);
  }

  lt(column: string, value: unknown) {
    return this.addFilter(column, "lt", value);
  }

  lte(column: string, value: unknown) {
    return this.addFilter(column, "lte", value);
  }

  is(column: string, value: unknown) {
    return this.addFilter(column, "is", value);
  }

  in(column: string, values: unknown[]) {
    this.params.append(column, `in.(${values.map(valueForIn).join(",")})`);
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    this.params.append(column, `not.${operator}.${valueForFilter(value)}`);
    return this;
  }

  order(column: string, options: OrderOptions = {}) {
    const foreignTable = options.foreignTable ?? options.referencedTable;
    const key = foreignTable ? `${foreignTable}.order` : "order";
    const direction = options.ascending === false ? "desc" : "asc";
    const nulls =
      options.nullsFirst === undefined
        ? ""
        : options.nullsFirst
          ? ".nullsfirst"
          : ".nullslast";
    const value = `${column}.${direction}${nulls}`;
    const current = this.params.get(key);
    this.params.set(key, current ? `${current},${value}` : value);
    return this;
  }

  limit(count: number, options: LimitOptions = {}) {
    const foreignTable = options.foreignTable ?? options.referencedTable;
    const key = foreignTable ? `${foreignTable}.limit` : "limit";
    this.params.set(key, String(count));
    return this;
  }

  single() {
    this.singular = true;
    return this.execute();
  }

  maybeSingle() {
    this.singular = true;
    this.maybeSingular = true;
    return this.execute();
  }

  then<TResult1 = PostgrestResult<T>, TResult2 = never>(
    onfulfilled?:
      | ((value: PostgrestResult<T>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private addFilter(column: string, operator: string, value: unknown) {
    this.params.append(column, `${operator}.${valueForFilter(value)}`);
    return this;
  }

  private headers(): Headers {
    const headers = new Headers(this.options.headers);
    headers.set("apikey", this.options.apiKey);

    const authorization = bearer(
      this.options.authorization ?? this.options.apiKey
    );
    if (authorization) headers.set("Authorization", authorization);

    if (this.body !== undefined) headers.set("Content-Type", "application/json");
    if (this.singular) {
      headers.set("Accept", "application/vnd.pgrst.object+json");
    }
    if (this.returnRepresentation) this.prefer.add("return=representation");
    if (this.prefer.size > 0) {
      headers.set("Prefer", Array.from(this.prefer).join(","));
    }

    return headers;
  }

  private async execute(): Promise<PostgrestResult<T>> {
    const url = new URL(
      `/rest/v1/${encodeURIComponent(this.table)}`,
      normalizeBaseUrl(this.options.apiUrl)
    );
    this.params.forEach((value, key) => url.searchParams.append(key, value));

    const response = await fetch(url, {
      method: this.method,
      headers: this.headers(),
      body: this.body === undefined ? undefined : JSON.stringify(this.body),
    });
    const count = parseCount(response.headers);

    if (this.method === "HEAD" || response.status === 204) {
      return emptyResult(response, count);
    }

    const payload = await parseResponseBody(response);

    if (!response.ok) {
      if (this.maybeSingular && response.status === 406) {
        return emptyResult(response, count);
      }

      return {
        data: null,
        error: payload as PostgrestError,
        status: response.status,
        statusText: response.statusText,
        count,
      };
    }

    return {
      data: payload as T,
      error: null,
      status: response.status,
      statusText: response.statusText,
      count,
    };
  }
}

function createPostgrestClient(options: PostgrestClientOptions) {
  const baseUrl = normalizeBaseUrl(options.apiUrl);

  const commonHeaders = (headers?: Record<string, string>): Headers => {
    const result = new Headers(options.headers);
    result.set("apikey", options.apiKey);

    const authorization = bearer(options.authorization ?? options.apiKey);
    if (authorization) result.set("Authorization", authorization);

    for (const [key, value] of Object.entries(headers ?? {})) {
      result.set(key, value);
    }

    return result;
  };

  const currentSession: { accessToken: string | null } = {
    accessToken: options.authorization?.replace(/^Bearer\s+/i, "") ?? null,
  };

  return {
    from(table: string) {
      return new PostgrestQuery(options, table);
    },
    async rpc<T = any>(
      functionName: string,
      body?: Record<string, unknown>
    ): Promise<PostgrestResult<T>> {
      const url = new URL(
        `/rest/v1/rpc/${encodeURIComponent(functionName)}`,
        baseUrl
      );
      const response = await fetch(url, {
        method: "POST",
        headers: commonHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body ?? {}),
      });
      const count = parseCount(response.headers);
      const payload = await parseResponseBody(response);

      if (!response.ok) {
        return {
          data: null,
          error: payload as PostgrestError,
          status: response.status,
          statusText: response.statusText,
          count,
        };
      }

      return {
        data: payload as T,
        error: null,
        status: response.status,
        statusText: response.statusText,
        count,
      };
    },
    functions: {
      async invoke<T = any>(
        functionName: string,
        options_: {
          body?: unknown;
          headers?: Record<string, string>;
          method?: string;
        } = {}
      ): Promise<PostgrestResult<T>> {
        const url = new URL(
          `/functions/v1/${encodeURIComponent(functionName)}`,
          baseUrl
        );
        const headers = commonHeaders({
          "Content-Type": "application/json",
          ...(options_.headers ?? {}),
        });
        const response = await fetch(url, {
          method: options_.method ?? "POST",
          headers,
          body:
            options_.body === undefined
              ? undefined
              : JSON.stringify(options_.body),
        });
        const payload = await parseResponseBody(response);

        if (!response.ok) {
          return {
            data: null,
            error: payload as PostgrestError,
            status: response.status,
            statusText: response.statusText,
          };
        }

        return {
          data: payload as T,
          error: null,
          status: response.status,
          statusText: response.statusText,
        };
      },
    },
    auth: {
      async setSession(session: {
        access_token: string;
        refresh_token: string;
      }): Promise<PostgrestResult<{ session: typeof session }>> {
        currentSession.accessToken = session.access_token;
        return {
          data: { session },
          error: null,
          status: 200,
          statusText: "OK",
        };
      },
      async getUser(): Promise<
        PostgrestResult<{ user: { id?: string } | null }>
      > {
        if (!currentSession.accessToken) {
          return {
            data: { user: null },
            error: { message: "No active session" },
            status: 401,
            statusText: "Unauthorized",
          };
        }

        const payload = await verifyCarbonJwt(currentSession.accessToken);
        const userId = typeof payload?.sub === "string" ? payload.sub : null;
        if (!userId) {
          return {
            data: { user: null },
            error: { message: "Invalid auth session" },
            status: 401,
            statusText: "Unauthorized",
          };
        }

        return {
          data: { user: { id: userId } },
          error: null,
          status: 200,
          statusText: "OK",
        };
      },
    },
  };
}

export type PostgrestClient = ReturnType<typeof createPostgrestClient>;

/** Hash an API key using SHA-256 for secure lookup */
function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/** PostgREST may reject opaque `sb_secret_*` env keys; use caller JWT when env is not JWT-shaped. */
function postgrestServiceKey(authorizationHeader: string | null): string {
  const envKey = carbonServiceRoleKey();
  if (envKey.split(".").length === 3) return envKey;
  const token = authorizationHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const parts = token.split(".");
  if (parts.length === 3) {
    try {
      const p = JSON.parse(atob(parts[1]!)) as { role?: string };
      if (p.role === "service_role") return token;
    } catch {
      /* ignore */
    }
  }
  return envKey;
}

function createAnonClient(headers?: Record<string, string>): PostgrestClient {
  return createPostgrestClient({
    apiUrl: carbonApiUrl(),
    apiKey: carbonPublicKey(),
    headers,
  });
}

function createServiceRoleClient(
  authorizationHeader: string | null
): PostgrestClient {
  const serviceKey = postgrestServiceKey(authorizationHeader);
  return createPostgrestClient({
    apiUrl: carbonApiUrl(),
    apiKey: serviceKey,
    authorization: serviceKey,
  });
}

type ApiKeyAuth = {
  client: PostgrestClient;
  companyId: string;
  userId: string;
  apiKeyId: string;
  scopes: Record<string, string[]>;
  rateLimit: number;
  rateLimitWindow: "1m" | "1h" | "1d";
};

export const getAuthFromAPIKey = async (
  apiKey: string
): Promise<ApiKeyAuth | null> => {
  const serviceRole = createServiceRoleClient(null);
  const keyHash = hashApiKey(apiKey);

  const apiKeyRow = await serviceRole
    .from("apiKey")
    .select(
      "id, companyId, createdBy, scopes, rateLimit, rateLimitWindow, expiresAt"
    )
    .eq("keyHash" as any, keyHash)
    .single();

  if (apiKeyRow.error) return null;

  const row = apiKeyRow.data as any;

  // Check expiration
  if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
    return null;
  }

  return {
    client: createAnonClient({ "carbon-key": apiKey }),
    companyId: row.companyId,
    userId: row.createdBy,
    apiKeyId: row.id,
    scopes: row.scopes ?? {},
    rateLimit: row.rateLimit ?? 60,
    rateLimitWindow: row.rateLimitWindow ?? "1m",
  };
};

export const getSupabase = (authorizationHeader: string | null) => {
  if (!authorizationHeader) throw new Error("Authorization header is required");

  return createPostgrestClient({
    apiUrl: carbonApiUrl(),
    apiKey: carbonPublicKey(),
    authorization: authorizationHeader,
  });
};

export const getSupabaseServiceRole = async (
  authorizationHeader: string | null,
  apiKeyHeader?: string | null,
  companyId?: string
) => {
  if (!authorizationHeader && !apiKeyHeader) {
    throw new Error("Authorization header or API key header is required");
  }

  const serviceRole = createServiceRoleClient(authorizationHeader);

  if (apiKeyHeader && companyId) {
    const keyHash = hashApiKey(apiKeyHeader);
    const { data, error } = await serviceRole
      .from("apiKey")
      .select("id, companyId, rateLimit, rateLimitWindow, expiresAt")
      .eq("keyHash" as any, keyHash)
      .eq("companyId", companyId)
      .single();

    if (error) {
      throw new Error("Failed to get API key");
    }

    if (!data) {
      throw new Error("API key not found");
    }

    const row = data as any;

    // Check expiration
    if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
      throw new Error("API key has expired");
    }

    // Check rate limit
    const rl = await checkApiKeyRateLimit(
      serviceRole,
      row.id,
      row.rateLimit ?? 60,
      row.rateLimitWindow ?? "1m"
    );
    if (!rl.success) {
      throw new Error("Rate limit exceeded");
    }

    return serviceRole;
  }

  if (authorizationHeader) {
    if (!isTrustedBearer(authorizationHeader)) {
      throw new Error("Valid authorization is required");
    }

    return serviceRole;
  }

  throw new Error("Authorization header or API key header is required");
};

type RequiredPermissions = {
  view?: string | string[];
  create?: string | string[];
  update?: string | string[];
  delete?: string | string[];
};

type Permission = {
  view: string[];
  create: string[];
  update: string[];
  delete: string[];
};

function parseClaimsPermissions(
  claims: Record<string, unknown>
): { permissions: Record<string, Permission>; role: string | null } {
  const permissions: Record<string, Permission> = {};
  let role: string | null = null;

  for (const [key, value] of Object.entries(claims)) {
    if (key === "role") {
      role = value as string;
      continue;
    }
    const parts = key.split("_");
    if (parts.length !== 2) continue;
    const [mod, action] = parts;
    if (
      !["view", "create", "update", "delete"].includes(action!) ||
      !Array.isArray(value)
    )
      continue;

    if (!(mod! in permissions)) {
      permissions[mod!] = { view: [], create: [], update: [], delete: [] };
    }
    permissions[mod!][action as keyof Permission] = value as string[];
  }

  return { permissions, role };
}

function checkPermissions(
  claims: Record<string, Permission>,
  companyId: string,
  required: RequiredPermissions
): boolean {
  for (const [action, modules] of Object.entries(required)) {
    const moduleList =
      typeof modules === "string" ? [modules] : (modules as string[]);
    for (const mod of moduleList) {
      const perm = claims[mod]?.[action as keyof Permission];
      if (!perm || !perm.includes(companyId)) {
        return false;
      }
    }
  }
  return true;
}

export async function requirePermissions(
  req: Request,
  companyId: string,
  userId: string,
  permissions: RequiredPermissions
): Promise<PostgrestClient> {
  const authorizationHeader = req.headers.get("Authorization");
  const apiKeyHeader = req.headers.get("carbon-key");
  const serviceRole = createServiceRoleClient(authorizationHeader);

  // API key path
  if (apiKeyHeader && companyId) {
    const keyHash = hashApiKey(apiKeyHeader);
    const { data, error } = await serviceRole
      .from("apiKey")
      .select("id, companyId, scopes, rateLimit, rateLimitWindow, expiresAt")
      .eq("keyHash" as any, keyHash)
      .eq("companyId", companyId)
      .single();

    if (error || !data) {
      throw new Error("API key not found");
    }

    const row = data as any;

    if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
      throw new Error("API key has expired");
    }

    const rl = await checkApiKeyRateLimit(
      serviceRole,
      row.id,
      row.rateLimit ?? 60,
      row.rateLimitWindow ?? "1m"
    );
    if (!rl.success) {
      throw new Error("Rate limit exceeded");
    }

    // Check API key scopes against required permissions
    const scopes: Record<string, string[]> = row.scopes ?? {};
    for (const [action, modules] of Object.entries(permissions)) {
      const moduleList =
        typeof modules === "string" ? [modules] : (modules as string[]);
      for (const mod of moduleList) {
        const scopeKey = `${mod}_${action}`;
        if (!(scopeKey in scopes) || !scopes[scopeKey]?.includes(companyId)) {
          throw new Error("API key lacks required permissions");
        }
      }
    }

    return serviceRole;
  }

  // JWT path
  if (!authorizationHeader) {
    throw new Error("Authorization header or API key header is required");
  }

  const token = authorizationHeader.replace(/^Bearer\s+/i, "").trim();
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid authorization token");
  }

  let role: string | undefined;
  try {
    role = (JSON.parse(atob(parts[1]!)) as { role?: string }).role;
  } catch {
    throw new Error("Invalid authorization token");
  }

  if (role === "service_role") {
    return serviceRole;
  }

  if (role === "authenticated") {
    const claimsResult = await serviceRole.rpc("get_claims", {
      uid: userId,
      company: companyId,
    });

    if (claimsResult.error || !claimsResult.data) {
      throw new Error("Failed to get user permissions");
    }

    const parsed = parseClaimsPermissions(
      claimsResult.data as unknown as Record<string, unknown>
    );

    if (!checkPermissions(parsed.permissions, companyId, permissions)) {
      throw new Error("Insufficient permissions");
    }

    return serviceRole;
  }

  throw new Error("Valid authorization is required");
}
