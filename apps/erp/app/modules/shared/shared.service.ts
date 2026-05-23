import { invokeFunction } from "@carbon/auth/functions.server";
import type {
  QueryDatabase,
  TableInsert,
  TableUpdate
} from "@carbon/database/schema";
import { downloadObject } from "@carbon/storage";
import { supportedModelTypes } from "@carbon/utils";
import type { CarbonDatabaseClient } from "@carbon/database/query-client";
import type { GenericQueryFilters } from "~/utils/query";
import { setGenericQueryFilters } from "~/utils/query";
import { sanitize } from "@carbon/utils";
import type {
  approvalDocumentType,
  documentTypes,
  PriceBreak,
  SupplierPriceMap
} from "./shared.models";
import type {
  ApprovalFilters,
  ApprovalRequestForApproveCheck,
  ApprovalRequestForCancelCheck,
  ApprovalRequestForViewCheck,
  ApprovalRule,
  CreateApprovalRequestInput,
  UpsertApprovalRuleInput
} from "./types";

export async function canApproveRequest(
  client: CarbonDatabaseClient<QueryDatabase>,
  approvalRequest: ApprovalRequestForApproveCheck,
  userId: string
): Promise<boolean> {
  const rules = await getApprovalRulesForApprover(
    client,
    approvalRequest.documentType,
    approvalRequest.companyId
  );

  if (!rules.data || rules.data.length === 0) {
    return false;
  }

  const userGroups = await client.rpc("groups_for_user", { uid: userId });
  const userGroupIds = userGroups.data || [];

  // Check if user can approve via any rule (higher amount approvers can approve lower amounts)
  return rules.data.some((rule) => {
    if (rule.defaultApproverId === userId) {
      return true;
    }

    const approverGroupIds = rule.approverGroupIds;
    if (!approverGroupIds || approverGroupIds.length === 0) {
      return false;
    }

    // Check if user ID is directly in approverGroupIds (for individual approvers)
    if (approverGroupIds.includes(userId)) {
      return true;
    }

    // Check if user belongs to any of the approver groups
    return approverGroupIds.some((groupId: any) => userGroupIds.includes(groupId));
  });
}

/**
 * Checks if a user can approve a request based on the specific rule matching the amount.
 * This is the original approval check logic - user must be on the rule that matches the amount.
 * Used for "Assigned to Me" lists.
 */
export async function canApproveRequestInWindow(
  client: CarbonDatabaseClient<QueryDatabase>,
  approvalRequest: ApprovalRequestForApproveCheck,
  userId: string
): Promise<boolean> {
  const rule = await getApprovalRuleByAmount(
    client,
    approvalRequest.documentType,
    approvalRequest.companyId,
    approvalRequest.amount ?? undefined
  );

  if (!rule.data) {
    return false;
  }

  if (rule.data.defaultApproverId === userId) {
    return true;
  }

  const approverGroupIds = rule.data.approverGroupIds;
  if (!approverGroupIds || approverGroupIds.length === 0) {
    return false;
  }

  // Check if user ID is directly in approverGroupIds (for individual approvers)
  if (approverGroupIds.includes(userId)) {
    return true;
  }

  // Check if user belongs to any of the approver groups
  const userGroups = await client.rpc("groups_for_user", { uid: userId });
  const userGroupIds = userGroups.data || [];
  return approverGroupIds.some((groupId: any) => userGroupIds.includes(groupId));
}

export function canCancelRequest(
  approvalRequest: ApprovalRequestForCancelCheck,
  userId: string
): boolean {
  return (
    approvalRequest.requestedBy === userId &&
    approvalRequest.status === "Pending"
  );
}

