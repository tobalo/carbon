import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  convertSupplierQuoteToOrder,
  getSupplier,
  getSupplierQuote,
  selectedLinesValidator
} from "~/modules/purchasing";
import { isApprovalRequired } from "~/modules/shared";
import { path } from "~/utils/path";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId, userId } = await requirePermissions(request, {
    create: "purchasing"
  });

  const { id } = params;
  if (!id) throw new Error("Could not find id");

  const formData = await request.formData();
  const selectedLinesRaw = formData.get("selectedLines") ?? "{}";

  if (typeof selectedLinesRaw !== "string") {
    throw redirect(
      path.to.supplierQuoteDetails(id),
      await flash(request, error("Invalid selected lines data"))
    );
  }

  const parseResult = selectedLinesValidator.safeParse(
    JSON.parse(selectedLinesRaw)
  );

  if (!parseResult.success) {
    console.error("Validation error:", parseResult.error);
    throw redirect(
      path.to.supplierQuoteDetails(id),
      await flash(request, error("Invalid selected lines data"))
    );
  }

  const selectedLines = parseResult.data;

  // Check supplier approval status
  const [quote, supplierApprovalRequired] = await Promise.all([
    getSupplierQuote(client, id),
    isApprovalRequired(client, "supplier", companyId)
  ]);

  if (quote.error) {
    throw redirect(
      path.to.supplierQuoteDetails(id),
      await flash(request, error(quote.error, "Failed to load supplier quote"))
    );
  }

  if (quote.data.companyId !== companyId) {
    throw redirect(path.to.supplierQuotes);
  }

  if (supplierApprovalRequired && quote.data?.supplierId) {
    const supplier = await getSupplier(client, quote.data.supplierId);
    if (supplier.data?.status !== "Active") {
      throw redirect(
        path.to.supplierQuoteDetails(id),
        await flash(
          request,
          error("Cannot convert to order: supplier is not approved (Active)")
        )
      );
    }
  }

  const convert = await convertSupplierQuoteToOrder(client, {
    id: id,
    companyId,
    userId,
    selectedLines
  });

  if (convert.error) {
    throw redirect(
      path.to.supplierQuoteDetails(id),
      await flash(
        request,
        error(convert.error, "Failed to convert quote to order")
      )
    );
  }

  throw redirect(
    path.to.purchaseOrder(convert.data?.convertedId!),
    await flash(request, success("Successfully converted quote to order"))
  );
}
