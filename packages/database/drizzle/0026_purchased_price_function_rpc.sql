CREATE OR REPLACE FUNCTION update_purchased_prices(
  p_source text,
  p_purchase_order_id text DEFAULT NULL,
  p_invoice_id text DEFAULT NULL,
  p_company_id text DEFAULT NULL,
  p_update_prices boolean DEFAULT true,
  p_update_lead_times boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_supplier_id text;
  v_line record;
  v_existing_supplier_part_id text;
  v_cost_quantity numeric;
  v_cost_amount numeric;
  v_lead_quantity numeric;
  v_lead_weighted numeric;
  v_updated_item_costs integer := 0;
  v_updated_item_replenishments integer := 0;
  v_inserted_supplier_parts integer := 0;
  v_updated_supplier_parts integer := 0;
  v_updated_job_operations integer := 0;
  v_inserted_cost_ledgers integer := 0;
  v_rows integer := 0;
  v_actor_id text;
BEGIN
  IF p_company_id IS NULL OR p_company_id = '' THEN
    RAISE EXCEPTION 'companyId is required';
  END IF;

  IF session_user = 'carbon_app'
     AND NOT (p_company_id = ANY(app_companies_for_context())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  DROP TABLE IF EXISTS pg_temp.purchased_price_lines;
  CREATE TEMP TABLE pg_temp.purchased_price_lines (
    item_id text,
    job_operation_id text,
    unit_price numeric,
    quantity numeric,
    conversion_factor numeric,
    purchase_unit_of_measure_code text
  ) ON COMMIT DROP;

  SELECT COALESCE(
    NULLIF(app_uid(), ''),
    (SELECT id FROM "user" WHERE id = 'system' LIMIT 1),
    (
      SELECT "userId"
      FROM "userToCompany"
      WHERE "companyId" = p_company_id
      ORDER BY "userId"
      LIMIT 1
    ),
    (SELECT id FROM "user" ORDER BY "createdAt" NULLS LAST LIMIT 1)
  )
  INTO v_actor_id;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No user is available for purchased price audit fields';
  END IF;

  CASE p_source
    WHEN 'purchaseOrder' THEN
      IF p_purchase_order_id IS NULL OR p_purchase_order_id = '' THEN
        RAISE EXCEPTION 'purchaseOrderId is required';
      END IF;

      SELECT "supplierId"
      INTO v_supplier_id
      FROM "purchaseOrder"
      WHERE id = p_purchase_order_id
        AND "companyId" = p_company_id;

      IF v_supplier_id IS NULL THEN
        RAISE EXCEPTION 'Purchase order has no supplier';
      END IF;

      INSERT INTO pg_temp.purchased_price_lines (
        item_id,
        job_operation_id,
        unit_price,
        quantity,
        conversion_factor,
        purchase_unit_of_measure_code
      )
      SELECT
        "itemId",
        NULL,
        COALESCE("unitPrice", 0),
        COALESCE("purchaseQuantity", 0) * COALESCE("conversionFactor", 1),
        "conversionFactor",
        "purchaseUnitOfMeasureCode"
      FROM "purchaseOrderLine"
      WHERE "purchaseOrderId" = p_purchase_order_id
        AND "companyId" = p_company_id
        AND COALESCE("purchaseQuantity", 0) * COALESCE("conversionFactor", 1) > 0;

      IF COALESCE(p_update_prices, true) THEN
        DELETE FROM "costLedger"
        WHERE "documentType" = to_jsonb('Purchase Order'::text)
          AND "documentId" = p_purchase_order_id
          AND "companyId" = p_company_id;

        FOR v_line IN
          SELECT *
          FROM pg_temp.purchased_price_lines
          WHERE item_id IS NOT NULL
            AND COALESCE(unit_price, 0) <> 0
        LOOP
          INSERT INTO "costLedger" (
            id,
            "entryNumber",
            "itemLedgerType",
            "costLedgerType",
            adjustment,
            "documentType",
            "documentId",
            "itemId",
            quantity,
            cost,
            "nominalCost",
            "remainingQuantity",
            "supplierId",
            "postingDate",
            "createdAt",
            "companyId"
          )
          VALUES (
            nanoid(),
            next_cost_ledger_entry_number(p_company_id),
            'Purchase',
            'Direct Cost',
            false,
            to_jsonb('Purchase Order'::text),
            p_purchase_order_id,
            v_line.item_id,
            v_line.quantity,
            v_line.quantity * v_line.unit_price,
            v_line.quantity * v_line.unit_price,
            v_line.quantity,
            v_supplier_id,
            CURRENT_DATE,
            NOW(),
            p_company_id
          );

          v_inserted_cost_ledgers := v_inserted_cost_ledgers + 1;
        END LOOP;
      END IF;

    WHEN 'purchaseInvoice' THEN
      IF p_invoice_id IS NULL OR p_invoice_id = '' THEN
        RAISE EXCEPTION 'invoiceId is required';
      END IF;

      SELECT "supplierId"
      INTO v_supplier_id
      FROM "purchaseInvoice"
      WHERE id = p_invoice_id
        AND "companyId" = p_company_id;

      IF v_supplier_id IS NULL THEN
        RAISE EXCEPTION 'Purchase invoice has no supplier';
      END IF;

      INSERT INTO pg_temp.purchased_price_lines (
        item_id,
        job_operation_id,
        unit_price,
        quantity,
        conversion_factor,
        purchase_unit_of_measure_code
      )
      SELECT
        "itemId",
        "jobOperationId",
        COALESCE("unitPrice", 0),
        COALESCE(quantity, 0) * COALESCE("conversionFactor", 1),
        "conversionFactor",
        "purchaseUnitOfMeasureCode"
      FROM "purchaseInvoiceLine"
      WHERE "invoiceId" = p_invoice_id
        AND "companyId" = p_company_id
        AND COALESCE(quantity, 0) * COALESCE("conversionFactor", 1) > 0;

    ELSE
      RAISE EXCEPTION 'Invalid source: %', p_source;
  END CASE;

  FOR v_line IN
    SELECT DISTINCT ON (item_id)
      item_id,
      unit_price,
      conversion_factor,
      purchase_unit_of_measure_code
    FROM pg_temp.purchased_price_lines
    WHERE item_id IS NOT NULL
      AND job_operation_id IS NULL
    ORDER BY item_id, unit_price DESC
  LOOP
    SELECT
      SUM(quantity),
      SUM(cost)
    INTO v_cost_quantity, v_cost_amount
    FROM "costLedger"
    WHERE "itemId" = v_line.item_id
      AND "companyId" = p_company_id
      AND "postingDate" >= (CURRENT_DATE - INTERVAL '1 year')::date;

    SELECT
      SUM(history.quantity),
      SUM(history.weighted_lead_time)
    INTO v_lead_quantity, v_lead_weighted
    FROM (
      SELECT
        ABS(COALESCE(rl."receivedQuantity", 0) / COALESCE(NULLIF(rl."conversionFactor", 0), 1)) AS quantity,
        GREATEST(COALESCE(r."postingDate" - po."orderDate", 0), 0)
          * ABS(COALESCE(rl."receivedQuantity", 0) / COALESCE(NULLIF(rl."conversionFactor", 0), 1)) AS weighted_lead_time
      FROM "receipt" r
      INNER JOIN "receiptLine" rl ON rl."receiptId" = r.id
      INNER JOIN "purchaseOrder" po ON po.id = r."sourceDocumentId"
      WHERE r."companyId" = p_company_id
        AND rl."companyId" = p_company_id
        AND po."companyId" = p_company_id
        AND r."sourceDocument" = to_jsonb('Purchase Order'::text)
        AND r."postingDate" >= (CURRENT_DATE - INTERVAL '1 year')::date
        AND r."postingDate" IS NOT NULL
        AND po."orderDate" IS NOT NULL
        AND rl."itemId" = v_line.item_id
    ) history;

    IF COALESCE(p_update_prices, true)
       AND COALESCE(v_line.unit_price, 0) <> 0
       AND COALESCE(v_cost_quantity, 0) <> 0 THEN
      UPDATE "itemCost"
      SET
        "unitCost" = v_cost_amount / v_cost_quantity,
        "updatedBy" = v_actor_id,
        "updatedAt" = NOW()
      WHERE "itemId" = v_line.item_id
        AND "companyId" = p_company_id;

      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_updated_item_costs := v_updated_item_costs + v_rows;

      SELECT id
      INTO v_existing_supplier_part_id
      FROM "supplierPart"
      WHERE "itemId" = v_line.item_id
        AND "supplierId" = v_supplier_id
        AND "companyId" = p_company_id
      LIMIT 1;

      IF v_existing_supplier_part_id IS NULL THEN
        INSERT INTO "supplierPart" (
          id,
          active,
          "itemId",
          "supplierId",
          "unitPrice",
          "conversionFactor",
          "supplierUnitOfMeasureCode",
          "createdAt",
          "createdBy",
          "companyId"
        )
        VALUES (
          nanoid(),
          true,
          v_line.item_id,
          v_supplier_id,
          v_line.unit_price,
          COALESCE(v_line.conversion_factor, 1),
          v_line.purchase_unit_of_measure_code,
          NOW(),
          v_actor_id,
          p_company_id
        );

        v_inserted_supplier_parts := v_inserted_supplier_parts + 1;
      ELSE
        UPDATE "supplierPart"
        SET
          "unitPrice" = v_line.unit_price,
          "conversionFactor" = COALESCE(v_line.conversion_factor, 1),
          "supplierUnitOfMeasureCode" = v_line.purchase_unit_of_measure_code,
          "updatedBy" = v_actor_id,
          "updatedAt" = NOW()
        WHERE id = v_existing_supplier_part_id;

        v_updated_supplier_parts := v_updated_supplier_parts + 1;
      END IF;
    END IF;

    IF COALESCE(p_update_prices, true)
       OR (COALESCE(p_update_lead_times, false) AND COALESCE(v_lead_quantity, 0) > 0) THEN
      UPDATE "itemReplenishment"
      SET
        "preferredSupplierId" = CASE
          WHEN COALESCE(p_update_prices, true) THEN v_supplier_id
          ELSE "preferredSupplierId"
        END,
        "purchasingUnitOfMeasureCode" = CASE
          WHEN COALESCE(p_update_prices, true) THEN v_line.purchase_unit_of_measure_code
          ELSE "purchasingUnitOfMeasureCode"
        END,
        "conversionFactor" = CASE
          WHEN COALESCE(p_update_prices, true) THEN COALESCE(v_line.conversion_factor, 1)
          ELSE "conversionFactor"
        END,
        "leadTime" = CASE
          WHEN COALESCE(p_update_lead_times, false) AND COALESCE(v_lead_quantity, 0) > 0
            THEN ROUND(v_lead_weighted / v_lead_quantity)
          ELSE "leadTime"
        END,
        "updatedBy" = v_actor_id,
        "updatedAt" = NOW()
      WHERE "itemId" = v_line.item_id
        AND "companyId" = p_company_id;

      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_updated_item_replenishments := v_updated_item_replenishments + v_rows;
    END IF;
  END LOOP;

  IF COALESCE(p_update_prices, true) THEN
    FOR v_line IN
      SELECT DISTINCT ON (job_operation_id)
        job_operation_id,
        unit_price
      FROM pg_temp.purchased_price_lines
      WHERE job_operation_id IS NOT NULL
        AND COALESCE(unit_price, 0) <> 0
      ORDER BY job_operation_id
    LOOP
      UPDATE "jobOperation"
      SET
        "operationMinimumCost" = 0,
        "operationUnitCost" = v_line.unit_price,
        "updatedBy" = v_actor_id,
        "updatedAt" = NOW()
      WHERE id = v_line.job_operation_id
        AND "companyId" = p_company_id;

      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_updated_job_operations := v_updated_job_operations + v_rows;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'insertedCostLedgers', v_inserted_cost_ledgers,
    'updatedItemCosts', v_updated_item_costs,
    'updatedItemReplenishments', v_updated_item_replenishments,
    'insertedSupplierParts', v_inserted_supplier_parts,
    'updatedSupplierParts', v_updated_supplier_parts,
    'updatedJobOperations', v_updated_job_operations
  );
END;
$$;
