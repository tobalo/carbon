import { invokeFunction } from "@carbon/auth/functions.server";
import type {
  Json,
  QueryDatabase,
  TableUpdate
} from "@carbon/database/schema";
import { fetchAllFromTable } from "@carbon/database";
import { getPurchaseOrderStatus } from "@carbon/utils";
import { listObjects, toStorageFileObject } from "@carbon/storage";
import { getLocalTimeZone, today } from "@internationalized/date";
import type {
  QuerySingleResponse,
  CarbonDatabaseClient
} from "@carbon/database/query-client";
import type { z } from "zod";
import { getEmployeeJob } from "~/modules/people";
import type { GenericQueryFilters } from "~/utils/query";
import { setGenericQueryFilters } from "~/utils/query";
import { sanitize } from "@carbon/utils";
import { getCurrencyByCode } from "../accounting/accounting.service";
import type { PurchaseInvoice } from "../invoicing/types";
import {
  canApproveRequest,
  getLatestApprovalRequestForDocument,
  upsertExternalLink
} from "../shared/shared.service";
import type {
  purchaseOrderDeliveryValidator,
  purchaseOrderLineValidator,
  purchaseOrderPaymentValidator,
  purchaseOrderStatusType,
  purchaseOrderValidator,
  purchasingRfqStatusType,
  selectedLinesValidator,
  supplierAccountingValidator,
  supplierContactValidator,
  supplierPaymentValidator,
  supplierProcessValidator,
  supplierQuoteLineValidator,
  supplierQuoteStatusType,
  supplierQuoteValidator,
  supplierShippingValidator,
  supplierTaxValidator,
  supplierTypeValidator,
  supplierValidator
} from "./purchasing.models";
import type { PurchaseOrder, PurchasingRFQ, SupplierQuote } from "./types";

export async function closePurchaseOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchaseOrderId: string,
  userId: string
) {
  return client
    .from("purchaseOrder")
    .update({
      closed: true,
      closedAt: today(getLocalTimeZone()).toString(),
      closedBy: userId
    })
    .eq("id", purchaseOrderId)
    .select("id")
    .single();
}

export async function convertSupplierQuoteToOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  payload: {
    id: string;
    selectedLines: z.infer<typeof selectedLinesValidator>;
    companyId: string;
    userId: string;
  }
) {
  return invokeFunction<{ convertedId: string }>("convert", {
    body: {
      type: "supplierQuoteToPurchaseOrder",
      ...payload
    },
  });
}

export async function deletePurchaseOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchaseOrderId: string
) {
  return client.from("purchaseOrder").delete().eq("id", purchaseOrderId);
}

export async function deletePurchaseOrderLine(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchaseOrderLineId: string
) {
  return client
    .from("purchaseOrderLine")
    .delete()
    .eq("id", purchaseOrderLineId);
}

export async function deleteSupplier(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierId: string
) {
  return client.from("supplier").delete().eq("id", supplierId);
}

export async function deleteSupplierContact(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierId: string,
  supplierContactId: string
) {
  const supplierContact = await client
    .from("supplierContact")
    .select("contactId")
    .eq("supplierId", supplierId)
    .eq("id", supplierContactId)
    .single();
  if (supplierContact.data) {
    const contactDelete = await client
      .from("contact")
      .delete()
      .eq("id", supplierContact.data.contactId);

    if (contactDelete.error) {
      return contactDelete;
    }
  }
  return supplierContact;
}

export async function deleteSupplierLocation(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierId: string,
  supplierLocationId: string
) {
  const { data: supplierLocation } = await client
    .from("supplierLocation")
    .select("addressId")
    .eq("supplierId", supplierId)
    .eq("id", supplierLocationId)
    .single();

  if (supplierLocation?.addressId) {
    return client.from("address").delete().eq("id", supplierLocation.addressId);
  } else {
    // The supplierLocation should always have an addressId, but just in case
    return client
      .from("supplierLocation")
      .delete()
      .eq("supplierId", supplierId)
      .eq("id", supplierLocationId);
  }
}

export async function deleteSupplierProcess(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierProcessId: string,
  supplierId?: string
) {
  let query = client
    .from("supplierProcess")
    .delete()
    .eq("id", supplierProcessId);

  if (supplierId) query = query.eq("supplierId", supplierId);

  return query.single();
}

export async function deleteSupplierQuote(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierQuoteId: string
) {
  return client.from("supplierQuote").delete().eq("id", supplierQuoteId);
}

export async function deleteSupplierQuoteLine(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("supplierQuoteLine").delete().eq("id", id);
}

export async function deleteSupplierType(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierTypeId: string
) {
  return client.from("supplierType").delete().eq("id", supplierTypeId);
}

export async function getPurchaseOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchaseOrderId: string,
  companyId?: string
) {
  let query = client
    .from("purchaseOrders")
    .select("*")
    .eq("id", purchaseOrderId);
  if (companyId) query = query.eq("companyId", companyId);
  return query.single();
}

export async function finalizeSupplierQuote(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierQuoteId: string,
  userId: string
) {
  const quoteUpdate = await client
    .from("supplierQuote")
    .update({
      status: "Active",
      updatedAt: today(getLocalTimeZone()).toString(),
      updatedBy: userId
    })
    .eq("id", supplierQuoteId);

  if (quoteUpdate.error) {
    return quoteUpdate;
  }

  return { data: null, error: null };
}

export async function getPurchaseOrders(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
    status: string | null;
    supplierId: string | null;
  }
) {
  let query = client
    .from("purchaseOrders")
    .select("*", { count: "exact" })
    .eq("companyId", companyId);

  if (args.search) {
    query = query.or(
      `purchaseOrderId.ilike.%${args.search}%,supplierReference.ilike.%${args.search}%`
    );
  }

  if (args.supplierId) {
    query = query.eq("supplierId", args.supplierId);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "purchaseOrderId", ascending: false }
  ]);

  return query;
}

export async function getPurchaseOrderDelivery(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchaseOrderId: string,
  companyId?: string
) {
  let query = client
    .from("purchaseOrderDelivery")
    .select("*")
    .eq("id", purchaseOrderId);
  if (companyId) query = query.eq("companyId", companyId);
  return query.single();
}

export async function getPurchaseOrderLocations(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchaseOrderId: string
) {
  return client
    .from("purchaseOrderLocations")
    .select("*")
    .eq("id", purchaseOrderId)
    .single();
}

export async function getPurchaseOrderPayment(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchaseOrderId: string
) {
  return client
    .from("purchaseOrderPayment")
    .select("*")
    .eq("id", purchaseOrderId)
    .single();
}

