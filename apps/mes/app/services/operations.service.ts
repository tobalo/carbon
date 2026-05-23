import { invokeFunction } from "@carbon/auth/functions.server";
import type { JSONContent } from "@carbon/react";
import { listObjects, type StorageObject } from "@carbon/storage";
import {
  type FlatTree,
  flattenTree,
  generateBomIds,
  type TrackedActivityAttributes
} from "@carbon/utils";
import { getLocalTimeZone, today } from "@internationalized/date";
import type { DatabaseQueryClient } from "@carbon/database/query-client";
import { nanoid } from "nanoid";
import type { z } from "zod";
import { sanitize } from "~/utils/query";
import type {
  documentTypes,
  nonScrapQuantityValidator,
  productionEventValidator,
  scrapQuantityValidator,
  stepRecordValidator
} from "./models";
import type { BaseOperationWithDetails, Job, StorageItem } from "./types";

function toStorageItem(
  object: StorageObject,
  bucket: string,
  itemId?: string
): StorageItem {
  return {
    id: object.key,
    name: object.name,
    metadata: { size: object.size },
    bucket,
    itemId
  };
}

export async function deleteAttributeRecord(
  client: DatabaseQueryClient,
  args: { id: string; companyId: string; userId: string }
) {
  return client
    .from("jobOperationStepRecord")
    .delete()
    .eq("id", args.id)
    .eq("companyId", args.companyId)
    .eq("createdBy", args.userId);
}

export async function finishJobOperation(
  client: DatabaseQueryClient,
  args: {
    jobOperationId: string;
    userId: string;
    companyId: string;
  }
) {
  const result = await client
    .from("jobOperation")
    .update({
      status: "Done",
      updatedBy: args.userId
    })
    .eq("id", args.jobOperationId)
    .eq("companyId", args.companyId);

  if (!result.error) {
    client
      .from("productionEvent")
      .select("id")
      .eq("jobOperationId", args.jobOperationId)
      .not("endTime", "is", null)
      .eq("postedToGL", false)
      .eq("companyId", args.companyId)
      .then((unpostedEvents) => {
        if (unpostedEvents.data?.length) {
          Promise.all(
            unpostedEvents.data.map((event) =>
              invokeFunction("post-production-event", {
                body: {
                  productionEventId: event.id,
                  userId: args.userId,
                  companyId: args.companyId
                }
              })
            )
          );
        }
      });
  }

  return result;
}

export async function getActiveJobOperationsByEmployee(
  client: DatabaseQueryClient,
  args: {
    employeeId: string;
    companyId: string;
  }
) {
  return client.rpc("get_active_job_operations_by_employee", {
    employee_id: args.employeeId,
    company_id: args.companyId
  });
}

export async function getActiveJobOperationsByLocation(
  client: DatabaseQueryClient,
  args: { locationId: string; companyId: string },
  workCenterIds: string[] = []
) {
  return client.rpc("get_active_job_operations_by_location", {
    location_id: args.locationId,
    company_id: args.companyId,
    work_center_ids: workCenterIds
  });
}

export async function getActiveJobCount(
  client: DatabaseQueryClient,
  args: {
    employeeId: string;
    companyId: string;
  }
) {
  return client.rpc("get_active_job_count", {
    employee_id: args.employeeId,
    company_id: args.companyId
  });
}

export async function getCustomers(
  client: DatabaseQueryClient,
  companyId: string,
  customerIds: string[]
) {
  return client
    .from("customer")
    .select("id, name")
    .in("id", customerIds)
    .eq("companyId", companyId);
}

export async function getFailureModesList(
  client: DatabaseQueryClient,
  companyId: string
) {
  return client
    .from("maintenanceFailureMode")
    .select("id, name")
    .eq("companyId", companyId)
    .order("name");
}

