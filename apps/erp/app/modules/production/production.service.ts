import { invokeFunction } from "@carbon/auth/functions.server";
import type {
  Json,
  QueryDatabase
} from "@carbon/database/schema";
import { fetchAllFromTable } from "@carbon/database";
import type { JSONContent } from "@carbon/react";
import { parseDate } from "@internationalized/date";
import { listObjects, toStorageFileObject } from "@carbon/storage";
import type { QueryError, CarbonDatabaseClient } from "@carbon/database/query-client";
import type { z } from "zod";
import type { StorageItem } from "~/types";
import type { GenericQueryFilters } from "~/utils/query";
import { setGenericQueryFilters } from "~/utils/query";
import { sanitize } from "@carbon/utils";
import { getDefaultStorageUnitForJob } from "../inventory";
import type {
  operationParameterValidator,
  operationStepValidator,
  operationToolValidator
} from "../shared";
import type {
  deadlineTypes,
  failureModeValidator,
  jobMaterialValidator,
  jobOperationStatus,
  jobOperationValidator,
  jobStatus,
  jobValidator,
  maintenanceDispatchCommentValidator,
  maintenanceDispatchEventValidator,
  maintenanceDispatchItemValidator,
  maintenanceDispatchValidator,
  maintenanceDispatchWorkCenterValidator,
  maintenanceScheduleItemValidator,
  maintenanceScheduleValidator,
  procedureParameterValidator,
  procedureStepValidator,
  procedureValidator,
  productionEventValidator,
  productionQuantityValidator,
  scrapReasonValidator
} from "./production.models";
import type { Job } from "./types";

