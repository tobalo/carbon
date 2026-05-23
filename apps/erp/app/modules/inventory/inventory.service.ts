import type {
  Json,
  QueryDatabase,
  EnumValue,
  TableInsert,
  TableRow,
  TableUpdate,
  stockTransferStatusEnum
} from "@carbon/database/schema";
import { fetchAllFromTable } from "@carbon/database";
import { getLocalTimeZone, now, today } from "@internationalized/date";
import { listObjects, toStorageFileObject } from "@carbon/storage";
import type { QueryError, CarbonDatabaseClient } from "@carbon/database/query-client";
import { nanoid } from "nanoid";
import type { z } from "zod";
import type { StorageItem } from "~/types";
import type { GenericQueryFilters } from "~/utils/query";
import { setGenericQueryFilters } from "~/utils/query";
import { sanitize } from "@carbon/utils";
import { getItemStorageUnitQuantities } from "../items/items.service";
import type {
  batchPropertyOrderValidator,
  batchPropertyValidator,
  inventoryAdjustmentValidator,
  kanbanValidator,
  receiptValidator,
  shipmentValidator,
  shippingMethodValidator,
  stockTransferLineValidator,
  stockTransferValidator,
  storageTypeValidator,
  storageUnitValidator,
  warehouseTransferValidator
} from "./inventory.models";

export async function deleteBatchProperty(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("batchProperty").delete().eq("id", id);
}

export async function deleteKanban(
  client: CarbonDatabaseClient<QueryDatabase>,
  kanbanId: string
) {
  return client.from("kanban").delete().eq("id", kanbanId);
}

export async function deleteReceipt(
  client: CarbonDatabaseClient<QueryDatabase>,
  receiptId: string
) {
  return client.from("receipt").delete().eq("id", receiptId);
}

export async function deleteReceiptLine(
  client: CarbonDatabaseClient<QueryDatabase>,
  receiptLineId: string
) {
  return client.from("receiptLine").delete().eq("id", receiptLineId);
}

export async function deleteStorageUnit(
  client: CarbonDatabaseClient<QueryDatabase>,
  storageUnitId: string
) {
  return client.from("storageUnit").delete().eq("id", storageUnitId);
}

/**
 * Deletes a storage unit along with every descendant in its subtree.
 *
 * The `storageUnit_parentId_fkey` FK is `ON DELETE RESTRICT`, so you cannot
 * delete a parent while it still has children. Postgres evaluates FK
 * constraints at statement end, so deleting the whole subtree in a single
 * `WHERE id IN (...)` statement is safe - all referencing rows go away in
 * the same transaction.
 *
 * We fetch the subtree via `storageUnits_recursive` (which already returns
 * self + descendants thanks to `ancestorPath @> ARRAY[id]`).
 */
export async function deleteStorageUnitCascade(
  client: CarbonDatabaseClient<QueryDatabase>,
  storageUnitId: string
) {
  const descendants = await getStorageUnitDescendants(client, storageUnitId);
  if (descendants.error) return descendants;

  // storageUnits_recursive is a view, so every column is nominally nullable
  // in the generated types. Narrow `id` to a concrete string[] for
  // the query adapter `.in()` signature.
  const ids = (descendants.data ?? [])
    .map((row) => row.id)
    .filter((id): id is string => id != null);
  // Safety net: fall back to the single-row delete if the view returned
  // nothing (shouldn't happen — the self row is always in the subtree).
  if (ids.length === 0) {
    return client.from("storageUnit").delete().eq("id", storageUnitId);
  }

  return client.from("storageUnit").delete().in("id", ids);
}

export async function deleteShipment(
  client: CarbonDatabaseClient<QueryDatabase>,
  shipmentId: string
) {
  return client.from("shipment").delete().eq("id", shipmentId);
}

export async function deleteShipmentLine(
  client: CarbonDatabaseClient<QueryDatabase>,
  shipmentLineId: string
) {
  return client.from("shipmentLine").delete().eq("id", shipmentLineId);
}

export async function deleteShippingMethod(
  client: CarbonDatabaseClient<QueryDatabase>,
  shippingMethodId: string
) {
  return client
    .from("shippingMethod")
    .update({ active: false })
    .eq("id", shippingMethodId);
}

export async function deleteStockTransfer(
  client: CarbonDatabaseClient<QueryDatabase>,
  stockTransferId: string
) {
  return client.from("stockTransfer").delete().eq("id", stockTransferId);
}

export async function deleteStockTransferLine(
  client: CarbonDatabaseClient<QueryDatabase>,
  stockTransferLineId: string
) {
  return client
    .from("stockTransferLine")
    .delete()
    .eq("id", stockTransferLineId);
}

export async function deleteWarehouseTransfer(
  client: CarbonDatabaseClient<QueryDatabase>,
  transferId: string
) {
  return client.from("warehouseTransfer").delete().eq("id", transferId);
}

export async function deleteWarehouseTransferLine(
  client: CarbonDatabaseClient<QueryDatabase>,
  transferLineId: string
) {
  return client.from("warehouseTransferLine").delete().eq("id", transferLineId);
}

export async function getItemLedgerPage(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string,
  locationId: string,
  sortDescending: boolean = false,
  page: number = 1
) {
  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  let query = client
    .from("itemLedger")
    .select("*", { count: "exact" })
    .eq("itemId", itemId)
    .eq("companyId", companyId)
    .eq("locationId", locationId)
    .order("createdAt", { ascending: !sortDescending })
    .range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    return { error };
  }

  const storageUnitIds = Array.from(
    new Set((data ?? []).map((row) => row.storageUnitId).filter(Boolean))
  );
  const storageUnits =
    storageUnitIds.length > 0
      ? await client
          .from("storageUnit")
          .select("id, name")
          .in("id", storageUnitIds)
          .eq("companyId", companyId)
      : { data: [], error: null };

  if (storageUnits.error) {
    return { error: storageUnits.error };
  }

  const storageUnitsById = new Map(
    (storageUnits.data ?? []).map((storageUnit) => [
      storageUnit.id,
      storageUnit
    ])
  );

  return {
    data: (data ?? []).map((row) => ({
      ...row,
      storageUnit: storageUnitsById.get(row.storageUnitId) ?? null
    })),
    count,
    page,
    pageSize,
    hasMore: typeof count === "number" && offset + pageSize < count
  };
}

export async function getBatchProperties(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemIds: string[],
  companyId: string
) {
  return client
    .from("batchProperty")
    .select("*")
    .in("itemId", itemIds)
    .eq("companyId", companyId)
    .order("sortOrder");
}

