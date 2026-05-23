import { getCarbonServiceClient } from "@carbon/auth/client.server";
import { inngest } from "../../client";
import { invokeFunction } from "../../../lib/functions";
import type { JobQueryClient } from "../../../lib/query-client";

const postTransactionDocumentTables = {
  receipt: "receipt",
  "purchase-invoice": "purchaseInvoice",
  shipment: "shipment"
} as const;

export const postTransactionFunction = inngest.createFunction(
  { id: "post-transactions", retries: 3 },
  { event: "carbon/post-transaction" },
  async ({ event, step }) => {
    const serviceClient = getCarbonServiceClient();
    const payload = event.data;

    const result = await step.run("post-transaction", async () => {
      console.info(
        `Post transaction ${payload.type} for ${payload.documentId}`
      );

      const scope = await verifyPostTransactionScope(serviceClient, payload);
      if (!scope.success) {
        return scope;
      }

      let result: { success: boolean; message?: string };

      switch (payload.type) {
        case "receipt":
          console.info(`Posting receipt ${payload.documentId}`);
          console.info(payload);
          const postReceipt = await invokeFunction("post-receipt", {
            body: {
              receiptId: payload.documentId,
              userId: payload.userId,
              companyId: payload.companyId
            }
          });

          result = {
            success: postReceipt.error === null,
            message: postReceipt.error?.message
          };

          break;
        case "purchase-invoice":
          console.info(`Posting purchase invoice ${payload.documentId}`);
          console.info(payload);
          const postPurchaseInvoice = await invokeFunction(
            "post-purchase-invoice",
            {
              body: {
                invoiceId: payload.documentId,
                userId: payload.userId,
                companyId: payload.companyId
              }
            }
          );

          result = {
            success: postPurchaseInvoice.error === null,
            message: postPurchaseInvoice.error?.message
          };

          if (result.success) {
            // Check if we should update prices on invoice post
            const companySettings = await serviceClient
              .from("companySettings")
              .select("purchasePriceUpdateTiming")
              .eq("id", payload.companyId)
              .single();

            if (
              !companySettings.data?.purchasePriceUpdateTiming ||
              companySettings.data.purchasePriceUpdateTiming ===
                "Purchase Invoice Post"
            ) {
              console.info(
                `Updating pricing from invoice ${payload.documentId}`
              );

              const priceUpdate = await invokeFunction(
                "update-purchased-prices",
                {
                  body: {
                    invoiceId: payload.documentId,
                    companyId: payload.companyId,
                    source: "purchaseInvoice"
                  }
                }
              );

              result = {
                success: priceUpdate.error === null,
                message: priceUpdate.error?.message
              };
            }
          }

          break;
        case "shipment":
          console.info(`Posting shipment ${payload.documentId}`);
          console.info(payload);

          const postShipment = await invokeFunction("post-shipment", {
            body: {
              shipmentId: payload.documentId,
              userId: payload.userId,
              companyId: payload.companyId
            }
          });

          result = {
            success: postShipment.error === null,
            message: postShipment.error?.message
          };

          break;
        default:
          result = {
            success: false,
            message: `Invalid posting type: ${payload.type}`
          };
          break;
      }

      if (result.success) {
        console.info(`Success ${payload.documentId}`);
      } else {
        console.error(
          `Admin action ${payload.type} failed for ${payload.documentId}: ${result.message}`
        );
      }

      return result;
    });

    return result;
  }
);

async function verifyPostTransactionScope(
  client: JobQueryClient,
  payload: {
    type: string;
    documentId: string;
    companyId: string;
  }
) {
  const table =
    postTransactionDocumentTables[
      payload.type as keyof typeof postTransactionDocumentTables
    ];

  if (!table) {
    return {
      success: false,
      message: `Invalid posting type: ${payload.type}`
    };
  }

  const [company, document] = await Promise.all([
    client
      .from("company")
      .select("id")
      .eq("id", payload.companyId)
      .eq("active", true)
      .single(),
    client
      .from(table)
      .select("id")
      .eq("id", payload.documentId)
      .eq("companyId", payload.companyId)
      .single()
  ]);

  if (company.error || !company.data) {
    return {
      success: false,
      message: "Company is inactive or not found"
    };
  }

  if (document.error || !document.data) {
    return {
      success: false,
      message: `${payload.type} ${payload.documentId} not found in company ${payload.companyId}`
    };
  }

  return { success: true };
}
