import type {
  Json,
  QueryDatabase
} from "@carbon/database/schema";
import type { CarbonDatabaseClient } from "@carbon/database/query-client";
import type { z } from "zod";
import type { GenericQueryFilters } from "~/utils/query";
import { setGenericQueryFilters } from "~/utils/query";
import { sanitize } from "@carbon/utils";
import type {
  failureModeValidator,
  locationValidator,
  maintenanceDispatchCommentValidator,
  maintenanceDispatchEventValidator,
  maintenanceDispatchItemValidator,
  maintenanceDispatchValidator,
  maintenanceDispatchWorkCenterValidator,
  maintenanceScheduleItemValidator,
  maintenanceScheduleValidator,
  partnerValidator,
  processValidator,
  trainingQuestionValidator,
  trainingValidator,
  workCenterValidator
} from "./resources.models";

export async function activateWorkCenter(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("workCenter").update({ active: true }).eq("id", id);
}

export async function deleteAbility(
  client: CarbonDatabaseClient<QueryDatabase>,
  abilityId: string,
  hardDelete = true
) {
  return hardDelete
    ? client.from("ability").delete().eq("id", abilityId)
    : client.from("ability").update({ active: false }).eq("id", abilityId);
}

export async function deleteContractor(
  client: CarbonDatabaseClient<QueryDatabase>,
  contractorId: string
) {
  return client.from("contractor").delete().eq("id", contractorId);
}

export async function deleteEmployeeAbility(
  client: CarbonDatabaseClient<QueryDatabase>,
  employeeAbilityId: string
) {
  return client
    .from("employeeAbility")
    .update({ active: false })
    .eq("id", employeeAbilityId);
}

export async function deleteFailureMode(
  client: CarbonDatabaseClient<QueryDatabase>,
  failureModeId: string
) {
  return client.from("maintenanceFailureMode").delete().eq("id", failureModeId);
}

export async function deleteLocation(
  client: CarbonDatabaseClient<QueryDatabase>,
  locationId: string
) {
  return client.from("location").delete().eq("id", locationId);
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

export async function deletePartner(
  client: CarbonDatabaseClient<QueryDatabase>,
  partnerId: string
) {
  return client.from("partner").delete().eq("id", partnerId);
}

export async function activateProcess(
  client: CarbonDatabaseClient<QueryDatabase>,
  processId: string
) {
  return client.from("process").update({ active: true }).eq("id", processId);
}

export async function processDeactivate(
  client: CarbonDatabaseClient<QueryDatabase>,
  processId: string
) {
  return client.from("process").update({ active: false }).eq("id", processId);
}

export async function deleteProcess(
  client: CarbonDatabaseClient<QueryDatabase>,
  processId: string
) {
  return client.from("process").delete().eq("id", processId);
}

export async function deleteShift(
  client: CarbonDatabaseClient<QueryDatabase>,
  shiftId: string
) {
  // TODO: Set all employeeShifts to null
  return client.from("shift").update({ active: false }).eq("id", shiftId);
}

export async function deleteSuggestion(
  client: CarbonDatabaseClient<QueryDatabase>,
  suggestionId: string
) {
  return client.from("suggestion").delete().eq("id", suggestionId);
}

export async function deleteTraining(
  client: CarbonDatabaseClient<QueryDatabase>,
  trainingId: string
) {
  return client.from("training").delete().eq("id", trainingId);
}

export async function deleteTrainingAssignment(
  client: CarbonDatabaseClient<QueryDatabase>,
  assignmentId: string
) {
  return client.from("trainingAssignment").delete().eq("id", assignmentId);
}

export async function deleteTrainingQuestion(
  client: CarbonDatabaseClient<QueryDatabase>,
  trainingQuestionId: string,
  companyId: string
) {
  return client
    .from("trainingQuestion")
    .delete()
    .eq("id", trainingQuestionId)
    .eq("companyId", companyId);
}

export async function deleteWorkCenter(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client.from("workCenter").update({ active: false }).eq("id", id);
}

export async function getAbilities(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("ability")
    .select(`*, employeeAbility(employeeId)`, {
      count: "exact"
    })
    .eq("companyId", companyId)
    .eq("active", true)
    .eq("employeeAbility.active", true);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "name", ascending: true }
  ]);
  return query;
}

