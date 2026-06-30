UPDATE "trackedEntity" 
SET "readableId" = attributes->>'Serial Number'
WHERE attributes ? 'Serial Number' 
  AND attributes->>'Serial Number' IS NOT NULL 
  AND attributes->>'Serial Number' != '';