export async function getInventoryItems(
  client: CarbonDatabaseClient<QueryDatabase>,
  locationId: string,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client.rpc(
    "get_inventory_quantities",
    {
      location_id: locationId,
      company_id: companyId
    },
    {
      count: "exact"
    }
  );

  if (args?.search) {
    query = query.or(
      `name.ilike.%${args.search}%,readableIdWithRevision.ilike.%${args.search}%`
    );
  }

  query = setGenericQueryFilters(query, args, [
    { column: "readableIdWithRevision", ascending: true }
  ]);

  return query;
}

export async function getInventoryItemsCount(
  client: CarbonDatabaseClient<QueryDatabase>,
  locationId: string,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client
    .from("item")
    .select("id", {
      count: "exact"
    })
    .neq("itemTrackingType", "Non-Inventory")
    .eq("companyId", companyId);

  if (args?.search) {
    query = query.or(
      `name.ilike.%${args.search}%,readableIdWithRevision.ilike.%${args.search}%`
    );
  }

  query = setGenericQueryFilters(query, args);

  return query;
}

export async function getKanbans(
  client: CarbonDatabaseClient<QueryDatabase>,
  locationId: string,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client
    .from("kanbans")
    .select("*", {
      count: "exact"
    })
    .eq("companyId", companyId)
    .eq("locationId", locationId);

  if (args.search) {
    query = query.or(
      `name.ilike.%${args.search}%,readableIdWithRevision.ilike.%${args.search}%`
    );
  }

  query = setGenericQueryFilters(query, args, [
    { column: "readableIdWithRevision", ascending: true }
  ]);
  return query;
}

export async function getKanban(
  client: CarbonDatabaseClient<QueryDatabase>,
  kanbanId: string
) {
  return client.from("kanbans").select("*").eq("id", kanbanId).single();
}

export async function getStockTransfer(
  client: CarbonDatabaseClient<QueryDatabase>,
  stockTransferId: string
) {
  return client
    .from("stockTransfer")
    .select("*")
    .eq("id", stockTransferId)
    .single();
}

export async function getStockTransferLine(
  client: CarbonDatabaseClient<QueryDatabase>,
  stockTransferLineId: string
) {
  return client
    .from("stockTransferLines")
    .select("*")
    .eq("id", stockTransferLineId)
    .single();
}

export async function getStockTransferLines(
  client: CarbonDatabaseClient<QueryDatabase>,
  stockTransferId: string
) {
  return client
    .from("stockTransferLines")
    .select("*")
    .eq("stockTransferId", stockTransferId)
    .order("itemReadableId", { ascending: true })
    .order("createdAt", { ascending: true });
}

export async function getStockTransferTracking(
  client: CarbonDatabaseClient<QueryDatabase>,
  stockTransferId: string,
  companyId: string
) {
  const activities = await client
    .from("trackedActivity")
    .select("id, attributes")
    .eq("sourceDocument", "Stock Transfer")
    .eq("sourceDocumentId", stockTransferId)
    .eq("companyId", companyId);

  if (activities.error || !activities.data) return activities;

  const activityIds = activities.data.map((activity) => activity.id);
  const inputs =
    activityIds.length > 0
      ? await client
          .from("trackedActivityInput")
          .select("trackedActivityId, trackedEntityId")
          .in("trackedActivityId", activityIds)
          .eq("companyId", companyId)
      : { data: [], error: null };

  if (inputs.error) {
    return { ...activities, data: [], error: inputs.error };
  }

  const inputsByActivityId = new Map<string, any[]>();
  (inputs.data ?? []).forEach((input) => {
    const activityInputs = inputsByActivityId.get(input.trackedActivityId) ?? [];
    activityInputs.push({ trackedEntityId: input.trackedEntityId });
    inputsByActivityId.set(input.trackedActivityId, activityInputs);
  });

  return {
    ...activities,
    data: activities.data.map((activity) => ({
      attributes: activity.attributes,
      trackedActivityInput: inputsByActivityId.get(activity.id) ?? []
    }))
  };
}

export async function getStockTransfers(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
    locationId: string | null;
  }
) {
  let query = client
    .from("stockTransfer")
    .select("*", {
      count: "exact"
    })
    .eq("companyId", companyId);

  if (args.search) {
    query = query.ilike("stockTransferId", `%${args.search}%`);
  }

  if (args.locationId) {
    query = query.eq("locationId", args.locationId);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "stockTransferId", ascending: false }
  ]);
  return query;
}

export async function getDefaultStorageUnitOrStorageUnitWithHighestQuantity(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  locationId: string,
  companyId: string
) {
  const pickMethod = await client
    .from("pickMethod")
    .select("defaultStorageUnitId")
    .eq("itemId", itemId)
    .eq("locationId", locationId)
    .eq("companyId", companyId)
    .maybeSingle();

  if (pickMethod.data?.defaultStorageUnitId)
    return pickMethod.data.defaultStorageUnitId;

  const storageUnits = await getItemStorageUnitQuantities(
    client,
    itemId,
    companyId,
    locationId
  );

  const storageUnitWithHighestQuantity = storageUnits.data?.reduce(
    (acc: any, curr: any) => {
      return acc.quantity > curr.quantity
        ? acc
        : { ...curr, quantity: acc.quantity, storageUnitId: acc.storageUnitId };
    },
    { quantity: 0, storageUnitId: null }
  );

  return storageUnitWithHighestQuantity?.storageUnitId ?? null;
}

export async function getReceipts(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client
    .from("receipt")
    .select("*", {
      count: "exact"
    })
    .eq("companyId", companyId)
    .neq("sourceDocumentId", "");

  if (args.search) {
    query = query.or(
      `receiptId.ilike.%${args.search}%,sourceDocumentReadableId.ilike.%${args.search}%`
    );
  }

  query = setGenericQueryFilters(query, args, [
    { column: "receiptId", ascending: false }
  ]);
  return query;
}

export async function getReceipt(
  client: CarbonDatabaseClient<QueryDatabase>,
  receiptId: string
) {
  return client.from("receipt").select("*").eq("id", receiptId).single();
}

export async function getReceiptLines(
  client: CarbonDatabaseClient<QueryDatabase>,
  receiptId: string
) {
  return client.from("receiptLines").select("*").eq("receiptId", receiptId);
}

export async function getReceiptTracking(
  client: CarbonDatabaseClient<QueryDatabase>,
  receiptId: string,
  companyId: string
) {
  return client
    .from("trackedEntity")
    .select("*")
    .eq("attributes ->> Receipt", receiptId)
    .eq("companyId", companyId);
}

export async function getReceiptLineTracking(
  client: CarbonDatabaseClient<QueryDatabase>,
  receiptLineId: string,
  companyId: string
) {
  return client
    .from("trackedEntity")
    .select("*")
    .eq("attributes ->> Receipt Line", receiptLineId)
    .eq("companyId", companyId);
}