export async function getAbilitiesList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("ability")
    .select(`id, name`)
    .eq("companyId", companyId)
    .order("name");
}

export async function getAbility(
  client: CarbonDatabaseClient<QueryDatabase>,
  abilityId: string
) {
  return client
    .from("ability")
    .select(
      `*, employeeAbility(id, employeeId, lastTrainingDate, trainingDays, trainingCompleted)`,
      {
        count: "exact"
      }
    )
    .eq("id", abilityId)
    .eq("active", true)
    .eq("employeeAbility.active", true)
    .single();
}

export async function getContractor(
  client: CarbonDatabaseClient<QueryDatabase>,
  contractorId: string
) {
  return client
    .from("contractors")
    .select("*")
    .eq("supplierContactId", contractorId)
    .single();
}

export async function getContractors(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("contractors")
    .select("*")
    .eq("companyId", companyId)
    .eq("active", true);

  if (args?.search) {
    query = query.or(
      `fullName.ilike.%${args.search}%,email.ilike.%${args.search}%`
    );
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "lastName", ascending: true }
    ]);
  }

  return query;
}

export async function getEmployeeAbilities(
  client: CarbonDatabaseClient<QueryDatabase>,
  employeeId: string
) {
  return client
    .from("employeeAbility")
    .select(`*, ability(id, name, curve, shadowWeeks)`)
    .eq("employeeId", employeeId)
    .eq("active", true);
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

export async function getLocation(
  client: CarbonDatabaseClient<QueryDatabase>,
  locationId: string
) {
  return client.from("location").select("*").eq("id", locationId).single();
}

export async function getLocations(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("location")
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

export async function getLocationsList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("location")
    .select(`id, name`)
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
      schedule:maintenanceSchedule(id, name),
      procedure:procedureId(id, name)`
    )
    .eq("id", dispatchId)
    .single();
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
       item:item!maintenanceDispatchItem_itemId_fkey(id, name, itemTrackingType)`
    )
    .eq("maintenanceDispatchId", dispatchId);
}

export async function getMaintenanceDispatchItemTrackedEntities(
  client: CarbonDatabaseClient<QueryDatabase>,
  maintenanceDispatchItemId: string
) {
  return client
    .from("maintenanceDispatchItemTrackedEntity")
    .select(
      `
      *,
      trackedEntity:trackedEntityId (id, quantity, status, readableId:sourceDocumentReadableId)
    `
    )
    .eq("maintenanceDispatchItemId", maintenanceDispatchItemId);
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

export async function getMaintenanceDispatchesByLocation(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  locationId: string,
  args?: GenericQueryFilters & { search: string | null; status?: string }
) {
  let query = client.rpc(
    "get_maintenance_dispatches_by_location",
    {
      p_company_id: companyId,
      p_location_id: locationId
    },
    { count: "exact" }
  );

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

export async function getMaintenanceSchedulesByLocation(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  locationId: string,
  args?: GenericQueryFilters & { search: string | null; active?: boolean }
) {
  let query = client.rpc(
    "get_maintenance_schedules_by_location",
    {
      p_company_id: companyId,
      p_location_id: locationId
    },
    { count: "exact" }
  );

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

export async function getOutstandingTrainingsForUser(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  employeeId: string
) {
  const { data, error } = await client.rpc("get_training_assignment_status", {
    p_company_id: companyId
  });

  if (error) return { data: null, error };

  // Filter to this employee's pending/overdue trainings
  const filteredData = (data ?? [])
    .filter(
      (d: any) =>
        d.employeeId === employeeId &&
        (d.status === "Pending" || d.status === "Overdue")
    )
    .sort((a: any, b: any) => {
      // Overdue first
      if (a.status === "Overdue" && b.status !== "Overdue") return -1;
      if (a.status !== "Overdue" && b.status === "Overdue") return 1;
      return 0;
    });

  return { data: filteredData, error: null };
}

export async function getPartner(
  client: CarbonDatabaseClient<QueryDatabase>,
  partnerId: string,
  abilityId: string
) {
  return client
    .from("partners")
    .select("*")
    .eq("supplierLocationId", partnerId)
    .eq("abilityId", abilityId)
    .single();
}

export async function getPartnerBySupplierId(
  client: CarbonDatabaseClient<QueryDatabase>,
  partnerId: string
) {
  return client
    .from("partners")
    .select("*")
    .eq("supplierLocationId", partnerId)
    .single();
}

export async function getPartners(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("partners")
    .select("*")
    .eq("companyId", companyId)
    .eq("active", true);

  if (args?.search) {
    query = query.ilike("supplierName", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "supplierName", ascending: true }
    ]);
  }

  return query;
}

export async function getProcess(
  client: CarbonDatabaseClient<QueryDatabase>,
  processId: string
) {
  return client.from("processes").select("*").eq("id", processId).single();
}

export async function getProcesses(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("processes")
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

export async function getProcessesList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("process")
    .select(`id, name`)
    .eq("companyId", companyId)
    .eq("active", true)
    .order("name");
}

export async function getSuggestion(
  client: CarbonDatabaseClient<QueryDatabase>,
  suggestionId: string
) {
  return client.from("suggestions").select("*").eq("id", suggestionId).single();
}

export async function getSuggestions(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("suggestions")
    .select("*", { count: "exact" })
    .eq("companyId", companyId);

  if (args?.search) {
    query = query.ilike("suggestion", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "createdAt", ascending: false }
    ]);
  }

  return query;
}

