import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";
import { getPostgresConnectionPool } from "./postgres.ts";

export const scheduleArgsValidator = z.object({
  jobId: z.string(),
  companyId: z.string(),
  userId: z.string(),
  mode: z.enum(["initial", "reschedule"]).default("initial"),
  direction: z.enum(["backward", "forward"]).default("backward")
});

type ScheduleArgs = z.infer<typeof scheduleArgsValidator>;
type SchedulingDirection = ScheduleArgs["direction"];
type DeadlineType =
  | "No Deadline"
  | "ASAP"
  | "Soft Deadline"
  | "Hard Deadline";
type FactorUnit =
  | "Hours/Piece"
  | "Hours/100 Pieces"
  | "Hours/1000 Pieces"
  | "Minutes/Piece"
  | "Minutes/100 Pieces"
  | "Minutes/1000 Pieces"
  | "Pieces/Hour"
  | "Pieces/Minute"
  | "Seconds/Piece"
  | "Total Hours"
  | "Total Minutes";
type MethodOperationOrder = "After Previous" | "With Previous";
type OperationType = "Inside" | "Outside";

type JobRow = {
  id: string;
  dueDate: string | Date | null;
  deadlineType: DeadlineType;
  locationId: string;
  priority: string | number;
};

type Job = {
  id: string;
  dueDate: string | null;
  deadlineType: DeadlineType;
  locationId: string;
  priority: number;
};

type OperationRow = {
  id: string;
  jobId: string;
  jobMakeMethodId: string | null;
  order: string | number;
  operationOrder: MethodOperationOrder;
  operationType: OperationType;
  processId: string;
  setupTime: string | number;
  setupUnit: FactorUnit;
  laborTime: string | number;
  laborUnit: FactorUnit;
  machineTime: string | number;
  machineUnit: FactorUnit;
  operationQuantity: string | number | null;
  status: string;
  startDate: string | Date | null;
  dueDate: string | Date | null;
  priority: string | number;
  workCenterId: string | null;
};

type Operation = {
  id: string;
  jobId: string;
  jobMakeMethodId: string | null;
  order: number;
  operationOrder: MethodOperationOrder;
  operationType: OperationType;
  processId: string;
  setupTime: number;
  setupUnit: FactorUnit;
  laborTime: number;
  laborUnit: FactorUnit;
  machineTime: number;
  machineUnit: FactorUnit;
  operationQuantity: number | null;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  priority: number;
  workCenterId: string | null;
};

type DependencyRecord = {
  jobId: string;
  operationId: string;
  dependsOnId: string;
  companyId: string;
};

type DependencyRow = {
  jobId: string;
  operationId: string;
  dependsOnId: string;
  companyId: string;
};

type ScheduledOperation = Operation & {
  startDate: string;
  dueDate: string;
  hasConflict: boolean;
  conflictReason: string | null;
};

type Graph = {
  dependenciesByOperation: Map<string, Set<string>>;
  dependentsByOperation: Map<string, Set<string>>;
};

type PriorityOperationRow = {
  id: string;
  workCenterId: string | null;
  startDate: string | Date | null;
  jobPriority: string | number;
  deadlineType: DeadlineType;
};

type PriorityOperation = {
  id: string;
  workCenterId: string;
  startDate: string | null;
  jobPriority: number;
  deadlineType: DeadlineType;
};

type ScheduleResult = {
  success: true;
  operationsScheduled: number;
  conflictsDetected: number;
  workCentersAffected: string[];
  assemblyDepth: number;
};

let schedulePool: Pool | null = null;

export async function schedule(args: ScheduleArgs): Promise<ScheduleResult> {
  if (!args.companyId) throw new Error("Payload is missing companyId");
  if (!args.userId) throw new Error("Payload is missing userId");

  const pool = getSchedulePool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [
      args.userId
    ]);
    const result = await scheduleJob(client, args);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function closeSchedulePool() {
  if (!schedulePool) return;
  await schedulePool.end();
  schedulePool = null;
}

function getSchedulePool() {
  schedulePool ??= getPostgresConnectionPool(
    Number(process.env.DATABASE_SERVICE_POOL_SIZE ?? 5),
    { kind: "service" }
  );
  return schedulePool;
}