export async function getReceiptFiles(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  lineIds: string[]
): Promise<{ data: StorageItem[]; error: string | null }> {
  const promises = lineIds.map(async (lineId) => {
    try {
      const objects = await listObjects({
        companyId,
        prefix: `${companyId}/inventory/${lineId}`
      });
      return {
        data: objects.map((object) => toStorageFileObject(object, "private")),
        error: null,
        lineId
      };
    } catch (error) {
      return {
        data: [],
        error,
        lineId
      };
    }
  });

  const results = await Promise.all(promises);

  // Check for errors
  const firstError = results.find((result) => result.error);
  if (firstError) {
    return {
      data: [],
      error:
        firstError.error instanceof Error
          ? firstError.error.message
          : "Failed to fetch files"
    };
  }

  // Merge data arrays and add lineId as bucketName
  return {
    data: results.flatMap((result) =>
      (result.data ?? []).map((file) => ({
        ...file,
        bucket: result.lineId
      }))
    ),
    error: null
  };
}

export async function getSerialNumbersForItem(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: {
    itemId: string;
    companyId: string;
  }
) {
  let query = client
    .from("trackedEntity")
    .select("*")
    .eq("sourceDocument", "Item")
    .eq("sourceDocumentId", args.itemId)
    .eq("companyId", args.companyId)
    .eq("quantity", 1);

  return query;
}

export async function getBatchNumbersForItem(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: {
    itemId: string;
    companyId: string;
    isReadOnly?: boolean;
  }
) {
  return client
    .from("trackedEntity")
    .select("*")
    .eq("sourceDocument", "Item")
    .eq("sourceDocumentId", args.itemId)
    .eq("companyId", args.companyId)
    .gte("quantity", 1);
}

export async function getStorageUnitsList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return fetchAllFromTable<{
    id: string;
    name: string;
  }>(client, "storageUnit", "id, name", (query) =>
    query.eq("active", true).eq("companyId", companyId).order("name")
  );
}

export async function getStorageUnitsListForLocation(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  locationId: string
) {
  return fetchAllFromTable<{
    id: string;
    name: string;
  }>(client, "storageUnit", "id, name", (query) =>
    query
      .eq("active", true)
      .eq("companyId", companyId)
      .eq("locationId", locationId)
      .order("name")
  );
}

// Tree shape from storageUnits_recursive view: each row has its 1-based depth
// and the full ancestorPath (root → node ids). Sort by ancestorPath so the
// caller can render a flat list that visually nests by depth.
export async function getStorageUnitsTreeForLocation(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  locationId: string
) {
  return fetchAllFromTable<{
    id: string;
    name: string;
    parentId: string | null;
    depth: number;
    ancestorPath: string[];
  }>(
    client,
    "storageUnits_recursive",
    "id, name, parentId, depth, ancestorPath",
    (query) =>
      query
        .eq("active", true)
        .eq("companyId", companyId)
        .eq("locationId", locationId)
  );
}

export async function getStorageUnits(
  client: CarbonDatabaseClient<QueryDatabase>,
  locationId: string,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  // Query the recursive view so the table gets depth + ancestorPath + parentId
  // for tree rendering (indentation, hierarchy filters, subtree rollups).
  let query = client
    .from("storageUnits_recursive")
    .select("*", { count: "exact" })
    .eq("companyId", companyId)
    .eq("locationId", locationId);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  // Default ordering: breadth-first by ancestorPath so parents render before
  // children in the table. Caller-supplied sorts override when provided.
  query = setGenericQueryFilters(query, args, [
    { column: "ancestorPath", ascending: true }
  ]);

  return query;
}

export async function getStorageUnit(
  client: CarbonDatabaseClient<QueryDatabase>,
  storageUnitId: string
) {
  return client
    .from("storageUnit")
    .select("*")
    .eq("id", storageUnitId)
    .single();
}

// Roots only (depth = 1). Honors search/filter/pagination so the table can
// paginate top-level storage units while children load lazily on demand.
export async function getStorageUnitRoots(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  locationId: string,
  args: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("storageUnits_recursive")
    .select("*", { count: "exact" })
    .eq("companyId", companyId)
    .eq("locationId", locationId)
    .eq("depth", 1);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "name", ascending: true }
  ]);

  return query;
}

// Immediate children of a single parent (one level deep). Used by the lazy
// expand handler in the StorageUnits table.
export async function getStorageUnitChildren(
  client: CarbonDatabaseClient<QueryDatabase>,
  parentId: string
) {
  return client
    .from("storageUnits_recursive")
    .select("*")
    .eq("parentId", parentId)
    .order("name");
}

// Set of storageUnit ids that have at least one child in the given location.
// Drives whether the table renders an expand chevron on a row.
export async function getStorageUnitParentIdsWithChildren(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  locationId: string
) {
  const { data, error } = await client
    .from("storageUnit")
    .select("parentId")
    .eq("companyId", companyId)
    .eq("locationId", locationId)
    .not("parentId", "is", null);

  if (error) return { data: [] as string[], error };

  const ids = new Set<string>();
  for (const row of data ?? []) {
    if (row.parentId) ids.add(row.parentId);
  }
  return { data: Array.from(ids), error: null };
}

// Search-mode payload: every storage unit whose name matches `search` PLUS
// every ancestor of each match, so the tree path renders intact. Returns the
// flat ordered row set + the parentIds that should be pre-expanded so that
// matches are visible to the user.
export async function searchStorageUnitsWithAncestors(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  locationId: string,
  search: string
) {
  const matches = await client
    .from("storageUnits_recursive")
    .select("id, parentId, ancestorPath")
    .eq("companyId", companyId)
    .eq("locationId", locationId)
    .ilike("name", `%${search}%`);

  if (matches.error)
    return { rows: [], expandedParentIds: [], error: matches.error };

  const idsToFetch = new Set<string>();
  const expanded = new Set<string>();
  for (const row of matches.data ?? []) {
    for (const ancestorId of row.ancestorPath ?? []) {
      idsToFetch.add(ancestorId);
    }
    // Pre-expand every node on the chain except the match itself, so the
    // match becomes visible. ancestorPath includes the node itself at the end.
    for (const ancestorId of (row.ancestorPath ?? []).slice(0, -1)) {
      expanded.add(ancestorId);
    }
  }

  if (idsToFetch.size === 0) {
    return { rows: [], expandedParentIds: [], error: null };
  }

  const rows = await client
    .from("storageUnits_recursive")
    .select("*")
    .eq("companyId", companyId)
    .eq("locationId", locationId)
    .in("id", Array.from(idsToFetch))
    .order("ancestorPath");

  if (rows.error) return { rows: [], expandedParentIds: [], error: rows.error };

  return {
    rows: rows.data ?? [],
    expandedParentIds: Array.from(expanded),
    error: null
  };
}

