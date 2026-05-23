-- Deterministic scope indexes for direct Postgres RLS and common tenant filters.
-- The legacy schema accumulated many hand-written per-table indexes.
-- In the greenfield schema, the generated RLS policies consistently scope by
-- company, company group, or user. Index every current table that has one of
-- those scope columns so policy checks and app filters do not devolve to table
-- scans as tenant data grows.

DO $$
DECLARE
  scope_column record;
BEGIN
  FOR scope_column IN
    SELECT
      columns.table_name,
      columns.column_name
    FROM information_schema.columns
    INNER JOIN pg_catalog.pg_class classes
      ON classes.relname = columns.table_name
    INNER JOIN pg_catalog.pg_namespace namespaces
      ON namespaces.oid = classes.relnamespace
      AND namespaces.nspname = columns.table_schema
    WHERE columns.table_schema = 'public'
      AND columns.column_name IN ('companyId', 'companyGroupId', 'userId')
      AND classes.relkind IN ('r', 'p')
    ORDER BY columns.column_name, columns.table_name
  LOOP
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)',
      scope_column.table_name || '_' || scope_column.column_name || '_idx',
      scope_column.table_name,
      scope_column.column_name
    );
  END LOOP;
END $$;
