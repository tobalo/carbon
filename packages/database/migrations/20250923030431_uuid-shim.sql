CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION id(_prefix TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  _uuid TEXT;
BEGIN
  _uuid := REPLACE(uuid_to_base58(extensions.gen_random_uuid()), '-', '');
  IF _prefix IS NOT NULL THEN
    RETURN _prefix || '_' || _uuid;
  ELSE
    RETURN _uuid;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT extensions.uuid_generate_v4() $$;