export async function getPurchaseOrderLines(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchaseOrderId: string
) {
  return client
    .from("purchaseOrderLines")
    .select("*")
    .eq("purchaseOrderId", purchaseOrderId)
    .order("sortOrder", { ascending: true })
    .order("createdAt", { ascending: true });
}

export async function getPurchaseOrderLine(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchaseOrderLineId: string
) {
  return client
    .from("purchaseOrderLines")
    .select("*")
    .eq("id", purchaseOrderLineId)
    .single();
}

export async function getPurchaseOrderSuppliers(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("purchaseOrderSuppliers")
    .select("id, name")
    .eq("companyId", companyId)
    .order("name");
}

export async function getPurchasingDocumentsAssignedToMe(
  client: CarbonDatabaseClient<QueryDatabase>,
  userId: string,
  companyId: string
) {
  const [purchaseOrders, supplierQuotes, purchaseInvoices] = await Promise.all([
    client
      .from("purchaseOrder")
      .select("*")
      .eq("assignee", userId)
      .eq("companyId", companyId),
    client
      .from("supplierQuote")
      .select("*")
      .eq("assignee", userId)
      .eq("companyId", companyId),
    client
      .from("purchaseInvoice")
      .select("*")
      .eq("assignee", userId)
      .eq("companyId", companyId)
  ]);

  const merged = [
    ...(purchaseOrders.data?.map((doc) => ({
      ...doc,
      type: "purchaseOrder"
    })) ?? []),
    ...(supplierQuotes.data?.map((doc) => ({
      ...doc,
      type: "supplierQuote"
    })) ?? []),
    ...(purchaseInvoices.data?.map((doc) => ({
      ...doc,
      type: "purchaseInvoice"
    })) ?? [])
  ].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));

  return merged;
}

export async function getPurchasingPlanning(
  client: CarbonDatabaseClient<QueryDatabase>,
  locationId: string,
  companyId: string,
  periods: string[],
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client.rpc(
    "get_purchasing_planning",
    {
      location_id: locationId,
      company_id: companyId,
      periods
    },
    {
      count: "exact"
    }
  );

  if (args?.search) {
    query = query.or(
      `name.ilike.%${args.search}%,readableIdWithRevision.ilike.%${args.search}%`
    );
  }

  query = setGenericQueryFilters(query, args, [
    { column: "quantityToOrder", ascending: false }
  ]);

  return query;
}

export async function getPurchasingTerms(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("terms")
    .select("purchasingTerms")
    .eq("id", companyId)
    .single();
}

export async function getSupplier(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierId: string,
  companyId?: string
) {
  let query = client.from("suppliers").select("*").eq("id", supplierId);

  if (companyId) {
    query = query.eq("companyId", companyId);
  }

  return query.single();
}

type ApprovalContext = {
  approvalRequest: { id: string } | null;
  canApprove: boolean;
  decision: {
    status: "Approved" | "Rejected";
    decisionBy: string;
    decisionAt: string;
  } | null;
};