export function getFileType(fileName: string): (typeof documentTypes)[number] {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (["zip", "rar", "7z", "tar", "gz"].includes(extension)) {
    return "Archive";
  }

  if (["pdf"].includes(extension)) {
    return "PDF";
  }

  if (["doc", "docx", "txt", "rtf"].includes(extension)) {
    return "Document";
  }

  if (["ppt", "pptx"].includes(extension)) {
    return "Presentation";
  }

  if (["csv", "xls", "xlsx"].includes(extension)) {
    return "Spreadsheet";
  }

  if (["txt"].includes(extension)) {
    return "Text";
  }

  if (["png", "jpg", "jpeg", "gif", "avif"].includes(extension)) {
    return "Image";
  }

  if (["mp4", "mov", "avi", "wmv", "flv", "mkv"].includes(extension)) {
    return "Video";
  }

  if (["mp3", "wav", "wma", "aac", "ogg", "flac"].includes(extension)) {
    return "Audio";
  }

  return "Other";
}

async function attachJobOperationStepRecords(
  client: DatabaseQueryClient,
  companyId: string,
  steps: any[]
) {
  const stepIds = steps.map((step) => step.id).filter(Boolean);
  if (stepIds.length === 0) return steps;

  const records = await client
    .from("jobOperationStepRecord")
    .select("*")
    .in("jobOperationStepId", stepIds)
    .eq("companyId", companyId);

  const recordsByStepId = new Map<string, any[]>();
  records.data?.forEach((record: any) => {
    const stepRecords = recordsByStepId.get(record.jobOperationStepId) ?? [];
    stepRecords.push(record);
    recordsByStepId.set(record.jobOperationStepId, stepRecords);
  });

  return steps.map((step) => ({
    ...step,
    jobOperationStepRecord: recordsByStepId.get(step.id) ?? []
  }));
}

export async function getJobOperationProcedure(
  client: DatabaseQueryClient,
  operationId: string,
  companyId: string
) {
  const [attributes, parameters] = await Promise.all([
    client
      .from("jobOperationStep")
      .select("*")
      .eq("operationId", operationId)
      .eq("companyId", companyId),
    client
      .from("jobOperationParameter")
      .select("*")
      .eq("operationId", operationId)
      .eq("companyId", companyId)
  ]);

  return {
    attributes: await attachJobOperationStepRecords(
      client,
      companyId,
      attributes.data ?? []
    ),
    parameters: parameters.data ?? []
  };
}

export async function getJobAttributesByOperationId(
  client: DatabaseQueryClient,
  operationId: string,
  companyId: string
) {
  const attributes = await client
    .from("jobOperationStep")
    .select("*")
    .eq("operationId", operationId)
    .eq("companyId", companyId);

  return {
    ...attributes,
    data: await attachJobOperationStepRecords(
      client,
      companyId,
      attributes.data ?? []
    )
  };
}

export async function getJobByOperationId(
  client: DatabaseQueryClient,
  operationId: string,
  companyId: string
) {
  const operation = await client
    .from("jobOperation")
    .select("jobId")
    .eq("id", operationId)
    .eq("companyId", companyId)
    .single();
  if (operation.error) return operation;
  const job = await client
    .from("jobs")
    .select("*")
    .eq("id", operation.data.jobId)
    .eq("companyId", companyId)
    .single();

  if (job.error || !job.data?.customerId) return job;

  const customer = await client
    .from("customer")
    .select("name")
    .eq("id", job.data.customerId)
    .eq("companyId", companyId)
    .single();

  return {
    ...job,
    data: {
      ...job.data,
      customer: customer.data
    }
  };
}

const getItemFiles = async (
  client: DatabaseQueryClient,
  companyId: string,
  items: Array<{ itemId: string }>
) => {
  const getFile = async (id: string) => {
    const files = await listObjects({
      companyId,
      prefix: `parts/${id}`
    });

    return files.map((file) => toStorageItem(file, "parts", id));
  };

  const elems = items.map((el) => getFile(el.itemId));

  const results = await Promise.all(elems);

  return results.filter((f) => f !== null).flat();
};