export async function getTraining(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  const training = await client
    .from("training")
    .select("*")
    .eq("id", id)
    .single();

  if (training.error || !training.data) {
    return training;
  }

  const questions = await client
    .from("trainingQuestion")
    .select("*")
    .eq("trainingId", id)
    .eq("companyId", training.data.companyId ?? "")
    .order("sortOrder");

  return {
    ...training,
    data: {
      ...training.data,
      trainingQuestion: questions.data ?? []
    }
  };
}

export async function getTrainingAssignment(
  client: CarbonDatabaseClient<QueryDatabase>,
  assignmentId: string
) {
  const assignment = await client
    .from("trainingAssignment")
    .select("*")
    .eq("id", assignmentId)
    .single();

  if (assignment.error || !assignment.data) {
    return assignment;
  }

  const training = await client
    .from("training")
    .select("id, name, frequency, type, status")
    .eq("id", assignment.data.trainingId)
    .eq("companyId", assignment.data.companyId)
    .single();

  return {
    ...assignment,
    data: {
      ...assignment.data,
      training: training.data
    }
  };
}

export async function getTrainingAssignmentForCompletion(
  client: CarbonDatabaseClient<QueryDatabase>,
  assignmentId: string
) {
  const assignment = await client
    .from("trainingAssignment")
    .select("*")
    .eq("id", assignmentId)
    .single();

  if (assignment.error || !assignment.data) {
    return assignment;
  }

  const training = await client
    .from("training")
    .select(
      "id, name, description, content, frequency, type, status, estimatedDuration"
    )
    .eq("id", assignment.data.trainingId)
    .eq("companyId", assignment.data.companyId)
    .single();

  const questions =
    training.data?.id && assignment.data.companyId
      ? await client
          .from("trainingQuestion")
          .select("*")
          .eq("trainingId", training.data.id)
          .eq("companyId", assignment.data.companyId)
          .order("sortOrder")
      : { data: [] };

  return {
    ...assignment,
    data: {
      ...assignment.data,
      training: training.data
        ? {
            ...training.data,
            trainingQuestion: questions.data ?? []
          }
        : null
    }
  };
}

