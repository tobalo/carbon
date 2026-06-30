-- Add many-to-many relationship between nonConformanceActionTask and process
CREATE TABLE "nonConformanceActionProcess" (
  "id" TEXT NOT NULL DEFAULT xid(),
  "actionTaskId" TEXT NOT NULL,
  "processId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE,
  "updatedBy" TEXT,

  CONSTRAINT "nonConformanceActionProcess_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "nonConformanceActionProcess_actionTaskId_fkey" FOREIGN KEY ("actionTaskId") REFERENCES "nonConformanceActionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "nonConformanceActionProcess_processId_fkey" FOREIGN KEY ("processId") REFERENCES "process"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "nonConformanceActionProcess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "nonConformanceActionProcess_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON UPDATE CASCADE,
  CONSTRAINT "nonConformanceActionProcess_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON UPDATE CASCADE,
  CONSTRAINT "nonConformanceActionProcess_unique" UNIQUE ("actionTaskId", "processId", "companyId")
);

CREATE INDEX "nonConformanceActionProcess_actionTaskId_idx" ON "nonConformanceActionProcess" ("actionTaskId");
CREATE INDEX "nonConformanceActionProcess_processId_idx" ON "nonConformanceActionProcess" ("processId");
CREATE INDEX "nonConformanceActionProcess_companyId_idx" ON "nonConformanceActionProcess" ("companyId");

CREATE POLICY "SELECT" ON "public"."nonConformanceActionProcess"
FOR SELECT USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('quality_view')
    )::text[]
  )
);

CREATE POLICY "INSERT" ON "public"."nonConformanceActionProcess"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('quality_create')
    )::text[]
  )
);

CREATE POLICY "UPDATE" ON "public"."nonConformanceActionProcess"
FOR UPDATE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('quality_update')
    )::text[]
  )
);

CREATE POLICY "DELETE" ON "public"."nonConformanceActionProcess"
FOR DELETE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('quality_delete')
    )::text[]
  )
);

ALTER TABLE "public"."nonConformanceActionProcess" ENABLE ROW LEVEL SECURITY;

-- Function to get non-conformance action tasks by item and process
-- Returns action tasks from non-complete issues that have the specified item and process
DROP FUNCTION IF EXISTS get_action_tasks_by_item_and_process;
CREATE OR REPLACE FUNCTION get_action_tasks_by_item_and_process(
  p_item_id TEXT,
  p_process_id TEXT,
  p_company_id TEXT
)
RETURNS TABLE (
  "actionTypeName" TEXT,
  assignee TEXT,
  notes JSONB
)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT
    ncra.name AS "actionTypeName",
    ncat.assignee,
    ncat.notes::JSONB
  FROM "nonConformanceActionTask" ncat
  LEFT JOIN "nonConformanceRequiredAction" ncra
    ON ncat."actionTypeId" = ncra."id"
    AND ncat."companyId" = ncra."companyId"
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