export async function getJobFiles(
  client: DatabaseQueryClient,
  companyId: string,
  job: Job,
  items: Array<{ itemId: string }>
): Promise<StorageItem[]> {
  if (job.salesOrderLineId || job.quoteLineId) {
    const opportunityLine = job.salesOrderLineId || job.quoteLineId;

    const [opportunityLineFiles, jobFiles, itemFiles] = await Promise.all([
      listObjects({
        companyId,
        prefix: `opportunity-line/${opportunityLine}`
      }),
      listObjects({ companyId, prefix: `job/${job.id}` }),
      getItemFiles(client, companyId, items)
    ]);

    // Combine and return both sets of files
    return [
      ...opportunityLineFiles.map((file) =>
        toStorageItem(file, "opportunity-line")
      ),
      ...jobFiles.map((file) => toStorageItem(file, "job")),
      ...itemFiles
    ];
  } else {
    const [jobFiles, itemFiles] = await Promise.all([
      listObjects({ companyId, prefix: `job/${job.id}` }),
      getItemFiles(client, companyId, items)
    ]);

    return [
      ...jobFiles.map((file) => toStorageItem(file, "job")),
      ...itemFiles
    ];
  }
}

export async function getJobMakeMethod(
  client: DatabaseQueryClient,
  id: string,
  companyId: string
) {
  return client
    .from("jobMakeMethod")
    .select("*")
    .eq("id", id)
    .eq("companyId", companyId)
    .single();
}

export async function getJobMaterialsByOperationId(
  client: DatabaseQueryClient,
  args: {
    operation: BaseOperationWithDetails;
    trackedEntityId: string | undefined;
    requiresSerialTracking: boolean;
    companyId: string;
  }
) {
  const { operation, trackedEntityId, requiresSerialTracking, companyId } =
    args;

  const [materials, trackedInputs] = await Promise.all([
    client
      .from("jobMaterialWithMakeMethodId")
      .select("*")
      .eq("jobMakeMethodId", operation.jobMakeMethodId)
      .eq("companyId", companyId)
      .order("itemReadableId", { ascending: true })
      .order("id", { ascending: true }),
    getTrackedInputs(client, trackedEntityId, companyId)
  ]);

  const kittedMakeMethodIds = new Set(
    materials.data
      ?.filter((m) => m.kit)
      .map((m) => m.jobMaterialMakeMethodId) ?? []
  );
  if (kittedMakeMethodIds.size) {
    const kittedMaterials = await client
      .from("jobMaterialWithMakeMethodId")
      .select("*")
      .in("jobMakeMethodId", Array.from(kittedMakeMethodIds))
      .eq("companyId", companyId)
      .neq("methodType", "Make to Order");

    // Create a map of parent kit materials by their make method ID
    const kitParentMap = new Map();
    materials.data?.forEach((material) => {
      if (material.kit && material.jobMaterialMakeMethodId) {
        kitParentMap.set(material.jobMaterialMakeMethodId, material);
      }
    });

    // Add parent reference to each kitted material
    const processedKittedMaterials = (kittedMaterials.data ?? []).map(
      (material) => ({
        ...material,
        isKitComponent: true,
        kitParentId: Array.from(kitParentMap.entries()).find(
          ([makeMethodId]) => makeMethodId === material.jobMakeMethodId
        )?.[1]?.id
      })
    );

    materials.data = [...(materials.data ?? []), ...processedKittedMaterials];
  }

  // The descendant rpc doesn't return expirationDate, so look it up from
  // trackedEntity for the consumed inputs in one batched call. This lets
  // us flag materials whose CONSUMED stock is now past expiry — useful
  // when the user manually overrides a batch's expirationDate after
  // consumption (food-safety scenario: rice flour shouldn't outlive its
  // already-stale rice).
  const consumedEntityIds = Array.from(
    new Set(
      (trackedInputs.data ?? [])
        .map((input: { id?: string | null }) => input.id)
        .filter(Boolean)
    )
  );
  const todayStr = today(getLocalTimeZone()).toString();
  const expiredConsumed =
    consumedEntityIds.length > 0
      ? await client
          .from("trackedEntity")
          .select("id")
          .in("id", consumedEntityIds)
          .eq("companyId", companyId)
          .not("expirationDate", "is", null)
          .lt("expirationDate", todayStr)
      : { data: [] as { id: string }[] };
  const expiredConsumedIds = new Set(
    (expiredConsumed.data ?? []).map((r) => r.id)
  );
  const consumedExpiredFor = (materialId: string | null) =>
    (trackedInputs.data ?? []).some(
      (input: { id: string; activityAttributes?: unknown }) =>
        (input.activityAttributes as TrackedActivityAttributes)?.[
          "Job Material"
        ] === materialId && expiredConsumedIds.has(input.id)
    );

  if (requiresSerialTracking) {
    return {
      materials:
        materials.data?.map((material) => {
          const hasExpiredConsumed = consumedExpiredFor(material.id);
          if (
            !material.requiresSerialTracking &&
            !material.requiresBatchTracking
          )
            return { ...material, hasExpiredConsumed };
          const issuedForTrackedParent =
            trackedInputs.data
              ?.filter(
                (input: any) =>
                  (input.activityAttributes as TrackedActivityAttributes)?.[
                    "Job Material"
                  ] === material.id
              )
              .reduce((acc: number, input: any) => {
                return acc + input.quantity;
              }, 0) ?? 0;

          return {
            ...material,
            quantityIssued: issuedForTrackedParent,
            hasExpiredConsumed
          };
        }) ?? [],
      trackedInputs: trackedInputs.data ?? []
    };
  } else {
    return {
      materials: (materials.data ?? []).map((material) => ({
        ...material,
        hasExpiredConsumed: consumedExpiredFor(material.id)
      })),
      trackedInputs: trackedInputs.data ?? []
    };
  }
}

