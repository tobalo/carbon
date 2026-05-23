import { assertIsPost, badRequest, error, success } from "@carbon/auth";
import {
  assertCustomerAccountScope,
  requirePermissions
} from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import {
  customerPaymentValidator,
  getCustomerPayment,
  updateCustomerPayment
} from "~/modules/sales";
import { CustomerPaymentForm } from "~/modules/sales/ui/Customer";
import { path } from "~/utils/path";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const auth = await requirePermissions(request, {
    view: "sales"
  });
  const { client } = auth;

  const { customerId } = params;
  if (!customerId) throw new Error("Could not find customerId");
  assertCustomerAccountScope(auth, customerId);

  const customerPayment = await getCustomerPayment(client, customerId);

  if (customerPayment.error || !customerPayment.data) {
    throw redirect(
      path.to.customer(customerId),
      await flash(
        request,
        error(customerPayment.error, "Failed to load customer payment terms")
      )
    );
  }

  return {
    customerPayment: customerPayment.data
  };
}

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const auth = await requirePermissions(request, {
    update: "sales"
  });
  const { client, userId } = auth;

  const { customerId } = params;
  if (!customerId) throw new Error("Could not find customerId");
  assertCustomerAccountScope(auth, customerId);

  // validate with salesValidator
  const validation = await validator(customerPaymentValidator).validate(
    await request.formData()
  );

  if (validation.error) {
    return validationError(validation.error);
  }
  if (validation.data.customerId !== customerId) {
    throw badRequest("customerId does not match route parameter");
  }

  const update = await updateCustomerPayment(client, {
    ...validation.data,
    customerId,
    updatedBy: userId
  });
  if (update.error) {
    throw redirect(
      path.to.customer(customerId),
      await flash(
        request,
        error(update.error, "Failed to update customer payment terms")
      )
    );
  }

  throw redirect(
    path.to.customerPayment(customerId),
    await flash(request, success("Updated customer payment terms"))
  );
}

export default function CustomerPaymentRoute() {
  const { customerPayment } = useLoaderData<typeof loader>();
  const initialValues = {
    customerId: customerPayment?.customerId ?? "",
    invoiceCustomerId: customerPayment?.invoiceCustomerId ?? "",
    invoiceCustomerContactId: customerPayment?.invoiceCustomerContactId ?? "",
    invoiceCustomerLocationId: customerPayment?.invoiceCustomerLocationId ?? "",
    paymentTermId: customerPayment?.paymentTermId ?? ""
  };

  return <CustomerPaymentForm initialValues={initialValues} />;
}
