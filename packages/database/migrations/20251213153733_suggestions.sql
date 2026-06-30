CREATE TABLE "suggestion" (
  "id" TEXT NOT NULL DEFAULT id(),
  "suggestion" TEXT NOT NULL,
  "emoji" TEXT NOT NULL DEFAULT '💡',
  "path" TEXT NOT NULL,
  "attachmentPath" TEXT,
  "tags" TEXT[] DEFAULT '{}',
  "userId" TEXT,
  "companyId" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT "suggestion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "suggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "suggestion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "suggestion" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "suggestion"
FOR SELECT USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('resources_view')
    )::text[]
  )
);

CREATE POLICY "INSERT" ON "suggestion"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_role()
    )::text[]
  )
);

CREATE POLICY "UPDATE" ON "suggestion"
FOR UPDATE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('resources_update')
    )::text[]
  )
);

CREATE POLICY "DELETE" ON "suggestion"
FOR DELETE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('resources_delete')
    )::text[]
  )
);

ALTER TABLE "company"
  ADD COLUMN IF NOT EXISTS "suggestionNotificationGroup" text[] NOT NULL DEFAULT '{}';

DROP VIEW IF EXISTS "suggestions";
CREATE OR REPLACE VIEW "suggestions" AS
  SELECT
    s."id",
    s."suggestion",
    s."emoji",
    s."path",
    s."attachmentPath",
    s."tags",
    s."userId",
    s."companyId",
    s."createdAt",
    u."fullName" AS "employeeName",
    u."avatarUrl" AS "employeeAvatarUrl"
  FROM "suggestion" s
  LEFT JOIN "user" u ON s."userId" = u."id";