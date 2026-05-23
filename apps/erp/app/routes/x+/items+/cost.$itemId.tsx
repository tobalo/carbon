import { assertIsPost } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import type { ActionFunctionArgs } from "react-router";
import { assertSupplierItemScope, updateItemCost } from "~/modules/items";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const auth = await requirePermissions(request, {
    update: "parts"
  });
  const { client, companyId, role, supplierId, userId } = auth;

  const formData = await request.formData();
  const unitCost = parseFloat(formData.get("unitCost") as string);

  const { itemId } = params;
  if (!itemId) throw new Error("Could not find itemId");

  await assertSupplierItemScope(client, {
    itemId,
    companyId,
    role,
    supplierId,
    userId,
    allowCreatedBy: false
  });

  const update = await updateItemCost(client, itemId, {
    unitCost,
    updatedBy: userId
  });
  if (update.error) {
    console.error("Failed to update item cost", update.error);
    return {
      error: "Failed to update item cost"
    };
  }

  return {
    error: null
  };
}