export async function cancelApprovalRequest(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  userId: string
) {
  const existing = await client
    .from("approvalRequest")
    .select("id, status, requestedBy")
    .eq("id", id)
    .single();

  if (existing.error || !existing.data) {
    return { error: { message: "Approval request not found" }, data: null };
  }

  if (existing.data.status !== "Pending") {
    return {
      error: { message: "Approval request is not pending" },
      data: null
    };
  }

  if (existing.data.requestedBy !== userId) {
    return {
      error: { message: "Only the requester can cancel an approval request" },
      data: null
    };
  }

  return client
    .from("approvalRequest")
    .update({
      status: "Cancelled",
      updatedBy: userId,
      updatedAt: new Date().toISOString()
    })
    .eq("id", id)
    .select("id")
    .single();
}

export async function canViewApprovalRequest(
  client: CarbonDatabaseClient<QueryDatabase>,
  approvalRequest: ApprovalRequestForViewCheck,
  userId: string
): Promise<boolean> {
  if (approvalRequest.requestedBy === userId) {
    return true;
  }

  return canApproveRequest(
    client,
    {
      amount: approvalRequest.amount,
      documentType: approvalRequest.documentType,
      companyId: approvalRequest.companyId
    },
    userId
  );
}

export async function createApprovalRequest(
  client: CarbonDatabaseClient<QueryDatabase>,
  request: CreateApprovalRequestInput & { amount?: number }
) {
  return client
    .from("approvalRequest")
    .insert([
      {
        documentType: request.documentType,
        documentId: request.documentId,
        requestedBy: request.requestedBy,
        amount: request.amount ?? null,
        companyId: request.companyId,
        createdBy: request.createdBy
      }
    ])
    .select("id")
    .single();
}

export async function deleteApprovalRule(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  companyId: string
) {
  return client
    .from("approvalRule")
    .delete()
    .eq("id", id)
    .eq("companyId", companyId);
}

export async function deleteNote(
  client: CarbonDatabaseClient<QueryDatabase>,
  noteId: string
) {
  return client.from("note").update({ active: false }).eq("id", noteId);
}

export async function deleteSavedView(
  client: CarbonDatabaseClient<QueryDatabase>,
  viewId: string
) {
  return client.from("tableView").delete().eq("id", viewId);
}

export async function generateEmbedding(
  client: CarbonDatabaseClient<QueryDatabase>,
  text: string
): Promise<number[]> {
  const response = await invokeFunction("embedding", {
    body: { text },
  });

  if (response.error) {
    throw new Error(
      `Failed to generate embedding: ${
        response.error.message || "Unknown error"
      }`
    );
  }

  if (!response.data?.embedding) {
    throw new Error("No embedding returned from function");
  }

  return response.data.embedding as number[];
}

export async function getApprovalById(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  const baseRequest = await client
    .from("approvalRequest")
    .select("*")
    .eq("id", id)
    .single();

  if (baseRequest.error || !baseRequest.data) {
    return baseRequest;
  }

  const viewData = await client
    .from("approvalRequests")
    .select("documentReadableId, documentDescription")
    .eq("id", id)
    .single();

  return {
    data: {
      ...baseRequest.data,
      documentReadableId: viewData.data?.documentReadableId ?? null,
      documentDescription: viewData.data?.documentDescription ?? null
    },
    error: null
  };
}

export async function getApprovalRequestsByDocument(
  client: CarbonDatabaseClient<QueryDatabase>,
  documentType: (typeof approvalDocumentType)[number],
  documentId: string
) {
  return client
    .from("approvalRequests")
    .select("*")
    .eq("documentType", documentType)
    .eq("documentId", documentId)
    .order("requestedAt", { ascending: false });
}

export async function getApprovalRuleByAmount(
  client: CarbonDatabaseClient<QueryDatabase>,
  documentType: (typeof approvalDocumentType)[number],
  companyId: string,
  amount?: number
) {
  let query = client
    .from("approvalRule")
    .select("*")
    .eq("documentType", documentType)
    .eq("companyId", companyId)
    .eq("enabled", true);

  if (amount !== undefined && amount !== null) {
    query = query.lte("lowerBoundAmount", amount);
  } else {
    query = query.eq("lowerBoundAmount", 0);
  }

  return query
    .order("lowerBoundAmount", { ascending: false })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
}

