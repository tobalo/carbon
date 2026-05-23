import { and, dbService, eq, inArray, withAuth } from "@carbon/database/drizzle";
import {
  approvalRequestTable,
  periodTable,
  purchaseOrderLineTable,
  purchaseOrderTable,
  qualityDocumentTable,
  type QueryDatabase,
  supplierTable
} from "@carbon/database/schema";
import { SalesOrderEmail } from "@carbon/documents/email";
import { trigger } from "@carbon/jobs";
import { redis } from "@carbon/kv";
import { signDownload, uploadObject } from "@carbon/storage";
import { getPurchaseOrderStatus } from "@carbon/utils";
import type { CalendarDate } from "@internationalized/date";
import { startOfWeek } from "@internationalized/date";
import { renderAsync } from "@react-email/components";
import { nanoid } from "nanoid";
import type { CarbonDatabaseClient } from "@carbon/database/query-client";
import type { LoaderFunctionArgs } from "react-router";
import { getPaymentTermsList } from "~/modules/accounting";
import {
  getCustomerContact,
  getSalesOrder,
  getSalesOrderCustomerDetails,
  getSalesOrderLines
} from "~/modules/sales";
import { getCompany } from "~/modules/settings";
import { getUser } from "~/modules/users/users.server";
import { stripSpecialCharacters } from "~/utils/string";
import { upsertDocument } from "../documents/documents.service";
import type { CustomFieldsTableType } from "../settings";

export async function approveRequest(
  id: string,
  userId: string,
  notes?: string
) {
  const timestamp = new Date().toISOString();

  try {
    const result = await withAuth({ kind: "user", userId }, async (db) => {
      const [approvalRequest] = await db
        .select({
          id: approvalRequestTable.id,
          status: approvalRequestTable.status,
          documentType: approvalRequestTable.documentType,
          documentId: approvalRequestTable.documentId,
          companyId: approvalRequestTable.companyId
        })
        .from(approvalRequestTable)
        .where(eq(approvalRequestTable.id, id))
        .limit(1);

      if (!approvalRequest) {
        throw new Error("Approval request not found");
      }

      if (approvalRequest.status !== "Pending") {
        throw new Error("Approval request is not pending");
      }

      const [updatedApproval] = await db
        .update(approvalRequestTable)
        .set({
          status: "Approved",
          decisionBy: userId,
          decisionAt: timestamp,
          decisionNotes: notes || null,
          updatedBy: userId,
          updatedAt: timestamp
        })
        .where(eq(approvalRequestTable.id, id))
        .returning({
          id: approvalRequestTable.id,
          documentType: approvalRequestTable.documentType,
          documentId: approvalRequestTable.documentId
        });

      if (!updatedApproval) {
        throw new Error("Failed to update approval request");
      }

      if (approvalRequest.documentType === "purchaseOrder") {
        const lines = await db
          .select({
            purchaseOrderLineType:
              purchaseOrderLineTable.purchaseOrderLineType,
            invoicedComplete: purchaseOrderLineTable.invoicedComplete,
            receivedComplete: purchaseOrderLineTable.receivedComplete
          })
          .from(purchaseOrderLineTable)
          .where(
            eq(
              purchaseOrderLineTable.purchaseOrderId,
              approvalRequest.documentId
            )
          );

        const { status: calculatedStatus } = getPurchaseOrderStatus(lines);

        const [poUpdate] = await db
          .update(purchaseOrderTable)
          .set({
            status: calculatedStatus,
            updatedBy: userId,
            updatedAt: timestamp
          })
          .where(
            and(
              eq(purchaseOrderTable.id, approvalRequest.documentId),
              eq(purchaseOrderTable.status, "Needs Approval")
            )
          )
          .returning({ id: purchaseOrderTable.id });

        if (!poUpdate) {
          throw new Error(
            "Failed to update purchase order status - it may no longer be in 'Needs Approval' state"
          );
        }
      } else if (approvalRequest.documentType === "qualityDocument") {
        const [qualityDocumentUpdate] = await db
          .update(qualityDocumentTable)
          .set({
            status: "Active",
            updatedBy: userId,
            updatedAt: timestamp
          })
          .where(eq(qualityDocumentTable.id, approvalRequest.documentId))
          .returning({ id: qualityDocumentTable.id });

        if (!qualityDocumentUpdate) {
          throw new Error("Failed to update quality document status");
        }
      } else if (approvalRequest.documentType === "supplier") {
        const [supplierUpdate] = await db
          .update(supplierTable)
          .set({
            supplierStatus: "Active",
            updatedBy: userId,
            updatedAt: timestamp
          })
          .where(eq(supplierTable.id, approvalRequest.documentId))
          .returning({ id: supplierTable.id });

        if (!supplierUpdate) {
          throw new Error("Failed to update supplier status");
        }
      }

      return updatedApproval;
    });

    return { data: result, error: null };
  } catch (error) {
    return {
      error: {
        message:
          error instanceof Error ? error.message : "Failed to process approval"
      },
      data: null
    };
  }
}