async function scheduleJob(
  client: PoolClient,
  args: ScheduleArgs
): Promise<ScheduleResult> {
  const job = await loadJob(client, args.jobId, args.companyId);
  if (!job) {
    throw new Error(`Job ${args.jobId} was not found`);
  }

  const operations = await loadOperations(client, args.jobId, args.companyId);
  const assemblyDepth = await calculateAssemblyDepth(
    client,
    args.jobId,
    args.companyId
  );

  if (operations.length === 0) {
    if (args.mode === "initial") {
      await updateJobStatus(client, args);
    }
    return {
      success: true,
      operationsScheduled: 0,
      conflictsDetected: 0,
      workCentersAffected: [],
      assemblyDepth
    };
  }

  let dependencies: DependencyRecord[];
  if (args.mode === "initial") {
    await assignMaterials(client, args, operations);
    dependencies = await buildInitialDependencies(client, args, operations);
  } else {
    dependencies = await loadDependencies(client, args.jobId, args.companyId);
    if (dependencies.length === 0) {
      dependencies = await buildInitialDependencies(client, args, operations);
    }
  }

  const scheduled = calculateOperationDates(
    operations,
    dependencies,
    job,
    args.direction
  );
  const workCentersAffected = await assignWorkCenters(client, args, job, scheduled);
  const priorities = await calculatePriorities(
    client,
    args,
    job,
    scheduled,
    workCentersAffected
  );

  await persistScheduledOperations(client, args, scheduled, priorities);
  await persistExistingPriorities(client, args, scheduled, priorities);
  if (args.mode === "initial") {
    await updateJobStatus(client, args);
  }

  return {
    success: true,
    operationsScheduled: scheduled.size,
    conflictsDetected: Array.from(scheduled.values()).filter(
      (operation) => operation.hasConflict
    ).length,
    workCentersAffected: Array.from(workCentersAffected).sort(),
    assemblyDepth
  };
}

async function loadJob(
  client: PoolClient,
  jobId: string,
  companyId: string
): Promise<Job | null> {
  const row = await queryOne<JobRow>(
    client,
    `
      SELECT id, "dueDate", "deadlineType", "locationId", priority
      FROM "job"
      WHERE id = $1 AND "companyId" = $2
    `,
    [jobId, companyId]
  );

  if (!row) return null;
  return {
    id: row.id,
    dueDate: toDateOnly(row.dueDate),
    deadlineType: row.deadlineType,
    locationId: row.locationId,
    priority: toNumber(row.priority)
  };
}

async function loadOperations(
  client: PoolClient,
  jobId: string,
  companyId: string
): Promise<Operation[]> {
  const rows = await queryMany<OperationRow>(
    client,
    `
      SELECT
        id,
        "jobId",
        "jobMakeMethodId",
        "order",
        "operationOrder",
        "operationType",
        "processId",
        "setupTime",
        "setupUnit",
        "laborTime",
        "laborUnit",
        "machineTime",
        "machineUnit",
        "operationQuantity",
        status,
        "startDate",
        "dueDate",
        priority,
        "workCenterId"
      FROM "jobOperation"
      WHERE "jobId" = $1
        AND "companyId" = $2
        AND status NOT IN ('Done', 'Canceled')
      ORDER BY "jobMakeMethodId" NULLS FIRST, "order", id
    `,
    [jobId, companyId]
  );

  return rows.map((row) => ({
    id: row.id,
    jobId: row.jobId,
    jobMakeMethodId: row.jobMakeMethodId,
    order: toNumber(row.order),
    operationOrder: row.operationOrder,
    operationType: row.operationType,
    processId: row.processId,
    setupTime: toNumber(row.setupTime),
    setupUnit: row.setupUnit,
    laborTime: toNumber(row.laborTime),
    laborUnit: row.laborUnit,
    machineTime: toNumber(row.machineTime),
    machineUnit: row.machineUnit,
    operationQuantity:
      row.operationQuantity === null ? null : toNumber(row.operationQuantity),
    status: row.status,
    startDate: toDateOnly(row.startDate),
    dueDate: toDateOnly(row.dueDate),
    priority: toNumber(row.priority),
    workCenterId: row.workCenterId
  }));
}

async function loadDependencies(
  client: PoolClient,
  jobId: string,
  companyId: string
): Promise<DependencyRecord[]> {
  return queryMany<DependencyRow>(
    client,
    `
      SELECT "jobId", "operationId", "dependsOnId", "companyId"
      FROM "jobOperationDependency"
      WHERE "jobId" = $1 AND "companyId" = $2
    `,
    [jobId, companyId]
  );
}