export async function getShipments(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client
    .from("shipment")
    .select("*", {
      count: "exact"
    })
    .eq("companyId", companyId)
    .neq("sourceDocumentId", "");

  if (args.search) {
    query = query.or(
      `shipmentId.ilike.%${args.search}%,sourceDocumentReadableId.ilike.%${args.search}%`
    );
  }

  query = setGenericQueryFilters(query, args, [
    { column: "shipmentId", ascending: false }
  ]);
  return query;
}

export async function getShipment(
  client: CarbonDatabaseClient<QueryDatabase>,
  shipmentId: string,
  companyId?: string
) {
  let query = client.from("shipment").select("*").eq("id", shipmentId);
  if (companyId) query = query.eq("companyId", companyId);
  return query.single();
}

export async function getShipmentLines(
  client: CarbonDatabaseClient<QueryDatabase>,
  shipmentId: string,
  companyId: string
) {
  const shipmentLines = await client
    .from("shipmentLines")
    .select("*")
    .eq("shipmentId", shipmentId)
    .eq("companyId", companyId);

  if (shipmentLines.error || !shipmentLines.data) return shipmentLines;

  const fulfillmentIds = Array.from(
    new Set(
      shipmentLines.data.map((line) => line.fulfillmentId).filter(Boolean)
    )
  );
  const fulfillments =
    fulfillmentIds.length > 0
      ? await client
          .from("fulfillment")
          .select("*")
          .in("id", fulfillmentIds)
          .eq("companyId", companyId)
      : { data: [], error: null };

  if (fulfillments.error) {
    return { ...shipmentLines, data: [], error: fulfillments.error };
  }

  const jobIds = Array.from(
    new Set(
      (fulfillments.data ?? [])
        .map((fulfillment) => fulfillment.jobId)
        .filter(Boolean)
    )
  );
  const jobs =
    jobIds.length > 0
      ? await client
          .from("job")
          .select("*")
          .in("id", jobIds)
          .eq("companyId", companyId)
      : { data: [], error: null };

  if (jobs.error) {
    return { ...shipmentLines, data: [], error: jobs.error };
  }

  const jobsById = new Map((jobs.data ?? []).map((job) => [job.id, job]));
  const fulfillmentsById = new Map(
    (fulfillments.data ?? []).map((fulfillment) => [
      fulfillment.id,
      {
        ...fulfillment,
        job: fulfillment.jobId ? jobsById.get(fulfillment.jobId) ?? null : null
      }
    ])
  );

  return {
    ...shipmentLines,
    data: shipmentLines.data.map((line) => ({
      ...line,
      fulfillment: line.fulfillmentId
        ? fulfillmentsById.get(line.fulfillmentId) ?? null
        : null
    }))
  };
}

export async function getShipmentLinesWithDetails(
  client: CarbonDatabaseClient<QueryDatabase>,
  shipmentId: string,
  companyId?: string
) {
  let query = client
    .from("shipmentLines")
    .select("*")
    .eq("shipmentId", shipmentId);
  if (companyId) query = query.eq("companyId", companyId);
  return query;
}

export async function getShipmentFiles(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  lineIds: string[]
): Promise<{ data: StorageItem[]; error: string | null }> {
  const promises = lineIds.map(async (lineId) => {
    try {
      const objects = await listObjects({
        companyId,
        prefix: `${companyId}/inventory/${lineId}`
      });
      return {
        data: objects.map((object) => toStorageFileObject(object, "private")),
        error: null,
        lineId
      };
    } catch (error) {
      return {
        data: [],
        error,
        lineId
      };
    }
  });

  const results = await Promise.all(promises);

  // Check for errors
  const firstError = results.find((result) => result.error);
  if (firstError) {
    return {
      data: [],
      error:
        firstError.error instanceof Error
          ? firstError.error.message
          : "Failed to fetch files"
    };
  }

  // Merge data arrays and add lineId as bucketName
  return {
    data: results.flatMap((result) =>
      (result.data ?? []).map((file) => ({
        ...file,
        bucket: result.lineId
      }))
    ),
    error: null
  };
}

export async function getShipmentRelatedItems(
  client: CarbonDatabaseClient<QueryDatabase>,
  shipmentId: string,
  sourceDocumentId: string
) {
  const salesOrder = await client
    .from("salesOrder")
    .select("*")
    .eq("id", sourceDocumentId)
    .single();

  const invoices = await client
    .from("salesInvoice")
    .select("*")
    .or(
      `shipmentId.eq.${shipmentId},opportunityId.eq.${
        salesOrder.data?.opportunityId ?? ""
      }`
    );

  return {
    invoices: invoices.data ?? []
  };
}

export async function getShipmentTracking(
  client: CarbonDatabaseClient<QueryDatabase>,
  shipmentId: string,
  companyId: string
) {
  return client
    .from("trackedEntity")
    .select("*")
    .eq("attributes ->> Shipment", shipmentId)
    .eq("companyId", companyId);
}

export async function getShipmentLineTracking(
  client: CarbonDatabaseClient<QueryDatabase>,
  shipmentLineId: string,
  companyId: string
) {
  return client
    .from("trackedEntity")
    .select("*")
    .eq("attributes ->> Shipment Line", shipmentLineId)
    .eq("companyId", companyId);
}

export async function getShippingMethod(
  client: CarbonDatabaseClient<QueryDatabase>,
  shippingMethodId: string,
  companyId?: string
) {
  let query = client
    .from("shippingMethod")
    .select("*")
    .eq("id", shippingMethodId);
  if (companyId) query = query.eq("companyId", companyId);
  return query.single();
}

export async function getShippingMethods(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client
    .from("shippingMethod")
    .select("*", {
      count: "exact"
    })
    .eq("companyId", companyId)
    .eq("active", true);

  if (args.search) {
    query = query.or(
      `name.ilike.%${args.search}%,carrier.ilike.%${args.search}%`
    );
  }

  query = setGenericQueryFilters(query, args, [
    { column: "name", ascending: true }
  ]);
  return query;
}

export async function getShippingMethodsList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("shippingMethod")
    .select("id, name")
    .eq("companyId", companyId)
    .eq("active", true)
    .order("name", { ascending: true });
}

export async function getShippingTermsList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("shippingTerm")
    .select("id, name")
    .eq("companyId", companyId)
    .eq("active", true)
    .order("name", { ascending: true });
}

export async function getTrackedEntities(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client
    .from("trackedEntity")
    .select("*", {
      count: "exact"
    })
    .eq("companyId", companyId)
    .neq("status", "Reserved");

  if (args.search) {
    query = query.or(
      `id.ilike.%${args.search}%,sourceDocumentReadableId.ilike.%${args.search}%,readableId.ilike.%${args.search}%`
    );
  }

  query = setGenericQueryFilters(query, args, [
    { column: "sourceDocumentReadableId", ascending: true }
  ]);
  return query;
}