export async function getJobOperationsAssignedToEmployee(
  client: DatabaseQueryClient,
  employeeId: string,
  companyId: string
) {
  return client.rpc("get_assigned_job_operations", {
    user_id: employeeId,
    company_id: companyId
  });
}

export async function getJobOperations(
  client: DatabaseQueryClient,
  jobId: string,
  companyId: string
) {
  return client
    .from("jobOperation")
    .select("*")
    .eq("jobId", jobId)
    .eq("companyId", companyId)
    .order("order", { ascending: true })
    .order("createdAt", { ascending: true });
}

export async function getJobOperationDependencies(
  client: DatabaseQueryClient,
  jobId: string,
  companyId: string
) {
  return client
    .from("jobOperationDependency")
    .select("operationId, dependsOnId")
    .eq("jobId", jobId)
    .eq("companyId", companyId);
}

export async function getOpenJobs(
  client: DatabaseQueryClient,
  args: { companyId: string; locationId?: string | null }
) {
  let query = client
    .from("jobs")
    .select("*")
    .eq("companyId", args.companyId)
    .in("status", ["Ready", "In Progress", "Paused"])
    .order("dueDate", { ascending: true });

  if (args.locationId) {
    query = query.eq("locationId", args.locationId);
  }

  return query;
}

export async function getTrackedEntitiesByJobMakeMethodIds(
  client: DatabaseQueryClient,
  jobMakeMethodIds: string[],
  companyId: string
): Promise<Record<string, string | null>> {
  if (jobMakeMethodIds.length === 0) return {};

  const result = await client
    .from("trackedEntity")
    .select("id, attributes")
    .eq("companyId", companyId)
    .in("attributes->>Job Make Method", jobMakeMethodIds);

  if (result.error) {
    console.error("getTrackedEntitiesByJobMakeMethodIds error:", result.error);
    return {};
  }

  return (result.data ?? []).reduce<Record<string, string | null>>(
    (
      acc,
      trackedEntity: { id: string; attributes?: Record<string, unknown> }
    ) => {
      const jobMakeMethodId = trackedEntity.attributes?.["Job Make Method"];
      if (typeof jobMakeMethodId === "string" && !acc[jobMakeMethodId]) {
        acc[jobMakeMethodId] = trackedEntity.id;
      }
      return acc;
    },
    {}
  );
}

