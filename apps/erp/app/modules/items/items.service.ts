import { invokeFunction } from "@carbon/auth/functions.server";
import { fetchAllFromTable } from "@carbon/database";
import type {
  EnumValue,
  itemTypeEnum,
  Json,
  QueryDatabase
} from "@carbon/database/schema";
import type {
  ConditionAst,
  ItemRuleRow,
  Severity,
  TransactionSurface
} from "@carbon/utils";
import { getLocalTimeZone, now, today } from "@internationalized/date";
import { listObjects, toStorageFileObject } from "@carbon/storage";
import type { CarbonDatabaseClient } from "@carbon/database/query-client";
import { nanoid } from "nanoid";
import type { z } from "zod";
import type { GenericQueryFilters } from "~/utils/query";
import { setGenericQueryFilters } from "~/utils/query";
import { sanitize } from "@carbon/utils";
import type {
  operationParameterValidator,
  operationStepValidator,
  operationToolValidator
} from "../shared";
import {
  lookupBuyPriceFromMap,
  type PriceBreak,
  type SupplierPriceMap
} from "../shared";
import {
  type configurationParameterGroupOrderValidator,
  type configurationParameterGroupValidator,
  type configurationParameterOrderValidator,
  type configurationParameterValidator,
  type configurationRuleValidator,
  type consumableValidator,
  type customerPartValidator,
  type getMethodValidator,
  type itemCostValidator,
  type itemManufacturingValidator,
  type itemPlanningValidator,
  type itemPostingGroupValidator,
  type itemPurchasingValidator,
  type itemUnitSalePriceValidator,
  type itemValidator,
  type makeMethodVersionValidator,
  type materialDimensionValidator,
  type materialFinishValidator,
  type materialFormValidator,
  type materialGradeValidator,
  type materialSubstanceValidator,
  type materialTypeValidator,
  type materialValidator,
  type methodMaterialValidator,
  type methodOperationValidator,
  type partValidator,
  type pickMethodValidator,
  type serviceValidator,
  type shelfLifeModes,
  type shelfLifeTriggerTimings,
  type supplierPartValidator,
  type toolValidator,
  type unitOfMeasureValidator
} from "./items.models";

export async function activateMethodVersion(
  client: CarbonDatabaseClient<QueryDatabase>,
  payload: {
    id: string;
    companyId: string;
    userId: string;
  }
) {
  return invokeFunction<{ convertedId: string }>("convert", {
    body: {
      type: "methodVersionToActive",
      ...payload
    },
  });
}

export async function copyItem(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: z.infer<typeof getMethodValidator> & {
    companyId: string;
    userId: string;
  }
) {
  return invokeFunction("get-method", {
    body: {
      type: "itemToItem",
      sourceId: args.sourceId,
      targetId: args.targetId,
      companyId: args.companyId,
      userId: args.userId,
      parts: {
        billOfMaterial: args.billOfMaterial,
        billOfProcess: args.billOfProcess,
        parameters: args.parameters,
        tools: args.tools,
        steps: args.steps,
        workInstructions: args.workInstructions
      }
    },
  });
}

export async function copyMakeMethod(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: z.infer<typeof getMethodValidator> & {
    companyId: string;
    userId: string;
  }
) {
  return invokeFunction("get-method", {
    body: {
      type: "makeMethodToMakeMethod",
      sourceId: args.sourceId,
      targetId: args.targetId,
      companyId: args.companyId,
      userId: args.userId
    },
  });
}

export async function createRevision(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: {
    item: NonNullable<Awaited<ReturnType<typeof getItem>>["data"]>;
    revision: string;
    createdBy: string;
  }
) {
  const { item, revision, createdBy } = args;
  const itemInsert = await client
    .from("item")
    .insert({
      readableId: item.readableId,
      revision: revision,
      name: item.name,
      type: item.type,
      replenishmentSystem: item.replenishmentSystem,
      defaultMethodType: item.defaultMethodType,
      itemTrackingType: item.itemTrackingType,
      unitOfMeasureCode: item.unitOfMeasureCode,
      active: true,
      modelUploadId: item.modelUploadId,
      companyId: item.companyId,
      createdBy: createdBy
    })
    .select("id")
    .single();

  if (itemInsert.error) {
    return itemInsert;
  }

  if (item.replenishmentSystem !== "Buy") {
    await invokeFunction("get-method", {
      body: {
        type: "itemToItem",
        sourceId: item.id,
        targetId: itemInsert.data.id,
        companyId: item.companyId,
        userId: createdBy
      },
    });
  }

  return itemInsert;
}

export async function deleteConfigurationParameter(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("configurationParameter").delete().eq("id", id);
}

export async function deleteConfigurationRule(
  client: CarbonDatabaseClient<QueryDatabase>,
  field: string,
  itemId: string
) {
  return client
    .from("configurationRule")
    .delete()
    .eq("field", field)
    .eq("itemId", itemId);
}

export async function deleteItemCustomerPart(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  companyId: string
) {
  return client
    .from("customerPartToItem")
    .delete()
    .eq("id", id)
    .eq("companyId", companyId);
}

export async function deleteConfigurationParameterGroup(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  // Get any parameters that belong to this group
  const { data: parameters } = await client
    .from("configurationParameter")
    .select("id")
    .eq("configurationParameterGroupId", id);

  if (parameters && parameters.length > 0) {
    // Get the ungrouped group
    const { data: ungrouped } = await client
      .from("configurationParameterGroup")
      .select("id")
      .eq("isUngrouped", true)
      .single();

    if (ungrouped) {
      // Update all parameters to use the ungrouped group
      await client
        .from("configurationParameter")
        .update({ configurationParameterGroupId: ungrouped.id })
        .eq("configurationParameterGroupId", id);
    }
  }
  return client.from("configurationParameterGroup").delete().eq("id", id);
}

export async function deleteItem(client: CarbonDatabaseClient<QueryDatabase>, id: string) {
  return client.from("item").delete().eq("id", id);
}

export async function deleteItemPostingGroup(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("itemPostingGroup").delete().eq("id", id);
}

export async function deleteMaterialDimension(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("materialDimension").delete().eq("id", id);
}

export async function deleteMaterialFinish(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("materialFinish").delete().eq("id", id);
}

export async function deleteMaterialForm(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("materialForm").delete().eq("id", id);
}

export async function deleteMaterialGrade(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("materialGrade").delete().eq("id", id);
}

export async function deleteMaterialSubstance(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("materialSubstance").delete().eq("id", id);
}

export async function deleteMethodMaterial(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("methodMaterial").delete().eq("id", id);
}

export async function assertMethodOperationIsDraft(
  client: CarbonDatabaseClient<QueryDatabase>,
  operationId: string,
  companyId: string
) {
  const operation = await client
    .from("methodOperation")
    .select("makeMethodId")
    .eq("id", operationId)
    .eq("companyId", companyId)
    .single();

  if (operation.error || !operation.data) {
    throw new Error("Failed to find method operation");
  }

  const makeMethod = await client
    .from("makeMethod")
    .select("status")
    .eq("id", operation.data.makeMethodId)
    .eq("companyId", companyId)
    .single();

  if (makeMethod.error || !makeMethod.data) {
    throw new Error("Failed to find method version");
  }

  const status = makeMethod.data.status;
  if (status !== "Draft") {
    throw new Error(
      `Cannot modify steps on a method version with status "${status}". Only Draft versions can be modified.`
    );
  }
}

export async function deleteMethodOperationStep(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("methodOperationStep").delete().eq("id", id);
}

export async function deleteMethodOperationParameter(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("methodOperationParameter").delete().eq("id", id);
}

export async function deleteMethodOperationTool(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("methodOperationTool").delete().eq("id", id);
}

export async function deleteUnitOfMeasure(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("unitOfMeasure").delete().eq("id", id);
}

export async function getConfigurationParameters(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  const [parameters, groups] = await Promise.all([
    client
      .from("configurationParameter")
      .select("*")
      .eq("itemId", itemId)
      .eq("companyId", companyId),
    client
      .from("configurationParameterGroup")
      .select("*")
      .eq("itemId", itemId)
      .eq("companyId", companyId)
  ]);

  if (parameters.error) {
    console.error(parameters.error);
    return { groups: [], parameters: [] };
  }

  if (groups.error) {
    console.error(groups.error);
    return { groups: [], parameters: [] };
  }

  return { groups: groups.data ?? [], parameters: parameters.data ?? [] };
}

export async function getConfigurationRules(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  const result = await client
    .from("configurationRule")
    .select("*")
    .eq("itemId", itemId)
    .eq("companyId", companyId);
  if (result.error) {
    console.error(result.error);
    return [];
  }
  return result.data ?? [];
}

export async function getConsumable(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  return client
    .rpc("get_consumable_details", {
      item_id: itemId,
      company_id: companyId
    })
    .single();
}

export async function getConsumables(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
    supplierId: string | null;
  }
) {
  let query = client
    .from("consumables")
    .select("*", {
      count: "exact"
    })
    .eq("companyId", companyId);

  if (args.search) {
    query = query.or(
      `readableIdWithRevision.ilike.%${args.search}%,name.ilike.%${args.search}%,description.ilike.%${args.search}%,supplierIds.ilike.%${args.search}%`
    );
  }

  if (args.supplierId) {
    query = query.contains("supplierIds", [args.supplierId]);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "readableIdWithRevision", ascending: true }
  ]);
  return query;
}

export async function getConsumablesList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return fetchAllFromTable<{
    id: string;
    name: string;
    readableIdWithRevision: string;
  }>(client, "item", "id, name, readableIdWithRevision", (query) =>
    query
      .eq("type", "Consumable")
      .eq("companyId", companyId)
      .eq("active", true)
      .order("name")
  );
}
export async function getItem(client: CarbonDatabaseClient<QueryDatabase>, id: string) {
  return client.from("item").select("*").eq("id", id).single();
}

export async function assertSupplierItemScope(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: {
    itemId: string;
    companyId: string;
    role: string | null | undefined;
    supplierId: string | null | undefined;
    userId: string;
    allowCreatedBy?: boolean;
  }
) {
  if (args.role !== "supplier") return;

  if (!args.supplierId) {
    throw new Response("Supplier account is not scoped", { status: 403 });
  }

  const item = await client
    .from("item")
    .select("companyId, createdBy")
    .eq("id", args.itemId)
    .single();

  if (
    item.error ||
    (item.data?.companyId !== null && item.data?.companyId !== args.companyId)
  ) {
    throw new Response("Supplier item scope mismatch", { status: 403 });
  }

  if (args.allowCreatedBy !== false && item.data.createdBy === args.userId) {
    return;
  }

  const supplierPart = await client
    .from("supplierPart")
    .select("id")
    .eq("itemId", args.itemId)
    .eq("companyId", args.companyId)
    .eq("supplierId", args.supplierId)
    .limit(1)
    .maybeSingle();

  if (supplierPart.error || !supplierPart.data) {
    throw new Response("Supplier item scope mismatch", { status: 403 });
  }
}

export async function assertSupplierPartScope(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: {
    supplierPartId: string;
    itemId?: string | null;
    companyId: string;
    role: string | null | undefined;
    supplierId: string | null | undefined;
  }
) {
  if (args.role !== "supplier") return;

  if (!args.supplierId) {
    throw new Response("Supplier account is not scoped", { status: 403 });
  }

  const supplierPart = await client
    .from("supplierPart")
    .select("itemId, supplierId, companyId")
    .eq("id", args.supplierPartId)
    .eq("companyId", args.companyId)
    .single();

  if (
    supplierPart.error ||
    !supplierPart.data ||
    supplierPart.data.supplierId !== args.supplierId ||
    (args.itemId && supplierPart.data.itemId !== args.itemId)
  ) {
    throw new Response("Supplier part scope mismatch", { status: 403 });
  }
}

export async function getItemCost(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  const [itemCost, item] = await Promise.all([
    client
      .from("itemCost")
      .select("*")
      .eq("itemId", itemId)
      .eq("companyId", companyId)
      .single(),
    client
      .from("item")
      .select("readableIdWithRevision")
      .eq("id", itemId)
      .eq("companyId", companyId)
      .single()
  ]);

  if (itemCost.error || !itemCost.data) return itemCost;
  if (item.error || !item.data) {
    return { ...itemCost, data: null, error: item.error };
  }

  return {
    ...itemCost,
    data: {
      ...itemCost.data,
      readableIdWithRevision: item.data.readableIdWithRevision
    }
  };
}

export async function getItemCostHistory(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  const dateOneYearAgo = today(getLocalTimeZone())
    .subtract({ years: 1 })
    .toString();

  return client
    .from("costLedger")
    .select("*")
    .eq("itemId", itemId)
    .eq("companyId", companyId)
    .gte("postingDate", dateOneYearAgo)
    .order("postingDate", { ascending: false });
}

export async function getItemCustomerPart(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  companyId: string
) {
  const customerPart = await client
    .from("customerPartToItem")
    .select("*")
    .eq("id", id)
    .eq("companyId", companyId)
    .single();

  if (customerPart.error || !customerPart.data) return customerPart;

  const customer = await client
    .from("customer")
    .select("id, name")
    .eq("id", customerPart.data.customerId)
    .eq("companyId", companyId)
    .single();

  if (customer.error || !customer.data) {
    return { ...customerPart, data: null, error: customer.error };
  }

  return {
    ...customerPart,
    data: {
      ...customerPart.data,
      customer: customer.data
    }
  };
}

export async function getItemCustomerParts(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  const customerParts = await client
    .from("customerPartToItem")
    .select("*")
    .eq("itemId", itemId)
    .eq("companyId", companyId);

  if (customerParts.error || !customerParts.data) return customerParts;

  const customerIds = Array.from(
    new Set(customerParts.data.map((part) => part.customerId).filter(Boolean))
  );
  const customers =
    customerIds.length > 0
      ? await client
          .from("customer")
          .select("id, name")
          .in("id", customerIds)
          .eq("companyId", companyId)
      : { data: [], error: null };

  if (customers.error) {
    return { ...customerParts, data: [], error: customers.error };
  }

  const customersById = new Map(
    (customers.data ?? []).map((customer) => [customer.id, customer])
  );

  return {
    ...customerParts,
    data: customerParts.data.map((part) => ({
      ...part,
      customer: customersById.get(part.customerId) ?? null
    }))
  };
}

