import { invokeFunction } from "@carbon/auth/functions.server";
import { requirePermissions } from "@carbon/auth/auth.server";
import type { ActionFunctionArgs } from "react-router";
import { getCompanySettings } from "~/modules/settings";

export async function action({ request, params }: ActionFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "invoicing"
  });

  const { invoiceId } = params;
  if (!invoiceId) throw new Error("invoiceId not found");

  const formData = await request.formData();
  const skipReceiptPost = formData.get("skipReceiptPost") === "true";

  const setPendingState = await client
    .from("purchaseInvoice")
    .update({
      status: "Pending"
    })
    .eq("id", invoiceId)
    .eq("companyId", companyId);

  if (setPendingState.error) {
    return {
      success: false,
      message: "Failed to post purchase invoice"
    };
  }

  let receiptIds: string[] | undefined;

  try {
    const postPurchaseInvoice = await invokeFunction<{
      receiptIds?: string[];
    }>("post-purchase-invoice", {
      body: {
        invoiceId: invoiceId,
        userId: userId,
        companyId: companyId,
        skipReceiptPost: skipReceiptPost
      },
    });

    if (postPurchaseInvoice.error) {
      await client
        .from("purchaseInvoice")
        .update({
          status: "Draft"
        })
        .eq("id", invoiceId)
        .eq("companyId", companyId);

      return {
        success: false,
        message: "Failed to post purchase invoice"
      };
    }

    receiptIds = postPurchaseInvoice.data?.receiptIds;

    // Check if we should update prices on invoice post
    const companySettings = await getCompanySettings(client, companyId);
    if (
      !companySettings.data?.purchasePriceUpdateTiming ||
      companySettings.data.purchasePriceUpdateTiming === "Purchase Invoice Post"
    ) {
      const priceUpdate = await invokeFunction(
        "update-purchased-prices",
        {
          body: {
            invoiceId: invoiceId,
            companyId: companyId,
            source: "purchaseInvoice",
            updatePrices: true,
            updateLeadTimes: false
          },
        }
      );

      if (priceUpdate.error) {
        await client
          .from("purchaseInvoice")
          .update({
            status: "Draft"
          })
          .eq("id", invoiceId)
          .eq("companyId", companyId);

        return {
          success: false,
          message: "Failed to update prices"
        };
      }
    }
    // biome-ignore lint/correctness/noUnusedVariables: suppressed due to migration
  } catch (error) {
    await client
      .from("purchaseInvoice")
      .update({
        status: "Draft"
      })
      .eq("id", invoiceId)
      .eq("companyId", companyId);

    return {
      success: false,
      message: "Failed to post purchase invoice"
    };
  }

  const receiptId =
    skipReceiptPost && receiptIds?.[0] ? receiptIds[0] : undefined;

  return {
    success: true,
    message: "Purchase invoice posted successfully",
    receiptId
  };
}
