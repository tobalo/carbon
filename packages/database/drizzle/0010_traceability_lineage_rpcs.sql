CREATE OR REPLACE FUNCTION get_direct_descendants_of_tracked_entities_strict(
  p_tracked_entity_ids text[],
  p_company_id text
)
RETURNS TABLE (
  "sourceEntityId" text,
  "trackedActivityId" text,
  "id" text,
  "readableId" text,
  "quantity" numeric,
  "status" "trackedEntityStatus",
  "sourceDocument" text,
  "sourceDocumentId" text,
  "sourceDocumentReadableId" text,
  "activityAttributes" jsonb,
  "attributes" jsonb
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    seed.id AS "sourceEntityId",
    ta."id" AS "trackedActivityId",
    te."id",
    te."readableId",
    te."quantity",
    te."status",
    te."sourceDocument",
    te."sourceDocumentId",
    te."sourceDocumentReadableId",
    ta."attributes" AS "activityAttributes",
    te."attributes" AS "attributes"
  FROM unnest(p_tracked_entity_ids) AS seed(id)
  JOIN "trackedActivityOutput" tao ON tao."trackedEntityId" = seed.id
  JOIN "trackedActivityInput" tai ON tai."trackedActivityId" = tao."trackedActivityId"
  LEFT JOIN "trackedActivityInput" tai2
    ON tai2."trackedActivityId" = tao."trackedActivityId"
    AND tai2."trackedEntityId" = seed.id
  JOIN "trackedEntity" te ON te."id" = tai."trackedEntityId"
  JOIN "trackedActivity" ta ON ta."id" = tai."trackedActivityId"
  WHERE tai2."trackedEntityId" IS NULL
    AND tao."companyId" = p_company_id
    AND tai."companyId" = p_company_id
    AND te."companyId" = p_company_id
    AND ta."companyId" = p_company_id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_direct_ancestors_of_tracked_entities_strict(
  p_tracked_entity_ids text[],
  p_company_id text
)
RETURNS TABLE (
  "sourceEntityId" text,
  "trackedActivityId" text,
  "id" text,
  "readableId" text,
  "quantity" numeric,
  "status" "trackedEntityStatus",
  "sourceDocument" text,
  "sourceDocumentId" text,
  "sourceDocumentReadableId" text,
  "activityAttributes" jsonb,
  "attributes" jsonb
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    seed.id AS "sourceEntityId",
    ta."id" AS "trackedActivityId",
    te."id",
    te."readableId",
    te."quantity",
    te."status",
    te."sourceDocument",
    te."sourceDocumentId",
    te."sourceDocumentReadableId",
    ta."attributes" AS "activityAttributes",
    te."attributes" AS "attributes"
  FROM unnest(p_tracked_entity_ids) AS seed(id)
  JOIN "trackedActivityInput" tai ON tai."trackedEntityId" = seed.id
  JOIN "trackedActivityOutput" tao ON tao."trackedActivityId" = tai."trackedActivityId"
  LEFT JOIN "trackedActivityOutput" tao2
    ON tao2."trackedActivityId" = tai."trackedActivityId"
    AND tao2."trackedEntityId" = seed.id
  JOIN "trackedEntity" te ON te."id" = tao."trackedEntityId"
  JOIN "trackedActivity" ta ON ta."id" = tao."trackedActivityId"
  WHERE tao2."trackedEntityId" IS NULL
    AND tai."companyId" = p_company_id
    AND tao."companyId" = p_company_id
    AND te."companyId" = p_company_id
    AND ta."companyId" = p_company_id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_direct_descendants_of_tracked_entity_strict(
  p_tracked_entity_id text,
  p_company_id text
)
RETURNS TABLE (
  "trackedActivityId" text,
  "id" text,
  "readableId" text,
  "quantity" numeric,
  "status" "trackedEntityStatus",
  "sourceDocument" text,
  "sourceDocumentId" text,
  "sourceDocumentReadableId" text,
  "activityAttributes" jsonb,
  "attributes" jsonb
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ta."id" AS "trackedActivityId",
    te."id",
    te."readableId",
    te."quantity",
    te."status",
    te."sourceDocument",
    te."sourceDocumentId",
    te."sourceDocumentReadableId",
    ta."attributes" AS "activityAttributes",
    te."attributes" AS "attributes"
  FROM "trackedActivityInput" tai
  JOIN "trackedEntity" te ON tai."trackedEntityId" = te."id"
  JOIN "trackedActivity" ta ON tai."trackedActivityId" = ta."id"
  WHERE tai."companyId" = p_company_id
    AND te."companyId" = p_company_id
    AND ta."companyId" = p_company_id
    AND EXISTS (
      SELECT 1
      FROM "trackedEntity" source_te
      WHERE source_te."id" = p_tracked_entity_id
        AND source_te."companyId" = p_company_id
    )
    AND tai."trackedActivityId" IN (
    SELECT tao."trackedActivityId"
    FROM "trackedActivityOutput" tao
    LEFT JOIN "trackedActivityInput" tai2
      ON tao."trackedActivityId" = tai2."trackedActivityId"
      AND tai2."trackedEntityId" = p_tracked_entity_id
      AND tai2."companyId" = p_company_id
    WHERE tao."trackedEntityId" = p_tracked_entity_id
      AND tao."companyId" = p_company_id
      AND tai2."trackedEntityId" IS NULL
  );
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_direct_ancestors_of_tracked_entity_strict(
  p_tracked_entity_id text,
  p_company_id text
)
RETURNS TABLE (
  "trackedActivityId" text,
  "id" text,
  "readableId" text,
  "quantity" numeric,
  "status" "trackedEntityStatus",
  "sourceDocument" text,
  "sourceDocumentId" text,
  "sourceDocumentReadableId" text,
  "activityAttributes" jsonb,
  "attributes" jsonb
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ta."id" AS "trackedActivityId",
    te."id",
    te."readableId",
    te."quantity",
    te."status",
    te."sourceDocument",
    te."sourceDocumentId",
    te."sourceDocumentReadableId",
    ta."attributes" AS "activityAttributes",
    te."attributes" AS "attributes"
  FROM "trackedActivityOutput" tao
  JOIN "trackedEntity" te ON tao."trackedEntityId" = te."id"
  JOIN "trackedActivity" ta ON tao."trackedActivityId" = ta."id"
  WHERE tao."companyId" = p_company_id
    AND te."companyId" = p_company_id
    AND ta."companyId" = p_company_id
    AND EXISTS (
      SELECT 1
      FROM "trackedEntity" source_te
      WHERE source_te."id" = p_tracked_entity_id
        AND source_te."companyId" = p_company_id
    )
    AND tao."trackedActivityId" IN (
    SELECT tai."trackedActivityId"
    FROM "trackedActivityInput" tai
    LEFT JOIN "trackedActivityOutput" tao2
      ON tai."trackedActivityId" = tao2."trackedActivityId"
      AND tao2."trackedEntityId" = p_tracked_entity_id
      AND tao2."companyId" = p_company_id
    WHERE tai."trackedEntityId" = p_tracked_entity_id
      AND tai."companyId" = p_company_id
      AND tao2."trackedEntityId" IS NULL
  );
END;
$$;