export async function getJobOperationById(
  client: DatabaseQueryClient,
  operationId: string,
  companyId: string
) {
  return client.rpc("get_job_operation_by_id", {
    operation_id: operationId,
    company_id: companyId
  });
}

export async function getJobOperationsByWorkCenter(
  client: DatabaseQueryClient,
  {
    locationId,
    workCenterId,
    companyId
  }: { locationId: string; workCenterId: string; companyId: string }
) {
  return client.rpc("get_job_operations_by_work_center", {
    location_id: locationId,
    work_center_id: workCenterId,
    company_id: companyId
  });
}

export async function getJobParametersByOperationId(
  client: DatabaseQueryClient,
  operationId: string
) {
  return client
    .from("jobOperationParameter")
    .select("*")
    .eq("operationId", operationId);
}

export async function getKanbanByJobId(
  client: DatabaseQueryClient,
  jobId: string | null
) {
  if (!jobId) return { data: null, error: null };
  return client.from("kanban").select("*").eq("jobId", jobId).maybeSingle();
}

export async function getLocationsByCompany(
  client: DatabaseQueryClient,
  companyId: string
) {
  return client
    .from("location")
    .select("*")
    .eq("companyId", companyId)
    .order("name", { ascending: true });
}

export async function getNonConformanceActions(
  client: DatabaseQueryClient,
  args: {
    itemId: string;
    processId: string;
    companyId: string;
  }
) {
  const result = await client.rpc("get_action_tasks_by_item_and_process", {
    p_item_id: args.itemId,
    p_process_id: args.processId,
    p_company_id: args.companyId
  });

  return (result.data ?? []) as {
    id: string;
    actionTypeName: string;
    assignee: string;
    nonConformanceId: string;
    notes: JSONContent;
  }[];
}

export async function getProcessesList(
  client: DatabaseQueryClient,
  companyId: string
) {
  return client
    .from("process")
    .select(`id, name`)
    .eq("companyId", companyId)
    .order("name");
}

export async function getProductionEventsForJobOperation(
  client: DatabaseQueryClient,
  args: {
    operationId: string;
    userId: string;
    companyId: string;
  }
) {
  return client
    .from("productionEvent")
    .select("*")
    .eq("jobOperationId", args.operationId)
    .eq("companyId", args.companyId);
}

export async function getProductionQuantitiesForJobOperation(
  client: DatabaseQueryClient,
  operationId: string,
  companyId: string
) {
  return client
    .from("productionQuantity")
    .select("*")
    .eq("jobOperationId", operationId)
    .eq("companyId", companyId);
}

export async function getRecentJobOperationsByEmployee(
  client: DatabaseQueryClient,
  args: {
    employeeId: string;
    companyId: string;
  }
) {
  return client.rpc("get_recent_job_operations_by_employee", {
    employee_id: args.employeeId,
    company_id: args.companyId
  });
}

export async function getScrapReasonsList(
  client: DatabaseQueryClient,
  companyId: string
) {
  return client
    .from("scrapReason")
    .select("id, name")
    .eq("companyId", companyId)
    .order("name");
}

export async function getTrackedEntitiesByMakeMethodId(
  client: DatabaseQueryClient,
  jobMakeMethodId: string,
  companyId: string
) {
  return client
    .from("trackedEntity")
    .select("*")
    .eq("companyId", companyId)
    .eq("attributes->>Job Make Method", jobMakeMethodId)
    .order("createdAt", { ascending: true });
}

export async function getTrackedEntity(
  client: DatabaseQueryClient,
  id: string
) {
  return client.from("trackedEntity").select("*").eq("id", id).single();
}

export async function getTrackedEntitiesByOperationId(
  client: DatabaseQueryClient,
  operationId: string,
  companyId: string
) {
  const jobOperation = await client
    .from("jobOperation")
    .select("jobMakeMethodId")
    .eq("id", operationId)
    .eq("companyId", companyId)
    .single();

  if (jobOperation.error || !jobOperation.data.jobMakeMethodId)
    return {
      data: null,
      error: jobOperation.error
    };

  return getTrackedEntitiesByMakeMethodId(
    client,
    jobOperation.data.jobMakeMethodId,
    companyId
  );
}

