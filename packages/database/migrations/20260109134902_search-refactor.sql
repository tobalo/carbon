-- =============================================================================
-- Global Search Architecture Refactor
-- Migrate from single-table multi-tenant search to table-per-company design
-- =============================================================================

-- =============================================================================
-- PART 0: Drop Old Triggers and Functions FIRST
-- =============================================================================

-- Employee triggers
DROP TRIGGER IF EXISTS create_employee_search_result ON "employee";
DROP TRIGGER IF EXISTS update_employee_search_result ON "user";

-- Customer triggers
DROP TRIGGER IF EXISTS create_customer_search_result ON "customer";
DROP TRIGGER IF EXISTS update_customer_search_result ON "customer";

-- Supplier triggers
DROP TRIGGER IF EXISTS create_supplier_search_result ON "supplier";
DROP TRIGGER IF EXISTS update_supplier_search_result ON "supplier";

-- Item triggers
DROP TRIGGER IF EXISTS create_item_search_result ON "item";
DROP TRIGGER IF EXISTS update_item_search_result ON "item";
DROP TRIGGER IF EXISTS delete_item_search_result ON "item";

-- Job triggers
DROP TRIGGER IF EXISTS create_job_search_result ON "job";
DROP TRIGGER IF EXISTS update_job_search_result ON "job";
DROP TRIGGER IF EXISTS delete_job_search_result ON "job";

-- Purchase Order triggers
DROP TRIGGER IF EXISTS create_purchase_order_search_result ON "purchaseOrder";
DROP TRIGGER IF EXISTS update_purchase_order_search_result ON "purchaseOrder";
DROP TRIGGER IF EXISTS delete_purchase_order_search_result ON "purchaseOrder";

-- Sales Order triggers
DROP TRIGGER IF EXISTS create_sales_order_search_result ON "salesOrder";
DROP TRIGGER IF EXISTS update_sales_order_search_result ON "salesOrder";
DROP TRIGGER IF EXISTS delete_sales_order_search_result ON "salesOrder";

-- Quotation triggers
DROP TRIGGER IF EXISTS create_quotation_search_result ON "quote";
DROP TRIGGER IF EXISTS update_quotation_search_result ON "quote";
DROP TRIGGER IF EXISTS delete_quotation_search_result ON "quote";

-- Sales RFQ triggers
DROP TRIGGER IF EXISTS create_sales_rfq_search_result ON "salesRfq";
DROP TRIGGER IF EXISTS update_sales_rfq_search_result ON "salesRfq";
DROP TRIGGER IF EXISTS delete_sales_rfq_search_result ON "salesRfq";




-- Drop old functions
DROP FUNCTION IF EXISTS create_employee_search_result();
DROP FUNCTION IF EXISTS update_employee_search_result();
DROP FUNCTION IF EXISTS create_customer_search_result();
DROP FUNCTION IF EXISTS update_customer_search_result();
DROP FUNCTION IF EXISTS create_supplier_search_result();
DROP FUNCTION IF EXISTS update_supplier_search_result();
DROP FUNCTION IF EXISTS create_item_search_result();
DROP FUNCTION IF EXISTS update_item_search_result();
DROP FUNCTION IF EXISTS delete_item_search_result();
DROP FUNCTION IF EXISTS create_job_search_result();
DROP FUNCTION IF EXISTS update_job_search_result();
DROP FUNCTION IF EXISTS delete_job_search_result();
DROP FUNCTION IF EXISTS create_purchase_order_search_result();
DROP FUNCTION IF EXISTS update_purchase_order_search_result();
DROP FUNCTION IF EXISTS delete_purchase_order_search_result();
DROP FUNCTION IF EXISTS create_sales_order_search_result();
DROP FUNCTION IF EXISTS update_sales_order_search_result();
DROP FUNCTION IF EXISTS delete_sales_order_search_result();
DROP FUNCTION IF EXISTS create_quotation_search_result();
DROP FUNCTION IF EXISTS update_quotation_search_result();
DROP FUNCTION IF EXISTS delete_quotation_search_result();
DROP FUNCTION IF EXISTS create_sales_rfq_search_result();
DROP FUNCTION IF EXISTS update_sales_rfq_search_result();
DROP FUNCTION IF EXISTS delete_sales_rfq_search_result();
DROP FUNCTION IF EXISTS create_work_cell_type_search_result();
DROP FUNCTION IF EXISTS update_work_cell_type_search_result();
DROP FUNCTION IF EXISTS delete_work_cell_type_search_result();
DROP FUNCTION IF EXISTS create_equipment_type_search_result();
DROP FUNCTION IF EXISTS update_equipment_type_search_result();
DROP FUNCTION IF EXISTS delete_equipment_type_search_result();
DROP FUNCTION IF EXISTS create_equipment_search_result();
DROP FUNCTION IF EXISTS update_equipment_search_result();


-- Drop old table and type
DROP TABLE IF EXISTS "search";
DROP TYPE IF EXISTS "searchEntity";

-- =============================================================================
-- PART 1: Create Registry Table
-- =============================================================================

