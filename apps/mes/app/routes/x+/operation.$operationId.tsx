import { error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { QuerySingleResponse } from "@carbon/database/query-client";
import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData, useParams } from "react-router";
import { JobOperation } from "~/components/JobOperation";
import { getCompanySettings } from "~/services/inventory.service";
import {
  getJobByOperationId,
  getJobFiles,
  getJobMakeMethod,
  getJobMaterialsByOperationId,
  getJobMethodBomIdMap,
  getJobOperationById,
  getJobOperationProcedure,
  getKanbanByJobId,
  getNonConformanceActions,
  getProductionEventsForJobOperation,
  getProductionQuantitiesForJobOperation,
  getThumbnailPathByItemId,
  getTrackedEntitiesByMakeMethodId,
  getWorkCenter
} from "~/services/operations.service";
import type { OperationWithDetails } from "~/services/types";

type ExpiredEntityPolicy = "Warn" | "Block" | "BlockWithOverride";

import { makeDurations } from "~/utils/durations";
import { path } from "~/utils/path";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client, userId, companyId } = await requirePermissions(request, {});

  const { operationId } = params;
  if (!operationId) throw new Error("Operation ID is required");

  const url = new URL(request.url);
  const trackedEntityId = url.searchParams.get("trackedEntityId");

  const [events, quantities, job, operation] = await Promise.all([
    getProductionEventsForJobOperation(client, {
      operationId,
      userId,
      companyId
    }),
    getProductionQuantitiesForJobOperation(client, operationId, companyId),
    getJobByOperationId(client, operationId, companyId),
    getJobOperationById(client, operationId, companyId)
  ]);

  if (job.error) {
    throw redirect(
      path.to.operations,
      await flash(request, error(job.error, "Failed to fetch job"))
    );
  }

  if (operation.error) {
    throw redirect(
      path.to.operations,
      await flash(request, error(operation.error, "Failed to fetch operation"))
    );
  }

  if (
    job.data.companyId !== companyId ||
    operation.data?.[0]?.companyId !== companyId
  ) {
    throw redirect(
      path.to.operations,
      await flash(
        request,
        error("You are not authorized to view this operation", "Unauthorized")
      )
    );
  }

  if (!job.data.itemId) {
    throw redirect(
      path.to.operations,
      await flash(request, error("Item ID is required", "Failed to fetch item"))
    );
  }

  const [
    thumbnailPath,
    trackedEntities,
    jobMakeMethod,
    kanban,
    bomIdMap,
    companySettings
  ] = await Promise.all([
    getThumbnailPathByItemId(client, operation.data?.[0].itemId, companyId),
    getTrackedEntitiesByMakeMethodId(
      client,
      operation.data?.[0].jobMakeMethodId,
      companyId
    ),
    getJobMakeMethod(client, operation.data?.[0].jobMakeMethodId, companyId),
    getKanbanByJobId(client, job.data.id),
    getJobMethodBomIdMap(client, job.data.id!, companyId),
    getCompanySettings(client, companyId)
  ]);

  const inventoryShelfLife = (companySettings.data?.inventoryShelfLife ??
    null) as { expiredEntityPolicy?: ExpiredEntityPolicy } | null;
  const expiredEntityPolicy: ExpiredEntityPolicy =
    inventoryShelfLife?.expiredEntityPolicy ?? "Block";

  // If no trackedEntityId is provided in the URL but trackedEntities exist,
  // redirect to the same URL with the last trackedEntityId as a search param
  if (
    !trackedEntityId &&
    trackedEntities.data &&
    trackedEntities.data.length > 0 &&
    // Check if any tracked entity has an attribute for this operation
    !trackedEntities.data.every((entity) => {
      const attributes = entity.attributes as Record<string, unknown>;
      return Object.keys(attributes).some((key) => key.startsWith(`Operation`));
    })
  ) {
    const lastTrackedEntity =
      trackedEntities.data[trackedEntities.data.length - 1];
    const redirectUrl = new URL(request.url);
    redirectUrl.searchParams.set("trackedEntityId", lastTrackedEntity.id);
    throw redirect(`${redirectUrl.pathname}${redirectUrl.search}`);
  }

  return {
    bomIdMap: Object.fromEntries(bomIdMap),
    events: events.data ?? [],
    quantities: (quantities.data ?? []).reduce(
      (acc, curr) => {
        if (curr.type === "Scrap") {
          acc.scrap += curr.quantity;
        } else if (curr.type === "Production") {
          acc.production += curr.quantity;
        } else if (curr.type === "Rework") {
          acc.rework += curr.quantity;
        }
        return acc;
      },
      { scrap: 0, production: 0, rework: 0 }
    ),
    job: job.data,
    jobMakeMethod: jobMakeMethod.data,
    kanban: kanban.data,
    files: getJobFiles(client, companyId, job.data, operation.data),
    materials: getJobMaterialsByOperationId(client, {
      operation: operation.data?.[0],
      trackedEntityId: trackedEntityId ?? trackedEntities?.data?.[0]?.id,
      requiresSerialTracking:
        jobMakeMethod.data?.requiresSerialTracking ?? false,
      companyId
    }),
    trackedEntities: trackedEntities.data ?? [],
    nonConformanceActions: getNonConformanceActions(client, {
      itemId: operation.data?.[0].itemId,
      processId: operation.data?.[0].processId,
      companyId
    }),
    operation: makeDurations(operation.data?.[0]) as OperationWithDetails,
    expiredEntityPolicy,
    procedure: getJobOperationProcedure(
      client,
      operation.data?.[0].id,
      companyId
    ),
    workCenter: getWorkCenter(
      client,
      operation.data?.[0].workCenterId,
      companyId
    ) as Promise<
      QuerySingleResponse<{
        name: string;
        id: string;
        isBlocked: boolean | null;
        blockingDispatchId: string | null;
        blockingDispatchReadableId: string | null;
      }>
    >,
    thumbnailPath
  };
}

export default function OperationRoute() {
  const { operationId } = useParams();
  if (!operationId) throw new Error("Operation ID is required");

  const {
    events,
    expiredEntityPolicy,
    files,
    job,
    jobMakeMethod,
    kanban,
    materials,
    operation,
    procedure,
    thumbnailPath,
    trackedEntities,
    workCenter,
    nonConformanceActions
  } = useLoaderData<typeof loader>();

  return (
    <JobOperation
      key={`job-operation-${operationId}`}
      events={events}
      expiredEntityPolicy={expiredEntityPolicy}
      files={files}
      kanban={kanban}
      materials={materials}
      method={jobMakeMethod}
      trackedEntities={trackedEntities}
      nonConformanceActions={nonConformanceActions}
      operation={operation}
      procedure={procedure}
      job={job}
      thumbnailPath={thumbnailPath}
      workCenter={workCenter}
    />
  );
}
