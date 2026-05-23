import {
  signConsolePinPayload,
  type ConsolePinPayload,
  verifyConsolePinPayload
} from "@carbon/auth/console.server";
import * as cookie from "cookie";

const CONSOLE_PIN_PREFIX = "console-pin-";
const CONSOLE_PIN_MAX_AGE = 60 * 60; // 1 hour in seconds
const CONSOLE_PIN_MAX_AGE_MS = CONSOLE_PIN_MAX_AGE * 1000;

// --- Console Pin-In State ---

export type ConsolePinIn = ConsolePinPayload;

export function getConsolePinIn(
  request: Request,
  companyId: string
): ConsolePinIn | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  const raw = cookie.parse(cookieHeader)[`${CONSOLE_PIN_PREFIX}${companyId}`];
  if (!raw) return null;

  try {
    const parsed = verifyConsolePinPayload(raw);
    if (!parsed) return null;
    // Check manual expiry (defense-in-depth alongside cookie maxAge)
    const elapsed = Date.now() - parsed.pinnedAt;
    if (elapsed > CONSOLE_PIN_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setConsolePinIn(companyId: string, data: ConsolePinIn): string {
  return cookie.serialize(
    `${CONSOLE_PIN_PREFIX}${companyId}`,
    signConsolePinPayload(data),
    {
      path: "/",
      maxAge: CONSOLE_PIN_MAX_AGE
    }
  );
}

export function clearConsolePinIn(companyId: string): string {
  return cookie.serialize(`${CONSOLE_PIN_PREFIX}${companyId}`, "", {
    path: "/",
    maxAge: 0
  });
}

export function refreshConsolePinIn(
  companyId: string,
  existing: ConsolePinIn
): string {
  return setConsolePinIn(companyId, {
    ...existing,
    pinnedAt: Date.now()
  });
}