async function assignMaterials(
  client: PoolClient,
  args: ScheduleArgs,
  operations: Operation[]
) {
  const firstOperationByMethod = new Map<string, Operation>();
  for (const operation of sortOperations(operations)) {
    if (!operation.jobMakeMethodId) continue;
    if (!firstOperationByMethod.has(operation.jobMakeMethodId)) {
      firstOperationByMethod.set(operation.jobMakeMethodId, operation);
    }
  }

  if (firstOperationByMethod.size === 0) return;

  const materials = await queryMany<{
    id: string;
    jobMakeMethodId: string;
  }>(
    client,
    `
      SELECT id, "jobMakeMethodId"
      FROM "jobMaterial"
      WHERE "jobId" = $1
        AND "companyId" = $2
        AND "methodType" = 'Make to Order'
        AND "jobOperationId" IS NULL
    `,
    [args.jobId, args.companyId]
  );

  for (const material of materials) {
    const operation = firstOperationByMethod.get(material.jobMakeMethodId);
    if (!operation) continue;
    await client.query(
      `
        UPDATE "jobMaterial"
        SET "jobOperationId" = $1, "updatedAt" = NOW(), "updatedBy" = $2
        WHERE id = $3 AND "companyId" = $4
      `,
      [operation.id, args.userId, material.id, args.companyId]
    );
  }
}

async function buildInitialDependencies(
  client: PoolClient,
  args: ScheduleArgs,
  operations: Operation[]
): Promise<DependencyRecord[]> {
  const dependencyMap = new Map<string, Set<string>>();
  const operationIds = new Set(operations.map((operation) => operation.id));
  for (const operation of operations) {
    dependencyMap.set(operation.id, new Set());
  }

  const operationsByMethod = groupOperationsByMethod(operations);
  for (const methodOperations of operationsByMethod.values()) {
    addIntraMethodDependencies(methodOperations, dependencyMap);
  }

  await addCrossMethodDependencies(
    client,
    args,
    operationsByMethod,
    dependencyMap,
    operationIds
  );

  const records: DependencyRecord[] = [];
  for (const [operationId, dependsOnIds] of dependencyMap.entries()) {
    for (const dependsOnId of dependsOnIds) {
      records.push({
        jobId: args.jobId,
        operationId,
        dependsOnId,
        companyId: args.companyId
      });
    }
  }

  await client.query(
    `
      DELETE FROM "jobOperationDependency"
      WHERE "jobId" = $1 AND "companyId" = $2
    `,
    [args.jobId, args.companyId]
  );
  await insertDependencies(client, records);
  await markRootOperationsReady(client, args, dependencyMap);

  return records;
}

function addIntraMethodDependencies(
  operations: Operation[],
  dependencyMap: Map<string, Set<string>>
) {
  let previousStage: Operation[] = [];
  let currentStage: Operation[] = [];

  const flushCurrentStage = () => {
    for (const operation of currentStage) {
      for (const dependsOn of previousStage) {
        addDependency(dependencyMap, operation.id, dependsOn.id);
      }
    }
    previousStage = currentStage;
    currentStage = [];
  };

  for (const operation of sortOperations(operations)) {
    if (currentStage.length === 0) {
      currentStage.push(operation);
      continue;
    }

    if (operation.operationOrder === "With Previous") {
      currentStage.push(operation);
      continue;
    }

    flushCurrentStage();
    currentStage.push(operation);
  }

  if (currentStage.length > 0) {
    flushCurrentStage();
  }
}

async function addCrossMethodDependencies(
  client: PoolClient,
  args: ScheduleArgs,
  operationsByMethod: Map<string, Operation[]>,
  dependencyMap: Map<string, Set<string>>,
  operationIds: Set<string>
) {
  const childMethods = await queryMany<{
    id: string;
    parentMaterialId: string;
  }>(
    client,
    `
      SELECT id, "parentMaterialId"
      FROM "jobMakeMethod"
      WHERE "jobId" = $1
        AND "companyId" = $2
        AND "parentMaterialId" IS NOT NULL
    `,
    [args.jobId, args.companyId]
  );
  if (childMethods.length === 0) return;

  const parentMaterialIds = childMethods.map((method) => method.parentMaterialId);
  const parentMaterials = await queryMany<{
    id: string;
    jobOperationId: string | null;
  }>(
    client,
    `
      SELECT id, "jobOperationId"
      FROM "jobMaterial"
      WHERE "companyId" = $1
        AND id = ANY($2::text[])
    `,
    [args.companyId, parentMaterialIds]
  );
  const parentOperationByMaterial = new Map(
    parentMaterials.map((material) => [material.id, material.jobOperationId])
  );

  for (const childMethod of childMethods) {
    const parentOperationId = parentOperationByMaterial.get(
      childMethod.parentMaterialId
    );
    if (!parentOperationId || !operationIds.has(parentOperationId)) continue;

    const terminalOperationIds = getTerminalOperationIds(
      operationsByMethod.get(childMethod.id) ?? [],
      dependencyMap
    );
    for (const terminalOperationId of terminalOperationIds) {
      addDependency(dependencyMap, parentOperationId, terminalOperationId);
    }
  }
}