export async function getItemDemand(
  client: CarbonDatabaseClient<QueryDatabase>,
  {
    itemId,
    locationId,
    periods,
    companyId
  }: {
    itemId: string;
    locationId: string;
    periods: string[];
    companyId: string;
  }
) {
  const [actuals, forecasts] = await Promise.all([
    client
      .from("demandActual")
      .select("*")
      .eq("itemId", itemId)
      .eq("locationId", locationId)
      .eq("companyId", companyId)
      .in("periodId", periods),
    client
      .from("demandForecast")
      .select("*")
      .eq("itemId", itemId)
      .eq("locationId", locationId)
      .eq("companyId", companyId)
      .in("periodId", periods)
      .order("periodId")
  ]);

  return {
    actuals: actuals.data ?? [],
    forecasts: forecasts.data ?? []
  };
}

export async function getItemFiles(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  const objects = await listObjects({
    companyId,
    prefix: `${companyId}/parts/${itemId}`
  });
  return objects.map((object) => toStorageFileObject(object, "private"));
}

export async function getItemPostingGroup(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("itemPostingGroup").select("*").eq("id", id).single();
}

export async function getItemPostingGroups(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("itemPostingGroup")
    .select("*", {
      count: "exact"
    })
    .eq("companyId", companyId);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "name", ascending: true }
    ]);
  }

  return query;
}

export async function getItemPostingGroupsList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("itemPostingGroup")
    .select("id, name", { count: "exact" })
    .eq("companyId", companyId)
    .order("name");
}

export async function getItemManufacturing(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  companyId: string
) {
  return client
    .from("itemReplenishment")
    .select("*")
    .eq("itemId", id)
    .eq("companyId", companyId)
    .single();
}

export async function getItemPlanning(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string,
  locationId: string
) {
  return client
    .from("itemPlanning")
    .select("*")
    .eq("itemId", itemId)
    .eq("companyId", companyId)
    .eq("locationId", locationId)
    .maybeSingle();
}

export async function getItemQuantities(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string,
  locationId: string
) {
  return client
    .rpc("get_inventory_quantities", {
      location_id: locationId,
      company_id: companyId
    })
    .eq("id", itemId)
    .maybeSingle();
}

export async function getItemReplenishment(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  return client
    .from("itemReplenishment")
    .select("*")
    .eq("itemId", itemId)
    .eq("companyId", companyId)
    .single();
}

export async function getItemStorageUnitQuantities(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string,
  locationId: string
) {
  return client.rpc("get_item_quantities_by_tracking_id", {
    item_id: itemId,
    company_id: companyId,
    location_id: locationId
  });
}

export async function getItemSupply(
  client: CarbonDatabaseClient<QueryDatabase>,
  {
    itemId,
    locationId,
    periods,
    companyId
  }: {
    itemId: string;
    locationId: string;
    periods: string[];
    companyId: string;
  }
) {
  const [actuals, forecasts] = await Promise.all([
    client
      .from("supplyActual")
      .select("*")
      .eq("itemId", itemId)
      .eq("locationId", locationId)
      .eq("companyId", companyId)
      .in("periodId", periods)
      .order("periodId"),
    client
      .from("supplyForecast")
      .select("*")
      .eq("itemId", itemId)
      .eq("locationId", locationId)
      .eq("companyId", companyId)
      .in("periodId", periods)
      .order("periodId")
  ]);

  return {
    actuals: actuals.data ?? [],
    forecasts: forecasts.data ?? []
  };
}

export async function getItemUnitSalePrice(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  companyId: string
) {
  return client
    .from("itemUnitSalePrice")
    .select("*")
    .eq("itemId", id)
    .eq("companyId", companyId)
    .single();
}

async function getJobMaterialReferences(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  const jobMaterials = await client
    .from("jobMaterial")
    .select("id, methodType, jobId")
    .eq("itemId", itemId)
    .eq("companyId", companyId)
    .limit(100)
    .order("createdAt", { ascending: false });

  if (jobMaterials.error || !jobMaterials.data) return [];

  const jobIds = Array.from(
    new Set(jobMaterials.data.map((material) => material.jobId).filter(Boolean))
  );
  const jobs =
    jobIds.length > 0
      ? await client
          .from("job")
          .select("id, jobId")
          .in("id", jobIds)
          .eq("companyId", companyId)
      : { data: [], error: null };

  if (jobs.error) return [];

  const jobsById = new Map((jobs.data ?? []).map((job) => [job.id, job]));

  return jobMaterials.data.map((material) => {
    const job = jobsById.get(material.jobId);
    return {
      id: material.id,
      methodType: material.methodType,
      documentReadableId: job?.jobId ?? null,
      documentId: job?.id ?? null
    };
  });
}

async function getReceiptLineReferences(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string,
  options?: { limit?: boolean }
) {
  let query = client
    .from("receiptLine")
    .select("id, receiptId")
    .eq("itemId", itemId)
    .eq("companyId", companyId);

  if (options?.limit) {
    query = query.limit(100).order("createdAt", { ascending: false });
  }

  const receiptLines = await query;
  if (receiptLines.error || !receiptLines.data) return [];

  const receiptIds = Array.from(
    new Set(receiptLines.data.map((line) => line.receiptId).filter(Boolean))
  );
  const receipts =
    receiptIds.length > 0
      ? await client
          .from("receipt")
          .select("id, receiptId")
          .in("id", receiptIds)
          .eq("companyId", companyId)
      : { data: [], error: null };

  if (receipts.error) return [];

  const receiptsById = new Map(
    (receipts.data ?? []).map((receipt) => [receipt.id, receipt])
  );

  return receiptLines.data.map((line) => {
    const receipt = receiptsById.get(line.receiptId);
    return {
      id: line.id,
      documentReadableId: receipt?.receiptId ?? null,
      documentId: receipt?.id ?? null
    };
  });
}

async function getShipmentLineReferences(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  const shipmentLines = await client
    .from("shipmentLine")
    .select("id, shipmentId")
    .eq("itemId", itemId)
    .eq("companyId", companyId)
    .limit(100)
    .order("createdAt", { ascending: false });

  if (shipmentLines.error || !shipmentLines.data) return [];

  const shipmentIds = Array.from(
    new Set(shipmentLines.data.map((line) => line.shipmentId).filter(Boolean))
  );
  const shipments =
    shipmentIds.length > 0
      ? await client
          .from("shipment")
          .select("id, shipmentId")
          .in("id", shipmentIds)
          .eq("companyId", companyId)
      : { data: [], error: null };

  if (shipments.error) return [];

  const shipmentsById = new Map(
    (shipments.data ?? []).map((shipment) => [shipment.id, shipment])
  );

  return shipmentLines.data.map((line) => {
    const shipment = shipmentsById.get(line.shipmentId);
    return {
      id: line.id,
      documentReadableId: shipment?.shipmentId ?? null,
      documentId: shipment?.id ?? null
    };
  });
}

async function getNonConformanceItemReferences(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  const items = await client
    .from("nonConformanceItem")
    .select("id, nonConformanceId")
    .eq("itemId", itemId)
    .eq("companyId", companyId)
    .limit(100)
    .order("createdAt", { ascending: false });

  if (items.error || !items.data) return [];

  const nonConformanceIds = Array.from(
    new Set(items.data.map((item) => item.nonConformanceId).filter(Boolean))
  );
  const nonConformances =
    nonConformanceIds.length > 0
      ? await client
          .from("nonConformance")
          .select("id, nonConformanceId")
          .in("id", nonConformanceIds)
          .eq("companyId", companyId)
      : { data: [], error: null };

  if (nonConformances.error) return [];

  const nonConformancesById = new Map(
    (nonConformances.data ?? []).map((nonConformance) => [
      nonConformance.id,
      nonConformance
    ])
  );

  return items.data.map((item) => {
    const nonConformance = nonConformancesById.get(item.nonConformanceId);
    return {
      id: item.id,
      documentReadableId: nonConformance?.nonConformanceId ?? null,
      documentId: nonConformance?.id ?? null
    };
  });
}

async function getMaintenanceDispatchItemReferences(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  const items = await client
    .from("maintenanceDispatchItem")
    .select("id, maintenanceDispatchId")
    .eq("itemId", itemId)
    .eq("companyId", companyId)
    .limit(100)
    .order("createdAt", { ascending: false });

  if (items.error || !items.data) return [];

  const dispatchIds = Array.from(
    new Set(items.data.map((item) => item.maintenanceDispatchId).filter(Boolean))
  );
  const dispatches =
    dispatchIds.length > 0
      ? await client
          .from("maintenanceDispatch")
          .select("id, maintenanceDispatchId")
          .in("id", dispatchIds)
          .eq("companyId", companyId)
      : { data: [], error: null };

  if (dispatches.error) return [];

  const dispatchesById = new Map(
    (dispatches.data ?? []).map((dispatch) => [dispatch.id, dispatch])
  );

  return items.data.map((item) => {
    const dispatch = dispatchesById.get(item.maintenanceDispatchId);
    return {
      id: item.id,
      documentReadableId: dispatch?.maintenanceDispatchId ?? null,
      documentId: dispatch?.id ?? null
    };
  });
}

async function getMethodMaterialReferences(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  const materials = await client
    .from("methodMaterial")
    .select("id, methodType, makeMethodId")
    .eq("itemId", itemId)
    .eq("companyId", companyId)
    .limit(100)
    .order("createdAt", { ascending: false });

  if (materials.error || !materials.data) return [];

  const makeMethodIds = Array.from(
    new Set(materials.data.map((material) => material.makeMethodId).filter(Boolean))
  );
  const makeMethods =
    makeMethodIds.length > 0
      ? await client
          .from("makeMethod")
          .select("id, itemId, version")
          .in("id", makeMethodIds)
          .eq("companyId", companyId)
      : { data: [], error: null };

  if (makeMethods.error) return [];

  const itemIds = Array.from(
    new Set((makeMethods.data ?? []).map((method) => method.itemId).filter(Boolean))
  );
  const items =
    itemIds.length > 0
      ? await client
          .from("item")
          .select("id, readableIdWithRevision, type")
          .in("id", itemIds)
          .eq("companyId", companyId)
      : { data: [], error: null };

  if (items.error) return [];

  const makeMethodsById = new Map(
    (makeMethods.data ?? []).map((method) => [method.id, method])
  );
  const itemsById = new Map((items.data ?? []).map((item) => [item.id, item]));

  return materials.data.map((material) => {
    const makeMethod = makeMethodsById.get(material.makeMethodId);
    const item = makeMethod ? itemsById.get(makeMethod.itemId) : null;
    return {
      id: material.id,
      methodType: material.methodType,
      documentReadableId: item?.readableIdWithRevision ?? null,
      documentParentId: item?.id ?? null,
      documentId: makeMethod?.id ?? null,
      itemType: item?.type ?? null,
      version: makeMethod?.version ?? null
    };
  });
}

async function getPurchaseOrderLineReferences(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  const lines = await client
    .from("purchaseOrderLine")
    .select("id, purchaseOrderId")
    .eq("itemId", itemId)
    .eq("companyId", companyId)
    .limit(100)
    .order("createdAt", { ascending: false });

  if (lines.error || !lines.data) return [];

  const orderIds = Array.from(
    new Set(lines.data.map((line) => line.purchaseOrderId).filter(Boolean))
  );
  const orders =
    orderIds.length > 0
      ? await client
          .from("purchaseOrder")
          .select("id, purchaseOrderId")
          .in("id", orderIds)
          .eq("companyId", companyId)
      : { data: [], error: null };

  if (orders.error) return [];

  const ordersById = new Map(
    (orders.data ?? []).map((order) => [order.id, order])
  );

  return lines.data.map((line) => {
    const order = ordersById.get(line.purchaseOrderId);
    return {
      id: line.id,
      documentReadableId: order?.purchaseOrderId ?? null,
      documentId: order?.id ?? null
    };
  });
}

async function getQuoteLineReferences(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  const lines = await client
    .from("quoteLine")
    .select("id, methodType, quoteId")
    .eq("itemId", itemId)
    .eq("companyId", companyId)
    .limit(100);

  if (lines.error || !lines.data) return [];

  const quoteIds = Array.from(
    new Set(lines.data.map((line) => line.quoteId).filter(Boolean))
  );
  const quotes =
    quoteIds.length > 0
      ? await client
          .from("quote")
          .select("id, quoteId")
          .in("id", quoteIds)
          .eq("companyId", companyId)
      : { data: [], error: null };

  if (quotes.error) return [];

  const quotesById = new Map(
    (quotes.data ?? []).map((quote) => [quote.id, quote])
  );

  return lines.data.map((line) => {
    const quote = quotesById.get(line.quoteId);
    return {
      id: line.id,
      methodType: line.methodType,
      documentReadableId: quote?.quoteId ?? null,
      documentId: quote?.id ?? null
    };
  });
}

async function getQuoteMaterialReferences(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  const materials = await client
    .from("quoteMaterial")
    .select("id, methodType, quoteId, quoteLineId")
    .eq("itemId", itemId)
    .eq("companyId", companyId)
    .limit(100)
    .order("createdAt", { ascending: false });

  if (materials.error || !materials.data) return [];

  const quoteLineIds = Array.from(
    new Set(materials.data.map((material) => material.quoteLineId).filter(Boolean))
  );
  const quoteLines =
    quoteLineIds.length > 0
      ? await client
          .from("quoteLine")
          .select("id, itemId")
          .in("id", quoteLineIds)
          .eq("companyId", companyId)
      : { data: [], error: null };

  if (quoteLines.error) return [];

  const itemIds = Array.from(
    new Set((quoteLines.data ?? []).map((line) => line.itemId).filter(Boolean))
  );
  const items =
    itemIds.length > 0
      ? await client
          .from("item")
          .select("id, readableIdWithRevision")
          .in("id", itemIds)
          .eq("companyId", companyId)
      : { data: [], error: null };

  if (items.error) return [];

  const quoteLinesById = new Map(
    (quoteLines.data ?? []).map((line) => [line.id, line])
  );
  const itemsById = new Map((items.data ?? []).map((item) => [item.id, item]));

  return materials.data.map((material) => {
    const quoteLine = quoteLinesById.get(material.quoteLineId);
    const item = quoteLine ? itemsById.get(quoteLine.itemId) : null;
    return {
      id: material.id,
      methodType: material.methodType,
      documentReadableId: item?.readableIdWithRevision ?? null,
      documentParentId: material.quoteId,
      documentId: material.quoteLineId
    };
  });
}

