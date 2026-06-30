ALTER TABLE "nonConformanceSupplier" ADD COLUMN "externalLinkId" UUID REFERENCES "externalLink" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "disposition" AS ENUM (
  'Conditional Acceptance',
  'Deviation Accepted',
  'Hold',
  'No Action Required',
  'Pending',
  'Quarantine',
  'Repair',
  'Return to Supplier',
  'Rework',
  'Scrap',
  'Use As Is'
);

ALTER TABLE public."nonConformanceActionTask"
ADD COLUMN "supplierId" text NULL;

ALTER TABLE public."nonConformanceActionTask"
ADD CONSTRAINT "nonConformanceActionTask_supplierId_fkey"
FOREIGN KEY ("supplierId")
REFERENCES supplier (id)
ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "nonConformanceActionTask_supplierId_idx"
ON public."nonConformanceActionTask" ("supplierId");

ALTER TABLE public."nonConformanceInvestigationTask"
ADD COLUMN "supplierId" text NULL;

ALTER TABLE public."nonConformanceInvestigationTask"
ADD CONSTRAINT "nonConformanceInvestigationTask_supplierId_fkey"
FOREIGN KEY ("supplierId")
REFERENCES supplier (id)
ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "nonConformanceInvestigationTask_supplierId_idx"
ON public."nonConformanceInvestigationTask" ("supplierId");

ALTER TABLE public."nonConformanceItem"
ADD COLUMN "disposition" "disposition" DEFAULT 'Pending';

ALTER TYPE "externalLinkDocumentType" ADD VALUE IF NOT EXISTS 'Non-Conformance Supplier';

-- Create trigger function to auto-create external link for non-conformance suppliers
CREATE OR REPLACE FUNCTION create_non_conformance_external_link()
RETURNS TRIGGER AS $$
DECLARE
  external_link_id UUID;
BEGIN
  -- Insert into externalLink table and get the ID
  INSERT INTO "externalLink" ("documentType", "documentId", "companyId")
  VALUES ('Non-Conformance Supplier', NEW."id", NEW."companyId")
  ON CONFLICT ("documentId", "documentType", "companyId") DO UPDATE SET
    "documentType" = EXCLUDED."documentType"
  RETURNING "id" INTO external_link_id;

  -- Update the nonConformanceSupplier row with the external link ID
  UPDATE "nonConformanceSupplier"
  SET "externalLinkId" = external_link_id
  WHERE "id" = NEW."id";
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on nonConformanceSupplier table
CREATE TRIGGER create_non_conformance_external_link_trigger
AFTER INSERT ON "nonConformanceSupplier"
FOR EACH ROW
EXECUTE FUNCTION create_non_conformance_external_link();

COMMIT;

-- Backfill existing nonConformanceSupplier records with external links
DO $$
DECLARE
  supplier_record RECORD;
  external_link_id UUID;
BEGIN
  -- Loop through all existing nonConformanceSupplier records that don't have an externalLinkId
  FOR supplier_record IN 
    SELECT "id", "companyId" 
    FROM "nonConformanceSupplier" 
    WHERE "externalLinkId" IS NULL
  LOOP
    -- Insert into externalLink table and get the ID
    INSERT INTO "externalLink" ("documentType", "documentId", "companyId")
    VALUES ('Non-Conformance Supplier', supplier_record."id", supplier_record."companyId")
    ON CONFLICT ("documentId", "documentType", "companyId") DO UPDATE SET
      "documentType" = EXCLUDED."documentType"
    RETURNING "id" INTO external_link_id;

    -- Update the nonConformanceSupplier row with the external link ID
    UPDATE "nonConformanceSupplier"
    SET "externalLinkId" = external_link_id
    WHERE "id" = supplier_record."id";
  END LOOP;
END $$;