export async function getTrainingAssignments(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  trainingId?: string
) {
  let query = client
    .from("trainingAssignment")
    .select("*")
    .eq("companyId", companyId);

  if (trainingId) {
    query = query.eq("trainingId", trainingId);
  }

  const assignments = await query;
  if (assignments.error || !assignments.data) {
    return assignments;
  }

  const trainingIds = [
    ...new Set(assignments.data.map((assignment) => assignment.trainingId))
  ];
  const trainings =
    trainingIds.length > 0
      ? await client
          .from("training")
          .select("id, name, frequency")
          .eq("companyId", companyId)
          .in("id", trainingIds)
      : { data: [] };
  const trainingsById = new Map(
    trainings.data?.map((training) => [training.id, training] as const) ?? []
  );

  return {
    ...assignments,
    data: assignments.data.map((assignment) => ({
      ...assignment,
      training: trainingsById.get(assignment.trainingId) ?? null
    }))
  };
}

export async function getTrainingAssignmentStatus(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: {
    trainingId?: string;
    status?: "Completed" | "Pending" | "Overdue" | "Not Required";
    search?: string;
  } & GenericQueryFilters
) {
  const { data, error } = await client.rpc("get_training_assignment_status", {
    p_company_id: companyId
  });

  if (error) return { data: null, error, count: null };

  let filteredData = data ?? [];

  // Apply filters in memory since we're using an RPC function
  if (args?.trainingId) {
    filteredData = filteredData.filter((d: any) => d.trainingId === args.trainingId);
  }
  if (args?.status) {
    filteredData = filteredData.filter((d: any) => d.status === args.status);
  }
  if (args?.search) {
    const searchLower = args.search.toLowerCase();
    filteredData = filteredData.filter(
      (d: any) =>
        d.trainingName?.toLowerCase().includes(searchLower) ||
        d.employeeName?.toLowerCase().includes(searchLower)
    );
  }

  // Apply sorting
  const sortColumn = args?.sorts?.[0]?.sortBy ?? "employeeName";
  const sortAsc = args?.sorts?.[0]?.sortAsc ?? true;
  filteredData.sort((a: any, b: any) => {
    const aVal = a[sortColumn as keyof typeof a] ?? "";
    const bVal = b[sortColumn as keyof typeof b] ?? "";
    if (aVal < bVal) return sortAsc ? -1 : 1;
    if (aVal > bVal) return sortAsc ? 1 : -1;
    return 0;
  });

  // Apply pagination
  const count = filteredData.length;
  if (args?.limit) {
    const offset = args.offset ?? 0;
    filteredData = filteredData.slice(offset, offset + args.limit);
  }

  return { data: filteredData, error: null, count };
}

export async function getTrainingAssignmentSummary(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client.rpc("get_training_assignment_summary", {
    p_company_id: companyId
  });
}

export async function getTrainingQuestions(
  client: CarbonDatabaseClient<QueryDatabase>,
  trainingId: string
) {
  return client
    .from("trainingQuestion")
    .select("*")
    .eq("trainingId", trainingId)
    .order("sortOrder", { ascending: true });
}

export async function getTrainings(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: { search: string | null } & GenericQueryFilters
) {
  let query = client
    .from("trainings")
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

export async function getTrainingsList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("training")
    .select("id, name, status")
    .eq("companyId", companyId)
    .eq("status", "Active")
    .order("name", { ascending: true });
}

export async function getWorkCenter(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string
) {
  return client
    .from("workCenters")
    .select("*")
    .eq("active", true)
    .eq("id", id)
    .single();
}