export async function getApproverUserIdsForRule(
  client: CarbonDatabaseClient<QueryDatabase>,
  rule: Pick<ApprovalRule, "approverGroupIds" | "defaultApproverId">
): Promise<string[]> {
  const groupIds = rule.approverGroupIds?.filter(Boolean) ?? [];
  const defaultId = rule.defaultApproverId ?? null;

  const fromGroups =
    groupIds.length > 0
      ? await client.rpc("users_for_groups", { groups: groupIds })
      : { data: [] as string[], error: null };

  if (fromGroups.error) {
    console.error(
      "getApproverUserIdsForRule: users_for_groups failed",
      fromGroups.error
    );
    return defaultId ? [defaultId] : [];
  }

  const ids = Array.isArray(fromGroups.data)
    ? (fromGroups.data as string[])
    : [];
  const combined = defaultId
    ? [...new Set([...ids, defaultId])]
    : [...new Set(ids)];
  return combined;
}

export async function getApprovalRuleById(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  companyId: string
) {
  return client
    .from("approvalRule")
    .select("*")
    .eq("id", id)
    .eq("companyId", companyId)
    .single();
}

export async function getApprovalRules(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client.from("approvalRule").select("*").eq("companyId", companyId);
}

export async function getApprovalRulesForApprover(
  client: CarbonDatabaseClient<QueryDatabase>,
  documentType: (typeof approvalDocumentType)[number],
  companyId: string
) {
  return client
    .from("approvalRule")
    .select("*")
    .eq("documentType", documentType)
    .eq("companyId", companyId)
    .eq("enabled", true)
    .order("lowerBoundAmount", { ascending: false });
}

export async function getApprovalsForUser(
  client: CarbonDatabaseClient<QueryDatabase>,
  userId: string,
  companyId: string,
  args?: GenericQueryFilters & ApprovalFilters
) {
  let query = client
    .from("approvalRequest")
    .select("*", { count: "exact" })
    .eq("companyId", companyId)
    .eq("requestedBy", userId);

  if (args?.documentType) {
    query = query.eq("documentType", args.documentType);
  }

  if (args?.status) {
    query = query.eq("status", args.status);
  }

  if (args?.dateFrom) {
    query = query.gte("requestedAt", args.dateFrom);
  }
  if (args?.dateTo) {
    query = query.lte("requestedAt", args.dateTo);
  }

  const requestedByUserBase = await query;

  // Get readable fields from view for requestedByUser
  const requestedByUser = await Promise.all(
    (requestedByUserBase.data || []).map(async (approval) => {
      const viewData = await client
        .from("approvalRequests")
        .select("documentReadableId, documentDescription")
        .eq("id", approval.id)
        .single();

      return {
        ...approval,
        documentReadableId: viewData.data?.documentReadableId ?? null,
        documentDescription: viewData.data?.documentDescription ?? null
      };
    })
  );

  let pendingQuery = client
    .from("approvalRequest")
    .select("*")
    .eq("companyId", companyId)
    .eq("status", "Pending")
    .neq("requestedBy", userId);

  if (args?.documentType) {
    pendingQuery = pendingQuery.eq("documentType", args.documentType);
  }

  if (args?.dateFrom) {
    pendingQuery = pendingQuery.gte("requestedAt", args.dateFrom);
  }
  if (args?.dateTo) {
    pendingQuery = pendingQuery.lte("requestedAt", args.dateTo);
  }

  const allPending = await pendingQuery;

  const pendingWithReadableFields = await Promise.all(
    (allPending.data || []).map(async (approval) => {
      const viewData = await client
        .from("approvalRequests")
        .select("documentReadableId, documentDescription")
        .eq("id", approval.id)
        .single();

      return {
        ...approval,
        documentReadableId: viewData.data?.documentReadableId ?? null,
        documentDescription: viewData.data?.documentDescription ?? null
      };
    })
  );

  const canApprovePromises = pendingWithReadableFields.map(async (approval) => {
    const canApprove = await canApproveRequest(
      client,
      {
        amount: approval.amount,
        documentType: approval.documentType,
        companyId: approval.companyId
      },
      userId
    );
    return canApprove ? approval : null;
  });

  const approvableByUser = (await Promise.all(canApprovePromises)).filter(
    (approval): approval is NonNullable<typeof approval> => approval !== null
  );

  const allApprovals = [...requestedByUser, ...approvableByUser];

  let filtered = allApprovals;
  if (args?.status && args.status !== "Pending") {
    filtered = allApprovals.filter((a) => a.status === args.status);
  }

  filtered.sort((a, b) => {
    const aDate = new Date(a.requestedAt).getTime();
    const bDate = new Date(b.requestedAt).getTime();
    return bDate - aDate;
  });

  if (args?.limit) {
    const offset = args.offset || 0;
    filtered = filtered.slice(offset, offset + args.limit);
  }

  return {
    data: filtered,
    count: requestedByUserBase.count ?? allApprovals.length,
    error: null
  };
}