export async function getTrackedEntitiesByMakeMethodId(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobMakeMethodId: string
) {
  return client
    .from("trackedEntity")
    .select("*")
    .eq("attributes->>Job Make Method", jobMakeMethodId)
    .order("createdAt", { ascending: true });
}

export async function getTrackedEntity(
  client: CarbonDatabaseClient<QueryDatabase>,
  trackedEntityId: string
) {
  return client
    .from("trackedEntity")
    .select("*")
    .eq("id", trackedEntityId)
    .single();
}

/**
 * Manual override of a tracked entity's expirationDate. Records the prior
 * value, the new value, and a reason on the entity's `attributes` JSONB
 * under the "expiryOverrides" array so the trace popover can show the
 * provenance later.
 *
 *   attributes.expiryOverrides = [
 *     {
 *       previous: "2026-04-25" | null,
 *       next:     "2026-05-10",
 *       reason:   "Re-tested and re-certified by QC",
 *       userId,
 *       at:       "2026-04-26T10:11:12Z"
 *     },
 *     ...
 *   ]
 */
export async function updateTrackedEntityExpiry(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: {
    trackedEntityId: string;
    expirationDate: string | null;
    reason: string;
    userId: string;
    source?: string;
  }
) {
  const existing = await client
    .from("trackedEntity")
    .select("expirationDate, attributes, status")
    .eq("id", args.trackedEntityId)
    .single();
  if (existing.error) return existing;

  if (existing.data?.status === "Consumed") {
    return {
      data: null,
      error: {
        message: "Cannot edit expiry of a consumed tracked entity"
      } as unknown as QueryError
    };
  }

  const prevAttrs =
    (existing.data?.attributes as Record<string, unknown> | null) ?? {};
  const prevHistory = Array.isArray(prevAttrs.expiryOverrides)
    ? (prevAttrs.expiryOverrides as Record<string, unknown>[])
    : [];

  const nextAttrs = {
    ...prevAttrs,
    expiryOverrides: [
      ...prevHistory,
      {
        previous: existing.data?.expirationDate ?? null,
        next: args.expirationDate,
        reason: args.reason,
        source: args.source ?? null,
        userId: args.userId,
        at: now(getLocalTimeZone()).toAbsoluteString()
      }
    ]
  };

  return client
    .from("trackedEntity")
    .update({
      expirationDate: args.expirationDate,
      attributes: nextAttrs as unknown as Json
    })
    .eq("id", args.trackedEntityId);
}

export async function getTrackedEntitiesByOperationId(
  client: CarbonDatabaseClient<QueryDatabase>,
  operationId: string
) {
  const jobOperation = await client
    .from("jobOperation")
    .select("jobMakeMethodId")
    .eq("id", operationId)
    .single();

  if (jobOperation.error || !jobOperation.data.jobMakeMethodId)
    return {
      data: null,
      error: jobOperation.error
    };

  return getTrackedEntitiesByMakeMethodId(
    client,
    jobOperation.data.jobMakeMethodId
  );
}

export async function getWarehouseTransfers(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client
    .from("warehouseTransfer")
    .select(
      "*, fromLocation:location!fromLocationId(name), toLocation:location!toLocationId(name)",
      {
        count: "exact"
      }
    )
    .eq("companyId", companyId);

  if (args.search) {
    query = query.or(
      `transferId.ilike.%${args.search}%,reference.ilike.%${args.search}%`
    );
  }

  query = setGenericQueryFilters(query, args, [
    { column: "transferId", ascending: false }
  ]);
  return query;
}

export async function getWarehouseTransfer(
  client: CarbonDatabaseClient<QueryDatabase>,
  transferId: string
) {
  return client
    .from("warehouseTransfer")
    .select(
      "*, fromLocation:location!fromLocationId(*), toLocation:location!toLocationId(*)"
    )
    .eq("id", transferId)
    .single();
}

export async function getWarehouseTransferLine(
  client: CarbonDatabaseClient<QueryDatabase>,
  transferId: string,
  lineId: string
) {
  return client
    .from("warehouseTransferLine")
    .select(
      "*, warehouseTransfer(*, fromLocation:location!fromLocationId(name), toLocation:location!toLocationId(name))"
    )
    .eq("id", lineId)
    .eq("transferId", transferId)
    .single();
}

export async function getWarehouseTransferLines(
  client: CarbonDatabaseClient<QueryDatabase>,
  transferId: string
) {
  return client
    .from("warehouseTransferLine")
    .select(
      "*, item(*), fromStorageUnit:storageUnit!fromStorageUnitId(name), toStorageUnit:storageUnit!toStorageUnitId(name)"
    )
    .eq("transferId", transferId);
}

