CREATE OR REPLACE FUNCTION nanoid_optimized(
  size int,
  alphabet text,
  mask int,
  step int
)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY INVOKER PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  id_builder text := '';
  counter int := 0;
  bytes bytea;
  alphabet_index int;
  alphabet_array text[];
  alphabet_length int := 64;
BEGIN
  alphabet_array := regexp_split_to_array(alphabet, '');
  alphabet_length := array_length(alphabet_array, 1);

  LOOP
    bytes := gen_random_bytes(step);
    FOR counter IN 0..step - 1 LOOP
      alphabet_index := (get_byte(bytes, counter) & mask) + 1;
      IF alphabet_index <= alphabet_length THEN
        id_builder := id_builder || alphabet_array[alphabet_index];
        IF length(id_builder) = size THEN
          RETURN id_builder;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION nanoid(
  prefix text DEFAULT '',
  size int DEFAULT 21,
  alphabet text DEFAULT '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
  additional_bytes_factor float DEFAULT 1.02
)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY INVOKER PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  alphabet_array text[];
  alphabet_length int := 64;
  mask int := 63;
  step int := 34;
  final_id text;
  adjusted_size int;
BEGIN
  IF size IS NULL OR size < 1 THEN
    RAISE EXCEPTION 'The size must be defined and greater than 0!';
  END IF;

  IF alphabet IS NULL OR length(alphabet) = 0 OR length(alphabet) > 255 THEN
    RAISE EXCEPTION 'The alphabet can''t be undefined, zero or bigger than 255 symbols!';
  END IF;

  IF additional_bytes_factor IS NULL OR additional_bytes_factor < 1 THEN
    RAISE EXCEPTION 'The additional bytes factor can''t be less than 1!';
  END IF;

  adjusted_size := size - length(prefix);
  IF adjusted_size < 1 THEN
    RAISE EXCEPTION 'The size including the prefix must be greater than 0!';
  END IF;

  alphabet_array := regexp_split_to_array(alphabet, '');
  alphabet_length := array_length(alphabet_array, 1);
  mask := (2 << cast(floor(log(alphabet_length - 1) / log(2)) AS int)) - 1;
  step := cast(ceil(additional_bytes_factor * mask * adjusted_size / alphabet_length) AS int);

  IF step > 1024 THEN
    step := 1024;
  END IF;

  final_id := prefix || nanoid_optimized(adjusted_size, alphabet, mask, step);
  RETURN final_id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION resolve_shelf_life_start_for_receipt(
  p_item_id text,
  p_receipt_id text,
  p_company_id text
)
RETURNS date
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_mode "shelfLifeMode";
  v_days numeric;
  v_anchor date;
