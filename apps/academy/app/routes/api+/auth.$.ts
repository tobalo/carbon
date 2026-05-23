import { betterAuthServer } from "@carbon/auth/provider";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  return betterAuthServer.handler(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return betterAuthServer.handler(request);
}
