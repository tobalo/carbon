/**
 * Extract the user-facing error message from a Carbon function invocation
 * failure.
 *
 * The current functions client wraps non-2xx edge-function responses with the
 * response body on `error.context: Response`. The body is not parsed for
 * callers, so reading `error.message` can return a generic wrapper text and
 * lose the real message we set inside the edge function (e.g.
 * `{ success: false, message: "Tracked entity not found" }`).
 *
 * Mirrors the pattern in
 * `apps/mes/app/routes/x+/issue-tracked-entity.tsx` so error surfacing is
 * consistent across the two apps.
 */
export async function getEdgeFunctionErrorMessage(
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
