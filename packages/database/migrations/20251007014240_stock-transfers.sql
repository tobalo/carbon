-- Add shelfId to methodMaterial table for pick-from location
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'methodMaterial' AND column_name = 'shelfId'
  ) THEN
    ALTER TABLE "methodMaterial" ADD COLUMN "shelfIds" JSONB NOT NULL DEFAULT '{}';
    
  END IF;
END $$;

-- Add shelfId to jobMaterial table for pick-from location
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobMaterial' AND column_name = 'shelfId'
  ) THEN
    ALTER TABLE "jobMaterial" ADD COLUMN "shelfId" TEXT;
    ALTER TABLE "jobMaterial" ADD CONSTRAINT "jobMaterial_shelfId_fkey"
      FOREIGN KEY ("shelfId") REFERENCES "shelf" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Add shelfId to quoteMaterial table for pick-from location
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quoteMaterial' AND column_name = 'shelfId'
  ) THEN
    ALTER TABLE "quoteMaterial" ADD COLUMN "shelfId" TEXT;
    ALTER TABLE "quoteMaterial" ADD CONSTRAINT "quoteMaterial_shelfId_fkey"
      FOREIGN KEY ("shelfId") REFERENCES "shelf" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Update jobMaterialWithMakeMethodId view to include shelfId and shelfName
DROP VIEW IF EXISTS "jobMaterialWithMakeMethodId";
CREATE OR REPLACE VIEW "jobMaterialWithMakeMethodId" WITH(SECURITY_INVOKER=true) AS
  SELECT
    jm.*,
    s."name" AS "shelfName",
    jmm."id" AS "jobMaterialMakeMethodId",
    jmm.version AS "version",
    i."readableIdWithRevision" as "itemReadableId",
    i."readableId" as "itemReadableIdWithoutRevision"
  FROM "jobMaterial" jm
  LEFT JOIN "jobMakeMethod" jmm
    ON jmm."parentMaterialId" = jm."id"
  LEFT JOIN "shelf" s ON s.id = jm."shelfId"
  INNER JOIN "item" i ON i.id = jm."itemId";


DROP VIEW IF EXISTS "quoteMaterialWithMakeMethodId";
CREATE OR REPLACE VIEW "quoteMaterialWithMakeMethodId" WITH(SECURITY_INVOKER=true) AS
  SELECT 
    qm.*, 
    qmm."id" AS "quoteMaterialMakeMethodId",
    qmm.version AS "version"
  FROM "quoteMaterial" qm 
  LEFT JOIN "quoteMakeMethod" qmm 
    ON qmm."parentMaterialId" = qm."id";

-- Create stock transfer status enum
CREATE TYPE "stockTransferStatus" AS ENUM (
  'Draft',
  'Released',
  'In Progress',
  'Completed'
);


CREATE TABLE "stockTransfer" (
  "id" TEXT NOT NULL DEFAULT xid(),
  "stockTransferId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "status" "stockTransferStatus" NOT NULL DEFAULT 'Draft',
  "completedAt" TIMESTAMP WITH TIME ZONE,
  "companyId" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "createdBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE,
  "updatedBy" TEXT,
  "notes" JSON DEFAULT '{}'::json,
  "assignee" TEXT,
  "customFields" JSONB,
  "tags" TEXT[],

  CONSTRAINT "stockTransfer_pkey" PRIMARY KEY ("id", "companyId"),
  CONSTRAINT "stockTransfer_assignee_fkey" FOREIGN KEY ("assignee") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "stockTransfer_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stockTransfer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "stockTransfer_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stockTransfer_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "stockTransfer_locationId_idx" ON "stockTransfer" ("locationId");
CREATE INDEX "stockTransfer_status_idx" ON "stockTransfer" ("status");

ALTER TABLE "stockTransfer" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."stockTransfer"
FOR SELECT USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_role()
    )::text[]
  )
);

CREATE POLICY "INSERT" ON "public"."stockTransfer"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('inventory_create')
    )::text[]
  )
);

CREATE POLICY "UPDATE" ON "public"."stockTransfer"
FOR UPDATE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('inventory_update')
    )::text[]
  )
);

CREATE POLICY "DELETE" ON "public"."stockTransfer"
FOR DELETE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('inventory_delete')
    )::text[]
  )
);

