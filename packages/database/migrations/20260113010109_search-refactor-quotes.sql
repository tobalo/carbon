-- =============================================================================
-- Search Index Refactor: Add Missing Entities (Quote, Sales RFQ, Sales Order, Supplier Quote)
-- =============================================================================

-- =============================================================================
-- PART 1: Sync Functions
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1.1 Quote Sync
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_quote_to_search_index()
RETURNS TRIGGER AS $$
DECLARE
  v_table_name TEXT;
  v_cust_name TEXT;
  v_description TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_table_name := 'searchIndex_' || OLD."companyId";
    EXECUTE format('DELETE FROM %I WHERE "entityType" = $1 AND "entityId" = $2', v_table_name)
      USING 'quote', OLD.id;
    RETURN OLD;
  END IF;

  v_table_name := 'searchIndex_' || NEW."companyId";

  SELECT name INTO v_cust_name FROM "customer" WHERE id = NEW."customerId";

  v_description := COALESCE(v_cust_name, '') || ' ' || COALESCE(NEW."customerReference", '');

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
    'quote',
    NEW.id,
    NEW."quoteId",
    v_description,
    '/x/quote/' || NEW.id,
    ARRAY_REMOVE(ARRAY[NEW.status::TEXT], NULL),
    jsonb_build_object('customerId', NEW."customerId", 'expirationDate', NEW."expirationDate", 'customerReference', NEW."customerReference");

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 1.2 Sales RFQ Sync
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_sales_rfq_to_search_index()
RETURNS TRIGGER AS $$
DECLARE
  v_table_name TEXT;
  v_cust_name TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_table_name := 'searchIndex_' || OLD."companyId";
    EXECUTE format('DELETE FROM %I WHERE "entityType" = $1 AND "entityId" = $2', v_table_name)
      USING 'salesRfq', OLD.id;
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
    'salesRfq',
    NEW.id,
    NEW."rfqId",
    COALESCE(v_cust_name, ''),
    '/x/rfq/' || NEW.id,
    ARRAY_REMOVE(ARRAY[NEW.status::TEXT], NULL),
    jsonb_build_object('customerId', NEW."customerId", 'expirationDate', NEW."expirationDate");

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 1.3 Sales Order Sync
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_sales_order_to_search_index()
RETURNS TRIGGER AS $$
DECLARE
  v_table_name TEXT;
  v_cust_name TEXT;
  v_description TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_table_name := 'searchIndex_' || OLD."companyId";
    EXECUTE format('DELETE FROM %I WHERE "entityType" = $1 AND "entityId" = $2', v_table_name)
      USING 'salesOrder', OLD.id;
    RETURN OLD;
  END IF;

  v_table_name := 'searchIndex_' || NEW."companyId";

  SELECT name INTO v_cust_name FROM "customer" WHERE id = NEW."customerId";

  v_description := COALESCE(v_cust_name, '') || ' ' || COALESCE(NEW."customerReference", '');

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
    'salesOrder',
    NEW.id,
    NEW."salesOrderId",
    v_description,
    '/x/sales-order/' || NEW.id,
    ARRAY_REMOVE(ARRAY[NEW.status::TEXT], NULL),
    jsonb_build_object('customerId', NEW."customerId", 'orderDate', NEW."orderDate", 'customerReference', NEW."customerReference");

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 1.4 Supplier Quote Sync
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_supplier_quote_to_search_index()
RETURNS TRIGGER AS $$
DECLARE
  v_table_name TEXT;
  v_supp_name TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_table_name := 'searchIndex_' || OLD."companyId";
    EXECUTE format('DELETE FROM %I WHERE "entityType" = $1 AND "entityId" = $2', v_table_name)
      USING 'supplierQuote', OLD.id;
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
    'supplierQuote',
    NEW.id,
    NEW."supplierQuoteId",
    COALESCE(v_supp_name, ''),
    '/x/supplier-quote/' || NEW.id,
    ARRAY_REMOVE(ARRAY[NEW.status::TEXT], NULL),
    jsonb_build_object('supplierId', NEW."supplierId", 'expirationDate', NEW."expirationDate");

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- PART 2: Create Entity Table Triggers
-- =============================================================================

-- Quote triggers
CREATE TRIGGER sync_quote_search_insert
  AFTER INSERT ON "quote"
  FOR EACH ROW EXECUTE FUNCTION sync_quote_to_search_index();

CREATE TRIGGER sync_quote_search_update
  AFTER UPDATE ON "quote"
  FOR EACH ROW EXECUTE FUNCTION sync_quote_to_search_index();

CREATE TRIGGER sync_quote_search_delete
  AFTER DELETE ON "quote"
  FOR EACH ROW EXECUTE FUNCTION sync_quote_to_search_index();

-- Sales RFQ triggers
CREATE TRIGGER sync_sales_rfq_search_insert
  AFTER INSERT ON "salesRfq"
  FOR EACH ROW EXECUTE FUNCTION sync_sales_rfq_to_search_index();

CREATE TRIGGER sync_sales_rfq_search_update
  AFTER UPDATE ON "salesRfq"
  FOR EACH ROW EXECUTE FUNCTION sync_sales_rfq_to_search_index();

CREATE TRIGGER sync_sales_rfq_search_delete
  AFTER DELETE ON "salesRfq"
  FOR EACH ROW EXECUTE FUNCTION sync_sales_rfq_to_search_index();

-- Sales Order triggers
CREATE TRIGGER sync_sales_order_search_insert
  AFTER INSERT ON "salesOrder"
  FOR EACH ROW EXECUTE FUNCTION sync_sales_order_to_search_index();