function getTerminalOperationIds(
  operations: Operation[],
  dependencyMap: Map<string, Set<string>>
) {
  if (operations.length === 0) return [];

  const methodOperationIds = new Set(operations.map((operation) => operation.id));
  const operationsWithDependents = new Set<string>();
  for (const [operationId, dependsOnIds] of dependencyMap.entries()) {
    if (!methodOperationIds.has(operationId)) continue;
    for (const dependsOnId of dependsOnIds) {
      if (methodOperationIds.has(dependsOnId)) {
        operationsWithDependents.add(dependsOnId);
      }
    }
  }

  const terminalOperationIds = operations
    .filter((operation) => !operationsWithDependents.has(operation.id))
    .map((operation) => operation.id);
  if (terminalOperationIds.length > 0) return terminalOperationIds;

  return [sortOperations(operations)[operations.length - 1]?.id].filter(
    Boolean
  ) as string[];
}

async function insertDependencies(
  client: PoolClient,
  records: DependencyRecord[]
) {
  if (records.length === 0) return;

  const values: string[] = [];
  const params: unknown[] = [];
  records.forEach((record, index) => {
    const offset = index * 4;
    values.push(
      `(NOW(), $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`
    );
    params.push(
      record.companyId,
      record.dependsOnId,
      record.jobId,
      record.operationId
    );
  });

  await client.query(
    `
      INSERT INTO "jobOperationDependency" (
        "createdAt", "companyId", "dependsOnId", "jobId", "operationId"
      )
      VALUES ${values.join(", ")}
    `,
    params
  );
}

async function markRootOperationsReady(
  client: PoolClient,
  args: ScheduleArgs,
  dependencyMap: Map<string, Set<string>>
) {
  const rootOperationIds = Array.from(dependencyMap.entries())
    .filter(([, dependsOnIds]) => dependsOnIds.size === 0)
    .map(([operationId]) => operationId);
  if (rootOperationIds.length === 0) return;

  await client.query(
    `
      UPDATE "jobOperation"
      SET status = 'Ready', "updatedAt" = NOW(), "updatedBy" = $1
      WHERE "companyId" = $2
        AND id = ANY($3::text[])
        AND status NOT IN ('Done', 'Canceled')
    `,
    [args.userId, args.companyId, rootOperationIds]
  );
}

function calculateOperationDates(
  operations: Operation[],
  dependencies: DependencyRecord[],
  job: Job,
  direction: SchedulingDirection
) {
  const graph = buildGraph(operations, dependencies);
  const orderedOperations = topologicalSort(operations, graph);
  const today = todayDate();
  const jobDueDate = job.dueDate ?? today;
  const scheduled = new Map<string, ScheduledOperation>();

  if (direction === "backward") {
    for (const operation of [...orderedOperations].reverse()) {
      let dueDate = jobDueDate;
      const dependents = graph.dependentsByOperation.get(operation.id) ?? new Set();
      for (const dependentId of dependents) {
        const dependent = scheduled.get(dependentId);
        if (dependent && dependent.startDate < dueDate) {
          dueDate = dependent.startDate;
        }
      }

      const startDate = subtractBusinessDays(
        dueDate,
        calculateDurationDays(operation)
      );
      const hasConflict = startDate < today;
      scheduled.set(operation.id, {
        ...operation,
        startDate,
        dueDate,
        hasConflict,
        conflictReason: hasConflict ? "Operation starts before today" : null
      });
    }
  } else {
    for (const operation of orderedOperations) {
      let startDate = today;
      const dependenciesForOperation =
        graph.dependenciesByOperation.get(operation.id) ?? new Set();
      for (const dependsOnId of dependenciesForOperation) {
        const dependsOn = scheduled.get(dependsOnId);
        if (dependsOn && dependsOn.dueDate > startDate) {
          startDate = dependsOn.dueDate;
        }
      }

      const dueDate = addBusinessDays(
        startDate,
        calculateDurationDays(operation)
      );
      const hasConflict = Boolean(job.dueDate && dueDate > job.dueDate);
      scheduled.set(operation.id, {
        ...operation,
        startDate,
        dueDate,
        hasConflict,
        conflictReason: hasConflict ? "Operation ends after the job due date" : null
      });
    }
  }

  return scheduled;
}