export async function getSupplierApprovalContext(
  serviceClient: CarbonDatabaseClient<QueryDatabase>,
  supplierId: string,
  status: string | null,
  companyId: string,
  userId: string
): Promise<ApprovalContext> {
  const latest = await getLatestApprovalRequestForDocument(
    serviceClient,
    "supplier",
    supplierId
  );

  const req = latest.data;

  const canApprove = await canApproveRequest(
    serviceClient,
    {
      amount: req?.amount ?? null,
      documentType: "supplier",
      companyId
    },
    userId
  );

  // Look for the latest terminal decision (Approved or Rejected)
  let decision: ApprovalContext["decision"] = null;
  const terminalRequest = await serviceClient
    .from("approvalRequest")
    .select("status, decisionBy, decisionAt")
    .eq("documentType", "supplier")
    .eq("documentId", supplierId)
    .in("status", ["Approved", "Rejected"])
    .order("decisionAt", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (
    terminalRequest.data?.decisionBy &&
    terminalRequest.data?.decisionAt &&
    (terminalRequest.data.status === "Approved" ||
      terminalRequest.data.status === "Rejected")
  ) {
    decision = {
      status: terminalRequest.data.status,
      decisionBy: terminalRequest.data.decisionBy,
      decisionAt: terminalRequest.data.decisionAt
    };
  }

  if (!req || req.status !== "Pending" || !req.requestedBy || !req.id) {
    return {
      approvalRequest: null,
      canApprove,
      decision
    };
  }

  return {
    approvalRequest: { id: req.id },
    canApprove,
    decision
  };
}

export async function getSupplierContact(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierContactId: string,
  supplierId?: string
) {
  let query = client
    .from("supplierContact")
    .select(
      "*, contact(id, firstName, lastName, email, mobilePhone, homePhone, workPhone, fax, title, notes)"
    )
    .eq("id", supplierContactId);

  if (supplierId) query = query.eq("supplierId", supplierId);

  return query.single();
}

export async function getSupplierContacts(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierId: string
) {
  return client
    .from("supplierContact")
    .select(
      "*, contact(id, fullName, firstName, lastName, email, mobilePhone, homePhone, workPhone, fax, title, notes), user(id, active)"
    )
    .eq("supplierId", supplierId);
}

export async function getSupplierInteraction(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  opportunityId: string | null
): Promise<
  QuerySingleResponse<{
    id: string;
    companyId: string;
    purchasingRfq: PurchasingRFQ | null;
    supplierQuotes: SupplierQuote[];
    purchaseOrders: PurchaseOrder[];
    purchaseInvoices: PurchaseInvoice[];
  } | null>
> {
  if (!opportunityId) {
    return {
      data: null,
      error: null
    };
  }

  const response = await client.rpc(
    "get_supplier_interaction_with_related_records",
    {
      supplier_interaction_id: opportunityId,
      company_id: companyId
    }
  );

  return {
    data: response.data?.[0],
    error: response.error
  } as unknown as QuerySingleResponse<{
    id: string;
    companyId: string;
    purchasingRfq: PurchasingRFQ;
    supplierQuotes: SupplierQuote[];
    purchaseOrders: PurchaseOrder[];
    purchaseInvoices: PurchaseInvoice[];
  }>;
}

export async function getSupplierInteractionDocuments(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  interactionId: string
) {
  try {
    const objects = await listObjects({
      companyId,
      prefix: `${companyId}/supplier-interaction/${interactionId}`
    });
    return objects.map((object) => ({
      ...toStorageFileObject(object, "private"),
      bucket: "supplier-interaction"
    }));
  } catch (error) {
    console.error(
      "Failed to list supplier interaction documents",
      error
    );
    return [];
  }
}

export async function getSupplierInteractionLineDocuments(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  lineId: string
) {
  try {
    const objects = await listObjects({
      companyId,
      prefix: `${companyId}/supplier-interaction-line/${lineId}`
    });
    return objects.map((object) => ({
      ...toStorageFileObject(object, "private"),
      bucket: "supplier-interaction-line"
    }));
  } catch (error) {
    console.error(
      "Failed to list supplier interaction line documents",
      error
    );
    return [];
  }
}

export async function getSupplierLocations(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierId: string
) {
  return client
    .from("supplierLocation")
    .select(
      "*, address(id, addressLine1, addressLine2, city, stateProvince, country(alpha2, name), postalCode)"
    )
    .eq("supplierId", supplierId);
}

export async function getSupplierLocation(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierLocationId: string,
  supplierId?: string,
  companyId?: string
) {
  let query = client
    .from("supplierLocation")
    .select(
      "*, address(id, addressLine1, addressLine2, city, stateProvince, country(alpha2, name), postalCode)"
    )
    .eq("id", supplierLocationId);

  if (supplierId) query = query.eq("supplierId", supplierId);
  if (companyId) query = query.eq("companyId", companyId);

  return query.single();
}

export async function getSupplierPayment(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierId: string
) {
  return client
    .from("supplierPayment")
    .select("*")
    .eq("supplierId", supplierId)
    .single();
}

export async function getSupplierProcessById(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierProcessId: string
) {
  return client
    .from("supplierProcesses")
    .select("*")
    .eq("id", supplierProcessId)
    .single();
}

export async function getSupplierProcessesByProcess(
  client: CarbonDatabaseClient<QueryDatabase>,
  processId: string,
  supplierId?: string | null
) {
  let query = client
    .from("supplierProcesses")
    .select("*")
    .eq("processId", processId);

  if (supplierId) {
    query = query.eq("supplierId", supplierId);
  }

  return query;
}

export async function getSupplierProcessesBySupplier(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierId: string
) {
  return client
    .from("supplierProcesses")
    .select("*")
    .eq("supplierId", supplierId);
}

export async function getSupplierQuote(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierQuoteId: string
) {
  return client
    .from("supplierQuotes")
    .select("*")
    .eq("id", supplierQuoteId)
    .single();
}

export async function getSupplierQuoteByInteractionId(
  client: CarbonDatabaseClient<QueryDatabase>,
  interactionId: string
) {
  return client
    .from("supplierQuotes")
    .select("*")
    .eq("supplierInteractionId", interactionId)
    .single();
}

export async function getSupplierQuoteByExternalLinkId(
  client: CarbonDatabaseClient<QueryDatabase>,
  externalLinkId: string,
  scope?: {
    companyId?: string;
    documentId?: string;
    supplierId?: string | null;
  }
) {
  let query = client
    .from("supplierQuote")
    .select("*")
    .eq("externalLinkId", externalLinkId);

  if (scope?.companyId) {
    query = query.eq("companyId", scope.companyId);
  }

  if (scope?.documentId) {
    query = query.eq("id", scope.documentId);
  }

  if (scope?.supplierId) {
    query = query.eq("supplierId", scope.supplierId);
  }

  return query.single();
}

export async function getSupplierQuotes(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client
    .from("supplierQuotes")
    .select("*", { count: "exact" })
    .eq("companyId", companyId);

  if (args.search) {
    query = query.or(
      `supplierQuoteId.ilike.%${args.search}%,name.ilike.%${args.search}%,supplierReference.ilike%${args.search}%`
    );
  }

  query = setGenericQueryFilters(query, args, [
    { column: "supplierQuoteId", ascending: false }
  ]);
  return query;
}

export async function getSupplierQuoteLine(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierQuoteLineId: string
) {
  return client
    .from("supplierQuoteLines")
    .select("*")
    .eq("id", supplierQuoteLineId)
    .single();
}

export async function getSupplierQuoteLines(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierQuoteId: string
) {
  return client
    .from("supplierQuoteLines")
    .select("*")
    .eq("supplierQuoteId", supplierQuoteId)
    .order("sortOrder", { ascending: true });
}

export async function getSupplierQuoteLinePrices(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierQuoteLineId: string
) {
  return client
    .from("supplierQuoteLinePrice")
    .select("*")
    .eq("supplierQuoteLineId", supplierQuoteLineId);
}

export async function getSupplierQuoteLinePricesByQuoteId(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierQuoteId: string
) {
  return client
    .from("supplierQuoteLinePrice")
    .select("*")
    .eq("supplierQuoteId", supplierQuoteId)
    .order("supplierQuoteLineId", { ascending: true });
}

export async function getSupplierQuotesList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return fetchAllFromTable<{
    id: string;
    supplierQuoteId: string;
  }>(client, "supplierQuote", "id, supplierQuoteId", (query) =>
    query.eq("companyId", companyId).order("createdAt", { ascending: false })
  );
}

export async function getSupplierShipping(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierId: string
) {
  return client
    .from("supplierShipping")
    .select("*")
    .eq("supplierId", supplierId)
    .single();
}

export async function getSuppliers(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
    type: string | null;
    status: string | null;
    supplierId?: string | null;
  }
) {
  let query = client
    .from("suppliers")
    .select("*", {
      count: "exact"
    })
    .eq("companyId", companyId);

  if (args.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  if (args.supplierId) {
    query = query.eq("id", args.supplierId);
  }

  if (args.type) {
    query = query.eq("supplierTypeId", args.type);
  }

  if (args.status) {
    query = query.eq(
      "status",
      args.status as "Active" | "Inactive" | "Pending" | "Rejected"
    );
  }

  query = setGenericQueryFilters(query, args, [
    { column: "name", ascending: true }
  ]);
  return query;
}

export async function getSuppliersList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return fetchAllFromTable<{
    id: string;
    name: string;
  }>(client, "supplier", "id, name", (query) =>
    query.eq("companyId", companyId).order("name")
  );
}

export async function getSupplierType(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierTypeId: string
) {
  return client
    .from("supplierType")
    .select("*")
    .eq("id", supplierTypeId)
    .single();
}

export async function getSupplierTypes(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("supplierType")
    .select("*", { count: "exact" })
    .eq("companyId", companyId);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "name", ascending: true }
    ]);
  }

  return query;
}

export async function getSupplierTypesList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("supplierType")
    .select("id, name")
    .eq("companyId", companyId)
    .order("name");
}

export async function insertSupplier(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplier: Omit<z.infer<typeof supplierValidator>, "id"> & {
    companyId: string;
    createdBy: string;
    customFields?: Json;
  }
) {
  return client.from("supplier").insert([supplier]).select("*").single();
}

