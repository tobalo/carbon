import { createHmac, timingSafeEqual } from "crypto";
import { SESSION_SECRET } from "../config/env";

export type ConsolePinPayload = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  pinnedAt: number;
};

const VERSION = "v1";

function getSecret() {
  if (!SESSION_SECRET) {
    throw new Error("SESSION_SECRET is required to sign console pin state");
  }
  return SESSION_SECRET;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signatureFor(payload: string) {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function isValidPayload(value: unknown): value is ConsolePinPayload {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.userId === "string" &&
    typeof payload.name === "string" &&
    (typeof payload.avatarUrl === "string" || payload.avatarUrl === null) &&
    typeof payload.pinnedAt === "number"
  );
}

export function signConsolePinPayload(payload: ConsolePinPayload) {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${VERSION}.${encoded}.${signatureFor(encoded)}`;
}

export function verifyConsolePinPayload(raw: string): ConsolePinPayload | null {
  const [version, encoded, signature] = raw.split(".");
  if (version !== VERSION || !encoded || !signature) return null;

  const expected = signatureFor(encoded);
  const actualBuffer = Buffer.from(signature, "base64url");
  const expectedBuffer = Buffer.from(expected, "base64url");

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(encoded));
    return isValidPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
