import { requirePermissions } from "@carbon/auth/auth.server";
import { getCarbonServiceRole } from "@carbon/auth/client.server";
import { validator } from "@carbon/form";
import { getSlackClient } from "@carbon/lib/slack.server";
import { createSignedDownloadUrl } from "@carbon/object-storage/server";
import type { ActionFunctionArgs } from "react-router";
import { feedbackValidator } from "~/services/models";

const getFeedbackAttachmentUrl = async (attachmentPath?: string) => {
  if (!attachmentPath) return "None";

  try {
    return await createSignedDownloadUrl({
      bucket: "feedback",
      key: attachmentPath
    });
  } catch (error) {
    console.error("Failed to create feedback attachment URL", error);
    return "Attachment uploaded but URL generation failed";
  }
};

export async function action({ request }: ActionFunctionArgs) {
  const { userId, companyId } = await requirePermissions(request, {});

  const formData = await request.formData();
  const validation = await validator(feedbackValidator).validate(formData);

  if (validation.error) {
    return {
      success: false,
      message: "Failed to submit feedback"
    };
  }

  const { attachmentPath, feedback, location } = validation.data;
  const serviceRole = await getCarbonServiceRole();
  const slackClient = getSlackClient();

  const [company, user, insertFeedback] = await Promise.all([
    serviceRole
      .from("company")
      .select("slackChannel")
      .eq("id", companyId)
      .single(),
    serviceRole
      .from("user")
      .select("firstName,lastName,email")
      .eq("id", userId)
      .single(),
    serviceRole.from("feedback").insert([
      {
        feedback,
        location,
        attachmentPath: attachmentPath ? `feedback/${attachmentPath}` : null,
        userId
      }
    ])
  ]);

  if (insertFeedback.error) {
    return {
      success: false,
      message: "Failed to submit feedback"
    };
  }

  const attachmentUrl = await getFeedbackAttachmentUrl(attachmentPath);

  let channel = "#feedback";
  if (company.data?.slackChannel) {
    channel = company.data.slackChannel;
    if (!channel.startsWith("#")) {
      channel = `#${channel}`;
    }
  }

  await slackClient.sendMessage({
    channel,
    text: `New feedback submitted`,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `New feedback submitted` }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Location:*\n${location}` },
          { type: "mrkdwn", text: `*Feedback:*\n${feedback}` },
          {
            type: "mrkdwn",
            text: `*User:*\n${user.data?.firstName ?? ""} ${
              user.data?.lastName ?? ""
            } <${user.data?.email ?? ""}>`
          },
          {
            type: "mrkdwn",
            text: `*Attachment:*\n${attachmentUrl}`
          }
        ]
      }
    ]
  });

  return { success: true, message: "Feedback submitted" };
}