export async function insertSupplierContact(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierContact: {
    supplierId: string;
    companyId: string;
    contact: z.infer<typeof supplierContactValidator>;
    supplierLocationId?: string;
    customFields?: Json;
  }
) {
  const insertContact = await client
    .from("contact")
    .insert([
      {
        ...supplierContact.contact,
        companyId: supplierContact.companyId,
        isCustomer: false
      }
    ])
    .select("id")
    .single();

  if (insertContact.error) {
    return insertContact;
  }

  const contactId = insertContact.data?.id;
  if (!contactId) {
    return { data: null, error: new Error("Contact ID not found") };
  }

  return client
    .from("supplierContact")
    .insert([
      {
        supplierId: supplierContact.supplierId,
        contactId,
        supplierLocationId: supplierContact.supplierLocationId,
        customFields: supplierContact.customFields
      }
    ])
    .select("id")
    .single();
}

export async function insertSupplierInteraction(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  supplierId: string
) {
  return client
    .from("supplierInteraction")
    .insert([{ companyId, supplierId }])
    .select("id")
    .single();
}

export async function insertSupplierLocation(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierLocation: {
    supplierId: string;
    companyId: string;
    name: string;
    address: {
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      stateProvince?: string;
      postalCode?: string;
      countryCode?: string;
    };
    customFields?: Json;
  }
) {
  const insertAddress = await client
    .from("address")
    .insert([
      { ...supplierLocation.address, companyId: supplierLocation.companyId }
    ])
    .select("id")
    .single();
  if (insertAddress.error) {
    return insertAddress;
  }

  const addressId = insertAddress.data?.id;
  if (!addressId) {
    return { data: null, error: new Error("Address ID not found") };
  }

  return client
    .from("supplierLocation")
    .insert([
      {
        supplierId: supplierLocation.supplierId,
        addressId,
        name: supplierLocation.name,
        customFields: supplierLocation.customFields
      }
    ])
    .select("id")
    .single();
}

export async function finalizePurchaseOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchaseOrderId: string,
  userId: string
) {
  const [purchaseOrder, lines] = await Promise.all([
    getPurchaseOrder(client, purchaseOrderId),
    getPurchaseOrderLines(client, purchaseOrderId)
  ]);
  const { status } = getPurchaseOrderStatus(lines.data || []);

  const updateData: TableUpdate<"purchaseOrder"> = {
    status,
    updatedAt: today(getLocalTimeZone()).toString(),
    updatedBy: userId
  };

  // Only set orderDate if it's not already set
  if (!purchaseOrder.data?.orderDate) {
    updateData.orderDate = today(getLocalTimeZone()).toString();
  }

  return client
    .from("purchaseOrder")
    .update(updateData)
    .eq("id", purchaseOrderId);
}

export async function sendSupplierQuote(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierQuoteId: string,
  userId: string
) {
  // Send keeps status as Draft, just updates timestamp
  const quoteUpdate = await client
    .from("supplierQuote")
    .update({
      updatedAt: today(getLocalTimeZone()).toString(),
      updatedBy: userId
    })
    .eq("id", supplierQuoteId);

  if (quoteUpdate.error) {
    return quoteUpdate;
  }

  return { data: null, error: null };
}

export async function updatePurchaseOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchaseOrder: {
    id: string;
    status: (typeof purchaseOrderStatusType)[number];
    updatedBy: string;
  }
) {
  return client
    .from("purchaseOrder")
    .update(purchaseOrder)
    .eq("id", purchaseOrder.id);
}

export async function updatePurchaseOrderExchangeRate(
  client: CarbonDatabaseClient<QueryDatabase>,
  data: {
    id: string;
    exchangeRate: number;
  }
) {
  const update = {
    id: data.id,
    exchangeRate: data.exchangeRate,
    exchangeRateUpdatedAt: new Date().toISOString()
  };

  return client.from("purchaseOrder").update(update).eq("id", update.id);
}

export async function updatePurchaseOrderFavorite(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: {
    id: string;
    favorite: boolean;
    userId: string;
  }
) {
  const { id, favorite, userId } = args;
  if (!favorite) {
    return client
      .from("purchaseOrderFavorite")
      .delete()
      .eq("purchaseOrderId", id)
      .eq("userId", userId);
  } else {
    return client
      .from("purchaseOrderFavorite")
      .insert({ purchaseOrderId: id, userId: userId });
  }
}

export async function updatePurchaseOrderStatus(
  client: CarbonDatabaseClient<QueryDatabase>,
  update: {
    id: string;
    status: (typeof purchaseOrderStatusType)[number];
    assignee: null | undefined;
    updatedBy: string;
    companyId?: string;
  }
) {
  const { id, companyId, ...data } = update;
  const query = client.from("purchaseOrder").update(data).eq("id", id);
  return companyId ? query.eq("companyId", companyId) : query;
}

export async function updateSupplierAccounting(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierAccounting: z.infer<typeof supplierAccountingValidator> & {
    updatedBy: string;
  }
) {
  return client
    .from("supplier")
    .update(sanitize(supplierAccounting))
    .eq("id", supplierAccounting.id);
}

export async function updateSupplierContact(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierContact: {
    contactId: string;
    contact: z.infer<typeof supplierContactValidator>;
    supplierLocationId?: string;
    customFields?: Json;
  }
) {
  if (supplierContact.customFields) {
    const customFieldUpdate = await client
      .from("supplierContact")
      .update({
        customFields: supplierContact.customFields,
        supplierLocationId: supplierContact.supplierLocationId
      })
      .eq("contactId", supplierContact.contactId);

    if (customFieldUpdate.error) {
      return customFieldUpdate;
    }
  }
  return client
    .from("contact")
    .update(sanitize(supplierContact.contact))
    .eq("id", supplierContact.contactId)
    .select("id")
    .single();
}

export async function updateSupplierLocation(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierLocation: {
    addressId: string;
    name: string;
    address: {
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      stateProvince?: string;
      countryCode?: string;
      postalCode?: string;
    };
    customFields?: Json;
  }
) {
  if (supplierLocation.customFields) {
    const customFieldUpdate = await client
      .from("supplierLocation")
      .update({
        name: supplierLocation.name,
        customFields: supplierLocation.customFields
      })
      .eq("addressId", supplierLocation.addressId);

    if (customFieldUpdate.error) {
      return customFieldUpdate;
    }
  }
  return client
    .from("address")
    .update(sanitize(supplierLocation.address))
    .eq("id", supplierLocation.addressId)
    .select("id")
    .single();
}

export async function updateSupplierPayment(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierPayment: z.infer<typeof supplierPaymentValidator> & {
    updatedBy: string;
    customFields?: Json;
  }
) {
  return client
    .from("supplierPayment")
    .update(sanitize(supplierPayment))
    .eq("supplierId", supplierPayment.supplierId);
}