async function getSalesOrderLineReferences(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  const lines = await client
    .from("salesOrderLine")
    .select("id, methodType, salesOrderId")
    .eq("itemId", itemId)
    .eq("companyId", companyId)
    .limit(100)
    .order("createdAt", { ascending: false });

  if (lines.error || !lines.data) return [];

  const orderIds = Array.from(
    new Set(lines.data.map((line) => line.salesOrderId).filter(Boolean))
  );
  const orders =
    orderIds.length > 0
      ? await client
          .from("salesOrder")
          .select("id, salesOrderId")
          .in("id", orderIds)
          .eq("companyId", companyId)
      : { data: [], error: null };

  if (orders.error) return [];

  const ordersById = new Map(
    (orders.data ?? []).map((order) => [order.id, order])
  );

  return lines.data.map((line) => {
    const order = ordersById.get(line.salesOrderId);
    return {
      id: line.id,
      methodType: line.methodType,
      documentReadableId: order?.salesOrderId ?? null,
      documentId: order?.id ?? null
    };
  });
}

async function getSupplierQuoteLineReferences(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  const lines = await client
    .from("supplierQuoteLine")
    .select("id, supplierQuoteId")
    .eq("itemId", itemId)
    .eq("companyId", companyId)
    .limit(100);

  if (lines.error || !lines.data) return [];

  const quoteIds = Array.from(
    new Set(lines.data.map((line) => line.supplierQuoteId).filter(Boolean))
  );
  const quotes =
    quoteIds.length > 0
      ? await client
          .from("supplierQuote")
          .select("id, supplierQuoteId")
          .in("id", quoteIds)
          .eq("companyId", companyId)
      : { data: [], error: null };

  if (quotes.error) return [];

  const quotesById = new Map(
    (quotes.data ?? []).map((quote) => [quote.id, quote])
  );

  return lines.data.map((line) => {
    const quote = quotesById.get(line.supplierQuoteId);
    return {
      id: line.id,
      documentReadableId: quote?.supplierQuoteId ?? null,
      documentId: quote?.id ?? null
    };
  });
}

export async function getMaterialUsedIn(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  const [
    issues,
    jobMaterials,
    maintenanceDispatchItems,
    methodMaterials,
    purchaseOrderLines,
    receiptLines,
    quoteMaterials,
    salesOrderLines,
    shipmentLines,
    supplierQuotes
  ] = await Promise.all([
    getNonConformanceItemReferences(client, itemId, companyId),
    getJobMaterialReferences(client, itemId, companyId),
    getMaintenanceDispatchItemReferences(client, itemId, companyId),
    getMethodMaterialReferences(client, itemId, companyId),
    getPurchaseOrderLineReferences(client, itemId, companyId),
    getReceiptLineReferences(client, itemId, companyId),
    getQuoteMaterialReferences(client, itemId, companyId),
    getSalesOrderLineReferences(client, itemId, companyId),
    getShipmentLineReferences(client, itemId, companyId),
    getSupplierQuoteLineReferences(client, itemId, companyId)
  ]);

  return {
    issues,
    jobMaterials,
    maintenanceDispatchItems,
    methodMaterials,
    purchaseOrderLines,
    receiptLines,
    quoteMaterials,
    salesOrderLines,
    shipmentLines,
    supplierQuotes
  };
}

export async function getMakeMethods(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  return client
    .from("makeMethod")
    .select("*")
    .eq("itemId", itemId)
    .eq("companyId", companyId);
}

export async function getMakeMethodById(
  client: CarbonDatabaseClient<QueryDatabase>,
  makeMethodId: string,
  companyId: string
) {
  return client
    .from("makeMethod")
    .select("*")
    .eq("id", makeMethodId)
    .eq("companyId", companyId)
    .single();
}

export async function getMaterial(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  return client
    .rpc("get_material_details", {
      item_id: itemId,
      company_id: companyId
    })
    .single();
}

export async function getMaterials(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
    supplierId: string | null;
  }
) {
  let query = client
    .from("materials")
    .select("*", {
      count: "exact"
    })
    .or(`companyId.eq.${companyId},companyId.is.null`);

  if (args.search) {
    query = query.or(
      `readableIdWithRevision.ilike.%${args.search}%,name.ilike.%${args.search}%,description.ilike.%${args.search}%,supplierIds.ilike.%${args.search}%`
    );
  }

  if (args.supplierId) {
    query = query.contains("supplierIds", [args.supplierId]);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "readableIdWithRevision", ascending: true }
  ]);
  return query;
}

export async function getMaterialsList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return fetchAllFromTable<{
    id: string;
    name: string;
    readableIdWithRevision: string;
  }>(client, "item", "id, name, readableIdWithRevision", (query) =>
    query
      .eq("type", "Material")
      .or(`companyId.eq.${companyId},companyId.is.null`)
      .eq("active", true)
      .order("name")
  );
}

export async function getMaterialDimension(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("materialDimension").select("*").eq("id", id).single();
}

export async function getMaterialDimensions(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null; isMetric: boolean }
) {
  let query = client
    .from("materialDimensions")
    .select("*", {
      count: "exact"
    })
    .eq("isMetric", args?.isMetric ?? false)
    .or(`companyId.eq.${companyId},companyId.is.null`);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "formName", ascending: true },
      { column: "name", ascending: true }
    ]);
  }

  return query;
}

export async function getMaterialDimensionList(
  client: CarbonDatabaseClient<QueryDatabase>,
  materialFormId: string,
  isMetric: boolean,
  companyId: string
) {
  return client
    .from("materialDimension")
    .select("*")
    .eq("materialFormId", materialFormId)
    .eq("isMetric", isMetric)
    .or(`companyId.eq.${companyId},companyId.is.null`);
}

export async function getMaterialFinish(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("materialFinish").select("*").eq("id", id).single();
}

export async function getMaterialFinishes(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("materialFinishes")
    .select("*", {
      count: "exact"
    })
    .or(`companyId.eq.${companyId},companyId.is.null`);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "substanceName", ascending: true },
      { column: "name", ascending: true }
    ]);
  }

  return query;
}

export async function getMaterialFinishList(
  client: CarbonDatabaseClient<QueryDatabase>,
  materialSubstanceId: string,
  companyId: string
) {
  return client
    .from("materialFinish")
    .select("*")
    .eq("materialSubstanceId", materialSubstanceId)
    .or(`companyId.eq.${companyId},companyId.is.null`);
}

export async function getMaterialForm(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("materialForm").select("*").eq("id", id).single();
}

export async function getMaterialForms(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("materialForm")
    .select("*", {
      count: "exact"
    })
    .or(`companyId.eq.${companyId},companyId.is.null`);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "name", ascending: true }
    ]);
  }

  return query;
}

export async function getMaterialFormsList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("materialForm")
    .select("id, name, code, companyId")
    .or(`companyId.eq.${companyId},companyId.is.null`)
    .order("name");
}

export async function getMaterialGrades(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("materialGrades")
    .select("*", {
      count: "exact"
    })
    .or(`companyId.eq.${companyId},companyId.is.null`);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "substanceName", ascending: true },
      { column: "name", ascending: true }
    ]);
  }

  return query;
}

export async function getMaterialGrade(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("materialGrade").select("*").eq("id", id).single();
}

export async function getMaterialGradeList(
  client: CarbonDatabaseClient<QueryDatabase>,
  materialSubstanceId: string,
  companyId: string
) {
  return client
    .from("materialGrade")
    .select("*")
    .eq("materialSubstanceId", materialSubstanceId)
    .or(`companyId.eq.${companyId},companyId.is.null`);
}

export async function getMaterialSubstance(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("materialSubstance").select("*").eq("id", id).single();
}

export async function getMaterialSubstances(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("materialSubstance")
    .select("*", {
      count: "exact"
    })
    .or(`companyId.eq.${companyId},companyId.is.null`);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "name", ascending: true }
    ]);
  }

  return query;
}

export async function getMaterialSubstancesList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("materialSubstance")
    .select("id, name, code, companyId")
    .or(`companyId.eq.${companyId},companyId.is.null`)
    .order("name");
}

export async function getMethodMaterial(
  client: CarbonDatabaseClient<QueryDatabase>,
  materialId: string,
  companyId: string
) {
  const material = await client
    .from("methodMaterial")
    .select("*")
    .eq("id", materialId)
    .eq("companyId", companyId)
    .single();

  if (material.error || !material.data) return material;

  const item = await client
    .from("item")
    .select("name")
    .eq("id", material.data.itemId)
    .eq("companyId", companyId)
    .single();

  if (item.error || !item.data) {
    return { ...material, data: null, error: item.error };
  }

  return {
    ...material,
    data: {
      ...material.data,
      item: item.data
    }
  };
}

export async function getMethodMaterials(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("methodMaterial")
    .select(
      "*, item(name, readableIdWithRevision), makeMethod!makeMethodId(item(id, type, name, readableIdWithRevision))",
      {
        count: "exact"
      }
    )
    .eq("companyId", companyId);

  if (args?.search) {
    query = query.ilike("item.readableIdWithRevision", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, []);
  }

  return query;
}

export async function getMethodMaterialsByMakeMethod(
  client: CarbonDatabaseClient<QueryDatabase>,
  makeMethodId: string,
  companyId: string
) {
  const materials = await client
    .from("methodMaterial")
    .select("*")
    .eq("makeMethodId", makeMethodId)
    .eq("companyId", companyId)
    .order("order", { ascending: true });

  if (materials.error || !materials.data) return materials;

  const itemIds = Array.from(
    new Set(materials.data.map((material) => material.itemId).filter(Boolean))
  );
  const items =
    itemIds.length > 0
      ? await client
          .from("item")
          .select("id, name, itemTrackingType, replenishmentSystem")
          .in("id", itemIds)
          .eq("companyId", companyId)
      : { data: [], error: null };

  if (items.error) {
    return { ...materials, data: [], error: items.error };
  }

  const itemsById = new Map((items.data ?? []).map((item) => [item.id, item]));

  return {
    ...materials,
    data: materials.data.map((material) => ({
      ...material,
      item: itemsById.get(material.itemId) ?? null
    }))
  };
}

export async function getMethodOperations(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("methodOperation")
    .select(
      "*, makeMethod!makeMethodId(item(id, type, name, readableIdWithRevision))",
      {
        count: "exact"
      }
    )
    .eq("companyId", companyId);

  if (args?.search) {
    query = query.ilike("description", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "order", ascending: true }
    ]);
  }

  return query;
}

export async function getMethodOperationsByMakeMethodId(
  client: CarbonDatabaseClient<QueryDatabase>,
  makeMethodId: string,
  companyId: string
) {
  const operations = await client
    .from("methodOperation")
    .select("*")
    .eq("makeMethodId", makeMethodId)
    .eq("companyId", companyId)
    .order("order", { ascending: true });

  if (operations.error || !operations.data) return operations;

  const operationIds = operations.data.map((operation) => operation.id);
  const [tools, parameters, steps] = await Promise.all([
    operationIds.length > 0
      ? client
          .from("methodOperationTool")
          .select("*")
          .in("operationId", operationIds)
          .eq("companyId", companyId)
      : { data: [], error: null },
    operationIds.length > 0
      ? client
          .from("methodOperationParameter")
          .select("*")
          .in("operationId", operationIds)
          .eq("companyId", companyId)
      : { data: [], error: null },
    operationIds.length > 0
      ? client
          .from("methodOperationStep")
          .select("*")
          .in("operationId", operationIds)
          .eq("companyId", companyId)
      : { data: [], error: null }
  ]);

  if (tools.error) return { ...operations, data: [], error: tools.error };
  if (parameters.error) {
    return { ...operations, data: [], error: parameters.error };
  }
  if (steps.error) return { ...operations, data: [], error: steps.error };

  const toolsByOperationId = new Map<string, any[]>();
  (tools.data ?? []).forEach((tool) => {
    const operationTools = toolsByOperationId.get(tool.operationId) ?? [];
    operationTools.push(tool);
    toolsByOperationId.set(tool.operationId, operationTools);
  });

  const parametersByOperationId = new Map<string, any[]>();
  (parameters.data ?? []).forEach((parameter) => {
    const operationParameters =
      parametersByOperationId.get(parameter.operationId) ?? [];
    operationParameters.push(parameter);
    parametersByOperationId.set(parameter.operationId, operationParameters);
  });

  const stepsByOperationId = new Map<string, any[]>();
  (steps.data ?? []).forEach((step) => {
    const operationSteps = stepsByOperationId.get(step.operationId) ?? [];
    operationSteps.push(step);
    stepsByOperationId.set(step.operationId, operationSteps);
  });

  return {
    ...operations,
    data: operations.data.map((operation) => ({
      ...operation,
      methodOperationTool: toolsByOperationId.get(operation.id) ?? [],
      methodOperationParameter:
        parametersByOperationId.get(operation.id) ?? [],
      methodOperationStep: stepsByOperationId.get(operation.id) ?? []
    }))
  };
}

type Method = NonNullable<
  Awaited<ReturnType<typeof getMethodTreeArray>>["data"]
>[number];
type MethodTreeItem = {
  id: string;
  data: Method;
  children: MethodTreeItem[];
};