export async function insertManualInventoryAdjustment(
  client: CarbonDatabaseClient<QueryDatabase>,
  inventoryAdjustment: z.infer<typeof inventoryAdjustmentValidator> & {
    companyId: string;
    createdBy: string;
  }
) {
  const {
    adjustmentType,
    readableId,
    originalStorageUnitId,
    comment,
    expirationDate: providedExpirationDate,
    ...rest
  } = inventoryAdjustment;
  const data = {
    ...rest,
    entryType:
      adjustmentType === "Set Quantity" ? "Positive Adjmt." : adjustmentType, // This will be overwritten below
    comment: comment || null
  };

  // For new tracked entities created here, fall back to the item's Fixed
  // Duration shelf-life policy when the user did not type an expiry. Other
  // modes (Calculated, Set on Receipt) intentionally stay NULL — they get
  // resolved at production / receipt time, not on a manual adjustment.
  const resolveExpirationForNewEntity = async (): Promise<string | null> => {
    if (providedExpirationDate) return providedExpirationDate;
    const shelfLife = await client
      .from("itemShelfLife")
      .select("mode, days")
      .eq("itemId", inventoryAdjustment.itemId)
      .maybeSingle();
    if (
      !shelfLife.error &&
      shelfLife.data?.mode === "Fixed Duration" &&
      shelfLife.data.days
    ) {
      return today(getLocalTimeZone())
        .add({ days: Number(shelfLife.data.days) })
        .toString();
    }
    return null;
  };

  // For existing tracked entities, only write when the user supplied a value
  // and it differs from the current row. Routes through updateTrackedEntityExpiry
  // so the override is captured in attributes.expiryOverrides for traceability.
  const applyExpirationOverride = async (trackedEntityId: string) => {
    if (!providedExpirationDate) return null;
    const current = await client
      .from("trackedEntity")
      .select("expirationDate")
      .eq("id", trackedEntityId)
      .single();
    if (
      !current.error &&
      current.data?.expirationDate === providedExpirationDate
    )
      return null;
    return updateTrackedEntityExpiry(client, {
      trackedEntityId,
      expirationDate: providedExpirationDate,
      reason: comment?.trim() || "Updated via inventory adjustment",
      source: "Inventory Adjustment",
      userId: data.createdBy
    });
  };

  const storageUnitQuantities = await client.rpc(
    "get_item_quantities_by_tracking_id",
    {
      item_id: data.itemId,
      company_id: data.companyId,
      location_id: data.locationId
    }
  );

  const currentQuantity = inventoryAdjustment.trackedEntityId
    ? storageUnitQuantities?.data?.find(
        (quantity: any) =>
          quantity.trackedEntityId == inventoryAdjustment.trackedEntityId
      )
    : storageUnitQuantities?.data?.find(
        // null == undefined - so we use a == instead of === here
        (quantity: any) => quantity.storageUnitId == data.storageUnitId
      );

  const currentQuantityOnHand = currentQuantity?.quantity ?? 0;

  // Check if this is a storage unit transfer for a tracked entity
  const isStorageUnitTransfer =
    inventoryAdjustment.trackedEntityId &&
    originalStorageUnitId &&
    originalStorageUnitId !== data.storageUnitId;

  if (isStorageUnitTransfer) {
    // Handle storage unit transfer: negative adjustment at original unit, positive at new unit
    // First, update the readableId if provided
    if (readableId !== undefined) {
      const trackedEntityUpdate = await client
        .from("trackedEntity")
        .update({ readableId })
        .eq("id", inventoryAdjustment.trackedEntityId);

      if (trackedEntityUpdate.error) {
        return trackedEntityUpdate;
      }
    }

    if (inventoryAdjustment.trackedEntityId) {
      const expiryOverride = await applyExpirationOverride(
        inventoryAdjustment.trackedEntityId
      );
      if (expiryOverride?.error) return expiryOverride;
    }

    // Create negative adjustment at original storage unit
    const negativeAdjustment = await client
      .from("itemLedger")
      .insert([
        {
          itemId: data.itemId,
          locationId: data.locationId,
          storageUnitId: originalStorageUnitId,
          trackedEntityId: inventoryAdjustment.trackedEntityId,
          entryType: "Negative Adjmt." as const,
          quantity: -currentQuantityOnHand,
          companyId: data.companyId,
          createdBy: data.createdBy,
          comment: data.comment
        }
      ])
      .select("*")
      .single();

    if (negativeAdjustment.error) {
      return negativeAdjustment;
    }

    // Create positive adjustment at new storage unit
    return client
      .from("itemLedger")
      .insert([
        {
          itemId: data.itemId,
          locationId: data.locationId,
          storageUnitId: data.storageUnitId,
          trackedEntityId: inventoryAdjustment.trackedEntityId,
          entryType: "Positive Adjmt." as const,
          quantity: currentQuantityOnHand,
          companyId: data.companyId,
          createdBy: data.createdBy,
          comment: data.comment
        }
      ])
      .select("*")
      .single();
  }

  if (adjustmentType === "Set Quantity" && currentQuantity) {
    const quantityDifference = data.quantity - currentQuantityOnHand;
    if (quantityDifference > 0) {
      data.entryType = "Positive Adjmt.";
      data.quantity = quantityDifference;
    } else if (quantityDifference < 0) {
      data.entryType = "Negative Adjmt.";
      data.quantity = -Math.abs(quantityDifference);
    } else {
      // No change in quantity, but readableId / expirationDate might have changed
      if (inventoryAdjustment.trackedEntityId && readableId !== undefined) {
        const trackedEntityUpdate = await client
          .from("trackedEntity")
          .update({ readableId })
          .eq("id", inventoryAdjustment.trackedEntityId);
        if (trackedEntityUpdate.error) return trackedEntityUpdate;
      }
      if (inventoryAdjustment.trackedEntityId) {
        const expiryOverride = await applyExpirationOverride(
          inventoryAdjustment.trackedEntityId
        );
        if (expiryOverride?.error) return expiryOverride;
      }
      return { data: null };
    }
  }

  // Check if it's a negative adjustment and if the quantity is sufficient
  if (data.entryType === "Negative Adjmt.") {
    if (data.quantity > currentQuantityOnHand) {
      return {
        error: "Insufficient quantity for negative adjustment"
      };
    }
    data.quantity = -Math.abs(data.quantity);
  }

  if (inventoryAdjustment.trackedEntityId) {
    if (currentQuantity) {
      // Update the existing tracked entity
      const trackedEntityUpdate = await client
        .from("trackedEntity")
        .update({
          quantity: data.quantity + currentQuantityOnHand,
          readableId: readableId
        })
        .eq("id", inventoryAdjustment.trackedEntityId);

      if (trackedEntityUpdate.error) {
        return trackedEntityUpdate;
      }

      const expiryOverride = await applyExpirationOverride(
        inventoryAdjustment.trackedEntityId
      );
      if (expiryOverride?.error) return expiryOverride;
    } else {
      const [item, expirationDate] = await Promise.all([
        client.from("item").select("*").eq("id", data.itemId).single(),
        resolveExpirationForNewEntity()
      ]);

      // Stamp the trace blob so the popover Source / Override steps can show
      // the entity originated from a manual inventory adjustment, by whom,
      // and when. Mirrors the receipt/job markers consumed by
      // ExpiryTracePopover (attrs.Receipt, attrs.Job).
      const adjustmentStamp = {
        userId: data.createdBy,
        at: now(getLocalTimeZone()).toAbsoluteString(),
        reason: comment?.trim() || "Created via inventory adjustment"
      };
      const attributes: Record<string, unknown> = {
        "Inventory Adjustment": adjustmentStamp,
        ...(expirationDate
          ? {
              expiryOverrides: [
                {
                  previous: null,
                  next: expirationDate,
                  reason: adjustmentStamp.reason,
                  source: "Inventory Adjustment",
                  userId: adjustmentStamp.userId,
                  at: adjustmentStamp.at
                }
              ]
            }
          : {})
      };

      // Create a new tracked entity
      const trackedEntityInsert = await client
        .from("trackedEntity")
        .insert([
          {
            id: inventoryAdjustment.trackedEntityId,
            sourceDocument: "Item",
            sourceDocumentId: data.itemId,
            sourceDocumentReadableId: item.data?.readableIdWithRevision,
            readableId: readableId,
            quantity: data.quantity,
            status: "Available",
            expirationDate,
            attributes: attributes as unknown as Json,
            companyId: data.companyId,
            createdBy: data.createdBy
          }
        ])
        .select("*")
        .single();

      if (trackedEntityInsert.error) {
        return trackedEntityInsert;
      }
    }
  }

  return client.from("itemLedger").insert([data]).select("*").single();
}