export async function getBase64ImageFromStorage(
  client: CarbonDatabaseClient<QueryDatabase>,
  path: string
) {
  function arrayBufferToBase64(buffer: ArrayBuffer): string {
    return Buffer.from(buffer).toString("base64");
  }

  const companyId = path.replace(/^\/+/, "").split("/")[0];
  if (!companyId) {
    return null;
  }

  const arrayBuffer = await downloadObject({ companyId, key: path });
  if (!arrayBuffer) {
    return null;
  }
  const base64String = arrayBufferToBase64(arrayBuffer);

  // Determine the mime type based on file extension
  const fileExtension = path.split(".").pop()?.toLowerCase();
  const mimeType =
    fileExtension === "jpg" || fileExtension === "jpeg"
      ? "image/jpeg"
      : "image/png";

  return `data:${mimeType};base64,${base64String}`;
}

export async function getCountries(client: CarbonDatabaseClient<QueryDatabase>) {
  return client.from("country").select("*").order("name");
}

export async function getLatestApprovalRequestForDocument(
  client: CarbonDatabaseClient<QueryDatabase>,
  documentType: (typeof approvalDocumentType)[number],
  documentId: string
) {
  const baseRequest = await client
    .from("approvalRequest")
    .select("*")
    .eq("documentType", documentType)
    .eq("documentId", documentId)
    .eq("status", "Pending")
    .order("requestedAt", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (baseRequest.error || !baseRequest.data) {
    return baseRequest;
  }

  const viewData = await client
    .from("approvalRequests")
    .select("documentReadableId, documentDescription")
    .eq("id", baseRequest.data.id)
    .single();

  return {
    data: {
      ...baseRequest.data,
      documentReadableId: viewData.data?.documentReadableId ?? null,
      documentDescription: viewData.data?.documentDescription ?? null
    },
    error: null
  };
}

export function getDocumentType(
  fileName: string
): (typeof documentTypes)[number] {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (["zip", "rar", "7z", "tar", "gz"].includes(extension)) {
    return "Archive";
  }

  if (["pdf"].includes(extension)) {
    return "PDF";
  }

  if (["doc", "docx", "txt", "rtf"].includes(extension)) {
    return "Document";
  }

  if (["ppt", "pptx"].includes(extension)) {
    return "Presentation";
  }

  if (["csv", "xls", "xlsx"].includes(extension)) {
    return "Spreadsheet";
  }

  if (["txt"].includes(extension)) {
    return "Text";
  }

  if (["png", "jpg", "jpeg", "gif", "avif"].includes(extension)) {
    return "Image";
  }

  if (["mp4", "mov", "avi", "wmv", "flv", "mkv"].includes(extension)) {
    return "Video";
  }

  if (["mp3", "wav", "wma", "aac", "ogg", "flac"].includes(extension)) {
    return "Audio";
  }

  if (supportedModelTypes.includes(extension)) {
    return "Model";
  }

  return "Other";
}

export async function getModelByItemId(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string
) {
  const item = await client
    .from("item")
    .select("id, type, modelUploadId")
    .eq("id", itemId)
    .single();

  if (!item.data || !item.data.modelUploadId) {
    return {
      itemId: item.data?.id ?? null,
      type: item.data?.type ?? null,
      modelPath: null
    };
  }

  const model = await client
    .from("modelUpload")
    .select("*")
    .eq("id", item.data.modelUploadId)
    .maybeSingle();

  if (!model.data) {
    return {
      itemId: item.data?.id ?? null,
      type: item.data?.type ?? null,
      modelSize: null
    };
  }

  return {
    itemId: item.data!.id,
    type: item.data!.type,
    ...model.data
  };
}

export async function getNotes(
  client: CarbonDatabaseClient<QueryDatabase>,
  documentId: string
) {
  const notes = await client
    .from("note")
    .select("id, note, createdAt, createdBy")
    .eq("documentId", documentId)
    .eq("active", true)
    .order("createdAt");

  if (notes.error || !notes.data) {
    return notes;
  }

  const userIds = [...new Set(notes.data.map((note) => note.createdBy))];
  const users =
    userIds.length > 0
      ? await client
          .from("user")
          .select("id, fullName, avatarUrl")
          .in("id", userIds)
      : { data: [] };
  const usersById = new Map(
    users.data?.map((user) => [user.id, user] as const) ?? []
  );

  return {
    ...notes,
    data: notes.data.map((note) => ({
      ...note,
      user: usersById.get(note.createdBy) ?? null
    }))
  };
}

export async function getPendingApprovalsForApprover(
  client: CarbonDatabaseClient<QueryDatabase>,
  userId: string,
  companyId: string
) {
  const allPending = await client
    .from("approvalRequest")
    .select("*")
    .eq("companyId", companyId)
    .eq("status", "Pending")
    .order("requestedAt", { ascending: false });

  if (allPending.error || !allPending.data) {
    return allPending;
  }

  const pendingWithReadableFields = await Promise.all(
    allPending.data.map(async (approval) => {
      const viewData = await client
        .from("approvalRequests")
        .select("documentReadableId, documentDescription")
        .eq("id", approval.id)
        .single();

      return {
        ...approval,
        documentReadableId: viewData.data?.documentReadableId ?? null,
        documentDescription: viewData.data?.documentDescription ?? null
      };
    })
  );

  // Use canApproveRequestInWindow to only show requests within user's specific approval window
  const canApprovePromises = pendingWithReadableFields.map(async (approval) => {
    const canApprove = await canApproveRequestInWindow(
      client,
      {
        amount: approval.amount,
        documentType: approval.documentType,
        companyId: approval.companyId
      },
      userId
    );
    return canApprove ? approval : null;
  });

  const approvableByUser = (await Promise.all(canApprovePromises)).filter(
    (approval): approval is NonNullable<typeof approval> => approval !== null
  );

  return {
    data: approvableByUser,
    error: null
  };
}

export async function getPeriods(
  client: CarbonDatabaseClient<QueryDatabase>,
  { startDate, endDate }: { startDate: string; endDate: string }
) {
  const endWithTime = endDate.includes("T") ? endDate : `${endDate}T23:59:59`;
  return client
    .from("period")
    .select("*")
    .gte("startDate", startDate)
    .lte("endDate", endWithTime);
}

export async function getSavedViews(
  client: CarbonDatabaseClient<QueryDatabase>,
  userId: string,
  companyId: string
) {
  return client
    .from("tableView")
    .select("*")
    .eq("createdBy", userId)
    .eq("companyId", companyId)
    .order("name");
}

export async function getTagsList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  table?: string | null
) {
  let query = client.from("tag").select("name").eq("companyId", companyId);

  if (table) {
    query = query.eq("table", table);
  }

  return query.order("name");
}