async function assignWorkCenters(
  client: PoolClient,
  args: ScheduleArgs,
  job: Job,
  scheduled: Map<string, ScheduledOperation>
) {
  const workCentersByProcess = await loadWorkCentersByProcess(
    client,
    args.companyId,
    job.locationId
  );
  const allWorkCenterIds = Array.from(
    new Set(Array.from(workCentersByProcess.values()).flat())
  );
  const loadByWorkCenter = await loadWorkCenterLoad(
    client,
    args.companyId,
    allWorkCenterIds,
    Array.from(scheduled.keys())
  );
  const affected = new Set<string>();

  for (const operation of Array.from(scheduled.values()).sort(sortByStartDate)) {
    if (operation.operationType === "Outside") continue;

    const candidates = workCentersByProcess.get(operation.processId) ?? [];
    if (candidates.length === 0) continue;

    const initialWorkCenterId = candidates[0];
    if (!initialWorkCenterId) continue;

    let selectedWorkCenterId = initialWorkCenterId;
    let selectedLoad = loadByWorkCenter.get(selectedWorkCenterId) ?? 0;
    for (const workCenterId of candidates.slice(1)) {
      const load = loadByWorkCenter.get(workCenterId) ?? 0;
      if (load < selectedLoad) {
        selectedWorkCenterId = workCenterId;
        selectedLoad = load;
      }
    }

    operation.workCenterId = selectedWorkCenterId;
    loadByWorkCenter.set(
      selectedWorkCenterId,
      selectedLoad + calculateDurationHours(operation)
    );
    affected.add(selectedWorkCenterId);
  }

  return affected;
}

async function loadWorkCentersByProcess(
  client: PoolClient,
  companyId: string,
  locationId: string
) {
  const rows = await queryMany<{
    processId: string;
    workCenterId: string;
  }>(
    client,
    `
      SELECT wcp."processId", wcp."workCenterId"
      FROM "workCenterProcess" wcp
      JOIN "workCenter" wc ON wc.id = wcp."workCenterId"
      WHERE wcp."companyId" = $1
        AND wc."companyId" = $1
        AND wc.active = true
        AND wc."locationId" = $2
      ORDER BY wcp."processId", wcp."workCenterId"
    `,
    [companyId, locationId]
  );

  const workCentersByProcess = new Map<string, string[]>();
  for (const row of rows) {
    const workCenters = workCentersByProcess.get(row.processId) ?? [];
    workCenters.push(row.workCenterId);
    workCentersByProcess.set(row.processId, workCenters);
  }

  return workCentersByProcess;
}

async function loadWorkCenterLoad(
  client: PoolClient,
  companyId: string,
  workCenterIds: string[],
  scheduledOperationIds: string[]
) {
  const loadByWorkCenter = new Map<string, number>();
  for (const workCenterId of workCenterIds) {
    loadByWorkCenter.set(workCenterId, 0);
  }
  if (workCenterIds.length === 0) return loadByWorkCenter;

  const rows = await queryMany<OperationRow>(
    client,
    `
      SELECT
        id,
        "jobId",
        "jobMakeMethodId",
        "order",
        "operationOrder",
        "operationType",
        "processId",
        "setupTime",
        "setupUnit",
        "laborTime",
        "laborUnit",
        "machineTime",
        "machineUnit",
        "operationQuantity",
        status,
        "startDate",
        "dueDate",
        priority,
        "workCenterId"
      FROM "jobOperation"
      WHERE "companyId" = $1
        AND "workCenterId" = ANY($2::text[])
        AND NOT (id = ANY($3::text[]))
        AND status NOT IN ('Done', 'Canceled')
    `,
    [companyId, workCenterIds, scheduledOperationIds]
  );

  for (const operation of rows.map(mapOperationRow)) {
    if (!operation.workCenterId) continue;
    loadByWorkCenter.set(
      operation.workCenterId,
      (loadByWorkCenter.get(operation.workCenterId) ?? 0) +
        calculateDurationHours(operation)
    );
  }

  return loadByWorkCenter;
}

