import { error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { trigger } from "@carbon/jobs";
import { NotificationEvent } from "@carbon/notifications";
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { z } from "zod";

export const messagingNotifySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("jobOperationNote"),
    operationId: z.string()
  })
]);

export async function action({ request }: ActionFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {});

  const payload = messagingNotifySchema.safeParse(await request.json());

  if (payload.success) {
    switch (payload.data.type) {
      case "jobOperationNote":
        const { operationId } = payload.data;

        const [jobOperation, previousMessages] = await Promise.all([
          client
            .from("jobOperation")
            .select("id, jobId, jobMakeMethodId")
            .eq("id", operationId)
            .eq("companyId", companyId)
            .single(),
          client
            .from("jobOperationNote")
            .select("*")
            .eq("jobOperationId", operationId)
            .eq("companyId", companyId)
        ]);

        const [job, jobMakeMethod] = await Promise.all([
          jobOperation.data?.jobId
            ? client
                .from("job")
                .select("id, assignee")
                .eq("id", jobOperation.data.jobId)
                .eq("companyId", companyId)
                .single()
            : { data: null },
          jobOperation.data?.jobMakeMethodId
            ? client
                .from("jobMakeMethod")
                .select("id, parentMaterialId")
                .eq("id", jobOperation.data.jobMakeMethodId)
                .eq("companyId", companyId)
                .single()
            : { data: null }
        ]);

        const assignee = job.data?.assignee;
        const jobId = job.data?.id;
        const makeMethodId = jobMakeMethod.data?.id;
        const materialId = jobMakeMethod.data?.parentMaterialId;

        const usersToNotify = [
          ...new Set([
            ...(previousMessages.data?.map((m) => m.createdBy) ?? []).filter(
              (id) => id !== userId
            )
          ])
        ];

        if (assignee && assignee !== userId) {
          usersToNotify.push(assignee);
        }

        if (usersToNotify.length > 0) {
          const notificationEvent = getNotificationEvent("jobOperationNote");
          if (notificationEvent) {
            await trigger("notify", {
              companyId,
              documentId: `${jobId}:${operationId}:${makeMethodId}:${
                materialId ?? ""
              }`,
              event: notificationEvent,
              recipient: {
                type: "users",
                userIds: usersToNotify
              },
              from: userId
            });
          }
        }

        break;
      default:
        return data(
          { success: false },
          await flash(request, error(null, "Invalid payload"))
        );
    }

    return { success: true };
  } else {
    return data(
      { success: false },
      await flash(request, error(null, "Failed to notify user"))
    );
  }
}

function getNotificationEvent(table: string): NotificationEvent | null {
  switch (table) {
    case "jobOperationNote":
      return NotificationEvent.JobOperationMessage;
    default:
      return null;
  }
}
