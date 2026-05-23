CREATE OR REPLACE FUNCTION get_maintenance_dispatches_by_location(
  p_company_id text,
  p_location_id text
)
RETURNS TABLE (
  "id" text,
  "maintenanceDispatchId" text,
  "content" jsonb,
  "status" "maintenanceDispatchStatus",
  "priority" "maintenanceDispatchPriority",
  "source" "maintenanceSource",
  "severity" "maintenanceSeverity",
  "oeeImpact" "oeeImpact",
  "workCenterId" text,
  "maintenanceScheduleId" text,
  "suspectedFailureModeId" text,
  "actualFailureModeId" text,
  "plannedStartTime" text,
  "plannedEndTime" text,
  "actualStartTime" text,
  "actualEndTime" text,
  "duration" numeric,
  "nonConformanceId" text,
  "completedAt" timestamptz,
  "assignee" text,
  "companyId" text,
  "createdBy" text,
  "createdAt" timestamptz,
  "updatedBy" text,
  "updatedAt" timestamptz,
  "locationId" text,
  "workCenterName" text,
  "locationName" text
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    md."id",
    md."maintenanceDispatchId",
    md."content",
    md."status",
    md."priority",
    md."source",
    md."severity",
    md."oeeImpact",
    md."workCenterId",
    md."maintenanceScheduleId",
    md."suspectedFailureModeId",
    md."actualFailureModeId",
    md."plannedStartTime",
    md."plannedEndTime",
    md."actualStartTime",
    md."actualEndTime",
    md."duration",
    md."nonConformanceId",
    md."completedAt",
    md."assignee",
    md."companyId",
    md."createdBy",
    md."createdAt",
    md."updatedBy",
    md."updatedAt",
    md."locationId",
    wc."name" AS "workCenterName",
    l."name" AS "locationName"
  FROM "maintenanceDispatch" md
  JOIN "location" l
    ON md."locationId" = l."id"
    AND l."companyId" = p_company_id
    AND l."id" = p_location_id
  LEFT JOIN "workCenter" wc
    ON md."workCenterId" = wc."id"
    AND wc."companyId" = p_company_id
    AND wc."locationId" = p_location_id
  WHERE md."companyId" = p_company_id
    AND md."locationId" = p_location_id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_maintenance_schedules_by_location(
  p_company_id text,
  p_location_id text
)
RETURNS TABLE (
  "id" text,
  "name" text,
  "description" text,
  "workCenterId" text,
  "frequency" "maintenanceFrequency",
  "priority" "maintenanceDispatchPriority",
  "estimatedDuration" numeric,
  "active" boolean,
  "lastGeneratedAt" timestamptz,
  "nextDueAt" timestamptz,
  "companyId" text,
  "createdBy" text,
  "createdAt" timestamptz,
  "updatedBy" text,
  "updatedAt" timestamptz,
  "monday" boolean,
  "tuesday" boolean,
  "wednesday" boolean,
  "thursday" boolean,
  "friday" boolean,
  "saturday" boolean,
  "sunday" boolean,
  "locationId" text,
  "workCenterName" text,
  "locationName" text
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ms."id",
    ms."name",
    ms."description",
    ms."workCenterId",
    ms."frequency",
    ms."priority",
    ms."estimatedDuration",
    ms."active",
    ms."lastGeneratedAt",
    ms."nextDueAt",
    ms."companyId",
    ms."createdBy",
    ms."createdAt",
    ms."updatedBy",
    ms."updatedAt",
    ms."monday",
    ms."tuesday",
    ms."wednesday",
    ms."thursday",
    ms."friday",
    ms."saturday",
    ms."sunday",
    wc."locationId",
    wc."name" AS "workCenterName",
    l."name" AS "locationName"
  FROM "maintenanceSchedule" ms
  JOIN "workCenter" wc
    ON ms."workCenterId" = wc."id"
    AND wc."companyId" = p_company_id
    AND wc."locationId" = p_location_id
  JOIN "location" l
    ON wc."locationId" = l."id"
    AND l."companyId" = p_company_id
    AND l."id" = p_location_id
  WHERE ms."companyId" = p_company_id
    AND wc."locationId" = p_location_id;
END;
$$;