export async function rejectRequest(
  id: string,
  userId: string,
  notes?: string
) {
  const timestamp = new Date().toISOString();

  try {
    const result = await withAuth({ kind: "user", userId }, async (db) => {
      const [approvalRequest] = await db
        .select({
          id: approvalRequestTable.id,
          status: approvalRequestTable.status,
          documentType: approvalRequestTable.documentType,
          documentId: approvalRequestTable.documentId
        })
        .from(approvalRequestTable)
        .where(eq(approvalRequestTable.id, id))
        .limit(1);

      if (!approvalRequest) {
        throw new Error("Approval request not found");
      }

      if (approvalRequest.status !== "Pending") {
        throw new Error("Approval request is not pending");
      }

      const [updatedApproval] = await db
        .update(approvalRequestTable)
        .set({
          status: "Rejected",
          decisionBy: userId,
          decisionAt: timestamp,
          decisionNotes: notes || null,
          updatedBy: userId,
          updatedAt: timestamp
        })
        .where(eq(approvalRequestTable.id, id))
        .returning({
          id: approvalRequestTable.id,
          documentType: approvalRequestTable.documentType,
          documentId: approvalRequestTable.documentId
        });

      if (!updatedApproval) {
        throw new Error("Failed to update approval request");
      }

      if (approvalRequest.documentType === "purchaseOrder") {
        const [poUpdate] = await db
          .update(purchaseOrderTable)
          .set({
            status: "Rejected",
            updatedBy: userId,
            updatedAt: timestamp
          })
          .where(
            and(
              eq(purchaseOrderTable.id, approvalRequest.documentId),
              eq(purchaseOrderTable.status, "Needs Approval")
            )
          )
          .returning({ id: purchaseOrderTable.id });

        if (!poUpdate) {
          throw new Error(
            "Failed to update purchase order status - it may no longer be in 'Needs Approval' state"
          );
        }
      }

      if (approvalRequest.documentType === "supplier") {
        const [supplierUpdate] = await db
          .update(supplierTable)
          .set({
            supplierStatus: "Rejected",
            updatedBy: userId,
            updatedAt: timestamp
          })
          .where(eq(supplierTable.id, approvalRequest.documentId))
          .returning({ id: supplierTable.id });

        if (!supplierUpdate) {
          throw new Error("Failed to update supplier status");
        }
      }

      return updatedApproval;
    });

    return { data: result, error: null };
  } catch (error) {
    return {
      error: {
        message:
          error instanceof Error ? error.message : "Failed to process rejection"
      },
      data: null
    };
  }
}

export async function assign(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: {
    id: string;
    table: string;
    assignee: string;
  }
) {
  const { id, table, assignee } = args;

  return (
    client
      // @ts-ignore
      .from(table)
      .update({ assignee: assignee ? assignee : null })
      .eq("id", id)
  );
}

export async function getCustomFieldsCacheKey(args?: {
  companyId?: string;
  module?: string;
  table?: string;
}) {
  return `customFields:${args?.companyId}:${args?.module ?? ""}:${
    args?.table ?? ""
  }`;
}