CREATE TABLE "searchIndexRegistry" (
  "companyId" TEXT NOT NULL PRIMARY KEY,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "lastRebuiltAt" TIMESTAMP WITH TIME ZONE,
  CONSTRAINT "searchIndexRegistry_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Enable RLS (no policies - access via service role bypass only)
ALTER TABLE "searchIndexRegistry" ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- PART 2: Create Table Creation Function
-- =============================================================================

CREATE OR REPLACE FUNCTION create_company_search_index(p_company_id TEXT)
RETURNS VOID AS $$
DECLARE
  v_table_name TEXT;
BEGIN
  v_table_name := 'searchIndex_' || p_company_id;

  -- Create the search index table
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      "id" BIGINT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      "entityType" TEXT NOT NULL,
      "entityId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT DEFAULT '''',
      "link" TEXT NOT NULL,
      "tags" TEXT[] DEFAULT ''{}'',
      "metadata" JSONB DEFAULT ''{}'',
      "searchVector" TSVECTOR,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP WITH TIME ZONE,
      CONSTRAINT %I UNIQUE ("entityType", "entityId")
    )', v_table_name, v_table_name || '_entity_unique');

  -- Create indexes
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I USING GIN ("searchVector")',
    v_table_name || '_fts_idx', v_table_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I ("entityType")',
    v_table_name || '_entityType_idx', v_table_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I ("updatedAt" DESC)',
    v_table_name || '_updatedAt_idx', v_table_name);

  -- Enable RLS (no SELECT policies - access via service role bypass)
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', v_table_name);

  -- Register the company in the registry
  INSERT INTO "searchIndexRegistry" ("companyId")
  VALUES (p_company_id)
  ON CONFLICT ("companyId") DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- =============================================================================
-- PART 2.1: Create Table Deletion Function
-- =============================================================================

CREATE OR REPLACE FUNCTION drop_company_search_index(p_company_id TEXT)
RETURNS VOID AS $$
DECLARE
  v_table_name TEXT;
BEGIN
  v_table_name := 'searchIndex_' || p_company_id;

  -- Drop the search index table if it exists
  EXECUTE format('DROP TABLE IF EXISTS %I', v_table_name);

  -- Remove from registry
  DELETE FROM "searchIndexRegistry" WHERE "companyId" = p_company_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- =============================================================================
-- PART 3: Create Company Trigger (auto-create search index for new companies)
-- =============================================================================

