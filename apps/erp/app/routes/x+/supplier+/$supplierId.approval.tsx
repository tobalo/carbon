import { assertIsPost, error, success } from "@carbon/auth";
import {
  assertSupplierAccountScope,
  requirePermissions
} from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import { trigger } from "@carbon/jobs";
import { NotificationEvent } from "@carbon/notifications";
import { getLocalTimeZone, today } from "@internationalized/date";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { supplierApprovalDecisionValidator } from "~/modules/purchasing";
import {
  canApproveRequest,
  createApprovalRequest,
  getApprovalRuleByAmount,
  getApproverUserIdsForRule,
  getLatestApprovalRequestForDocument,
  hasPendingApproval,
} from "~/modules/shared";
import { approveRequest, rejectRequest } from "~/modules/shared/shared.server";
import { path } from "~/utils/path";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const auth = await requirePermissions(request, {
    update: "purchasing"
  });
  const { client, companyId, userId } = auth;

  const { supplierId } = params;
  if (!supplierId) throw new Error("Could not find supplierId");
  assertSupplierAccountScope(auth, supplierId);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "request-approval") {
    const pending = await hasPendingApproval(
      client,
      "supplier",
      supplierId
    );

    if (pending) {
      throw redirect(
        path.to.supplier(supplierId),
        await flash(
          request,
          error(null, "An approval request already exists for this supplier")
        )
      );
    }

    await createApprovalRequest(client, {
      documentType: "supplier",
      documentId: supplierId,
      companyId,
      requestedBy: userId,
      createdBy: userId,
      amount: undefined
    });

    // Update supplier status to Pending
    await client
      .from("supplier")
      .update({
        supplierStatus: "Pending",
        updatedBy: userId,
        updatedAt: today(getLocalTimeZone()).toString()
      })
      .eq("id", supplierId)
      .eq("companyId", companyId);

    const rule = await getApprovalRuleByAmount(
      client,
      "supplier",
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
          documentId: supplierId,
          documentType: "supplier",
          recipient: { type: "users", userIds: approverIds },
          from: userId
        });
      } catch (e) {
        console.error("Failed to trigger approval notification", e);
      }
    }

    throw redirect(
      path.to.supplier(supplierId),
      await flash(request, success("Approval request submitted"))
    );
  }

  if (intent === "make-inactive") {
    const canApprove = await canApproveRequest(
      client,
      {
        amount: null,
        documentType: "supplier",
        companyId
      },
      userId
    );

    if (!canApprove) {
      throw redirect(
        path.to.supplier(supplierId),
        await flash(
          request,
          error(null, "You do not have permission to deactivate this supplier")
        )
      );
    }

    await client
      .from("supplier")
      .update({
        supplierStatus: "Inactive",
        updatedBy: userId,
        updatedAt: today(getLocalTimeZone()).toString()
      })
      .eq("id", supplierId)
      .eq("companyId", companyId);

    throw redirect(
      path.to.supplier(supplierId),
      await flash(request, success("Supplier deactivated"))
    );
  }

  // Handle approve/reject intents
  const validation = await validator(
    supplierApprovalDecisionValidator
  ).validate(formData);

  if (validation.error) {
    return validationError(validation.error);
  }

  const { approvalRequestId, decision, notes } = validation.data;

  const approvalRequest = await getLatestApprovalRequestForDocument(
    client,
    "supplier",
    supplierId
  );

  if (!approvalRequest.data || approvalRequest.data.id !== approvalRequestId) {
    throw redirect(
      path.to.supplier(supplierId),
      await flash(request, error(null, "Approval request not found"))
    );
  }

  const canApprove = await canApproveRequest(
    client,
    {
      amount: approvalRequest.data.amount,
      documentType: approvalRequest.data.documentType,
      companyId: approvalRequest.data.companyId
    },
    userId
  );

  if (!canApprove) {
    throw redirect(
      path.to.supplier(supplierId),
      await flash(
        request,
        error(null, "You do not have permission to approve this request")
      )
    );
  }

  const result =
    decision === "Approved"
      ? await approveRequest(approvalRequestId, userId, notes || undefined)
      : await rejectRequest(approvalRequestId, userId, notes || undefined);

  if (result.error) {
    throw redirect(
      path.to.supplier(supplierId),
      await flash(
        request,
        error(
          result.error,
          result.error?.message ?? "Failed to process approval decision"
        )
      )
    );
  }

  const requestedBy = approvalRequest.data?.requestedBy;
  const requestCompanyId = approvalRequest.data?.companyId;
  if (requestedBy && requestCompanyId && requestedBy !== userId) {
    try {
      await trigger("notify", {
        event:
          decision === "Approved"
            ? NotificationEvent.ApprovalApproved
            : NotificationEvent.ApprovalRejected,
        companyId: requestCompanyId,
        documentId: supplierId,
        documentType: "supplier",
        recipient: { type: "user", userId: requestedBy },
        from: userId
      });
    } catch (e) {
      console.error("Failed to trigger approval decision notification", e);
    }
  }

  throw redirect(
    path.to.supplier(supplierId),
    await flash(
      request,
      success(`Approval request ${decision.toLowerCase()} successfully`)
    )
  );
}
