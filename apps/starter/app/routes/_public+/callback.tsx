import { error, safeRedirect } from "@carbon/auth";
import { signInWithRequest } from "@carbon/auth/auth.server";
import { setCompanyId } from "@carbon/auth/company.server";
import { flash, setAuthSession } from "@carbon/auth/session.server";
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { path } from "~/utils/path";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo") ?? undefined;

  try {
    const authSession = await signInWithRequest(request);
    if (!authSession) throw new Error("Missing Better Auth session");

    const sessionCookie = await setAuthSession(request, { authSession });
    const companyIdCookie = setCompanyId(authSession.companyId);

    return redirect(safeRedirect(redirectTo, path.to.authenticatedRoot), {
      headers: [
        ["Set-Cookie", sessionCookie],
        ["Set-Cookie", companyIdCookie]
      ]
    });
  } catch (cause) {
    return redirect(
      path.to.login,
      await flash(request, error(cause, "Authentication callback failed"))
    );
  }
}

export default function AuthCallback() {
  return (
    <div className="flex flex-col items-center justify-center">
      <div className="flex justify-center mb-4">
        <img src="/carbon-logo-mark.svg" alt="Carbon Logo" className="w-36" />
      </div>
      <div className="hexagon-loader-container">
        <div className="hexagon-loader">
          <div className="hexagon" />
          <div className="hexagon" />
          <div className="hexagon" />
        </div>
      </div>
    </div>
  );
}