export async function getMethodTree(
  client: CarbonDatabaseClient<QueryDatabase>,
  makeMethodId: string,
  companyId: string
) {
  const items = await getMethodTreeArray(client, makeMethodId, companyId);
  if (items.error) return items;

  const tree = getMethodTreeArrayToTree(items.data);

  return {
    data: tree,
    error: null
  };
}

export async function getMethodTreeArray(
  client: CarbonDatabaseClient<QueryDatabase>,
  makeMethodId: string,
  companyId: string
) {
  return client.rpc("get_method_tree", {
    uid: makeMethodId,
    company_id: companyId
  });
}

function getMethodTreeArrayToTree(items: Method[]): MethodTreeItem[] {
  function traverseAndRenameIds(node: MethodTreeItem) {
    const clone = structuredClone(node);
    clone.id = nanoid();
    clone.children = clone.children.map((n) => traverseAndRenameIds(n));
    return clone;
  }

  const rootItems: MethodTreeItem[] = [];
  const lookup: { [id: string]: MethodTreeItem } = {};

  for (const item of items) {
    const itemId = item.methodMaterialId;
    const parentId = item.parentMaterialId;

    if (!Object.prototype.hasOwnProperty.call(lookup, itemId)) {
      // @ts-ignore
      lookup[itemId] = { id: itemId, children: [] };
    }

    // biome-ignore lint/complexity/useLiteralKeys: suppressed due to migration
    lookup[itemId]["data"] = item;

    const treeItem = lookup[itemId];

    if (parentId === null || parentId === undefined) {
      rootItems.push(treeItem);
    } else {
      if (!Object.prototype.hasOwnProperty.call(lookup, parentId)) {
        // @ts-ignore
        lookup[parentId] = { id: parentId, children: [] };
      }

      // biome-ignore lint/complexity/useLiteralKeys: suppressed due to migration
      lookup[parentId]["children"].push(treeItem);
    }
  }

  return rootItems.map((item) => traverseAndRenameIds(item));
}

export async function getOpenJobMaterials(
  client: CarbonDatabaseClient<QueryDatabase>,
  {
    itemId,
    companyId,
    locationId
  }: { itemId: string; companyId: string; locationId: string }
) {
  return client
    .from("openJobMaterialLines")
    .select(
      "id, parentMaterialId, jobMakeMethodId, jobId, quantity:quantityToIssue, documentReadableId:jobReadableId, documentId:jobId, dueDate"
    )
    .eq("itemId", itemId)
    .eq("locationId", locationId)
    .eq("companyId", companyId);
}

export async function getOpenProductionOrders(
  client: CarbonDatabaseClient<QueryDatabase>,
  {
    itemId,
    companyId,
    locationId
  }: { itemId: string; companyId: string; locationId: string }
) {
  return client
    .from("openProductionOrders")
    .select(
      "id, quantity:quantityToReceive, documentReadableId:jobId, documentId:id, dueDate"
    )
    .eq("itemId", itemId)
    .eq("locationId", locationId)
    .eq("companyId", companyId);
}

export async function getOpenPurchaseOrderLines(
  client: CarbonDatabaseClient<QueryDatabase>,
  {
    itemId,
    companyId,
    locationId
  }: { itemId: string; companyId: string; locationId: string }
) {
  const lines = await client
    .from("openPurchaseOrderLines")
    .select(
      "id, quantity:quantityToReceive, dueDate:promisedDate, purchaseOrderId, purchaseOrderReadableId"
    )
    .eq("itemId", itemId)
    .eq("locationId", locationId)
    .eq("companyId", companyId);

  if (lines.error || !lines.data) return lines;

  return {
    ...lines,
    data: lines.data.map((line) => ({
      id: line.id,
      quantity: line.quantity,
      dueDate: line.dueDate,
      documentReadableId: line.purchaseOrderReadableId,
      documentId: line.purchaseOrderId
    }))
  };
}

export async function getOpenSalesOrderLines(
  client: CarbonDatabaseClient<QueryDatabase>,
  {
    itemId,
    companyId,
    locationId
  }: { itemId: string; companyId: string; locationId: string }
) {
  const lines = await client
    .from("openSalesOrderLines")
    .select(
      "id, quantity:quantityToSend, dueDate:promisedDate, salesOrderId"
    )
    .eq("itemId", itemId)
    .eq("companyId", companyId)
    .eq("locationId", locationId);

  if (lines.error || !lines.data) return lines;

  const salesOrderIds = Array.from(
    new Set(lines.data.map((line) => line.salesOrderId).filter(Boolean))
  );
  const salesOrders =
    salesOrderIds.length > 0
      ? await client
          .from("salesOrder")
          .select("id, salesOrderId")
          .in("id", salesOrderIds)
          .eq("companyId", companyId)
      : { data: [], error: null };

  if (salesOrders.error) {
    return { ...lines, data: [], error: salesOrders.error };
  }

  const salesOrdersById = new Map(
    (salesOrders.data ?? []).map((order) => [order.id, order])
  );

  return {
    ...lines,
    data: lines.data.map((line) => {
      const salesOrder = salesOrdersById.get(line.salesOrderId);
      return {
        id: line.id,
        quantity: line.quantity,
        dueDate: line.dueDate,
        documentReadableId: salesOrder?.salesOrderId ?? null,
        documentId: salesOrder?.id ?? null
      };
    })
  };
}

export async function getPart(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  return client
    .rpc("get_part_details", {
      item_id: itemId,
      company_id: companyId
    })
    .single();
}

export async function getParts(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
    supplierId: string | null;
  }
) {
  let query = client
    .from("parts")
    .select("*", {
      count: "exact"
    })
    .eq("companyId", companyId);

  if (args.search) {
    query = query.or(
      `readableIdWithRevision.ilike.%${args.search}%,name.ilike.%${args.search}%,description.ilike.%${args.search}%,supplierIds.ilike.%${args.search}%`
    );
  }

  if (args.supplierId) {
    query = query.contains("supplierIds", [args.supplierId]);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "readableIdWithRevision", ascending: true }
  ]);
  return query;
}

export async function getPartsList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return fetchAllFromTable<{
    id: string;
    name: string;
    readableIdWithRevision: string;
  }>(client, "item", "id, name, readableIdWithRevision", (query) =>
    query
      .eq("type", "Part")
      .eq("companyId", companyId)
      .eq("active", true)
      .order("name")
  );
}

export async function getPartUsedIn(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  const [
    issues,
    jobMaterials,
    jobs,
    maintenanceDispatchItems,
    methodMaterials,
    purchaseOrderLines,
    receiptLines,
    quoteLines,
    quoteMaterials,
    salesOrderLines,
    shipmentLines,
    supplierQuotes
  ] = await Promise.all([
    getNonConformanceItemReferences(client, itemId, companyId),
    getJobMaterialReferences(client, itemId, companyId),
    client
      .from("job")
      .select("id, documentReadableId:jobId")
      .eq("itemId", itemId)
      .eq("companyId", companyId)
      .limit(100)
      .order("createdAt", { ascending: false }),
    getMaintenanceDispatchItemReferences(client, itemId, companyId),
    getMethodMaterialReferences(client, itemId, companyId),
    getPurchaseOrderLineReferences(client, itemId, companyId),
    getReceiptLineReferences(client, itemId, companyId, { limit: true }),
    getQuoteLineReferences(client, itemId, companyId),
    getQuoteMaterialReferences(client, itemId, companyId),
    getSalesOrderLineReferences(client, itemId, companyId),
    getShipmentLineReferences(client, itemId, companyId),
    getSupplierQuoteLineReferences(client, itemId, companyId)
  ]);

  return {
    issues,
    jobMaterials,
    jobs: jobs.data ?? [],
    maintenanceDispatchItems,
    methodMaterials,
    purchaseOrderLines,
    receiptLines,
    quoteLines,
    quoteMaterials,
    salesOrderLines,
    shipmentLines,
    supplierQuotes
  };
}

export async function getPickMethod(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string,
  locationId: string
) {
  return client
    .from("pickMethod")
    .select("*")
    .eq("itemId", itemId)
    .eq("companyId", companyId)
    .eq("locationId", locationId)
    .maybeSingle();
}

export async function getPickMethods(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  return client
    .from("pickMethod")
    .select("*")
    .eq("itemId", itemId)
    .eq("companyId", companyId);
}

export async function getServices(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
    type: string | null;
    group: string | null;
    supplierId: string | null;
  }
) {
  let query = client
    .from("service")
    .select("*", {
      count: "exact"
    })
    .eq("companyId", companyId);

  if (args.search) {
    query = query.or(
      `readableIdWithRevision.ilike.%${args.search}%,name.ilike.%${args.search}%,description.ilike.%${args.search}%`
    );
  }

  if (args.type) {
    query = query.eq(
      "serviceType",
      args.type as NonNullable<"Internal" | "External">
    );
  }

  if (args.group) {
    query = query.eq("itemPostingGroupId", args.group);
  }

  if (args.supplierId) {
    query = query.contains("supplierIds", [args.supplierId]);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "readableIdWithRevision", ascending: true }
  ]);
  return query;
}

export async function getService(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  return client
    .from("service")
    .select("*")
    .eq("itemId", itemId)
    .eq("companyId", companyId)
    .single();
}

export async function getServicesList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return fetchAllFromTable<{
    id: string;
    name: string;
  }>(client, "item", "id, name", (query) =>
    query
      .eq("type", "Service")
      .eq("companyId", companyId)
      .eq("active", true)
      .order("name")
  );
}

export async function getSupplierParts(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  companyId: string,
  supplierId?: string | null
) {
  let query = client
    .from("supplierPart")
    .select("*")
    .eq("active", true)
    .eq("itemId", id)
    .eq("companyId", companyId);

  if (supplierId) {
    query = query.eq("supplierId", supplierId);
  }

  return query;
}

export async function getTool(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  return client
    .rpc("get_tool_details", {
      item_id: itemId,
      company_id: companyId
    })
    .single();
}

export async function getTools(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
    supplierId: string | null;
  }
) {
  let query = client
    .from("tools")
    .select("*", {
      count: "exact"
    })
    .eq("companyId", companyId);

  if (args.search) {
    query = query.or(
      `readableIdWithRevision.ilike.%${args.search}%,name.ilike.%${args.search}%,description.ilike.%${args.search}%,supplierIds.ilike.%${args.search}%`
    );
  }

  if (args.supplierId) {
    query = query.contains("supplierIds", [args.supplierId]);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "readableIdWithRevision", ascending: true }
  ]);
  return query;
}

export async function getToolsList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return fetchAllFromTable<{
    id: string;
    name: string;
    readableIdWithRevision: string;
  }>(client, "item", "id, name, readableIdWithRevision", (query) =>
    query
      .eq("type", "Tool")
      .eq("companyId", companyId)
      .eq("active", true)
      .order("name")
  );
}

export async function getUnitOfMeasure(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  companyId: string
) {
  return client
    .from("unitOfMeasure")
    .select("*")
    .eq("id", id)
    .eq("companyId", companyId)
    .single();
}

export async function getUnitOfMeasures(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("unitOfMeasure")
    .select("*", {
      count: "exact"
    })
    .eq("companyId", companyId);

  if (args.search) {
    query = query.or(`name.ilike.%${args.search}%,code.ilike.%${args.search}%`);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "name", ascending: true }
  ]);
  return query;
}

export async function getUnitOfMeasuresList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("unitOfMeasure")
    .select("name, code")
    .eq("companyId", companyId)
    .order("name");
}

export async function updateConfigurationParameterGroupOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  data: z.infer<typeof configurationParameterGroupOrderValidator>
) {
  return client
    .from("configurationParameterGroup")
    .update(sanitize(data))
    .eq("id", data.id);
}

export async function updateDefaultRevision(
  client: CarbonDatabaseClient<QueryDatabase>,
  data: {
    id: string;
    updatedBy: string;
  }
) {
  const [item, makeMethod] = await Promise.all([
    client
      .from("item")
      .select("id,readableId, readableIdWithRevision, type, companyId")
      .eq("id", data.id)
      .single(),
    client
      .from("activeMakeMethods")
      .select("id, version")
      .eq("itemId", data.id)
      .maybeSingle()
  ]);
  if (item.error) return item;
  const { readableId, type, companyId } = item.data;
  if (!companyId) return item;
  const relatedItems = await client
    .from("item")
    .select("id")
    .eq("readableId", readableId)
    .eq("type", type)
    .eq("companyId", companyId);

  const itemIds = relatedItems.data?.map((item) => item.id) ?? [];

  return client
    .from("methodMaterial")
    .update({
      itemId: item.data.id,
      materialMakeMethodId: makeMethod.data?.id
    })
    .in("itemId", itemIds);
}

export async function updateConfigurationParameterOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  data: Omit<
    z.infer<typeof configurationParameterOrderValidator>,
    "configurationParameterGroupId"
  > & {
    configurationParameterGroupId?: string | null;
    updatedBy: string;
  }
) {
  return client
    .from("configurationParameter")
    .update(sanitize(data))
    .eq("id", data.id);
}

export async function updateItemCost(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  cost: {
    unitCost: number;
    updatedBy: string;
  }
) {
  return client
    .from("itemCost")
    .update({
      ...cost,
      costIsAdjusted: true,
      updatedAt: today(getLocalTimeZone()).toString()
    })
    .eq("itemId", itemId)
    .single();
}

export async function updateMaterialOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  updates: {
    id: string;
    order: number;
    updatedBy: string;
  }[]
) {
  const updatePromises = updates.map(({ id, order, updatedBy }) =>
    client.from("methodMaterial").update({ order, updatedBy }).eq("id", id)
  );
  return Promise.all(updatePromises);
}

export async function updateOperationOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  updates: {
    id: string;
    order: number;
    updatedBy: string;
  }[]
) {
  const updatePromises = updates.map(({ id, order, updatedBy }) =>
    client.from("methodOperation").update({ order, updatedBy }).eq("id", id)
  );
  return Promise.all(updatePromises);
}

export async function updateRevision(
  client: CarbonDatabaseClient<QueryDatabase>,
  revision: {
    id: string;
    revision: string;
    updatedBy: string;
  }
) {
  return client
    .from("item")
    .update({
      ...revision,
      updatedAt: today(getLocalTimeZone()).toString()
    })
    .eq("id", revision.id);
}