export async function getCustomFieldsSchemas(
  client: CarbonDatabaseClient<QueryDatabase>,
  args?: {
    companyId: string;
    module?: string;
    table?: string;
  }
) {
  const key = await getCustomFieldsCacheKey(args);
  let schema: CustomFieldsTableType[] | null = null;

  try {
    const cachedSchema = await redis.get(key);
    if (cachedSchema) {
      schema = JSON.parse(cachedSchema) as CustomFieldsTableType[];
    }
  } finally {
    if (schema) {
      return {
        data: schema as CustomFieldsTableType[],
        error: null
      };
    }

    const query = client.from("customFieldTables").select("*");

    if (args?.companyId) {
      query.eq("companyId", args.companyId);
    }

    if (args?.module) {
      query.eq("module", args.module as any);
    }

    if (args?.table) {
      query.eq("table", args.table);
    }

    const result = await query;
    if (result.data) {
      await redis.set(key, JSON.stringify(result.data));
    }

    return result;
  }
}

/**
 * Generates a sales order PDF via the pdfLoader, uploads it to S3
 * storage under the opportunity path, and creates a document DB record.
 *
 * Returns the PDF ArrayBuffer (useful for email attachments) and the
 * generated file name.
 */
export async function generateAndAttachSalesOrderPdf(args: {
  /** The original action/loader args from the route */
  routeArgs: LoaderFunctionArgs;
  /** Sales order DB id */
  salesOrderId: string;
  /** Human-readable sales order identifier (e.g. "SO-0001") */
  salesOrderIdentifier: string;
  /** Opportunity the SO belongs to */
  opportunityId: string;
  companyId: string;
  userId: string;
  /** Database client for document writes and email context reads */
  client: CarbonDatabaseClient<QueryDatabase>;
  /** The pdf loader imported from the sales-order pdf route */
  pdfLoader: (args: LoaderFunctionArgs) => Promise<Response>;
}): Promise<{ file: ArrayBuffer; fileName: string; documentFilePath: string }> {
  const {
    routeArgs,
    salesOrderId,
    salesOrderIdentifier,
    opportunityId,
    companyId,
    userId,
    client,
    pdfLoader
  } = args;

  // 1. Generate the PDF
  const pdfArgs = {
    ...routeArgs,
    params: { ...routeArgs.params, id: salesOrderId }
  };
  const pdf = await pdfLoader(pdfArgs);

  if (pdf.headers.get("content-type") !== "application/pdf") {
    throw new Error("Failed to generate PDF");
  }

  const file = await pdf.arrayBuffer();
  const fileName = stripSpecialCharacters(
    `${salesOrderIdentifier} - ${new Date().toISOString().slice(0, -5)}.pdf`
  );

  // 2. Upload to S3 storage
  const documentFilePath = `${companyId}/opportunity/${opportunityId}/${fileName}`;

  await uploadObject({
    companyId,
    key: documentFilePath,
    body: new Uint8Array(file),
    contentType: "application/pdf"
  });

  // 3. Create the document DB record
  const documentResult = await upsertDocument(client, {
    path: documentFilePath,
    name: fileName,
    size: Math.round(file.byteLength / 1024),
    sourceDocument: "Sales Order",
    sourceDocumentId: salesOrderId,
    readGroups: [userId],
    writeGroups: [userId],
    createdBy: userId,
    companyId
  });

  if (documentResult.error) {
    throw new Error("Failed to create document record");
  }

  return { file, fileName, documentFilePath };
}

/**
 * Sends a sales order confirmation email with the PDF attached.
 *
 * This mirrors the email-sending logic originally in the confirm action
 * and can be reused by the quote-to-order conversion flow.
 */
