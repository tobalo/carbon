-- Drop the old unique constraint on name + companyId
-- This constraint prevented duplicate work center names within a company,
-- even across different locations
ALTER TABLE "workCenter" 
  DROP CONSTRAINT IF EXISTS "workCenter_name_companyId_key";

-- Drop the new constraint if it already exists (in case migration was run before)
-- This makes the migration idempotent (safe to run multiple times)
ALTER TABLE "workCenter" 
  DROP CONSTRAINT IF EXISTS "workCenter_name_locationId_companyId_key";

-- Add new unique constraint on name + locationId + companyId
-- This allows the same work center name across different locations
-- within the same company, but prevents duplicates within the same location
ALTER TABLE "workCenter" 
  ADD CONSTRAINT "workCenter_name_locationId_companyId_key" 
  UNIQUE ("name", "locationId", "companyId");
