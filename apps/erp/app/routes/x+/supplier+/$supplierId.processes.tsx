import { error } from "@carbon/auth";
import {
  assertSupplierAccountScope,
  requirePermissions
} from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useLoaderData } from "react-router";
import { getSupplierProcessesBySupplier } from "~/modules/purchasing";
import SupplierProcesses from "~/modules/purchasing/ui/Supplier/SupplierProcesses";
import { path } from "~/utils/path";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const auth = await requirePermissions(request, {
    view: "purchasing"
  });
  const { client } = auth;

  const { supplierId } = params;
  if (!supplierId) throw new Error("Could not find supplierId");
  assertSupplierAccountScope(auth, supplierId);

  const processes = await getSupplierProcessesBySupplier(client, supplierId);

  if (processes.error || !processes.data) {
    throw redirect(
      path.to.supplier(supplierId),
      await flash(
        request,
        error(processes.error, "Failed to load supplier payment")
      )
    );
  }

  return {
    processes: processes.data
  };
}

export default function SupplierPaymentRoute() {
  const { processes } = useLoaderData<typeof loader>();

  return (
    <>
      <SupplierProcesses processes={processes} />
      <Outlet />
    </>
  );
}