export async function convertSalesOrderLinesToJobs(
  client: CarbonDatabaseClient<QueryDatabase>,
  {
    orderId,
    companyId,
    userId
  }: {
    orderId: string;
    companyId: string;
    userId: string;
  }
) {
  const salesOrder = await client
    .from("salesOrder")
    .select("*")
    .eq("id", orderId)
    .single();

  const salesOrderLines = await client
    .from("salesOrderLines")
    .select("*")
    .eq("salesOrderId", orderId)
    .order("itemReadableId", { ascending: true });

  if (companyId !== salesOrder.data?.companyId) {
    return { data: null, error: "Company ID mismatch" };
  }

  if (salesOrder.error) {
    return salesOrder;
  }

  if (salesOrderLines.error) {
    return salesOrderLines;
  }

  const lines = salesOrderLines.data;
  if (!lines) {
    return { data: null, error: "No lines found" };
  }

  const opportunityId = salesOrder.data?.opportunityId;
  const [quote, opportunitySalesOrder] = await Promise.all([
    opportunityId
      ? client
          .from("quote")
          .select("id")
          .eq("opportunityId", opportunityId)
          .eq("companyId", companyId)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    opportunityId
      ? client
          .from("salesOrder")
          .select("id")
          .eq("opportunityId", opportunityId)
          .eq("companyId", companyId)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);

  if (quote.error) return quote;
  if (opportunitySalesOrder.error) return opportunitySalesOrder;

  const quoteId = quote.data?.id;
  const salesOrderId = opportunitySalesOrder.data?.id;

  const errors: string[] = [];
  let jobsCreated = 0;

  for await (const line of lines) {
    if (line.methodType === "Make to Order" && line.itemId) {
      const manufacturing = await client
        .from("itemReplenishment")
        .select("*")
        .eq("itemId", line.itemId)
        .eq("companyId", companyId)
        .single();

      const lotSize = manufacturing.data?.lotSize ?? 0;
      const totalQuantity = line.saleQuantity ?? 0;
      const totalJobs = lotSize > 0 ? Math.ceil(totalQuantity / lotSize) : 1;

      const jobsToCreate = Math.max(1, totalJobs);

      const defaultLocation = await client
        .from("location")
        .select("id")
        .eq("companyId", companyId)
        .limit(1);

      for await (const index of Array.from({ length: jobsToCreate }).keys()) {
        const nextSequence = await client.rpc("get_next_sequence", {
          sequence_name: "job",
          company_id: companyId
        });

        if (!nextSequence.data) {
          errors.push(`Failed to get sequence for line ${line.itemReadableId}`);
          continue;
        }

        const isLastJob = index === jobsToCreate - 1;
        const jobQuantity =
          lotSize > 0
            ? isLastJob
              ? totalQuantity - lotSize * (jobsToCreate - 1)
              : lotSize
            : totalQuantity;

        const dueDate = line.promisedDate ?? undefined;

        let locationId = line.locationId ?? salesOrder.data?.locationId;
        if (!locationId) {
          if (defaultLocation.data && defaultLocation.data.length > 0) {
            locationId = defaultLocation.data?.[0]?.id;
          } else {
            errors.push(`No location found for line ${line.itemReadableId}`);
            continue;
          }
        }

        const storageUnitId = await getDefaultStorageUnitForJob(
          client,
          line.itemId,
          locationId!,
          companyId
        );

        // Calculate scrap quantity based on item's scrap percentage
        const scrapPercentage = manufacturing.data?.scrapPercentage ?? 0;
        const scrapQuantity =
          scrapPercentage > 0 ? Math.ceil(jobQuantity * scrapPercentage) : 0;

        const data = {
          customerId: salesOrder.data?.customerId ?? undefined,
          deadlineType: "Hard Deadline" as const,
          dueDate,
          startDate: dueDate
            ? parseDate(dueDate)
                .subtract({ days: manufacturing.data?.leadTime ?? 7 })
                .toString()
            : undefined,
          itemId: line.itemId,
          locationId: locationId!,
          modelUploadId: line.modelUploadId ?? undefined,
          quantity: jobQuantity,
          quoteId: quoteId ?? undefined,
          quoteLineId: quoteId ? line.id : undefined,
          salesOrderId: salesOrderId ?? undefined,
          salesOrderLineId: line.id,
          scrapQuantity,
          storageUnitId: storageUnitId ?? undefined,
          unitOfMeasureCode: line.unitOfMeasureCode ?? "EA"
        };

        // Calculate priority based on due date and deadline type
        const priority = await calculateJobPriority(client, {
          dueDate: data.dueDate ?? null,
          deadlineType: data.deadlineType,
          companyId,
          locationId: locationId!
        });

        const createJob = await client
          .from("job")
          .insert({
            ...data,
            jobId: nextSequence.data,
            priority,
            companyId,
            createdBy: userId,
            updatedBy: userId
          })
          .select("id")
          .single();

        if (createJob.error) {
          errors.push(
            `Failed to create job for line ${line.itemReadableId}: ${createJob.error.message}`
          );
          continue;
        }

        if (quoteId) {
          const upsertMethod = await invokeFunction("get-method", {
            body: {
              type: "quoteLineToJob",
              sourceId: `${quoteId}:${line.id}`,
              targetId: createJob.data.id,
              companyId,
              userId
            }
          });

          if (upsertMethod.error) {
            errors.push(
              `Failed to create method for job ${nextSequence.data} (Line item ${line.itemReadableId}): ${upsertMethod.error.message}`
            );
            continue;
          }
        } else {
          const upsertMethod = await invokeFunction("get-method", {
            body: {
              type: "itemToJob",
              sourceId: data.itemId,
              targetId: createJob.data.id,
              companyId,
              userId
            }
          });

          if (upsertMethod.error) {
            errors.push(
              `Failed to create method for job ${nextSequence.data} (Line item ${line.itemReadableId}): ${upsertMethod.error.message}`
            );
            continue;
          }
        }

        await invokeFunction("recalculate", {
          body: {
            type: "jobRequirements",
            id: createJob.data.id,
            companyId,
            userId
          }
        });

        jobsCreated++;
      }
    }
  }

  if (errors.length > 0) {
    console.error(errors);
    return {
      data: null,
      error: {
        message: `Failed to create ${errors.length} job(s). ${errors.join(
          "; "
        )}`,
        details: errors.join("; "),
        code: "JOB_CREATION_ERROR"
      } as QueryError
    };
  }

  if (jobsCreated === 0) {
    const skippedLines = lines.map((l) => l.itemReadableId).filter(Boolean);
    const skippedLinesStr =
      skippedLines.length > 0
        ? ` (Lines checked: ${skippedLines.join(", ")})`
        : "";
    return {
      data: null,
      error: {
        message: "No jobs were created",
        details: `No Make items found on sales order lines${skippedLinesStr}`,
        code: "NO_JOBS_CREATED"
      } as QueryError
    };
  }

  return salesOrder;
}

/**
 * Calculate the priority for a job based on its dueDate and deadlineType.
 * Priority ordering: ASAP > Hard Deadline > Soft Deadline > No Deadline
 *
 * @param client - Carbon database client
 * @param params - Job details
 * @returns The calculated priority number
 */
export async function calculateJobPriority(
  client: CarbonDatabaseClient<QueryDatabase>,
  params: {
    jobId?: string; // Optional - if updating an existing job
    dueDate: string | null;
    deadlineType: (typeof deadlineTypes)[number];
    companyId: string;
    locationId: string;
  }
): Promise<number> {
  const { jobId, dueDate, deadlineType, companyId, locationId } = params;

  // Define deadline type priority order (lower number = higher priority)
  const deadlineTypePriority: Record<string, number> = {
    ASAP: 0,
    "Hard Deadline": 1,
    "Soft Deadline": 2,
    "No Deadline": 3
  };

  const currentJobPriority = deadlineTypePriority[deadlineType];

  // Query all jobs with the same dueDate (or null if dueDate is null)
  let query = client
    .from("job")
    .select("id, priority, deadlineType")
    .eq("companyId", companyId)
    .eq("locationId", locationId)
    .order("priority", { ascending: true });

  if (dueDate) {
    query = query.eq("dueDate", dueDate);
  } else {
    query = query.is("dueDate", null);
  }

  // Exclude the current job if we're updating
  if (jobId) {
    query = query.neq("id", jobId);
  }

  const { data: existingJobs } = await query;

  if (!existingJobs || existingJobs.length === 0) {
    // No existing jobs with this due date, start at priority 0
    return 0;
  }

  // Find the position where this job should be inserted based on deadlineType
  let insertBeforeIndex = existingJobs.length; // Default to end of list

  for (let i = 0; i < existingJobs.length; i++) {
    const existingJobPriority =
      deadlineTypePriority[existingJobs[i].deadlineType];

    // If the current job has higher priority (lower number) than this existing job,
    // we should insert before this job
    if (currentJobPriority < existingJobPriority) {
      insertBeforeIndex = i;
      break;
    }
  }

  // Calculate the priority value using fractional indexing
  let newPriority: number;

  if (insertBeforeIndex === 0) {
    // Insert at the beginning - use half of the first job's priority
    const firstPriority = existingJobs[0].priority ?? 0;
    newPriority = firstPriority > 0 ? firstPriority / 2 : -1;
  } else if (insertBeforeIndex === existingJobs.length) {
    // Insert at the end - add 1 to the last job's priority
    const lastPriority = existingJobs[existingJobs.length - 1].priority ?? 0;
    newPriority = lastPriority + 1;
  } else {
    // Insert between two jobs - average their priorities
    const beforePriority = existingJobs[insertBeforeIndex - 1].priority ?? 0;
    const afterPriority = existingJobs[insertBeforeIndex].priority ?? 0;
    newPriority = (beforePriority + afterPriority) / 2;
  }

  return newPriority;
}

export async function deleteDemandForecasts(
  client: CarbonDatabaseClient<QueryDatabase>,
  params: {
    itemId: string;
    locationId: string;
    companyId: string;
    futurePeriodIds: string[];
  }
) {
  const { itemId, locationId, companyId, futurePeriodIds } = params;

  const result = await client
    .from("demandForecast")
    .delete()
    .eq("itemId", itemId)
    .eq("locationId", locationId)
    .eq("companyId", companyId)
    .in("periodId", futurePeriodIds);

  return {
    data: result.data,
    error: result.error
  };
}

export async function deleteDemandProjections(
  client: CarbonDatabaseClient<QueryDatabase>,
  params: {
    itemId: string;
    locationId: string;
    companyId: string;
    futurePeriodIds: string[];
  }
) {
  const { itemId, locationId, companyId, futurePeriodIds } = params;

  const result = await client
    .from("demandProjection")
    .delete()
    .eq("itemId", itemId)
    .eq("locationId", locationId)
    .eq("companyId", companyId)
    .in("periodId", futurePeriodIds);

  return {
    data: result.data,
    error: result.error
  };
}

export async function deleteJob(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobId: string
) {
  return client.from("job").delete().eq("id", jobId);
}

export async function deleteJobMaterial(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobMaterialId: string
) {
  return client.from("jobMaterial").delete().eq("id", jobMaterialId);
}

export async function deleteJobOperation(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobOperationId: string
) {
  return client.from("jobOperation").delete().eq("id", jobOperationId);
}

export async function deleteJobOperationStep(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("jobOperationStep").delete().eq("id", id);
}

export async function deleteJobOperationParameter(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("jobOperationParameter").delete().eq("id", id);
}

export async function deleteJobOperationTool(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("jobOperationTool").delete().eq("id", id);
}

export async function deleteProcedure(
  client: CarbonDatabaseClient<QueryDatabase>,
  procedureId: string
) {
  return client.from("procedure").delete().eq("id", procedureId);
}

export async function deleteProcedureStep(
  client: CarbonDatabaseClient<QueryDatabase>,
  procedureStepId: string,
  companyId: string
) {
  return client
    .from("procedureStep")
    .delete()
    .eq("id", procedureStepId)
    .eq("companyId", companyId);
}

export async function deleteProcedureParameter(
  client: CarbonDatabaseClient<QueryDatabase>,
  procedureParameterId: string,
  companyId: string
) {
  return client
    .from("procedureParameter")
    .delete()
    .eq("id", procedureParameterId)
    .eq("companyId", companyId);
}

export async function deleteProductionEvent(
  client: CarbonDatabaseClient<QueryDatabase>,
  productionEventId: string
) {
  return client.from("productionEvent").delete().eq("id", productionEventId);
}

export async function deleteProductionQuantity(
  client: CarbonDatabaseClient<QueryDatabase>,
  productionQuantityId: string
) {
  return client
    .from("productionQuantity")
    .delete()
    .eq("id", productionQuantityId);
}

export async function getActiveJobOperationByJobId(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobId: string,
  companyId: string
): Promise<{
  id: string;
  setupTime: number;
  laborTime: number;
  machineTime: number;
} | null> {
  const jobMakeMethod = await client
    .from("jobMakeMethod")
    .select("id")
    .eq("jobId", jobId)
    .is("parentMaterialId", null)
    .eq("companyId", companyId)
    .maybeSingle();

  if (jobMakeMethod.error || !jobMakeMethod.data) {
    return null;
  }

  const jobOperations = await client
    .from("jobOperation")
    .select("id, setupTime, laborTime, machineTime")
    .eq("jobMakeMethodId", jobMakeMethod.data?.id!)
    .eq("companyId", companyId)
    .in("status", ["Todo", "Ready", "In Progress", "Waiting", "Paused"])
    .order("order", { ascending: true })
    .limit(1);

  if (jobOperations.error || !jobOperations.data) {
    return null;
  }

  return jobOperations.data[0];
}

export async function getActiveJobOperationsByLocation(
  client: CarbonDatabaseClient<QueryDatabase>,
  locationId: string,
  companyId: string,
  workCenterIds: string[] = []
) {
  return client.rpc("get_active_job_operations_by_location", {
    location_id: locationId,
    company_id: companyId,
    work_center_ids: workCenterIds
  });
}

export async function getJobsByDateRange(
  client: CarbonDatabaseClient<QueryDatabase>,
  locationId: string,
  companyId: string,
  startDate: string,
  endDate: string
) {
  return client.rpc("get_jobs_by_date_range", {
    location_id: locationId,
    company_id: companyId,
    start_date: startDate,
    end_date: endDate
  });
}

export async function getUnscheduledJobs(
  client: CarbonDatabaseClient<QueryDatabase>,
  locationId: string,
  companyId: string
) {
  return client.rpc("get_unscheduled_jobs", {
    location_id: locationId,
    company_id: companyId
  });
}

export async function getActiveProductionEvents(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("productionEvent")
    .select(
      "*, ...jobOperation(description, ...job(jobId:id, jobReadableId:jobId, customerId, dueDate, deadlineType, salesOrderLineId, ...salesOrderLine(...salesOrder(salesOrderId:id, salesOrderReadableId:salesOrderId))))"
    )
    .eq("companyId", companyId)
    .is("endTime", null);
}

export async function deleteScrapReason(
  client: CarbonDatabaseClient<QueryDatabase>,
  scrapReasonId: string
) {
  return client.from("scrapReason").delete().eq("id", scrapReasonId);
}

export async function deleteFailureMode(
  client: CarbonDatabaseClient<QueryDatabase>,
  failureModeId: string
) {
  return client.from("maintenanceFailureMode").delete().eq("id", failureModeId);
}

export async function deleteMaintenanceDispatch(
  client: CarbonDatabaseClient<QueryDatabase>,
  dispatchId: string
) {
  return client.from("maintenanceDispatch").delete().eq("id", dispatchId);
}

export async function deleteMaintenanceDispatchComment(
  client: CarbonDatabaseClient<QueryDatabase>,
  commentId: string
) {
  return client.from("maintenanceDispatchComment").delete().eq("id", commentId);
}

export async function deleteMaintenanceDispatchEvent(
  client: CarbonDatabaseClient<QueryDatabase>,
  eventId: string
) {
  return client.from("maintenanceDispatchEvent").delete().eq("id", eventId);
}

export async function deleteMaintenanceDispatchItem(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string
) {
  return client.from("maintenanceDispatchItem").delete().eq("id", itemId);
}

export async function deleteMaintenanceDispatchWorkCenter(
  client: CarbonDatabaseClient<QueryDatabase>,
  workCenterId: string
) {
  return client
    .from("maintenanceDispatchWorkCenter")
    .delete()
    .eq("id", workCenterId);
}

export async function deleteMaintenanceSchedule(
  client: CarbonDatabaseClient<QueryDatabase>,
  scheduleId: string
) {
  return client.from("maintenanceSchedule").delete().eq("id", scheduleId);
}

export async function deleteMaintenanceScheduleItem(
  client: CarbonDatabaseClient<QueryDatabase>,
  itemId: string
) {
  return client.from("maintenanceScheduleItem").delete().eq("id", itemId);
}

export async function getDemandForecasts(
  client: CarbonDatabaseClient<QueryDatabase>,
  params: {
    itemId: string;
    locationId: string;
    companyId: string;
    periodIds: string[];
  }
) {
  return client
    .from("demandForecast")
    .select("*")
    .eq("itemId", params.itemId)
    .eq("locationId", params.locationId)
    .eq("companyId", params.companyId)
    .in("periodId", params.periodIds);
}

export async function getDemandProjections(
  client: CarbonDatabaseClient<QueryDatabase>,
  params: {
    itemId: string;
    locationId: string;
    companyId: string;
    periodIds: string[];
  }
) {
  return client
    .from("demandProjection")
    .select("*")
    .eq("itemId", params.itemId)
    .eq("locationId", params.locationId)
    .eq("companyId", params.companyId)
    .in("periodId", params.periodIds);
}

async function listStorageItems(
  companyId: string,
  prefix: string,
  bucket: string,
  extra: Partial<StorageItem> = {}
): Promise<StorageItem[]> {
  const objects = await listObjects({ companyId, prefix });
  return objects.map(
    (object) =>
      ({
        ...toStorageFileObject(object, "private"),
        bucket,
        ...extra
      }) as StorageItem
  );
}

export async function getJobDocuments(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  job: {
    id: string | null;
    salesOrderLineId?: string | null;
    quoteLineId?: string | null;
    itemId?: string | null;
  }
): Promise<StorageItem[]> {
  const promises: Promise<StorageItem[]>[] = [
    listStorageItems(companyId, `${companyId}/job/${job.id}`, "job")
  ];

  // Add opportunity line files if available
  if (job.salesOrderLineId || job.quoteLineId) {
    const opportunityLine = job.salesOrderLineId || job.quoteLineId;
    promises.push(
      listStorageItems(
        companyId,
        `${companyId}/opportunity-line/${opportunityLine}`,
        "opportunity-line"
      )
    );
  }

  // Add parts files if itemId is available
  if (job.itemId) {
    promises.push(
      listStorageItems(companyId, `${companyId}/parts/${job.itemId}`, "parts")
    );
  }

  const results = await Promise.all(promises);
  return results.flat();
}

export const getPartDocuments = async (
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  ...items: Array<{ itemId: string }>
) => {
  const getFile = async (id: string) => {
    return listStorageItems(companyId, `${companyId}/parts/${id}`, "parts", {
      itemId: id
    });
  };

  const elems = items.map((el) => getFile(el.itemId));

  const results = await Promise.all(elems);

  return results.flat();
};

export async function getJobDocumentsWithItemId(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  job: Job,
  itemId: string
): Promise<StorageItem[]> {
  const itemFiles = await getPartDocuments(client, companyId, { itemId });

  if (job.salesOrderLineId || job.quoteLineId) {
    const opportunityLine = job.salesOrderLineId || job.quoteLineId;

    const [opportunityLineFiles, jobFiles] = await Promise.all([
      listStorageItems(
        companyId,
        `${companyId}/opportunity-line/${opportunityLine}`,
        "opportunity-line"
      ),
      listStorageItems(companyId, `${companyId}/job/${job.id}`, "job")
    ]);

    return [...opportunityLineFiles, ...jobFiles, ...itemFiles];
  } else {
    const jobFiles = await listStorageItems(
      companyId,
      `${companyId}/job/${job.id}`,
      "job"
    );

    return [...jobFiles, ...itemFiles];
  }
}

export async function getJob(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  companyId?: string
) {
  let query = client.from("jobs").select("*").eq("id", id);
  if (companyId) query = query.eq("companyId", companyId);
  return query.single();
}

export async function getJobByOperationId(
  client: CarbonDatabaseClient<QueryDatabase>,
  operationId: string,
  scope?: {
    companyId?: string;
  }
) {
  let operationQuery = client
    .from("jobOperation")
    .select("jobId")
    .eq("id", operationId);

  if (scope?.companyId) {
    operationQuery = operationQuery.eq("companyId", scope.companyId);
  }

  const operation = await operationQuery.single();
  if (operation.error || !operation.data) return operation;

  let jobQuery = client
    .from("job")
    .select("id, companyId, customerId")
    .eq("id", operation.data.jobId);

  if (scope?.companyId) {
    jobQuery = jobQuery.eq("companyId", scope.companyId);
  }

  return jobQuery.single();
}

export async function getJobPurchaseOrderLines(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobId: string
) {
  return client
    .from("purchaseOrderLine")
    .select(
      "id, itemId, purchaseQuantity, quantityReceived, quantityShipped, purchaseOrder(id, purchaseOrderId, status, supplierId, supplierInteractionId), jobOperation(id, description, operationQuantity)"
    )
    .eq("jobId", jobId);
}

export async function getJobs(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: { search: string | null } & GenericQueryFilters
) {
  let query = client
    .from("jobs")
    .select("*", {
      count: "exact"
    })
    .eq("companyId", companyId);

  if (args?.search) {
    query = query.ilike("jobId", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "jobId", ascending: false }
    ]);
  }

  return query;
}