export async function getTrackedInputs(
  client: DatabaseQueryClient,
  trackedEntityId: string | undefined,
  companyId: string
) {
  if (!trackedEntityId) return { data: [] };
  const [inputs, outputs] = await Promise.all([
    client.rpc("get_direct_descendants_of_tracked_entity_strict", {
      p_tracked_entity_id: trackedEntityId,
      p_company_id: companyId
    }),
    client.rpc("get_direct_ancestors_of_tracked_entity_strict", {
      p_tracked_entity_id: trackedEntityId,
      p_company_id: companyId
    })
  ]);

  if (outputs.error || outputs.data.length === 0) return inputs;

  // Handle circular references while keeping only unique entities that appear more times in inputs than outputs
  const inputCounts = new Map<string, number>();
  const outputCounts = new Map<string, number>();

  // Count occurrences in inputs
  inputs.data?.forEach((input: any) => {
    inputCounts.set(input.id, (inputCounts.get(input.id) || 0) + 1);
  });

  // Count occurrences in outputs
  outputs.data?.forEach((output: any) => {
    outputCounts.set(output.id, (outputCounts.get(output.id) || 0) + 1);
  });

  // Track which IDs we've already included to avoid duplicates
  const includedIds = new Set<string>();

  const inputsWithoutCircularReferences = inputs.data?.filter((input: any) => {
    const inputCount = inputCounts.get(input.id) || 0;
    const outputCount = outputCounts.get(input.id) || 0;

    // Only include if input count > output count and we haven't included this ID yet
    if (inputCount > outputCount && !includedIds.has(input.id)) {
      includedIds.add(input.id);
      return true;
    }
    return false;
  });

  return {
    data: inputsWithoutCircularReferences,
    error: inputs.error
  };
}

export async function getThumbnailPathByItemId(
  client: DatabaseQueryClient,
  itemId: string,
  companyId: string
) {
  const { data: item } = await client
    .from("item")
    .select("thumbnailPath, modelUploadId")
    .eq("id", itemId)
    .eq("companyId", companyId)
    .single();

  if (!item) return null;

  const { thumbnailPath, modelUploadId } = item;

  if (!modelUploadId) return thumbnailPath;

  const { data: modelUpload } = await client
    .from("modelUpload")
    .select("thumbnailPath")
    .eq("id", modelUploadId)
    .eq("companyId", companyId)
    .single();

  const modelUploadThumbnailPath = modelUpload?.thumbnailPath;

  if (!thumbnailPath && modelUploadThumbnailPath) {
    return modelUploadThumbnailPath;
  }
  return thumbnailPath;
}

export async function getWorkCenter(
  client: DatabaseQueryClient,
  workCenterId: string,
  companyId: string
) {
  return client
    .from("workCentersWithBlockingStatus")
    .select(
      "id, name, isBlocked, blockingDispatchId, blockingDispatchReadableId"
    )
    .eq("id", workCenterId)
    .eq("companyId", companyId)
    .single();
}

export async function getWorkCentersByLocation(
  client: DatabaseQueryClient,
  locationId: string,
  companyId: string
) {
  // Query both views and merge - workCenters has processes, workCentersWithBlockingStatus has blocking info
  const [workCentersResult, blockingStatusResult] = await Promise.all([
    client
      .from("workCenters")
      .select("*")
      .eq("locationId", locationId)
      .eq("companyId", companyId)
      .eq("active", true)
      .order("name", { ascending: true }),
    client
      .from("workCentersWithBlockingStatus")
      .select("id, isBlocked, blockingDispatchId, blockingDispatchReadableId")
      .eq("locationId", locationId)
      .eq("companyId", companyId)
      .eq("active", true)
  ]);

  if (workCentersResult.error) {
    return workCentersResult;
  }

  // Create a map of blocking status by work center id
  const blockingStatusMap = new Map(
    blockingStatusResult.data?.map((wc) => [wc.id, wc]) ?? []
  );

  // Merge the data
  const mergedData = workCentersResult.data?.map((wc) => {
    const blockingStatus = blockingStatusMap.get(wc.id);
    return {
      ...wc,
      isBlocked: blockingStatus?.isBlocked ?? false,
      blockingDispatchId: blockingStatus?.blockingDispatchId ?? null,
      blockingDispatchReadableId:
        blockingStatus?.blockingDispatchReadableId ?? null
    };
  });

  return { data: mergedData, error: null };
}

