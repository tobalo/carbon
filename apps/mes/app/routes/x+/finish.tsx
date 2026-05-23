import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import type { ActionFunctionArgs } from "react-router";
import { data, redirect } from "react-router";
import { finishValidator } from "~/services/models";
import { finishJobOperation } from "~/services/operations.service";
import { path } from "~/utils/path";

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, userId, companyId } = await requirePermissions(request, {});

  const formData = await request.formData();
  const validation = await validator(finishValidator).validate(formData);

  if (validation.error) {
    return validationError(validation.error);
  }

  const finishOperation = await finishJobOperation(client, {
    ...validation.data,
    userId,
    companyId
  });

  if (finishOperation.error) {
    return data(
      {},
      await flash(
        request,
        error(finishOperation.error, "Failed to finish operation")
      )
    );
  }

  throw redirect(
    path.to.operations,
    await flash(request, success("Operation finished successfully"))
  );
}