export async function getJobsBySalesOrderLine(
  client: CarbonDatabaseClient<QueryDatabase>,
  salesOrderLineId: string
) {
  return client
    .from("jobs")
    .select("*")
    .eq("salesOrderLineId", salesOrderLineId)
    .order("createdAt", { ascending: true });
}

export async function getJobsList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return fetchAllFromTable<{
    id: string;
    jobId: string;
  }>(client, "job", "id, jobId", (query) =>
    query.eq("companyId", companyId).order("jobId")
  );
}

export async function getJobMakeMethodById(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobMakeMethodId: string,
  companyId: string
) {
  const makeMethod = await client
    .from("jobMakeMethod")
    .select("*")
    .eq("id", jobMakeMethodId)
    .eq("companyId", companyId)
    .single();

  if (makeMethod.error || !makeMethod.data) return makeMethod;

  const item = await client
    .from("item")
    .select("type, revision")
    .eq("id", makeMethod.data.itemId)
    .eq("companyId", companyId)
    .single();

  if (item.error || !item.data) {
    return { ...makeMethod, data: null, error: item.error };
  }

  return {
    ...makeMethod,
    data: {
      ...makeMethod.data,
      itemType: item.data.type,
      methodRevision: item.data.revision
    }
  };
}

export async function getRootMakeMethod(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobId: string,
  companyId: string
) {
  const makeMethod = await client
    .from("jobMakeMethod")
    .select("*")
    .eq("jobId", jobId)
    .is("parentMaterialId", null)
    .eq("companyId", companyId)
    .single();

  if (makeMethod.error || !makeMethod.data) return makeMethod;

  const item = await client
    .from("item")
    .select("type, revision")
    .eq("id", makeMethod.data.itemId)
    .eq("companyId", companyId)
    .single();

  if (item.error || !item.data) {
    return { ...makeMethod, data: null, error: item.error };
  }

  return {
    ...makeMethod,
    data: {
      ...makeMethod.data,
      itemType: item.data.type,
      methodRevision: item.data.revision
    }
  };
}

export async function getJobMaterialsWithQuantityOnHand(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobId: string,
  companyId: string,
  locationId: string,
  args?: { search: string | null } & GenericQueryFilters
) {
  return client.rpc(
    "get_job_quantity_on_hand",
    {
      job_id: jobId,
      company_id: companyId,
      location_id: locationId
    },
    {
      count: "exact"
    }
  );
}

export async function getJobMethodTree(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobId: string,
  companyId: string
) {
  const items = await getJobMethodTreeArray(client, jobId, companyId);
  if (items.error) return items;

  const tree = getJobMethodTreeArrayToTree(items.data);

  return {
    data: tree,
    error: null
  };
}

export async function getJobMethodTreeArray(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobId: string,
  companyId: string
) {
  return client.rpc("get_job_method", {
    jid: jobId,
    company_id: companyId
  });
}

function getJobMethodTreeArrayToTree(items: JobMethod[]): JobMethodTreeItem[] {
  // function traverseAndRenameIds(node: JobMethodTreeItem) {
  //   const clone = structuredClone(node);
  //   clone.id = `node-${Math.random().toString(16).slice(2)}`;
  //   clone.children = clone.children.map((n) => traverseAndRenameIds(n));
  //   return clone;
  // }

  const rootItems: JobMethodTreeItem[] = [];
  const lookup: { [id: string]: JobMethodTreeItem } = {};

  for (const item of items) {
    const itemId = item.methodMaterialId;
    const parentId = item.parentMaterialId;

    if (!Object.prototype.hasOwnProperty.call(lookup, itemId)) {
      // @ts-expect-error
      lookup[itemId] = { id: itemId, children: [] };
    }

    // biome-ignore lint/complexity/useLiteralKeys: suppressed due to migration
    lookup[itemId]["data"] = item;

    const treeItem = lookup[itemId];

    if (parentId === null || parentId === undefined) {
      rootItems.push(treeItem);
    } else {
      if (!Object.prototype.hasOwnProperty.call(lookup, parentId)) {
        // @ts-expect-error
        lookup[parentId] = { id: parentId, children: [] };
      }

      // biome-ignore lint/complexity/useLiteralKeys: suppressed due to migration
      lookup[parentId]["children"].push(treeItem);
    }
  }
  return rootItems;
  // return rootItems.map((item) => traverseAndRenameIds(item));
}

export type JobMethod = NonNullable<
  Awaited<ReturnType<typeof getJobMethodTreeArray>>["data"]
>[number];
export type JobMethodTreeItem = {
  id: string;
  data: JobMethod;
  children: JobMethodTreeItem[];
};

export async function getJobMaterial(
  client: CarbonDatabaseClient<QueryDatabase>,
  materialId: string
) {
  return client
    .from("jobMaterialWithMakeMethodId")
    .select("*")
    .eq("id", materialId)
    .single();
}

