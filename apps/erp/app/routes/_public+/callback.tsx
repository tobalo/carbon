import { error, safeRedirect } from "@carbon/auth";
import {
  getBetterAuthCallbackSession,
  refreshAccessToken
} from "@carbon/auth/auth.server";
import { getCarbonServiceRole } from "@carbon/auth/client.server";
import { getCompanyId, setCompanyId } from "@carbon/auth/company.server";
import { flash, setAuthSession } from "@carbon/auth/session.server";
import { getUserByEmail } from "@carbon/auth/users.server";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  LoadingBars,
  VStack
} from "@carbon/react";
import { Trans } from "@lingui/react/macro";
import { LuTriangleAlert } from "react-icons/lu";
import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { getCompanies, getEmployeeCompanies } from "~/modules/settings";
import { path } from "~/utils/path";

type CallbackCompanyMembership = {
  companyId: string;
  companyGroupId?: string | null;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo") ?? undefined;
  const callbackError =
    url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const pendingSession = await getBetterAuthCallbackSession(request);

  if (!pendingSession) {
    return {
      error: callbackError
        ? decodeURIComponent(callbackError.replace(/\+/g, " "))
        : "Authentication session not found."
    };
  }

  const serviceRole = getCarbonServiceRole();

  // Pre-session: no user-authed client yet, so query memberships with the
  // service role. Prefer an employee company as the active one; fall back to
  // any membership so auth/RLS can deny a pure portal user later.
  const employeeCompanies = ((
    await getEmployeeCompanies(serviceRole, pendingSession.userId)
  ).data ?? []) as CallbackCompanyMembership[];
  const pickable = employeeCompanies.length
    ? employeeCompanies
    : (((await getCompanies(serviceRole, pendingSession.userId)).data ??
        []) as CallbackCompanyMembership[]);

  const cookieCompanyId = getCompanyId(request);
  const match =
    pickable.find((c) => c.companyId === cookieCompanyId) ?? pickable[0];
  const companyId = match?.companyId ?? undefined;
  const companyGroupId = match?.companyGroupId ?? "";

  const authSession = await refreshAccessToken(
    pendingSession.refreshToken,
    companyId,
    companyGroupId
  );

  if (!authSession) {
    return redirect(
      path.to.root,
      await flash(request, error(authSession, "Invalid auth session"))
    );
  }

  const user = await getUserByEmail(authSession.email);

  if (!user?.data) {
    return redirect(
      path.to.root,
      await flash(request, error(user.error, "User not found"))
    );
  }

  const sessionCookie = await setAuthSession(request, {
    authSession
  });
  const headers: [string, string][] = [["Set-Cookie", sessionCookie]];

  // Only finalize the active company for single-company (and portal-only)
  // users. Multi-company users must actively choose: we leave the companyId
  // cookie unset and let x+/_layout bounce them to the picker.
  if (employeeCompanies.length <= 1) {
    headers.push(["Set-Cookie", setCompanyId(authSession.companyId)]);
  }

  return redirect(safeRedirect(redirectTo, path.to.authenticatedRoot), {
    headers
  });
}

export default function AuthCallback() {
  const { error: callbackError } = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col items-center justify-center">
      {callbackError ? (
        <div className="rounded-lg md:bg-card md:border md:border-border md:shadow-lg p-8 mt-8 w-[380px]">
          <VStack spacing={4}>
            <Alert variant="destructive">
              <LuTriangleAlert className="h-4 w-4" />
              <AlertTitle>
                <Trans>Error</Trans>
              </AlertTitle>
              <AlertDescription>{callbackError}</AlertDescription>
            </Alert>
            {callbackError.includes("expired") && (
              <p className="text-sm text-muted-foreground">
                <Trans>Something went wrong. Please try again.</Trans>
              </p>
            )}
          </VStack>
        </div>
      ) : (
        <LoadingBars />
      )}
    </div>
  );
}