CREATE TABLE "stockTransferLine" (
  "id" TEXT NOT NULL DEFAULT xid(),
  "stockTransferId" TEXT NOT NULL,
  "jobId" TEXT,
  "jobMaterialId" TEXT,
  "itemId" TEXT NOT NULL,
  "fromShelfId" TEXT,
  "toShelfId" TEXT,
  "quantity" NUMERIC NOT NULL DEFAULT 0,
  "pickedQuantity" NUMERIC NOT NULL DEFAULT 0,
  "outstandingQuantity" NUMERIC GENERATED ALWAYS AS (CASE WHEN "quantity" >= "pickedQuantity" THEN "quantity" - "pickedQuantity" ELSE 0 END) STORED,
  "trackedEntityId" TEXT,
  "requiresBatchTracking" BOOLEAN NOT NULL DEFAULT false,
  "requiresSerialTracking" BOOLEAN NOT NULL DEFAULT false,
  "companyId" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "createdBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE,
  "updatedBy" TEXT,

  CONSTRAINT "stockTransferLine_pkey" PRIMARY KEY ("id", "companyId"),
  CONSTRAINT "stockTransferLine_stockTransferId_fkey" FOREIGN KEY ("stockTransferId", "companyId") REFERENCES "stockTransfer" ("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "stockTransferLine_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "stockTransferLine_jobMaterialId_fkey" FOREIGN KEY ("jobMaterialId") REFERENCES "jobMaterial" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "stockTransferLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stockTransferLine_fromShelfId_fkey" FOREIGN KEY ("fromShelfId") REFERENCES "shelf" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "stockTransferLine_toShelfId_fkey" FOREIGN KEY ("toShelfId") REFERENCES "shelf" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "stockTransferLine_trackedEntityId_fkey" FOREIGN KEY ("trackedEntityId") REFERENCES "trackedEntity" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "stockTransferLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "stockTransferLine_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stockTransferLine_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);



CREATE INDEX "stockTransferLine_stockTransferId_idx" ON "stockTransferLine" ("stockTransferId");
CREATE INDEX "stockTransferLine_jobId_idx" ON "stockTransferLine" ("jobId");
CREATE INDEX "stockTransferLine_itemId_idx" ON "stockTransferLine" ("itemId");


ALTER TABLE "stockTransferLine" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."stockTransferLine"
FOR SELECT USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_role()
    )::text[]
  )
);

CREATE POLICY "INSERT" ON "public"."stockTransferLine"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('inventory_create')
    )::text[]
  )
);

CREATE POLICY "UPDATE" ON "public"."stockTransferLine"
FOR UPDATE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('inventory_update')
    )::text[]
  )
);

CREATE POLICY "DELETE" ON "public"."stockTransferLine"
FOR DELETE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('inventory_delete')
    )::text[]
  )
);

INSERT INTO "sequence" ("table", "name", "prefix", "suffix", "next", "size", "step", "companyId")
SELECT 
  'stockTransfer',
  'Stock Transfer',
  'ST',
  NULL,
  0,
  6,
  1,
  "id"
FROM "company";

DROP VIEW IF EXISTS "stockTransferLines";
CREATE VIEW "stockTransferLines" AS
SELECT 
  stl.*,
  CASE
    WHEN i."thumbnailPath" IS NULL AND mu."thumbnailPath" IS NOT NULL THEN mu."thumbnailPath"
    ELSE i."thumbnailPath"
  END AS "thumbnailPath",
  i."readableIdWithRevision" as "itemReadableId",
  i."name" as "itemDescription",
  uom."name" AS "unitOfMeasure",
  sf."name" AS "fromShelfName",
  st."name" AS "toShelfName"
FROM "stockTransferLine" stl
LEFT JOIN "item" i ON i."id" = stl."itemId"
LEFT JOIN "modelUpload" mu ON mu."id" = i."modelUploadId"
LEFT JOIN "unitOfMeasure" uom ON uom."code" = i."unitOfMeasureCode" AND uom."companyId" = i."companyId"
LEFT JOIN "shelf" sf ON sf."id" = stl."fromShelfId"
LEFT JOIN "shelf" st ON st."id" = stl."toShelfId"
ORDER BY "itemReadableId" ASC, "toShelfName" ASC;

-- Trigger function to update stock transfer status based on picked quantities
CREATE OR REPLACE FUNCTION update_stock_transfer_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if pickedQuantity has changed and is not 0
  IF OLD."pickedQuantity" IS DISTINCT FROM NEW."pickedQuantity" AND NEW."pickedQuantity" != 0 THEN
    -- Check if all lines for this stock transfer have pickedQuantity = quantity
    IF EXISTS (
      SELECT 1 
      FROM "stockTransferLine" 
      WHERE "stockTransferId" = NEW."stockTransferId" 
        AND ("pickedQuantity" IS NULL OR "pickedQuantity" != "quantity")
    ) THEN
      -- Not all lines are fully picked, set status to In Progress
      UPDATE "stockTransfer" 
      SET "status" = 'In Progress' 
      WHERE "id" = NEW."stockTransferId";
    ELSE
      -- All lines are fully picked, set status to Completed
      UPDATE "stockTransfer" 
      SET "status" = 'Completed', "completedAt" = NOW()
      WHERE "id" = NEW."stockTransferId";
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on stockTransferLine UPDATE
CREATE TRIGGER update_stock_transfer_status_trigger
  AFTER UPDATE ON "stockTransferLine"
  FOR EACH ROW
  EXECUTE FUNCTION update_stock_transfer_status();
