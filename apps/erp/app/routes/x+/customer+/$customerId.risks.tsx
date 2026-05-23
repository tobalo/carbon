import {
  assertCustomerAccountScope,
  requirePermissions
} from "@carbon/auth/auth.server";
import type { LoaderFunctionArgs } from "react-router";
import { data, useParams } from "react-router";
import CustomerRiskRegister from "~/modules/sales/ui/Customer/CustomerRiskRegister";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const auth = await requirePermissions(request, {
    view: "sales"
  });

  const { customerId } = params;
  if (!customerId) throw new Error("Could not find customerId");
  assertCustomerAccountScope(auth, customerId);

  return data({});
}

export default function CustomerRisksRoute() {
  const { customerId } = useParams();
  if (!customerId) throw new Error("Could not find customerId");

  return <CustomerRiskRegister customerId={customerId} />;
}
