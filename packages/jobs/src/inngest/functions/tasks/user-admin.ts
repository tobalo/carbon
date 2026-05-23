import type { Result } from "@carbon/auth";
import { getCarbonServiceClient } from "@carbon/auth/client.server";
import { deactivateUser } from "@carbon/auth/users.server";
import { InviteEmail } from "@carbon/documents/email";
import { CarbonEdition, getAppUrl, RESEND_DOMAIN } from "@carbon/env";
import { sendEmail } from "@carbon/lib/resend.server";
import { updateSubscriptionQuantityForCompany } from "@carbon/stripe/stripe.server";
import { Edition } from "@carbon/utils";
import { render } from "@react-email/components";
import { nanoid } from "nanoid";
import { inngest } from "../../client";

export const userAdminFunction = inngest.createFunction(
  { id: "user-admin", retries: 3 },
  { event: "carbon/user-admin" },
  async ({ event, step }) => {
    const serviceClient = getCarbonServiceClient();
    const payload = event.data;

    const result = await step.run("user-admin-action", async () => {
      console.log(`User admin update ${payload.type} for ${payload.id}`);

      let result: Result = { success: false, message: "Unknown action" };

      switch (payload.type) {
        case "deactivate":
          console.log(`Deactivating ${payload.id}`);
          result = await deactivateUser(
            serviceClient,
            payload.id,
            payload.companyId
          );
          if (result.success && CarbonEdition === Edition.Cloud) {
            await updateSubscriptionQuantityForCompany(payload.companyId);
          }
          break;
        case "resend":
          const { id: userId, companyId, location, ip } = payload;
          console.log(`Resending invite for ${payload.id}`);
          const [company, user] = await Promise.all([
            serviceClient
              .from("company")
              .select("name")
              .eq("id", companyId)
              .single(),
            serviceClient
              .from("user")
              .select("email, fullName")
              .eq("id", userId)
              .single()
          ]);

          if (!company.data || !user.data) {
            throw new Error("Failed to load company or user");
          }

          const existingInvite = await serviceClient
            .from("invite")
            .select("createdBy")
            .eq("email", user.data.email)
            .eq("companyId", companyId)
            .is("acceptedAt", null)
            .is("revokedAt", null)
            .maybeSingle();

          if (existingInvite.error || !existingInvite.data) {
            return {
              success: false,
              message: "No invite record found for user"
            };
          }

          const newCode = nanoid();
          const refreshed = await serviceClient
            .from("invite")
            .update({ code: newCode })
            .eq("email", user.data.email)
            .eq("companyId", companyId)
            .is("acceptedAt", null)
            .is("revokedAt", null)
            .select("code")
            .single();

          if (refreshed.error || !refreshed.data) {
            return {
              success: false,
              message: "Failed to refresh invite"
            };
          }

          const inviter = await serviceClient
            .from("user")
            .select("email, fullName")
            .eq("id", existingInvite.data.createdBy)
            .single();

          await sendEmail({
            from: `Carbon <no-reply@${RESEND_DOMAIN}>`,
            to: user.data.email,
            subject: `You have been invited to join ${company.data?.name} on Carbon`,
            headers: {
              "X-Entity-Ref-ID": nanoid()
            },
            html: await render(
              InviteEmail({
                invitedByEmail: inviter.data?.email ?? user.data.email,
                invitedByName: inviter.data?.fullName ?? "",
                email: user.data.email,
                name: user.data.fullName ?? "",
                companyName: company.data.name,
                inviteLink: `${getAppUrl()}/invite/${refreshed.data.code}`,
                ip,
                location
              })
            )
          });

          result = {
            success: true,
            message: `Successfully resent invite for ${payload.id}`
          };
          break;
      }

      if (result.success) {
        console.log(`Success ${payload.id}`);
      } else {
        console.error(
          `Admin action ${payload.type} failed for ${payload.id}: ${result.message}`
        );
      }

      return result;
    });

    return result;
  }
);
