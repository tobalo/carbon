-- Add conflict tracking fields to jobOperation table
ALTER TABLE "jobOperation"
  ADD COLUMN "hasConflict" BOOLEAN DEFAULT false,
  ADD COLUMN "conflictReason" TEXT;

-- Create index for work center priority queries (only active operations)
CREATE INDEX "idx_job_operation_wc_priority"
  ON "jobOperation"("workCenterId", "priority", "status")
  WHERE "status" NOT IN ('Done', 'Canceled');

-- Add comment for documentation
COMMENT ON COLUMN "jobOperation"."hasConflict" IS 'Indicates if this operation has a scheduling conflict (e.g., start date in the past)';
COMMENT ON COLUMN "jobOperation"."conflictReason" IS 'Human-readable explanation of the scheduling conflict';
