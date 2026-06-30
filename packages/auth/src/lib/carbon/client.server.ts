import { SignJWT } from "jose";
import {
  CARBON_API_URL,
  CARBON_AUTH_JWT_SECRET,
  CARBON_SERVICE_ROLE_KEY
} from "../../config/env";
import type { CarbonClient } from "../../types";
import { getCarbon, getCarbonClient } from "./client";

type InvokeOptions = {
  body?: unknown;
  headers?: Record<string, string>;
};

type InvokeError = {
  message: string;
  context?: Response;
};

export type CarbonFunctionResponse<T = unknown> = {
  data: T | null;
  error: InvokeError | null;
};

export const getCarbonServiceRole = (): CarbonClient => {
  return getCarbonClient(CARBON_SERVICE_ROLE_KEY!);
};

async function parseResponseBody(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function messageFromBody(body: unknown, fallback: string) {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  if (typeof body === "string" && body.length > 0) return body;
  return fallback;
}

export async function invokeCarbonServiceFunction<T = unknown>(
  name: string,
  options: InvokeOptions = {}
): Promise<CarbonFunctionResponse<T>> {
  if (!CARBON_API_URL) {
    return {
      data: null,
      error: { message: "CARBON_API_URL is not configured" }
    };
  }

  if (!CARBON_SERVICE_ROLE_KEY) {
    return {
      data: null,
      error: { message: "CARBON_SERVICE_ROLE_KEY is not configured" }
    };
  }

  try {
    const response = await fetch(`${CARBON_API_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        apikey: CARBON_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${CARBON_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        ...options.headers
      },
      body: JSON.stringify(options.body ?? {})
    });
    const context = response.clone();
    const body = await parseResponseBody(response);

    if (!response.ok) {
      return {
        data: null,
        error: {
          message: messageFromBody(
            body,
            `Function ${name} returned ${response.status}`
          ),
          context
        }
      };
    }

    return {
      data: body as T,
      error: null
    };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

export async function getUserScopedClient(
  userId: string
): Promise<CarbonClient> {
  if (!CARBON_AUTH_JWT_SECRET) {
    throw new Error(
      "CARBON_AUTH_JWT_SECRET is required for user-scoped clients"
    );
  }

  const secret = new TextEncoder().encode(CARBON_AUTH_JWT_SECRET);
  const jwt = await new SignJWT({
    sub: userId,
    aud: "authenticated",
    role: "authenticated"
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);

  return getCarbon(jwt);
}
