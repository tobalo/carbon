import {
  createDatabaseQueryClient,
  getDatabaseQueryClient,
  type DatabaseQueryClient,
  type QueryBuilder,
  type QueryResult
} from "@carbon/database/query-client";
import type { MutableRefObject } from "react";
import type { StoreApi } from "zustand";

export type CarbonClient = DatabaseQueryClient;

const unsupportedResult: QueryResult = {
  data: null as any,
  error: {
    message:
      "Direct database access is not available in the browser. Use a route loader/action instead."
  }
};

function unsupportedBuilder<TData = any>(): QueryBuilder<TData> {
  const builder = {
    abortSignal: () => builder,
    containedBy: () => builder,
    contains: () => builder,
    eq: () => builder,
    explain: () => builder,
    filter: () => builder,
    gte: () => builder,
    gt: () => builder,
    ilike: () => builder,
    in: () => builder,
    is: () => builder,
    like: () => builder,
    limit: () => builder,
    lte: () => builder,
    lt: () => builder,
    match: () => builder,
    maybeSingle: () => Promise.resolve(unsupportedResult),
    neq: () => builder,
    not: () => builder,
    order: () => builder,
    or: () => builder,
    overlaps: () => builder,
    range: () => builder,
    returns: () => builder,
    select: () => builder,
    single: () => Promise.resolve(unsupportedResult),
    throwOnError: () => builder,
    then: (onfulfilled?: any, onrejected?: any) =>
      Promise.resolve(unsupportedResult).then(onfulfilled, onrejected)
  } as unknown as QueryBuilder<TData>;

  return builder;
}

export async function startOAuthSignIn(args: {
  provider: "google" | "azure";
  redirectTo?: string;
  scopes?: string | string[];
}): Promise<{ data: unknown; error: { message: string } | null }> {
  if (typeof window === "undefined") {
    return {
      data: null,
      error: { message: "OAuth redirects can only be started in a browser" }
    };
  }

  const scopes = Array.isArray(args.scopes)
    ? args.scopes
    : typeof args.scopes === "string"
      ? args.scopes.split(/\s+/).filter(Boolean)
      : undefined;

  const response = await fetch("/api/auth/sign-in/social", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: args.provider === "azure" ? "microsoft" : args.provider,
      callbackURL: args.redirectTo ?? window.location.origin,
      ...(scopes ? { scopes } : {})
    })
  });

  const body = (await response.json().catch(() => null)) as {
    message?: string;
    error?: string;
    url?: string;
  } | null;

  if (!response.ok) {
    return {
      data: body,
      error: {
        message:
          body?.message ?? body?.error ?? "Failed to start OAuth sign-in"
      }
    };
  }

  const redirectUrl = response.headers.get("Location") ?? body?.url;
  if (redirectUrl) {
    window.location.href = redirectUrl;
  }

  return { data: body, error: null };
}

function createBrowserClient(): CarbonClient {
  const table = {
    delete: () => unsupportedBuilder<null>(),
    insert: () => unsupportedBuilder<null>(),
    select: <TSelected = any>() => unsupportedBuilder<TSelected>(),
    update: () => unsupportedBuilder<null>(),
    upsert: () => unsupportedBuilder<null>()
  };

  return {
    from: () => table,
    rpc: async () => unsupportedResult
  } as unknown as DatabaseQueryClient;
}

export const getCarbonClient = (
  _key?: string,
  _accessToken?: string,
  userId?: string
): CarbonClient => {
  if (typeof window !== "undefined") {
    return createBrowserClient();
  }

  return userId ? createDatabaseQueryClient({ userId }) : getDatabaseQueryClient();
};

export const getCarbonAPIKeyClient = (apiKeyId: string) => {
  if (typeof window !== "undefined") {
    return createBrowserClient();
  }

  return createDatabaseQueryClient({ apiKeyId });
};

export const createCarbonWithAuthGetter = (
  _store: MutableRefObject<StoreApi<{ accessToken: string }>>
) => {
  return createBrowserClient();
};

export const getCarbon = (accessToken?: string, userId?: string) => {
  return getCarbonClient(undefined, accessToken, userId);
};

export const carbonClient = getCarbon();