export async function getJobMaterialsByMethodId(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobMakeMethodId: string,
  companyId: string
) {
  const materials = await client
    .from("jobMaterial")
    .select("*")
    .eq("jobMakeMethodId", jobMakeMethodId)
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
          .select("id, replenishmentSystem")
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

export async function getJobOperation(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobOperationId: string
) {
  return client
    .from("jobOperation")
    .select("*")
    .eq("id", jobOperationId)
    .single();
}

export async function getJobOperations(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobId: string,
  args?: { search: string | null } & GenericQueryFilters
) {
  let query = client
    .from("jobOperation")
    .select(
      "*, jobMakeMethod(parentMaterialId, item(readableIdWithRevision))",
      {
        count: "exact"
      }
    )
    .eq("jobId", jobId);

  if (args?.search) {
    query = query.ilike("description", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "description", ascending: true },
      { column: "order", ascending: true },
      { column: "createdAt", ascending: false }
    ]);
  }

  return query;
}

export async function getJobOperationDependencies(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobId: string
) {
  return client
    .from("jobOperationDependency")
    .select("operationId, dependsOnId")
    .eq("jobId", jobId);
}

export async function getJobOperationsAssignedToEmployee(
  client: CarbonDatabaseClient<QueryDatabase>,
  employeeId: string,
  companyId: string
) {
  return client
    .from("jobOperation")
    .select(
      "id, description, workCenterId, ...job(jobId:id, jobReadableId:jobId)"
    )
    .eq("assignee", employeeId)
    .eq("companyId", companyId);
}

export async function getJobOperationAttachments(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobOperationIds: string[],
  companyId?: string
): Promise<Record<string, string[]>> {
  if (jobOperationIds.length === 0) return {};

  let stepsQuery = client
    .from("jobOperationStep")
    .select("*")
    .in("operationId", jobOperationIds);

  if (companyId) {
    stepsQuery = stepsQuery.eq("companyId", companyId);
  }

  const { data: operationAttributes } = await stepsQuery;

  if (!operationAttributes) return {};

  const stepIds = operationAttributes.map((attribute) => attribute.id);
  let recordsQuery = client
    .from("jobOperationStepRecord")
    .select("*")
    .in("jobOperationStepId", stepIds);

  if (companyId) {
    recordsQuery = recordsQuery.eq("companyId", companyId);
  }

  const { data: stepRecords } =
    stepIds.length > 0 ? await recordsQuery : { data: [] };
  const recordsByStepId = new Map<string, any[]>();
  (stepRecords ?? []).forEach((record) => {
    const records = recordsByStepId.get(record.jobOperationStepId) ?? [];
    records.push(record);
    recordsByStepId.set(record.jobOperationStepId, records);
  });

  const attachmentsByOperation: Record<string, string[]> = {};
  operationAttributes.forEach((attr) => {
    const records = recordsByStepId.get(attr.id) ?? [];
    if (records.length > 0) {
      records.forEach((record: any) => {
        if (attr.type === "File" && record.value) {
          if (!attachmentsByOperation[attr.operationId]) {
            attachmentsByOperation[attr.operationId] = [];
          }
          attachmentsByOperation[attr.operationId].push(record.value);
        }
      });
    }
  });

  return attachmentsByOperation;
}

export async function getJobOperationsList(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobId: string
) {
  return client
    .from("jobOperation")
    .select("id, description, order")
    .eq("jobId", jobId)
    .order("order", { ascending: true });
}

export async function getJobOperationsByMethodId(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobMakeMethodId: string,
  companyId?: string
) {
  let query = client
    .from("jobOperation")
    .select(
      "*, jobOperationTool(*), jobOperationParameter(*), jobOperationStep(*, jobOperationStepRecord(*))"
    )
    .eq("jobMakeMethodId", jobMakeMethodId);

  if (companyId) query = query.eq("companyId", companyId);

  return query.order("order", { ascending: true });
}

export async function getJobOperationStepRecords(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobId: string,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client.rpc("get_job_operation_step_records", {
    p_job_id: jobId,
    p_company_id: companyId
  });

  if (args.search) {
    query = query.or(
      `name.ilike.%${args.search}%,operationDescription.ilike.%${args.search}%`
    );
  }

  query = setGenericQueryFilters(query, args, [
    { column: "createdAt", ascending: false }
  ]);

  return query;
}

export async function getOutsideOperationsByJobId(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobId: string,
  companyId: string
) {
  return client
    .from("jobOperation")
    .select("id, description")
    .eq("jobId", jobId)
    .eq("companyId", companyId)
    .eq("operationType", "Outside");
}

export async function getProcedure(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  companyId: string
) {
  const [procedure, steps, parameters] = await Promise.all([
    client
      .from("procedure")
      .select("*")
      .eq("id", id)
      .eq("companyId", companyId)
      .single(),
    client
      .from("procedureStep")
      .select("*")
      .eq("procedureId", id)
      .eq("companyId", companyId),
    client
      .from("procedureParameter")
      .select("*")
      .eq("procedureId", id)
      .eq("companyId", companyId)
  ]);

  if (procedure.error || !procedure.data) return procedure;
  if (steps.error) return { ...procedure, data: null, error: steps.error };
  if (parameters.error) {
    return { ...procedure, data: null, error: parameters.error };
  }

  return {
    ...procedure,
    data: {
      ...procedure.data,
      procedureStep: steps.data ?? [],
      procedureParameter: parameters.data ?? []
    }
  };
}

export async function getProcedureSteps(
  client: CarbonDatabaseClient<QueryDatabase>,
  procedureId: string
) {
  return client
    .from("procedureStep")
    .select("*")
    .eq("procedureId", procedureId);
}

export async function getProcedureParameters(
  client: CarbonDatabaseClient<QueryDatabase>,
  procedureId: string
) {
  return client
    .from("procedureParameter")
    .select("*")
    .eq("procedureId", procedureId);
}

export async function getProcedureVersions(
  client: CarbonDatabaseClient<QueryDatabase>,
  procedure: { name: string; version: number },
  companyId: string
) {
  return client
    .from("procedure")
    .select("*")
    .eq("name", procedure.name)
    .eq("companyId", companyId)
    .neq("version", procedure.version)
    .order("version", { ascending: false });
}

export async function getProcedures(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: { search: string | null } & GenericQueryFilters
) {
  let query = client
    .from("procedures")
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

export async function getProceduresList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return fetchAllFromTable<{
    id: string;
    name: string;
    version: number;
    processId: string;
    status: string;
  }>(client, "procedure", "id, name, version, processId, status", (query) =>
    query
      .eq("companyId", companyId)
      .order("name", { ascending: true })
      .order("version", { ascending: false })
  );
}

export async function getProductionEvent(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  companyId: string
) {
  const productionEvent = await client
    .from("productionEvent")
    .select("*")
    .eq("id", id)
    .eq("companyId", companyId)
    .single();

  if (productionEvent.error || !productionEvent.data) return productionEvent;

  const jobOperation = await client
    .from("jobOperation")
    .select("description")
    .eq("id", productionEvent.data.jobOperationId)
    .eq("companyId", companyId)
    .single();

  if (jobOperation.error || !jobOperation.data) {
    return { ...productionEvent, data: null, error: jobOperation.error };
  }

  return {
    ...productionEvent,
    data: {
      ...productionEvent.data,
      jobOperation: jobOperation.data
    }
  };
}

export async function getProductionEvents(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobOperationIds: string[],
  args?: { search: string | null } & GenericQueryFilters
) {
  let query = client
    .from("productionEvent")
    .select(
      "*, jobOperation(description, jobMakeMethod(parentMaterialId, item(readableIdWithRevision)))",
      {
        count: "exact"
      }
    )
    .in("jobOperationId", jobOperationIds)
    .order("startTime", { ascending: true });

  if (args?.search) {
    query = query.or(`jobOperation.description.ilike.%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "createdAt", ascending: false }
    ]);
  }

  return query;
}

export async function getProductionEventsPage(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobOperationId: string,
  companyId: string,
  sortDescending: boolean = false,
  page: number = 1
) {
  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  let query = client
    .from("productionEvent")
    .select("*", { count: "exact" })
    .eq("jobOperationId", jobOperationId)
    .eq("companyId", companyId)
    .order("startTime", { ascending: !sortDescending })
    .range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    return { error };
  }

  return {
    data,
    count,
    page,
    pageSize,
    hasMore: typeof count === "number" && offset + pageSize < count
  };
}

export async function getProductionEventsByOperations(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobOperationIds: string[]
) {
  return client
    .from("productionEvent")
    .select(
      "*, jobOperation(description, jobMakeMethod(parentMaterialId, item(readableIdWithRevision)))"
    )
    .in("jobOperationId", jobOperationIds)
    .order("startTime", { ascending: true });
}

export async function getProductionPlanning(
  client: CarbonDatabaseClient<QueryDatabase>,
  locationId: string,
  companyId: string,
  periods: string[],
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client.rpc(
    "get_production_planning",
    {
      location_id: locationId,
      company_id: companyId,
      periods
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
    { column: "quantityToOrder", ascending: false }
  ]);

  return query;
}

export async function getProductionProjections(
  client: CarbonDatabaseClient<QueryDatabase>,
  locationId: string,
  periods: string[],
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client.rpc(
    "get_production_projections",
    {
      location_id: locationId,
      company_id: companyId,
      periods
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

export async function getProductionQuantity(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  companyId: string
) {
  const productionQuantity = await client
    .from("productionQuantity")
    .select("*")
    .eq("id", id)
    .eq("companyId", companyId)
    .single();

  if (productionQuantity.error || !productionQuantity.data) {
    return productionQuantity;
  }

  const jobOperation = await client
    .from("jobOperation")
    .select("description")
    .eq("id", productionQuantity.data.jobOperationId)
    .eq("companyId", companyId)
    .single();

  if (jobOperation.error || !jobOperation.data) {
    return { ...productionQuantity, data: null, error: jobOperation.error };
  }

  return {
    ...productionQuantity,
    data: {
      ...productionQuantity.data,
      jobOperation: jobOperation.data
    }
  };
}

export async function getProductionQuantities(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobOperationIds: string[],
  args?: { search: string | null } & GenericQueryFilters
) {
  let query = client
    .from("productionQuantity")
    .select(
      "*, jobOperation(description, jobMakeMethod(parentMaterialId, item(readableIdWithRevision)))",
      {
        count: "exact"
      }
    )
    .in("jobOperationId", jobOperationIds);

  if (args?.search) {
    query = query.or(`jobOperation.description.ilike.%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "createdAt", ascending: false }
    ]);
  }

  return query;
}

