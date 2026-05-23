import { requirePermissions } from "@carbon/auth/auth.server";
import { error } from "@carbon/auth";
import { flash } from "@carbon/auth/session.server";
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  getPurchasingRFQ,
  getSupplierQuotesForComparison
} from "~/modules/purchasing";
import { path } from "~/utils/path";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    view: "purchasing"
  });

  const { rfqId } = params;
  if (!rfqId) throw new Error("rfqId not found");

  const rfq = await getPurchasingRFQ(client, rfqId);
  if (rfq.error) {
    throw redirect(
      path.to.purchasingRfqs,
      await flash(request, error(rfq.error, "Failed to load purchasing RFQ"))
    );
  }

  if (rfq.data.companyId !== companyId) {
    throw redirect(path.to.purchasingRfqs);
  }

  const comparison = await getSupplierQuotesForComparison(client, rfqId);

  return {
    quotes: comparison.data?.quotes ?? [],
    lines: comparison.data?.lines ?? [],
    prices: comparison.data?.prices ?? []
  };
}
