import { invokeFunction } from "@carbon/auth/functions.server";
import { assertIsPost, error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { validator } from "@carbon/form";
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { procedureSyncValidator } from "~/modules/production";

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "production"
  });

  const formData = await request.formData();
  const validation = await validator(procedureSyncValidator).validate(formData);

  if (validation.error) {
    return data(
      { success: false },
      await flash(request, error(validation.error, "Invalid form data"))
    );
  }

  const operation = await client
    .from("jobOperation")
    .select("id")
    .eq("id", validation.data.operationId)
    .eq("companyId", companyId)
    .single();
  if (operation.error) {
    return data(
      { success: false },
      await flash(request, error(operation.error, "Operation not found"))
    );
  }

  const procedure = await client
    .from("procedure")
    .select("id")
    .eq("id", validation.data.procedureId)
    .eq("companyId", companyId)
    .single();
  if (procedure.error) {
    return data(
      { success: false },
      await flash(request, error(procedure.error, "Procedure not found"))
    );
  }

  const sync = await invokeFunction("get-method", {
    body: {
      type: "procedureToOperation",
      sourceId: validation.data.procedureId,
      targetId: validation.data.operationId,
      companyId,
      userId
    },
  });

  if (sync.error) {
    return data(
      { success: false },
      await flash(request, error(sync.error, "Failed to sync procedure"))
    );
  }

  return { success: true };
}
