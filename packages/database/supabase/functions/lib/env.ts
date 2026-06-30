const nonEmptyEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  return value ? value : undefined;
};

export const carbonApiUrl = () =>
  nonEmptyEnv("CARBON_API_URL") ?? nonEmptyEnv("SUPABASE_URL") ?? "";

export const carbonPublicKey = () =>
  nonEmptyEnv("CARBON_PUBLIC_KEY") ?? nonEmptyEnv("SUPABASE_ANON_KEY") ?? "";

export const carbonServiceRoleKey = () =>
  nonEmptyEnv("CARBON_SERVICE_ROLE_KEY") ??
  nonEmptyEnv("SUPABASE_SERVICE_ROLE_KEY") ??
  "";

export const carbonAuthJwtSecret = () =>
  nonEmptyEnv("CARBON_AUTH_JWT_SECRET") ?? "";

export const carbonDatabaseUrl = () =>
  nonEmptyEnv("CARBON_DATABASE_URL") ??
  nonEmptyEnv("SUPABASE_DB_URL") ??
  nonEmptyEnv("DATABASE_URL") ??
  "";
