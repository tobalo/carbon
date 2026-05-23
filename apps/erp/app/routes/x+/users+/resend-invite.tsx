import { error, getAppUrl, RESEND_DOMAIN, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { InviteEmail } from "@carbon/documents/email";
import { validationError, validator } from "@carbon/form";
import { batchTrigger } from "@carbon/jobs";
import { sendEmail } from "@carbon/lib/resend.server";
import { render } from "@react-email/components";
import { nanoid } from "nanoid";
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { resendInviteValidator } from "~/modules/users";

export async function action({ request }: ActionFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    create: "users"
  });

  const validation = await validator(resendInviteValidator).validate(
    await request.formData()
  );

  if (validation.error) {
    return validationError(validation.error);
  }

  const { users } = validation.data;

  if (users.length === 1) {
    const [userId] = users;
    const location = request.headers.get("x-vercel-ip-city") ?? "Unknown";
    const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1";
    const [company, user] = await Promise.all([
      client.from("company").select("name").eq("id", companyId).single(),
      client
        .from("user")
        .select("email, fullName")
        .eq("id", userId)
        .single()
    ]);

    if (!company.data || !user.data) {
      throw new Error("Failed to load company or user");
    }

    const existingInvite = await client
      .from("invite")
      .select("createdBy")
      .eq("email", user.data.email)
      .eq("companyId", companyId)
      .is("acceptedAt", null)
      .is("revokedAt", null)
      .maybeSingle();

    if (existingInvite.error || !existingInvite.data) {
      return data(
        {},
        await flash(
          request,
          error(existingInvite.error, "No invite record found for user")
        )
      );
    }

    const newCode = nanoid();
    const refreshed = await client
      .from("invite")
      .update({ code: newCode })
      .eq("email", user.data.email)
      .eq("companyId", companyId)
      .is("acceptedAt", null)
      .is("revokedAt", null)
      .select("code")
      .single();

    if (refreshed.error || !refreshed.data) {
      return data(
        {},
        await flash(request, error(refreshed.error, "Failed to refresh invite"))
      );
    }

    const inviter = await client
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

    return data(
      {},
      await flash(request, success("Successfully resent invite"))
    );
  } else {
    const location = request.headers.get("x-vercel-ip-city") ?? "Unknown";
    const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1";
    try {
      await batchTrigger(
        "user-admin",
        users.map((id) => ({
          payload: {
            id,
            type: "resend" as const,
            companyId,
            location,
            ip
          }
        }))
      );
      return data(
        {},
        await flash(request, success("Successfully added invites to queue"))
      );
    } catch (e) {
      return data(
        {},
        await flash(request, error(e, "Failed to reinvite users"))
      );
    }
  }
}