export async function getProductionDataByOperations(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobOperationIds: string[]
) {
  const [quantities, events, notes] = await Promise.all([
    client
      .from("productionQuantity")
      .select(
        "*, jobOperation(description, jobMakeMethod(parentMaterialId, item(readableIdWithRevision)))"
      )
      .in("jobOperationId", jobOperationIds),
    client
      .from("productionEvent")
      .select(
        "*, jobOperation(description, jobMakeMethod(parentMaterialId, item(readableIdWithRevision)))"
      )
      .in("jobOperationId", jobOperationIds),
    client
      .from("jobOperationNote")
      .select("*")
      .in("jobOperationId", jobOperationIds)
  ]);

  return {
    quantities: quantities.data ?? [],
    events: events.data ?? [],
    notes: notes.data ?? []
  };
}

export async function getScrapReasonsList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("scrapReason")
    .select("id, name")
    .eq("companyId", companyId)
    .order("name");
}

export async function getScrapReason(
  client: CarbonDatabaseClient<QueryDatabase>,
  scrapReasonId: string
) {
  return client
    .from("scrapReason")
    .select("*")
    .eq("id", scrapReasonId)
    .single();
}

export async function getScrapReasons(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("scrapReason")
    .select("id, name, customFields", { count: "exact" })
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

export async function getFailureMode(
  client: CarbonDatabaseClient<QueryDatabase>,
  failureModeId: string
) {
  return client
    .from("maintenanceFailureMode")
    .select("*")
    .eq("id", failureModeId)
    .single();
}

export async function getFailureModes(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("maintenanceFailureMode")
    .select("*", { count: "exact" })
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

export async function getFailureModesList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("maintenanceFailureMode")
    .select("id, name")
    .eq("companyId", companyId)
    .order("name");
}

export async function getMaintenanceDispatch(
  client: CarbonDatabaseClient<QueryDatabase>,
  dispatchId: string
) {
  return client
    .from("maintenanceDispatch")
    .select(
      `*,
      assignee:user!maintenanceDispatch_assignee_fkey(id, fullName, avatarUrl),
      suspectedFailureMode:maintenanceFailureMode!maintenanceDispatch_suspectedFailureModeId_fkey(id, name),
      actualFailureMode:maintenanceFailureMode!maintenanceDispatch_actualFailureModeId_fkey(id, name),
      schedule:maintenanceSchedule(id, name)`
    )
    .eq("id", dispatchId)
    .single();
}

export async function getMaintenanceDispatches(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null; status?: string }
) {
  let query = client
    .from("maintenanceDispatch")
    .select(`*`, { count: "exact" })
    .eq("companyId", companyId);

  if (args?.search) {
    query = query.ilike("maintenanceDispatchId", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "createdAt", ascending: false }
    ]);
  }

  return query;
}

export async function getMaintenanceDispatchComments(
  client: CarbonDatabaseClient<QueryDatabase>,
  dispatchId: string
) {
  return client
    .from("maintenanceDispatchComment")
    .select(
      `id, comment, createdAt,
       createdBy:user!maintenanceDispatchComment_createdBy_fkey(id, fullName, avatarUrl)`
    )
    .eq("maintenanceDispatchId", dispatchId)
    .order("createdAt", { ascending: false });
}

export async function getMaintenanceDispatchEvents(
  client: CarbonDatabaseClient<QueryDatabase>,
  dispatchId: string
) {
  return client
    .from("maintenanceDispatchEvent")
    .select(
      `id, startTime, endTime, duration, notes,
       employee:user!maintenanceDispatchEvent_employeeId_fkey(id, fullName, avatarUrl),
       workCenter:workCenter!maintenanceDispatchEvent_workCenterId_fkey(id, name)`
    )
    .eq("maintenanceDispatchId", dispatchId)
    .order("startTime", { ascending: false });
}

export async function getMaintenanceDispatchItems(
  client: CarbonDatabaseClient<QueryDatabase>,
  dispatchId: string
) {
  return client
    .from("maintenanceDispatchItem")
    .select(
      `id, itemId, quantity, unitOfMeasureCode, unitCost, totalCost,
       item:item!maintenanceDispatchItem_itemId_fkey(id, name)`
    )
    .eq("maintenanceDispatchId", dispatchId);
}

export async function getMaintenanceDispatchWorkCenters(
  client: CarbonDatabaseClient<QueryDatabase>,
  dispatchId: string
) {
  return client
    .from("maintenanceDispatchWorkCenter")
    .select(
      `id, workCenterId,
       workCenter:workCenter!maintenanceDispatchWorkCenter_workCenterId_fkey(id, name)`
    )
    .eq("maintenanceDispatchId", dispatchId);
}

export async function getMaintenanceSchedule(
  client: CarbonDatabaseClient<QueryDatabase>,
  scheduleId: string
) {
  return client
    .from("maintenanceSchedule")
    .select(
      `*,
       workCenter:workCenter!maintenanceSchedule_workCenterId_fkey(id, name)`
    )
    .eq("id", scheduleId)
    .single();
}

export async function getMaintenanceSchedules(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null; active?: boolean }
) {
  let query = client
    .from("maintenanceSchedules")
    .select(`*`, { count: "exact" })
    .eq("companyId", companyId);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  if (args?.active !== undefined) {
    query = query.eq("active", args.active);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "name", ascending: true }
    ]);
  }

  return query;
}

export async function getMaintenanceScheduleItems(
  client: CarbonDatabaseClient<QueryDatabase>,
  scheduleId: string
) {
  return client
    .from("maintenanceScheduleItem")
    .select(
      `id, quantity, unitOfMeasureCode,
       item:item!maintenanceScheduleItem_itemId_fkey(id, name)`
    )
    .eq("maintenanceScheduleId", scheduleId);
}

export async function getTrackedEntityByJobId(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobId: string,
  companyId?: string
) {
  let jobMakeMethodQuery = client
    .from("jobMakeMethod")
    .select("*")
    .eq("jobId", jobId)
    .is("parentMaterialId", null);

  if (companyId) {
    jobMakeMethodQuery = jobMakeMethodQuery.eq("companyId", companyId);
  }

  const jobMakeMethod = await jobMakeMethodQuery.single();
  if (jobMakeMethod.error) {
    return {
      data: null,
      error: jobMakeMethod.error
    };
  }

  const result = await client
    .from("trackedEntity")
    .select("*")
    .eq("attributes ->> Job Make Method", jobMakeMethod.data.id)
    .eq("companyId", jobMakeMethod.data.companyId)
    .is("attributes ->> Split Entity ID", null)
    .limit(1);

  return {
    data: result.data?.[0] ?? null,
    error: result.error
  };
}

export async function getTrackedEntitiesByJobId(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobId: string
) {
  const jobMakeMethod = await client
    .from("jobMakeMethod")
    .select("*")
    .eq("jobId", jobId)
    .is("parentMaterialId", null)
    .single();
  if (jobMakeMethod.error) {
    return {
      data: null,
      error: jobMakeMethod.error
    };
  }

  return client
    .from("trackedEntity")
    .select("*")
    .eq("attributes ->> Job Make Method", jobMakeMethod.data.id)
    .eq("companyId", jobMakeMethod.data.companyId)
    .is("attributes ->> Split Entity ID", null);
}

/**
 * Reschedule a job using the unified scheduling engine.
 * This recalculates dates, work centers, and priorities for all operations.
 */
export async function recalculateJobOperationDependencies(
  client: CarbonDatabaseClient<QueryDatabase>,
  params: {
    jobId: string;
    companyId: string;
    userId: string;
  }
) {
  return invokeFunction("schedule", {
    body: {
      jobId: params.jobId,
      companyId: params.companyId,
      userId: params.userId,
      mode: "reschedule",
      direction: "backward"
    },
  });
}
export async function recalculateJobRequirements(
  client: CarbonDatabaseClient<QueryDatabase>,
  params: {
    id: string; // job id
    companyId: string;
    userId: string;
  }
) {
  return invokeFunction("recalculate", {
    body: {
      type: "jobRequirements",
      ...params
    },
  });
}

export async function recalculateJobMakeMethodRequirements(
  client: CarbonDatabaseClient<QueryDatabase>,
  params: {
    id: string; // job make method id
    companyId: string;
    userId: string;
  }
) {
  return invokeFunction("recalculate", {
    body: {
      type: "jobMakeMethodRequirements",
      ...params
    },
  });
}

