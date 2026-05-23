DROP FUNCTION IF EXISTS get_part_details(text);--> statement-breakpoint
CREATE OR REPLACE FUNCTION get_part_details(item_id text, company_id text)
RETURNS TABLE (
  "active" boolean,
  "assignee" text,
  "defaultMethodType" "methodType",
  "description" text,
  "itemTrackingType" "itemTrackingType",
  "requiresInspection" boolean,
  "name" text,
  "replenishmentSystem" "itemReplenishmentSystem",
  "unitOfMeasureCode" text,
  "notes" jsonb,
  "thumbnailPath" text,
  "modelId" text,
  "modelPath" text,
  "modelName" text,
  "modelSize" bigint,
  "id" text,
  "companyId" text,
  "unitOfMeasure" text,
  "readableId" text,
  "revision" text,
  "readableIdWithRevision" text,
  "revisions" json,
  "customFields" jsonb,
  "tags" text[],
  "itemPostingGroupId" text,
  "createdBy" text,
  "createdAt" timestamptz,
  "updatedBy" text,
  "updatedAt" timestamptz
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_readable_id text;
  v_company_id text;
BEGIN
  SELECT i."readableId", i."companyId"
  INTO v_readable_id, v_company_id
  FROM "item" i
  WHERE i.id = item_id
    AND i."companyId" = company_id
    AND i."type" = 'Part';

  RETURN QUERY
  WITH item_revisions AS (
    SELECT json_agg(
      json_build_object(
        'id', i.id,
        'revision', i."revision",
        'methodType', i."defaultMethodType",
        'type', i."type"
      )
      ORDER BY i."createdAt" DESC
    ) AS "revisions"
    FROM "item" i
    WHERE i."readableId" = v_readable_id
      AND i."companyId" = v_company_id
      AND i."type" = 'Part'
  )
  SELECT
    i."active",
    i."assignee",
    i."defaultMethodType",
    i."description",
    i."itemTrackingType",
    i."requiresInspection",
    i."name",
    i."replenishmentSystem",
    i."unitOfMeasureCode",
    i."notes",
    CASE
      WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
      ELSE i."thumbnailPath"
    END AS "thumbnailPath",
    mu.id AS "modelId",
    mu."modelPath",
    mu."name" AS "modelName",
    mu."size"::bigint AS "modelSize",
    i."id",
    i."companyId",
    uom.name AS "unitOfMeasure",
    i."readableId",
    i."revision",
    i."readableIdWithRevision",
    ir."revisions",
    p."customFields",
    p."tags",
    ic."itemPostingGroupId",
    i."createdBy",
    i."createdAt",
    i."updatedBy",
    i."updatedAt"
  FROM "part" p
  LEFT JOIN "item" i ON i."readableId" = p."id" AND i."companyId" = p."companyId" AND i."companyId" = company_id
  LEFT JOIN item_revisions ir ON true
  LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId" AND mu."companyId" = company_id
  LEFT JOIN "unitOfMeasure" uom ON uom.code = i."unitOfMeasureCode" AND uom."companyId" = i."companyId"
  LEFT JOIN "itemCost" ic ON ic."itemId" = i.id AND ic."companyId" = company_id
  WHERE i."id" = item_id
    AND p."companyId" = company_id;
END;
$$;--> statement-breakpoint

DROP FUNCTION IF EXISTS get_tool_details(text);--> statement-breakpoint
CREATE OR REPLACE FUNCTION get_tool_details(item_id text, company_id text)
RETURNS TABLE (
  "active" boolean,
  "assignee" text,
  "defaultMethodType" "methodType",
  "description" text,
  "itemTrackingType" "itemTrackingType",
  "requiresInspection" boolean,
  "name" text,
  "replenishmentSystem" "itemReplenishmentSystem",
  "unitOfMeasureCode" text,
  "notes" jsonb,
  "thumbnailPath" text,
  "modelId" text,
  "modelPath" text,
  "modelName" text,
  "modelSize" bigint,
  "id" text,
  "companyId" text,
  "unitOfMeasure" text,
  "readableId" text,
  "revision" text,
  "readableIdWithRevision" text,
  "revisions" json,
  "customFields" jsonb,
  "tags" text[],
  "itemPostingGroupId" text,
  "createdBy" text,
  "createdAt" timestamptz,
  "updatedBy" text,
  "updatedAt" timestamptz
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_readable_id text;
  v_company_id text;
BEGIN
  SELECT i."readableId", i."companyId"
  INTO v_readable_id, v_company_id
  FROM "item" i
  WHERE i.id = item_id
    AND i."companyId" = company_id
    AND i."type" = 'Tool';

  RETURN QUERY
  WITH item_revisions AS (
    SELECT json_agg(
      json_build_object(
        'id', i.id,
        'revision', i."revision",
        'methodType', i."defaultMethodType",
        'type', i."type"
      )
      ORDER BY i."createdAt" DESC
    ) AS "revisions"
    FROM "item" i
    WHERE i."readableId" = v_readable_id
      AND i."companyId" = v_company_id
      AND i."type" = 'Tool'
  )
  SELECT
    i."active",
    i."assignee",
    i."defaultMethodType",
    i."description",
    i."itemTrackingType",
    i."requiresInspection",
    i."name",
    i."replenishmentSystem",
    i."unitOfMeasureCode",
    i."notes",
    CASE
      WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
      ELSE i."thumbnailPath"
    END AS "thumbnailPath",
    mu.id AS "modelId",
    mu."modelPath",
    mu."name" AS "modelName",
    mu."size"::bigint AS "modelSize",
    i."id",
    i."companyId",
    uom.name AS "unitOfMeasure",
    i."readableId",
    i."revision",
    i."readableIdWithRevision",
    ir."revisions",
    t."customFields",
    t."tags",
    ic."itemPostingGroupId",
    i."createdBy",
    i."createdAt",
    i."updatedBy",
    i."updatedAt"
  FROM "tool" t
  LEFT JOIN "item" i ON i."readableId" = t."id" AND i."companyId" = t."companyId" AND i."companyId" = company_id
  LEFT JOIN item_revisions ir ON true
  LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId" AND mu."companyId" = company_id
  LEFT JOIN "unitOfMeasure" uom ON uom.code = i."unitOfMeasureCode" AND uom."companyId" = i."companyId"
  LEFT JOIN "itemCost" ic ON ic."itemId" = i.id AND ic."companyId" = company_id
  WHERE i."id" = item_id
    AND t."companyId" = company_id;
END;
$$;--> statement-breakpoint

DROP FUNCTION IF EXISTS get_material_details(text);--> statement-breakpoint
CREATE OR REPLACE FUNCTION get_material_details(item_id text, company_id text)
RETURNS TABLE (
  "active" boolean,
  "assignee" text,
  "defaultMethodType" "methodType",
  "description" text,
  "itemTrackingType" "itemTrackingType",
  "requiresInspection" boolean,
  "name" text,
  "replenishmentSystem" "itemReplenishmentSystem",
  "unitOfMeasureCode" text,
  "notes" jsonb,
  "thumbnailPath" text,
  "modelUploadId" text,
  "modelPath" text,
  "modelName" text,
  "modelSize" bigint,
  "id" text,
  "companyId" text,
  "readableId" text,
  "revision" text,
  "readableIdWithRevision" text,
  "supplierIds" text,
  "unitOfMeasure" text,
  "revisions" json,
  "materialForm" text,
  "materialSubstance" text,
  "finish" text,
  "grade" text,
  "dimensions" text,
  "materialType" text,
  "materialSubstanceId" text,
  "materialFormId" text,
  "materialTypeId" text,
  "dimensionId" text,
  "gradeId" text,
  "finishId" text,
  "customFields" jsonb,
  "tags" text[],
  "itemPostingGroupId" text,
  "createdBy" text,
  "createdAt" timestamptz,
  "updatedBy" text,
  "updatedAt" timestamptz
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_readable_id text;
  v_company_id text;
BEGIN
  SELECT i."readableId", i."companyId"
  INTO v_readable_id, v_company_id
  FROM "item" i
  WHERE i.id = item_id
    AND i."companyId" = company_id
    AND i."type" = 'Material';

  RETURN QUERY
  WITH item_revisions AS (
    SELECT json_agg(
      json_build_object(
        'id', i.id,
        'revision', i."revision",
        'methodType', i."defaultMethodType",
        'type', i."type"
      )
      ORDER BY i."createdAt"
    ) AS "revisions"
    FROM "item" i
    WHERE i."readableId" = v_readable_id
      AND i."companyId" = v_company_id
      AND i."type" = 'Material'
  )
  SELECT
    i."active",
    i."assignee",
    i."defaultMethodType",
    i."description",
    i."itemTrackingType",
    i."requiresInspection",
    i."name",
    i."replenishmentSystem",
    i."unitOfMeasureCode",
    i."notes",
    CASE
      WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
      ELSE i."thumbnailPath"
    END AS "thumbnailPath",
    mu.id AS "modelUploadId",
    mu."modelPath",
    mu."name" AS "modelName",
    mu."size"::bigint AS "modelSize",
    i."id",
    i."companyId",
    i."readableId",
    i."revision",
    i."readableIdWithRevision",
    ps."supplierIds",
    uom.name AS "unitOfMeasure",
    ir."revisions",
    mf."name" AS "materialForm",
    ms."name" AS "materialSubstance",
    mfin."name" AS "finish",
    mg."name" AS "grade",
    md."name" AS "dimensions",
    mt."name" AS "materialType",
    m."materialSubstanceId",
    m."materialFormId",
    m."materialTypeId",
    m."dimensionId",
    m."gradeId",
    m."finishId",
    m."customFields",
    m."tags",
    ic."itemPostingGroupId",
    i."createdBy",
    i."createdAt",
    i."updatedBy",
    i."updatedAt"
  FROM "material" m
  LEFT JOIN "item" i ON i."readableId" = m."id" AND i."companyId" = m."companyId" AND i."companyId" = company_id
  LEFT JOIN item_revisions ir ON true
  LEFT JOIN (
    SELECT
      ps."itemId",
      string_agg(ps."supplierPartId", ',') AS "supplierIds"
    FROM "supplierPart" ps
    WHERE ps."companyId" = company_id
    GROUP BY ps."itemId"
  ) ps ON ps."itemId" = i.id
  LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId" AND mu."companyId" = company_id
  LEFT JOIN "unitOfMeasure" uom ON uom.code = i."unitOfMeasureCode" AND uom."companyId" = i."companyId"
  LEFT JOIN "materialForm" mf ON mf."id" = m."materialFormId" AND mf."companyId" = company_id
  LEFT JOIN "materialSubstance" ms ON ms."id" = m."materialSubstanceId" AND ms."companyId" = company_id
  LEFT JOIN "materialDimension" md ON m."dimensionId" = md."id" AND md."companyId" = company_id
  LEFT JOIN "materialFinish" mfin ON m."finishId" = mfin."id" AND mfin."companyId" = company_id
  LEFT JOIN "materialGrade" mg ON m."gradeId" = mg."id" AND mg."companyId" = company_id
  LEFT JOIN "materialType" mt ON m."materialTypeId" = mt."id" AND mt."companyId" = company_id
  LEFT JOIN "itemCost" ic ON ic."itemId" = i.id AND ic."companyId" = company_id
  WHERE i."id" = item_id
    AND m."companyId" = company_id;
END;
$$;--> statement-breakpoint

DROP FUNCTION IF EXISTS get_consumable_details(text);--> statement-breakpoint
CREATE OR REPLACE FUNCTION get_consumable_details(item_id text, company_id text)
RETURNS TABLE (
  "active" boolean,
  "assignee" text,
  "defaultMethodType" "methodType",
  "description" text,
  "itemTrackingType" "itemTrackingType",
  "requiresInspection" boolean,
  "name" text,
  "replenishmentSystem" "itemReplenishmentSystem",
  "unitOfMeasureCode" text,
  "notes" jsonb,
  "thumbnailPath" text,
  "modelUploadId" text,
  "modelPath" text,
  "modelName" text,
  "modelSize" bigint,
  "id" text,
  "companyId" text,
  "readableId" text,
  "revision" text,
  "readableIdWithRevision" text,
  "supplierIds" text,
  "unitOfMeasure" text,
  "revisions" json,
  "customFields" jsonb,
  "tags" text[],
  "itemPostingGroupId" text,
  "createdBy" text,
  "createdAt" timestamptz,
  "updatedBy" text,
  "updatedAt" timestamptz
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_readable_id text;
  v_company_id text;
BEGIN
  SELECT i."readableId", i."companyId"
  INTO v_readable_id, v_company_id
  FROM "item" i
  WHERE i.id = item_id
    AND i."companyId" = company_id
    AND i."type" = 'Consumable';

  RETURN QUERY
  WITH item_revisions AS (
    SELECT json_agg(
      json_build_object(
        'id', i.id,
        'revision', i."revision",
        'methodType', i."defaultMethodType",
        'type', i."type"
      )
      ORDER BY i."createdAt"
    ) AS "revisions"
    FROM "item" i
    WHERE i."readableId" = v_readable_id
      AND i."companyId" = v_company_id
      AND i."type" = 'Consumable'
  )
  SELECT
    i."active",
    i."assignee",
    i."defaultMethodType",
    i."description",
    i."itemTrackingType",
    i."requiresInspection",
    i."name",
    i."replenishmentSystem",
    i."unitOfMeasureCode",
    i."notes",
    CASE
      WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
      ELSE i."thumbnailPath"
    END AS "thumbnailPath",
    mu.id AS "modelUploadId",
    mu."modelPath",
    mu."name" AS "modelName",
    mu."size"::bigint AS "modelSize",
    i."id",
    i."companyId",
    i."readableId",
    i."revision",
    i."readableIdWithRevision",
    ps."supplierIds",
    uom.name AS "unitOfMeasure",
    ir."revisions",
    c."customFields",
    c."tags",
    ic."itemPostingGroupId",
    i."createdBy",
    i."createdAt",
    i."updatedBy",
    i."updatedAt"
  FROM "consumable" c
  LEFT JOIN "item" i ON i."readableId" = c."id" AND i."companyId" = c."companyId" AND i."companyId" = company_id
  LEFT JOIN item_revisions ir ON true
  LEFT JOIN (
    SELECT
      ps."itemId",
      string_agg(ps."supplierPartId", ',') AS "supplierIds"
    FROM "supplierPart" ps
    WHERE ps."companyId" = company_id
    GROUP BY ps."itemId"
  ) ps ON ps."itemId" = i.id
  LEFT JOIN "modelUpload" mu ON mu.id = i."modelUploadId" AND mu."companyId" = company_id
  LEFT JOIN "unitOfMeasure" uom ON uom.code = i."unitOfMeasureCode" AND uom."companyId" = i."companyId"
  LEFT JOIN "itemCost" ic ON ic."itemId" = i.id AND ic."companyId" = company_id
  WHERE i."id" = item_id
    AND c."companyId" = company_id;
END;
$$;--> statement-breakpoint

DROP FUNCTION IF EXISTS get_material_naming_details(text);--> statement-breakpoint
CREATE OR REPLACE FUNCTION get_material_naming_details(readable_id text, company_id text)
RETURNS TABLE (
  "id" text,
  "shape" text,
  "shapeCode" text,
  "substance" text,
  "substanceCode" text,
  "finish" text,
  "grade" text,
  "dimensions" text,
  "materialType" text,
  "materialTypeCode" text
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    "material"."id",
    "materialForm"."name" AS "shape",
    "materialForm"."code" AS "shapeCode",
    "materialSubstance"."name" AS "substance",
    "materialSubstance"."code" AS "substanceCode",
    "materialFinish"."name" AS "finish",
    "materialGrade"."name" AS "grade",
    "materialDimension"."name" AS "dimensions",
    "materialType"."name" AS "materialType",
    "materialType"."code" AS "materialTypeCode"
  FROM "material"
  LEFT JOIN "materialForm" ON "material"."materialFormId" = "materialForm"."id" AND "materialForm"."companyId" = company_id
  LEFT JOIN "materialSubstance" ON "material"."materialSubstanceId" = "materialSubstance"."id" AND "materialSubstance"."companyId" = company_id
  LEFT JOIN "materialFinish" ON "material"."finishId" = "materialFinish"."id" AND "materialFinish"."companyId" = company_id
  LEFT JOIN "materialGrade" ON "material"."gradeId" = "materialGrade"."id" AND "materialGrade"."companyId" = company_id
  LEFT JOIN "materialType" ON "material"."materialTypeId" = "materialType"."id" AND "materialType"."companyId" = company_id
  LEFT JOIN "materialDimension" ON "material"."dimensionId" = "materialDimension"."id" AND "materialDimension"."companyId" = company_id
  WHERE "material"."id" = readable_id
    AND "material"."companyId" = company_id;
END;
$$;
