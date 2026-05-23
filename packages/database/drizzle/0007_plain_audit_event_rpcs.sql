DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'unique_subscription_name_per_company'
      AND conrelid = '"eventSystemSubscription"'::regclass
  ) THEN
    ALTER TABLE "eventSystemSubscription"
      ADD CONSTRAINT "unique_subscription_name_per_company" UNIQUE ("companyId", "name");
  END IF;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION create_event_system_subscription(
  p_name text,
  p_table text,
  p_company_id text,
  p_operations text[],
  p_handler_type text,
  p_config jsonb DEFAULT '{}',
  p_filter jsonb DEFAULT '{}',
  p_active boolean DEFAULT true
)
RETURNS TABLE (id text, name text, "handlerType" text, "table" text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF session_user = 'carbon_app'
     AND NOT (p_company_id = ANY(app_companies_for_context())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  RETURN QUERY
  INSERT INTO "eventSystemSubscription" (
    "id",
    "name",
    "table",
    "companyId",
    "operations",
    "handlerType",
    "config",
    "filter",
    "active",
    "createdAt"
  )
  VALUES (
    'evt_' || replace(gen_random_uuid()::text, '-', ''),
    p_name,
    p_table,
    p_company_id,
    p_operations,
    p_handler_type,
    COALESCE(p_config, '{}'::jsonb),
    COALESCE(p_filter, '{}'::jsonb),
    COALESCE(p_active, true),
    now()
  )
  ON CONFLICT ON CONSTRAINT "unique_subscription_name_per_company"
  DO UPDATE SET
    "operations" = EXCLUDED."operations",
    "filter" = EXCLUDED."filter",
    "handlerType" = EXCLUDED."handlerType",
    "config" = EXCLUDED."config",
    "active" = EXCLUDED."active"
  RETURNING
    "eventSystemSubscription"."id",
    "eventSystemSubscription"."name",
    "eventSystemSubscription"."handlerType",
    "eventSystemSubscription"."table";
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION delete_event_system_subscription(
  p_subscription_id text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM "eventSystemSubscription"
  WHERE "id" = p_subscription_id
    AND (
      session_user <> 'carbon_app'
      OR "companyId" = ANY(app_companies_for_context())
    );
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION delete_event_system_subscriptions_by_name(
  p_company_id text,
  p_name text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF session_user = 'carbon_app'
     AND NOT (p_company_id = ANY(app_companies_for_context())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  DELETE FROM "eventSystemSubscription"
  WHERE "companyId" = p_company_id
    AND "name" = p_name;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION create_audit_log_table(p_company_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tbl_name text;
BEGIN
  IF session_user = 'carbon_app'
     AND NOT (p_company_id = ANY(app_companies_for_context())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  tbl_name := 'auditLog_' || p_company_id;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND information_schema.tables.table_name = tbl_name
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND information_schema.columns.table_name = tbl_name
        AND column_name = 'recordId'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN "recordId" text', tbl_name);
      EXECUTE format('UPDATE %I SET "recordId" = "entityId" WHERE "recordId" IS NULL', tbl_name);
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I ("recordId")',
        'idx_' || tbl_name || '_record',
        tbl_name
      );
    END IF;
    RETURN;
  END IF;

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      "id" text PRIMARY KEY DEFAULT (''aud_'' || replace(gen_random_uuid()::text, ''-'', '''')),
      "tableName" text NOT NULL,
      "entityType" text NOT NULL,
      "entityId" text NOT NULL,
      "recordId" text,
      "operation" text NOT NULL CHECK ("operation" IN (''INSERT'', ''UPDATE'', ''DELETE'')),
      "actorId" text,
      "diff" jsonb,
      "metadata" jsonb,
      "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp()
    )
  ', tbl_name);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I ("entityType", "entityId")',
    'idx_' || tbl_name || '_entity', tbl_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I ("tableName")',
    'idx_' || tbl_name || '_table', tbl_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I ("recordId")',
    'idx_' || tbl_name || '_record', tbl_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I ("actorId")',
    'idx_' || tbl_name || '_actor', tbl_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I ("createdAt" DESC)',
    'idx_' || tbl_name || '_created', tbl_name);

  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl_name);
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION drop_audit_log_table(p_company_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tbl_name text;
BEGIN
  IF session_user = 'carbon_app'
     AND NOT (p_company_id = ANY(app_companies_for_context())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  tbl_name := 'auditLog_' || p_company_id;
  EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', tbl_name);
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION insert_audit_log_batch(
  p_company_id text,
  p_entries jsonb[]
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tbl_name text;
  entry jsonb;
  inserted_count integer := 0;
  v_created_at timestamptz;
BEGIN
  IF session_user = 'carbon_app'
     AND NOT (p_company_id = ANY(app_companies_for_context())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  tbl_name := 'auditLog_' || p_company_id;
  PERFORM create_audit_log_table(p_company_id);

  FOREACH entry IN ARRAY p_entries
  LOOP
    v_created_at := COALESCE((entry->>'createdAt')::timestamptz, clock_timestamp());

    EXECUTE format('
      INSERT INTO %I ("tableName", "entityType", "entityId", "recordId", "operation", "actorId", "diff", "metadata", "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ', tbl_name)
    USING
      entry->>'tableName',
      entry->>'entityType',
      entry->>'entityId',
      entry->>'recordId',
      entry->>'operation',
      entry->>'actorId',
      CASE WHEN entry->'diff' = 'null'::jsonb THEN NULL ELSE entry->'diff' END,
      CASE WHEN entry->'metadata' = 'null'::jsonb THEN NULL ELSE entry->'metadata' END,
      v_created_at;

    inserted_count := inserted_count + 1;
  END LOOP;

  RETURN inserted_count;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_entity_audit_log(
  p_company_id text,
  p_entity_type text,
  p_entity_id text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_record_id text DEFAULT NULL
)
RETURNS TABLE (
  "id" text,
  "tableName" text,
  "entityType" text,
  "entityId" text,
  "recordId" text,
  "operation" text,
  "actorId" text,
  "diff" jsonb,
  "metadata" jsonb,
  "createdAt" timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tbl_name text;
BEGIN
  tbl_name := 'auditLog_' || p_company_id;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND information_schema.tables.table_name = tbl_name
  ) THEN
    RETURN;
  END IF;

  IF p_record_id IS NULL THEN
    RETURN QUERY EXECUTE format('
      SELECT "id", "tableName", "entityType", "entityId", "recordId", "operation", "actorId", "diff", "metadata", "createdAt"
      FROM %I
      WHERE "entityType" = $1 AND "entityId" = $2
      ORDER BY "createdAt" DESC
      LIMIT $3 OFFSET $4
    ', tbl_name)
    USING p_entity_type, p_entity_id, p_limit, p_offset;
  ELSE
    RETURN QUERY EXECUTE format('
      SELECT "id", "tableName", "entityType", "entityId", "recordId", "operation", "actorId", "diff", "metadata", "createdAt"
      FROM %I
      WHERE "entityType" = $1 AND "entityId" = $2 AND "recordId" = $3
      ORDER BY "createdAt" DESC
      LIMIT $4 OFFSET $5
    ', tbl_name)
    USING p_entity_type, p_entity_id, p_record_id, p_limit, p_offset;
  END IF;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_audit_log(
  p_company_id text,
  p_entity_type text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_actor_id text DEFAULT NULL,
  p_operation text DEFAULT NULL,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  "id" text,
  "tableName" text,
  "entityType" text,
  "entityId" text,
  "recordId" text,
  "operation" text,
  "actorId" text,
  "diff" jsonb,
  "metadata" jsonb,
  "createdAt" timestamptz,
  "totalCount" bigint
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tbl_name text;
  where_clauses text[] := ARRAY[]::text[];
  where_clause text := '';
  query_text text;
  count_query text;
  total bigint;
BEGIN
  tbl_name := 'auditLog_' || p_company_id;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND information_schema.tables.table_name = tbl_name
  ) THEN
    RETURN;
  END IF;

  IF p_entity_type IS NOT NULL THEN
    where_clauses := array_append(where_clauses, format('"entityType" = %L', p_entity_type));
  END IF;
  IF p_entity_id IS NOT NULL THEN
    where_clauses := array_append(where_clauses, format('"entityId" = %L', p_entity_id));
  END IF;
  IF p_actor_id IS NOT NULL THEN
    where_clauses := array_append(where_clauses, format('"actorId" = %L', p_actor_id));
  END IF;
  IF p_operation IS NOT NULL THEN
    where_clauses := array_append(where_clauses, format('"operation" = %L', p_operation));
  END IF;
  IF p_start_date IS NOT NULL THEN
    where_clauses := array_append(where_clauses, format('"createdAt" >= %L', p_start_date));
  END IF;
  IF p_end_date IS NOT NULL THEN
    where_clauses := array_append(where_clauses, format('"createdAt" <= %L', p_end_date));
  END IF;
  IF p_search IS NOT NULL AND p_search <> '' THEN
    where_clauses := array_append(where_clauses, format('"entityId" ILIKE %L', '%' || p_search || '%'));
  END IF;

  IF array_length(where_clauses, 1) > 0 THEN
    where_clause := 'WHERE ' || array_to_string(where_clauses, ' AND ');
  END IF;

  count_query := format('SELECT COUNT(*) FROM %I %s', tbl_name, where_clause);
  EXECUTE count_query INTO total;

  query_text := format('
    SELECT "id", "tableName", "entityType", "entityId", "recordId", "operation", "actorId", "diff", "metadata", "createdAt", %s::bigint AS "totalCount"
    FROM %I
    %s
    ORDER BY "createdAt" DESC
    LIMIT %s OFFSET %s
  ', total, tbl_name, where_clause, p_limit, p_offset);

  RETURN QUERY EXECUTE query_text;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_audit_log_count(
  p_company_id text,
  p_entity_type text DEFAULT NULL,
  p_actor_id text DEFAULT NULL,
  p_operation text DEFAULT NULL,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_search text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tbl_name text;
  where_clauses text[] := ARRAY[]::text[];
  where_clause text := '';
  count_val integer;
BEGIN
  tbl_name := 'auditLog_' || p_company_id;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND information_schema.tables.table_name = tbl_name
  ) THEN
    RETURN 0;
  END IF;

  IF p_entity_type IS NOT NULL THEN
    where_clauses := array_append(where_clauses, format('"entityType" = %L', p_entity_type));
  END IF;
  IF p_actor_id IS NOT NULL THEN
    where_clauses := array_append(where_clauses, format('"actorId" = %L', p_actor_id));
  END IF;
  IF p_operation IS NOT NULL THEN
    where_clauses := array_append(where_clauses, format('"operation" = %L', p_operation));
  END IF;
  IF p_start_date IS NOT NULL THEN
    where_clauses := array_append(where_clauses, format('"createdAt" >= %L', p_start_date));
  END IF;
  IF p_end_date IS NOT NULL THEN
    where_clauses := array_append(where_clauses, format('"createdAt" <= %L', p_end_date));
  END IF;
  IF p_search IS NOT NULL AND p_search <> '' THEN
    where_clauses := array_append(where_clauses, format('"entityId" ILIKE %L', '%' || p_search || '%'));
  END IF;

  IF array_length(where_clauses, 1) > 0 THEN
    where_clause := 'WHERE ' || array_to_string(where_clauses, ' AND ');
  END IF;

  EXECUTE format('SELECT COUNT(*)::integer FROM %I %s', tbl_name, where_clause)
  INTO count_val;
  RETURN count_val;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_audit_logs_for_archive(
  p_company_id text,
  p_before_date timestamptz
)
RETURNS TABLE (
  "id" text,
  "tableName" text,
  "entityType" text,
  "entityId" text,
  "recordId" text,
  "operation" text,
  "actorId" text,
  "diff" jsonb,
  "metadata" jsonb,
  "createdAt" timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tbl_name text;
BEGIN
  tbl_name := 'auditLog_' || p_company_id;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND information_schema.tables.table_name = tbl_name
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE format('
    SELECT "id", "tableName", "entityType", "entityId", "recordId", "operation", "actorId", "diff", "metadata", "createdAt"
    FROM %I
    WHERE "createdAt" < $1
    ORDER BY "createdAt" ASC
  ', tbl_name)
  USING p_before_date;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION delete_old_audit_logs(
  p_company_id text,
  p_cutoff_date timestamptz
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tbl_name text;
  deleted_count integer;
BEGIN
  tbl_name := 'auditLog_' || p_company_id;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND information_schema.tables.table_name = tbl_name
  ) THEN
    RETURN 0;
  END IF;

  EXECUTE format('
    WITH deleted AS (
      DELETE FROM %I
      WHERE "createdAt" < $1
      RETURNING *
    )
    SELECT COUNT(*)::integer FROM deleted
  ', tbl_name)
  USING p_cutoff_date
  INTO deleted_count;

  RETURN deleted_count;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_custom_field_unique_values(
  table_name text,
  field_key text,
  company_id text
)
RETURNS TABLE (value jsonb)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY EXECUTE format(
    'SELECT DISTINCT jsonb_extract_path("customFields", $1) AS value
     FROM %I
     WHERE "companyId" = $2
       AND "customFields" ? $1
       AND jsonb_extract_path("customFields", $1) IS NOT NULL',
    table_name
  ) USING field_key, company_id;
END;
$$;--> statement-breakpoint

CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'searchIndexRegistry_companyId_key'
      AND conrelid = '"searchIndexRegistry"'::regclass
  ) THEN
    ALTER TABLE "searchIndexRegistry"
      ADD CONSTRAINT "searchIndexRegistry_companyId_key" UNIQUE ("companyId");
  END IF;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION create_company_search_index(p_company_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_name text;
BEGIN
  IF session_user = 'carbon_app'
     AND NOT (p_company_id = ANY(app_companies_for_context())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  v_table_name := 'searchIndex_' || p_company_id;

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      "id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      "entityType" text NOT NULL,
      "entityId" text NOT NULL,
      "title" text NOT NULL,
      "description" text DEFAULT '''',
      "link" text NOT NULL,
      "tags" text[] DEFAULT ''{}'',
      "metadata" jsonb DEFAULT ''{}'',
      "searchVector" tsvector,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz,
      CONSTRAINT %I UNIQUE ("entityType", "entityId")
    )', v_table_name, v_table_name || '_entity_unique');

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I USING GIN ("searchVector")',
    v_table_name || '_fts_idx', v_table_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I USING GIN ("title" gin_trgm_ops)',
    v_table_name || '_title_trgm_idx', v_table_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I USING GIN ("description" gin_trgm_ops)',
    v_table_name || '_description_trgm_idx', v_table_name);

  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', v_table_name);

  INSERT INTO "searchIndexRegistry" ("companyId", "createdAt")
  VALUES (p_company_id, now())
  ON CONFLICT ("companyId") DO NOTHING;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION drop_company_search_index(p_company_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_name text;
BEGIN
  IF session_user = 'carbon_app'
     AND NOT (p_company_id = ANY(app_companies_for_context())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  v_table_name := 'searchIndex_' || p_company_id;
  EXECUTE format('DROP TABLE IF EXISTS %I', v_table_name);
  DELETE FROM "searchIndexRegistry" WHERE "companyId" = p_company_id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION delete_from_search_index(
  p_company_id text,
  p_entity_type text,
  p_entity_id text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_name text;
BEGIN
  IF session_user = 'carbon_app'
     AND NOT (p_company_id = ANY(app_companies_for_context())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  PERFORM create_company_search_index(p_company_id);
  v_table_name := 'searchIndex_' || p_company_id;

  EXECUTE format(
    'DELETE FROM %I WHERE "entityType" = $1 AND "entityId" = $2',
    v_table_name
  ) USING p_entity_type, p_entity_id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION upsert_to_search_index(
  p_company_id text,
  p_entity_type text,
  p_entity_id text,
  p_title text,
  p_description text,
  p_link text,
  p_tags text[],
  p_metadata jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_name text;
  v_search_text text;
BEGIN
  IF session_user = 'carbon_app'
     AND NOT (p_company_id = ANY(app_companies_for_context())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  PERFORM create_company_search_index(p_company_id);
  v_table_name := 'searchIndex_' || p_company_id;
  v_search_text := p_title || ' ' || COALESCE(p_description, '') || ' ' || COALESCE(array_to_string(p_tags, ' '), '');

  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "description", "link", "tags", "metadata", "searchVector")
    VALUES ($1, $2, $3, $4, $5, $6, $7, to_tsvector(''english'', $8))
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "link" = EXCLUDED."link",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = EXCLUDED."searchVector",
      "updatedAt" = now()
  ', v_table_name) USING
    p_entity_type,
    p_entity_id,
    p_title,
    COALESCE(p_description, ''),
    p_link,
    COALESCE(p_tags, ARRAY[]::text[]),
    COALESCE(p_metadata, '{}'::jsonb),
    v_search_text;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION search_company_index(
  p_company_id text,
  p_query text,
  p_entity_types text[],
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id bigint,
  "entityType" text,
  "entityId" text,
  title text,
  description text,
  link text,
  tags text[],
  metadata jsonb
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_name text;
  v_sanitized text;
  v_tsquery_text text;
  v_like_pattern text;
  v_prefix_pattern text;
BEGIN
  IF session_user = 'carbon_app'
     AND NOT (p_company_id = ANY(app_companies_for_context())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  PERFORM create_company_search_index(p_company_id);
  v_table_name := 'searchIndex_' || p_company_id;

  v_sanitized := regexp_replace(COALESCE(trim(p_query), ''), '[^[:alnum:][:space:]_-]', ' ', 'g');
  v_sanitized := trim(regexp_replace(v_sanitized, '\s+', ' ', 'g'));

  IF v_sanitized = '' THEN
    RETURN;
  END IF;

  SELECT string_agg(tok || ':*', ' & ')
  INTO v_tsquery_text
  FROM regexp_split_to_table(v_sanitized, '\s+') AS tok
  WHERE tok ~ '[[:alnum:]]';

  IF v_tsquery_text IS NULL OR v_tsquery_text = '' THEN
    RETURN;
  END IF;

  v_like_pattern := '%' || v_sanitized || '%';
  v_prefix_pattern := v_sanitized || '%';

  RETURN QUERY EXECUTE format('
    WITH q AS (
      SELECT to_tsquery(''english'', $1) AS query
    )
    SELECT
      si.id,
      si."entityType",
      si."entityId",
      si.title,
      si.description,
      si.link,
      si.tags,
      si.metadata
    FROM %I si, q
    WHERE si."entityType" = ANY($2)
      AND (
        si."searchVector" @@ q.query
        OR si.title ILIKE $4
        OR si.description ILIKE $4
      )
    ORDER BY
      CASE WHEN si.title ILIKE $5 THEN 0 ELSE 1 END,
      ts_rank_cd(si."searchVector", q.query) DESC,
      si.id DESC
    LIMIT $3
  ', v_table_name)
  USING v_tsquery_text, p_entity_types, p_limit, v_like_pattern, v_prefix_pattern;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_current_training_period(frequency "trainingFrequency")
RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
AS $$
BEGIN
  CASE frequency
    WHEN 'Once' THEN RETURN NULL;
    WHEN 'Quarterly' THEN RETURN 'Q' || ceil(extract(month from current_date)::numeric / 3) || '-' || extract(year from current_date);
    WHEN 'Annual' THEN RETURN extract(year from current_date)::text;
  END CASE;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_period_end_date(period text)
RETURNS date
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
AS $$
DECLARE
  year_part integer;
  quarter_part integer;
BEGIN
  IF period IS NULL THEN
    RETURN NULL;
  END IF;

  IF position('Q' in period) > 0 THEN
    quarter_part := substring(period FROM 2 FOR 1)::integer;
    year_part := substring(period FROM 4)::integer;
    RETURN (make_date(year_part, quarter_part * 3, 1) + interval '1 month - 1 day')::date;
  END IF;

  RETURN make_date(period::integer, 12, 31);
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION employee_requires_period(employee_start_date date, period text)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
AS $$
BEGIN
  IF period IS NULL THEN
    RETURN true;
  END IF;

  IF employee_start_date IS NULL THEN
    RETURN true;
  END IF;

  RETURN employee_start_date <= get_period_end_date(period);
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_training_assignment_status(p_company_id text)
RETURNS TABLE (
  "trainingAssignmentId" text,
  "trainingId" text,
  "trainingName" text,
  frequency "trainingFrequency",
  "trainingType" "trainingType",
  "employeeId" text,
  "employeeName" text,
  "avatarUrl" text,
  "employeeStartDate" date,
  "companyId" text,
  "currentPeriod" text,
  "completionId" numeric,
  "completedAt" timestamptz,
  status text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF session_user = 'carbon_app'
     AND NOT (p_company_id = ANY(app_companies_for_context())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  RETURN QUERY
  WITH group_users AS (
    SELECT DISTINCT
      ta.id AS assignment_id,
      jsonb_array_elements_text(users_for_groups(ta."groupIds")) AS user_id
    FROM "trainingAssignment" ta
    WHERE ta."companyId" = p_company_id
  ),
  assigned_employees AS (
    SELECT DISTINCT
      ta.id AS "trainingAssignmentId",
      ta."trainingId" AS "trainingId",
      t."name" AS "trainingName",
      t."frequency",
      t."type" AS "trainingType",
      u.id AS "employeeId",
      u."fullName" AS "employeeName",
      u."avatarUrl" AS "avatarUrl",
      ej."startDate" AS "employeeStartDate",
      ta."companyId" AS "companyId"
    FROM "trainingAssignment" ta
    JOIN "training" t
      ON t.id = ta."trainingId"
      AND t."companyId" = p_company_id
      AND t."status" = 'Active'
    JOIN group_users gu ON gu.assignment_id = ta.id
    JOIN "user" u ON u.id = gu.user_id AND u.active = true
    JOIN "employee" e ON e.id = u.id AND e."companyId" = ta."companyId"
    LEFT JOIN "employeeJob" ej ON ej.id = u.id AND ej."companyId" = ta."companyId"
    WHERE ta."companyId" = p_company_id
  ),
  with_period AS (
    SELECT ae.*, get_current_training_period(ae."frequency") AS "currentPeriod"
    FROM assigned_employees ae
  )
  SELECT
    wp."trainingAssignmentId",
    wp."trainingId",
    wp."trainingName",
    wp."frequency",
    wp."trainingType",
    wp."employeeId",
    wp."employeeName",
    wp."avatarUrl",
    wp."employeeStartDate",
    wp."companyId",
    wp."currentPeriod",
    tc.id AS "completionId",
    tc."completedAt" AS "completedAt",
    CASE
      WHEN wp."frequency" = 'Once' THEN
        CASE WHEN tc.id IS NOT NULL THEN 'Completed' ELSE 'Pending' END
      WHEN tc.id IS NOT NULL THEN 'Completed'
      WHEN NOT employee_requires_period(wp."employeeStartDate", wp."currentPeriod") THEN 'Not Required'
      WHEN get_period_end_date(wp."currentPeriod") < current_date THEN 'Overdue'
      ELSE 'Pending'
    END AS status
  FROM with_period wp
  LEFT JOIN "trainingCompletion" tc ON
    tc."trainingAssignmentId" = wp."trainingAssignmentId"
    AND tc."employeeId" = wp."employeeId"
    AND tc."companyId" = p_company_id
    AND ((wp."frequency" = 'Once' AND tc."period" IS NULL) OR tc."period" = wp."currentPeriod");
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_training_assignment_summary(p_company_id text)
RETURNS TABLE (
  "trainingId" text,
  "trainingName" text,
  frequency "trainingFrequency",
  "currentPeriod" text,
  "totalAssigned" bigint,
  completed bigint,
  pending bigint,
  overdue bigint,
  "completionPercent" numeric
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF session_user = 'carbon_app'
     AND NOT (p_company_id = ANY(app_companies_for_context())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  RETURN QUERY
  SELECT
    tas."trainingId",
    tas."trainingName",
    tas.frequency,
    tas."currentPeriod",
    COUNT(*) FILTER (WHERE tas.status <> 'Not Required'),
    COUNT(*) FILTER (WHERE tas.status = 'Completed'),
    COUNT(*) FILTER (WHERE tas.status = 'Pending'),
    COUNT(*) FILTER (WHERE tas.status = 'Overdue'),
    CASE
      WHEN COUNT(*) FILTER (WHERE tas.status <> 'Not Required') = 0 THEN 100
      ELSE ROUND(
        COUNT(*) FILTER (WHERE tas.status = 'Completed')::numeric * 100 /
        NULLIF(COUNT(*) FILTER (WHERE tas.status <> 'Not Required'), 0),
        1
      )
    END
  FROM get_training_assignment_status(p_company_id) tas
  GROUP BY tas."trainingId", tas."trainingName", tas.frequency, tas."currentPeriod";
END;
$$;
