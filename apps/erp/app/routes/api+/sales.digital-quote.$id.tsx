import { assertIsPost, notFound } from "@carbon/auth";
import { getCarbonServiceClient } from "@carbon/auth/client.server";
import { trigger } from "@carbon/jobs";
import { NotificationEvent } from "@carbon/notifications";
import { uploadObject } from "@carbon/storage";
import type { ActionFunctionArgs } from "react-router";
import {
  convertQuoteToOrder,
  externalQuoteValidator,
  getQuoteByExternalId,
  getSalesOrder,
  selectedLinesValidator
} from "~/modules/sales";
import { getCompanySettings } from "~/modules/settings";
import { getExternalLink } from "~/modules/shared";
import { generateAndAttachSalesOrderPdf } from "~/modules/shared/shared.server";
import { loader as pdfLoader } from "~/routes/file+/sales-order+/$id[.]pdf";

function isExpired(date: string | null | undefined) {
  return Boolean(date && new Date(date) < new Date());
}

export async function action(args: ActionFunctionArgs) {
  const { request, params } = args;
  assertIsPost(request);

  const { id } = params;
  if (!id) throw notFound("id not found");

  const formData = await request.formData();
  const type = String(formData.get("type"));

  const serviceClient = getCarbonServiceClient();
  const externalLink = await getExternalLink(serviceClient, id);
  if (
    externalLink.error ||
    externalLink.data?.documentType !== "Quote" ||
    isExpired(externalLink.data.expiresAt)
  ) {
    return {
      success: false,
      message: "Quote not found"
    };
  }

  const quote = await getQuoteByExternalId(serviceClient, id, {
    companyId: externalLink.data.companyId,
    documentId: externalLink.data.documentId,
    customerId: externalLink.data.customerId
  });

  if (quote.error) {
    console.error("Quote not found", quote.error);
    return {
      success: false,
      message: "Quote not found"
    };
  }

  const companySettings = await getCompanySettings(
    serviceClient,
    quote.data.companyId
  );

  switch (type) {
    case "accept":
      const acceptedValidation = externalQuoteValidator.safeParse({
        type,
        digitalQuoteAcceptedBy: formData.get("digitalQuoteAcceptedBy"),
        digitalQuoteAcceptedByEmail: formData.get(
          "digitalQuoteAcceptedByEmail"
        )
      });

      if (!acceptedValidation.success) {
        return { success: false, message: "Invalid quote response" };
      }

      if (acceptedValidation.data.type !== "accept") {
        return { success: false, message: "Invalid quote response" };
      }

      const { digitalQuoteAcceptedBy, digitalQuoteAcceptedByEmail } =
        acceptedValidation.data;
      const selectedLinesRaw = formData.get("selectedLines") ?? "{}";
      const file = formData.get("file");

      if (typeof selectedLinesRaw !== "string") {
        return { success: false, message: "Invalid selected lines data" };
      }

      const parseResult = selectedLinesValidator.safeParse(
        JSON.parse(selectedLinesRaw)
      );

      if (!parseResult.success) {
        console.error("Validation error:", parseResult.error);
        return { success: false, message: "Invalid selected lines data" };
      }

      const selectedLines = parseResult.data;
      const selectedLineIds = Object.keys(selectedLines);

      if (selectedLineIds.length === 0) {
        return { success: false, message: "Invalid selected lines data" };
      }

      const validLines = await serviceClient
        .from("quoteLine")
        .select("id")
        .eq("quoteId", quote.data.id)
        .eq("companyId", quote.data.companyId)
        .in("id", selectedLineIds);

      if (
        validLines.error ||
        new Set((validLines.data ?? []).map((line) => line.id)).size !==
          selectedLineIds.length
      ) {
        console.error("Invalid selected quote lines", validLines.error);
        return { success: false, message: "Invalid selected lines data" };
      }

      // Extract purchase order number from PDF filename if available
      let purchaseOrderNumber = "";
      if (file instanceof File && file.name.toLowerCase().endsWith(".pdf")) {
        purchaseOrderNumber = file.name.replace(/\.pdf$/i, "");
      }

      const [convert] = await Promise.all([
        convertQuoteToOrder(serviceClient, {
          id: quote.data.id,
          companyId: quote.data.companyId,
          userId: quote.data.createdBy,
          selectedLines,
          digitalQuoteAcceptedBy,
          digitalQuoteAcceptedByEmail,
          purchaseOrderNumber
        })
      ]);

      if (convert.error) {
        console.error("Failed to convert quote to order", convert.error);
        return {
          success: false,
          message: "Failed to convert quote to order"
        };
      }

      // Generate and attach the sales order PDF — non-blocking on failure
      const salesOrderId = convert.data?.convertedId;
      if (salesOrderId) {
        try {
          const salesOrder = await getSalesOrder(serviceClient, salesOrderId);
          if (
            salesOrder.data?.companyId === quote.data.companyId &&
            salesOrder.data?.salesOrderId &&
            salesOrder.data?.opportunityId
          ) {
            await generateAndAttachSalesOrderPdf({
              routeArgs: args,
              salesOrderId,
              salesOrderIdentifier: salesOrder.data.salesOrderId,
              opportunityId: salesOrder.data.opportunityId,
              companyId: quote.data.companyId,
              userId: quote.data.createdBy,
              client: serviceClient,
              pdfLoader
            });
          }
        } catch (err) {
          console.error(
            "Failed to generate PDF after digital quote acceptance",
            err
          );
        }
      }

      if (companySettings.error) {
        console.error("Failed to get company settings", companySettings.error);
        return {
          success: false,
          message: "Failed to send notification"
        };
      }

      if (companySettings.data?.digitalQuoteNotificationGroup?.length) {
        try {
          await trigger("notify", {
            companyId: companySettings.data.id,
            documentId: quote.data.id,
            event: NotificationEvent.DigitalQuoteResponse,
            recipient: {
              type: "group",
              groupIds:
                companySettings.data?.digitalQuoteNotificationGroup ?? []
            }
          });
        } catch (err) {
          console.error("Failed to trigger notification", err);
          return {
            success: false,
            message: "Failed to send notification"
          };
        }
      }

      if (file && file instanceof File) {
        const purchaseOrderDocumentPath = `${companySettings.data.id}/opportunity/${quote.data.opportunityId}/${file.name}`;

        try {
          await uploadObject({
            companyId: companySettings.data.id,
            key: purchaseOrderDocumentPath,
            body: new Uint8Array(await file.arrayBuffer()),
            contentType: file.type || "application/octet-stream"
          });
        } catch (uploadError) {
          console.error("Failed to upload file", uploadError);
          return {
            success: false,
            message: "Failed to upload file"
          };
        }

        const updateOpportunity = await serviceClient
          .from("opportunity")
          .update({
            purchaseOrderDocumentPath
          })
          .eq("id", quote.data.opportunityId!)
          .eq("companyId", quote.data.companyId);

        if (updateOpportunity.error) {
          console.error(
            "Failed to update opportunity",
            updateOpportunity.error
          );
        }
      }

      return {
        success: true,
        message: "Quote accepted!"
      };

    case "reject":
      const rejectedValidation = externalQuoteValidator.safeParse({
        type,
        digitalQuoteRejectedBy: formData.get("digitalQuoteRejectedBy"),
        digitalQuoteRejectedByEmail: formData.get(
          "digitalQuoteRejectedByEmail"
        )
      });

      if (!rejectedValidation.success) {
        return { success: false, message: "Invalid quote response" };
      }

      if (rejectedValidation.data.type !== "reject") {
        return { success: false, message: "Invalid quote response" };
      }

      const { digitalQuoteRejectedBy, digitalQuoteRejectedByEmail } =
        rejectedValidation.data;

      const rejectQuote = await serviceClient
        .from("quote")
        .update({
          status: "Lost",
          digitalQuoteRejectedBy,
          digitalQuoteRejectedByEmail
        })
        .eq("id", quote.data.id)
        .eq("companyId", quote.data.companyId)
        .eq("externalLinkId", id);

      if (rejectQuote.error) {
        console.error("Failed to reject quote", rejectQuote.error);
        return {
          success: false,
          message: "Failed to reject quote"
        };
      }

      if (companySettings.data?.digitalQuoteNotificationGroup?.length) {
        try {
          await trigger("notify", {
            companyId: companySettings.data.id,
            documentId: quote.data.id,
            event: NotificationEvent.DigitalQuoteResponse,
            recipient: {
              type: "group",
              groupIds:
                companySettings.data?.digitalQuoteNotificationGroup ?? []
            }
          });
        } catch (err) {
          console.error("Failed to trigger notification", err);
          return {
            success: false,
            message: "Failed to send notification"
          };
        }
      }

      return {
        success: true,
        message: "Quote rejected!"
      };

    default:
      return { success: false, message: "Invalid type" };
  }
}
