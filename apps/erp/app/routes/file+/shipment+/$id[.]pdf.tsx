import { requirePermissions } from "@carbon/auth/auth.server";
import { PackingSlipPDF } from "@carbon/documents/pdf";
import type { JSONContent } from "@carbon/react";
import { getPreferenceHeaders } from "@carbon/react";
import { renderToStream } from "@react-pdf/renderer";
import type { LoaderFunctionArgs } from "react-router";
import { getPaymentTerm } from "~/modules/accounting";
import {
  getShipment,
  getShipmentLinesWithDetails,
  getShipmentTracking,
  getShippingMethod
} from "~/modules/inventory";
import {
  getPurchaseOrder,
  getPurchaseOrderDelivery,
  getSupplierLocation
} from "~/modules/purchasing";
import {
  getCustomerLocation,
  getSalesOrder,
  getSalesOrderShipment,
  getSalesTerms
} from "~/modules/sales";
import { getCompany, getCompanySettings } from "~/modules/settings";
import { getBase64ImageFromStorage } from "~/modules/shared";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    view: "inventory"
  });

  const { id } = params;
  if (!id) throw new Error("Could not find id");

  const [company, companySettings, shipment, shipmentLines] = await Promise.all(
    [
      getCompany(client, companyId),
      getCompanySettings(client, companyId),
      getShipment(client, id, companyId),
      getShipmentLinesWithDetails(client, id, companyId)
    ]
  );

  if (company.error) {
    console.error(company.error);
  }

  if (shipment.error) {
    console.error(shipment.error);
  }

  if (shipmentLines.error) {
    console.error(shipmentLines.error);
  }

  const terms = await getSalesTerms(client, companyId);

  if (terms.error) {
    console.error(terms.error);
  }

  if (
    company.error ||
    shipment.error ||
    shipmentLines.error ||
    terms.error ||
    shipment.data.companyId !== companyId ||
    shipment.data.sourceDocumentId === null
  ) {
    throw new Error("Failed to load sales order");
  }

  const { locale } = getPreferenceHeaders(request);

  switch (shipment.data.sourceDocument) {
    case "Sales Order": {
      const [salesOrder, salesOrderShipment] = await Promise.all([
        getSalesOrder(client, shipment.data.sourceDocumentId, companyId),
        getSalesOrderShipment(client, shipment.data.sourceDocumentId, companyId)
      ]);

      if (salesOrder.error || !salesOrder.data) {
        console.error(salesOrder.error);
        throw new Error("Failed to load sales order");
      }

      const [
        customer,
        customerLocation,
        paymentTerm,
        shippingMethod,
        shipmentTracking
      ] = await Promise.all([
        client
          .from("customer")
          .select("*")
          .eq("id", salesOrder.data?.customerId ?? "")
          .eq("companyId", companyId)
          .single(),
        getCustomerLocation(
          client,
          salesOrder.data.customerLocationId ?? "",
          salesOrder.data.customerId ?? undefined,
          companyId
        ),
        getPaymentTerm(client, salesOrder.data.paymentTermId ?? "", companyId),
        getShippingMethod(
          client,
          shipment.data.shippingMethodId ??
            salesOrderShipment.data?.shippingMethodId ??
            "",
          companyId
        ),
        getShipmentTracking(client, shipment.data.id, companyId)
      ]);

      if (customer.error) {
        console.error(customer.error);
        throw new Error("Failed to load customer");
      }

      let thumbnails: Record<string, string | null> = {};

      if (companySettings.data?.includeThumbnailsOnSalesPdfs ?? true) {
        const thumbnailPaths = shipmentLines.data?.reduce<
          Record<string, string | null>
        >((acc, line) => {
          if (line.thumbnailPath) {
            acc[line.id!] = line.thumbnailPath;
          }
          return acc;
        }, {});

        thumbnails =
          (thumbnailPaths
            ? await Promise.all(
                Object.entries(thumbnailPaths).map(([id, path]) => {
                  if (!path) {
                    return null;
                  }
                  return getBase64ImageFromStorage(client, path).then(
                    (data) => ({
                      id,
                      data
                    })
                  );
                })
              )
            : []
          )?.reduce<Record<string, string | null>>((acc, thumbnail) => {
            if (thumbnail) {
              acc[thumbnail.id] = thumbnail.data;
            }
            return acc;
          }, {}) ?? {};
      }

      const stream = await renderToStream(
        <PackingSlipPDF
          company={company.data as any}
          customer={customer.data}
          locale={locale}
          meta={{
            author: "Carbon",
            keywords: "packing slip",
            subject: "Packing Slip"
          }}
          customerReference={salesOrder.data?.customerReference ?? undefined}
          sourceDocument="Sales Order"
          sourceDocumentId={salesOrder.data?.salesOrderId ?? undefined}
          shipment={shipment.data}
          shipmentLines={shipmentLines.data ?? []}
          shippingAddress={customerLocation.data?.address ?? null}
          terms={(terms?.data?.salesTerms ?? {}) as JSONContent}
          paymentTerm={paymentTerm.data ?? { id: "", name: "" }}
          shippingMethod={shippingMethod.data ?? { id: "", name: "" }}
          trackedEntities={shipmentTracking.data ?? []}
          title="Packing Slip"
          thumbnails={thumbnails}
        />
      );

      const body: Buffer = await new Promise((resolve, reject) => {
        const buffers: Uint8Array[] = [];
        stream.on("data", (data) => {
          buffers.push(data);
        });
        stream.on("end", () => {
          resolve(Buffer.concat(buffers));
        });
        stream.on("error", reject);
      });

      const headers = new Headers({
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${company.data.name} - ${shipment.data.shipmentId}.pdf"`
      });
      return new Response(new Uint8Array(body), { status: 200, headers });
    }
    case "Sales Invoice": {
      const salesInvoice = await client
        .from("salesInvoice")
        .select("*")
        .eq("id", shipment.data.sourceDocumentId ?? "")
        .eq("companyId", companyId)
        .single();

      if (salesInvoice.error) {
        console.error(salesInvoice.error);
        throw new Error("Failed to load sales invoice");
      }

      const salesInvoiceShipment = await client
        .from("salesInvoiceShipment")
        .select("*")
        .eq("id", salesInvoice.data?.id ?? "")
        .eq("companyId", companyId)
        .maybeSingle();

      const [
        customer,
        customerLocation,
        paymentTerm,
        shippingMethod,
        shipmentTracking
      ] = await Promise.all([
        client
          .from("customer")
          .select("*")
          .eq("id", salesInvoice.data?.customerId ?? "")
          .eq("companyId", companyId)
          .single(),
        getCustomerLocation(
          client,
          salesInvoice.data?.locationId ?? "",
          salesInvoice.data?.customerId ?? undefined,
          companyId
        ),
        getPaymentTerm(
          client,
          salesInvoice.data?.paymentTermId ?? "",
          companyId
        ),
        getShippingMethod(
          client,
          shipment.data.shippingMethodId ??
            salesInvoiceShipment.data?.shippingMethodId ??
            "",
          companyId
        ),
        getShipmentTracking(client, shipment.data.id, companyId)
      ]);

      if (customer.error) {
        console.error(customer.error);
        throw new Error("Failed to load customer");
      }

      let thumbnails: Record<string, string | null> = {};

      if (companySettings.data?.includeThumbnailsOnSalesPdfs ?? true) {
        const thumbnailPaths = shipmentLines.data?.reduce<
          Record<string, string | null>
        >((acc, line) => {
          if (line.thumbnailPath) {
            acc[line.id!] = line.thumbnailPath;
          }
          return acc;
        }, {});

        thumbnails =
          (thumbnailPaths
            ? await Promise.all(
                Object.entries(thumbnailPaths).map(([id, path]) => {
                  if (!path) {
                    return null;
                  }
                  return getBase64ImageFromStorage(client, path).then(
                    (data) => ({
                      id,
                      data
                    })
                  );
                })
              )
            : []
          )?.reduce<Record<string, string | null>>((acc, thumbnail) => {
            if (thumbnail) {
              acc[thumbnail.id] = thumbnail.data;
            }
            return acc;
          }, {}) ?? {};
      }

      const stream = await renderToStream(
        <PackingSlipPDF
          company={company.data as any}
          customer={customer.data}
          locale={locale}
          meta={{
            author: "Carbon",
            keywords: "packing slip",
            subject: "Packing Slip"
          }}
          customerReference={salesInvoice.data?.customerReference ?? undefined}
          sourceDocument="Sales Invoice"
          sourceDocumentId={salesInvoice.data?.invoiceId ?? undefined}
          shipment={shipment.data}
          shipmentLines={shipmentLines.data ?? []}
          shippingAddress={customerLocation.data?.address ?? null}
          terms={(terms?.data?.salesTerms ?? {}) as JSONContent}
          paymentTerm={paymentTerm.data ?? { id: "", name: "" }}
          shippingMethod={shippingMethod.data ?? { id: "", name: "" }}
          trackedEntities={shipmentTracking.data ?? []}
          title="Packing Slip"
          thumbnails={thumbnails}
        />
      );

      const body: Buffer = await new Promise((resolve, reject) => {
        const buffers: Uint8Array[] = [];
        stream.on("data", (data) => {
          buffers.push(data);
        });
        stream.on("end", () => {
          resolve(Buffer.concat(buffers));
        });
        stream.on("error", reject);
      });

      const headers = new Headers({
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${company.data.name} - ${shipment.data.shipmentId}.pdf"`
      });
      return new Response(new Uint8Array(body), { status: 200, headers });
    }
    case "Purchase Order": {
      const [purchaseOrder, purchaseOrderDelivery] = await Promise.all([
        getPurchaseOrder(client, shipment.data.sourceDocumentId, companyId),
        getPurchaseOrderDelivery(
          client,
          shipment.data.sourceDocumentId,
          companyId
        )
      ]);

      if (purchaseOrder.error || !purchaseOrder.data) {
        console.error(purchaseOrder.error);
        throw new Error("Failed to load purchase order");
      }

      const [
        supplier,
        supplierLocation,
        poPaymentTerm,
        poShippingMethod,
        poShipmentTracking
      ] = await Promise.all([
        client
          .from("supplier")
          .select("*")
          .eq("id", purchaseOrder.data.supplierId ?? "")
          .eq("companyId", companyId)
          .single(),
        getSupplierLocation(
          client,
          purchaseOrder.data.supplierLocationId ?? "",
          purchaseOrder.data.supplierId ?? undefined,
          companyId
        ),
        getPaymentTerm(
          client,
          purchaseOrder.data.paymentTermId ?? "",
          companyId
        ),
        getShippingMethod(
          client,
          purchaseOrderDelivery.data?.shippingMethodId ?? "",
          companyId
        ),
        getShipmentTracking(client, shipment.data.id, companyId)
      ]);

      if (supplier.error) {
        console.error(supplier.error);
        throw new Error("Failed to load supplier");
      }

      let poThumbnails: Record<string, string | null> = {};

      if (companySettings.data?.includeThumbnailsOnPurchasingPdfs ?? true) {
        const poThumbnailPaths = shipmentLines.data?.reduce<
          Record<string, string | null>
        >((acc, line) => {
          if (line.thumbnailPath) {
            acc[line.id!] = line.thumbnailPath;
          }
          return acc;
        }, {});

        poThumbnails =
          (poThumbnailPaths
            ? await Promise.all(
                Object.entries(poThumbnailPaths).map(([id, path]) => {
                  if (!path) {
                    return null;
                  }
                  return getBase64ImageFromStorage(client, path).then(
                    (data) => ({
                      id,
                      data
                    })
                  );
                })
              )
            : []
          )?.reduce<Record<string, string | null>>((acc, thumbnail) => {
            if (thumbnail) {
              acc[thumbnail.id] = thumbnail.data;
            }
            return acc;
          }, {}) ?? {};
      }

      const poStream = await renderToStream(
        <PackingSlipPDF
          company={company.data as any}
          customer={supplier.data}
          locale={locale}
          meta={{
            author: "Carbon",
            keywords: "packing slip",
            subject: "Packing Slip"
          }}
          customerReference={purchaseOrder.data?.supplierReference ?? undefined}
          sourceDocument="Purchase Order"
          sourceDocumentId={purchaseOrder.data?.purchaseOrderId ?? undefined}
          shipment={shipment.data}
          shipmentLines={shipmentLines.data ?? []}
          shippingAddress={supplierLocation.data?.address ?? null}
          terms={(terms?.data?.salesTerms ?? {}) as JSONContent}
          paymentTerm={poPaymentTerm.data ?? { id: "", name: "" }}
          shippingMethod={poShippingMethod.data ?? { id: "", name: "" }}
          trackedEntities={poShipmentTracking.data ?? []}
          title="Packing Slip"
          thumbnails={poThumbnails}
        />
      );

      const poBody: Buffer = await new Promise((resolve, reject) => {
        const buffers: Uint8Array[] = [];
        poStream.on("data", (data) => {
          buffers.push(data);
        });
        poStream.on("end", () => {
          resolve(Buffer.concat(buffers));
        });
        poStream.on("error", reject);
      });

      const poHeaders = new Headers({
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${company.data.name} - ${shipment.data.shipmentId}.pdf"`
      });
      return new Response(new Uint8Array(poBody), {
        status: 200,
        headers: poHeaders
      });
    }
    default:
      throw new Error("Invalid source document");
  }
}