async function calculatePriorities(
  client: PoolClient,
  args: ScheduleArgs,
  job: Job,
  scheduled: Map<string, ScheduledOperation>,
  workCentersAffected: Set<string>
) {
  const priorities = new Map<string, number>();
  if (workCentersAffected.size === 0) return priorities;

  const currentOperationIds = Array.from(scheduled.keys());
  const rows = await queryMany<PriorityOperationRow>(
    client,
    `
      SELECT
        jo.id,
        jo."workCenterId",
        jo."startDate",
        j.priority AS "jobPriority",
        j."deadlineType"
      FROM "jobOperation" jo
      JOIN "job" j ON j.id = jo."jobId"
      WHERE jo."companyId" = $1
        AND jo."workCenterId" = ANY($2::text[])
        AND NOT (jo.id = ANY($3::text[]))
        AND jo.status NOT IN ('Done', 'Canceled')
    `,
    [args.companyId, Array.from(workCentersAffected), currentOperationIds]
  );

  const operationsForPriority = rows
    .filter((row) => row.workCenterId)
    .map((row) => ({
      id: row.id,
      workCenterId: row.workCenterId as string,
      startDate: toDateOnly(row.startDate),
      jobPriority: toNumber(row.jobPriority),
      deadlineType: row.deadlineType
    }));

  for (const operation of scheduled.values()) {
    if (!operation.workCenterId) continue;
    operationsForPriority.push({
      id: operation.id,
      workCenterId: operation.workCenterId,
      startDate: operation.startDate,
      jobPriority: job.priority,
      deadlineType: job.deadlineType
    });
  }

  const operationsByWorkCenter = new Map<string, PriorityOperation[]>();
  for (const operation of operationsForPriority) {
    const operations = operationsByWorkCenter.get(operation.workCenterId) ?? [];
    operations.push(operation);
    operationsByWorkCenter.set(operation.workCenterId, operations);
  }

  for (const operations of operationsByWorkCenter.values()) {
    operations.sort(comparePriorityOperations);
    operations.forEach((operation, index) => {
      priorities.set(operation.id, index + 1);
    });
  }

  return priorities;
}

async function persistScheduledOperations(
  client: PoolClient,
  args: ScheduleArgs,
  scheduled: Map<string, ScheduledOperation>,
  priorities: Map<string, number>
) {
  for (const operation of scheduled.values()) {
    await client.query(
      `
        UPDATE "jobOperation"
        SET
          "startDate" = $1,
          "dueDate" = $2,
          "workCenterId" = $3,
          "hasConflict" = $4,
          "conflictReason" = $5,
          priority = $6,
          "updatedAt" = NOW(),
          "updatedBy" = $7
        WHERE id = $8 AND "companyId" = $9
      `,
      [
        operation.startDate,
        operation.dueDate,
        operation.workCenterId,
        operation.hasConflict,
        operation.conflictReason,
        priorities.get(operation.id) ?? operation.priority,
        args.userId,
        operation.id,
        args.companyId
      ]
    );
  }
}

async function persistExistingPriorities(
  client: PoolClient,
  args: ScheduleArgs,
  scheduled: Map<string, ScheduledOperation>,
  priorities: Map<string, number>
) {
  for (const [operationId, priority] of priorities.entries()) {
    if (scheduled.has(operationId)) continue;
    await client.query(
      `
        UPDATE "jobOperation"
        SET priority = $1, "updatedAt" = NOW(), "updatedBy" = $2
        WHERE id = $3 AND "companyId" = $4
      `,
      [priority, args.userId, operationId, args.companyId]
    );
  }
}

async function updateJobStatus(client: PoolClient, args: ScheduleArgs) {
  await client.query(
    `
      UPDATE "job"
      SET status = 'Ready', "updatedAt" = NOW(), "updatedBy" = $1
      WHERE id = $2
        AND "companyId" = $3
        AND status NOT IN ('Completed', 'Cancelled', 'Closed')
    `,
    [args.userId, args.jobId, args.companyId]
  );
}

