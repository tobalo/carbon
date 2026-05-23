import { assertIsPost, error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { recalculateQuoteLinePrices } from "~/modules/sales";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId, userId } = await requirePermissions(request, {
    delete: "sales"
  });

  const { quoteId, lineId, id } = params;
  if (!quoteId) {
    throw new Error("quoteId not found");
  }
  if (!lineId) {
    throw new Error("lineId not found");
  }
  if (!id) {
    throw new Error("id not found");
  }

  const deleteMaterial = await client
    .from("quoteMaterial")
    .delete()
    .eq("id", id)
    .eq("companyId", companyId);
  if (deleteMaterial.error) {
    return data(
      {
        id: null
      },
      await flash(
        request,
        error(deleteMaterial.error, "Failed to delete quote material")
      )
    );
  }

  await recalculateQuoteLinePrices(client, quoteId, lineId, userId);

  return {};
}