export async function upsertConfigurationParameter(
  client: CarbonDatabaseClient<QueryDatabase>,
  configurationParameter: z.infer<typeof configurationParameterValidator> & {
    companyId: string;
    userId: string;
  }
) {
  const { userId, ...data } = configurationParameter;
  if (configurationParameter.id) {
    return client
      .from("configurationParameter")
      .update(
        sanitize({
          ...data,
          updatedBy: userId,
          updatedAt: now(getLocalTimeZone()).toAbsoluteString()
        })
      )
      .eq("id", configurationParameter.id);
  }

  let ungroupedGroupId: string | null = null;
  const existingGroups = await client
    .from("configurationParameterGroup")
    .select("id, isUngrouped, sortOrder")
    .eq("itemId", data.itemId);

  const ungroupedGroup = existingGroups.data?.find(
    (group) => group.isUngrouped
  );

  if (ungroupedGroup) {
    ungroupedGroupId = ungroupedGroup.id;
  } else {
    const maxSortOrder =
      existingGroups.data?.reduce(
        (max, group) => Math.max(max, group.sortOrder ?? 1),
        1
      ) ?? 0;
    const ungroupedGroupInsert = await client
      .from("configurationParameterGroup")
      .insert({
        itemId: data.itemId,
        name: "Ungrouped",
        isUngrouped: true,
        sortOrder: maxSortOrder + 1,
        companyId: data.companyId
      })
      .select("id")
      .single();
    if (ungroupedGroupInsert.error) return ungroupedGroupInsert;
    ungroupedGroupId = ungroupedGroupInsert.data.id;
  }

  return client.from("configurationParameter").insert({
    ...data,
    key: data.key ?? "",
    createdBy: userId,
    configurationParameterGroupId: ungroupedGroupId
  });
}

export async function upsertConfigurationParameterGroup(
  client: CarbonDatabaseClient<QueryDatabase>,
  configurationParameterGroup: z.infer<
    typeof configurationParameterGroupValidator
  > & {
    companyId: string;
    itemId: string;
  }
) {
  const { itemId, ...data } = configurationParameterGroup;
  if (configurationParameterGroup.id) {
    return client
      .from("configurationParameterGroup")
      .update({
        name: data.name
      })
      .eq("id", configurationParameterGroup.id);
  }

  const existingGroups = await client
    .from("configurationParameterGroup")
    .select("id, isUngrouped, sortOrder")
    .eq("itemId", itemId);

  const maxSortOrder =
    existingGroups.data?.reduce(
      (max, group) => Math.max(max, group.sortOrder ?? 1),
      1
    ) ?? 0;

  return client.from("configurationParameterGroup").insert({
    ...data,
    itemId,
    name: data.name,
    sortOrder: maxSortOrder + 1
  });
}

export async function upsertConfigurationRule(
  client: CarbonDatabaseClient<QueryDatabase>,
  configurationRule: z.infer<typeof configurationRuleValidator> & {
    itemId: string;
    companyId: string;
    updatedBy: string;
  }
) {
  return client.from("configurationRule").upsert(configurationRule, {
    onConflict: "itemId,field"
  });
}

/**
 * Persist (or clear) the per-item shelf-life policy. Shelf life lives on the
 * "itemShelfLife" table, keyed by itemId. Absence of a row = not managed.
 *
 * Three-way mode handling so this helper can be called from any upsert path
 * safely, including forms that don't surface the shelf-life fields:
 *   - mode undefined         -> no-op. The caller's form didn't opine on
 *                               shelf life; leave whatever row exists alone.
 *   - mode 'NotManaged'      -> explicit opt-out. DELETE any existing row.
 *   - mode 'Fixed Duration' or
 *     'Calculated'           -> UPSERT, clearing fields that don't apply to
 *                               the selected mode so stale values never leak
 *                               between modes.
 *
 * Callers on an item INSERT path should pass companyId so the helper can
 * seed a fresh row without a round-trip; on an UPDATE path where we know
 * the row already exists, companyId is optional.
 */
/**
 * Persist the user's "default storage unit" pick from the item form as a
 * row in the "pickMethod" table. Items are company-wide in Carbon;
 * per-location stocking facts live on pickMethod keyed by
 * (itemId, locationId). Writing the form pick here (rather than as
 * columns on "item") respects that boundary and lets a single item
 * accumulate multiple location defaults over time.
 *
 * The locationId for the pickMethod row is derived from the chosen
 * storageUnit (every storageUnit belongs to exactly one location), so
 * the caller only needs to pass the storageUnitId. This keeps the item
 * form to a single "Default Storage Unit" field - the location is
 * implicit.
 *
 * Semantics:
 *   - storageUnitId undefined -> no-op. Forms that don't surface this
 *     field (e.g. the manufacturing sub-form) can share an action
 *     without accidentally creating or clobbering a pickMethod row.
 *   - storageUnitId set -> UPSERT on (itemId, storageUnit.locationId).
 *     Existing defaultStorageUnit for that location is overwritten with
 *     the new pick.
 */
export async function upsertItemDefaultPickMethod(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: {
    itemId: string;
    userId: string;
    storageUnitId?: string;
  }
) {
  if (!args.storageUnitId) {
    return { data: null, error: null };
  }

  const storageUnit = await client
    .from("storageUnit")
    .select("locationId, companyId")
    .eq("id", args.storageUnitId)
    .single();
  if (storageUnit.error || !storageUnit.data) return storageUnit;

  return client.from("pickMethod").upsert(
    {
      itemId: args.itemId,
      locationId: storageUnit.data.locationId,
      defaultStorageUnitId: args.storageUnitId,
      companyId: storageUnit.data.companyId,
      createdBy: args.userId,
      updatedBy: args.userId,
      updatedAt: today(getLocalTimeZone()).toString()
    },
    { onConflict: "itemId,locationId" }
  );
}

/**
 * Return the distinct processIds referenced by methodOperation rows on the
 * item's active makeMethod. Used to scope the shelf-life trigger-process
 * picker to processes the recipe will actually run, so users can't pick a
 * process the trigger never matches against (the set-shelf-life helper short-circuits
 * on processId mismatch). Empty array when the item has no active recipe.
 */
export async function getRecipeProcessIdsForItem(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string
) {
  const makeMethod = await client
    .from("activeMakeMethods")
    .select("id")
    .eq("itemId", itemId)
    .maybeSingle();
  if (makeMethod.error || !makeMethod.data?.id) {
    return { data: [] as string[], error: makeMethod.error ?? null };
  }
  const operations = await client
    .from("methodOperation")
    .select("processId")
    .eq("makeMethodId", makeMethod.data.id);
  if (operations.error) {
    return { data: [] as string[], error: operations.error };
  }
  const ids = Array.from(
    new Set(
      (operations.data ?? [])
        .map((o) => o.processId)
        .filter((id): id is string => !!id)
    )
  );
  return { data: ids, error: null };
}

/**
 * Fetch the shelf-life policy for an item. Returns `data: null` (without
 * an error) when the item has no row, since absence = "not managed" and
 * that's a valid state we don't want to treat as an error path.
 */
export async function getItemShelfLife(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string
) {
  return client
    .from("itemShelfLife")
    .select("mode, days, triggerProcessId, triggerTiming, calculateFromBom")
    .eq("itemId", itemId)
    .maybeSingle();
}

/**
 * Returns true when the item's active make-method has at least one BOM
 * input with a managed shelf-life policy. Used to surface a warning when
 * the user picks a BOM-driven shelf-life mode (Calculated, or Fixed
 * Duration with calculateFromBom) but no input would actually contribute
 * an expiry date.
 *
 * Returns false when there is no make-method, no materials, or every
 * material has shelf-life NotManaged. Errors are coerced to false — this
 * is a UI hint, not a correctness gate.
 */
export async function getBomHasShelfLifeManagedInput(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
): Promise<boolean> {
  const makeMethods = await getMakeMethods(client, itemId, companyId);
  if (makeMethods.error || !makeMethods.data?.length) return false;

  const active =
    makeMethods.data.find((m) => m.status === "Active") ?? makeMethods.data[0];

  const materials = await getMethodMaterialsByMakeMethod(
    client,
    active.id,
    companyId
  );
  const inputItemIds = (materials.data ?? [])
    .map((m) => m.itemId)
    .filter((id): id is string => !!id);
  if (inputItemIds.length === 0) return false;

  // Any row in itemShelfLife is by definition managed - the upsert path
  // deletes the row when mode = 'NotManaged' and the column enum has no
  // such value, so presence is sufficient.
  const managed = await client
    .from("itemShelfLife")
    .select("itemId")
    .in("itemId", inputItemIds)
    .limit(1);

  return !managed.error && (managed.data?.length ?? 0) > 0;
}

export async function upsertItemShelfLife(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: {
    itemId: string;
    userId: string;
    companyId?: string;
    mode?: (typeof shelfLifeModes)[number];
    days?: number;
    triggerProcessId?: string;
    triggerTiming?: (typeof shelfLifeTriggerTimings)[number];
    calculateFromBom?: boolean;
  }
) {
  if (args.mode === undefined) {
    return { data: null, error: null };
  }

  if (args.mode === "NotManaged") {
    return client.from("itemShelfLife").delete().eq("itemId", args.itemId);
  }

  const days = args.mode === "Fixed Duration" ? (args.days ?? null) : null;
  const triggerProcessId =
    args.mode === "Fixed Duration" ? (args.triggerProcessId ?? null) : null;
  // triggerTiming only matters when there's a trigger process. Reset to the
  // default 'After' otherwise so the column never carries a stale value
  // from a prior config.
  const triggerTiming = triggerProcessId
    ? (args.triggerTiming ?? "After")
    : "After";
  // Calculate-from-BOM is meaningful only on Fixed Duration; the table
  // CHECK enforces the same rule. Coerce any stale flag back to false on
  // mode switches so the row never carries an inconsistent combo.
  const calculateFromBom =
    args.mode === "Fixed Duration" ? (args.calculateFromBom ?? false) : false;

  // Reject trigger processes that aren't on the item's active recipe.
  // The set-shelf-life helper gates on processId equality, so a process
  // outside the recipe would never match and the expiry start date would
  // silently never get set. Mirrors the guard inside
  // upsertPickMethodWithShelfLife.
  if (triggerProcessId) {
    const recipe = await getRecipeProcessIdsForItem(client, args.itemId);
    if (recipe.error) {
      return { data: null, error: recipe.error } as any;
    }
    if (!recipe.data.includes(triggerProcessId)) {
      return {
        data: null,
        error: {
          message:
            "Shelf-life trigger process must be one of the operations on this item's recipe",
          details: "",
          hint: "",
          code: "shelf_life_trigger_process_not_in_recipe"
        }
      } as any;
    }
  }

  const existing = await client
    .from("itemShelfLife")
    .select("itemId")
    .eq("itemId", args.itemId)
    .maybeSingle();

  if (existing.error) return existing;

  if (existing.data) {
    return client
      .from("itemShelfLife")
      .update({
        mode: args.mode,
        days,
        triggerProcessId,
        triggerTiming,
        calculateFromBom,
        updatedBy: args.userId,
        updatedAt: new Date().toISOString()
      })
      .eq("itemId", args.itemId);
  }

  let companyId = args.companyId;
  if (!companyId) {
    const itemRow = await client
      .from("item")
      .select("companyId")
      .eq("id", args.itemId)
      .single();
    if (itemRow.error || !itemRow.data) return itemRow;
    companyId = itemRow.data.companyId ?? undefined;
  }

  return client.from("itemShelfLife").insert({
    itemId: args.itemId,
    mode: args.mode!,
    days,
    triggerProcessId,
    triggerTiming,
    calculateFromBom,
    companyId: companyId!,
    createdBy: args.userId
  });
}

