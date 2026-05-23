import { error } from "@carbon/auth";
import {
  assertCustomerAccountScope,
  requirePermissions
} from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { getCustomerLocations } from "~/modules/sales";
import { CustomerLocations } from "~/modules/sales/ui/Customer";
import { path } from "~/utils/path";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const auth = await requirePermissions(request, {
    view: "sales"
  });
  const { client } = auth;

  const { customerId } = params;
  if (!customerId) throw new Error("Could not find customerId");
  assertCustomerAccountScope(auth, customerId);

  const locations = await getCustomerLocations(client, customerId);
  if (locations.error) {
    throw redirect(
      path.to.customer(customerId),
      await flash(
        request,
        error(locations.error, "Failed to fetch customer locations")
      )
    );
  }

  return {
    locations: locations.data ?? []
  };
}

export default function CustomerLocationsRoute() {
  const { locations } = useLoaderData<typeof loader>();

  return <CustomerLocations locations={locations} />;
}