export async function hasPendingApproval(
  client: CarbonDatabaseClient<QueryDatabase>,
  documentType: (typeof approvalDocumentType)[number],
  documentId: string
): Promise<boolean> {
  const result = await client
    .from("approvalRequest")
    .select("id")
    .eq("documentType", documentType)
    .eq("documentId", documentId)
    .eq("status", "Pending")
    .limit(1);

  return (result.data?.length ?? 0) > 0;
}

export async function importCsv(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: {
    table: string;
    filePath: string;
    columnMappings: Record<string, string>;
    enumMappings?: Record<string, string[]>;
    companyId: string;
    userId: string;
  }
) {
  return invokeFunction("import-csv", {
    body: args,
  });
}

export async function insertNote(
  client: CarbonDatabaseClient<QueryDatabase>,
  note: {
    note: string;
    documentId: string;
    companyId: string;
    createdBy: string;
  }
) {
  return client.from("note").insert([note]).select("*").single();
}

export async function insertTag(
  client: CarbonDatabaseClient<QueryDatabase>,
  tag: TableInsert<"tag">
) {
  return client.from("tag").insert(tag).select("*").single();
}

export async function isApprovalRequired(
  client: CarbonDatabaseClient<QueryDatabase>,
  documentType: (typeof approvalDocumentType)[number],
  companyId: string,
  amount?: number
): Promise<boolean> {
  const config = await getApprovalRuleByAmount(
    client,
    documentType,
    companyId,
    amount
  );

  if (!config.data) {
    return false;
  }

  return config.data.enabled;
}