CREATE OR REPLACE FUNCTION on_company_created_search_index()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM create_company_search_index(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER company_search_index_trigger
  AFTER INSERT ON "company"
  FOR EACH ROW EXECUTE FUNCTION on_company_created_search_index();

-- =============================================================================
-- PART 4: Create Sync Functions
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4.1 Employee Sync
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_employee_to_search_index()
RETURNS TRIGGER AS $$
DECLARE
  v_table_name TEXT;
  v_emp_name TEXT;
  v_emp_type TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_table_name := 'searchIndex_' || OLD."companyId";
    EXECUTE format('DELETE FROM %I WHERE "entityType" = $1 AND "entityId" = $2', v_table_name)
      USING 'employee', OLD.id;
    RETURN OLD;
  END IF;

  v_table_name := 'searchIndex_' || NEW."companyId";

  -- Get employee name from user table
  SELECT "fullName" INTO v_emp_name FROM "user" WHERE id = NEW.id;

  -- Get employee type name
  SELECT name INTO v_emp_type FROM "employeeType" WHERE id = NEW."employeeTypeId";

  IF NEW.active = false THEN
    EXECUTE format('DELETE FROM %I WHERE "entityType" = $1 AND "entityId" = $2', v_table_name)
      USING 'employee', NEW.id;
    RETURN NEW;
  END IF;

  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "link", "tags", "metadata", "searchVector")
    VALUES ($1, $2, $3, $4, $5, $6, to_tsvector(''english'', $3 || '' '' || COALESCE(array_to_string($5, '' ''), '''')))
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = to_tsvector(''english'', EXCLUDED."title" || '' '' || COALESCE(array_to_string(EXCLUDED."tags", '' ''), '''')),
      "updatedAt" = NOW()
  ', v_table_name) USING
    'employee',
    NEW.id,
    COALESCE(v_emp_name, ''),
    '/x/person/' || NEW.id,
    ARRAY_REMOVE(ARRAY[v_emp_type], NULL),
    jsonb_build_object('active', NEW.active);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 4.2 Customer Sync
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_customer_to_search_index()
RETURNS TRIGGER AS $$
DECLARE
  v_table_name TEXT;
  v_cust_type TEXT;
  v_cust_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_table_name := 'searchIndex_' || OLD."companyId";
    EXECUTE format('DELETE FROM %I WHERE "entityType" = $1 AND "entityId" = $2', v_table_name)
      USING 'customer', OLD.id;
    RETURN OLD;
  END IF;

  v_table_name := 'searchIndex_' || NEW."companyId";

  SELECT name INTO v_cust_type FROM "customerType" WHERE id = NEW."customerTypeId";
  SELECT name INTO v_cust_status FROM "customerStatus" WHERE id = NEW."customerStatusId";

  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "link", "tags", "metadata", "searchVector")
    VALUES ($1, $2, $3, $4, $5, $6, to_tsvector(''english'', $3 || '' '' || COALESCE(array_to_string($5, '' ''), '''')))
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = to_tsvector(''english'', EXCLUDED."title" || '' '' || COALESCE(array_to_string(EXCLUDED."tags", '' ''), '''')),
      "updatedAt" = NOW()
  ', v_table_name) USING
    'customer',
    NEW.id,
    NEW.name,
    '/x/customer/' || NEW.id,
    ARRAY_REMOVE(ARRAY[v_cust_type, v_cust_status], NULL),
    jsonb_build_object('taxId', NEW."taxId");

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 4.3 Supplier Sync
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_supplier_to_search_index()
RETURNS TRIGGER AS $$
DECLARE
  v_table_name TEXT;
  v_supp_type TEXT;
  v_supp_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_table_name := 'searchIndex_' || OLD."companyId";
    EXECUTE format('DELETE FROM %I WHERE "entityType" = $1 AND "entityId" = $2', v_table_name)
      USING 'supplier', OLD.id;
    RETURN OLD;
  END IF;

  v_table_name := 'searchIndex_' || NEW."companyId";

  SELECT name INTO v_supp_type FROM "supplierType" WHERE id = NEW."supplierTypeId";
  SELECT name INTO v_supp_status FROM "supplierStatus" WHERE id = NEW."supplierStatusId";

  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "link", "tags", "metadata", "searchVector")
    VALUES ($1, $2, $3, $4, $5, $6, to_tsvector(''english'', $3 || '' '' || COALESCE(array_to_string($5, '' ''), '''')))
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = to_tsvector(''english'', EXCLUDED."title" || '' '' || COALESCE(array_to_string(EXCLUDED."tags", '' ''), '''')),
      "updatedAt" = NOW()
  ', v_table_name) USING
    'supplier',
    NEW.id,
    NEW.name,
    '/x/supplier/' || NEW.id,
    ARRAY_REMOVE(ARRAY[v_supp_type, v_supp_status], NULL),
    jsonb_build_object('taxId', NEW."taxId");

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 4.4 Item Sync
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_item_to_search_index()
RETURNS TRIGGER AS $$
DECLARE
  v_table_name TEXT;
  v_link TEXT;
  v_description TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_table_name := 'searchIndex_' || OLD."companyId";
    EXECUTE format('DELETE FROM %I WHERE "entityType" = $1 AND "entityId" = $2', v_table_name)
      USING 'item', OLD.id;
    RETURN OLD;
  END IF;

  v_table_name := 'searchIndex_' || NEW."companyId";

  -- Determine link based on item type
  v_link := CASE NEW.type
    WHEN 'Part' THEN '/x/part/' || NEW.id
    WHEN 'Service' THEN '/x/service/' || NEW.id
    WHEN 'Tool' THEN '/x/tool/' || NEW.id
    WHEN 'Consumable' THEN '/x/consumable/' || NEW.id
    WHEN 'Material' THEN '/x/material/' || NEW.id
    WHEN 'Fixture' THEN '/x/fixture/' || NEW.id
    ELSE '/x/part/' || NEW.id
  END;

  v_description := NEW.name || ' ' || COALESCE(NEW.description, '');

  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "description", "link", "tags", "metadata", "searchVector")
    VALUES ($1, $2, $3, $4, $5, $6, $7, to_tsvector(''english'', $3 || '' '' || $4 || '' '' || COALESCE(array_to_string($6, '' ''), '''')))
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "link" = EXCLUDED."link",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = to_tsvector(''english'', EXCLUDED."title" || '' '' || EXCLUDED."description" || '' '' || COALESCE(array_to_string(EXCLUDED."tags", '' ''), '''')),
      "updatedAt" = NOW()
  ', v_table_name) USING
    'item',
    NEW.id,
    NEW."readableId",
    v_description,
    v_link,
    ARRAY_REMOVE(ARRAY[NEW.type::TEXT, NEW."replenishmentSystem"::TEXT], NULL),
    jsonb_build_object('active', NEW.active);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION sync_job_to_search_index()
RETURNS TRIGGER AS $$
DECLARE
  v_table_name TEXT;
  v_item_name TEXT;
  v_cust_name TEXT;
  v_description TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_table_name := 'searchIndex_' || OLD."companyId";
    EXECUTE format('DELETE FROM %I WHERE "entityType" = $1 AND "entityId" = $2', v_table_name)
      USING 'job', OLD.id;
    RETURN OLD;
  END IF;

  v_table_name := 'searchIndex_' || NEW."companyId";

  SELECT name INTO v_item_name FROM "item" WHERE id = NEW."itemId";
  SELECT name INTO v_cust_name FROM "customer" WHERE id = NEW."customerId";

  v_description := COALESCE(v_item_name, '') || ' ' || COALESCE(v_cust_name, '');

  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "description", "link", "tags", "metadata", "searchVector")
    VALUES ($1, $2, $3, $4, $5, $6, $7, to_tsvector(''english'', $3 || '' '' || $4 || '' '' || COALESCE(array_to_string($6, '' ''), '''')))
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = to_tsvector(''english'', EXCLUDED."title" || '' '' || EXCLUDED."description" || '' '' || COALESCE(array_to_string(EXCLUDED."tags", '' ''), '''')),
      "updatedAt" = NOW()
  ', v_table_name) USING
    'job',
    NEW.id,
    NEW."jobId",
    v_description,
    '/x/job/' || NEW.id,
    ARRAY_REMOVE(ARRAY[NEW.status::TEXT, NEW."deadlineType"::TEXT], NULL),
    jsonb_build_object('quantity', NEW.quantity, 'dueDate', NEW."dueDate");

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 4.8 Purchase Order Sync
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_purchase_order_to_search_index()
RETURNS TRIGGER AS $$
DECLARE
  v_table_name TEXT;
  v_supp_name TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_table_name := 'searchIndex_' || OLD."companyId";
    EXECUTE format('DELETE FROM %I WHERE "entityType" = $1 AND "entityId" = $2', v_table_name)
      USING 'purchaseOrder', OLD.id;
    RETURN OLD;
  END IF;

  v_table_name := 'searchIndex_' || NEW."companyId";

  SELECT name INTO v_supp_name FROM "supplier" WHERE id = NEW."supplierId";

  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "description", "link", "tags", "metadata", "searchVector")
    VALUES ($1, $2, $3, $4, $5, $6, $7, to_tsvector(''english'', $3 || '' '' || $4 || '' '' || COALESCE(array_to_string($6, '' ''), '''')))
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = to_tsvector(''english'', EXCLUDED."title" || '' '' || EXCLUDED."description" || '' '' || COALESCE(array_to_string(EXCLUDED."tags", '' ''), '''')),
      "updatedAt" = NOW()
  ', v_table_name) USING
    'purchaseOrder',
    NEW.id,
    NEW."purchaseOrderId",
    COALESCE(v_supp_name, ''),
    '/x/purchase-order/' || NEW.id,
    ARRAY_REMOVE(ARRAY[NEW.status::TEXT], NULL),
    jsonb_build_object('orderDate', NEW."orderDate", 'supplierReference', NEW."supplierReference");

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 4.9 Sales Invoice Sync
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_sales_invoice_to_search_index()
RETURNS TRIGGER AS $$
DECLARE
  v_table_name TEXT;
  v_cust_name TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_table_name := 'searchIndex_' || OLD."companyId";
    EXECUTE format('DELETE FROM %I WHERE "entityType" = $1 AND "entityId" = $2', v_table_name)
      USING 'salesInvoice', OLD.id;
    RETURN OLD;
  END IF;

  v_table_name := 'searchIndex_' || NEW."companyId";

  SELECT name INTO v_cust_name FROM "customer" WHERE id = NEW."customerId";

  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "description", "link", "tags", "metadata", "searchVector")
    VALUES ($1, $2, $3, $4, $5, $6, $7, to_tsvector(''english'', $3 || '' '' || $4 || '' '' || COALESCE(array_to_string($6, '' ''), '''')))
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = to_tsvector(''english'', EXCLUDED."title" || '' '' || EXCLUDED."description" || '' '' || COALESCE(array_to_string(EXCLUDED."tags", '' ''), '''')),
      "updatedAt" = NOW()
  ', v_table_name) USING
    'salesInvoice',
    NEW.id,
    NEW."invoiceId",
    COALESCE(v_cust_name, ''),
    '/x/invoicing/sales/' || NEW.id,
    ARRAY_REMOVE(ARRAY[NEW.status::TEXT], NULL),
    jsonb_build_object('totalAmount', NEW."totalAmount", 'dateDue', NEW."dateDue");

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 4.10 Purchase Invoice Sync
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_purchase_invoice_to_search_index()
RETURNS TRIGGER AS $$
DECLARE
  v_table_name TEXT;
  v_supp_name TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_table_name := 'searchIndex_' || OLD."companyId";
    EXECUTE format('DELETE FROM %I WHERE "entityType" = $1 AND "entityId" = $2', v_table_name)
      USING 'purchaseInvoice', OLD.id;
    RETURN OLD;
  END IF;

  v_table_name := 'searchIndex_' || NEW."companyId";

  SELECT name INTO v_supp_name FROM "supplier" WHERE id = NEW."supplierId";

  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "description", "link", "tags", "metadata", "searchVector")
    VALUES ($1, $2, $3, $4, $5, $6, $7, to_tsvector(''english'', $3 || '' '' || $4 || '' '' || COALESCE(array_to_string($6, '' ''), '''')))
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = to_tsvector(''english'', EXCLUDED."title" || '' '' || EXCLUDED."description" || '' '' || COALESCE(array_to_string(EXCLUDED."tags", '' ''), '''')),
      "updatedAt" = NOW()
  ', v_table_name) USING
    'purchaseInvoice',
    NEW.id,
    NEW."invoiceId",
    COALESCE(v_supp_name, ''),
    '/x/invoicing/purchasing/' || NEW.id,
    ARRAY_REMOVE(ARRAY[NEW.status::TEXT], NULL),
    jsonb_build_object('totalAmount', NEW."totalAmount", 'dateDue', NEW."dateDue");

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 4.11 Non-Conformance (Issue) Sync
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_non_conformance_to_search_index()
RETURNS TRIGGER AS $$
DECLARE
  v_table_name TEXT;
  v_nc_type TEXT;
  v_description TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_table_name := 'searchIndex_' || OLD."companyId";
    EXECUTE format('DELETE FROM %I WHERE "entityType" = $1 AND "entityId" = $2', v_table_name)
      USING 'issue', OLD.id;
    RETURN OLD;
  END IF;

  v_table_name := 'searchIndex_' || NEW."companyId";

  SELECT name INTO v_nc_type FROM "nonConformanceType" WHERE id = NEW."nonConformanceTypeId";

  v_description := NEW.name || ' ' || COALESCE(NEW.description, '');

  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "description", "link", "tags", "metadata", "searchVector")
    VALUES ($1, $2, $3, $4, $5, $6, $7, to_tsvector(''english'', $3 || '' '' || $4 || '' '' || COALESCE(array_to_string($6, '' ''), '''')))
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = to_tsvector(''english'', EXCLUDED."title" || '' '' || EXCLUDED."description" || '' '' || COALESCE(array_to_string(EXCLUDED."tags", '' ''), '''')),
      "updatedAt" = NOW()
  ', v_table_name) USING
    'issue',
    NEW.id,
    NEW."nonConformanceId",
    v_description,
    '/x/issue/' || NEW.id,
    ARRAY_REMOVE(ARRAY[NEW.status::TEXT, NEW.priority::TEXT, v_nc_type], NULL),
    jsonb_build_object('source', NEW.source, 'dueDate', NEW."dueDate");

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 4.12 Gauge Sync
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_gauge_to_search_index()
RETURNS TRIGGER AS $$
DECLARE
  v_table_name TEXT;
  v_gauge_type TEXT;
  v_description TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_table_name := 'searchIndex_' || OLD."companyId";
    EXECUTE format('DELETE FROM %I WHERE "entityType" = $1 AND "entityId" = $2', v_table_name)
      USING 'gauge', OLD.id;
    RETURN OLD;
  END IF;

  v_table_name := 'searchIndex_' || NEW."companyId";

  SELECT name INTO v_gauge_type FROM "gaugeType" WHERE id = NEW."gaugeTypeId";

  v_description := COALESCE(NEW.description, '') || ' ' || COALESCE(NEW."serialNumber", '');

  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "description", "link", "tags", "metadata", "searchVector")
    VALUES ($1, $2, $3, $4, $5, $6, $7, to_tsvector(''english'', $3 || '' '' || $4 || '' '' || COALESCE(array_to_string($6, '' ''), '''')))
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = to_tsvector(''english'', EXCLUDED."title" || '' '' || EXCLUDED."description" || '' '' || COALESCE(array_to_string(EXCLUDED."tags", '' ''), '''')),
      "updatedAt" = NOW()
  ', v_table_name) USING
    'gauge',
    NEW.id,
    NEW."gaugeId",
    v_description,
    '/x/quality/gauges/' || NEW.id,
    ARRAY_REMOVE(ARRAY[NEW."gaugeStatus"::TEXT, NEW."gaugeCalibrationStatus"::TEXT, v_gauge_type], NULL),
    jsonb_build_object('nextCalibrationDate', NEW."nextCalibrationDate", 'serialNumber', NEW."serialNumber");

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- PART 5: Create Entity Table Triggers
-- =============================================================================

-- Employee triggers
CREATE TRIGGER sync_employee_search_insert
  AFTER INSERT ON "employee"
  FOR EACH ROW EXECUTE FUNCTION sync_employee_to_search_index();

CREATE TRIGGER sync_employee_search_update
  AFTER UPDATE ON "employee"
  FOR EACH ROW EXECUTE FUNCTION sync_employee_to_search_index();

CREATE TRIGGER sync_employee_search_delete
  AFTER DELETE ON "employee"
  FOR EACH ROW EXECUTE FUNCTION sync_employee_to_search_index();

-- Customer triggers
CREATE TRIGGER sync_customer_search_insert
  AFTER INSERT ON "customer"
  FOR EACH ROW EXECUTE FUNCTION sync_customer_to_search_index();

CREATE TRIGGER sync_customer_search_update
  AFTER UPDATE ON "customer"
  FOR EACH ROW EXECUTE FUNCTION sync_customer_to_search_index();

CREATE TRIGGER sync_customer_search_delete
  AFTER DELETE ON "customer"
  FOR EACH ROW EXECUTE FUNCTION sync_customer_to_search_index();

-- Supplier triggers
CREATE TRIGGER sync_supplier_search_insert
  AFTER INSERT ON "supplier"
  FOR EACH ROW EXECUTE FUNCTION sync_supplier_to_search_index();

CREATE TRIGGER sync_supplier_search_update
  AFTER UPDATE ON "supplier"
  FOR EACH ROW EXECUTE FUNCTION sync_supplier_to_search_index();

CREATE TRIGGER sync_supplier_search_delete
  AFTER DELETE ON "supplier"
  FOR EACH ROW EXECUTE FUNCTION sync_supplier_to_search_index();

-- Item triggers
CREATE TRIGGER sync_item_search_insert
  AFTER INSERT ON "item"
  FOR EACH ROW EXECUTE FUNCTION sync_item_to_search_index();

CREATE TRIGGER sync_item_search_update
  AFTER UPDATE ON "item"
  FOR EACH ROW EXECUTE FUNCTION sync_item_to_search_index();

CREATE TRIGGER sync_item_search_delete
  AFTER DELETE ON "item"
  FOR EACH ROW EXECUTE FUNCTION sync_item_to_search_index();

-- Job triggers
CREATE TRIGGER sync_job_search_insert
  AFTER INSERT ON "job"
  FOR EACH ROW EXECUTE FUNCTION sync_job_to_search_index();

CREATE TRIGGER sync_job_search_update
  AFTER UPDATE ON "job"
  FOR EACH ROW EXECUTE FUNCTION sync_job_to_search_index();

CREATE TRIGGER sync_job_search_delete
  AFTER DELETE ON "job"
  FOR EACH ROW EXECUTE FUNCTION sync_job_to_search_index();

-- Purchase Order triggers
CREATE TRIGGER sync_purchase_order_search_insert
  AFTER INSERT ON "purchaseOrder"
  FOR EACH ROW EXECUTE FUNCTION sync_purchase_order_to_search_index();

CREATE TRIGGER sync_purchase_order_search_update
  AFTER UPDATE ON "purchaseOrder"
  FOR EACH ROW EXECUTE FUNCTION sync_purchase_order_to_search_index();

CREATE TRIGGER sync_purchase_order_search_delete
  AFTER DELETE ON "purchaseOrder"
  FOR EACH ROW EXECUTE FUNCTION sync_purchase_order_to_search_index();

-- Sales Invoice triggers
CREATE TRIGGER sync_sales_invoice_search_insert
  AFTER INSERT ON "salesInvoice"
  FOR EACH ROW EXECUTE FUNCTION sync_sales_invoice_to_search_index();

CREATE TRIGGER sync_sales_invoice_search_update
  AFTER UPDATE ON "salesInvoice"
  FOR EACH ROW EXECUTE FUNCTION sync_sales_invoice_to_search_index();

CREATE TRIGGER sync_sales_invoice_search_delete
  AFTER DELETE ON "salesInvoice"
  FOR EACH ROW EXECUTE FUNCTION sync_sales_invoice_to_search_index();

-- Purchase Invoice triggers
CREATE TRIGGER sync_purchase_invoice_search_insert
  AFTER INSERT ON "purchaseInvoice"
  FOR EACH ROW EXECUTE FUNCTION sync_purchase_invoice_to_search_index();

CREATE TRIGGER sync_purchase_invoice_search_update
  AFTER UPDATE ON "purchaseInvoice"
  FOR EACH ROW EXECUTE FUNCTION sync_purchase_invoice_to_search_index();

CREATE TRIGGER sync_purchase_invoice_search_delete
  AFTER DELETE ON "purchaseInvoice"
  FOR EACH ROW EXECUTE FUNCTION sync_purchase_invoice_to_search_index();

-- Non-Conformance (Issue) triggers
CREATE TRIGGER sync_non_conformance_search_insert
  AFTER INSERT ON "nonConformance"
  FOR EACH ROW EXECUTE FUNCTION sync_non_conformance_to_search_index();

CREATE TRIGGER sync_non_conformance_search_update
  AFTER UPDATE ON "nonConformance"
  FOR EACH ROW EXECUTE FUNCTION sync_non_conformance_to_search_index();

CREATE TRIGGER sync_non_conformance_search_delete
  AFTER DELETE ON "nonConformance"
  FOR EACH ROW EXECUTE FUNCTION sync_non_conformance_to_search_index();

-- Gauge triggers
CREATE TRIGGER sync_gauge_search_insert
  AFTER INSERT ON "gauge"
  FOR EACH ROW EXECUTE FUNCTION sync_gauge_to_search_index();

CREATE TRIGGER sync_gauge_search_update
  AFTER UPDATE ON "gauge"
  FOR EACH ROW EXECUTE FUNCTION sync_gauge_to_search_index();

CREATE TRIGGER sync_gauge_search_delete
  AFTER DELETE ON "gauge"
  FOR EACH ROW EXECUTE FUNCTION sync_gauge_to_search_index();

-- =============================================================================
-- PART 6: Create Population Function
-- =============================================================================

CREATE OR REPLACE FUNCTION populate_company_search_index(p_company_id TEXT)
RETURNS VOID AS $$
DECLARE
  v_table_name TEXT := 'searchIndex_' || p_company_id;
BEGIN
  -- Populate employees
  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "link", "tags", "metadata", "searchVector")
    SELECT
      ''employee'',
      e.id,
      COALESCE(u."fullName", ''''),
      ''/x/person/'' || e.id,
      ARRAY_REMOVE(ARRAY[et.name], NULL),
      jsonb_build_object(''active'', e.active),
      to_tsvector(''english'', COALESCE(u."fullName", '''') || '' '' || COALESCE(array_to_string(ARRAY_REMOVE(ARRAY[et.name], NULL), '' ''), ''''))
    FROM "employee" e
    INNER JOIN "user" u ON u.id = e.id
    LEFT JOIN "employeeType" et ON et.id = e."employeeTypeId"
    WHERE e."companyId" = $1 AND e.active = true
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = EXCLUDED."searchVector",
      "updatedAt" = NOW()
  ', v_table_name) USING p_company_id;

  -- Populate customers
  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "link", "tags", "metadata", "searchVector")
    SELECT
      ''customer'',
      c.id,
      c.name,
      ''/x/customer/'' || c.id,
      ARRAY_REMOVE(ARRAY[ct.name, cs.name], NULL),
      jsonb_build_object(''taxId'', c."taxId"),
      to_tsvector(''english'', c.name || '' '' || COALESCE(array_to_string(ARRAY_REMOVE(ARRAY[ct.name, cs.name], NULL), '' ''), ''''))
    FROM "customer" c
    LEFT JOIN "customerType" ct ON ct.id = c."customerTypeId"
    LEFT JOIN "customerStatus" cs ON cs.id = c."customerStatusId"
    WHERE c."companyId" = $1
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = EXCLUDED."searchVector",
      "updatedAt" = NOW()
  ', v_table_name) USING p_company_id;

  -- Populate suppliers
  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "link", "tags", "metadata", "searchVector")
    SELECT
      ''supplier'',
      s.id,
      s.name,
      ''/x/supplier/'' || s.id,
      ARRAY_REMOVE(ARRAY[st.name, ss.name], NULL),
      jsonb_build_object(''taxId'', s."taxId"),
      to_tsvector(''english'', s.name || '' '' || COALESCE(array_to_string(ARRAY_REMOVE(ARRAY[st.name, ss.name], NULL), '' ''), ''''))
    FROM "supplier" s
    LEFT JOIN "supplierType" st ON st.id = s."supplierTypeId"
    LEFT JOIN "supplierStatus" ss ON ss.id = s."supplierStatusId"
    WHERE s."companyId" = $1
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = EXCLUDED."searchVector",
      "updatedAt" = NOW()
  ', v_table_name) USING p_company_id;

  -- Populate items
  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "description", "link", "tags", "metadata", "searchVector")
    SELECT
      ''item'',
      i.id,
      i."readableId",
      i.name || '' '' || COALESCE(i.description, ''''),
      CASE i.type
        WHEN ''Part'' THEN ''/x/part/'' || i.id
        WHEN ''Service'' THEN ''/x/service/'' || i.id
        WHEN ''Tool'' THEN ''/x/tool/'' || i.id
        WHEN ''Consumable'' THEN ''/x/consumable/'' || i.id
        WHEN ''Material'' THEN ''/x/material/'' || i.id
        WHEN ''Fixture'' THEN ''/x/fixture/'' || i.id
        ELSE ''/x/part/'' || i.id
      END,
      ARRAY_REMOVE(ARRAY[i.type::TEXT, i."replenishmentSystem"::TEXT], NULL),
      jsonb_build_object(''active'', i.active),
      to_tsvector(''english'', i."readableId" || '' '' || i.name || '' '' || COALESCE(i.description, '''') || '' '' || COALESCE(array_to_string(ARRAY_REMOVE(ARRAY[i.type::TEXT, i."replenishmentSystem"::TEXT], NULL), '' ''), ''''))
    FROM "item" i
    WHERE i."companyId" = $1
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "link" = EXCLUDED."link",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = EXCLUDED."searchVector",
      "updatedAt" = NOW()
  ', v_table_name) USING p_company_id;


  -- Populate jobs
  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "description", "link", "tags", "metadata", "searchVector")
    SELECT
      ''job'',
      j.id,
      j."jobId",
      COALESCE(i.name, '''') || '' '' || COALESCE(c.name, ''''),
      ''/x/job/'' || j.id,
      ARRAY_REMOVE(ARRAY[j.status::TEXT, j."deadlineType"::TEXT], NULL),
      jsonb_build_object(''quantity'', j.quantity, ''dueDate'', j."dueDate"),
      to_tsvector(''english'', j."jobId" || '' '' || COALESCE(i.name, '''') || '' '' || COALESCE(c.name, '''') || '' '' || COALESCE(array_to_string(ARRAY_REMOVE(ARRAY[j.status::TEXT, j."deadlineType"::TEXT], NULL), '' ''), ''''))
    FROM "job" j
    LEFT JOIN "item" i ON i.id = j."itemId"
    LEFT JOIN "customer" c ON c.id = j."customerId"
    WHERE j."companyId" = $1
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = EXCLUDED."searchVector",
      "updatedAt" = NOW()
  ', v_table_name) USING p_company_id;

  -- Populate purchase orders
  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "description", "link", "tags", "metadata", "searchVector")
    SELECT
      ''purchaseOrder'',
      po.id,
      po."purchaseOrderId",
      COALESCE(s.name, ''''),
      ''/x/purchase-order/'' || po.id,
      ARRAY_REMOVE(ARRAY[po.status::TEXT], NULL),
      jsonb_build_object(''orderDate'', po."orderDate", ''supplierReference'', po."supplierReference"),
      to_tsvector(''english'', po."purchaseOrderId" || '' '' || COALESCE(s.name, '''') || '' '' || COALESCE(array_to_string(ARRAY_REMOVE(ARRAY[po.status::TEXT], NULL), '' ''), ''''))
    FROM "purchaseOrder" po
    LEFT JOIN "supplier" s ON s.id = po."supplierId"
    WHERE po."companyId" = $1
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = EXCLUDED."searchVector",
      "updatedAt" = NOW()
  ', v_table_name) USING p_company_id;

  -- Populate sales invoices
  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "description", "link", "tags", "metadata", "searchVector")
    SELECT
      ''salesInvoice'',
      si.id,
      si."invoiceId",
      COALESCE(c.name, ''''),
      ''/x/invoicing/sales/'' || si.id,
      ARRAY_REMOVE(ARRAY[si.status::TEXT], NULL),
      jsonb_build_object(''totalAmount'', si."totalAmount", ''dateDue'', si."dateDue"),
      to_tsvector(''english'', si."invoiceId" || '' '' || COALESCE(c.name, '''') || '' '' || COALESCE(array_to_string(ARRAY_REMOVE(ARRAY[si.status::TEXT], NULL), '' ''), ''''))
    FROM "salesInvoice" si
    LEFT JOIN "customer" c ON c.id = si."customerId"
    WHERE si."companyId" = $1
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = EXCLUDED."searchVector",
      "updatedAt" = NOW()
  ', v_table_name) USING p_company_id;

  -- Populate purchase invoices
  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "description", "link", "tags", "metadata", "searchVector")
    SELECT
      ''purchaseInvoice'',
      pi.id,
      pi."invoiceId",
      COALESCE(s.name, ''''),
      ''/x/invoicing/purchasing/'' || pi.id,
      ARRAY_REMOVE(ARRAY[pi.status::TEXT], NULL),
      jsonb_build_object(''totalAmount'', pi."totalAmount", ''dateDue'', pi."dateDue"),
      to_tsvector(''english'', pi."invoiceId" || '' '' || COALESCE(s.name, '''') || '' '' || COALESCE(array_to_string(ARRAY_REMOVE(ARRAY[pi.status::TEXT], NULL), '' ''), ''''))
    FROM "purchaseInvoice" pi
    LEFT JOIN "supplier" s ON s.id = pi."supplierId"
    WHERE pi."companyId" = $1
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = EXCLUDED."searchVector",
      "updatedAt" = NOW()
  ', v_table_name) USING p_company_id;

  -- Populate non-conformances (issues)
  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "description", "link", "tags", "metadata", "searchVector")
    SELECT
      ''issue'',
      nc.id,
      nc."nonConformanceId",
      nc.name || '' '' || COALESCE(nc.description, ''''),
      ''/x/issue/'' || nc.id,
      ARRAY_REMOVE(ARRAY[nc.status::TEXT, nc.priority::TEXT, nct.name], NULL),
      jsonb_build_object(''source'', nc.source, ''dueDate'', nc."dueDate"),
      to_tsvector(''english'', nc."nonConformanceId" || '' '' || nc.name || '' '' || COALESCE(nc.description, '''') || '' '' || COALESCE(array_to_string(ARRAY_REMOVE(ARRAY[nc.status::TEXT, nc.priority::TEXT, nct.name], NULL), '' ''), ''''))
    FROM "nonConformance" nc
    LEFT JOIN "nonConformanceType" nct ON nct.id = nc."nonConformanceTypeId"
    WHERE nc."companyId" = $1
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = EXCLUDED."searchVector",
      "updatedAt" = NOW()
  ', v_table_name) USING p_company_id;

  -- Populate gauges
  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "description", "link", "tags", "metadata", "searchVector")
    SELECT
      ''gauge'',
      g.id,
      g."gaugeId",
      COALESCE(g.description, '''') || '' '' || COALESCE(g."serialNumber", ''''),
      ''/x/quality/gauges/'' || g.id,
      ARRAY_REMOVE(ARRAY[g."gaugeStatus"::TEXT, g."gaugeCalibrationStatus"::TEXT, gt.name], NULL),
      jsonb_build_object(''nextCalibrationDate'', g."nextCalibrationDate", ''serialNumber'', g."serialNumber"),
      to_tsvector(''english'', g."gaugeId" || '' '' || COALESCE(g.description, '''') || '' '' || COALESCE(g."serialNumber", '''') || '' '' || COALESCE(array_to_string(ARRAY_REMOVE(ARRAY[g."gaugeStatus"::TEXT, g."gaugeCalibrationStatus"::TEXT, gt.name], NULL), '' ''), ''''))
    FROM "gauge" g
    LEFT JOIN "gaugeType" gt ON gt.id = g."gaugeTypeId"
    WHERE g."companyId" = $1
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = EXCLUDED."searchVector",
      "updatedAt" = NOW()
  ', v_table_name) USING p_company_id;

  -- Update registry
  UPDATE "searchIndexRegistry"
  SET "lastRebuiltAt" = NOW()
  WHERE "companyId" = p_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- PART 7: Create Search Function for API
-- =============================================================================

CREATE OR REPLACE FUNCTION search_company_index(
  p_company_id TEXT,
  p_query TEXT,
  p_entity_types TEXT[],
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id BIGINT,
  "entityType" TEXT,
  "entityId" TEXT,
  title TEXT,
  description TEXT,
  link TEXT,
  tags TEXT[],
  metadata JSONB
) AS $$
DECLARE
  v_table_name TEXT;
  v_like_pattern TEXT;
BEGIN
  v_table_name := 'searchIndex_' || p_company_id;
  v_like_pattern := '%' || p_query || '%';

  RETURN QUERY EXECUTE format('
    SELECT
      si.id,
      si."entityType",
      si."entityId",
      si.title,
      si.description,
      si.link,
      si.tags,
      si.metadata
    FROM %I si
    WHERE (
      si.title ILIKE $1
      OR si.description ILIKE $1
      OR si."searchVector" @@ websearch_to_tsquery(''english'', $2)
    )
      AND si."entityType" = ANY($3)
    ORDER BY
      -- Prefix match on title first (starts with query)
      CASE WHEN lower(si.title) LIKE lower($4) THEN 0 ELSE 1 END,
      -- Contains match in title
      CASE WHEN si.title ILIKE $1 THEN 0 ELSE 1 END,
      -- Then by recency (higher id = more recent)
      si.id DESC
    LIMIT $5
  ', v_table_name)
  USING v_like_pattern, p_query, p_entity_types, p_query || '%', p_limit;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- =============================================================================
-- PART 8: Create Search Indexes for Existing Companies and Populate Data
-- =============================================================================

DO $$
DECLARE
  company_record RECORD;
BEGIN
  FOR company_record IN SELECT id FROM "company"
  LOOP
    PERFORM create_company_search_index(company_record.id);
    PERFORM populate_company_search_index(company_record.id);
  END LOOP;
END $$;