async function calculateAssemblyDepth(
  client: PoolClient,
  jobId: string,
  companyId: string
) {
  const methods = await queryMany<{
    id: string;
    parentMaterialId: string | null;
  }>(
    client,
    `
      SELECT id, "parentMaterialId"
      FROM "jobMakeMethod"
      WHERE "jobId" = $1 AND "companyId" = $2
    `,
    [jobId, companyId]
  );
  if (methods.length === 0) return 0;

  const materials = await queryMany<{
    id: string;
    jobMakeMethodId: string;
  }>(
    client,
    `
      SELECT id, "jobMakeMethodId"
      FROM "jobMaterial"
      WHERE "jobId" = $1 AND "companyId" = $2
    `,
    [jobId, companyId]
  );
  const parentMethodByMaterial = new Map(
    materials.map((material) => [material.id, material.jobMakeMethodId])
  );
  const methodById = new Map(methods.map((method) => [method.id, method]));
  const depthByMethod = new Map<string, number>();

  const depthForMethod = (methodId: string, seen = new Set<string>()): number => {
    const existingDepth = depthByMethod.get(methodId);
    if (existingDepth) return existingDepth;
    if (seen.has(methodId)) return 1;
    seen.add(methodId);

    const method = methodById.get(methodId);
    if (!method?.parentMaterialId) {
      depthByMethod.set(methodId, 1);
      return 1;
    }

    const parentMethodId = parentMethodByMaterial.get(method.parentMaterialId);
    const depth = parentMethodId ? depthForMethod(parentMethodId, seen) + 1 : 1;
    depthByMethod.set(methodId, depth);
    return depth;
  };

  return Math.max(...methods.map((method) => depthForMethod(method.id)));
}

function buildGraph(
  operations: Operation[],
  dependencies: DependencyRecord[]
): Graph {
  const operationIds = new Set(operations.map((operation) => operation.id));
  const dependenciesByOperation = new Map<string, Set<string>>();
  const dependentsByOperation = new Map<string, Set<string>>();

  for (const operationId of operationIds) {
    dependenciesByOperation.set(operationId, new Set());
    dependentsByOperation.set(operationId, new Set());
  }

  for (const dependency of dependencies) {
    if (
      !operationIds.has(dependency.operationId) ||
      !operationIds.has(dependency.dependsOnId)
    ) {
      continue;
    }

    dependenciesByOperation
      .get(dependency.operationId)
      ?.add(dependency.dependsOnId);
    dependentsByOperation
      .get(dependency.dependsOnId)
      ?.add(dependency.operationId);
  }

  return {
    dependenciesByOperation,
    dependentsByOperation
  };
}

function topologicalSort(operations: Operation[], graph: Graph) {
  const operationById = new Map(operations.map((operation) => [operation.id, operation]));
  const remainingDependencyCount = new Map<string, number>();
  for (const operation of operations) {
    remainingDependencyCount.set(
      operation.id,
      graph.dependenciesByOperation.get(operation.id)?.size ?? 0
    );
  }

  const queue = sortOperations(operations).filter(
    (operation) => (remainingDependencyCount.get(operation.id) ?? 0) === 0
  );
  const sorted: Operation[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const operation = queue.shift();
    if (!operation || visited.has(operation.id)) continue;

    visited.add(operation.id);
    sorted.push(operation);

    const dependents = graph.dependentsByOperation.get(operation.id) ?? new Set();
    for (const dependentId of dependents) {
      const remaining = (remainingDependencyCount.get(dependentId) ?? 0) - 1;
      remainingDependencyCount.set(dependentId, remaining);
      if (remaining === 0) {
        const dependent = operationById.get(dependentId);
        if (dependent) queue.push(dependent);
      }
    }
    queue.sort(compareOperations);
  }

  if (sorted.length !== operations.length) {
    for (const operation of sortOperations(operations)) {
      if (!visited.has(operation.id)) sorted.push(operation);
    }
  }

  return sorted;
}

function groupOperationsByMethod(operations: Operation[]) {
  const operationsByMethod = new Map<string, Operation[]>();
  for (const operation of operations) {
    const methodId = operation.jobMakeMethodId ?? "__job__";
    const methodOperations = operationsByMethod.get(methodId) ?? [];
    methodOperations.push(operation);
    operationsByMethod.set(methodId, methodOperations);
  }
  return operationsByMethod;
}

function addDependency(
  dependencyMap: Map<string, Set<string>>,
  operationId: string,
  dependsOnId: string
) {
  if (operationId === dependsOnId) return;
  dependencyMap.get(operationId)?.add(dependsOnId);
}

function calculateDurationDays(operation: Operation) {
  return Math.max(Math.ceil(calculateDurationHours(operation) / 8), 1);
}

