import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const failures = [];
const legacyHostedVendor = "supa" + "base";
const legacyHostedPackageScope = `@${legacyHostedVendor}/`;

checkBetterAuthEntrypoint();
checkBetterAuthAdapter();
checkGeneratedAuthSchema();
checkAuthPackageDependencies();
checkProviderEnv();
checkNoLegacyAnonConfig();
checkNoLegacyAuthProviderSurface();
checkApiDocsHideAuthTables();
checkNoHostedAuthCompatibilitySurface();

if (failures.length > 0) {
  console.error("Auth provider audit failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Auth provider audit passed");
console.log("- Better Auth-only provider entrypoint checked");
console.log("- Better Auth Drizzle/Postgres adapter checked");
console.log("- generated auth schema mapping checked");
console.log("- auth package and lockfile dependency surface checked");
console.log("- env defaults checked");
console.log("- legacy anon-key config surface checked");
console.log("- legacy auth provider surface checked");
console.log("- API docs auth-table blacklist checked");
console.log("- hosted auth compatibility surface checked");

function checkBetterAuthEntrypoint() {
  const source = read("packages/auth/src/provider/index.ts");
  expectAll(source, "packages/auth/src/provider/index.ts", [
    ["imports AUTH_PROVIDER from env config", 'import { AUTH_PROVIDER } from "../config/env"'],
    ["imports the Better Auth provider", "BetterAuthProvider"],
    ["exports the Better Auth route handler", "betterAuthServer"],
    ["rejects unsupported providers", 'AUTH_PROVIDER !== "better_auth"'],
    ["throws on unsupported providers", "Unsupported AUTH_PROVIDER"],
    ["exports a Better Auth provider instance", "new BetterAuthProvider()"]
  ]);
}

function checkBetterAuthAdapter() {
  const source = read("packages/auth/src/provider/better-auth.ts");
  expectAll(source, "packages/auth/src/provider/better-auth.ts", [
    ["uses the service Drizzle database client", 'import { dbService } from "@carbon/database/drizzle"'],
    ["uses the generated auth schema", 'import { authSchema } from "@carbon/database/schema"'],
    ["imports Better Auth", 'import { betterAuth } from "better-auth"'],
    ["imports the Better Auth Drizzle adapter", 'import { drizzleAdapter } from "better-auth/adapters/drizzle"'],
    ["imports the Better Auth bearer plugin", "bearer"],
    ["creates a Better Auth server", "betterAuth({"],
    ["uses the Drizzle adapter", "database: drizzleAdapter(dbService"],
    ["uses Postgres adapter mode", 'provider: "pg"'],
    ["passes the generated auth schema to Better Auth", "schema: authSchema"],
    ["maps users to authUser", 'modelName: "authUser"'],
    ["maps sessions to authSession", 'modelName: "authSession"'],
    ["maps accounts to authAccount", 'modelName: "authAccount"'],
    ["maps verifications to authVerification", 'modelName: "authVerification"'],
    ["uses BETTER_AUTH_SECRET", "secret: BETTER_AUTH_SECRET"],
    ["enables email/password auth", "emailAndPassword:"],
    ["enables Better Auth bearer session tokens", "bearer()"],
    ["enables Better Auth magic links", "magicLink({"],
    ["implements createUser through Better Auth", '"createUser"'],
    ["implements session lookup through Better Auth", '"getSession"'],
    ["implements magic-link verification through Better Auth", '"magicLinkVerify"'],
    ["refreshes Carbon sessions from Better Auth session lookup", "getSessionByAccessToken(refreshToken)"]
  ]);
}

function checkGeneratedAuthSchema() {
  const source = read("packages/database/src/schema/index.ts");
  expectAll(source, "packages/database/src/schema/index.ts", [
    ["declares authUser table", 'export const authUserTable = pgTable("authUser"'],
    ["declares authSession table", 'export const authSessionTable = pgTable("authSession"'],
    ["declares authAccount table", 'export const authAccountTable = pgTable("authAccount"'],
    ["declares authVerification table", 'export const authVerificationTable = pgTable("authVerification"'],
    ["exports authSchema", "export const authSchema = {"],
    ["maps authSchema authUser", '"authUser": authUserTable'],
    ["maps authSchema authSession", '"authSession": authSessionTable'],
    ["maps authSchema authAccount", '"authAccount": authAccountTable'],
    ["maps authSchema authVerification", '"authVerification": authVerificationTable']
  ]);

  const migration = read("packages/database/drizzle/0001_supreme_amazoness.sql");
  expectAll(migration, "packages/database/drizzle/0001_supreme_amazoness.sql", [
    ["creates authUser table", 'CREATE TABLE "authUser"'],
    ["creates authSession table", 'CREATE TABLE "authSession"'],
    ["creates authAccount table", 'CREATE TABLE "authAccount"'],
    ["creates authVerification table", 'CREATE TABLE "authVerification"'],
    ["keeps auth user email unique", 'CONSTRAINT "authUser_email_unique" UNIQUE'],
    ["keeps auth session token unique", 'CONSTRAINT "authSession_token_unique" UNIQUE']
  ]);
}

function checkAuthPackageDependencies() {
  const manifest = JSON.parse(read("packages/auth/package.json"));
  if (!manifest.dependencies?.["better-auth"]) {
    failures.push("packages/auth/package.json is missing better-auth dependency.");
  }

  const packageFiles = sourceFiles().filter((file) => basename(file) === "package.json");
  for (const file of packageFiles) {
    const manifest = JSON.parse(read(file));
    for (const section of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies"
    ]) {
      for (const dependency of Object.keys(manifest[section] ?? {})) {
        if (isLegacyAuthDependency(dependency)) {
          failures.push(`${file} ${section} contains legacy auth dependency ${dependency}.`);
        }
      }
    }
  }

  const lockfile = read("pnpm-lock.yaml");
  const legacyLockPatterns = [
    /@workos-inc\//i,
    /@clerk\//i,
    /@auth0\//i,
    /\bnext-auth\b/i,
    /\blucia-auth\b/i,
    new RegExp(escapeRegExp(legacyHostedPackageScope), "i"),
    new RegExp(`\\b${escapeRegExp(legacyHostedVendor)}-js\\b`, "i")
  ];
  for (const pattern of legacyLockPatterns) {
    if (pattern.test(lockfile)) {
      failures.push(`pnpm-lock.yaml contains legacy auth dependency pattern ${pattern}.`);
    }
  }
}