export async function updateSupplierQuoteExchangeRate(
  client: CarbonDatabaseClient<QueryDatabase>,
  data: {
    id: string;
    exchangeRate: number;
  }
) {
  const update = {
    id: data.id,
    exchangeRate: data.exchangeRate,
    exchangeRateUpdatedAt: new Date().toISOString()
  };

  return client.from("supplierQuote").update(update).eq("id", update.id);
}

export async function updateSupplierQuoteFavorite(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: {
    id: string;
    favorite: boolean;
    userId: string;
  }
) {
  const { id, favorite, userId } = args;
  if (!favorite) {
    return client
      .from("supplierQuoteFavorite")
      .delete()
      .eq("supplierQuoteId", id)
      .eq("userId", userId);
  } else {
    return client
      .from("supplierQuoteFavorite")
      .insert({ supplierQuoteId: id, userId: userId });
  }
}

export async function updateSupplierQuoteStatus(
  client: CarbonDatabaseClient<QueryDatabase>,
  update: {
    id: string;
    status: (typeof supplierQuoteStatusType)[number];
    assignee: null | undefined;
    updatedBy: string;
  }
) {
  return client.from("supplierQuote").update(update).eq("id", update.id);
}

export async function updateSupplierShipping(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierShipping: z.infer<typeof supplierShippingValidator> & {
    updatedBy: string;
    customFields?: Json;
  }
) {
  return client
    .from("supplierShipping")
    .update(sanitize(supplierShipping))
    .eq("supplierId", supplierShipping.supplierId);
}

export async function getSupplierTax(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierId: string
) {
  return client
    .from("supplierTax")
    .select("*")
    .eq("supplierId", supplierId)
    .maybeSingle();
}

export async function updateSupplierTax(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierTax: z.infer<typeof supplierTaxValidator> & {
    companyId: string;
    updatedBy: string;
    taxExemptionCertificatePath?: string | null;
  }
) {
  return client
    .from("supplierTax")
    .update(sanitize(supplierTax))
    .eq("supplierId", supplierTax.supplierId);
}

export async function upsertPurchaseOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchaseOrder:
    | (Omit<
        z.infer<typeof purchaseOrderValidator>,
        "id" | "purchaseOrderId"
      > & {
        purchaseOrderId: string;
        status?: (typeof purchaseOrderStatusType)[number];
        companyId: string;
        companyGroupId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<
        z.infer<typeof purchaseOrderValidator>,
        "id" | "purchaseOrderId"
      > & {
        id: string;
        purchaseOrderId: string;
        updatedBy: string;
        customFields?: Json;
      }),
  receiptRequestedDate?: string
) {
  if ("id" in purchaseOrder) {
    return client
      .from("purchaseOrder")
      .update(sanitize(purchaseOrder))
      .eq("id", purchaseOrder.id)
      .select("id, purchaseOrderId");
  }

  const [supplierInteraction, supplierPayment, supplierShipping, purchaser] =
    await Promise.all([
      insertSupplierInteraction(
        client,
        purchaseOrder.companyId,
        purchaseOrder.supplierId
      ),
      getSupplierPayment(client, purchaseOrder.supplierId),
      getSupplierShipping(client, purchaseOrder.supplierId),
      getEmployeeJob(client, purchaseOrder.createdBy, purchaseOrder.companyId)
    ]);

  if (supplierInteraction.error) return supplierInteraction;
  if (supplierPayment.error) return supplierPayment;
  if (supplierShipping.error) return supplierShipping;

  const {
    paymentTermId,
    invoiceSupplierId,
    invoiceSupplierContactId,
    invoiceSupplierLocationId
  } = supplierPayment.data;

  const { shippingMethodId, shippingTermId, incoterm, incotermLocation } =
    supplierShipping.data;

  if (purchaseOrder.currencyCode) {
    const currency = await getCurrencyByCode(
      client,
      purchaseOrder.companyGroupId,
      purchaseOrder.currencyCode
    );
    if (currency.data) {
      purchaseOrder.exchangeRate = currency.data.exchangeRate ?? undefined;
      purchaseOrder.exchangeRateUpdatedAt = new Date().toISOString();
    }
  } else {
    purchaseOrder.exchangeRate = 1;
    purchaseOrder.exchangeRateUpdatedAt = new Date().toISOString();
  }

  const locationId =
    purchaseOrder.locationId ?? purchaser?.data?.locationId ?? null;

  // locationId is not a column on purchaseOrder -- it belongs on the delivery record
  const {
    locationId: _locationId,
    companyGroupId: _companyGroupId,
    ...purchaseOrderData
  } = purchaseOrder;

  const order = await client
    .from("purchaseOrder")
    .insert([
      {
        ...purchaseOrderData,
        supplierInteractionId: supplierInteraction.data?.id,
        status: purchaseOrder.status ?? "Draft"
      }
    ])
    .select("id, purchaseOrderId");

  if (order.error) return order;

  const purchaseOrderId = order.data[0].id;

  const [delivery, payment] = await Promise.all([
    client.from("purchaseOrderDelivery").insert([
      {
        id: purchaseOrderId,
        receiptRequestedDate: receiptRequestedDate ?? null,
        locationId: locationId,
        shippingMethodId: shippingMethodId,
        shippingTermId: shippingTermId,
        incoterm: incoterm,
        incotermLocation: incotermLocation,
        companyId: purchaseOrder.companyId
      }
    ]),
    client.from("purchaseOrderPayment").insert([
      {
        id: purchaseOrderId,
        invoiceSupplierId: invoiceSupplierId,
        invoiceSupplierContactId: invoiceSupplierContactId,
        invoiceSupplierLocationId: invoiceSupplierLocationId,
        paymentTermId: paymentTermId,
        companyId: purchaseOrder.companyId
      }
    ])
  ]);

  if (delivery.error) {
    await deletePurchaseOrder(client, purchaseOrderId);
    return payment;
  }
  if (payment.error) {
    await deletePurchaseOrder(client, purchaseOrderId);
    return payment;
  }

  return order;
}

