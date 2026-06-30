-- add the extensions schema to the function
CREATE OR REPLACE FUNCTION verify_integration() RETURNS trigger AS $verify_integration$
    DECLARE integration_schema JSON;
    BEGIN
        SELECT jsonschema INTO integration_schema FROM public.integration WHERE id = NEW.id;
        IF NEW.active = TRUE AND NOT extensions.json_matches_schema(integration_schema, NEW.metadata) THEN
            RAISE EXCEPTION 'metadata does not match jsonschema';
        END IF;
        RETURN NEW;
    END;
$verify_integration$ LANGUAGE plpgsql SECURITY DEFINER;