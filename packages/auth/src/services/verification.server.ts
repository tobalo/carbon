import { randomInt, timingSafeEqual } from "node:crypto";
import { VerificationEmail } from "@carbon/documents/email";
import { redis } from "@carbon/kv";
import { sendEmail } from "@carbon/lib/resend.server";
import { render } from "@react-email/components";
import { RESEND_DOMAIN } from "../config/env";

export async function sendVerificationCode(email: string) {
  let key: string | undefined;

  try {
    const normalizedEmail = email.toLowerCase();
    const verificationCode = randomInt(100000, 1000000).toString();
    key = `verification:${normalizedEmail}`;

    await redis.set(key, verificationCode, "EX", 600);

    const html = await render(
      VerificationEmail({
        email: normalizedEmail,
        verificationCode
      })
    );

    const result = await sendEmail({
      from: `Carbon <no-reply@${RESEND_DOMAIN}>`,
      to: normalizedEmail,
      subject: "Verify your email address",
      html
    });

    if (result.error) {
      await redis.del(key).catch(() => undefined);
      return false;
    }

    return true;
  } catch (error) {
    if (key) await redis.del(key).catch(() => undefined);
    console.error("Failed to send verification code:", error);
    return false;
  }
}

function codeMatches(storedCode: unknown, code: string) {
  const stored = Buffer.from(String(storedCode));
  const provided = Buffer.from(code);

  if (stored.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(stored, provided);
}

export async function verifyEmailCode(email: string, code: string) {
  try {
    const storedCode = await redis.get(`verification:${email.toLowerCase()}`);

    if (!storedCode || !codeMatches(storedCode, code)) {
      return false;
    }

    // Delete the code after successful verification
    await redis.del(`verification:${email.toLowerCase()}`);

    return true;
  } catch (error) {
    console.error("Failed to verify email code:", error);
    return false;
  }
}