export async function getWorkCentersByCompany(
  client: DatabaseQueryClient,
  companyId: string
) {
  return client
    .from("workCenter")
    .select("*")
    .eq("companyId", companyId)
    .order("name", { ascending: true });
}

export async function insertAttributeRecord(
  client: DatabaseQueryClient,
  data: z.infer<typeof stepRecordValidator> & {
    companyId: string;
    createdBy: string;
  }
) {
  return client.from("jobOperationStepRecord").upsert(data, {
    onConflict: "jobOperationStepId, index",
    ignoreDuplicates: false
  });
}

export async function insertReworkQuantity(
  client: DatabaseQueryClient,
  data: z.infer<typeof nonScrapQuantityValidator> & {
    companyId: string;
    createdBy: string;
  }
) {
  return client
    .from("productionQuantity")
    .insert(
      sanitize({
        ...data,
        type: "Rework"
      })
    )
    .select("*");
}

export async function insertProductionQuantity(
  client: DatabaseQueryClient,
  data: z.infer<typeof nonScrapQuantityValidator> & {
    companyId: string;
    createdBy: string;
  }
) {
  return client
    .from("productionQuantity")
    .insert(
      sanitize({
        ...data,
        type: "Production"
      })
    )
    .select("*");
}

export async function insertScrapQuantity(
  client: DatabaseQueryClient,
  data: z.infer<typeof scrapQuantityValidator> & {
    companyId: string;
    createdBy: string;
  }
) {
  return client
    .from("productionQuantity")
    .insert(
      sanitize({
        ...data,
        type: "Scrap"
      })
    )
    .select("*");
}

export async function endProductionEvent(
  client: DatabaseQueryClient,
  data: {
    id: string;
    endTime: string;
    employeeId: string;
  }
) {
  return client
    .from("productionEvent")
    .update({ endTime: data.endTime, updatedBy: data.employeeId })
    .eq("id", data.id)
    .select("*");
}

export async function endProductionEventsForJobOperation(
  client: DatabaseQueryClient,
  args: {
    jobOperationId: string;
    employeeId: string;
    companyId: string;
  }
) {
  return client
    .from("productionEvent")
    .update({ endTime: new Date().toISOString(), updatedBy: args.employeeId })
    .eq("jobOperationId", args.jobOperationId)
    .is("endTime", null)
    .eq("employeeId", args.employeeId)
    .eq("companyId", args.companyId);
}

export async function endProductionEvents(
  client: DatabaseQueryClient,
  args: { companyId: string; employeeId: string; endTime: string }
) {
  return client
    .from("productionEvent")
    .update({
      endTime: args.endTime
    })
    .is("endTime", null)
    .eq("employeeId", args.employeeId)
    .eq("companyId", args.companyId);
}

export async function endProductionEventsByWorkCenter(
  client: DatabaseQueryClient,
  args: { workCenterId: string; companyId: string; endTime: string }
) {
  return client
    .from("productionEvent")
    .update({
      endTime: args.endTime
    })
    .is("endTime", null)
    .eq("workCenterId", args.workCenterId)
    .eq("companyId", args.companyId);
}