function checkProviderEnv() {
  const envExample = read(".env.example");
  expectAll(envExample, ".env.example", [
    ["sets Better Auth as the auth provider", 'AUTH_PROVIDER="better_auth"'],
    ["documents Better Auth secret", "BETTER_AUTH_SECRET="]
  ]);
  if (/AUTH_PROVIDER=.*workos/i.test(envExample)) {
    failures.push(".env.example still advertises workos as an AUTH_PROVIDER option.");
  }

  const devEnv = read("packages/dev/src/env.ts");
  expectAll(devEnv, "packages/dev/src/env.ts", [
    ["generates Better Auth provider env", 'lines.push("AUTH_PROVIDER=better_auth")'],
    ["generates Better Auth secret env", "BETTER_AUTH_SECRET=${auth.secret}"]
  ]);

  const deploy = read(".github/workflows/deploy.yml");
  expectAll(deploy, ".github/workflows/deploy.yml", [
    ["sets Better Auth provider in deploy workflow", "AUTH_PROVIDER: better_auth"]
  ]);
}

function checkNoLegacyAnonConfig() {
  const files = [
    "packages/database/drizzle/0000_outgoing_the_fallen.sql",
    "packages/database/src/schema/index.ts",
    "packages/database/src/seed.ts",
    "packages/database/src/api-docs-schema.ts"
  ];

  for (const file of files) {
    if (/\banonKey\b/.test(read(file))) {
      failures.push(`${file} still exposes legacy anonKey config.`);
    }
  }
}

