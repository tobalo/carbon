import { handleBetterAuthRequest } from "@carbon/auth/better-auth.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export function loader({ request }: LoaderFunctionArgs) {
  return handleBetterAuthRequest(request);
}

export function action({ request }: ActionFunctionArgs) {
  return handleBetterAuthRequest(request);
}