export async function startProductionEvent(
  client: DatabaseQueryClient,
  data: Omit<
    z.infer<typeof productionEventValidator>,
    "id" | "action" | "timezone" | "hasActiveEvents"
  > & {
    startTime: string;
    employeeId: string;
    companyId: string;
    createdBy: string;
  },
  trackedEntityId: string | undefined
) {
  if (trackedEntityId) {
    const activityId = nanoid();

    const [eventInsert, operation] = await Promise.all([
      client.from("productionEvent").insert(data).select("id").single(),
      client
        .from("jobOperation")
        .select("*")
        .eq("id", data.jobOperationId)
        .eq("companyId", data.companyId)
        .single()
    ]);

    if (eventInsert.error) return eventInsert;
    if (operation.error) return operation;

    const trackedActivityInsert = await client
      .from("trackedActivity")
      .insert({
        id: activityId,
        type: `${operation.data?.description} (${data.type})`,
        sourceDocument: "Production Event",
        sourceDocumentId: eventInsert.data?.id,
        attributes: {
          Job: operation.data?.jobId,
          "Job Operation": data.jobOperationId,
          "Production Event": eventInsert.data?.id,
          "Work Center": data.workCenterId,
          Employee: data.employeeId
        },
        companyId: data.companyId,
        createdBy: data.createdBy
      })
      .select("id")
      .single();

    if (trackedActivityInsert.error) {
      console.error(trackedActivityInsert.error);
      return trackedActivityInsert;
    }

    const trackedActivityOutputInsert = await client
      .from("trackedActivityOutput")
      .insert({
        trackedActivityId: activityId,
        trackedEntityId,
        quantity: 1,
        companyId: data.companyId,
        createdBy: data.createdBy
      });

    if (trackedActivityOutputInsert.error) {
      console.error(trackedActivityOutputInsert.error);
      return trackedActivityOutputInsert;
    }

    return eventInsert;
  }

  return client.from("productionEvent").insert(data).select("*");
}

type JobMethod = {
  id: string;
  methodMaterialId: string;
  parentMaterialId: string | null;
  [key: string]: unknown;
};

type JobMethodTreeItem = {
  id: string;
  data: JobMethod;
  children: JobMethodTreeItem[];
};

function arrayToTree(items: JobMethod[]): JobMethodTreeItem[] {
  const rootItems: JobMethodTreeItem[] = [];
  const lookup: { [id: string]: JobMethodTreeItem } = {};

  for (const item of items) {
    const itemId = item.methodMaterialId;
    const parentId = item.parentMaterialId;

    if (!Object.prototype.hasOwnProperty.call(lookup, itemId)) {
      // @ts-expect-error - building tree incrementally
      lookup[itemId] = { id: itemId, children: [] };
    }

    lookup[itemId].data = item;

    const treeItem = lookup[itemId];

    if (parentId === null || parentId === undefined) {
      rootItems.push(treeItem);
    } else {
      if (!Object.prototype.hasOwnProperty.call(lookup, parentId)) {
        // @ts-expect-error - building tree incrementally
        lookup[parentId] = { id: parentId, children: [] };
      }
      lookup[parentId].children.push(treeItem);
    }
  }
  return rootItems;
}

/**
 * Fetches the job method tree and generates BOM IDs.
 * Returns a map of methodMaterialId to hierarchical BOM ID (e.g., "1.2.3").
 */
export async function getJobMethodBomIdMap(
  client: DatabaseQueryClient,
  jobId: string,
  companyId: string
): Promise<Map<string, string>> {
  const result = await client.rpc("get_job_method", {
    jid: jobId,
    company_id: companyId
  });

  if (result.error || !result.data?.length) {
    return new Map();
  }

  const tree = arrayToTree(result.data as unknown as JobMethod[]);
  if (tree.length === 0) {
    return new Map();
  }

  // Flatten tree and generate BOM IDs
  const flatMethods: FlatTree<JobMethod> = flattenTree(tree[0]);
  const bomIds = generateBomIds(flatMethods);

  // Create map of methodMaterialId to BOM ID
  const bomIdMap = new Map<string, string>();
  flatMethods.forEach((node, index) => {
    bomIdMap.set(node.data.methodMaterialId, bomIds[index]);
  });

  return bomIdMap;
}
