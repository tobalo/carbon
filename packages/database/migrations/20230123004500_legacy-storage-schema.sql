-- Legacy storage metadata kept only for historical RLS and bucket migrations.
-- Runtime file IO now uses Carbon object storage directly.

CREATE SCHEMA IF NOT EXISTS storage;

CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN name IS NULL OR position('/' IN trim(both '/' FROM name)) = 0 THEN ARRAY[]::text[]
    ELSE string_to_array(regexp_replace(trim(both '/' FROM name), '/[^/]*$', ''), '/')
  END
$$;

CREATE OR REPLACE FUNCTION storage.filename(name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(regexp_replace(trim(both '/' FROM name), '^.*/', ''), '')
$$;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  owner text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  public boolean NOT NULL DEFAULT false,
  avif_autodetection boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[],
  owner_id text
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id text PRIMARY KEY DEFAULT xid(),
  bucket_id text NOT NULL REFERENCES storage.buckets(id) ON DELETE CASCADE,
  name text NOT NULL,
  owner text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  last_accessed_at timestamp with time zone,
  metadata jsonb,
  version text,
  owner_id text,
  user_metadata jsonb,
  CONSTRAINT objects_bucket_id_name_unique UNIQUE (bucket_id, name)
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS buckets_name_idx ON storage.buckets (name);
CREATE INDEX IF NOT EXISTS objects_bucket_id_idx ON storage.objects (bucket_id);
CREATE INDEX IF NOT EXISTS objects_name_idx ON storage.objects (name);

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA storage TO %I', role_name);
      EXECUTE format('GRANT SELECT ON storage.buckets TO %I', role_name);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO %I', role_name);
    END IF;
  END LOOP;
END $$;
