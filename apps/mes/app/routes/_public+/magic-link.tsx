import {
  assertIsPost,
  CONTROLLED_ENVIRONMENT,
  error,
  safeRedirect
} from "@carbon/auth";
import { signInWithMagicLinkToken } from "@carbon/auth/auth.server";
import { setCompanyId } from "@carbon/auth/company.server";
import { flash, setAuthSession } from "@carbon/auth/session.server";
import { Button, Heading, VStack } from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useLoaderData } from "react-router";
import { path } from "~/utils/path";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) throw redirect(path.to.root);
  const redirectTo = url.searchParams.get("redirectTo") ?? undefined;

  return { redirectTo, token };
}

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);

  const formData = await request.formData();
  const token = formData.get("token");
  const redirectTo = formData.get("redirectTo");
  if (typeof token !== "string" || !token) {
    return redirect(
      path.to.login,
      await flash(request, error(null, "Invalid magic link"))
    );
  }

  try {
    const authSession = await signInWithMagicLinkToken(token);
    if (!authSession) throw new Error("Magic link did not create a session");

    const sessionCookie = await setAuthSession(request, { authSession });
    const companyIdCookie = setCompanyId(authSession.companyId);

    return redirect(
      safeRedirect(
        typeof redirectTo === "string" ? redirectTo : undefined,
        path.to.authenticatedRoot
      ),
      {
        headers: [
          ["Set-Cookie", sessionCookie],
          ["Set-Cookie", companyIdCookie]
        ]
      }
    );
  } catch (cause) {
    return redirect(
      path.to.login,
      await flash(request, error(cause, "Invalid or expired magic link"))
    );
  }
}

export default function ConfirmMagicLink() {
  const { t } = useLingui();
  const { redirectTo, token } = useLoaderData<typeof loader>();

  return (
    <>
      <div className="flex justify-center mb-4">
        <img
          src={CONTROLLED_ENVIRONMENT ? "/flag.png" : "/carbon-logo-mark.svg"}
          alt={t`Carbon Logo`}
          className="w-36"
        />
      </div>
      <div className="rounded-lg md:bg-card md:border md:border-border md:shadow-lg p-8 w-[380px]">
        <VStack spacing={4} className="items-center justify-center">
          <Heading size="h3">
            <Trans>Let's build something</Trans>
          </Heading>
          <Form method="post">
            <input type="hidden" name="token" value={token} />
            {redirectTo ? (
              <input type="hidden" name="redirectTo" value={redirectTo} />
            ) : null}
            <Button size="lg" type="submit">
              <Trans>Log In</Trans>
            </Button>
          </Form>
        </VStack>
      </div>
    </>
  );
}
