CREATE INDEX "idx_jobOperationDependency_dependsOnId" ON "jobOperationDependency" ("dependsOnId");

CREATE OR REPLACE FUNCTION update_job_operation_quantities()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE 
  job_id TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment quantities on insert
    UPDATE "jobOperation"
    SET 
      "quantityComplete" = "quantityComplete" + 
        CASE WHEN NEW."type" = 'Production' THEN NEW.quantity ELSE 0 END,
      "quantityReworked" = "quantityReworked" + 
        CASE WHEN NEW."type" = 'Rework' THEN NEW.quantity ELSE 0 END,
      "quantityScrapped" = "quantityScrapped" + 
        CASE WHEN NEW."type" = 'Scrap' THEN NEW.quantity ELSE 0 END
    WHERE id = NEW."jobOperationId";

    
  ELSIF TG_OP = 'UPDATE' THEN
    -- Adjust quantities on update by removing old values and adding new values
    UPDATE "jobOperation"
    SET 
      "quantityComplete" = "quantityComplete" 
        - CASE WHEN OLD."type" = 'Production' THEN OLD.quantity ELSE 0 END
        + CASE WHEN NEW."type" = 'Production' THEN NEW.quantity ELSE 0 END,
      "quantityReworked" = "quantityReworked" 
        - CASE WHEN OLD."type" = 'Rework' THEN OLD.quantity ELSE 0 END
        + CASE WHEN NEW."type" = 'Rework' THEN NEW.quantity ELSE 0 END,
      "quantityScrapped" = "quantityScrapped" 
        - CASE WHEN OLD."type" = 'Scrap' THEN OLD.quantity ELSE 0 END
        + CASE WHEN NEW."type" = 'Scrap' THEN NEW.quantity ELSE 0 END
    WHERE id = NEW."jobOperationId";
  ELSIF TG_OP = 'DELETE' THEN
    -- Decrement quantities on delete
    UPDATE "jobOperation"
    SET 
      "quantityComplete" = "quantityComplete" - 
        CASE WHEN OLD."type" = 'Production' THEN OLD.quantity ELSE 0 END,
      "quantityReworked" = "quantityReworked" - 
        CASE WHEN OLD."type" = 'Rework' THEN OLD.quantity ELSE 0 END,
      "quantityScrapped" = "quantityScrapped" - 
        CASE WHEN OLD."type" = 'Scrap' THEN OLD.quantity ELSE 0 END
    WHERE id = OLD."jobOperationId";
  END IF;

  IF is_last_job_operation(NEW.id) AND NEW."type" = 'Production' THEN
    SELECT "jobId" INTO job_id FROM "jobOperation" WHERE id = NEW."jobOperationId";
    UPDATE "job"
    SET "quantityComplete" = (
      SELECT COALESCE(SUM(pq.quantity), 0)
      FROM "productionQuantity" pq
      JOIN "jobOperation" jo ON jo.id = pq."jobOperationId"
      WHERE jo."jobId" = job_id AND pq."type" = 'Production'
    )
    WHERE id = job_id;
  END IF;
  RETURN NULL;
END;
$$;
