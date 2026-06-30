-- Add materialFormFilterId column to configurationParameter table
-- This allows filtering materials by form when the dataType is 'material'
ALTER TABLE "configurationParameter"
ADD COLUMN "materialFormFilterId" TEXT,
ADD CONSTRAINT "configurationParameter_materialFormFilterId_fkey"
  FOREIGN KEY ("materialFormFilterId") REFERENCES "materialForm"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
