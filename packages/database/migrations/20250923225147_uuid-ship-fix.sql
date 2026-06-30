CREATE OR REPLACE FUNCTION id(_prefix TEXT DEFAULT NULL)
    RETURNS TEXT
    LANGUAGE plpgsql
AS
$$
DECLARE
    _uuid TEXT;
BEGIN
    -- Generate UUID v4 and remove hyphens
    _uuid := REPLACE(uuid_to_base58(extensions.uuid_generate_v4()), '-', '');
    
    -- If prefix is provided, prepend it with underscore
    IF _prefix IS NOT NULL THEN
        RETURN _prefix || '_' || _uuid;
    ELSE
        RETURN _uuid;
    END IF;
END;
$$;