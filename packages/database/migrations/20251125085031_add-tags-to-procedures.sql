ALTER TABLE "procedure"
 ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

DROP VIEW IF EXISTS "procedures";
CREATE OR REPLACE VIEW "procedures" WITH(SECURITY_INVOKER=true) AS
  SELECT
    p1."id",
    p1."name",
    p1."version",
    p1."status",
    p1."assignee",
    p1."companyId",
    p1."processId",
    p1."tags",
    jsonb_agg(
      jsonb_build_object(
        'id', p2."id",
        'version', p2."version",
        'status', p2."status"
      )
    ) as "versions"
  FROM "procedure" p1
  JOIN "procedure" p2 ON p1."name" = p2."name" AND p1."companyId" = p2."companyId"
  WHERE p1."version" = (
    SELECT MAX("version")
    FROM "procedure" p3
    WHERE p3."name" = p1."name"
    AND p3."companyId" = p1."companyId"
  )
  GROUP BY p1."id", p1."name", p1."version", p1."status", p1."assignee", p1."companyId", p1."processId", p1."tags";
