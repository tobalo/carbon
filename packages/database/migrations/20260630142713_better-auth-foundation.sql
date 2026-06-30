-- Better Auth owns authentication-provider state in app-owned Postgres tables.
-- These tables are intentionally separate from Carbon's public "user" table,
-- which remains the tenant/profile/permission user record.

CREATE TABLE "public"."better_auth_user" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "image" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "better_auth_user_email_uidx"
  ON "public"."better_auth_user" ("email");

CREATE TABLE "public"."better_auth_session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "token" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "public"."better_auth_user" ("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "better_auth_session_token_uidx"
  ON "public"."better_auth_session" ("token");

CREATE INDEX "better_auth_session_userId_idx"
  ON "public"."better_auth_session" ("userId");

CREATE TABLE "public"."better_auth_account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "public"."better_auth_user" ("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "better_auth_account_provider_account_uidx"
  ON "public"."better_auth_account" ("providerId", "accountId");

CREATE INDEX "better_auth_account_userId_idx"
  ON "public"."better_auth_account" ("userId");

CREATE TABLE "public"."better_auth_verification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "better_auth_verification_identifier_idx"
  ON "public"."better_auth_verification" ("identifier");

CREATE OR REPLACE FUNCTION "public"."create_public_user_from_better_auth"()
RETURNS TRIGGER AS $$
DECLARE
  name_parts TEXT[];
BEGIN
  name_parts := regexp_split_to_array(COALESCE(NULLIF(TRIM(NEW."name"), ''), ''), '\s+');

  INSERT INTO "public"."user" (
    "id",
    "email",
    "active",
    "firstName",
    "lastName",
    "avatarUrl",
    "about"
  )
  VALUES (
    NEW."id",
    NEW."email",
    true,
    COALESCE(name_parts[1], ''),
    COALESCE(array_to_string(name_parts[2:], ' '), ''),
    NEW."image",
    ''
  )
  ON CONFLICT ("id") DO UPDATE SET
    "email" = EXCLUDED."email";

  INSERT INTO "public"."userPermission" ("id")
  VALUES (NEW."id")
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER "on_better_auth_user_created"
  AFTER INSERT ON "public"."better_auth_user"
  FOR EACH ROW EXECUTE PROCEDURE "public"."create_public_user_from_better_auth"();

-- Existing legacy auth users can sign in through Better Auth magic links/OAuth
-- after this migration. Password hashes are not copied because the legacy auth
-- provider and Better Auth use different password formats; password setup flows
-- write credential rows.
DO $$
DECLARE
  email_verified_expression TEXT := 'false';
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'auth'
        AND table_name = 'users'
        AND column_name = 'email_confirmed_at'
    ) THEN
      email_verified_expression := 'au."email_confirmed_at" IS NOT NULL';
    ELSIF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'auth'
        AND table_name = 'users'
        AND column_name = 'confirmed_at'
    ) THEN
      email_verified_expression := 'au."confirmed_at" IS NOT NULL';
    END IF;

    EXECUTE format(
      $migration$
      INSERT INTO "public"."better_auth_user" (
        "id",
        "name",
        "email",
        "emailVerified",
        "image",
        "createdAt",
        "updatedAt"
      )
      SELECT
        au."id"::TEXT,
        COALESCE(
          NULLIF(
            TRIM(CONCAT_WS(' ', NULLIF(u."firstName", ''), NULLIF(u."lastName", ''))),
            ''
          ),
          au."email"
        ),
        au."email",
        %s,
        u."avatarUrl",
        COALESCE(au."created_at", CURRENT_TIMESTAMP),
        COALESCE(au."updated_at", CURRENT_TIMESTAMP)
      FROM "auth"."users" au
      LEFT JOIN "public"."user" u
        ON u."id" = au."id"::TEXT
      WHERE au."email" IS NOT NULL
      ON CONFLICT ("id") DO UPDATE SET
        "name" = EXCLUDED."name",
        "email" = EXCLUDED."email",
        "emailVerified" = EXCLUDED."emailVerified",
        "image" = EXCLUDED."image",
        "updatedAt" = CURRENT_TIMESTAMP
      $migration$,
      email_verified_expression
    );
  END IF;
END $$;

-- The auth provider tables are server-owned. Enabling RLS without tenant
-- policies keeps PostgREST clients from reading or mutating tokens/accounts
-- while direct server/database-owner access continues to work.
ALTER TABLE "public"."better_auth_user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."better_auth_session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."better_auth_account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."better_auth_verification" ENABLE ROW LEVEL SECURITY;
