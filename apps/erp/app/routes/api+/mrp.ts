import { assertIsPost, notFound } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import type { ActionFunctionArgs } from "react-router";
import { runMRP } from "~/modules/production/production.service";

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);

  const url = new URL(request.url);
  const locationId = url.searchParams.get("location");

  const { client, companyId, userId } = await requirePermissions(request, {
    update: "inventory"
  });

  if (locationId) {
    const location = await client
      .from("location")
      .select("id")
      .eq("id", locationId)
      .eq("companyId", companyId)
      .maybeSingle();

    if (location.error || !location.data) {
      throw notFound("Location not found");
    }
  }

  const result = await runMRP(client, {
    type: locationId ? "location" : "company",
    id: locationId ?? companyId,
    companyId,
    userId
  });

  return result;
}