function calculateDurationHours(operation: Operation) {
  const quantity = operation.operationQuantity ?? 1;
  return (
    convertTimeToHours(operation.setupTime, operation.setupUnit, quantity) +
    Math.max(
      convertTimeToHours(operation.laborTime, operation.laborUnit, quantity),
      convertTimeToHours(operation.machineTime, operation.machineUnit, quantity)
    )
  );
}

function convertTimeToHours(value: number, unit: FactorUnit, quantity: number) {
  if (value <= 0) return 0;

  switch (unit) {
    case "Hours/Piece":
      return value * quantity;
    case "Hours/100 Pieces":
      return (value * quantity) / 100;
    case "Hours/1000 Pieces":
      return (value * quantity) / 1000;
    case "Minutes/Piece":
      return (value * quantity) / 60;
    case "Minutes/100 Pieces":
      return (value * quantity) / 100 / 60;
    case "Minutes/1000 Pieces":
      return (value * quantity) / 1000 / 60;
    case "Pieces/Hour":
      return quantity / value;
    case "Pieces/Minute":
      return quantity / value / 60;
    case "Seconds/Piece":
      return (value * quantity) / 3600;
    case "Total Hours":
      return value;
    case "Total Minutes":
      return value / 60;
  }
}

function comparePriorityOperations(
  left: PriorityOperation,
  right: PriorityOperation
) {
  const dateCompare =
    (left.startDate ?? "9999-12-31").localeCompare(
      right.startDate ?? "9999-12-31"
    );
  if (dateCompare !== 0) return dateCompare;

  const priorityCompare = right.jobPriority - left.jobPriority;
  if (priorityCompare !== 0) return priorityCompare;

  return (
    deadlineWeight(left.deadlineType) - deadlineWeight(right.deadlineType) ||
    left.id.localeCompare(right.id)
  );
}

function deadlineWeight(deadlineType: DeadlineType) {
  switch (deadlineType) {
    case "ASAP":
      return 0;
    case "Hard Deadline":
      return 1;
    case "Soft Deadline":
      return 2;
    case "No Deadline":
      return 3;
  }
}

function sortOperations(operations: Operation[]) {
  return [...operations].sort(compareOperations);
}

function compareOperations(left: Operation, right: Operation) {
  return left.order - right.order || left.id.localeCompare(right.id);
}

function sortByStartDate(left: ScheduledOperation, right: ScheduledOperation) {
  return (
    left.startDate.localeCompare(right.startDate) ||
    left.dueDate.localeCompare(right.dueDate) ||
    compareOperations(left, right)
  );
}

function addBusinessDays(date: string, days: number) {
  const next = parseDateOnly(date);
  let added = 0;
  while (added < days) {
    next.setUTCDate(next.getUTCDate() + 1);
    if (isBusinessDay(next)) added += 1;
  }
  return formatDate(next);
}

function subtractBusinessDays(date: string, days: number) {
  const previous = parseDateOnly(date);
  let subtracted = 0;
  while (subtracted < days) {
    previous.setUTCDate(previous.getUTCDate() - 1);
    if (isBusinessDay(previous)) subtracted += 1;
  }
  return formatDate(previous);
}

function isBusinessDay(date: Date) {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}

function todayDate() {
  return formatDate(new Date());
}

function parseDateOnly(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toDateOnly(value: Date | string | null | undefined) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return formatDate(value);
}

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function mapOperationRow(row: OperationRow): Operation {
  return {
    id: row.id,
    jobId: row.jobId,
    jobMakeMethodId: row.jobMakeMethodId,
    order: toNumber(row.order),
    operationOrder: row.operationOrder,
    operationType: row.operationType,
    processId: row.processId,
    setupTime: toNumber(row.setupTime),
    setupUnit: row.setupUnit,
    laborTime: toNumber(row.laborTime),
    laborUnit: row.laborUnit,
    machineTime: toNumber(row.machineTime),
    machineUnit: row.machineUnit,
    operationQuantity:
      row.operationQuantity === null ? null : toNumber(row.operationQuantity),
    status: row.status,
    startDate: toDateOnly(row.startDate),
    dueDate: toDateOnly(row.dueDate),
    priority: toNumber(row.priority),
    workCenterId: row.workCenterId
  };
}

async function queryOne<T extends QueryResultRow>(
  client: PoolClient,
  query: string,
  values: unknown[] = []
) {
  const result = await client.query<T>(query, values);
  return result.rows[0] ?? null;
}

async function queryMany<T extends QueryResultRow>(
  client: PoolClient,
  query: string,
  values: unknown[] = []
) {
  const result = await client.query<T>(query, values);
  return result.rows;
}
