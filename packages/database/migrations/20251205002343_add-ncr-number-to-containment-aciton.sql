
-- Function to get non-conformance action tasks by item and process
-- Returns action tasks from non-complete issues that have the specified item and process
DROP FUNCTION IF EXISTS get_action_tasks_by_item_and_process;
CREATE OR REPLACE FUNCTION get_action_tasks_by_item_and_process(
  p_item_id TEXT,
  p_process_id TEXT,
  p_company_id TEXT
)
RETURNS TABLE (
  id TEXT,
  "nonConformanceId" TEXT,
  "actionTypeName" TEXT,
  assignee TEXT,
  notes JSONB
)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT
    ncat.id,
    nc."nonConformanceId",
    ncra.name AS "actionTypeName",
    ncat.assignee,
    ncat.notes::JSONB
  FROM "nonConformanceActionTask" ncat
  LEFT JOIN "nonConformanceRequiredAction" ncra
    ON ncat."actionTypeId" = ncra."id"
    AND ncat."companyId" = ncra."companyId"
  INNER JOIN "nonConformance" nc ON ncat."nonConformanceId" = nc.id
  WHERE ncat."companyId" = p_company_id
    -- Match process through the junction table
    AND EXISTS (
      SELECT 1
      FROM "nonConformanceActionProcess" ncap
      WHERE ncap."actionTaskId" = ncat.id
        AND ncap."processId" = p_process_id
        AND ncap."companyId" = p_company_id
    )
    -- Match item and ensure non-conformance is not closed
    AND EXISTS (
      SELECT 1
      FROM "nonConformance" nc
      INNER JOIN "nonConformanceItem" nci
        ON nc.id = nci."nonConformanceId"
        AND nci."companyId" = p_company_id
      WHERE nc.id = ncat."nonConformanceId"
        AND nc."companyId" = p_company_id
        AND nc.status != 'Closed'
        AND nci."itemId" = p_item_id
    );
$$;