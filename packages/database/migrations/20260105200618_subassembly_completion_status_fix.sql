-- Fix is_last_job_operation to check ALL operations in job are complete
-- Previous fix (20260105200618) only checked if operation was in root assembly with no dependents
-- But this missed checking if subassembly operations were still incomplete
--
-- Root cause: When a parent assembly's last operation completes, it may have no dependents
-- (correctly identified as a "leaf" operation), but subassembly operations could still be
-- incomplete. The dependency graph ensures correct sequencing but doesn't guarantee
-- completeness across all assemblies.
--
-- This fix adds a check to ensure ALL operations in the job are complete before
-- marking the job as done, regardless of the dependency structure.

CREATE OR REPLACE FUNCTION is_last_job_operation(operation_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_job_id TEXT;
  v_is_root_assembly BOOLEAN;
  v_incomplete_ops_count INTEGER;
BEGIN
  -- Get the job ID and check if this operation belongs to root assembly
  SELECT
    jo."jobId",
    jmm."parentMaterialId" IS NULL
  INTO v_job_id, v_is_root_assembly
  FROM "jobOperation" jo
  JOIN "jobMakeMethod" jmm ON jmm.id = jo."jobMakeMethodId"
  WHERE jo.id = operation_id;

  -- If not in root assembly, cannot be the last operation
  IF NOT v_is_root_assembly THEN
    RETURN FALSE;
  END IF;

  -- Check if any operation depends on this one (must be a leaf in dependency graph)
  IF EXISTS (
    SELECT 1
    FROM "jobOperationDependency"
    WHERE "dependsOnId" = operation_id
  ) THEN
    RETURN FALSE;
  END IF;

  -- Count incomplete operations across ALL assemblies in the job
  -- This is the key fix: checking all operations, not just root assembly
  SELECT COUNT(*)
  INTO v_incomplete_ops_count
  FROM "jobOperation"
  WHERE "jobId" = v_job_id
    AND id != operation_id
    AND status != 'Done'
    AND status != 'Canceled';  -- Canceled operations don't block completion

  -- Return TRUE only if ALL operations are complete
  RETURN v_incomplete_ops_count = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