BEGIN
  SELECT "mode", "days"
  INTO v_mode, v_days
  FROM "itemShelfLife"
  WHERE "itemId" = p_item_id
    AND "companyId" = p_company_id;

  IF NOT FOUND OR v_mode <> 'Fixed Duration' OR v_days IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE("postingDate", CURRENT_DATE)
  INTO v_anchor
  FROM "receipt"
  WHERE id = p_receipt_id
    AND "companyId" = p_company_id;

  RETURN (v_anchor + (v_days || ' days')::interval)::date;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION update_receipt_line_batch_tracking(
  p_company_id text,
  p_receipt_line_id text,
  p_receipt_id text,
  p_batch_number text,
  p_quantity numeric,
  p_tracked_entity_id text DEFAULT NULL,
  p_properties jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tracked_entity_id text;
  v_item_id text;
  v_item_readable_id text;
  v_company_id text;
  v_created_by text;
  v_supplier_id text;
  v_attributes jsonb;
  v_resolved_expiry date;
  v_expiration_date date;
  v_rows integer;
BEGIN
  IF p_company_id IS NULL OR p_company_id = '' THEN
    RAISE EXCEPTION 'companyId is required';
  END IF;

  IF session_user = 'carbon_app'
     AND NOT (p_company_id = ANY(app_companies_for_context())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_receipt_line_id));

  SELECT
    rl."itemId",
    i."readableIdWithRevision",
    rl."companyId",
    rl."createdBy",
    r."supplierId"
  INTO
    v_item_id,
    v_item_readable_id,
    v_company_id,
    v_created_by,
    v_supplier_id
  FROM "receiptLine" rl
  JOIN "receipt" r
    ON r.id = rl."receiptId"
    AND r."companyId" = p_company_id
    AND r.id = p_receipt_id
  JOIN "item" i
    ON i.id = rl."itemId"
    AND i."companyId" = p_company_id
  WHERE rl.id = p_receipt_line_id
    AND rl."companyId" = p_company_id
    AND rl."receiptId" = p_receipt_id;

  IF v_item_id IS NULL THEN
    RAISE EXCEPTION 'Receipt line not found for company';
  END IF;

  IF p_tracked_entity_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM "trackedEntity"
      WHERE id = p_tracked_entity_id
        AND "companyId" <> p_company_id
    ) THEN
      RAISE EXCEPTION 'Tracked entity belongs to a different company';
    END IF;

    v_tracked_entity_id := p_tracked_entity_id;
  ELSE
    SELECT id
    INTO v_tracked_entity_id
    FROM "trackedEntity"
    WHERE attributes->>'Receipt Line' = p_receipt_line_id
      AND "companyId" = v_company_id
    LIMIT 1;

    IF v_tracked_entity_id IS NULL THEN
      v_tracked_entity_id := nanoid();
    END IF;
  END IF;

  v_attributes := jsonb_build_object(
    'Receipt Line', p_receipt_line_id,
    'Receipt', p_receipt_id
  );

  IF v_supplier_id IS NOT NULL THEN
    v_attributes := v_attributes || jsonb_build_object('Supplier', v_supplier_id);
  END IF;

  IF p_properties ? 'expirationDate' THEN
    BEGIN
      v_expiration_date := (p_properties->>'expirationDate')::date;
    EXCEPTION WHEN OTHERS THEN
      v_expiration_date := NULL;
    END;
    v_attributes := v_attributes || (p_properties - 'expirationDate');
  ELSE
    v_attributes := v_attributes || p_properties;
  END IF;

  IF v_expiration_date IS NULL THEN
    v_resolved_expiry := resolve_shelf_life_start_for_receipt(v_item_id, p_receipt_id, p_company_id);
    IF v_resolved_expiry IS NOT NULL THEN
      v_expiration_date := v_resolved_expiry;
    END IF;
  END IF;

  INSERT INTO "trackedEntity" (
    "id",
    "quantity",
    "status",
    "sourceDocument",
    "sourceDocumentId",
    "sourceDocumentReadableId",
    "readableId",
    "attributes",
    "companyId",
    "createdBy",
    "createdAt",
    "itemId",
    "expirationDate"
  )
  VALUES (
    v_tracked_entity_id,
    p_quantity,
    'On Hold',
    'Item',
    v_item_id,
    v_item_readable_id,
    p_batch_number,
    v_attributes,
    v_company_id,
    v_created_by,
    NOW(),
    v_item_id,
    v_expiration_date
  )
  ON CONFLICT (id) DO UPDATE SET
    "quantity" = EXCLUDED."quantity",
    "readableId" = EXCLUDED."readableId",
    "attributes" = EXCLUDED."attributes",
    "itemId" = EXCLUDED."itemId",
    "expirationDate" = COALESCE(EXCLUDED."expirationDate", "trackedEntity"."expirationDate")
  WHERE "trackedEntity"."companyId" = p_company_id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION update_receipt_line_serial_tracking(
  p_company_id text,
  p_receipt_line_id text,
  p_receipt_id text,
  p_serial_number text,
  p_index integer,
  p_tracked_entity_id text DEFAULT NULL,
  p_expiry_date text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item_id text;
  v_item_readable_id text;
  v_company_id text;
  v_created_by text;
  v_supplier_id text;
  v_attributes jsonb;
  v_resolved_expiry date;
  v_expiration_date date;
  v_rows integer;
BEGIN
  IF p_company_id IS NULL OR p_company_id = '' THEN
    RAISE EXCEPTION 'companyId is required';
  END IF;

  IF session_user = 'carbon_app'
     AND NOT (p_company_id = ANY(app_companies_for_context())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT
    rl."itemId",
    i."readableIdWithRevision",
    rl."companyId",
    rl."createdBy",
    r."supplierId"
  INTO
    v_item_id,
    v_item_readable_id,
    v_company_id,
    v_created_by,
    v_supplier_id
  FROM "receiptLine" rl
  JOIN "receipt" r
    ON r.id = rl."receiptId"
    AND r."companyId" = p_company_id
    AND r.id = p_receipt_id
  JOIN "item" i
    ON i.id = rl."itemId"
    AND i."companyId" = p_company_id
  WHERE rl.id = p_receipt_line_id
    AND rl."companyId" = p_company_id
    AND rl."receiptId" = p_receipt_id;

  IF v_item_id IS NULL THEN
    RAISE EXCEPTION 'Receipt line not found for company';
  END IF;

  IF p_tracked_entity_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM "trackedEntity"
    WHERE id = p_tracked_entity_id
      AND "companyId" <> p_company_id
  ) THEN
    RAISE EXCEPTION 'Tracked entity belongs to a different company';
  END IF;

  v_attributes := jsonb_build_object(
    'Receipt Line', p_receipt_line_id,
    'Receipt', p_receipt_id,
    'Receipt Line Index', p_index
  );

  IF v_supplier_id IS NOT NULL THEN
    v_attributes := v_attributes || jsonb_build_object('Supplier', v_supplier_id);
  END IF;

  IF p_expiry_date IS NOT NULL AND p_expiry_date <> '' THEN
    BEGIN
      v_expiration_date := p_expiry_date::date;
    EXCEPTION WHEN OTHERS THEN
      v_expiration_date := NULL;
    END;
  ELSE
    v_resolved_expiry := resolve_shelf_life_start_for_receipt(v_item_id, p_receipt_id, p_company_id);
    IF v_resolved_expiry IS NOT NULL THEN
      v_expiration_date := v_resolved_expiry;
    END IF;
  END IF;

  IF p_tracked_entity_id IS NULL THEN
    INSERT INTO "trackedEntity" (
      "id",
      "quantity",
      "status",
      "sourceDocument",
      "sourceDocumentId",
      "sourceDocumentReadableId",
      "readableId",
      "attributes",
      "companyId",
      "createdBy",
      "createdAt",
      "itemId",
      "expirationDate"
    )
    VALUES (
      nanoid(),
      1,
      'On Hold',
      'Item',
      v_item_id,
      v_item_readable_id,
      p_serial_number,
      v_attributes,
      v_company_id,
      v_created_by,
      NOW(),
      v_item_id,
      v_expiration_date
    );
  ELSE
    UPDATE "trackedEntity"
    SET
      "readableId" = p_serial_number,
      "attributes" = v_attributes,
      "sourceDocumentReadableId" = v_item_readable_id,
      "itemId" = v_item_id,
      "expirationDate" = COALESCE(v_expiration_date, "expirationDate")
    WHERE id = p_tracked_entity_id
      AND "companyId" = p_company_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'Tracked entity not found for company';
    END IF;
  END IF;
END;
$$;