export async function updateBatchPropertyOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  data: Omit<
    z.infer<typeof batchPropertyOrderValidator>,
    "batchPropertyGroupId"
  > & {
    batchPropertyGroupId?: string | null;
    updatedBy: string;
  }
) {
  return client.from("batchProperty").update(sanitize(data)).eq("id", data.id);
}

export async function updateStockTransferStatus(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: {
    id: string;
    companyId?: string;
    status: EnumValue<typeof stockTransferStatusEnum>;
    assignee?: string | null;
    completedAt: string | null;
    updatedBy: string;
  }
) {
  const { id, companyId, status, assignee, completedAt, updatedBy } = args;
  const update = client
    .from("stockTransfer")
    .update({
      status,
      assignee,
      completedAt,
      updatedBy
    })
    .eq("id", id);
  return companyId ? update.eq("companyId", companyId) : update;
}

export async function upsertBatchProperty(
  client: CarbonDatabaseClient<QueryDatabase>,
  batchProperty: z.infer<typeof batchPropertyValidator> & {
    companyId: string;
    userId: string;
  }
) {
  const { userId, ...data } = batchProperty;
  if (batchProperty.id) {
    return client
      .from("batchProperty")
      .update(
        sanitize({
          ...data,
          updatedBy: userId,
          updatedAt: new Date().toISOString()
        })
      )
      .eq("id", batchProperty.id);
  }

  return client.from("batchProperty").insert({
    ...data,
    createdBy: userId
  });
}

export async function upsertKanban(
  client: CarbonDatabaseClient<QueryDatabase>,
  kanban:
    | (Omit<z.infer<typeof kanbanValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof kanbanValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in kanban) {
    return client
      .from("kanban")
      .insert({
        ...kanban
      })
      .select("id")
      .single();
  }
  return client
    .from("kanban")
    .update({
      ...sanitize(kanban),
      updatedAt: today(getLocalTimeZone()).toString()
    })
    .eq("id", kanban.id)
    .select("id")
    .single();
}

