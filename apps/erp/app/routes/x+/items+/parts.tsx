import { error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { VStack } from "@carbon/react";
import { msg } from "@lingui/core/macro";
import type { LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useLoaderData } from "react-router";
import { getParts } from "~/modules/items";
import { PartsTable } from "~/modules/items/ui/Parts";
import { getTagsList } from "~/modules/shared";
import type { Handle } from "~/utils/handle";
import { path } from "~/utils/path";
import { getGenericQueryFilters } from "~/utils/query";
import { usePollingRevalidation } from "../../../hooks";

export const handle: Handle = {
  breadcrumb: msg`Parts`,
  to: path.to.parts
};

export async function loader({ request }: LoaderFunctionArgs) {
  const auth = await requirePermissions(request, {
    view: "parts",
    bypassRls: true
  });
  const { client, companyId, role, supplierId: scopedSupplierId } = auth;

  const url = new URL(request.url);
  const searchParams = new URLSearchParams(url.search);
  const search = searchParams.get("search");
  if (role === "supplier" && !scopedSupplierId) {
    throw new Response("Supplier account is not scoped", { status: 403 });
  }
  const supplierId =
    role === "supplier" ? scopedSupplierId : searchParams.get("supplierId");

  const { limit, offset, sorts, filters } =
    getGenericQueryFilters(searchParams);

  const [parts, tags] = await Promise.all([
    getParts(client, companyId, {
      search,
      supplierId,
      limit,
      offset,
      sorts,
      filters
    }),
    getTagsList(client, companyId, "part")
  ]);

  if (parts.error) {
    redirect(
      path.to.authenticatedRoot,
      await flash(request, error(parts.error, "Failed to fetch parts"))
    );
  }

  return {
    count: parts.count ?? 0,
    parts: parts.data ?? [],
    tags: tags.data ?? []
  };
}

export default function PartsSearchRoute() {
  const { count, parts, tags } = useLoaderData<typeof loader>();

  usePollingRevalidation("part");

  return (
    <VStack spacing={0} className="h-full">
      <PartsTable data={parts} count={count} tags={tags} />
      <Outlet />
    </VStack>
  );
}
