import { error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { invokeCarbonServiceFunction } from "@carbon/auth/client.server";
import { flash } from "@carbon/auth/session.server";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { path } from "~/utils/path";

export async function action({ request }: ActionFunctionArgs) {
  const { companyId, userId } = await requirePermissions(request, {
    create: "accounting"
  });

  const journalEntry = await invokeCarbonServiceFunction<{
    id: string;
  }>("create", {
    body: {
      type: "journalEntry",
      companyId,
      userId
    }
  });

  if (!journalEntry.data || journalEntry.error) {
    console.error(journalEntry.error);
    throw redirect(
      path.to.accountingJournals,
      await flash(
        request,
        error(journalEntry.error, "Failed to create journal entry")
      )
    );
  }

  throw redirect(path.to.journalEntryDetails(String(journalEntry.data.id)));
}