export async function getExternalLink(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  let query = client.from("externalLink").select("*").eq("id", id).single();

  return query;
}

export async function upsertExternalLink(
  client: CarbonDatabaseClient<QueryDatabase>,
  externalLink:
    | TableInsert<"externalLink">
    | TableUpdate<"externalLink">
) {
  if ("id" in externalLink && externalLink.id) {
    return client
      .from("externalLink")
      .update(externalLink)
      .eq("id", externalLink.id)
      .select("id")
      .single();
  }
  return client
    .from("externalLink")
    .insert(
      externalLink as TableInsert<"externalLink">
    )
    .select("id")
    .single();
}

export async function getCustomerPortals(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("externalLink")
    .select("*", { count: "exact" })
    .eq("companyId", companyId)
    .eq("documentType", "Customer");

  if (args?.search) {
    query = query.ilike("customer.name", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "createdAt", ascending: false }
    ]);
  }

  return query;
}

export async function getCustomerPortal(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  const externalLink = await client
    .from("externalLink")
    .select("*")
    .eq("id", id)
    .eq("documentType", "Customer")
    .single();

  if (externalLink.error || !externalLink.data?.customerId) {
    return externalLink;
  }

  const customer = await client
    .from("customer")
    .select("id, name")
    .eq("id", externalLink.data.customerId)
    .eq("companyId", externalLink.data.companyId)
    .single();

  return {
    ...externalLink,
    data: {
      ...externalLink.data,
      customer: customer.data
    }
  };
}

export async function deleteCustomerPortal(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("externalLink").delete().eq("id", id);
}

export async function updateModelThumbnail(
  client: CarbonDatabaseClient<QueryDatabase>,
  modelId: string,
  thumbnailPath: string
) {
  return client.from("modelUpload").update({ thumbnailPath }).eq("id", modelId);
}

export async function upsertModelUpload(
  client: CarbonDatabaseClient<QueryDatabase>,
  upload:
    | {
        id: string;
        modelPath: string;
        companyId: string;
        createdBy: string;
      }
    | {
        id: string;
        name: string;
        size: number;
        thumbnailPath: string;
      }
) {
  if ("createdBy" in upload) {
    return client.from("modelUpload").insert(upload);
  }
  return client.from("modelUpload").update(upload).eq("id", upload.id);
}

export async function updateNote(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  note: string
) {
  return client.from("note").update({ note }).eq("id", id);
}