export async function upsertPurchaseOrderDelivery(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchaseOrderDelivery:
    | (z.infer<typeof purchaseOrderDeliveryValidator> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (z.infer<typeof purchaseOrderDeliveryValidator> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("id" in purchaseOrderDelivery) {
    return client
      .from("purchaseOrderDelivery")
      .update(sanitize(purchaseOrderDelivery))
      .eq("id", purchaseOrderDelivery.id)
      .select("id")
      .single();
  }
  return client
    .from("purchaseOrderDelivery")
    .insert([purchaseOrderDelivery])
    .select("id")
    .single();
}

export async function upsertPurchaseOrderLine(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchaseOrderLine:
    | (Omit<z.infer<typeof purchaseOrderLineValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof purchaseOrderLineValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("id" in purchaseOrderLine) {
    return client
      .from("purchaseOrderLine")
      .update(sanitize(purchaseOrderLine))
      .eq("id", purchaseOrderLine.id)
      .select("id")
      .single();
  }

  const existing = await client
    .from("purchaseOrderLine")
    .select("sortOrder")
    .eq("purchaseOrderId", purchaseOrderLine.purchaseOrderId);

  const maxSortOrder = (existing.data ?? []).reduce(
    (max, row) => Math.max(max, row.sortOrder ?? 0),
    0
  );

  return client
    .from("purchaseOrderLine")
    .insert([{ ...purchaseOrderLine, sortOrder: maxSortOrder + 1 }])
    .select("id")
    .single();
}

export async function updatePurchaseOrderLineOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  updates: { id: string; sortOrder: number; updatedBy: string }[]
) {
  const results = await Promise.all(
    updates.map(({ id, sortOrder, updatedBy }) =>
      client
        .from("purchaseOrderLine")
        .update({ sortOrder, updatedBy })
        .eq("id", id)
    )
  );

  for (const result of results) {
    if (result.error) {
      throw result.error;
    }
  }
}

export async function upsertPurchaseOrderPayment(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchaseOrderPayment:
    | (z.infer<typeof purchaseOrderPaymentValidator> & {
        createdBy: string;
        customFields?: Json;
      })
    | (z.infer<typeof purchaseOrderPaymentValidator> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("id" in purchaseOrderPayment) {
    return client
      .from("purchaseOrderPayment")
      .update(sanitize(purchaseOrderPayment))
      .eq("id", purchaseOrderPayment.id)
      .select("id")
      .single();
  }
  return client
    .from("purchaseOrderPayment")
    .insert([purchaseOrderPayment])
    .select("id")
    .single();
}

export async function upsertSupplier(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplier:
    | (Omit<z.infer<typeof supplierValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof supplierValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in supplier) {
    return client
      .from("supplier")
      .insert([supplier])
      .select("id, name")
      .single();
  }
  return client
    .from("supplier")
    .update({
      ...sanitize(supplier),
      updatedAt: today(getLocalTimeZone()).toString()
    })
    .eq("id", supplier.id)
    .select("id")
    .single();
}

export async function upsertSupplierProcess(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierProcess:
    | (Omit<z.infer<typeof supplierProcessValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof supplierProcessValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in supplierProcess) {
    return client
      .from("supplierProcess")
      .insert([supplierProcess])
      .select("id")
      .single();
  }
  return client
    .from("supplierProcess")
    .update(sanitize(supplierProcess))
    .eq("id", supplierProcess.id)
    .eq("supplierId", supplierProcess.supplierId)
    .select("id")
    .single();
}

export async function upsertSupplierQuote(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierQuote:
    | (Omit<
        z.infer<typeof supplierQuoteValidator>,
        "id" | "supplierQuoteId"
      > & {
        supplierQuoteId: string;
        companyId: string;
        companyGroupId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<
        z.infer<typeof supplierQuoteValidator>,
        "id" | "supplierQuoteId"
      > & {
        id: string;
        supplierQuoteId: string;
        companyGroupId: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in supplierQuote) {
    if (supplierQuote.currencyCode) {
      const currency = await getCurrencyByCode(
        client,
        supplierQuote.companyGroupId,
        supplierQuote.currencyCode
      );
      if (currency.data) {
        supplierQuote.exchangeRate = currency.data.exchangeRate ?? undefined;
        supplierQuote.exchangeRateUpdatedAt = new Date().toISOString();
      }
    } else {
      supplierQuote.exchangeRate = 1;
      supplierQuote.exchangeRateUpdatedAt = new Date().toISOString();
    }

    const supplierInteraction = await insertSupplierInteraction(
      client,
      supplierQuote.companyId,
      supplierQuote.supplierId
    );

    if (supplierInteraction.error) return supplierInteraction;

    const { companyGroupId: _companyGroupId, ...supplierQuoteData } =
      supplierQuote;
    const insert = await client
      .from("supplierQuote")
      .insert([
        {
          ...supplierQuoteData,
          status: supplierQuoteData.status ?? "Draft",
          supplierInteractionId: supplierInteraction.data?.id
        }
      ])
      .select("id, supplierQuoteId, externalLinkId")
      .single();

    if (insert.error) {
      return insert;
    }

    const supplierQuoteId = insert.data?.id;
    if (!supplierQuoteId) return insert;

    // Only create external link if one doesn't exist
    if (!insert.data.externalLinkId) {
      const externalLink = await upsertExternalLink(client, {
        documentType: "SupplierQuote",
        documentId: supplierQuoteId,
        supplierId: supplierQuote.supplierId,
        expiresAt: supplierQuote.expirationDate,
        companyId: supplierQuote.companyId
      });

      if (externalLink.data) {
        const update = await client
          .from("supplierQuote")
          .update({ externalLinkId: externalLink.data.id })
          .eq("id", supplierQuoteId);

        if (update.error) {
          return update;
        }
      }
    }

    return insert;
  } else {
    // Only update the exchange rate if the currency code has changed
    const existingQuote = await client
      .from("supplierQuote")
      .select("currencyCode, status")
      .eq("id", supplierQuote.id)
      .single();

    if (existingQuote.error) return existingQuote;

    const { currencyCode, status: existingStatus } = existingQuote.data;

    if (
      supplierQuote.currencyCode &&
      currencyCode !== supplierQuote.currencyCode
    ) {
      const currency = await getCurrencyByCode(
        client,
        supplierQuote.companyGroupId,
        supplierQuote.currencyCode
      );
      if (currency.data) {
        supplierQuote.exchangeRate = currency.data.exchangeRate ?? undefined;
        supplierQuote.exchangeRateUpdatedAt = new Date().toISOString();
      }
    }
    const { companyGroupId: _companyGroupId2, ...supplierQuoteUpdateData } =
      supplierQuote;
    return client
      .from("supplierQuote")
      .update({
        ...sanitize(supplierQuoteUpdateData),
        status:
          supplierQuote.expirationDate &&
          today(getLocalTimeZone()).toString() > supplierQuote.expirationDate
            ? "Expired"
            : (supplierQuote.status ?? existingStatus ?? "Draft"),
        updatedAt: today(getLocalTimeZone()).toString()
      })
      .eq("id", supplierQuote.id);
  }
}

export async function upsertSupplierQuoteLine(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierQuoteLine:
    | (Omit<z.infer<typeof supplierQuoteLineValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof supplierQuoteLineValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("id" in supplierQuoteLine) {
    return client
      .from("supplierQuoteLine")
      .update(sanitize(supplierQuoteLine))
      .eq("id", supplierQuoteLine.id)
      .select("id")
      .single();
  }

  const existing = await client
    .from("supplierQuoteLine")
    .select("sortOrder")
    .eq("supplierQuoteId", supplierQuoteLine.supplierQuoteId);

  const maxSortOrder = (existing.data ?? []).reduce(
    (max, row) => Math.max(max, row.sortOrder ?? 0),
    0
  );

  return client
    .from("supplierQuoteLine")
    .insert([
      {
        ...supplierQuoteLine,
        description: supplierQuoteLine.description ?? "",
        sortOrder: maxSortOrder + 1
      }
    ])
    .select("id")
    .single();
}

export async function updateSupplierQuoteLineOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  updates: { id: string; sortOrder: number; updatedBy: string }[]
) {
  const results = await Promise.all(
    updates.map(({ id, sortOrder, updatedBy }) =>
      client
        .from("supplierQuoteLine")
        .update({ sortOrder, updatedBy })
        .eq("id", id)
    )
  );

  for (const result of results) {
    if (result.error) {
      throw result.error;
    }
  }
}

export async function upsertSupplierType(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierType:
    | (Omit<z.infer<typeof supplierTypeValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof supplierTypeValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in supplierType) {
    return client
      .from("supplierType")
      .insert([supplierType])
      .select("id")
      .single();
  } else {
    return client
      .from("supplierType")
      .update(sanitize(supplierType))
      .eq("id", supplierType.id);
  }
}

// ============================================================
// PURCHASING RFQ FUNCTIONS
// ============================================================

export async function deletePurchasingRFQ(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchasingRfqId: string
) {
  return client.from("purchasingRfq").delete().eq("id", purchasingRfqId);
}

export async function deletePurchasingRFQLine(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchasingRfqLineId: string
) {
  return client
    .from("purchasingRfqLine")
    .delete()
    .eq("id", purchasingRfqLineId);
}

export async function getPurchasingRFQ(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("purchasingRfqs").select("*").eq("id", id).single();
}

export async function getPurchasingRFQs(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client
    .from("purchasingRfqs")
    .select("*", { count: "exact" })
    .eq("companyId", companyId);

  if (args.search) {
    query = query.ilike("rfqId", `%${args.search}%`);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "rfqId", ascending: false }
  ]);
  return query;
}

export async function getPurchasingRFQLine(
  client: CarbonDatabaseClient<QueryDatabase>,
  lineId: string
) {
  return client
    .from("purchasingRfqLines")
    .select("*")
    .eq("id", lineId)
    .single();
}

export async function getPurchasingRFQLines(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchasingRfqId: string
) {
  return client
    .from("purchasingRfqLines")
    .select("*")
    .eq("purchasingRfqId", purchasingRfqId)
    .order("order", { ascending: true });
}

export async function getPurchasingRFQSuppliers(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchasingRfqId: string
) {
  const rfqSuppliers = await client
    .from("purchasingRfqSupplier")
    .select("*")
    .eq("purchasingRfqId", purchasingRfqId);

  if (rfqSuppliers.error || !rfqSuppliers.data) {
    return rfqSuppliers;
  }

  const supplierIds = [
    ...new Set(rfqSuppliers.data.map((row) => row.supplierId))
  ];
  const companyIds = [
    ...new Set(rfqSuppliers.data.map((row) => row.companyId).filter(Boolean))
  ];
  const suppliers =
    supplierIds.length > 0
      ? await client
          .from("supplier")
          .select("id, name")
          .in("id", supplierIds)
          .in("companyId", companyIds)
      : { data: [] };
  const suppliersById = new Map(
    suppliers.data?.map((supplier) => [supplier.id, supplier] as const) ?? []
  );

  return {
    ...rfqSuppliers,
    data: rfqSuppliers.data.map((row) => ({
      ...row,
      supplier: suppliersById.get(row.supplierId) ?? null
    }))
  };
}

export async function upsertPurchasingRFQ(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchasingRfq: {
    id?: string;
    rfqId: string;
    rfqDate: string;
    expirationDate?: string;
    locationId?: string;
    employeeId?: string;
    status?: (typeof purchasingRfqStatusType)[number];
    companyId: string;
    createdBy?: string;
    updatedBy?: string;
    customFields?: Json;
  }
) {
  if (purchasingRfq.id) {
    return client
      .from("purchasingRfq")
      .update(sanitize(purchasingRfq))
      .eq("id", purchasingRfq.id)
      .select("id")
      .single();
  }
  return client
    .from("purchasingRfq")
    .insert([purchasingRfq])
    .select("id")
    .single();
}

export async function upsertPurchasingRFQLine(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchasingRfqLine:
    | {
        purchasingRfqId: string;
        itemId: string;
        description?: string;
        quantity: number[];
        purchaseUnitOfMeasureCode: string;
        inventoryUnitOfMeasureCode: string;
        conversionFactor?: number;
        order: number;
        companyId: string;
        createdBy: string;
        customFields?: Json;
      }
    | {
        id: string;
        purchasingRfqId: string;
        itemId: string;
        description?: string;
        quantity: number[];
        purchaseUnitOfMeasureCode: string;
        inventoryUnitOfMeasureCode: string;
        conversionFactor?: number;
        order: number;
        companyId: string;
        updatedBy: string;
        customFields?: Json;
      }
) {
  if ("id" in purchasingRfqLine) {
    return client
      .from("purchasingRfqLine")
      .update(sanitize(purchasingRfqLine))
      .eq("id", purchasingRfqLine.id)
      .select("id")
      .single();
  }
  return client
    .from("purchasingRfqLine")
    .insert([purchasingRfqLine])
    .select("id")
    .single();
}

export async function updatePurchasingRFQLineOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  updates: { id: string; sortOrder: number; updatedBy: string }[]
) {
  const results = await Promise.all(
    updates.map(({ id, sortOrder, updatedBy }) =>
      client
        .from("purchasingRfqLine")
        .update({ order: sortOrder, updatedBy })
        .eq("id", id)
    )
  );

  for (const result of results) {
    if (result.error) {
      throw result.error;
    }
  }
}

export async function upsertPurchasingRFQSuppliers(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchasingRfqId: string,
  supplierIds: string[],
  companyId: string,
  createdBy: string
) {
  // Delete existing suppliers for this RFQ
  await client
    .from("purchasingRfqSupplier")
    .delete()
    .eq("purchasingRfqId", purchasingRfqId);

  // Insert new suppliers
  if (supplierIds.length === 0) {
    return { data: [], error: null };
  }

  const suppliersToInsert = supplierIds.map((supplierId) => ({
    purchasingRfqId,
    supplierId,
    companyId,
    createdBy
  }));

  return client
    .from("purchasingRfqSupplier")
    .insert(suppliersToInsert)
    .select("id");
}

export async function updatePurchasingRFQStatus(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: {
    id: string;
    status: (typeof purchasingRfqStatusType)[number];
    assignee?: string | null;
    updatedBy: string;
  }
) {
  return client
    .from("purchasingRfq")
    .update({
      status: args.status,
      assignee: args.assignee,
      updatedBy: args.updatedBy,
      updatedAt: new Date().toISOString()
    })
    .eq("id", args.id)
    .select("id")
    .single();
}

export async function getLinkedSupplierQuotes(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchasingRfqId: string
) {
  return client
    .from("purchasingRfqToSupplierQuote")
    .select(
      `
      supplierQuoteId,
      supplierQuote:supplierQuoteId (*, supplier:supplierId (*))
    `
    )
    .eq("purchasingRfqId", purchasingRfqId);
}

export async function getLinkedPurchasingRfqs(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierQuoteId: string
) {
  return client
    .from("purchasingRfqToSupplierQuote")
    .select(
      `
      purchasingRfqId,
      purchasingRfq:purchasingRfqId (*)
    `
    )
    .eq("supplierQuoteId", supplierQuoteId);
}

export async function getLinkedPurchasingRfqsForInteraction(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierInteractionId: string
) {
  // First get all supplier quote IDs in this interaction
  const { data: quotes, error: quotesError } = await client
    .from("supplierQuote")
    .select("id")
    .eq("supplierInteractionId", supplierInteractionId);

  if (quotesError || !quotes || quotes.length === 0) {
    return { data: [], error: quotesError };
  }

  const quoteIds = quotes.map((q) => q.id);

  // Then get all purchasing RFQs linked to any of these quotes
  return client
    .from("purchasingRfqToSupplierQuote")
    .select(
      `
      purchasingRfqId,
      purchasingRfq:purchasingRfqId (*)
    `
    )
    .in("supplierQuoteId", quoteIds);
}

// Get sibling quotes (quotes sharing any RFQ with current quote)
export async function getSiblingQuotesForQuote(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierQuoteId: string
) {
  // First get all RFQ IDs linked to this quote
  const { data: linkedRfqs, error: rfqError } = await client
    .from("purchasingRfqToSupplierQuote")
    .select("purchasingRfqId")
    .eq("supplierQuoteId", supplierQuoteId);

  if (rfqError || !linkedRfqs || linkedRfqs.length === 0) {
    return { data: [], error: rfqError };
  }

  const rfqIds = linkedRfqs.map((r) => r.purchasingRfqId);

  // Get all quotes linked to any of these RFQs (excluding current quote)
  return client
    .from("purchasingRfqToSupplierQuote")
    .select(
      `
      supplierQuoteId,
      supplierQuote:supplierQuoteId (*, supplier:supplierId (*))
    `
    )
    .in("purchasingRfqId", rfqIds)
    .neq("supplierQuoteId", supplierQuoteId);
}

// Direct Order→RFQ lookup (more efficient than going through interaction)
export async function getLinkedPurchasingRfqsForOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchaseOrderId: string
) {
  return client
    .from("purchasingRfqToPurchaseOrder")
    .select(
      `
      purchasingRfqId,
      purchasingRfq:purchasingRfqId (*)
    `
    )
    .eq("purchaseOrderId", purchaseOrderId);
}

export async function getSupplierQuotesForComparison(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchasingRfqId: string
) {
  // 1. Get all supplier quote IDs linked to this RFQ with supplier info
  const { data: links, error: linksError } = await client
    .from("purchasingRfqToSupplierQuote")
    .select(
      `
      supplierQuoteId,
      supplierQuote:supplierQuoteId (*, supplier:supplierId (*))
    `
    )
    .eq("purchasingRfqId", purchasingRfqId);

  if (linksError || !links?.length) {
    return { data: { quotes: [], lines: [], prices: [] }, error: linksError };
  }

  // Extract all quotes (for comparison header count)
  const allQuotes = links
    .map((l) => l.supplierQuote)
    .filter((q): q is NonNullable<typeof q> => q !== null);

  if (allQuotes.length === 0) {
    return { data: { quotes: [], lines: [], prices: [] }, error: null };
  }

  // Get IDs of Active quotes only (for fetching lines/prices)
  const activeQuoteIds = allQuotes
    .filter((q) => q.status === "Active")
    .map((q) => q.id)
    .filter((id): id is string => !!id);

  // 2. Fetch lines and pricing for active quotes only (if any)
  if (activeQuoteIds.length === 0) {
    return {
      data: { quotes: allQuotes, lines: [], prices: [] },
      error: null
    };
  }

  const lines = await client
    .from("supplierQuoteLines")
    .select("*")
    .in("supplierQuoteId", activeQuoteIds);

  const prices = await client
    .from("supplierQuoteLinePrice")
    .select("*")
    .in("supplierQuoteId", activeQuoteIds);

  return {
    data: {
      quotes: allQuotes,
      lines: lines.data ?? [],
      prices: prices.data ?? []
    },
    error: lines.error || prices.error
  };
}

// Get RFQ suppliers with their supplier info
export async function getPurchasingRFQSuppliersWithLinks(
  client: CarbonDatabaseClient<QueryDatabase>,
  purchasingRfqId: string
) {
  const rfqSuppliers = await client
    .from("purchasingRfqSupplier")
    .select("*")
    .eq("purchasingRfqId", purchasingRfqId);

  if (rfqSuppliers.error || !rfqSuppliers.data) {
    return rfqSuppliers;
  }

  const supplierIds = [
    ...new Set(rfqSuppliers.data.map((row) => row.supplierId))
  ];
  const companyIds = [
    ...new Set(rfqSuppliers.data.map((row) => row.companyId).filter(Boolean))
  ];
  const suppliers =
    supplierIds.length > 0
      ? await client
          .from("supplier")
          .select("id, name")
          .in("id", supplierIds)
          .in("companyId", companyIds)
      : { data: [] };
  const suppliersById = new Map(
    suppliers.data?.map((supplier) => [supplier.id, supplier] as const) ?? []
  );

  return {
    ...rfqSuppliers,
    data: rfqSuppliers.data.map((row) => ({
      ...row,
      supplier: suppliersById.get(row.supplierId) ?? null
    }))
  };
}
