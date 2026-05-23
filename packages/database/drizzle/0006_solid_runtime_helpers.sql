CREATE OR REPLACE FUNCTION jsonb_to_text_array(value jsonb) RETURNS text[]
LANGUAGE sql IMMUTABLE SECURITY INVOKER
AS $$
  SELECT COALESCE(array_agg(element), ARRAY[]::text[])
  FROM jsonb_array_elements_text(COALESCE(value, '[]'::jsonb)) AS elements(element)
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION has_role(required_role text, company text) RETURNS bool
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
BEGIN
  IF app_uid() IS NULL AND app_api_key() IS NULL THEN
    RETURN session_user <> 'carbon_app';
  END IF;

  IF app_api_key() IS NOT NULL THEN
    RETURN company = ANY(app_companies_for_context());
  END IF;

  SELECT utc."role"
  INTO user_role
  FROM "userToCompany" utc
  WHERE utc."userId" = app_uid()
    AND utc."companyId" = company;

  RETURN user_role = required_role;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION has_company_permission(claim text, company text) RETURNS bool
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  permission_value text[];
BEGIN
  IF app_uid() IS NULL AND app_api_key() IS NULL THEN
    RETURN session_user <> 'carbon_app';
  END IF;

  IF app_api_key() IS NOT NULL THEN
    SELECT jsonb_to_text_array(COALESCE(ak."scopes"->claim, '[]'::jsonb))
    INTO permission_value
    FROM "apiKey" ak
    WHERE ak."id" = app_api_key()
      AND ak."companyId" = company
      AND (ak."expiresAt" IS NULL OR ak."expiresAt" > now());
  ELSE
    SELECT jsonb_to_text_array(COALESCE(up.permissions->claim, '[]'::jsonb))
    INTO permission_value
    FROM "userPermission" up
    WHERE up.id = app_uid();
  END IF;

  IF permission_value IS NULL THEN
    RETURN false;
  END IF;

  RETURN '0' = ANY(permission_value) OR company = ANY(permission_value);
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION has_any_company_permission(claim text) RETURNS bool
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  permission_value text[];
BEGIN
  IF app_uid() IS NULL AND app_api_key() IS NULL THEN
    RETURN session_user <> 'carbon_app';
  END IF;

  IF app_api_key() IS NOT NULL THEN
    SELECT jsonb_to_text_array(COALESCE(ak."scopes"->claim, '[]'::jsonb))
    INTO permission_value
    FROM "apiKey" ak
    WHERE ak."id" = app_api_key()
      AND (ak."expiresAt" IS NULL OR ak."expiresAt" > now());
  ELSE
    SELECT jsonb_to_text_array(COALESCE(up.permissions->claim, '[]'::jsonb))
    INTO permission_value
    FROM "userPermission" up
    WHERE up.id = app_uid();
  END IF;

  RETURN permission_value IS NOT NULL AND array_length(permission_value, 1) > 0;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION is_claims_admin() RETURNS bool
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF app_uid() IS NULL AND app_api_key() IS NULL THEN
    RETURN session_user <> 'carbon_app';
  END IF;

  RETURN has_any_company_permission('users_update');
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_claims(uid text, company text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  company_role text;
  role_object jsonb;
  perms jsonb;
BEGIN
  SELECT utc."role"
  INTO company_role
  FROM "userToCompany" utc
  WHERE utc."userId" = uid
    AND utc."companyId" = company;

  SELECT up.permissions
  INTO perms
  FROM "userPermission" up
  WHERE up.id = uid;

  role_object := jsonb_build_object('role', company_role);
  RETURN (role_object || COALESCE(perms, '{}'::jsonb))::jsonb;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE VIEW "groupMembers" AS
  SELECT
    gm.id,
    g.name,
    g."companyId",
    g."isIdentityGroup",
    g."isEmployeeTypeGroup",
    g."isCustomerOrgGroup",
    g."isCustomerTypeGroup",
    g."isSupplierOrgGroup",
    g."isSupplierTypeGroup",
    gm."groupId",
    gm."memberGroupId",
    gm."memberUserId",
    to_jsonb(u) AS "user"
  FROM "membership" gm
  INNER JOIN "group" g ON g.id = gm."groupId"
  LEFT OUTER JOIN (
    SELECT * FROM "user" WHERE active = true
  ) u ON u.id = gm."memberUserId";--> statement-breakpoint

DROP VIEW IF EXISTS "groups" CASCADE;--> statement-breakpoint
DROP VIEW IF EXISTS "groups_recursive" CASCADE;--> statement-breakpoint

CREATE RECURSIVE VIEW "groups_recursive" (
  "groupId",
  "name",
  "companyId",
  "parentId",
  "isIdentityGroup",
  "isEmployeeTypeGroup",
  "isCustomerOrgGroup",
  "isCustomerTypeGroup",
  "isSupplierOrgGroup",
  "isSupplierTypeGroup",
  "user"
) AS
  SELECT
    "groupId",
    "name",
    "companyId",
    NULL::text AS "parentId",
    "isIdentityGroup",
    "isEmployeeTypeGroup",
    "isCustomerOrgGroup",
    "isCustomerTypeGroup",
    "isSupplierOrgGroup",
    "isSupplierTypeGroup",
    "user"
  FROM "groupMembers"
  UNION ALL
  SELECT
    g2."groupId",
    g2.name,
    g2."companyId",
    g1."groupId" AS "parentId",
    g1."isIdentityGroup",
    g2."isEmployeeTypeGroup",
    g2."isCustomerOrgGroup",
    g2."isCustomerTypeGroup",
    g2."isSupplierOrgGroup",
    g2."isSupplierTypeGroup",
    g2."user"
  FROM "groupMembers" g1
  INNER JOIN "groupMembers" g2 ON g1."memberGroupId" = g2."groupId";--> statement-breakpoint

CREATE OR REPLACE VIEW "groups" AS
  SELECT
    "groupId" AS "id",
    "isEmployeeTypeGroup",
    "isCustomerOrgGroup",
    "isCustomerTypeGroup",
    "isSupplierOrgGroup",
    "isSupplierTypeGroup",
    "name",
    "companyId",
    "parentId",
    COALESCE(jsonb_agg("user") FILTER (WHERE "user" IS NOT NULL), '[]'::jsonb) AS users
  FROM "groups_recursive"
  WHERE "isIdentityGroup" = false
  GROUP BY
    "groupId",
    "name",
    "companyId",
    "parentId",
    "isEmployeeTypeGroup",
    "isCustomerOrgGroup",
    "isCustomerTypeGroup",
    "isSupplierOrgGroup",
    "isSupplierTypeGroup"
  ORDER BY "isEmployeeTypeGroup" DESC, "isCustomerTypeGroup" DESC, "isSupplierTypeGroup" DESC, "name" ASC;--> statement-breakpoint

CREATE OR REPLACE FUNCTION groups_query(
  _name text DEFAULT '',
  _uid text DEFAULT NULL
)
RETURNS TABLE (
  "id" text,
  "name" text,
  "companyId" text,
  "parentId" text,
  "isEmployeeTypeGroup" boolean,
  "isCustomerOrgGroup" boolean,
  "isCustomerTypeGroup" boolean,
  "isSupplierOrgGroup" boolean,
  "isSupplierTypeGroup" boolean,
  "users" jsonb
)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    WITH group_ids AS (
      SELECT g."id"
      FROM "group" g
      WHERE g."isIdentityGroup" = false
        AND g."name" ILIKE '%' || _name || '%'
        AND (_uid IS NULL OR EXISTS (
          SELECT 1
          FROM "membership" m
          WHERE m."groupId" = g."id"
            AND m."memberUserId" = _uid
        ))
    )
    SELECT
      g."id",
      g."name",
      g."companyId",
      g."parentId",
      g."isEmployeeTypeGroup",
      g."isCustomerOrgGroup",
      g."isCustomerTypeGroup",
      g."isSupplierOrgGroup",
      g."isSupplierTypeGroup",
      g."users"
    FROM "groups" g
    WHERE g."id" IN (SELECT * FROM group_ids)
      OR g."parentId" IN (SELECT * FROM group_ids);
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION groups_for_user(uid text) RETURNS text[]
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  retval text[];
BEGIN
  WITH RECURSIVE "groupsForUser" AS (
    SELECT "groupId", "memberGroupId", "memberUserId"
    FROM "membership"
    WHERE "memberUserId" = uid
    UNION
    SELECT g1."groupId", g1."memberGroupId", g1."memberUserId"
    FROM "membership" g1
    INNER JOIN "groupsForUser" g2 ON g2."groupId" = g1."memberGroupId"
  )
  SELECT COALESCE(array_agg("groupId"), ARRAY[]::text[])
  INTO retval
  FROM "groupsForUser";

  RETURN retval;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION users_for_groups(groups text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  retval jsonb;
BEGIN
  WITH RECURSIVE "usersForGroups" AS (
    SELECT "groupId", "memberGroupId", "memberUserId"
    FROM "membership"
    WHERE "groupId" = ANY(groups)
    UNION
    SELECT g1."groupId", g1."memberGroupId", g1."memberUserId"
    FROM "membership" g1
    INNER JOIN "usersForGroups" g2 ON g2."memberGroupId" = g1."groupId"
  )
  SELECT COALESCE(jsonb_agg("memberUserId"), '[]'::jsonb)
  INTO retval
  FROM "usersForGroups"
  WHERE "memberUserId" IS NOT NULL;

  RETURN retval;
END;
$$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'apiKeyRateLimit_pkey'
      AND conrelid = '"apiKeyRateLimit"'::regclass
  ) THEN
    ALTER TABLE "apiKeyRateLimit"
      ADD CONSTRAINT "apiKeyRateLimit_pkey" PRIMARY KEY ("apiKeyId", "windowStart");
  END IF;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION check_api_key_rate_limit(
  p_api_key_id text,
  p_limit integer,
  p_window text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_timestamp timestamptz;
  v_window_start text;
  v_interval interval;
  v_count integer;
BEGIN
  v_interval := CASE p_window
    WHEN '1m' THEN interval '1 minute'
    WHEN '1h' THEN interval '1 hour'
    WHEN '1d' THEN interval '1 day'
    ELSE interval '1 hour'
  END;

  v_window_timestamp := date_trunc(
    CASE p_window
      WHEN '1m' THEN 'minute'
      WHEN '1h' THEN 'hour'
      WHEN '1d' THEN 'day'
      ELSE 'hour'
    END,
    now()
  );
  v_window_start := v_window_timestamp::text;

  INSERT INTO "apiKeyRateLimit" ("apiKeyId", "windowStart", "requestCount")
  VALUES (p_api_key_id, v_window_start, 1)
  ON CONFLICT ("apiKeyId", "windowStart")
  DO UPDATE SET "requestCount" = "apiKeyRateLimit"."requestCount" + 1
  RETURNING "requestCount"::integer INTO v_count;

  IF random() < 0.01 THEN
    DELETE FROM "apiKeyRateLimit"
    WHERE "apiKeyId" = p_api_key_id
      AND "windowStart" < v_window_start;
  END IF;

  RETURN jsonb_build_object(
    'success', v_count <= p_limit,
    'count', v_count,
    'limit', p_limit,
    'remaining', GREATEST(p_limit - v_count, 0),
    'resetAt', EXTRACT(EPOCH FROM (v_window_timestamp + v_interval))::bigint * 1000
  );
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_next_sequence(
  sequence_name text,
  company_id text
) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_suffix text;
  v_next numeric;
  v_size numeric;
  v_step numeric;
  v_next_value numeric;
  v_next_sequence text;
  v_derived_prefix text;
  v_derived_suffix text;
BEGIN
  IF session_user = 'carbon_app'
     AND NOT (company_id = ANY(app_companies_for_context())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT prefix, suffix, next, size, step
  INTO STRICT v_prefix, v_suffix, v_next, v_size, v_step
  FROM "sequence"
  WHERE "table" = sequence_name
    AND "companyId" = company_id;

  v_next_value := COALESCE(v_next, 0) + COALESCE(v_step, 1);
  v_next_sequence := lpad(v_next_value::bigint::text, COALESCE(v_size, 4)::integer, '0');

  v_derived_prefix := COALESCE(v_prefix, '');
  v_derived_prefix := replace(v_derived_prefix, '%{yyyy}', to_char(current_date, 'YYYY'));
  v_derived_prefix := replace(v_derived_prefix, '%{yy}', to_char(current_date, 'YY'));
  v_derived_prefix := replace(v_derived_prefix, '%{mm}', to_char(current_date, 'MM'));
  v_derived_prefix := replace(v_derived_prefix, '%{dd}', to_char(current_date, 'DD'));

  v_derived_suffix := COALESCE(v_suffix, '');
  v_derived_suffix := replace(v_derived_suffix, '%{yyyy}', to_char(current_date, 'YYYY'));
  v_derived_suffix := replace(v_derived_suffix, '%{yy}', to_char(current_date, 'YY'));
  v_derived_suffix := replace(v_derived_suffix, '%{mm}', to_char(current_date, 'MM'));
  v_derived_suffix := replace(v_derived_suffix, '%{dd}', to_char(current_date, 'DD'));

  UPDATE "sequence"
  SET next = v_next_value,
      "updatedBy" = COALESCE(app_uid(), app_api_key(), 'system')
  WHERE "table" = sequence_name
    AND "companyId" = company_id;

  RETURN v_derived_prefix || v_next_sequence || v_derived_suffix;
EXCEPTION
  WHEN no_data_found THEN
    RAISE EXCEPTION 'Sequence not found for table % and company %', sequence_name, company_id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_next_numeric_sequence(company_id text, item_type "itemType")
RETURNS text
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT "readableId"
    FROM "item"
    WHERE "companyId" = company_id
      AND "type" = item_type
      AND "readableId" ~ '^[0-9]'
      AND "readableId" !~ '[A-Za-z]'
    ORDER BY "readableId" DESC
    LIMIT 1
  );
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_next_prefixed_sequence(company_id text, item_type "itemType", prefix text)
RETURNS text
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT "readableId"
    FROM "item"
    WHERE "companyId" = company_id
      AND "type" = item_type
      AND "readableId" LIKE prefix || '%'
      AND substring("readableId" FROM (length(prefix) + 1)) ~ '^[0-9]+$'
    ORDER BY "readableId" DESC
    LIMIT 1
  );
END;
$$;