export async function runMRP(
  client: CarbonDatabaseClient<QueryDatabase>,
  params: {
    type:
      | "company"
      | "location"
      | "job"
      | "salesOrder"
      | "item"
      | "purchaseOrder";
    id: string;
    companyId: string;
    userId: string;
  }
) {
  return invokeFunction("mrp", {
    body: {
      ...params
    },
  });
}

export async function updateJobBatchNumber(
  client: CarbonDatabaseClient<QueryDatabase>,
  params: {
    trackedEntityId: string;
    value: string | null;
    companyId: string;
  }
) {
  const { trackedEntityId, value, companyId } = params;

  return client
    .from("trackedEntity")
    .update({
      readableId: value
    })
    .eq("id", trackedEntityId)
    .eq("companyId", companyId)
    .select("id, readableId");
}

export async function updateJobStatus(
  client: CarbonDatabaseClient<QueryDatabase>,
  params: {
    id: string;
    status: (typeof jobStatus)[number];
    assignee?: string | null;
    updatedBy: string;
    companyId?: string;
  }
) {
  const { id, status, assignee, updatedBy, companyId } = params;

  let query = client
    .from("job")
    .update({
      status,
      assignee,
      updatedBy,
      updatedAt: new Date().toISOString()
    })
    .eq("id", id);

  if (companyId) {
    query = query.eq("companyId", companyId);
  }

  return query;
}

export async function updateJobMaterialOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  updates: {
    id: string;
    order: number;
    updatedBy: string;
  }[]
) {
  const updatePromises = updates.map(({ id, order, updatedBy }) =>
    client.from("jobMaterial").update({ order, updatedBy }).eq("id", id)
  );
  return Promise.all(updatePromises);
}

export async function updateJobOperationOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  updates: {
    id: string;
    order: number;
    updatedBy: string;
  }[]
) {
  const updatePromises = updates.map(({ id, order, updatedBy }) =>
    client.from("jobOperation").update({ order, updatedBy }).eq("id", id)
  );
  return Promise.all(updatePromises);
}

export async function updateJobOperationStepOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  updates: {
    id: string;
    sortOrder: number;
    updatedBy: string;
  }[]
) {
  const updatePromises = updates.map(({ id, sortOrder, updatedBy }) =>
    client
      .from("jobOperationStep")
      .update({ sortOrder, updatedBy })
      .eq("id", id)
  );
  return Promise.all(updatePromises);
}

export async function updateKanbanJob(
  client: CarbonDatabaseClient<QueryDatabase>,
  params: {
    id: string;
    jobId: string | null;
    companyId: string;
    userId: string;
  }
) {
  const { id, jobId, companyId, userId } = params;
  return client
    .from("kanban")
    .update({ jobId, updatedBy: userId, updatedAt: new Date().toISOString() })
    .eq("id", id)
    .eq("companyId", companyId);
}

export async function updateQuoteOperationStepOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  updates: {
    id: string;
    sortOrder: number;
    updatedBy: string;
  }[]
) {
  const updatePromises = updates.map(({ id, sortOrder, updatedBy }) =>
    client
      .from("quoteOperationStep")
      .update({ sortOrder, updatedBy })
      .eq("id", id)
  );
  return Promise.all(updatePromises);
}

export async function updateMethodOperationStepOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  updates: {
    id: string;
    sortOrder: number;
    updatedBy: string;
  }[]
) {
  const updatePromises = updates.map(({ id, sortOrder, updatedBy }) =>
    client
      .from("methodOperationStep")
      .update({ sortOrder, updatedBy })
      .eq("id", id)
  );
  return Promise.all(updatePromises);
}

export async function updateJobOperationStatus(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  status: (typeof jobOperationStatus)[number],
  updatedBy: string
) {
  return client
    .from("jobOperation")
    .update({
      status,
      updatedBy,
      updatedAt: new Date().toISOString()
    })
    .eq("id", id)
    .select()
    .single();
}

export async function updateJobOperationDueDate(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  dueDate: string | null,
  updatedBy: string
) {
  return client
    .from("jobOperation")
    .update({
      dueDate,
      updatedBy,
      updatedAt: new Date().toISOString()
    })
    .eq("id", id)
    .select()
    .single();
}

export async function updateProcedureStepOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  updates: {
    id: string;
    sortOrder: number;
    updatedBy: string;
  }[]
) {
  const updatePromises = updates.map(({ id, sortOrder, updatedBy }) =>
    client.from("procedureStep").update({ sortOrder, updatedBy }).eq("id", id)
  );
  return Promise.all(updatePromises);
}

export async function upsertProductionEvent(
  client: CarbonDatabaseClient<QueryDatabase>,
  productionEvent:
    | (Omit<z.infer<typeof productionEventValidator>, "id"> & {
        createdBy: string;
        companyId: string;
      })
    | (Omit<z.infer<typeof productionEventValidator>, "id"> & {
        id: string;
        updatedBy: string;
        companyId: string;
      })
) {
  if ("createdBy" in productionEvent) {
    return client
      .from("productionEvent")
      .insert([productionEvent])
      .select("id")
      .single();
  } else {
    const { id, updatedBy, companyId, ...updateData } = productionEvent;

    return client
      .from("productionEvent")
      .update({
        ...sanitize(updateData),
        updatedBy,
        updatedAt: new Date().toISOString()
      })
      .eq("id", id)
      .eq("companyId", companyId)
      .select()
      .single();
  }
}

export async function updateProductionQuantity(
  client: CarbonDatabaseClient<QueryDatabase>,
  productionQuantity: z.infer<typeof productionQuantityValidator> & {
    id: string;
    updatedBy: string;
    companyId: string;
  }
) {
  const { id, updatedBy, companyId, ...updateData } = productionQuantity;

  return client
    .from("productionQuantity")
    .update({
      ...sanitize(updateData),
      updatedBy,
      updatedAt: new Date().toISOString()
    })
    .eq("id", id)
    .eq("companyId", companyId)
    .select()
    .single();
}

export async function upsertProductionQuantity(
  client: CarbonDatabaseClient<QueryDatabase>,
  productionQuantity:
    | (Omit<z.infer<typeof productionQuantityValidator>, "id"> & {
        companyId: string;
      })
    | (Omit<z.infer<typeof productionQuantityValidator>, "id"> & {
        id: string;
        updatedBy: string;
        companyId: string;
      })
) {
  if ("updatedBy" in productionQuantity) {
    const { id, updatedBy, companyId, ...updateData } = productionQuantity;

    return client
      .from("productionQuantity")
      .update({
        ...sanitize(updateData),
        updatedBy,
        updatedAt: new Date().toISOString()
      })
      .eq("id", id)
      .eq("companyId", companyId)
      .select()
      .single();
  } else {
    return (
      client
        .from("productionQuantity")
        .insert([productionQuantity])
        .select("id")
        .single()
    );
  }
}

