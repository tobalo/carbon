import { requirePermissions } from "@carbon/auth/auth.server";
import type { QueryDatabase } from "@carbon/database/schema";
import { trigger } from "@carbon/jobs";
import { NotificationEvent } from "@carbon/notifications";
import type { CarbonDatabaseClient } from "@carbon/database/query-client";
import type { ActionFunctionArgs } from "react-router";
import { qualityDocumentStatus } from "~/modules/quality/quality.models";
import {
  canApproveRequest,
  createApprovalRequest,
  getApprovalRuleByAmount,
  getApproverUserIdsForRule,
  getLatestApprovalRequestForDocument,
  hasPendingApproval,
  isApprovalRequired
} from "~/modules/shared";

type DocRow = { id: string; status: string | null };

/**
 * Process transition to Active from Draft or Archived.
 * When approval rules apply: create request and use Draft as "in progress".
 * - Draft → submit: stay Draft until approved, then Draft → Active.
 * - Archived → submit: move to Draft, create request; when approved, Draft → Active.
 * Otherwise: update to Active immediately.
 */
async function processToActive(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  userId: string,
  docList: DocRow[],
  ids: string[]
) {
  const idsToSkipActive: string[] = [];
  const archivedIdsToMoveToDraft: string[] = [];
  const canTransitionToActive = (s: string | null) =>
    s === "Draft" || s === "Archived";
  for (const doc of docList) {
    if (!canTransitionToActive(doc.status)) continue;
    const approvalRequired = await isApprovalRequired(
      client,
      "qualityDocument",
      companyId,
      undefined
    );
    if (!approvalRequired) continue;
    const hasPending = await hasPendingApproval(
      client,
      "qualityDocument",
      doc.id
    );
    if (hasPending) {
      idsToSkipActive.push(doc.id);
      continue;
    }
    await createApprovalRequest(client, {
      documentType: "qualityDocument",
      documentId: doc.id,
      companyId,
      requestedBy: userId,
      createdBy: userId,
      amount: undefined
    });

    const rule = await getApprovalRuleByAmount(
      client,
      "qualityDocument",
      companyId,
      undefined
    );
    const approverIds = rule.data
      ? await getApproverUserIdsForRule(client, rule.data)
      : [];

    if (approverIds.length > 0) {
      try {
        await trigger("notify", {
          event: NotificationEvent.ApprovalRequested,
          companyId,
          documentId: doc.id,
          documentType: "qualityDocument",
          recipient: { type: "users", userIds: approverIds },
          from: userId
        });
      } catch (e) {
        console.error("Failed to trigger approval notification", e);
      }
    }

    idsToSkipActive.push(doc.id);
    if (doc.status === "Archived") {
      archivedIdsToMoveToDraft.push(doc.id);
    }
  }
  for (const docId of archivedIdsToMoveToDraft) {
    await client
      .from("qualityDocument")
      .update({
        status: "Draft",
        updatedBy: userId,
        updatedAt: new Date().toISOString()
      })
      .eq("id", docId)
      .eq("companyId", companyId);
  }
  const idsToUpdateToActive = ids.filter((id) => !idsToSkipActive.includes(id));
  if (idsToUpdateToActive.length === 0) {
    return { data: null, error: null } as const;
  }
  return client
    .from("qualityDocument")
    .update({
      status: "Active",
      updatedBy: userId,
      updatedAt: new Date().toISOString()
    })
    .in("id", idsToUpdateToActive)
    .eq("companyId", companyId);
}

/**
 * Cancels pending approval requests when changing status to Archived or Draft.
 * - Archived: any user with update quality may archive; pending requests are cancelled.
 * - Draft: only the requester or an approver may change to Draft (withdraw); others get an error.
 */
async function cancelPendingApprovalsForArchiveOrDraft(
  client: CarbonDatabaseClient<QueryDatabase>,
  userId: string,
  docList: DocRow[],
  allowAnyUpdater: boolean
): Promise<{ message: string } | null> {
  const toCancel: { id: string; companyId: string }[] = [];
  for (const doc of docList) {
    const latest = await getLatestApprovalRequestForDocument(
      client,
      "qualityDocument",
      doc.id
    );
    const req = latest.data;
    if (!req || req.status !== "Pending") continue;
    if (!allowAnyUpdater) {
      const isRequester = req.requestedBy === userId;
      const isApprover = await canApproveRequest(
        client,
        {
          amount: req.amount,
          documentType: req.documentType,
          companyId: req.companyId
        },
        userId
      );
      if (!isRequester && !isApprover) {
        return {
          message:
            "Only the requester or an approver can change status to Draft when there is a pending approval request"
        };
      }
    }
    if (req.id) toCancel.push({ id: req.id, companyId: req.companyId });
  }
  for (const { id: reqId, companyId } of toCancel) {
    await client
      .from("approvalRequest")
      .update({
        status: "Cancelled",
        updatedBy: userId,
        updatedAt: new Date().toISOString()
      })
      .eq("id", reqId)
      .eq("companyId", companyId);
  }
  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "quality"
  });

  const formData = await request.formData();
  const ids = formData.getAll("ids");
  const field = formData.get("field");
  const value = formData.get("value");

  if (typeof field !== "string" || typeof value !== "string") {
    return { error: { message: "Invalid form data" }, data: null };
  }

  switch (field) {
    case "content":
    case "name":
      return await client
        .from("qualityDocument")
        .update({
          [field]: value,
          updatedBy: userId,
          updatedAt: new Date().toISOString()
        })
        .in("id", ids as string[])
        .eq("companyId", companyId);
    case "status": {
      const statusValue = value as (typeof qualityDocumentStatus)[number];
      if (!qualityDocumentStatus.includes(statusValue)) {
        return { error: { message: "Invalid status" }, data: null };
      }

      const currentDocs = await client
        .from("qualityDocument")
        .select("id, status")
        .in("id", ids as string[])
        .eq("companyId", companyId);

      if (currentDocs.error) {
        return { error: currentDocs.error, data: null };
      }

      const docList = (currentDocs.data ?? []) as DocRow[];
      const idList = ids as string[];

      if (statusValue === "Active") {
        return processToActive(
          client,
          companyId,
          userId,
          docList,
          idList
        );
      }

      if (statusValue === "Archived" || statusValue === "Draft") {
        const allowAnyUpdater = statusValue === "Archived";
        const err = await cancelPendingApprovalsForArchiveOrDraft(
          client,
          userId,
          docList,
          allowAnyUpdater
        );
        if (err) return { error: { message: err.message }, data: null };
      }

      return await client
        .from("qualityDocument")
        .update({
          status: statusValue,
          updatedBy: userId,
          updatedAt: new Date().toISOString()
        })
        .in("id", idList)
        .eq("companyId", companyId);
    }
    case "tags":
      return await client
        .from("qualityDocument")
        .update({
          [field]: formData.getAll("value") as string[],
          updatedBy: userId,
          updatedAt: new Date().toISOString()
        })
        .in("id", ids as string[])
        .eq("companyId", companyId);

    default:
      return { error: { message: "Invalid field" }, data: null };
  }
}