function checkNoLegacyAuthProviderSurface() {
  const forbiddenPaths = [
    `packages/auth/src/lib/${legacyHostedVendor}`,
    "packages/auth/src/provider/workos.ts",
    "packages/auth/src/provider/workos.tsx",
    "packages/auth/src/provider/clerk.ts",
    "packages/auth/src/provider/auth0.ts"
  ];
  for (const path of forbiddenPaths) {
    if (existsSync(resolve(repoRoot, path))) {
      failures.push(`Legacy auth provider path still exists: ${path}`);
    }
  }

  const forbiddenSourcePatterns = [
    ["WorkOS package import", /from\s+["']@workos-inc\//i],
    ["Clerk package import", /from\s+["']@clerk\//i],
    ["Auth0 package import", /from\s+["']@auth0\//i],
    ["NextAuth package import", /from\s+["']next-auth/i],
    [
      "hosted database auth package import",
      new RegExp(`from\\s+["']${escapeRegExp(legacyHostedPackageScope)}`, "i")
    ]
  ];

  for (const file of sourceFiles()) {
    if (
      file === "packages/database/scripts/audit-auth-provider.mjs" ||
      file === "packages/database/scripts/audit-vendor-removal.mjs" ||
      file === "packages/database/scripts/audit-rpc-functions.mjs" ||
      file.startsWith("packages/database/supa" + "base/")
    ) {
      continue;
    }

    const source = read(file);
    for (const [label, pattern] of forbiddenSourcePatterns) {
      if (pattern.test(source)) {
        failures.push(`${file} contains ${label}.`);
      }
    }
  }
}

function checkApiDocsHideAuthTables() {
  const source = read("apps/erp/app/routes/docs+/api+/_layout.tsx");
  for (const table of [
    "apiKeyRateLimit",
    "authAccount",
    "authSession",
    "authUser",
    "authVerification"
  ]) {
    if (!source.includes(`"${table}"`)) {
      failures.push(`API docs menu must hide internal auth table ${table}.`);
    }
  }
}

function checkNoHostedAuthCompatibilitySurface() {
  const forbiddenPatterns = [
    ["hosted auth REST endpoint", /\/auth\/v1\//i],
    ["browser auth state listener", /\bonAuthStateChange\b/],
    ["Carbon client auth namespace", /\bcarbonClient\.auth\b/],
    ["hosted OAuth sign-in helper", /\bsignInWithOAuth\b/],
    ["hosted OTP sign-in helper", /\bsignInWithOtp\b/],
    ["hosted auth callback validator", /\bcallbackValidator\b/],
    ["hosted auth hash/session bridge", /\bsession\?\.refresh_token\b/],
    ["SDK auth docs namespace", /\bcarbon\.auth\./]
  ];

  for (const file of sourceFiles()) {
    if (
      file === "packages/database/scripts/audit-auth-provider.mjs" ||
      file === "packages/database/scripts/audit-vendor-removal.mjs"
    ) {
      continue;
    }

    const source = read(file);
    for (const [label, pattern] of forbiddenPatterns) {
      if (pattern.test(source)) {
        failures.push(`${file} contains ${label}.`);
      }
    }
  }

  const authRoutes = [
    "apps/erp/app/routes/api+/auth.$.ts",
    "apps/mes/app/routes/api+/auth.$.ts",
    "apps/academy/app/routes/api+/auth.$.ts",
    "apps/starter/app/routes/api+/auth.$.ts"
  ];
  for (const route of authRoutes) {
    const source = read(route);
    expectAll(source, route, [
      ["delegates to the Better Auth route handler", "betterAuthServer.handler(request)"]
    ]);
  }
}

function isLegacyAuthDependency(dependency) {
  return [
    /^@workos-inc\//i,
    /^@clerk\//i,
    /^@auth0\//i,
    /^next-auth$/i,
    /^lucia-auth$/i,
    new RegExp(`^${escapeRegExp(legacyHostedPackageScope)}`, "i"),
    new RegExp(`${escapeRegExp(legacyHostedVendor)}-js`, "i")
  ].some((pattern) => pattern.test(dependency));
}

function expectAll(source, file, checks) {
  for (const [description, snippet] of checks) {
    if (!source.includes(snippet)) {
      failures.push(`${file} ${description}.`);
    }
  }
}

function read(file) {
  return readFileSync(resolve(repoRoot, file), "utf8");
}

function sourceFiles() {
  return git(
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "."
  )
    .split("\n")
    .filter((file) => {
      if (!file) return false;
      const absolutePath = resolve(repoRoot, file);
      return existsSync(absolutePath) && statSync(absolutePath).isFile();
    })
    .filter(
      (file) =>
        /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json)$/.test(file) ||
        basename(file) === "package.json"
    )
    .filter(
      (file) =>
        !file.includes("/node_modules/") &&
        !file.includes("/dist/") &&
        !file.includes("/build/")
    );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024
  });
}
