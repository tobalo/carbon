import { error } from "@carbon/auth";
import {
  getBetterAuthCallbackSession,
  refreshAccessToken
} from "@carbon/auth/auth.server";
import { setCompanyId } from "@carbon/auth/company.server";
import { flash, setAuthSession } from "@carbon/auth/session.server";
import { getUserByEmail } from "@carbon/auth/users.server";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  LoadingBars,
  VStack
} from "@carbon/react";
import { LuTriangleAlert } from "react-icons/lu";
import type { LoaderFunctionArgs } from "react-router";
import { Link, redirect, useLoaderData } from "react-router";
import { getFirstCompanyMembership } from "~/services/database.server";
import { path } from "~/utils/path";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
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

  const firstCompany = await getFirstCompanyMembership(pendingSession.userId);
  const companyId = firstCompany?.companyId;
  const companyGroupId = firstCompany?.companyGroupId ?? "";

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
  const companyIdCookie = setCompanyId(authSession.companyId);
  return redirect(path.to.root, {
    headers: [
      ["Set-Cookie", sessionCookie],
      ["Set-Cookie", companyIdCookie]
    ]
  });
}

export default function AuthCallback() {
  const { error: callbackError } = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="flex justify-center mb-8">
        <img
          src="/carbon-mark-light.svg"
          alt="Carbon Logo"
          className="w-24 dark:hidden"
        />
        <img
          src="/carbon-mark-dark.svg"
          alt="Carbon Logo"
          className="w-24 hidden dark:block"
        />
      </div>
      {callbackError ? (
        <div className="rounded-lg md:bg-card md:border md:border-border md:shadow-lg p-8 mt-8 w-[380px]">
          <VStack spacing={4}>
            <Alert variant="destructive">
              <LuTriangleAlert className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{callbackError}</AlertDescription>
            </Alert>
            {callbackError.includes("expired") && (
              <>
                <p className="text-sm text-muted-foreground">
                  But don't worry. You can use the forgot password flow to
                  request a new magic link.
                </p>
                <Button size="lg" asChild className="w-full">
                  <Link to={path.to.login}>Login</Link>
                </Button>
              </>
            )}
          </VStack>
        </div>
      ) : (
        <LoadingBars />
      )}
    </div>
  );
}
