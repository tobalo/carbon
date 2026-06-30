-- Add indexes for procedure table

CREATE INDEX IF NOT EXISTS idx_procedure_name_company_id ON procedure(name, "companyId");
CREATE INDEX IF NOT EXISTS idx_quality_document_name ON "qualityDocument"(name);


-- Create trigger function to archive other active quality documents with same name
CREATE OR REPLACE FUNCTION archive_other_quality_documents()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if status is being updated to 'Active'
  IF NEW.status = 'Active' AND (OLD.status IS NULL OR OLD.status != 'Active') THEN
    -- Archive all other documents with same name and company that are currently Active
    UPDATE "qualityDocument" 
    SET status = 'Archived'
    WHERE name = NEW.name 
      AND "companyId" = NEW."companyId"
      AND id != NEW.id
      AND status = 'Active';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on qualityDocument table
CREATE TRIGGER trigger_archive_other_quality_documents
  AFTER UPDATE OF status ON "qualityDocument"
  FOR EACH ROW
  EXECUTE FUNCTION archive_other_quality_documents();

-- Create trigger function to archive other active procedures with same name
CREATE OR REPLACE FUNCTION archive_other_procedures()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if status is being updated to 'Active'
  IF NEW.status = 'Active' AND (OLD.status IS NULL OR OLD.status != 'Active') THEN
    -- Archive all other procedures with same name and company that are currently Active
    UPDATE procedure 
    SET status = 'Archived'
    WHERE name = NEW.name 
      AND "companyId" = NEW."companyId"
      AND id != NEW.id
      AND status = 'Active';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on procedure table
CREATE TRIGGER trigger_archive_other_procedures
  AFTER UPDATE OF status ON procedure
  FOR EACH ROW
  EXECUTE FUNCTION archive_other_procedures();

