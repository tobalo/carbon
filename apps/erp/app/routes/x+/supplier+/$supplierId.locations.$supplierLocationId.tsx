import {
  assertIsPost,
  badRequest,
  error,
  notFound,
  success
} from "@carbon/auth";
import {
  assertSupplierAccountScope,
  requirePermissions
} from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import type {
  ActionFunctionArgs,
  ClientActionFunctionArgs,
  LoaderFunctionArgs
} from "react-router";
import { redirect, useLoaderData, useNavigate, useParams } from "react-router";
import {
  getSupplierLocation,
  supplierLocationValidator,
  updateSupplierLocation
} from "~/modules/purchasing";
import SupplierLocationForm from "~/modules/purchasing/ui/Supplier/SupplierLocationForm";
import { getCustomFields, setCustomFields } from "~/utils/form";
import { path } from "~/utils/path";
import { supplierLocationsQuery } from "~/utils/react-query";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const auth = await requirePermissions(request, {
    view: "purchasing"
  });
  const { client } = auth;

  const { supplierId, supplierLocationId } = params;
  if (!supplierId) throw notFound("supplierId not found");
  if (!supplierLocationId) throw notFound("supplierLocationId not found");
  assertSupplierAccountScope(auth, supplierId);

  const location = await getSupplierLocation(
    client,
    supplierLocationId,
    supplierId
  );
  if (location.error) {
    throw redirect(
      path.to.supplierLocations(supplierId),
      await flash(
        request,
        error(location.error, "Failed to get supplier location")
      )
    );
  }

  return {
    location: location.data
  };
}

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const auth = await requirePermissions(request, {
    update: "purchasing"
  });
  const { client } = auth;

  const { supplierId, supplierLocationId } = params;
  if (!supplierId) throw notFound("supplierId not found");
  if (!supplierLocationId) throw notFound("supplierLocationId not found");
  assertSupplierAccountScope(auth, supplierId);

  const formData = await request.formData();
  const validation = await validator(supplierLocationValidator).validate(
    formData
  );

  if (validation.error) {
    return validationError(validation.error);
  }

  // biome-ignore lint/correctness/noUnusedVariables: suppressed due to migration
  const { id, addressId, name, ...address } = validation.data;

  if (addressId === undefined)
    throw badRequest("addressId is undefined in form data");

  const existingLocation = await getSupplierLocation(
    client,
    supplierLocationId,
    supplierId
  );
  const existingAddressId = existingLocation.data?.address?.id;
  if (existingLocation.error || !existingAddressId) {
    throw redirect(
      path.to.supplierLocations(supplierId),
      await flash(
        request,
        error(existingLocation.error, "Failed to verify supplier location")
      )
    );
  }
  if (addressId !== existingAddressId) {
    throw badRequest("addressId does not match scoped supplier location");
  }

  const update = await updateSupplierLocation(client, {
    addressId: existingAddressId,
    name,
    address,
    customFields: setCustomFields(formData)
  });
  if (update.error) {
    throw redirect(
      path.to.supplierLocations(supplierId),
      await flash(
        request,
        error(update.error, "Failed to update supplier address")
      )
    );
  }

  throw redirect(
    path.to.supplierLocations(supplierId),
    await flash(request, success("Supplier address updated"))
  );
}

export async function clientAction({
  serverAction,
  params
}: ClientActionFunctionArgs) {
  const { supplierId } = params;
  if (supplierId) {
    window.clientCache?.setQueryData(
      supplierLocationsQuery(supplierId).queryKey,
      null
    );
  }
  return await serverAction();
}

export default function EditSupplierLocationRoute() {
  const { location } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const { supplierId } = useParams();
  if (!supplierId) throw new Error("supplierId not found");

  const initialValues = {
    id: location?.id ?? undefined,
    addressId: location?.address?.id ?? undefined,
    name: location?.name ?? undefined,

    addressLine1: location?.address?.addressLine1 ?? "",
    addressLine2: location?.address?.addressLine2 ?? "",
    city: location?.address?.city ?? "",
    stateProvince: location?.address?.stateProvince ?? "",
    postalCode: location?.address?.postalCode ?? "",
    countryCode: location?.address?.country?.alpha2 ?? "",
    ...getCustomFields(location?.customFields)
  };

  return (
    <SupplierLocationForm
      key={initialValues.id}
      supplierId={supplierId}
      initialValues={initialValues}
      onClose={() => navigate(path.to.supplierLocations(supplierId))}
    />
  );
}