export async function upsertJob(
  client: CarbonDatabaseClient<QueryDatabase>,
  job:
    | (Omit<z.infer<typeof jobValidator>, "id" | "jobId"> & {
        jobId: string;
        storageUnitId?: string;
        startDate?: string;
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof jobValidator>, "id" | "jobId"> & {
        id: string;
        jobId: string;
        updatedBy: string;
        customFields?: Json;
      }),
  status?: (typeof jobStatus)[number]
) {
  if ("updatedBy" in job) {
    return client
      .from("job")
      .update({
        ...sanitize(job),
        ...(status && { status })
      })
      .eq("id", job.id)
      .select("id")
      .single();
  } else {
    return client
      .from("job")
      .insert([
        {
          ...job,
          ...(status && { status })
        }
      ])
      .select("id")
      .single();
  }
}

export async function upsertJobMaterial(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobMaterial:
    | (z.infer<typeof jobMaterialValidator> & {
        jobId: string;
        jobOperationId?: string;
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (z.infer<typeof jobMaterialValidator> & {
        jobId: string;
        jobOperationId?: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("updatedBy" in jobMaterial) {
    return client
      .from("jobMaterial")
      .update(sanitize(jobMaterial))
      .eq("id", jobMaterial.id)
      .select("id, methodType")
      .single();
  }
  return client
    .from("jobMaterial")
    .insert([jobMaterial])
    .select("id, methodType")
    .single();
}

export async function upsertJobOperation(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobOperation:
    | (z.infer<typeof jobOperationValidator> & {
        jobId: string;
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (z.infer<typeof jobOperationValidator> & {
        jobId: string;
        companyId: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("updatedBy" in jobOperation) {
    return client
      .from("jobOperation")
      .update(sanitize(jobOperation))
      .eq("id", jobOperation.id)
      .select("id")
      .single();
  }
  const operationInsert = await client
    .from("jobOperation")
    .insert([jobOperation])
    .select("id")
    .single();

  if (operationInsert.error) {
    return operationInsert;
  }
  const operationId = operationInsert.data?.id;
  if (!operationId) return operationInsert;

  if (jobOperation.procedureId) {
    const { error } = await invokeFunction("get-method", {
      body: {
        type: "procedureToOperation",
        sourceId: jobOperation.procedureId,
        targetId: operationId,
        companyId: jobOperation.companyId,
        userId: jobOperation.createdBy
      },
    });
    if (error) {
      return {
        data: null,
        error: { message: "Failed to get procedure" } as QueryError
      };
    }
  }
  return operationInsert;
}

export async function upsertJobOperationStep(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobOperationStep:
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
  if ("createdBy" in jobOperationStep) {
    return client
      .from("jobOperationStep")
      .insert(jobOperationStep)
      .select("id")
      .single();
  }

  return client
    .from("jobOperationStep")
    .update(sanitize(jobOperationStep))
    .eq("id", jobOperationStep.id)
    .select("id")
    .single();
}

export async function upsertJobOperationParameter(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobOperationParameter:
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
  if ("createdBy" in jobOperationParameter) {
    return client
      .from("jobOperationParameter")
      .insert(jobOperationParameter)
      .select("id")
      .single();
  }

  return client
    .from("jobOperationParameter")
    .update(sanitize(jobOperationParameter))
    .eq("id", jobOperationParameter.id)
    .select("id")
    .single();
}

export async function upsertJobOperationTool(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobOperationTool:
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
  if ("createdBy" in jobOperationTool) {
    return client
      .from("jobOperationTool")
      .insert(jobOperationTool)
      .select("id")
      .single();
  }

  return client
    .from("jobOperationTool")
    .update(sanitize(jobOperationTool))
    .eq("id", jobOperationTool.id)
    .select("id")
    .single();
}

export async function upsertJobMethod(
  client: CarbonDatabaseClient<QueryDatabase>,
  type: "itemToJob" | "quoteLineToJob",
  jobMethod: {
    sourceId: string;
    targetId: string;
    companyId: string;
    userId: string;
    configuration?: Record<string, unknown>;
    parts?: {
      billOfMaterial: boolean;
      billOfProcess: boolean;
      parameters: boolean;
      tools: boolean;
      steps: boolean;
      workInstructions: boolean;
    };
  }
) {
  const body: {
    type: "itemToJob" | "quoteLineToJob";
    sourceId: string;
    targetId: string;
    companyId: string;
    userId: string;
    configuration?: Record<string, unknown>;
    parts?: {
      billOfMaterial: boolean;
      billOfProcess: boolean;
      parameters: boolean;
      tools: boolean;
      steps: boolean;
      workInstructions: boolean;
    };
  } = {
    type,
    sourceId: jobMethod.sourceId,
    targetId: jobMethod.targetId,
    companyId: jobMethod.companyId,
    userId: jobMethod.userId
  };

  // Only add configuration if it exists
  if (jobMethod.configuration !== undefined) {
    body.configuration = jobMethod.configuration;
  }

  // Only add parts if it exists
  if (jobMethod.parts !== undefined) {
    body.parts = jobMethod.parts;
  }

  const getMethodResult = await invokeFunction("get-method", {
    body,
  });
  if (getMethodResult.error) {
    return getMethodResult;
  }
  return recalculateJobRequirements(client, {
    id: jobMethod.targetId,
    companyId: jobMethod.companyId,
    userId: jobMethod.userId
  });
}

export async function upsertJobMaterialMakeMethod(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobMaterial: {
    sourceId: string;
    targetId: string;
    companyId: string;
    userId: string;
    configuration?: Record<string, unknown>;
    parts?: {
      billOfMaterial: boolean;
      billOfProcess: boolean;
      parameters: boolean;
      tools: boolean;
      steps: boolean;
      workInstructions: boolean;
    };
  }
) {
  const body: {
    type: "itemToJobMakeMethod";
    sourceId: string;
    targetId: string;
    companyId: string;
    userId: string;
    configuration?: Record<string, unknown>;
    parts?: {
      billOfMaterial: boolean;
      billOfProcess: boolean;
      parameters: boolean;
      tools: boolean;
      steps: boolean;
      workInstructions: boolean;
    };
  } = {
    type: "itemToJobMakeMethod",
    sourceId: jobMaterial.sourceId,
    targetId: jobMaterial.targetId,
    companyId: jobMaterial.companyId,
    userId: jobMaterial.userId
  };

  // Only add configuration if it exists
  if (jobMaterial.configuration !== undefined) {
    body.configuration = jobMaterial.configuration;
  }

  // Only add parts if it exists
  if (jobMaterial.parts !== undefined) {
    body.parts = jobMaterial.parts;
  }

  const { error } = await invokeFunction("get-method", {
    body,
  });

  if (error) {
    return {
      data: null,
      error: { message: "Failed to pull method" } as QueryError
    };
  }

  return { data: null, error: null };
}

export async function upsertMakeMethodFromJob(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobMethod: {
    sourceId: string;
    targetId: string;
    companyId: string;
    userId: string;
    parts?: {
      billOfMaterial: boolean;
      billOfProcess: boolean;
      parameters: boolean;
      tools: boolean;
      steps: boolean;
      workInstructions: boolean;
    };
  }
) {
  return invokeFunction("get-method", {
    body: {
      type: "jobToItem",
      sourceId: jobMethod.sourceId,
      targetId: jobMethod.targetId,
      companyId: jobMethod.companyId,
      userId: jobMethod.userId,
      parts: jobMethod.parts
    },
  });
}

export async function upsertMakeMethodFromJobMethod(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobMethod: {
    sourceId: string;
    targetId: string;
    companyId: string;
    userId: string;
    parts?: {
      billOfMaterial: boolean;
      billOfProcess: boolean;
      parameters: boolean;
      tools: boolean;
      steps: boolean;
      workInstructions: boolean;
    };
  }
) {
  const { error } = await invokeFunction("get-method", {
    body: {
      type: "jobMakeMethodToItem",
      sourceId: jobMethod.sourceId,
      targetId: jobMethod.targetId,
      companyId: jobMethod.companyId,
      userId: jobMethod.userId,
      parts: jobMethod.parts
    },
  });

  if (error) {
    return {
      data: null,
      error: { message: "Failed to save method" } as QueryError
    };
  }

  return { data: null, error: null };
}

export async function upsertProcedure(
  client: CarbonDatabaseClient<QueryDatabase>,
  procedure:
    | (Omit<z.infer<typeof procedureValidator>, "id"> & {
        companyId: string;
        createdBy: string;
      })
    | (Omit<z.infer<typeof procedureValidator>, "id"> & {
        id: string;
        updatedBy: string;
      })
) {
  const { copyFromId, ...rest } = procedure;
  if ("id" in rest) {
    return client
      .from("procedure")
      .update(sanitize(rest))
      .eq("id", rest.id)
      .select("id")
      .single();
  }

  const insert = await client
    .from("procedure")
    .insert([rest])
    .select("id")
    .single();
  if (insert.error) {
    return insert;
  }
  if (copyFromId) {
    const [procedure, attributes, parameters] = await Promise.all([
      client
        .from("procedure")
        .select("*")
        .eq("id", copyFromId)
        .eq("companyId", rest.companyId)
        .single(),
      client
        .from("procedureStep")
        .select("*")
        .eq("procedureId", copyFromId)
        .eq("companyId", rest.companyId),
      client
        .from("procedureParameter")
        .select("*")
        .eq("procedureId", copyFromId)
        .eq("companyId", rest.companyId)
    ]);

    if (procedure.error) {
      return procedure;
    }
    if (attributes.error) {
      return attributes;
    }
    if (parameters.error) {
      return parameters;
    }

    const procedureAttributes = attributes.data ?? [];
    const procedureParameters = parameters.data ?? [];
    const workInstruction = (procedure.data.content ?? {}) as JSONContent;

    const [updateWorkInstructions, insertAttributes, insertParameters] =
      await Promise.all([
        client
          .from("procedure")
          .update({
            content: workInstruction
          })
          .eq("id", insert.data.id),
        procedureAttributes.length > 0
          ? client.from("procedureStep").insert(
              procedureAttributes.map((attribute: any) => {
                // biome-ignore lint/correctness/noUnusedVariables: suppressed due to migration
                const { id, procedureId, ...rest } = attribute;
                return {
                  ...rest,
                  procedureId: insert.data.id,
                  companyId: procedure.data.companyId!
                };
              })
            )
          : Promise.resolve({ data: null, error: null }),
        procedureParameters.length > 0
          ? client.from("procedureParameter").insert(
              procedureParameters.map((parameter: any) => {
                // biome-ignore lint/correctness/noUnusedVariables: suppressed due to migration
                const { id, procedureId, ...rest } = parameter;
                return {
                  ...rest,
                  procedureId: insert.data.id,
                  companyId: procedure.data.companyId!
                };
              })
            )
          : Promise.resolve({ data: null, error: null })
      ]);

    if (updateWorkInstructions.error) {
      return updateWorkInstructions;
    }
    if (insertAttributes.error) {
      return insertAttributes;
    }
    if (insertParameters.error) {
      return insertParameters;
    }
  }
  return insert;
}

export async function upsertProcedureStep(
  client: CarbonDatabaseClient<QueryDatabase>,
  procedureStep:
    | (Omit<z.infer<typeof procedureStepValidator>, "id"> & {
        companyId: string;
        createdBy: string;
      })
    | (Omit<z.infer<typeof procedureStepValidator>, "id"> & {
        id: string;
        updatedBy: string;
      })
) {
  if ("id" in procedureStep) {
    return client
      .from("procedureStep")
      .update(sanitize(procedureStep))
      .eq("id", procedureStep.id)
      .select("id")
      .single();
  }
  return client
    .from("procedureStep")
    .insert([procedureStep])
    .select("id")
    .single();
}

export async function upsertProcedureParameter(
  client: CarbonDatabaseClient<QueryDatabase>,
  procedureParameter:
    | (Omit<z.infer<typeof procedureParameterValidator>, "id"> & {
        companyId: string;
        createdBy: string;
      })
    | (Omit<z.infer<typeof procedureParameterValidator>, "id"> & {
        id: string;
        updatedBy: string;
      })
) {
  if ("id" in procedureParameter) {
    return client
      .from("procedureParameter")
      .update(sanitize(procedureParameter))
      .eq("id", procedureParameter.id)
      .select("id")
      .single();
  }
  return client
    .from("procedureParameter")
    .insert([procedureParameter])
    .select("id")
    .single();
}

export async function upsertScrapReason(
  client: CarbonDatabaseClient<QueryDatabase>,
  scrapReason:
    | (Omit<z.infer<typeof scrapReasonValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof scrapReasonValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in scrapReason) {
    return client.from("scrapReason").insert([scrapReason]).select("id");
  } else {
    return client
      .from("scrapReason")
      .update(sanitize(scrapReason))
      .eq("id", scrapReason.id);
  }
}

export async function upsertFailureMode(
  client: CarbonDatabaseClient<QueryDatabase>,
  failureMode:
    | (Omit<z.infer<typeof failureModeValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof failureModeValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in failureMode) {
    return client
      .from("maintenanceFailureMode")
      .insert([failureMode])
      .select("id");
  } else {
    return client
      .from("maintenanceFailureMode")
      .update(sanitize(failureMode))
      .eq("id", failureMode.id);
  }
}

export async function upsertMaintenanceDispatch(
  client: CarbonDatabaseClient<QueryDatabase>,
  dispatch:
    | (Omit<z.infer<typeof maintenanceDispatchValidator>, "id"> & {
        maintenanceDispatchId: string;
        companyId: string;
        createdBy: string;
        content?: Json;
      })
    | (Omit<z.infer<typeof maintenanceDispatchValidator>, "id"> & {
        id: string;
        updatedBy: string;
        content?: Json;
      })
) {
  if ("createdBy" in dispatch) {
    return client
      .from("maintenanceDispatch")
      .insert([
        { ...dispatch, severity: dispatch.severity ?? "Support Required" }
      ])
      .select("id")
      .single();
  } else {
    return client
      .from("maintenanceDispatch")
      .update(sanitize(dispatch))
      .eq("id", dispatch.id);
  }
}

export async function upsertMaintenanceDispatchComment(
  client: CarbonDatabaseClient<QueryDatabase>,
  comment:
    | (Omit<z.infer<typeof maintenanceDispatchCommentValidator>, "id"> & {
        companyId: string;
        createdBy: string;
      })
    | (Omit<z.infer<typeof maintenanceDispatchCommentValidator>, "id"> & {
        id: string;
        updatedBy: string;
      })
) {
  if ("createdBy" in comment) {
    return client
      .from("maintenanceDispatchComment")
      .insert([comment])
      .select("id")
      .single();
  } else {
    return client
      .from("maintenanceDispatchComment")
      .update(sanitize(comment))
      .eq("id", comment.id);
  }
}

export async function upsertMaintenanceDispatchEvent(
  client: CarbonDatabaseClient<QueryDatabase>,
  event:
    | (Omit<z.infer<typeof maintenanceDispatchEventValidator>, "id"> & {
        companyId: string;
        createdBy: string;
      })
    | (Omit<z.infer<typeof maintenanceDispatchEventValidator>, "id"> & {
        id: string;
        updatedBy: string;
      })
) {
  if ("createdBy" in event) {
    return client
      .from("maintenanceDispatchEvent")
      .insert([event])
      .select("id")
      .single();
  } else {
    return client
      .from("maintenanceDispatchEvent")
      .update(sanitize(event))
      .eq("id", event.id);
  }
}

export async function upsertMaintenanceDispatchItem(
  client: CarbonDatabaseClient<QueryDatabase>,
  item:
    | (Omit<z.infer<typeof maintenanceDispatchItemValidator>, "id"> & {
        companyId: string;
        createdBy: string;
      })
    | (Omit<z.infer<typeof maintenanceDispatchItemValidator>, "id"> & {
        id: string;
        updatedBy: string;
      })
) {
  if ("createdBy" in item) {
    return client
      .from("maintenanceDispatchItem")
      .insert([item])
      .select("id")
      .single();
  } else {
    return client
      .from("maintenanceDispatchItem")
      .update(sanitize(item))
      .eq("id", item.id);
  }
}

export async function upsertMaintenanceDispatchWorkCenter(
  client: CarbonDatabaseClient<QueryDatabase>,
  workCenter:
    | (Omit<z.infer<typeof maintenanceDispatchWorkCenterValidator>, "id"> & {
        companyId: string;
        createdBy: string;
      })
    | (Omit<z.infer<typeof maintenanceDispatchWorkCenterValidator>, "id"> & {
        id: string;
        updatedBy: string;
      })
) {
  if ("createdBy" in workCenter) {
    return client
      .from("maintenanceDispatchWorkCenter")
      .insert([workCenter])
      .select("id")
      .single();
  } else {
    return client
      .from("maintenanceDispatchWorkCenter")
      .update(sanitize(workCenter))
      .eq("id", workCenter.id);
  }
}

export async function upsertMaintenanceSchedule(
  client: CarbonDatabaseClient<QueryDatabase>,
  schedule:
    | (Omit<z.infer<typeof maintenanceScheduleValidator>, "id"> & {
        companyId: string;
        createdBy: string;
      })
    | (Omit<z.infer<typeof maintenanceScheduleValidator>, "id"> & {
        id: string;
        updatedBy: string;
      })
) {
  if ("createdBy" in schedule) {
    return client
      .from("maintenanceSchedule")
      .insert([schedule])
      .select("id")
      .single();
  } else {
    return client
      .from("maintenanceSchedule")
      .update(sanitize(schedule))
      .eq("id", schedule.id);
  }
}

export async function upsertMaintenanceScheduleItem(
  client: CarbonDatabaseClient<QueryDatabase>,
  item:
    | (Omit<z.infer<typeof maintenanceScheduleItemValidator>, "id"> & {
        companyId: string;
        createdBy: string;
      })
    | (Omit<z.infer<typeof maintenanceScheduleItemValidator>, "id"> & {
        id: string;
        updatedBy: string;
      })
) {
  if ("createdBy" in item) {
    return client
      .from("maintenanceScheduleItem")
      .insert([item])
      .select("id")
      .single();
  } else {
    return client
      .from("maintenanceScheduleItem")
      .update(sanitize(item))
      .eq("id", item.id);
  }
}

export async function upsertDemandForecasts(
  client: CarbonDatabaseClient<QueryDatabase>,
  forecasts: Array<{
    itemId: string;
    locationId: string;
    periodId: string;
    forecastQuantity: number;
    companyId: string;
    createdBy: string;
    updatedBy?: string;
  }>
) {
  // Delete existing forecasts with 0 quantity, upsert others
  const toDelete = forecasts.filter((f) => f.forecastQuantity === 0);
  const toUpsert = forecasts.filter((f) => f.forecastQuantity > 0);

  const promises = [];

  if (toDelete.length > 0) {
    for (const forecast of toDelete) {
      promises.push(
        client
          .from("demandForecast")
          .delete()
          .eq("itemId", forecast.itemId)
          .eq("locationId", forecast.locationId)
          .eq("periodId", forecast.periodId)
          .eq("companyId", forecast.companyId)
      );
    }
  }

  if (toUpsert.length > 0) {
    promises.push(
      client.from("demandForecast").upsert(
        toUpsert.map((f) => ({
          ...f,
          updatedBy: f.updatedBy ?? f.createdBy ?? "system",
          updatedAt: new Date().toISOString()
        })),
        {
          onConflict: "itemId,locationId,periodId,companyId"
        }
      )
    );
  }

  const results = await Promise.all(promises);
  const hasError = results.some((r) => r.error);

  return {
    data: hasError ? null : toUpsert,
    error: hasError ? results.find((r) => r.error)?.error : null
  };
}

export async function upsertDemandProjections(
  client: CarbonDatabaseClient<QueryDatabase>,
  forecasts: Array<{
    itemId: string;
    locationId: string;
    periodId: string;
    forecastQuantity: number;
    companyId: string;
    createdBy: string;
    updatedBy?: string;
  }>
) {
  // Delete existing forecasts with 0 quantity, upsert others
  const toDelete = forecasts.filter((f) => f.forecastQuantity === 0);
  const toUpsert = forecasts.filter((f) => f.forecastQuantity > 0);

  const promises = [];

  if (toDelete.length > 0) {
    for (const forecast of toDelete) {
      promises.push(
        client
          .from("demandProjection")
          .delete()
          .eq("itemId", forecast.itemId)
          .eq("locationId", forecast.locationId)
          .eq("periodId", forecast.periodId)
          .eq("companyId", forecast.companyId)
      );
    }
  }

  if (toUpsert.length > 0) {
    promises.push(
      client.from("demandProjection").upsert(
        toUpsert.map((f) => ({
          ...f,
          updatedBy: f.updatedBy ?? f.createdBy ?? "system",
          updatedAt: new Date().toISOString()
        })),
        {
          onConflict: "itemId,locationId,periodId,companyId"
        }
      )
    );
  }

  const results = await Promise.all(promises);
  const hasError = results.some((r) => r.error);

  return {
    data: hasError ? null : toUpsert,
    error: hasError ? results.find((r) => r.error)?.error : null
  };
}

/**
 * Trigger a job scheduling task via Inngest.
 * Supports both initial scheduling and rescheduling.
 */
export async function triggerJobSchedule(
  jobId: string,
  companyId: string,
  userId: string,
  mode: "initial" | "reschedule" = "reschedule",
  direction: "backward" | "forward" = "backward"
) {
  const { trigger } = await import("@carbon/jobs");

  await trigger("schedule-job", {
    jobId,
    companyId,
    userId,
    mode,
    direction
  });

  return { success: true };
}
