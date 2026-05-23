import type { QueryDatabase } from "@carbon/database/schema";
import type { CarbonDatabaseClient } from "@carbon/database/query-client";
import type {
  Activity,
  ActivityInput,
  ActivityOutput,
  GraphData,
  TrackedEntity
} from "./types";
import { clampDepth } from "./ui/Traceability/constants";
import type {
  IssueContainment,
  IssueContainmentStatus,
  StepRecord
} from "./ui/Traceability/utils";

export type LineageDirection = "up" | "down" | "both";

export type LineagePayload = {
  entities: TrackedEntity[];
  inputs: ActivityInput[];
  outputs: ActivityOutput[];
  activities: Activity[];
  stepRecords?: StepRecord[];
  containments?: IssueContainment[];
};

const MAX_ENTITIES = 200;

type LineageState = {
  entities: Map<string, TrackedEntity>;
  activities: Map<string, Activity>;
  inputs: Map<string, ActivityInput>;
  outputs: Map<string, ActivityOutput>;
  visited: Set<string>;
};

function newLineageState(): LineageState {
  return {
    entities: new Map(),
    activities: new Map(),
    inputs: new Map(),
    outputs: new Map(),
    visited: new Set()
  };
}

async function expandActivitySiblings(
  client: CarbonDatabaseClient<QueryDatabase>,
  state: LineageState,
  activityIds: string[],
  companyId: string
): Promise<void> {
  const { entities, activities, inputs, outputs } = state;
  const newActivityIds = activityIds.filter((id) => !activities.has(id));
  if (newActivityIds.length > 0) {
    const fetched = await client
      .from("trackedActivity")
      .select("*")
      .in("id", newActivityIds)
      .eq("companyId", companyId);
    for (const row of fetched.data ?? []) {
      activities.set(row.id, row as unknown as Activity);
    }
  }

  // Pull sibling inputs/outputs for every activity so by-products (e.g. SCRAP)
  // appear even when not on the direct upstream/downstream path.
  const [siblingInputs, siblingOutputs] = await Promise.all([
    client
      .from("trackedActivityInput")
      .select("*")
      .in("trackedActivityId", activityIds)
      .eq("companyId", companyId),
    client
      .from("trackedActivityOutput")
      .select("*")
      .in("trackedActivityId", activityIds)
      .eq("companyId", companyId)
  ]);

  const siblingEntityIds = new Set<string>();
  for (const row of siblingInputs.data ?? []) {
    const key = `${row.trackedActivityId}:${row.trackedEntityId}`;
    if (!inputs.has(key)) {
      inputs.set(key, {
        trackedActivityId: row.trackedActivityId,
        trackedEntityId: row.trackedEntityId,
        quantity: row.quantity
      });
    }
    if (!entities.has(row.trackedEntityId)) {
      siblingEntityIds.add(row.trackedEntityId);
    }
  }
  for (const row of siblingOutputs.data ?? []) {
    const key = `${row.trackedActivityId}:${row.trackedEntityId}`;
    if (!outputs.has(key)) {
      outputs.set(key, {
        trackedActivityId: row.trackedActivityId,
        trackedEntityId: row.trackedEntityId,
        quantity: row.quantity
      });
    }
    if (!entities.has(row.trackedEntityId)) {
      siblingEntityIds.add(row.trackedEntityId);
    }
  }

  if (siblingEntityIds.size > 0) {
    const remainingCapacity = MAX_ENTITIES - entities.size;
    const idsToFetch = Array.from(siblingEntityIds).slice(0, remainingCapacity);
    if (idsToFetch.length > 0) {
      const fetched = await client
        .from("trackedEntity")
        .select("*")
        .in("id", idsToFetch)
        .eq("companyId", companyId);
      for (const row of fetched.data ?? []) {
        entities.set(row.id, row as TrackedEntity);
      }
    }
  }
}