export async function upsertApprovalRule(
  client: CarbonDatabaseClient<QueryDatabase>,
  rule: UpsertApprovalRuleInput
) {
  if ("id" in rule) {
    const existing = await client
      .from("approvalRule")
      .select("companyId")
      .eq("id", rule.id)
      .single();

    if (existing.error || !existing.data) {
      return {
        data: null,
        error: existing.error || { message: "Rule not found" }
      };
    }

    return client
      .from("approvalRule")
      .update(sanitize(rule))
      .eq("id", rule.id)
      .eq("companyId", existing.data.companyId)
      .select("id")
      .single();
  }

  return client.from("approvalRule").insert([rule]).select("id").single();
}

export async function upsertSavedView(
  client: CarbonDatabaseClient<QueryDatabase>,
  view: {
    id?: string;
    name: string;
    description?: string;
    table: string;
    type: "Public" | "Private";
    filters?: string[];
    sorts?: string[];
    columnPinning?: Record<string, boolean>;
    columnVisibility?: Record<string, boolean>;
    columnOrder?: string[];
    userId: string;
    companyId: string;
  }
) {
  const { userId, ...data } = view;
  if ("id" in view && view.id) {
    return client
      .from("tableView")
      .update({
        ...data,
        updatedBy: userId
      })
      .eq("id", view.id)
      .select("id")
      .single();
  }

  const { data: maxSortOrderData, error: maxSortOrderError } = await client
    .from("tableView")
    .select("sortOrder")
    .order("sortOrder", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxSortOrderError) {
    return { data: null, error: maxSortOrderError };
  }

  const newSortOrder = maxSortOrderData ? maxSortOrderData.sortOrder + 1 : 1;

  return client
    .from("tableView")
    .insert({
      ...data,
      createdBy: userId,
      sortOrder: newSortOrder
    })
    .select("id")
    .single();
}

export async function updateSavedViewOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  updates: {
    id: string;
    sortOrder: number;
    updatedBy: string;
  }[]
) {
  const updatePromises = updates.map(({ id, sortOrder, updatedBy }) =>
    client.from("tableView").update({ sortOrder, updatedBy }).eq("id", id)
  );
  return Promise.all(updatePromises);
}

/**
 * Core sync lookup: given price break tiers and a requested quantity,
 * return the unit price from the highest qualifying tier
 * (where tier.quantity <= requestedQty). Falls back to fallbackPrice.
 */
export function lookupPriceFromBreaks(
  priceBreaks: PriceBreak[],
  requestedQty: number,
  fallbackPrice: number
): number {
  const eligible = priceBreaks.filter((pb) => pb.quantity <= requestedQty);
  if (eligible.length) {
    return eligible.reduce((best, pb) =>
      pb.quantity > best.quantity ? pb : best
    ).unitPrice;
  }
  return fallbackPrice;
}

/**
 * Map-aware wrapper: look up itemId in a SupplierPriceMap, then resolve
 * via lookupPriceFromBreaks. Used by useLineCosts for BOM tree costing.
 */
export function lookupBuyPriceFromMap(
  itemId: string,
  requestedQty: number,
  priceMap: SupplierPriceMap,
  fallbackCost: number
): number {
  const entry = priceMap[itemId];
  if (!entry) return fallbackCost;
  return lookupPriceFromBreaks(
    entry.priceBreaks,
    requestedQty,
    entry.fallbackUnitPrice ?? fallbackCost
  );
}

/**
 * Resolve the best supplier unit price for a quantity, applying exchange
 * rate conversion.
 */
export function resolveSupplierPrice(
  priceBreaks: PriceBreak[],
  quantity: number,
  fallbackUnitPrice: number,
  exchangeRate: number
): number {
  if (!priceBreaks.length) return fallbackUnitPrice;
  return (
    lookupPriceFromBreaks(
      priceBreaks,
      quantity,
      fallbackUnitPrice * exchangeRate
    ) / exchangeRate
  );
}
