import { assertIsPost } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import type { TableInsert } from "@carbon/database/schema";
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId } = await requirePermissions(request, {});

  const payload = await request.json();
  let insertedSteps: TableInsert<"jobOperationStep">[] =
    [];
  if (Array.isArray(payload)) {
    insertedSteps = payload.filter((step) => step.companyId === companyId);
    if (insertedSteps.length > 0) {
      const result = await client
        .from("jobOperationStep")
        .insert(insertedSteps);
      if (result.error) {
        return data(
          { success: false, message: result.error.message },
          { status: 400 }
        );
      }

      return { success: true };
    } else {
      return { success: true };
    }
  } else {
    return data(
      { success: false, message: "Payload is not an array" },
      { status: 400 }
    );
  }
}
