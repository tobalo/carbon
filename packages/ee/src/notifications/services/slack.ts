import type { DatabaseQueryClient } from "@carbon/database/query-client";
import {
  createIssueSlackThread,
  syncIssueAssignmentToSlack,
  syncIssueStatusToSlack,
  syncIssueTaskToSlack
} from "../../slack/lib/service";
import type { NotificationEvent, NotificationService } from "../types";

export class SlackNotificationService implements NotificationService {
  id = "slack";
  name = "Slack";

  async send(
    event: NotificationEvent,
    context: { serviceClient: DatabaseQueryClient }
  ): Promise<void> {
    switch (event.type) {
      case "issue.created":
        await createIssueSlackThread(context.serviceClient, {
          carbonUrl: event.carbonUrl,
          companyId: event.companyId,
          description: event.data.description,
          id: event.data.id,
          nonConformanceId: event.data.nonConformanceId,
          severity: event.data.severity,
          title: event.data.title,
          userId: event.userId
        });
        break;

      case "issue.status.changed":
        await syncIssueStatusToSlack(context.serviceClient, {
          companyId: event.companyId,
          nonConformanceId: event.data.nonConformanceId,
          newStatus: event.data.status,
          previousStatus: "", // We'll need to get this from the event data if needed
          userId: event.userId
        });
        break;

      case "task.status.changed":
        await syncIssueTaskToSlack(context.serviceClient, {
          companyId: event.companyId,
          id: event.data.id,
          status: event.data.status,
          // @ts-expect-error - it's cool
          taskType: event.data.type,
          userId: event.userId
        });
        break;

      case "task.assigned":
        await syncIssueAssignmentToSlack(context.serviceClient, {
          nonConformanceId: event.data.id,
          companyId: event.companyId,
          userId: event.userId,
          newAssignee: event.data.assignee
        });
        break;

      default:
        // Unknown event type, skip
        break;
    }
  }
}
