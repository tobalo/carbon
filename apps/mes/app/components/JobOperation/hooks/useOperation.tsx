import { useDisclosure, useInterval } from "@carbon/react";
import type { TrackedEntityAttributes } from "@carbon/utils";
import {
  getLocalTimeZone,
  now,
  parseAbsolute,
  toZoned
} from "@internationalized/date";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRevalidator } from "react-router";
import { useUrlParams, useUser } from "~/hooks";
import type {
  JobMaterial,
  JobOperationParameter,
  JobOperationStep,
  OperationWithDetails,
  ProductionEvent,
  TrackedEntity
} from "~/services/types";

export function useOperation({
  operation,
  events,
  trackedEntities,
  pauseInterval,
  procedure
}: {
  operation: OperationWithDetails;
  events: ProductionEvent[];
  trackedEntities: TrackedEntity[];
  pauseInterval: boolean;
  procedure: Promise<{
    attributes: JobOperationStep[];
    parameters: JobOperationParameter[];
  }>;
}) {
  const [params] = useUrlParams();
  const trackedEntityParam = params.get("trackedEntityId");
  const user = useUser();

  const revalidator = useRevalidator();
  const scrapModal = useDisclosure();
  const reworkModal = useDisclosure();
  const completeModal = useDisclosure();
  const finishModal = useDisclosure();
  const issueModal = useDisclosure();
  const serialModal = useDisclosure();

  // we do this to avoid re-rendering when the modal is open
  const isAnyModalOpen =
    pauseInterval ||
    scrapModal.isOpen ||
    reworkModal.isOpen ||
    completeModal.isOpen ||
    finishModal.isOpen ||
    issueModal.isOpen ||
    serialModal.isOpen;

  const [selectedMaterial, setSelectedMaterial] = useState<JobMaterial | null>(
    null
  );

  const [activeTab, setActiveTab] = useState("details");
  const [eventType, setEventType] = useState(() => {
    if (operation.setupDuration > 0) {
      return "Setup";
    }
    if (operation.machineDuration > 0) {
      return "Machine";
    }
    return "Labor";
  });

  const [operationState, setOperationState] = useState(operation);

  const [eventState, setEventState] = useState<ProductionEvent[]>(events);

  useEffect(() => {
    setEventState(events);
  }, [events]);

  useEffect(() => {
    setOperationState(operation);
  }, [operation]);

  useInterval(
    () => {
      revalidator.revalidate();
    },
    isAnyModalOpen ? null : 15_000
  );

  const getProgress = useCallback(() => {
    const timeNow = now(getLocalTimeZone());
    return eventState.reduce(
      (acc, event) => {
        if (event.endTime && event.type) {
          acc[event.type.toLowerCase() as keyof typeof acc] +=
            (event.duration ?? 0) * 1000;
        } else if (event.startTime && event.type) {
          const startTime = toZoned(
            parseAbsolute(event.startTime, getLocalTimeZone()),
            getLocalTimeZone()
          );

          const difference = timeNow.compare(startTime);

          if (difference > 0) {
            acc[event.type.toLowerCase() as keyof typeof acc] += difference;
          }
        }
        return acc;
      },
      {
        setup: 0,
        labor: 0,
        machine: 0
      }
    );
  }, [eventState]);

  const [progress, setProgress] = useState<{
    setup: number;
    labor: number;
    machine: number;
  }>(getProgress);

  const activeEvents = useMemo(() => {
    return {
      setupProductionEvent: events.find(
        (e) =>
          e.type === "Setup" && e.endTime === null && e.employeeId === user.id
      ),
      laborProductionEvent: events.find(
        (e) =>
          e.type === "Labor" && e.endTime === null && e.employeeId === user.id
      ),
      machineProductionEvent: eventState.find(
        (e) => e.type === "Machine" && e.endTime === null
      )
    };
  }, [eventState, events, user.id]);

  const active = useMemo(() => {
    return {
      setup: !!activeEvents.setupProductionEvent,
      labor: !!activeEvents.laborProductionEvent,
      machine: !!activeEvents.machineProductionEvent
    };
  }, [activeEvents]);

  useInterval(
    () => {
      setProgress(getProgress());
    },
    (active.setup || active.labor || active.machine) && !isAnyModalOpen
      ? 1000
      : null
  );

  const { operationId } = useParams();
  const [availableEntities, setAvailableEntities] = useState<TrackedEntity[]>(
    []
  );
  // show the serial selector with the remaining serial numbers for the operation
  // biome-ignore lint/correctness/useExhaustiveDependencies: suppressed due to migration
  useEffect(() => {
    if (trackedEntityParam) return;
    const uncompletedEntities = trackedEntities.filter(
      (entity) =>
        !(
          `Operation ${operationId}` in
          ((entity.attributes as TrackedEntityAttributes) ?? {})
        )
    );
    if (uncompletedEntities.length > 0) serialModal.onOpen();
    setAvailableEntities(uncompletedEntities);
    // causes an infinite loop on navigation
  }, [trackedEntities, trackedEntityParam]);

  return {
    active,
    availableEntities,
    hasActiveEvents:
      progress.setup > 0 || progress.labor > 0 || progress.machine > 0,
    ...activeEvents,
    progress,
    operation: operationState,

    activeTab,
    eventType,
    scrapModal,
    reworkModal,
    completeModal,
    finishModal,
    issueModal,
    serialModal,
    isOverdue: operation.operationDueDate
      ? new Date(operation.operationDueDate) < new Date()
      : false,
    selectedMaterial,
    setSelectedMaterial,
    setActiveTab,
    setEventType
  };
}
