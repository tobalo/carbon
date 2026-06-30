import { handleBetterAuthRequest } from "@carbon/auth/better-auth.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  return handleBetterAuthRequest(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return handleBetterAuthRequest(request);
}
