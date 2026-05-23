/**
 * Extract the user-facing error message from a function
 * function route failure.
 *
 * Function calls can wrap non-2xx responses in `FunctionsHttpError`
 * where the response body lives on `error.context: Response`. The body is
 * never parsed by the SDK, so callers that just read `error.message` get the
 * generic wrapper text and lose the real message we set inside the function
 * response (e.g.
 * `{ success: false, message: "Tracked entity not found" }`).
 *
 * Mirrors the pattern in
 * `apps/mes/app/routes/x+/issue-tracked-entity.tsx` so error surfacing is
 * consistent across the two apps.
 */
export async function getFunctionErrorMessage(
  err: unknown,
  fallback: string
): Promise<string> {
  const ctx = (err as { context?: Response })?.context;
  if (ctx && typeof ctx.clone === "function") {
    try {
      const body = await ctx.clone().json();
      if (body && typeof body.message === "string") {
        return body.message;
      }
    } catch {
      // body wasn't JSON or already consumed — fall through
    }
  }
  if (err && typeof (err as { message?: string }).message === "string") {
    return (err as { message: string }).message;
  }
  return fallback;
}