async function runLineageBfs(
  client: CarbonDatabaseClient<QueryDatabase>,
  state: LineageState,
  initialFrontier: string[],
  direction: LineageDirection,
  safeDepth: number,
  companyId: string
): Promise<void> {
  const { entities, inputs, outputs, visited } = state;
  let frontier = initialFrontier.filter((id) => {
    if (visited.has(id)) return true;
    visited.add(id);
    return true;
  });

  for (let hop = 0; hop < safeDepth; hop++) {
    if (frontier.length === 0) break;
    if (entities.size >= MAX_ENTITIES) break;

    type BatchRow = {
      sourceEntityId: string;
      trackedActivityId: string;
      id: string;
      quantity: number;
    };

    const calls: Promise<void>[] = [];
    let descendantsBatch: BatchRow[] = [];
    let ancestorsBatch: BatchRow[] = [];

    if (direction === "down" || direction === "both") {
      calls.push(
        (async () => {
          const res = await client.rpc(
            "get_direct_descendants_of_tracked_entities_strict",
            { p_company_id: companyId, p_tracked_entity_ids: frontier }
          );
          descendantsBatch = (res.data ?? []) as BatchRow[];
        })()
      );
    }
    if (direction === "up" || direction === "both") {
      calls.push(
        (async () => {
          const res = await client.rpc(
            "get_direct_ancestors_of_tracked_entities_strict",
            { p_company_id: companyId, p_tracked_entity_ids: frontier }
          );
          ancestorsBatch = (res.data ?? []) as BatchRow[];
        })()
      );
    }

    await Promise.all(calls);

    const nextFrontier = new Set<string>();
    const newEntityIds = new Set<string>();
    const activityIds = new Set<string>();

    for (let i = 0; i < descendantsBatch.length; i++) {
      const row = descendantsBatch[i];
      if (!row?.id) continue;
      activityIds.add(row.trackedActivityId);
      const outputKey = `${row.trackedActivityId}:${row.sourceEntityId}`;
      if (!outputs.has(outputKey)) {
        outputs.set(outputKey, {
          trackedActivityId: row.trackedActivityId,
          trackedEntityId: row.sourceEntityId,
          quantity: row.quantity
        });
      }
      if (!visited.has(row.id)) {
        visited.add(row.id);
        newEntityIds.add(row.id);
        nextFrontier.add(row.id);
      }
      const inputKey = `${row.trackedActivityId}:${row.id}`;
      if (!inputs.has(inputKey)) {
        inputs.set(inputKey, {
          trackedActivityId: row.trackedActivityId,
          trackedEntityId: row.id,
          quantity: row.quantity
        });
      }
    }

    for (let i = 0; i < ancestorsBatch.length; i++) {
      const row = ancestorsBatch[i];
      if (!row?.id) continue;
      activityIds.add(row.trackedActivityId);
      const inputKey = `${row.trackedActivityId}:${row.sourceEntityId}`;
      if (!inputs.has(inputKey)) {
        inputs.set(inputKey, {
          trackedActivityId: row.trackedActivityId,
          trackedEntityId: row.sourceEntityId,
          quantity: row.quantity
        });
      }
      if (!visited.has(row.id)) {
        visited.add(row.id);
        newEntityIds.add(row.id);
        nextFrontier.add(row.id);
      }
      const outputKey = `${row.trackedActivityId}:${row.id}`;
      if (!outputs.has(outputKey)) {
        outputs.set(outputKey, {
          trackedActivityId: row.trackedActivityId,
          trackedEntityId: row.id,
          quantity: row.quantity
        });
      }
    }

    if (newEntityIds.size > 0) {
      const remainingCapacity = MAX_ENTITIES - entities.size;
      const idsToFetch = Array.from(newEntityIds).slice(0, remainingCapacity);
      const fetched = await client
        .from("trackedEntity")
        .select("*")
        .in("id", idsToFetch)
        .eq("companyId", companyId);
      for (const row of fetched.data ?? []) {
        entities.set(row.id, row as TrackedEntity);
      }
    }

    if (activityIds.size > 0) {
      await expandActivitySiblings(
        client,
        state,
        Array.from(activityIds),
        companyId
      );
    }

    frontier = Array.from(nextFrontier);
  }
}

export async function fetchLineageSubgraph(
  client: CarbonDatabaseClient<QueryDatabase>,
  rootEntityId: string,
  depth: number,
  companyId: string,
  direction: LineageDirection = "both"
): Promise<LineagePayload> {
  const safeDepth = clampDepth(depth);

  const rootEntity = await client
    .from("trackedEntity")
    .select("*")
    .eq("id", rootEntityId)
    .eq("companyId", companyId)
    .maybeSingle();

  const state = newLineageState();
  if (!rootEntity.data) {
    return {
      entities: [],
      inputs: [],
      outputs: [],
      activities: []
    };
  }

  state.entities.set(rootEntity.data.id, rootEntity.data as TrackedEntity);

  await runLineageBfs(
    client,
    state,
    [rootEntityId],
    direction,
    safeDepth,
    companyId
  );

  return {
    entities: Array.from(state.entities.values()),
    inputs: Array.from(state.inputs.values()),
    outputs: Array.from(state.outputs.values()),
    activities: Array.from(state.activities.values())
  };
}