export async function upsertConsumable(
  client: CarbonDatabaseClient<QueryDatabase>,
  consumable:
    | (z.infer<typeof consumableValidator> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (z.infer<typeof consumableValidator> & {
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in consumable) {
    const itemInsert = await client
      .from("item")
      .insert({
        readableId: consumable.id,
        name: consumable.name,
        type: "Consumable",
        replenishmentSystem: consumable.replenishmentSystem,
        defaultMethodType: consumable.defaultMethodType,
        itemTrackingType: consumable.itemTrackingType,
        unitOfMeasureCode: consumable.unitOfMeasureCode,
        active: true,
        companyId: consumable.companyId,
        createdBy: consumable.createdBy
      })
      .select("id")
      .single();
    if (itemInsert.error) return itemInsert;
    const itemId = itemInsert.data?.id;

    const [consumableInsert, itemCostUpdate] = await Promise.all([
      client.from("consumable").upsert({
        id: consumable.id,
        companyId: consumable.companyId,
        createdBy: consumable.createdBy,
        customFields: consumable.customFields
      }),
      client
        .from("itemCost")
        .update(
          sanitize({
            itemPostingGroupId: consumable.postingGroupId,
            unitCost: consumable.unitCost
          })
        )
        .eq("itemId", itemId)
    ]);

    if (consumableInsert.error) return consumableInsert;
    if (itemCostUpdate.error) return itemCostUpdate;

    if (itemId) {
      const pickMethod = await upsertItemDefaultPickMethod(client, {
        itemId,
        userId: consumable.createdBy,
        storageUnitId: consumable.defaultStorageUnitId
      });
      if (pickMethod.error) return pickMethod;

      const shelfLife = await upsertItemShelfLife(client, {
        itemId,
        userId: consumable.createdBy,
        companyId: consumable.companyId,
        mode: consumable.shelfLifeMode,
        days: consumable.shelfLifeDays,
        triggerProcessId: consumable.shelfLifeTriggerProcessId,
        triggerTiming: consumable.shelfLifeTriggerTiming,
        calculateFromBom: consumable.shelfLifeCalculateFromBom
      });
      if (shelfLife.error) return shelfLife;
    }

    const newConsumable = await client
      .from("consumables")
      .select("id")
      .eq("readableId", consumable.id)
      .eq("companyId", consumable.companyId)
      .single();

    return newConsumable;
  }

  const itemUpdate = {
    id: consumable.id,
    name: consumable.name,
    description: consumable.description,
    replenishmentSystem: consumable.replenishmentSystem,
    defaultMethodType: consumable.defaultMethodType,
    itemTrackingType: consumable.itemTrackingType,
    unitOfMeasureCode: consumable.unitOfMeasureCode,
    active: true
  };

  const consumableUpdate = {
    customFields: consumable.customFields
  };

  const [updateItem, updateConsumable] = await Promise.all([
    client
      .from("item")
      .update({
        ...sanitize(itemUpdate),
        updatedAt: today(getLocalTimeZone()).toString()
      })
      .eq("id", consumable.id),
    client
      .from("consumable")
      .update({
        ...sanitize(consumableUpdate),
        updatedAt: today(getLocalTimeZone()).toString()
      })
      .eq("id", consumable.id)
  ]);

  if (updateItem.error) return updateItem;

  const pickMethod = await upsertItemDefaultPickMethod(client, {
    itemId: consumable.id,
    userId: consumable.updatedBy,
    storageUnitId: consumable.defaultStorageUnitId
  });
  if (pickMethod.error) return pickMethod;

  const shelfLife = await upsertItemShelfLife(client, {
    itemId: consumable.id,
    userId: consumable.updatedBy,
    mode: consumable.shelfLifeMode,
    days: consumable.shelfLifeDays,
    triggerProcessId: consumable.shelfLifeTriggerProcessId,
    triggerTiming: consumable.shelfLifeTriggerTiming,
    calculateFromBom: consumable.shelfLifeCalculateFromBom
  });
  if (shelfLife.error) return shelfLife;

  return updateConsumable;
}

export async function upsertPart(
  client: CarbonDatabaseClient<QueryDatabase>,
  part:
    | (z.infer<typeof partValidator> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (z.infer<typeof partValidator> & {
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in part) {
    const itemInsert = await client
      .from("item")
      .insert({
        readableId: part.id,
        revision: part.revision ?? "0",
        name: part.name,
        type: "Part",
        replenishmentSystem: part.replenishmentSystem,
        defaultMethodType: part.defaultMethodType,
        itemTrackingType: part.itemTrackingType,
        unitOfMeasureCode: part.unitOfMeasureCode,
        active: true,
        modelUploadId: part.modelUploadId,
        companyId: part.companyId,
        createdBy: part.createdBy
      })
      .select("id")
      .single();
    if (itemInsert.error) return itemInsert;
    const itemId = itemInsert.data?.id;

    const [partInsert, itemCostUpdate] = await Promise.all([
      client.from("part").upsert({
        id: part.id,
        companyId: part.companyId,
        createdBy: part.createdBy,
        customFields: part.customFields
      }),
      client
        .from("itemCost")
        .update(
          sanitize({
            itemPostingGroupId: part.postingGroupId,
            unitCost:
              part.replenishmentSystem !== "Make" ? part.unitCost : undefined
          })
        )
        .eq("itemId", itemId)
    ]);

    if (partInsert.error) return partInsert;
    if (itemCostUpdate.error) {
      console.error(itemCostUpdate.error);
    }

    if (part.replenishmentSystem !== "Buy") {
      const itemReplenishmentInsert = await client
        .from("itemReplenishment")
        .update({ lotSize: part.lotSize })
        .eq("itemId", itemId);

      if (itemReplenishmentInsert.error) return itemReplenishmentInsert;
    }

    if (itemId) {
      const pickMethod = await upsertItemDefaultPickMethod(client, {
        itemId,
        userId: part.createdBy,
        storageUnitId: part.defaultStorageUnitId
      });
      if (pickMethod.error) return pickMethod;

      const shelfLife = await upsertItemShelfLife(client, {
        itemId,
        userId: part.createdBy,
        companyId: part.companyId,
        mode: part.shelfLifeMode,
        days: part.shelfLifeDays,
        triggerProcessId: part.shelfLifeTriggerProcessId,
        triggerTiming: part.shelfLifeTriggerTiming,
        calculateFromBom: part.shelfLifeCalculateFromBom
      });
      if (shelfLife.error) return shelfLife;
    }

    const newPart = await client
      .from("parts")
      .select("id")
      .eq("readableId", part.id)
      .eq("companyId", part.companyId)
      .single();

    return newPart;
  }

  const itemUpdate = {
    id: part.id,
    name: part.name,
    description: part.description,
    replenishmentSystem: part.replenishmentSystem,
    defaultMethodType: part.defaultMethodType,
    itemTrackingType: part.itemTrackingType,
    unitOfMeasureCode: part.unitOfMeasureCode,
    active: true
  };

  const partUpdate = {
    customFields: part.customFields
  };

  const [updateItem, updatePart] = await Promise.all([
    client
      .from("item")
      .update({
        ...sanitize(itemUpdate),
        updatedAt: today(getLocalTimeZone()).toString()
      })
      .eq("id", part.id),
    client
      .from("part")
      .update({
        ...sanitize(partUpdate),
        updatedAt: today(getLocalTimeZone()).toString()
      })
      .eq("id", part.id)
  ]);

  if (updateItem.error) return updateItem;

  const pickMethod = await upsertItemDefaultPickMethod(client, {
    itemId: part.id,
    userId: part.updatedBy,
    storageUnitId: part.defaultStorageUnitId
  });
  if (pickMethod.error) return pickMethod;

  const shelfLife = await upsertItemShelfLife(client, {
    itemId: part.id,
    userId: part.updatedBy,
    mode: part.shelfLifeMode,
    days: part.shelfLifeDays,
    triggerProcessId: part.shelfLifeTriggerProcessId,
    triggerTiming: part.shelfLifeTriggerTiming,
    calculateFromBom: part.shelfLifeCalculateFromBom
  });
  if (shelfLife.error) return shelfLife;

  return updatePart;
}

export async function updateItem(
  client: CarbonDatabaseClient<QueryDatabase>,
  item: z.infer<typeof itemValidator> & {
    companyId: string;
    type: EnumValue<typeof itemTypeEnum>;
  }
) {
  return client
    .from("item")
    .update(sanitize(item))
    .eq("id", item.id)
    .eq("companyId", item.companyId);
}

export async function upsertItemCost(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemCost: z.infer<typeof itemCostValidator> & {
    updatedBy: string;
    customFields?: Json;
  }
) {
  return client
    .from("itemCost")
    .update(sanitize(itemCost))
    .eq("itemId", itemCost.itemId);
}

export async function upsertPickMethod(
  client: CarbonDatabaseClient<QueryDatabase>,
  pickMethod:
    | (z.infer<typeof pickMethodValidator> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (z.infer<typeof pickMethodValidator> & {
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in pickMethod) {
    return client.from("pickMethod").upsert(pickMethod, {
      onConflict: "itemId,locationId"
    });
  }

  return client
    .from("pickMethod")
    .update(sanitize(pickMethod))
    .eq("itemId", pickMethod.itemId)
    .eq("locationId", pickMethod.locationId);
}

export async function upsertItemManufacturing(
  client: CarbonDatabaseClient<QueryDatabase>,
  partManufacturing: z.infer<typeof itemManufacturingValidator> & {
    updatedBy: string;
    customFields?: Json;
  }
) {
  return client
    .from("itemReplenishment")
    .update(sanitize(partManufacturing))
    .eq("itemId", partManufacturing.itemId);
}

export async function upsertItemPlanning(
  client: CarbonDatabaseClient<QueryDatabase>,
  partPlanning:
    | {
        companyId: string;
        itemId: string;
        locationId: string;
        createdBy: string;
      }
    | (z.infer<typeof itemPlanningValidator> & {
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in partPlanning) {
    return client.from("itemPlanning").insert(partPlanning);
  }
  return client
    .from("itemPlanning")
    .update(sanitize(partPlanning))
    .eq("itemId", partPlanning.itemId)
    .eq("locationId", partPlanning.locationId);
}

export async function upsertItemPurchasing(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemPurchasing: z.infer<typeof itemPurchasingValidator> & {
    updatedBy: string;
  }
) {
  return client
    .from("itemReplenishment")
    .update(sanitize(itemPurchasing))
    .eq("itemId", itemPurchasing.itemId);
}

export async function upsertItemPostingGroup(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemPostingGroup:
    | (Omit<z.infer<typeof itemPostingGroupValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof itemPostingGroupValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in itemPostingGroup) {
    return client
      .from("itemPostingGroup")
      .insert([itemPostingGroup])
      .select("*")
      .single();
  }
  return (
    client
      .from("itemPostingGroup")
      .update(sanitize(itemPostingGroup))
      // @ts-ignore
      .eq("id", itemPostingGroup.id)
      .select("id")
      .single()
  );
}

export async function upsertSupplierPart(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierPart:
    | (Omit<z.infer<typeof supplierPartValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof supplierPartValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in supplierPart) {
    return client
      .from("supplierPart")
      .insert([supplierPart])
      .select("id")
      .single();
  }
  return client
    .from("supplierPart")
    .update(sanitize(supplierPart))
    .eq("id", supplierPart.id)
    .eq("itemId", supplierPart.itemId)
    .select("id")
    .single();
}

export async function upsertItemCustomerPart(
  client: CarbonDatabaseClient<QueryDatabase>,
  customerPart:
    | (Omit<z.infer<typeof customerPartValidator>, "id"> & {
        companyId: string;
      })
    | (Omit<z.infer<typeof customerPartValidator>, "id"> & {
        id: string;
      })
) {
  if ("id" in customerPart) {
    return client
      .from("customerPartToItem")
      .update(sanitize(customerPart))
      .eq("id", customerPart.id)
      .select("id")
      .single();
  }
  return client
    .from("customerPartToItem")
    .insert([customerPart])
    .select("id")
    .single();
}

export async function upsertItemUnitSalePrice(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemUnitSalePrice: z.infer<typeof itemUnitSalePriceValidator> & {
    updatedBy: string;
    customFields?: Json;
  }
) {
  return client
    .from("itemUnitSalePrice")
    .update(sanitize(itemUnitSalePrice))
    .eq("itemId", itemUnitSalePrice.itemId);
}

export async function upsertMakeMethodVersion(
  client: CarbonDatabaseClient<QueryDatabase>,
  makeMethodVersion: z.infer<typeof makeMethodVersionValidator> & {
    companyId: string;
    createdBy: string;
  }
) {
  const currentMakeMethod = await client
    .from("makeMethod")
    .select("*")
    .eq("id", makeMethodVersion.copyFromId)
    .eq("companyId", makeMethodVersion.companyId)
    .single();

  if (currentMakeMethod.error) return currentMakeMethod;

  // biome-ignore lint/correctness/noUnusedVariables: suppressed due to migration
  const { id, version, ...data } = currentMakeMethod.data;

  const insert = await client
    .from("makeMethod")
    .insert({
      ...data,
      status: "Draft",
      version: makeMethodVersion.version,
      createdBy: makeMethodVersion.createdBy
    })
    .select("id")
    .single();

  if (insert.error) return insert;

  const item = await client
    .from("item")
    .select("id, type")
    .eq("id", data.itemId)
    .eq("companyId", makeMethodVersion.companyId)
    .single();

  if (item.error || !item.data) {
    return { ...insert, data: null, error: item.error };
  }

  if (makeMethodVersion.activeVersionId) {
    await client
      .from("makeMethod")
      .update({ status: "Active" })
      .eq("id", makeMethodVersion.activeVersionId);
  }

  return {
    ...insert,
    data: {
      ...insert.data,
      itemId: item.data.id,
      type: item.data.type
    }
  };
}

/**
 * On BoM material add, seed `methodMaterial.storageUnitIds` with every
 * (locationId -> defaultStorageUnitId) pair configured for the child item
 * in "pickMethod". Values set by the caller win so downstream BoMs
 * constructed with explicit picks are untouched.
 *
 * The JSONB is modelled as Record<locationId, storageUnitId>. Reading all
 * pickMethods (rather than a single "default") matches Carbon's model
 * where an item can be stocked across multiple locations, each with its
 * own preferred bin.
 */
async function resolveMethodMaterialStorageUnitIds(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: {
    itemId?: string | null;
    current?: Record<string, string>;
  }
): Promise<Record<string, string>> {
  const current = { ...(args.current ?? {}) };
  if (!args.itemId) return current;

  const pickMethods = await client
    .from("pickMethod")
    .select("locationId, defaultStorageUnitId")
    .eq("itemId", args.itemId);

  for (const row of pickMethods.data ?? []) {
    if (
      row.locationId &&
      row.defaultStorageUnitId &&
      !current[row.locationId]
    ) {
      current[row.locationId] = row.defaultStorageUnitId;
    }
  }

  return current;
}

export async function upsertMethodMaterial(
  client: CarbonDatabaseClient<QueryDatabase>,

  methodMaterial:
    | (z.infer<typeof methodMaterialValidator> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (z.infer<typeof methodMaterialValidator> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  let materialMakeMethodId: string | null = null;
  if (methodMaterial.methodType === "Make to Order") {
    const makeMethod = await client
      .from("activeMakeMethods")
      .select("id, version")
      .eq("itemId", methodMaterial.itemId!)
      .single();

    if (makeMethod.error) return makeMethod;
    materialMakeMethodId = makeMethod.data?.id;
  }

  if ("createdBy" in methodMaterial) {
    // Seed storageUnitIds from the child item's default location/storage-unit
    // if the caller didn't already provide one for that location. Respects
    // the form value when supplied, adds a sensible default otherwise.
    const seededStorageUnitIds = await resolveMethodMaterialStorageUnitIds(
      client,
      {
        itemId: methodMaterial.itemId,
        current: methodMaterial.storageUnitIds as
          | Record<string, string>
          | undefined
      }
    );
    return client
      .from("methodMaterial")
      .insert([
        {
          ...methodMaterial,
          itemId: methodMaterial.itemId!,
          storageUnitIds: seededStorageUnitIds,
          materialMakeMethodId
        }
      ])
      .select("id")
      .single();
  }
  return client
    .from("methodMaterial")
    .update(sanitize({ ...methodMaterial, materialMakeMethodId }))
    .eq("id", methodMaterial.id)
    .select("id")
    .single();
}

export async function upsertMethodOperation(
  client: CarbonDatabaseClient<QueryDatabase>,

  methodOperation:
    | (Omit<z.infer<typeof methodOperationValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (z.infer<typeof methodOperationValidator> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof methodOperationValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in methodOperation) {
    return client
      .from("methodOperation")
      .insert([methodOperation])
      .select("id")
      .single();
  }
  return client
    .from("methodOperation")
    .update(sanitize(methodOperation))
    .eq("id", methodOperation.id)
    .select("id")
    .single();
}

export async function upsertMethodOperationStep(
  client: CarbonDatabaseClient<QueryDatabase>,
  methodOperationStep:
    | (Omit<z.infer<typeof operationStepValidator>, "id"> & {
        companyId: string;
        createdBy: string;
      })
    | (Omit<
        z.infer<typeof operationStepValidator>,
        "id" | "minValue" | "maxValue"
      > & {
        id: string;
        minValue: number | null;
        maxValue: number | null;
        updatedBy: string;
        updatedAt: string;
      })
) {
  if ("createdBy" in methodOperationStep) {
    return client
      .from("methodOperationStep")
      .insert(methodOperationStep)
      .select("id")
      .single();
  }

  return client
    .from("methodOperationStep")
    .update(sanitize(methodOperationStep))
    .eq("id", methodOperationStep.id)
    .select("id")
    .single();
}

export async function upsertMethodOperationParameter(
  client: CarbonDatabaseClient<QueryDatabase>,
  methodOperationParameter:
    | (Omit<z.infer<typeof operationParameterValidator>, "id"> & {
        companyId: string;
        createdBy: string;
      })
    | (Omit<z.infer<typeof operationParameterValidator>, "id"> & {
        id: string;
        updatedBy: string;
        updatedAt: string;
      })
) {
  if ("createdBy" in methodOperationParameter) {
    return client
      .from("methodOperationParameter")
      .insert(methodOperationParameter)
      .select("id")
      .single();
  }

  return client
    .from("methodOperationParameter")
    .update(sanitize(methodOperationParameter))
    .eq("id", methodOperationParameter.id)
    .select("id")
    .single();
}

export async function upsertMethodOperationTool(
  client: CarbonDatabaseClient<QueryDatabase>,
  methodOperationTool:
    | (Omit<z.infer<typeof operationToolValidator>, "id"> & {
        companyId: string;
        createdBy: string;
      })
    | (Omit<z.infer<typeof operationToolValidator>, "id"> & {
        id: string;
        updatedBy: string;
        updatedAt: string;
      })
) {
  if ("createdBy" in methodOperationTool) {
    return client
      .from("methodOperationTool")
      .insert(methodOperationTool)
      .select("id")
      .single();
  }

  return client
    .from("methodOperationTool")
    .update(sanitize(methodOperationTool))
    .eq("id", methodOperationTool.id)
    .select("id")
    .single();
}

export async function upsertMaterial(
  client: CarbonDatabaseClient<QueryDatabase>,
  material:
    | (z.infer<typeof materialValidator> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
        sizes?: string[];
      })
    | (z.infer<typeof materialValidator> & {
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in material) {
    // Collect every newly-created item id across the sizes / no-sizes
    // branches so the shelf-life policy can be applied uniformly.
    const newItemIds: string[] = [];

    if (material.sizes) {
      const itemInserts = await Promise.all(
        material.sizes.map((size) =>
          client
            .from("item")
            .insert({
              readableId: material.id,
              name: material.name,
              type: "Material",
              replenishmentSystem: material.replenishmentSystem,
              defaultMethodType: material.defaultMethodType,
              itemTrackingType: material.itemTrackingType,
              unitOfMeasureCode: material.unitOfMeasureCode,
              active: true,
              revision: size,
              companyId: material.companyId,
              createdBy: material.createdBy
            })
            .select("id")
            .single()
        )
      );

      const hasErrors = itemInserts.some((insert) => insert.error);
      if (hasErrors) {
        const firstError = itemInserts.find((insert) => insert.error);
        return firstError!;
      }
      for (const insert of itemInserts) {
        if (insert.data?.id) newItemIds.push(insert.data.id);
      }
      const itemCostUpdate = await Promise.all(
        itemInserts.map((insert) =>
          client
            .from("itemCost")
            .update(
              sanitize({
                itemPostingGroupId: material.postingGroupId,
                unitCost: material.unitCost
              })
            )
            .eq("itemId", insert.data?.id ?? "")
        )
      );
      if (itemCostUpdate.some((update) => update.error)) {
        console.error(itemCostUpdate.find((update) => update.error));
      }
    } else {
      const itemInsert = await client
        .from("item")
        .insert({
          readableId: material.id,
          name: material.name,
          type: "Material",
          replenishmentSystem: material.replenishmentSystem,
          defaultMethodType: material.defaultMethodType,
          itemTrackingType: material.itemTrackingType,
          unitOfMeasureCode: material.unitOfMeasureCode,
          active: true,
          companyId: material.companyId,
          createdBy: material.createdBy
        })
        .select("id")
        .single();
      if (itemInsert.error) return itemInsert;
      const itemId = itemInsert.data?.id;
      if (itemId) newItemIds.push(itemId);
      const itemCostUpdate = await client
        .from("itemCost")
        .update(
          sanitize({
            itemPostingGroupId: material.postingGroupId,
            unitCost: material.unitCost
          })
        )
        .eq("itemId", itemId);
      if (itemCostUpdate.error) {
        console.error(itemCostUpdate.error);
      }
    }

    for (const itemId of newItemIds) {
      const pickMethod = await upsertItemDefaultPickMethod(client, {
        itemId,
        userId: material.createdBy,
        storageUnitId: material.defaultStorageUnitId
      });
      if (pickMethod.error) return pickMethod;

      const shelfLife = await upsertItemShelfLife(client, {
        itemId,
        userId: material.createdBy,
        companyId: material.companyId,
        mode: material.shelfLifeMode,
        days: material.shelfLifeDays,
        triggerProcessId: material.shelfLifeTriggerProcessId,
        triggerTiming: material.shelfLifeTriggerTiming,
        calculateFromBom: material.shelfLifeCalculateFromBom
      });
      if (shelfLife.error) return shelfLife;
    }

    const materialInsert = await client.from("material").upsert({
      id: material.id,
      materialFormId: material.materialFormId,
      materialSubstanceId: material.materialSubstanceId,
      finishId: material.finishId,
      gradeId: material.gradeId,
      dimensionId: material.dimensionId,
      materialTypeId: material.materialTypeId,
      companyId: material.companyId,
      createdBy: material.createdBy,
      customFields: material.customFields
    });

    if (materialInsert.error) return materialInsert;

    const newMaterial = await client
      .from("materials")
      .select("*")
      .eq("readableId", material.id)
      .eq("companyId", material.companyId);

    return {
      data: newMaterial.data?.[0] ?? null,
      error: newMaterial.error
    };
  }

  const itemUpdate = {
    id: material.id,
    name: material.name,
    description: material.description,
    replenishmentSystem: material.replenishmentSystem,
    defaultMethodType: material.defaultMethodType,
    itemTrackingType: material.itemTrackingType,
    unitOfMeasureCode: material.unitOfMeasureCode,
    active: true
  };

  const materialUpdate = {
    materialFormId: material.materialFormId,
    materialSubstanceId: material.materialSubstanceId,
    finishId: material.finishId,
    gradeId: material.gradeId,
    dimensionId: material.dimensionId,
    materialTypeId: material.materialTypeId,
    customFields: material.customFields
  };

  const [updateItem, updateMaterial] = await Promise.all([
    client
      .from("item")
      .update({
        ...sanitize(itemUpdate),
        updatedAt: today(getLocalTimeZone()).toString()
      })
      .eq("id", material.id),
    client
      .from("material")
      .update({
        ...sanitize(materialUpdate),
        updatedAt: today(getLocalTimeZone()).toString()
      })
      .eq("id", material.id)
  ]);

  if (updateItem.error) return updateItem;

  const pickMethod = await upsertItemDefaultPickMethod(client, {
    itemId: material.id,
    userId: material.updatedBy,
    storageUnitId: material.defaultStorageUnitId
  });
  if (pickMethod.error) return pickMethod;

  const shelfLife = await upsertItemShelfLife(client, {
    itemId: material.id,
    userId: material.updatedBy,
    mode: material.shelfLifeMode,
    days: material.shelfLifeDays,
    triggerProcessId: material.shelfLifeTriggerProcessId,
    triggerTiming: material.shelfLifeTriggerTiming,
    calculateFromBom: material.shelfLifeCalculateFromBom
  });
  if (shelfLife.error) return shelfLife;

  return updateMaterial;
}

export async function upsertMaterialDimension(
  client: CarbonDatabaseClient<QueryDatabase>,
  materialDimension:
    | (Omit<z.infer<typeof materialDimensionValidator>, "id"> & {
        companyId: string;
        isMetric: boolean;
      })
    | (Omit<z.infer<typeof materialDimensionValidator>, "id"> & {
        id: string;
      })
) {
  if ("id" in materialDimension) {
    return (
      client
        .from("materialDimension")
        .update(sanitize(materialDimension))
        // @ts-ignore
        .eq("id", materialDimension.id)
        .select("id")
        .single()
    );
  }

  return client
    .from("materialDimension")
    .insert([materialDimension])
    .select("*")
    .single();
}

export async function upsertMaterialFinish(
  client: CarbonDatabaseClient<QueryDatabase>,
  materialFinish:
    | (Omit<z.infer<typeof materialFinishValidator>, "id"> & {
        companyId: string;
      })
    | (Omit<z.infer<typeof materialFinishValidator>, "id"> & {
        id: string;
      })
) {
  if ("id" in materialFinish) {
    return (
      client
        .from("materialFinish")
        .update(sanitize(materialFinish))
        // @ts-ignore
        .eq("id", materialFinish.id)
        .select("id")
        .single()
    );
  }
  return client
    .from("materialFinish")
    .insert([materialFinish])
    .select("*")
    .single();
}

export async function upsertMaterialForm(
  client: CarbonDatabaseClient<QueryDatabase>,
  materialForm:
    | (Omit<z.infer<typeof materialFormValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof materialFormValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in materialForm) {
    return client
      .from("materialForm")
      .insert([materialForm])
      .select("*")
      .single();
  }
  return (
    client
      .from("materialForm")
      .update(sanitize(materialForm))
      // @ts-ignore
      .eq("id", materialForm.id)
      .select("id")
      .single()
  );
}

export async function upsertMaterialGrade(
  client: CarbonDatabaseClient<QueryDatabase>,
  materialGrade:
    | (Omit<z.infer<typeof materialGradeValidator>, "id"> & {
        companyId: string;
      })
    | (Omit<z.infer<typeof materialGradeValidator>, "id"> & {
        id: string;
      })
) {
  if ("id" in materialGrade) {
    return (
      client
        .from("materialGrade")
        .update(sanitize(materialGrade))
        // @ts-ignore
        .eq("id", materialGrade.id)
        .select("id")
        .single()
    );
  }
  return client
    .from("materialGrade")
    .insert([materialGrade])
    .select("*")
    .single();
}

export async function deleteMaterialType(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("materialType").delete().eq("id", id);
}

export async function getMaterialTypes(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("materialTypes")
    .select("*", { count: "exact" })
    .or(`companyId.eq.${companyId},companyId.is.null`);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  query = setGenericQueryFilters(query, args ?? {});
  return query;
}

export async function getMaterialType(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("materialType").select("*").eq("id", id).single();
}

export async function getMaterialTypeList(
  client: CarbonDatabaseClient<QueryDatabase>,
  materialSubstanceId: string,
  materialFormId: string,
  companyId: string
) {
  return client
    .from("materialType")
    .select("*")
    .eq("materialSubstanceId", materialSubstanceId)
    .eq("materialFormId", materialFormId)
    .or(`companyId.eq.${companyId},companyId.is.null`);
}

export async function upsertMaterialType(
  client: CarbonDatabaseClient<QueryDatabase>,
  materialType:
    | (Omit<z.infer<typeof materialTypeValidator>, "id"> & {
        companyId: string;
      })
    | (Omit<z.infer<typeof materialTypeValidator>, "id"> & {
        id: string;
      })
) {
  if ("id" in materialType) {
    return (
      client
        .from("materialType")
        .update(sanitize(materialType))
        // @ts-ignore
        .eq("id", materialType.id)
        .select("id")
        .single()
    );
  }
  return client
    .from("materialType")
    .insert([materialType])
    .select("*")
    .single();
}

export async function upsertMaterialSubstance(
  client: CarbonDatabaseClient<QueryDatabase>,
  materialSubstance:
    | (Omit<z.infer<typeof materialSubstanceValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof materialSubstanceValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in materialSubstance) {
    return client
      .from("materialSubstance")
      .insert([materialSubstance])
      .select("*")
      .single();
  }
  return (
    client
      .from("materialSubstance")
      .update(sanitize(materialSubstance))
      // @ts-ignore
      .eq("id", materialSubstance.id)
      .select("id")
      .single()
  );
}

export async function upsertService(
  client: CarbonDatabaseClient<QueryDatabase>,
  service:
    | (z.infer<typeof serviceValidator> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof serviceValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in service) {
    const itemInsert = await client
      .from("item")
      .insert({
        readableId: service.id,
        name: service.name,
        type: "Service",
        replenishmentSystem:
          service.serviceType === "External" ? "Buy" : "Make",
        defaultMethodType:
          service.serviceType === "External"
            ? "Purchase to Order"
            : "Make to Order",
        itemTrackingType: service.itemTrackingType,
        unitOfMeasureCode: "EA",
        active: true,
        companyId: service.companyId,
        createdBy: service.createdBy
      })
      .select("id")
      .single();
    if (itemInsert.error) return itemInsert;
    const itemId = itemInsert.data?.id;

    const serviceInsert = await client
      .from("service")
      .insert({
        id: service.id,
        serviceType: service.serviceType,
        companyId: service.companyId,
        createdBy: service.createdBy,
        customFields: service.customFields
      })
      .select("*")
      .single();

    if (serviceInsert.error) return serviceInsert;

    const costUpdate = await client
      .from("itemCost")
      .update({ unitCost: service.unitCost })
      .eq("itemId", itemId)
      .select("*")
      .single();

    if (costUpdate.error) return costUpdate;

    const newService = await client
      .from("service")
      .select("*")
      .eq("readableId", service.id)
      .single();

    return newService;
  }
  const itemUpdate = {
    id: service.id,
    name: service.name,
    description: service.description,
    replenishmentSystem:
      service.serviceType === "External" ? "Buy" : ("Make" as "Buy"),
    defaultMethodType:
      service.serviceType === "External"
        ? "Purchase to Order"
        : ("Make to Order" as "Purchase to Order"),
    itemTrackingType: service.itemTrackingType,
    unitOfMeasureCode: null,
    active: true
  };

  const serviceUpdate = {
    serviceType: service.serviceType
  };

  const [updateItem, updateService] = await Promise.all([
    client
      .from("item")
      .update({
        ...sanitize(itemUpdate),
        updatedAt: today(getLocalTimeZone()).toString()
      })
      .eq("id", service.id),
    client
      .from("service")
      .update({
        ...sanitize(serviceUpdate),
        updatedAt: today(getLocalTimeZone()).toString()
      })
      .eq("itemId", service.id)
  ]);

  if (updateItem.error) return updateItem;
  return updateService;
}

export async function upsertUnitOfMeasure(
  client: CarbonDatabaseClient<QueryDatabase>,
  unitOfMeasure:
    | (Omit<z.infer<typeof unitOfMeasureValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof unitOfMeasureValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("id" in unitOfMeasure) {
    return client
      .from("unitOfMeasure")
      .update(sanitize(unitOfMeasure))
      .eq("id", unitOfMeasure.id)
      .select("id")
      .single();
  }

  return client
    .from("unitOfMeasure")
    .insert([unitOfMeasure])
    .select("id")
    .single();
}

export async function upsertTool(
  client: CarbonDatabaseClient<QueryDatabase>,
  tool:
    | (z.infer<typeof toolValidator> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (z.infer<typeof toolValidator> & {
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in tool) {
    const itemInsert = await client
      .from("item")
      .insert({
        readableId: tool.id,
        revision: tool.revision ?? "0",
        name: tool.name,
        type: "Tool",
        replenishmentSystem: tool.replenishmentSystem,
        defaultMethodType: tool.defaultMethodType,
        itemTrackingType: tool.itemTrackingType,
        unitOfMeasureCode: tool.unitOfMeasureCode,
        active: true,
        modelUploadId: tool.modelUploadId,
        companyId: tool.companyId,
        createdBy: tool.createdBy
      })
      .select("id")
      .single();
    if (itemInsert.error) return itemInsert;
    const itemId = itemInsert.data?.id;

    const [toolInsert, itemCostUpdate] = await Promise.all([
      client.from("tool").upsert({
        id: tool.id,
        companyId: tool.companyId,
        createdBy: tool.createdBy,
        customFields: tool.customFields
      }),
      client
        .from("itemCost")
        .update(
          sanitize({
            itemPostingGroupId: tool.postingGroupId,
            unitCost: tool.unitCost
          })
        )
        .eq("itemId", itemId)
    ]);

    if (toolInsert.error) return toolInsert;
    if (itemCostUpdate.error) return itemCostUpdate;

    if (itemId) {
      const pickMethod = await upsertItemDefaultPickMethod(client, {
        itemId,
        userId: tool.createdBy,
        storageUnitId: tool.defaultStorageUnitId
      });
      if (pickMethod.error) return pickMethod;

      const shelfLife = await upsertItemShelfLife(client, {
        itemId,
        userId: tool.createdBy,
        companyId: tool.companyId,
        mode: tool.shelfLifeMode,
        days: tool.shelfLifeDays,
        triggerProcessId: tool.shelfLifeTriggerProcessId,
        triggerTiming: tool.shelfLifeTriggerTiming,
        calculateFromBom: tool.shelfLifeCalculateFromBom
      });
      if (shelfLife.error) return shelfLife;
    }

    const newTool = await client
      .from("tools")
      .select("*")
      .eq("readableId", tool.id)
      .eq("companyId", tool.companyId)
      .single();

    return newTool;
  }

  const itemUpdate = {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    replenishmentSystem: tool.replenishmentSystem,
    defaultMethodType: tool.defaultMethodType,
    itemTrackingType: tool.itemTrackingType,
    unitOfMeasureCode: tool.unitOfMeasureCode,
    active: true
  };

  const toolUpdate = {
    customFields: tool.customFields
  };

  const [updateItem, updateTool] = await Promise.all([
    client
      .from("item")
      .update({
        ...sanitize(itemUpdate),
        updatedAt: today(getLocalTimeZone()).toString()
      })
      .eq("id", tool.id),
    client
      .from("tool")
      .update({
        ...sanitize(toolUpdate),
        updatedAt: today(getLocalTimeZone()).toString()
      })
      .eq("id", tool.id)
  ]);

  if (updateItem.error) return updateItem;

  const pickMethod = await upsertItemDefaultPickMethod(client, {
    itemId: tool.id,
    userId: tool.updatedBy,
    storageUnitId: tool.defaultStorageUnitId
  });
  if (pickMethod.error) return pickMethod;

  const shelfLife = await upsertItemShelfLife(client, {
    itemId: tool.id,
    userId: tool.updatedBy,
    mode: tool.shelfLifeMode,
    days: tool.shelfLifeDays,
    triggerProcessId: tool.shelfLifeTriggerProcessId,
    triggerTiming: tool.shelfLifeTriggerTiming,
    calculateFromBom: tool.shelfLifeCalculateFromBom
  });
  if (shelfLife.error) return shelfLife;

  return updateTool;
}

/**
 * Batch pre-fetch supplier price breaks for multiple items.
 * Builds a SupplierPriceMap keyed by itemId, pooling price break
 * tiers from ALL suppliers for each item.
 *
 * Used by the quote loader to pre-load pricing data for BOM costing.
 */
export async function getSupplierPriceBreaksForItems(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemIds: string[]
): Promise<SupplierPriceMap> {
  if (!itemIds.length) return {};

  const supplierParts = await client
    .from("supplierPart")
    .select("id, itemId, unitPrice")
    .in("itemId", itemIds);

  if (!supplierParts.data?.length) return {};

  const supplierPartIds = supplierParts.data.map((sp) => sp.id);

  const prices = await client
    .from("supplierPartPrice")
    .select("supplierPartId, quantity, unitPrice")
    .in("supplierPartId", supplierPartIds)
    .order("quantity", { ascending: true });

  // Build a lookup from supplierPartId → itemId
  const spToItem = new Map<string, string>();
  for (const sp of supplierParts.data) {
    spToItem.set(sp.id, sp.itemId);
  }

  const result: SupplierPriceMap = {};

  // Initialize entries with fallback prices
  for (const sp of supplierParts.data) {
    if (!result[sp.itemId]) {
      result[sp.itemId] = { priceBreaks: [], fallbackUnitPrice: null };
    }
    const current = result[sp.itemId].fallbackUnitPrice;
    if (sp.unitPrice != null && (current === null || sp.unitPrice < current)) {
      result[sp.itemId].fallbackUnitPrice = sp.unitPrice;
    }
  }

  // Add price breaks
  for (const price of prices.data ?? []) {
    const itemId = spToItem.get(price.supplierPartId);
    if (itemId && result[itemId]) {
      result[itemId].priceBreaks.push({
        quantity: price.quantity,
        unitPrice: price.unitPrice
      });
    }
  }

  return result;
}

/**
 * Async price lookup across ALL suppliers for an item.
 * Delegates to getSupplierPriceBreaksForItems + lookupBuyPriceFromMap.
 *
 * Used in quote creation where the specific supplier isn't known.
 */
export async function lookupBuyPrice(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  qty: number,
  fallbackCost: number
): Promise<number> {
  const map = await getSupplierPriceBreaksForItems(client, [itemId]);
  return lookupBuyPriceFromMap(itemId, qty, map, fallbackCost);
}

/**
 * Fetch price breaks array for a specific supplier part.
 * Used by PO and Invoice forms to cache breaks in state.
 */
export async function getSupplierPartPriceBreaks(
  client: CarbonDatabaseClient<QueryDatabase>,
  supplierPartId: string
): Promise<PriceBreak[]> {
  const result = await client
    .from("supplierPartPrice")
    .select("quantity, unitPrice")
    .eq("supplierPartId", supplierPartId)
    .order("quantity", { ascending: true });

  return (result.data ?? []).map((pb) => ({
    quantity: pb.quantity,
    unitPrice: pb.unitPrice
  }));
}

// ---------------------------------------------------------------------------
// Item Rules
// ---------------------------------------------------------------------------

type ItemRuleInsert = {
  name: string;
  description?: string | null;
  message: string;
  severity: Severity;
  conditionAst: ConditionAst;
  active: boolean;
  companyId: string;
  createdBy: string;
  customFields?: Json;
};

type ItemRuleUpdate = {
  id: string;
  name: string;
  description?: string | null;
  message: string;
  severity: Severity;
  conditionAst: ConditionAst;
  active: boolean;
  updatedBy: string;
  customFields?: Json;
};

export async function getItemRules(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("itemRule")
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

export async function getItemRule(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("itemRule").select("*").eq("id", id).single();
}

export async function getItemRulesList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return fetchAllFromTable<{
    id: string;
    name: string;
    severity: Severity;
    active: boolean;
    surfaces: TransactionSurface[];
  }>(client, "itemRule", "id, name, severity, active, surfaces", (query) =>
    query.eq("companyId", companyId).order("name")
  );
}

export async function upsertItemRule(
  client: CarbonDatabaseClient<QueryDatabase>,
  rule: ItemRuleInsert | ItemRuleUpdate
) {
  if ("createdBy" in rule) {
    return client
      .from("itemRule")
      .insert({ ...rule, conditionAst: rule.conditionAst as unknown as Json })
      .select("id")
      .single();
  }
  return client
    .from("itemRule")
    .update({
      ...sanitize(rule),
      conditionAst: rule.conditionAst as unknown as Json,
      // Full timestamp (not date-only) so the LRU cache in
      // `compileWithCache` invalidates on every edit, not once per day.
      updatedAt: now(getLocalTimeZone()).toAbsoluteString()
    })
    .eq("id", rule.id)
    .select("id")
    .single();
}

export async function deleteItemRule(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("itemRule").delete().eq("id", id);
}

/**
 * Returns active rules assigned to a specific item.
 * Single JOIN — never per-row lookups.
 */
export async function getActiveRulesForItem(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
): Promise<{ data: ItemRuleRow[]; error: unknown }> {
  const batched = await getActiveRulesForItems(client, [itemId], companyId);
  return { data: batched.data.get(itemId) ?? [], error: batched.error };
}

/**
 * Batched variant — single round-trip + JOIN for N items. Use this when
 * iterating over multiple items in one request (e.g. evaluating every line
 * on a receipt) to avoid the N+1 round-trips you'd get from calling
 * `getActiveRulesForItem` per item.
 */
export async function getActiveRulesForItems(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemIds: string[],
  companyId: string
): Promise<{ data: Map<string, ItemRuleRow[]>; error: unknown }> {
  const out = new Map<string, ItemRuleRow[]>();
  if (itemIds.length === 0) return { data: out, error: null };

  const { data, error } = await client
    .from("itemRuleAssignment")
    .select(
      `itemId, itemRule:ruleId(id, severity, message, conditionAst, surfaces, updatedAt, active)`
    )
    .in("itemId", itemIds)
    .eq("companyId", companyId);

  if (error) return { data: out, error };

  for (const r of data ?? []) {
    // the data adapter returns the joined row either as object or array depending on FK shape.
    // Cast through `unknown` because the direct query relation typing does not
    // expose this joined row shape.
    const row = r as unknown as {
      itemId: string;
      itemRule: ItemRuleRow | ItemRuleRow[] | null;
    };
    const node = Array.isArray(row.itemRule) ? row.itemRule[0] : row.itemRule;
    if (!node || node.active === false) continue;
    const bucket = out.get(row.itemId);
    if (bucket) bucket.push(node);
    else out.set(row.itemId, [node]);
  }
  return { data: out, error: null };
}

export async function getRuleAssignmentsForItem(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string,
  companyId: string
) {
  return client
    .from("itemRuleAssignment")
    .select(
      `itemId, ruleId, createdAt, itemRule:ruleId(id, name, severity, message, active, surfaces)`
    )
    .eq("itemId", itemId)
    .eq("companyId", companyId);
}

export async function getRuleAssignmentCounts(
  client: CarbonDatabaseClient<QueryDatabase>,
  ruleIds: string[]
) {
  if (ruleIds.length === 0) return { data: {}, error: null };
  const { data, error } = await client
    .from("itemRuleAssignment")
    .select("ruleId")
    .in("ruleId", ruleIds);
  if (error) return { data: {}, error };
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.ruleId] = (counts[row.ruleId] ?? 0) + 1;
  }
  return { data: counts, error: null };
}

export async function assignItemRule(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: { itemId: string; ruleId: string; companyId: string; userId: string }
) {
  return client
    .from("itemRuleAssignment")
    .insert({
      itemId: args.itemId,
      ruleId: args.ruleId,
      companyId: args.companyId,
      createdBy: args.userId
    })
    .select("itemId, ruleId")
    .single();
}

export async function unassignItemRule(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: { itemId: string; ruleId: string }
) {
  return client
    .from("itemRuleAssignment")
    .delete()
    .eq("itemId", args.itemId)
    .eq("ruleId", args.ruleId);
}