CREATE TRIGGER sync_sales_order_search_update
  AFTER UPDATE ON "salesOrder"
  FOR EACH ROW EXECUTE FUNCTION sync_sales_order_to_search_index();

CREATE TRIGGER sync_sales_order_search_delete
  AFTER DELETE ON "salesOrder"
  FOR EACH ROW EXECUTE FUNCTION sync_sales_order_to_search_index();

-- Supplier Quote triggers
CREATE TRIGGER sync_supplier_quote_search_insert
  AFTER INSERT ON "supplierQuote"
  FOR EACH ROW EXECUTE FUNCTION sync_supplier_quote_to_search_index();

CREATE TRIGGER sync_supplier_quote_search_update
  AFTER UPDATE ON "supplierQuote"
  FOR EACH ROW EXECUTE FUNCTION sync_supplier_quote_to_search_index();

CREATE TRIGGER sync_supplier_quote_search_delete
  AFTER DELETE ON "supplierQuote"
  FOR EACH ROW EXECUTE FUNCTION sync_supplier_quote_to_search_index();

-- =============================================================================
-- PART 3: Population Function for Sales Entities
-- =============================================================================

CREATE OR REPLACE FUNCTION populate_sales_search_results(p_company_id TEXT)
RETURNS VOID AS $$
DECLARE
  v_table_name TEXT := 'searchIndex_' || p_company_id;
BEGIN
  -- Populate quotes
  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "description", "link", "tags", "metadata", "searchVector")
    SELECT
      ''quote'',
      q.id,
      q."quoteId",
      COALESCE(c.name, '''') || '' '' || COALESCE(q."customerReference", ''''),
      ''/x/quote/'' || q.id,
      ARRAY_REMOVE(ARRAY[q.status::TEXT], NULL),
      jsonb_build_object(''customerId'', q."customerId", ''expirationDate'', q."expirationDate", ''customerReference'', q."customerReference"),
      to_tsvector(''english'', q."quoteId" || '' '' || COALESCE(c.name, '''') || '' '' || COALESCE(q."customerReference", '''') || '' '' || COALESCE(array_to_string(ARRAY_REMOVE(ARRAY[q.status::TEXT], NULL), '' ''), ''''))
    FROM "quote" q
    LEFT JOIN "customer" c ON c.id = q."customerId"
    WHERE q."companyId" = $1
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = EXCLUDED."searchVector",
      "updatedAt" = NOW()
  ', v_table_name) USING p_company_id;

  -- Populate sales RFQs
  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "description", "link", "tags", "metadata", "searchVector")
    SELECT
      ''salesRfq'',
      r.id,
      r."rfqId",
      COALESCE(c.name, ''''),
      ''/x/rfq/'' || r.id,
      ARRAY_REMOVE(ARRAY[r.status::TEXT], NULL),
      jsonb_build_object(''customerId'', r."customerId", ''expirationDate'', r."expirationDate"),
      to_tsvector(''english'', r."rfqId" || '' '' || COALESCE(c.name, '''') || '' '' || COALESCE(array_to_string(ARRAY_REMOVE(ARRAY[r.status::TEXT], NULL), '' ''), ''''))
    FROM "salesRfq" r
    LEFT JOIN "customer" c ON c.id = r."customerId"
    WHERE r."companyId" = $1
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = EXCLUDED."searchVector",
      "updatedAt" = NOW()
  ', v_table_name) USING p_company_id;

  -- Populate sales orders
  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "description", "link", "tags", "metadata", "searchVector")
    SELECT
      ''salesOrder'',
      so.id,
      so."salesOrderId",
      COALESCE(c.name, '''') || '' '' || COALESCE(so."customerReference", ''''),
      ''/x/sales-order/'' || so.id,
      ARRAY_REMOVE(ARRAY[so.status::TEXT], NULL),
      jsonb_build_object(''customerId'', so."customerId", ''orderDate'', so."orderDate", ''customerReference'', so."customerReference"),
      to_tsvector(''english'', so."salesOrderId" || '' '' || COALESCE(c.name, '''') || '' '' || COALESCE(so."customerReference", '''') || '' '' || COALESCE(array_to_string(ARRAY_REMOVE(ARRAY[so.status::TEXT], NULL), '' ''), ''''))
    FROM "salesOrder" so
    LEFT JOIN "customer" c ON c.id = so."customerId"
    WHERE so."companyId" = $1
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = EXCLUDED."searchVector",
      "updatedAt" = NOW()
  ', v_table_name) USING p_company_id;

  -- Populate supplier quotes
  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "description", "link", "tags", "metadata", "searchVector")
    SELECT
      ''supplierQuote'',
      sq.id,
      sq."supplierQuoteId",
      COALESCE(s.name, ''''),
      ''/x/supplier-quote/'' || sq.id,
      ARRAY_REMOVE(ARRAY[sq.status::TEXT], NULL),
      jsonb_build_object(''supplierId'', sq."supplierId", ''expirationDate'', sq."expirationDate"),
      to_tsvector(''english'', sq."supplierQuoteId" || '' '' || COALESCE(s.name, '''') || '' '' || COALESCE(array_to_string(ARRAY_REMOVE(ARRAY[sq.status::TEXT], NULL), '' ''), ''''))
    FROM "supplierQuote" sq
    LEFT JOIN "supplier" s ON s.id = sq."supplierId"
    WHERE sq."companyId" = $1
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = EXCLUDED."searchVector",
      "updatedAt" = NOW()
  ', v_table_name) USING p_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- PART 4: Populate Existing Data for New Entity Types
-- =============================================================================

DO $$
DECLARE
  company_record RECORD;
BEGIN
  FOR company_record IN SELECT id FROM "company"
  LOOP
    PERFORM populate_sales_search_results(company_record.id);
  END LOOP;
END $$;