export async function fetchJobStepRecords(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobId: string,
  companyId: string
): Promise<StepRecord[]> {
  let query = client.rpc("get_job_operation_step_records", {
    p_job_id: jobId,
    p_company_id: companyId
  });
  const res = await query;
  if (!res.data) return [];
  return (res.data as any[]).map((r) => ({
    id: r.id,
    jobOperationStepId: r.jobOperationStepId,
    index: r.index,
    type: r.type,
    name: r.name,
    value: r.value,
    numericValue: r.numericValue,
    booleanValue: r.booleanValue,
    userValue: r.userValue,
    unitOfMeasureCode: r.unitOfMeasureCode,
    minValue: r.minValue,
    maxValue: r.maxValue,
    operationId: r.operationId,
    operationDescription: r.operationDescription,
    itemId: r.itemId,
    itemReadableId: r.itemReadableId,
    createdAt: r.createdAt,
    createdBy: r.createdBy
  }));
}

export async function fetchContainmentsForEntities(
  client: CarbonDatabaseClient<QueryDatabase>,
  entityIds: string[],
  companyId?: string
): Promise<IssueContainment[]> {
  if (entityIds.length === 0) return [];

  // Single round-trip: embedded selector pulls the linked issue inline and
  // filters server-side to only Contained/Uncontained statuses.
  let query = client
    .from("nonConformanceTrackedEntity")
    .select(
      `trackedEntityId,
       nonConformanceId,
       issue:issues!inner(id, status, priority, containmentStatus)`
    )
    .in("trackedEntityId", entityIds)
    .in("issue.containmentStatus", ["Contained", "Uncontained"]);
  if (companyId) {
    query = query.eq("companyId", companyId);
  }
  const res = await query;

  const containments: IssueContainment[] = [];
  for (const row of res.data ?? []) {
    const issue = row.issue as {
      id: string | null;
      status: string | null;
      priority: string | null;
      containmentStatus: string | null;
    } | null;
    if (!issue) continue;
    const status = issue.containmentStatus;
    if (status !== "Contained" && status !== "Uncontained") continue;
    containments.push({
      id: issue.id ?? row.nonConformanceId,
      readableId: row.nonConformanceId,
      containmentStatus: status as IssueContainmentStatus,
      status: issue.status ?? "",
      priority: issue.priority ?? null,
      trackedEntityId: row.trackedEntityId
    });
  }
  return containments;
}

export async function fetchJobScopedLineage(
  client: CarbonDatabaseClient<QueryDatabase>,
  jobId: string,
  depth: number,
  companyId: string
): Promise<LineagePayload> {
  const safeDepth = clampDepth(depth);

  const [seedEntitiesRes, seedActivitiesRes] = await Promise.all([
    client
      .from("trackedEntity")
      .select("*")
      .eq("attributes->>Job", jobId)
      .eq("companyId", companyId),
    client
      .from("trackedActivity")
      .select("*")
      .eq("attributes->>Job", jobId)
      .eq("companyId", companyId)
  ]);

  const state = newLineageState();
  for (const row of (seedEntitiesRes.data ?? []) as TrackedEntity[]) {
    state.entities.set(row.id, row);
  }
  for (const row of (seedActivitiesRes.data ?? []) as unknown as Activity[]) {
    state.activities.set(row.id, row);
  }

  if (state.activities.size > 0) {
    await expandActivitySiblings(
      client,
      state,
      Array.from(state.activities.keys()),
      companyId
    );
  }

  if (state.entities.size > 0) {
    await runLineageBfs(
      client,
      state,
      Array.from(state.entities.keys()),
      "both",
      safeDepth,
      companyId
    );
  }

  const containments = await fetchContainmentsForEntities(
    client,
    Array.from(state.entities.keys()),
    companyId
  );

  return {
    entities: Array.from(state.entities.values()),
    inputs: Array.from(state.inputs.values()),
    outputs: Array.from(state.outputs.values()),
    activities: Array.from(state.activities.values()),
    containments
  };
}

export function toGraphData(payload: LineagePayload): GraphData {
  const nodes = [
    ...payload.entities.map((entity) => ({
      id: entity.id,
      type: "entity" as const,
      data: entity,
      parentId: null
    })),
    ...payload.activities.map((activity) => ({
      id: activity.id,
      type: "activity" as const,
      data: activity,
      parentId: null
    }))
  ];

  const links = [
    ...payload.inputs.map((input) => ({
      source: input.trackedEntityId,
      target: input.trackedActivityId,
      type: "input" as const,
      quantity: input.quantity
    })),
    ...payload.outputs.map((output) => ({
      source: output.trackedActivityId,
      target: output.trackedEntityId,
      type: "output" as const,
      quantity: output.quantity
    }))
  ];

  return { nodes, links };
}
