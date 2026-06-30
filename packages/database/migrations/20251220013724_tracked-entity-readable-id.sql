ALTER TABLE "trackedEntity" ADD COLUMN "readableId" TEXT;

UPDATE "trackedEntity" 
SET "readableId" = attributes->>'Batch Number'
WHERE attributes ? 'Batch Number' 
  AND attributes->>'Batch Number' IS NOT NULL 
  AND attributes->>'Batch Number' != '';