export async function upsertReceipt(
  client: CarbonDatabaseClient<QueryDatabase>,
  receipt:
    | (Omit<z.infer<typeof receiptValidator>, "id" | "receiptId"> & {
        receiptId: string;
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof receiptValidator>, "id" | "receiptId"> & {
        id: string;
        receiptId: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in receipt) {
    return client.from("receipt").insert([receipt]).select("*").single();
  }
  return client
    .from("receipt")
    .update({
      ...sanitize(receipt),
      updatedAt: today(getLocalTimeZone()).toString()
    })
    .eq("id", receipt.id)
    .select("id")
    .single();
}

export async function upsertStorageUnit(
  client: CarbonDatabaseClient<QueryDatabase>,
  storageUnit:
    | (Omit<z.infer<typeof storageUnitValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof storageUnitValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in storageUnit) {
    return client
      .from("storageUnit")
      .insert({
        ...storageUnit,
        id: nanoid()
      })
      .select("id")
      .single();
  }
  return client
    .from("storageUnit")
    .update({
      ...sanitize(storageUnit),
      updatedAt: today(getLocalTimeZone()).toString()
    })
    .eq("id", storageUnit.id)
    .select("id")
    .single();
}

export async function upsertShippingMethod(
  client: CarbonDatabaseClient<QueryDatabase>,
  shippingMethod:
    | (Omit<z.infer<typeof shippingMethodValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof shippingMethodValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in shippingMethod) {
    return client
      .from("shippingMethod")
      .insert([shippingMethod])
      .select("id")
      .single();
  }
  return client
    .from("shippingMethod")
    .update(sanitize(shippingMethod))
    .eq("id", shippingMethod.id)
    .select("id")
    .single();
}

export async function upsertShipment(
  client: CarbonDatabaseClient<QueryDatabase>,
  shipment:
    | (Omit<z.infer<typeof shipmentValidator>, "id" | "shipmentId"> & {
        shipmentId: string;
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof shipmentValidator>, "id" | "shipmentId"> & {
        id: string;
        shipmentId: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in shipment) {
    return client.from("shipment").insert([shipment]).select("*").single();
  }
  return client
    .from("shipment")
    .update({
      ...sanitize(shipment),
      updatedAt: today(getLocalTimeZone()).toString()
    })
    .eq("id", shipment.id)
    .select("id")
    .single();
}

export async function upsertStockTransfer(
  client: CarbonDatabaseClient<QueryDatabase>,
  stockTransfer:
    | {
        locationId: string;
        stockTransferId: string;
        companyId: string;
        createdBy: string;
        customFields?: Json;
      }
    | {
        id: string;
        locationId: string;
        stockTransferId: string;
        companyId: string;
        updatedBy: string;
        customFields?: Json;
      }
) {
  if ("createdBy" in stockTransfer) {
    return client
      .from("stockTransfer")
      .insert({
        ...stockTransfer,
        status: "Released"
      })
      .select("id")
      .single();
  }
  return client
    .from("stockTransfer")
    .update(sanitize(stockTransfer))
    .eq("id", stockTransfer.id)
    .select("id")
    .single();
}

export async function upsertStockTransferLine(
  client: CarbonDatabaseClient<QueryDatabase>,
  stockTransferLine:
    | (Omit<z.infer<typeof stockTransferLineValidator>, "id"> & {
        companyId: string;
        createdBy: string;
      })
    | (Omit<z.infer<typeof stockTransferLineValidator>, "id"> & {
        id: string;
        updatedBy: string;
      })
) {
  if ("createdBy" in stockTransferLine) {
    return client
      .from("stockTransferLine")
      .insert(stockTransferLine)
      .select("id")
      .single();
  }
  return client
    .from("stockTransferLine")
    .update(sanitize(stockTransferLine))
    .eq("id", stockTransferLine.id)
    .select("id")
    .single();
}

export async function upsertStockTransferLines(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: {
    lines: z.infer<typeof stockTransferValidator>["lines"];
    stockTransferId: string;
    companyId: string;
    createdBy: string;
  }
) {
  const { lines, stockTransferId, companyId, createdBy } = args;
  return client.from("stockTransferLine").insert(
    lines.map((line) => ({
      ...line,
      stockTransferId,
      companyId,
      createdBy
    }))
  );
}

export async function upsertWarehouseTransfer(
  client: CarbonDatabaseClient<QueryDatabase>,
  transfer:
    | (Omit<z.infer<typeof warehouseTransferValidator>, "id" | "transferId"> & {
        transferId: string;
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof warehouseTransferValidator>, "id" | "transferId"> & {
        id: string;
        transferId: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in transfer) {
    return client
      .from("warehouseTransfer")
      .insert([transfer])
      .select("*")
      .single();
  }
  return client
    .from("warehouseTransfer")
    .update({
      ...sanitize(transfer),
      updatedAt: today(getLocalTimeZone()).toString()
    })
    .eq("id", transfer.id)
    .select("id")
    .single();
}

export async function updateWarehouseTransferStatus(
  client: CarbonDatabaseClient<QueryDatabase>,
  transferId: string,
  status: TableRow<"warehouseTransfer">["status"],
  updatedBy: string,
  companyId?: string
) {
  const update = client
    .from("warehouseTransfer")
    .update({
      status,
      updatedBy,
      updatedAt: new Date().toISOString()
    })
    .eq("id", transferId);
  return companyId ? update.eq("companyId", companyId) : update;
}

export async function upsertWarehouseTransferLine(
  client: CarbonDatabaseClient<QueryDatabase>,
  line:
    | TableInsert<"warehouseTransferLine">
    | (TableUpdate<"warehouseTransferLine"> & {
        id: string;
      })
) {
  if ("id" in line && line.id) {
    const { id, ...updateData } = line;
    return client
      .from("warehouseTransferLine")
      .update({
        ...updateData,
        updatedAt: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();
  } else {
    return client
      .from("warehouseTransferLine")
      .insert({
        ...line,
        createdAt: new Date().toISOString()
      } as TableInsert<"warehouseTransferLine">)
      .select()
      .single();
  }
}

export async function getDefaultStorageUnitForJob(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  locationId: string,
  companyId: string
): Promise<string | null> {
  const pickMethod = await client
    .from("pickMethod")
    .select("defaultStorageUnitId")
    .eq("itemId", itemId)
    .eq("locationId", locationId)
    .eq("companyId", companyId)
    .maybeSingle();

  if (pickMethod.data?.defaultStorageUnitId) {
    return pickMethod.data.defaultStorageUnitId;
  }

  const itemStorageUnitQuantities = await getItemStorageUnitQuantities(
    client,
    itemId,
    companyId,
    locationId
  );

  if (itemStorageUnitQuantities.data?.length) {
    // Find the storage unit with the highest quantity
    const storageUnitWithHighestQuantity =
      itemStorageUnitQuantities.data.reduce((max: any, current: any) => {
        return (current.quantity ?? 0) > (max.quantity ?? 0) ? current : max;
      });

    return storageUnitWithHighestQuantity.storageUnitId;
  }

  return null;
}

// ----------------------------------------------------------------------------
// storageUnit hierarchy helpers (backed by the storageUnits_recursive view
// defined in 20260417000200_storage-unit-nesting-and-type.sql)
// ----------------------------------------------------------------------------

export async function getStorageUnitTree(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  locationId: string
) {
  return client
    .from("storageUnits_recursive")
    .select(
      "id, parentId, locationId, warehouseId, name, active, storageTypeIds, companyId, depth, ancestorPath"
    )
    .eq("companyId", companyId)
    .eq("locationId", locationId)
    .order("ancestorPath");
}

export async function getStorageUnitDescendants(
  client: CarbonDatabaseClient<QueryDatabase>,
  storageUnitId: string
) {
  return client
    .from("storageUnits_recursive")
    .select(
      "id, parentId, locationId, warehouseId, name, active, storageTypeIds, companyId, depth, ancestorPath"
    )
    .contains("ancestorPath", [storageUnitId]);
}

export async function expandStorageUnitIdsWithDescendants(
  client: CarbonDatabaseClient<QueryDatabase>,
  storageUnitIds: string[]
): Promise<string[]> {
  if (storageUnitIds.length === 0) return [];
  const { data } = await client
    .from("storageUnits_recursive")
    .select("id")
    .overlaps("ancestorPath", storageUnitIds);
  const expanded = new Set<string>(storageUnitIds);
  (data ?? []).forEach((row) => {
    if (row.id) expanded.add(row.id);
  });
  return Array.from(expanded);
}

// ----------------------------------------------------------------------------
// storageType CRUD (mirrors materialType in items.service.ts)
// ----------------------------------------------------------------------------

export async function getStorageTypeUsage(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  companyId: string
) {
  return client
    .from("storageUnit")
    .select("id, name", { count: "exact" })
    .eq("companyId", companyId)
    .contains("storageTypeIds", [id])
    .limit(5);
}

export async function deleteStorageTypeWithCascade(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  companyId: string
) {
  const { data: units, error: fetchError } = await client
    .from("storageUnit")
    .select("id, storageTypeIds")
    .eq("companyId", companyId)
    .contains("storageTypeIds", [id]);

  if (fetchError) return { error: fetchError };

  for (const unit of units ?? []) {
    const next = (unit.storageTypeIds ?? []).filter((x: any) => x !== id);
    const { error: updateError } = await client
      .from("storageUnit")
      .update({ storageTypeIds: next })
      .eq("id", unit.id);
    if (updateError) return { error: updateError };
  }

  return client.from("storageType").delete().eq("id", id);
}

export async function getStorageTypes(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("storageType")
    .select("*", { count: "exact" })
    .eq("companyId", companyId);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  query = setGenericQueryFilters(query, args ?? {}, [
    { column: "name", ascending: true }
  ]);
  return query;
}

export async function getStorageType(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("storageType").select("*").eq("id", id).single();
}

export async function getStorageTypesList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return fetchAllFromTable<{
    id: string;
    name: string;
  }>(client, "storageType", "id, name", (query) =>
    query.eq("companyId", companyId).order("name")
  );
}

export async function upsertStorageType(
  client: CarbonDatabaseClient<QueryDatabase>,
  storageType:
    | (Omit<z.infer<typeof storageTypeValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof storageTypeValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in storageType) {
    return client
      .from("storageType")
      .insert({ ...storageType })
      .select("id")
      .single();
  }
  return client
    .from("storageType")
    .update({
      ...sanitize(storageType),
      updatedAt: today(getLocalTimeZone()).toString()
    })
    .eq("id", storageType.id)
    .select("id")
    .single();
}

export async function getShelfLifeForItems(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemIds: string[]
) {
  if (itemIds.length === 0) return { data: [], error: null };
  return client
    .from("itemShelfLife")
    .select("itemId, mode, days")
    .in("itemId", itemIds);
}

/**
 * Map of trackedEntityId → expirationDate (or null) for a set of ids.
 * Used by the inventory adjustment modal to prefill the date picker when
 * editing an existing batch / serial.
 */
export async function getTrackedEntityExpirations(
  client: CarbonDatabaseClient<QueryDatabase>,
  trackedEntityIds: string[]
): Promise<Record<string, string | null>> {
  if (trackedEntityIds.length === 0) return {};
  const result = await client
    .from("trackedEntity")
    .select("id, expirationDate")
    .in("id", trackedEntityIds);
  return (result.data ?? []).reduce<Record<string, string | null>>(
    (acc, row) => {
      acc[row.id] = row.expirationDate ?? null;
      return acc;
    },
    {}
  );
}
