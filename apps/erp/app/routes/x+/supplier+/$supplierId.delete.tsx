import { assertIsPost, error } from "@carbon/auth";
import {
  assertSupplierAccountScope,
  requirePermissions
} from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { ActionFunctionArgs } from "react-router";
import { data, redirect } from "react-router";
import { deleteSupplier } from "~/modules/purchasing";
import { path } from "~/utils/path";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const auth = await requirePermissions(request, {
    delete: "purchasing"
  });
  const { client } = auth;

  const { supplierId } = params;
  if (!supplierId) throw new Error("Could not find supplierId");
  assertSupplierAccountScope(auth, supplierId);

  const supplierDelete = await deleteSupplier(client, supplierId);

  if (supplierDelete.error) {
    return data(
      path.to.suppliers,
      await flash(
        request,
        error(supplierDelete.error, supplierDelete.error.message)
      )
    );
  }

  throw redirect(path.to.suppliers);
}
