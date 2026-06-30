
CREATE TYPE "riskSource" AS ENUM (
  'Customer',
  'General',
  'Item',
  'Job',
  'Quote Line',
  'Supplier',
  'Work Center'
);

CREATE TYPE "riskStatus" AS ENUM ('Open', 'In Review', 'Mitigating', 'Closed', 'Accepted');

CREATE TABLE "riskRegister" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "companyId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "source" "riskSource" NOT NULL,
  "sourceId" TEXT,
  "severity" INTEGER CHECK (severity BETWEEN 1 AND 5),
  "likelihood" INTEGER CHECK (likelihood BETWEEN 1 AND 5),
  "itemId" TEXT,
  "status" "riskStatus" NOT NULL DEFAULT 'Open',
  "assignee" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE,


  CONSTRAINT "riskRegister_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "riskRegister_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "riskRegister_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "riskRegister_assignee_fkey" FOREIGN KEY ("assignee") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "riskRegister_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "riskRegister_companyId_idx" ON "riskRegister" ("companyId");
CREATE INDEX "riskRegister_assignee_idx" ON "riskRegister" ("assignee");
CREATE INDEX "riskRegister_itemId_idx" ON "riskRegister" ("itemId");
CREATE INDEX "riskRegister_status_idx" ON "riskRegister" ("status");
CREATE INDEX "riskRegister_source_idx" ON "riskRegister" ("source");
ALTER TABLE "riskRegister" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "riskRegister"
FOR SELECT USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_role()
    )::text[]
  )
);

CREATE POLICY "INSERT" ON "riskRegister"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_role()
    )::text[]
  )
);

-- Only employees with `quality_update` should be able to UPDATE rows.
CREATE POLICY "UPDATE" ON "riskRegister"
FOR UPDATE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('quality_update')
    )::text[]
  )
);

-- Only employees with `quality_delete` should be able to DELETE rows.
CREATE POLICY "DELETE" ON "riskRegister"
FOR DELETE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('quality_delete')
    )::text[]
  )
);
