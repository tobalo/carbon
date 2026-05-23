import { requirePermissions } from "@carbon/auth/auth.server";
import { getUserClaims } from "@carbon/auth/users.server";
import type { LoaderFunctionArgs } from "react-router";

// Map entity types to the permission module required to view them
const entityPermissionMap: Record<string, string> = {
  employee: "resources",
  customer: "sales",
  supplier: "purchasing",
  issue: "quality",
  gauge: "quality",
  item: "parts",
  job: "production",
  purchaseOrder: "purchasing",
  salesInvoice: "invoicing",
  purchaseInvoice: "invoicing",
  quote: "sales",
  salesRfq: "sales",
  salesOrder: "sales",
  supplierQuote: "purchasing"
};

export type SearchResult = {
  id: number;
  entityType: string;
  entityId: string;
  title: string;
  description: string | null;
  link: string;
  tags: string[];
  metadata: Record<string, unknown>;
};

export type SearchResponse = {
  results: SearchResult[];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {});

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();
  const typeFilter = url.searchParams.get("type")?.trim();

  if (!query || query.length < 2) {
    return Response.json({ results: [] } satisfies SearchResponse);
  }

  // Get user's permissions to filter which entity types they can see
  const claims = await getUserClaims(userId, companyId);

  // Determine which entity types the user has permission to view
  let allowedEntityTypes = Object.entries(entityPermissionMap)
    .filter(([_, permissionModule]) => {
      const permission = claims.permissions[permissionModule];
      if (!permission) return false;
      // Check if user has view permission for this company
      return (
        permission.view.includes("0") || permission.view.includes(companyId)
      );
    })
    .map(([entityType]) => entityType);

  // Apply type filter if provided
  if (typeFilter && typeFilter !== "all") {
    allowedEntityTypes = allowedEntityTypes.filter((t) => t === typeFilter);
  }

  if (allowedEntityTypes.length === 0) {
    return Response.json({ results: [] } satisfies SearchResponse);
  }

  try {
    const { data, error } = await client.rpc("search_company_index", {
      p_company_id: companyId,
      p_query: query,
      p_entity_types: allowedEntityTypes,
      p_limit: 20
    });

    if (error) {
      console.error("Search error:", error);
      return Response.json({ results: [] } satisfies SearchResponse);
    }

    return Response.json({
      results: (data ?? []) as SearchResult[]
    } satisfies SearchResponse);
  } catch (err) {
    console.error("Search error:", err);
    return Response.json({ results: [] } satisfies SearchResponse);
  }
}
