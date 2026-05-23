import { assertIsPost, error } from "@carbon/auth";
import {
  assertCustomerAccountScope,
  requirePermissions
} from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { ActionFunctionArgs } from "react-router";
import { data, redirect } from "react-router";
import { deleteCustomer } from "~/modules/sales";
import { path } from "~/utils/path";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const auth = await requirePermissions(request, {
    delete: "sales"
  });
  const { client } = auth;

  const { customerId } = params;
  if (!customerId) throw new Error("Could not find customerId");
  assertCustomerAccountScope(auth, customerId);

  const customerDelete = await deleteCustomer(client, customerId);

  if (customerDelete.error) {
    return data(
      path.to.customers,
      await flash(
        request,
        error(customerDelete.error, customerDelete.error.message)
      )
    );
  }

  throw redirect(path.to.customers);
}