export async function getWorkCenters(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: { search: string | null } & GenericQueryFilters
) {
  let query = client
    .from("workCenters")
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

export async function getWorkCentersByLocation(
  client: CarbonDatabaseClient<QueryDatabase>,
  locationId: string
) {
  // Query both views and merge - workCenters has processes, workCentersWithBlockingStatus has blocking info
  const [workCentersResult, blockingStatusResult] = await Promise.all([
    client
      .from("workCenters")
      .select("*")
      .eq("locationId", locationId)
      .eq("active", true),
    client
      .from("workCentersWithBlockingStatus")
      .select("id, isBlocked, blockingDispatchId, blockingDispatchReadableId")
      .eq("locationId", locationId)
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

export async function getWorkCentersList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("workCenters")
    .select("*")
    .eq("companyId", companyId)
    .eq("active", true)
    .order("name");
}

export async function getWorkCentersListWithBlockingStatus(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("workCentersWithBlockingStatus")
    .select("*")
    .eq("companyId", companyId)
    .eq("active", true)
    .order("name");
}

export async function insertAbility(
  client: CarbonDatabaseClient<QueryDatabase>,
  ability: {
    name: string;
    curve: {
      data: {
        week: number;
        value: number;
      }[];
    };
    shadowWeeks: number;
    companyId: string;
    createdBy: string;
  }
) {
  return client.from("ability").insert([ability]).select("*").single();
}

export async function insertEmployeeAbilities(
  client: CarbonDatabaseClient<QueryDatabase>,
  abilityId: string,
  employeeIds: string[],
  companyId: string
) {
  const employeeAbilities = employeeIds.map((employeeId) => ({
    abilityId,
    employeeId,
    companyId,
    trainingCompleted: true
  }));

  return client
    .from("employeeAbility")
    .insert(employeeAbilities)
    .select("id")
    .single();
}

export async function insertTrainingCompletion(
  client: CarbonDatabaseClient<QueryDatabase>,
  completion: {
    trainingAssignmentId: string;
    employeeId: string;
    period: string | null;
    companyId: string;
    completedBy: string;
    createdBy: string;
  }
) {
  return client
    .from("trainingCompletion")
    .insert({
      ...completion,
      completedAt: new Date().toISOString()
    })
    .select("id")
    .single();
}

export async function updateAbility(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  ability: Partial<{
    name: string;
    curve: {
      data: {
        week: number;
        value: number;
      }[];
    };
    shadowWeeks: number;
  }>
) {
  return client.from("ability").update(sanitize(ability)).eq("id", id);
}

export async function updateSuggestionEmoji(
  client: CarbonDatabaseClient<QueryDatabase>,
  suggestionId: string,
  emoji: string
) {
  return client.from("suggestion").update({ emoji }).eq("id", suggestionId);
}

export async function updateSuggestionTags(
  client: CarbonDatabaseClient<QueryDatabase>,
  suggestionId: string,
  tags: string[]
) {
  return client.from("suggestion").update({ tags }).eq("id", suggestionId);
}

export async function updateTrainingQuestionOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  updates: {
    id: string;
    sortOrder: number;
    updatedBy: string;
  }[]
) {
  const updatePromises = updates.map(({ id, sortOrder, updatedBy }) =>
    client
      .from("trainingQuestion")
      .update({ sortOrder, updatedBy })
      .eq("id", id)
  );
  return Promise.all(updatePromises);
}

export async function upsertContractor(
  client: CarbonDatabaseClient<QueryDatabase>,
  contractorWithAbilities:
    | {
        id: string;
        hoursPerWeek?: number;
        abilities: string[];
        companyId: string;
        createdBy: string;
        customFields?: Json;
      }
    | {
        id: string;
        hoursPerWeek?: number;
        abilities: string[];
        updatedBy: string;
        customFields?: Json;
      }
) {
  const { abilities, ...contractor } = contractorWithAbilities;
  if ("updatedBy" in contractor) {
    const updateContractor = await client
      .from("contractor")
      .update(sanitize(contractor))
      .eq("id", contractor.id);
    if (updateContractor.error) {
      return updateContractor;
    }
    const deleteContractorAbilities = await client
      .from("contractorAbility")
      .delete()
      .eq("contractorId", contractor.id);
    if (deleteContractorAbilities.error) {
      return deleteContractorAbilities;
    }
  } else {
    const createContractor = await client
      .from("contractor")
      .insert([contractor]);
    if (createContractor.error) {
      return createContractor;
    }
  }

  const contractorAbilities = abilities.map((ability) => {
    return {
      contractorId: contractor.id,
      abilityId: ability,
      createdBy:
        "createdBy" in contractor ? contractor.createdBy : contractor.updatedBy
    };
  });

  return client.from("contractorAbility").insert(contractorAbilities);
}

export async function upsertEmployeeAbility(
  client: CarbonDatabaseClient<QueryDatabase>,
  employeeAbility: {
    id?: string;
    abilityId: string;
    employeeId: string;
    trainingCompleted: boolean;
    trainingDays?: number;
    companyId: string;
  }
) {
  const { id, ...update } = employeeAbility;
  if (id) {
    return client.from("employeeAbility").update(sanitize(update)).eq("id", id);
  }

  const deactivatedId = await client
    .from("employeeAbility")
    .select("id")
    .eq("employeeId", employeeAbility.employeeId)
    .eq("abilityId", employeeAbility.abilityId)
    .eq("active", false)
    .single();

  if (deactivatedId.data?.id) {
    return client
      .from("employeeAbility")
      .update(sanitize({ ...update, active: true }))
      .eq("id", deactivatedId.data.id);
  }

  return client
    .from("employeeAbility")
    .insert([{ ...update }])
    .select("id")
    .single();
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

export async function upsertLocation(
  client: CarbonDatabaseClient<QueryDatabase>,
  location:
    | (Omit<z.infer<typeof locationValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof locationValidator>, "id"> & {
        id: string;
        companyId?: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("id" in location) {
    const { companyId, ...data } = location;
    let query = client
      .from("location")
      .update(sanitize(data))
      .eq("id", location.id);
    if (companyId) {
      query = query.eq("companyId", companyId);
    }
    return query;
  }
  return client.from("location").insert([location]).select("*").single();
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
    | (Omit<z.infer<typeof maintenanceDispatchValidator>, "id" | "assignee"> & {
        id: string;
        assignee: string | null;
        updatedBy: string;
        content?: Json;
      })
) {
  if ("createdBy" in dispatch) {
    return (
      client
        .from("maintenanceDispatch")
        .insert([dispatch])
        .select("id")
        .single()
    );
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

export async function upsertPartner(
  client: CarbonDatabaseClient<QueryDatabase>,
  partner:
    | (Omit<z.infer<typeof partnerValidator>, "supplierId"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof partnerValidator>, "supplierId"> & {
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("updatedBy" in partner) {
    return client
      .from("partner")
      .update(sanitize(partner))
      .eq("id", partner.id);
  } else {
    return await client.from("partner").insert([partner]);
  }
}

export async function upsertProcess(
  client: CarbonDatabaseClient<QueryDatabase>,
  process:
    | (Omit<z.infer<typeof processValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof processValidator>, "id"> & {
        id: string;
        companyId: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in process) {
    const { workCenters, ...insert } = process;
    const processInsert = await client
      .from("process")
      .insert([
        {
          ...insert,
          defaultStandardFactor: insert.defaultStandardFactor ?? "Minutes/Piece"
        }
      ])
      .select("id")
      .single();
    if (processInsert.error) {
      return processInsert;
    }
    const processId = processInsert.data.id;
    const processProcesses = workCenters?.map((workCenterId) => ({
      workCenterId,
      processId,
      companyId: insert.companyId,
      createdBy: insert.createdBy
    }));

    if (processProcesses) {
      const processProcessInsert = await client
        .from("workCenterProcess")
        .insert(processProcesses);

      if (processProcessInsert.error) {
        return processProcessInsert;
      }
    }

    return processInsert;
  }
  const { workCenters, ...update } = process;
  const processUpdate = await client
    .from("process")
    .update(sanitize(update))
    .eq("id", process.id);
  if (processUpdate.error) {
    return processUpdate;
  }

  const deleteWorkCenters = await client
    .from("workCenterProcess")
    .delete()
    .eq("processId", process.id);

  if (deleteWorkCenters.error) {
    return deleteWorkCenters;
  }

  const processProcesses = workCenters?.map((workCenterId) => ({
    processId: process.id,
    workCenterId,
    companyId: update.companyId,
    createdBy: update.updatedBy
  }));

  if (processProcesses) {
    const processProcessUpdate = await client
      .from("workCenterProcess")
      .insert(processProcesses);
    if (processProcessUpdate.error) {
      return processProcessUpdate;
    }
  }

  return processUpdate;
}

export async function upsertTraining(
  client: CarbonDatabaseClient<QueryDatabase>,
  training:
    | (Omit<z.infer<typeof trainingValidator>, "id"> & {
        companyId: string;
        createdBy: string;
      })
    | (Omit<z.infer<typeof trainingValidator>, "id"> & {
        id: string;
        updatedBy: string;
      })
) {
  if ("id" in training) {
    return client
      .from("training")
      .update(sanitize(training))
      .eq("id", training.id)
      .select("id")
      .single();
  }

  return client.from("training").insert([training]).select("id").single();
}

export async function upsertTrainingAssignment(
  client: CarbonDatabaseClient<QueryDatabase>,
  assignment: {
    id?: string;
    trainingId: string;
    groupIds: string[];
    companyId: string;
    createdBy?: string;
    updatedBy?: string;
  }
) {
  if (assignment.id) {
    return client
      .from("trainingAssignment")
      .update({
        groupIds: assignment.groupIds,
        updatedBy: assignment.updatedBy
      })
      .eq("id", assignment.id)
      .select("id")
      .single();
  }
  return client
    .from("trainingAssignment")
    .insert({
      trainingId: assignment.trainingId,
      groupIds: assignment.groupIds,
      companyId: assignment.companyId,
      createdBy: assignment.createdBy!
    })
    .select("id")
    .single();
}

export async function upsertTrainingQuestion(
  client: CarbonDatabaseClient<QueryDatabase>,
  trainingQuestion:
    | (Omit<z.infer<typeof trainingQuestionValidator>, "id"> & {
        companyId: string;
        createdBy: string;
      })
    | (Omit<z.infer<typeof trainingQuestionValidator>, "id"> & {
        id: string;
        updatedBy: string;
      })
) {
  if ("id" in trainingQuestion) {
    return client
      .from("trainingQuestion")
      .update(sanitize(trainingQuestion))
      .eq("id", trainingQuestion.id)
      .select("id")
      .single();
  }
  return client
    .from("trainingQuestion")
    .insert([trainingQuestion])
    .select("id")
    .single();
}

export async function upsertWorkCenter(
  client: CarbonDatabaseClient<QueryDatabase>,
  workCenter:
    | (Omit<z.infer<typeof workCenterValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof workCenterValidator>, "id"> & {
        id: string;
        companyId: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in workCenter) {
    const { processes, ...insert } = workCenter;
    const workCenterInsert = await client
      .from("workCenter")
      .insert([insert])
      .select("id")
      .single();
    if (workCenterInsert.error) {
      return workCenterInsert;
    }
    const workCenterId = workCenterInsert.data.id;
    const workCenterProcesses = processes?.map((process) => ({
      workCenterId,
      processId: process,
      companyId: insert.companyId,
      createdBy: insert.createdBy
    }));

    if (workCenterProcesses) {
      const workCenterProcessInsert = await client
        .from("workCenterProcess")
        .insert(workCenterProcesses);

      if (workCenterProcessInsert.error) {
        return workCenterProcessInsert;
      }
    }

    return workCenterInsert;
  }
  const { processes, ...update } = workCenter;
  const workCenterUpdate = await client
    .from("workCenter")
    .update(sanitize(update))
    .eq("id", workCenter.id);
  if (workCenterUpdate.error) {
    return workCenterUpdate;
  }

  const deleteProcesses = await client
    .from("workCenterProcess")
    .delete()
    .eq("workCenterId", workCenter.id);

  if (deleteProcesses.error) {
    return deleteProcesses;
  }

  const workCenterProcesses = processes?.map((process) => ({
    workCenterId: workCenter.id,
    processId: process,
    companyId: update.companyId,
    createdBy: update.updatedBy
  }));

  if (workCenterProcesses) {
    const workCenterProcessUpdate = await client
      .from("workCenterProcess")
      .insert(workCenterProcesses);
    if (workCenterProcessUpdate.error) {
      return workCenterProcessUpdate;
    }
  }

  return workCenterUpdate;
}