export async function sendSalesOrderEmail(args: {
  salesOrderId: string;
  companyId: string;
  userId: string;
  customerContactId: string;
  cc?: string[];
  documentFilePath: string;
  fileName: string;
  client: CarbonDatabaseClient<QueryDatabase>;
  locales: string[];
}): Promise<{ success: boolean; message?: string }> {
  const {
    salesOrderId,
    companyId,
    userId,
    customerContactId,
    cc: ccSelections,
    documentFilePath,
    fileName,
    client,
    locales
  } = args;

  const [
    company,
    customer,
    salesOrder,
    salesOrderLines,
    salesOrderLocations,
    seller,
    paymentTerms
  ] = await Promise.all([
    getCompany(client, companyId),
    getCustomerContact(client, customerContactId),
    getSalesOrder(client, salesOrderId),
    getSalesOrderLines(client, salesOrderId),
    getSalesOrderCustomerDetails(client, salesOrderId),
    getUser(client, userId),
    getPaymentTermsList(client, companyId)
  ]);

  if (!customer?.data?.contact) {
    return { success: false, message: "Failed to get customer contact" };
  }
  if (!company.data) {
    return { success: false, message: "Failed to get company" };
  }
  if (!seller.data) {
    return { success: false, message: "Failed to get user" };
  }
  if (!salesOrder.data) {
    return { success: false, message: "Failed to get sales order" };
  }
  if (!salesOrderLocations.data) {
    return { success: false, message: "Failed to get sales order locations" };
  }
  if (!paymentTerms.data) {
    return { success: false, message: "Failed to get payment terms" };
  }

  const emailTemplate = SalesOrderEmail({
    company: company.data as any,
    locale: locales?.[0] ?? "en-US",
    salesOrder: salesOrder.data,
    salesOrderLines: salesOrderLines.data ?? [],
    salesOrderLocations: salesOrderLocations.data,
    recipient: {
      email: customer.data.contact.email!,
      firstName: customer.data.contact.firstName ?? undefined,
      lastName: customer.data.contact.lastName ?? undefined
    },
    sender: {
      email: seller.data.email,
      firstName: seller.data.firstName,
      lastName: seller.data.lastName
    },
    paymentTerms: paymentTerms.data
  });

  const html = await renderAsync(emailTemplate);
  const text = await renderAsync(emailTemplate, { plainText: true });
  const signedUrl = await signDownload({
    companyId,
    key: documentFilePath,
    expiresIn: 3600
  });

  await trigger("send-email", {
    to: [seller.data.email, customer.data.contact.email!],
    cc: ccSelections?.length ? ccSelections : undefined,
    from: seller.data.email,
    subject: `Order ${salesOrder.data.salesOrderId} from ${company.data.name}`,
    html,
    text,
    attachments: signedUrl
      ? [
          {
            path: signedUrl,
            filename: fileName
          }
        ]
      : undefined,
    companyId
  });

  return { success: true };
}

export async function getOrCreatePeriods(
  today: CalendarDate,
  weeksToProject: number
) {
  const start = startOfWeek(today, "en-US");

  // Generate weekly date ranges
  const ranges: { startDate: string; endDate: string }[] = [];
  let currentStart = start;
  for (let i = 0; i < weeksToProject; i++) {
    const periodEnd = currentStart.add({ days: 6 });
    ranges.push({
      startDate: currentStart.toString(),
      endDate: periodEnd.toString()
    });
    currentStart = periodEnd.add({ days: 1 });
  }

  // Check which periods already exist
  const existingPeriods = await dbService
    .select()
    .from(periodTable)
    .where(
      and(
        inArray(
          periodTable.startDate,
          ranges.map((r) => r.startDate)
        ),
        eq(periodTable.periodType, "Week")
      )
    )
    .execute();

  if (existingPeriods.length === ranges.length) {
    return existingPeriods.map(toPlainPeriod);
  }

  // Find missing periods
  const existingStartDates = new Set(
    existingPeriods.map((p) => dateToString(p.startDate))
  );

  const periodsToCreate = ranges.filter(
    (r) => !existingStartDates.has(r.startDate)
  );

  const created = await dbService.transaction(async (trx) => {
    return await trx
      .insert(periodTable)
      .values(
        periodsToCreate.map((p) => ({
          id: nanoid(),
          startDate: p.startDate,
          endDate: p.endDate,
          periodType: "Week" as const,
          createdAt: new Date().toISOString()
        }))
      )
      .returning();
  });

  return [...existingPeriods, ...created].map(toPlainPeriod);
}

/** Convert a pg DATE value (Date object or string) to an ISO date string. */
function dateToString(value: Date | string): string {
  if (value instanceof Date) {
    // Use local date parts to avoid timezone shift from toISOString()
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value);
}

/** Return a plain JSON-safe object with only the fields consumers need. */
function toPlainPeriod(p: {
  id: string;
  startDate: Date | string;
  endDate: Date | string;
  periodType: string;
}) {
  return {
    id: String(p.id),
    startDate: dateToString(p.startDate),
    endDate: dateToString(p.endDate),
    periodType: p.periodType
  };
}
