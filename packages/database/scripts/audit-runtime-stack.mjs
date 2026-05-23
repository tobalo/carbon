import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const failures = [];

const runtimeFiles = [
  ".env.example",
  "docker-compose.yml",
  "docker-compose.dev.yml",
  "packages/dev/docker/postgres/001-roles.sql",
  "packages/dev/src/env.ts",
  "packages/dev/src/env.test.ts",
  ".github/workflows/deploy.yml",
  ".github/workflows/database.yml",
  ".github/workflows/inngest.yml"
];

checkNoLegacyRuntimeServices();
checkNoLegacyDevAuthTokens();
checkDevRuntimePortNames();
checkNoLegacySwaggerGenerator();
checkNoLegacyRealtimeClient();
checkComposeFiles();
checkGeneratedEnv();
checkExampleEnv();
checkPostgresInit();
checkDatabaseRoleUrlStrictness();
checkPg18SmokeScripts();
checkSeedCompanyDurability();
checkPg18MigrationDocs();
checkWorkflows();

if (failures.length > 0) {
  console.error("Runtime stack audit failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Runtime stack audit passed");
console.log("- compose files checked: docker-compose.yml, docker-compose.dev.yml");
console.log("- generated/env example database and S3 settings checked");
console.log("- scoped Postgres role init checked");
console.log("- strict database role URL selection checked");
console.log("- deployment workflow provider env checked");
console.log("- legacy local auth token minting checked");
console.log("- MinIO dev port naming checked");
console.log("- legacy hosted REST schema generator/API docs surface checked");
console.log(`- legacy runtime service scan files checked: ${runtimeFiles.length}`);
console.log("- legacy realtime client shape checked");
console.log("- PG18/pgvector database smoke scripts checked");
console.log("- seed-company retry/concurrency guards checked");
console.log("- migration docs PG18 default checked");

function checkNoLegacyRuntimeServices() {
  const legacyPatterns = [
    ["Supabase image or package namespace", /supabase[/-]/i],
    ["Kong gateway service", /\bkong\b/i],
    ["GoTrue auth service", /\bgotrue\b/i],
    ["PostgREST service", /\bpostgrest\b/i],
    ["Realtime service image", /\brealtime\b/i],
    ["Supabase storage API service", /storage-api/i],
    ["Edge runtime service", /edge-runtime/i],
    ["Imgproxy service", /\bimgproxy\b/i]
  ];

  for (const file of runtimeFiles) {
    if (!existsSync(resolve(repoRoot, file))) {
      failures.push(`${file} is missing from runtime stack audit.`);
      continue;
    }

    const source = read(file);
    for (const [label, pattern] of legacyPatterns) {
      if (pattern.test(source)) {
        failures.push(`${file} contains legacy ${label}.`);
      }
    }
  }
}

function checkNoLegacyDevAuthTokens() {
  const files = [
    "packages/dev/src/worktree.ts",
    "packages/dev/src/env.ts",
    "packages/dev/src/env.test.ts"
  ];
  const patterns = [
    ["Supabase service role token", /\bservice_role\b/],
    ["legacy anon token property", /\banonKey\b/],
    ["legacy service token property", /\bserviceKey\b/],
    ["legacy JWT credential type", /\bJwtCreds\b/],
    ["legacy JWT generator", /\bgenerateJwtCreds\b/],
    ["manual JWT signer", /\bsignJwt\b/],
    ["manual JWT HMAC signing", /\bcreateHmac\b/]
  ];

  for (const file of files) {
    const source = read(file);
    for (const [label, pattern] of patterns) {
      if (pattern.test(source)) {
        failures.push(`${file} contains ${label}.`);
      }
    }
  }
}

function checkDevRuntimePortNames() {
  const legacyPortNames = [
    ["PORT", "API"].join("_"),
    ["PORT", "STUDIO"].join("_")
  ];
  const files = [
    "docker-compose.dev.yml",
    "packages/dev/src/worktree.ts",
    "packages/dev/src/env.ts",
    "packages/dev/src/env.test.ts",
    "packages/dev/src/services/portless.ts",
    "packages/dev/src/ui.ts",
    "packages/dev/src/commands/up.ts",
    "packages/dev/bin/crbn",
    "README.md"
  ];

  for (const file of files) {
    const source = read(file);
    for (const legacyPortName of legacyPortNames) {
      if (source.includes(legacyPortName)) {
        failures.push(`${file} still uses legacy ${legacyPortName} naming.`);
      }
    }
  }

  expectAll(read("docker-compose.dev.yml"), "docker-compose.dev.yml", [
    ["maps MinIO storage through PORT_STORAGE", "${PORT_STORAGE}:9000"],
    ["maps MinIO console through PORT_CONSOLE", "${PORT_CONSOLE}:9001"]
  ]);
  expectAll(read("packages/dev/src/env.ts"), "packages/dev/src/env.ts", [
    ["emits S3 endpoint from PORT_STORAGE", "ports.PORT_STORAGE"],
    ["emits MinIO console URL from PORT_CONSOLE", "ports.PORT_CONSOLE"],
    ["labels MinIO service aliases", "# MinIO service aliases"]
  ]);
  expectAll(read("packages/dev/src/env.test.ts"), "packages/dev/src/env.test.ts", [
    ["tests generated PORT_STORAGE env", "PORT_STORAGE=54001"],
    ["tests generated PORT_CONSOLE env", "PORT_CONSOLE=54002"]
  ]);
  expectAll(
    read("packages/dev/src/services/portless.ts"),
    "packages/dev/src/services/portless.ts",
    [
      ["routes MinIO storage through PORT_STORAGE", "ports.PORT_STORAGE"],
      ["routes MinIO console through PORT_CONSOLE", "ports.PORT_CONSOLE"]
    ]
  );
  expectAll(read("packages/dev/src/ui.ts"), "packages/dev/src/ui.ts", [
    ["shows the MinIO storage URL", "\"Storage\""],
    ["uses PORT_STORAGE for the storage URL", "ports.PORT_STORAGE"],
    ["shows the MinIO console URL", "\"Console\""],
    ["uses PORT_CONSOLE for the console URL", "ports.PORT_CONSOLE"]
  ]);
  expectAll(read("packages/dev/src/commands/up.ts"), "packages/dev/src/commands/up.ts", [
    ["checks preferred localhost port availability", "isPortAvailable(preferredPort)"],
    ["prefers localhost MinIO storage on PORT_STORAGE", '["PORT_STORAGE", 54321]'],
    ["records localhost port fallbacks", "localhostPortFallbacks.push"],
    ["waits for MinIO storage through PORT_STORAGE", "ctx.ports.PORT_STORAGE"]
  ]);
}

function checkNoLegacySwaggerGenerator() {
  const generatorPath = "scripts/generate-swagger-docs.ts";
  if (existsSync(resolve(repoRoot, generatorPath))) {
    failures.push(`${generatorPath} still depends on the removed hosted REST schema endpoint.`);
  }
  if (existsSync(resolve(repoRoot, "packages/database/src/swagger-docs-schema.ts"))) {
    failures.push("packages/database/src/swagger-docs-schema.ts still contains the removed hosted REST schema artifact.");
  }

  const rootPackage = JSON.parse(read("package.json"));
  if (rootPackage.scripts?.["generate:swagger"]) {
    failures.push("package.json still exposes the removed generate:swagger script.");
  }
  const databasePackage = JSON.parse(read("packages/database/package.json"));
  if (databasePackage.exports?.["./swagger-docs-schema"]) {
    failures.push("packages/database/package.json still exports the removed swagger docs schema.");
  }
  if (!databasePackage.exports?.["./api-docs-schema"]) {
    failures.push("packages/database/package.json must export the Drizzle-derived api-docs-schema.");
  }

  const forbiddenFiles = [
    "packages/dev/src/commands/up.ts",
    "packages/dev/src/commands/migrate.ts",
    "packages/dev/src/main.ts",
    "packages/dev/README.md",
    "README.md"
  ];
  for (const file of forbiddenFiles) {
    const source = read(file);
    if (/generate:swagger|regenerate swagger|swagger regeneration|swagger refreshed|api\/platform\/projects\/default\/api\/rest/.test(source)) {
      failures.push(`${file} still references the removed hosted REST schema generator.`);
    }
  }

  const apiDocsFiles = [
    "apps/erp/app/routes/api+/docs.ts",
    "apps/erp/app/hooks/useApiDocsSchema.tsx",
    "apps/erp/app/routes/docs+/api+/_layout.tsx",
    "apps/erp/app/routes/docs+/api+/$lang.rpc.$id.tsx",
    "apps/erp/app/modules/api/ui/TableDocs.tsx",
    "apps/erp/app/modules/api/ui/Snippets.tsx"
  ];
  for (const file of apiDocsFiles) {
    const source = read(file);
    if (/swagger-docs-schema|useSwaggerDocs|swaggerDocsSchema|\/rest\/v1|application\/vnd\.pgrst/i.test(source)) {
      failures.push(`${file} still exposes the removed hosted REST docs surface.`);
    }
  }

  expectAll(read("apps/erp/app/routes/api+/docs.ts"), "apps/erp/app/routes/api+/docs.ts", [
    ["uses the Drizzle-derived API docs schema", "@carbon/database/api-docs-schema"]
  ]);
  expectAll(
    read("apps/erp/app/modules/api/ui/Snippets.tsx"),
    "apps/erp/app/modules/api/ui/Snippets.tsx",
    [["points table docs at app-owned routes/MCP instead of hosted REST", "Use the app-owned /api/* routes or MCP tools"]]
  );
}

function checkNoLegacyRealtimeClient() {
  const legacyRealtimePatterns = [
    ["Supabase-style channel hook", /\buseRealtimeChannel\b/],
    ["Postgres changes channel event", /\bpostgres_changes\b/],
    ["browser realtime channel API", /\bcarbon\.channel\s*\(/],
    ["browser realtime auth setter", /\brealtime\.setAuth\b/],
    ["browser channel removal API", /\bremoveChannel\s*\(/],
    ["realtime auth-ready state", /\bisRealtimeAuthSet\b/],
    ["realtime channel type facade", /\bRealtimeChannelLike\b/],
    ["deleted realtime API docs", /Realtime streams|broadcasts database changes/]
  ];

  for (const file of sourceFiles()) {
    if (
      file === "MIGRATION_OFF_SUPABASE.md" ||
      file === "packages/database/scripts/audit-runtime-stack.mjs" ||
      file.startsWith("packages/database/src/schema/")
    ) {
      continue;
    }

    const source = read(file);
    for (const [label, pattern] of legacyRealtimePatterns) {
      if (pattern.test(source)) {
        failures.push(`${file} contains legacy ${label}.`);
      }
    }
  }
}

function checkComposeFiles() {
  const sharedCompose = read("docker-compose.yml");
  expectAll(sharedCompose, "docker-compose.yml", [
    ["uses pgvector Postgres 18", "image: pgvector/pgvector:pg18-trixie"],
    ["mounts scoped Postgres init SQL", "./packages/dev/docker/postgres:/docker-entrypoint-initdb.d:ro"],
    ["runs Redis directly", "image: redis:7-alpine"],
    ["runs MinIO directly", "image: minio/minio:latest"],
    ["creates MinIO buckets with the MinIO client", "image: minio/mc:latest"],
    ["creates the local private bucket", "mc mb -p local/carbon-private-local"],
    ["creates the local public bucket", "mc mb -p local/carbon-public-local"],
    ["enables anonymous downloads on the public bucket", "mc anonymous set download local/carbon-public-local"]
  ]);

  const devCompose = read("docker-compose.dev.yml");
  expectAll(devCompose, "docker-compose.dev.yml", [
    ["uses pgvector Postgres 18", "image: pgvector/pgvector:pg18-trixie"],
    ["mounts scoped Postgres init SQL", "./packages/dev/docker/postgres:/docker-entrypoint-initdb.d:ro"],
    ["runs MinIO directly", "image: minio/minio:latest"],
    ["creates MinIO buckets with the MinIO client", "image: minio/mc:latest"],
    ["passes generated private bucket env into MinIO client", "S3_PRIVATE_BUCKET: ${S3_PRIVATE_BUCKET}"],
    ["passes generated public bucket env into MinIO client", "S3_PUBLIC_BUCKET: ${S3_PUBLIC_BUCKET}"],
    ["fails bucket setup when generated env is missing", "set -eu;"],
    ["uses generated private S3 bucket env", "mc mb -p local/$${S3_PRIVATE_BUCKET}"],
    ["uses generated public S3 bucket env", "mc mb -p local/$${S3_PUBLIC_BUCKET}"],
    ["enables anonymous downloads on the generated public bucket", "mc anonymous set download local/$${S3_PUBLIC_BUCKET}"],
    ["runs Inbucket directly", "image: inbucket/inbucket:"],
    ["runs Inngest directly", "image: inngest/inngest:"]
  ]);
}

function checkGeneratedEnv() {
  const envSource = read("packages/dev/src/env.ts");
  expectAll(envSource, "packages/dev/src/env.ts", [
    ["emits Better Auth provider", "lines.push(\"AUTH_PROVIDER=better_auth\")"],
    ["emits owner migration database URL", "DATABASE_MIGRATION_URL=${migrationDatabaseUrl}"],
    ["emits app scoped database URL", "DATABASE_URL=${appDatabaseUrl}"],
    ["emits service scoped database URL", "DATABASE_SERVICE_URL=${serviceDatabaseUrl}"],
    ["emits jobs scoped database URL", "JOBS_DATABASE_URL=${serviceDatabaseUrl}"],
    ["uses the carbon_app runtime role", "postgresql://carbon_app:carbon_app"],
    ["uses the carbon_service database role", "postgresql://carbon_service:carbon_service"],
    ["emits S3-compatible endpoint", "S3_ENDPOINT=${s3Endpoint}"],
    ["emits private S3 bucket", "S3_PRIVATE_BUCKET=${privateBucket}"],
    ["emits public S3 bucket", "S3_PUBLIC_BUCKET=${publicBucket}"],
    ["emits public S3 base URL", "S3_PUBLIC_BASE_URL=${s3Endpoint}/${publicBucket}"]
  ]);

  const envTest = read("packages/dev/src/env.test.ts");
  expectAll(envTest, "packages/dev/src/env.test.ts", [
    ["tests Better Auth provider env", "AUTH_PROVIDER=better_auth"],
    ["tests S3 endpoint env", "S3_ENDPOINT="],
    ["tests S3 public base URL env", "S3_PUBLIC_BASE_URL="]
  ]);
}

function checkExampleEnv() {
  const source = read(".env.example");
  expectAll(source, ".env.example", [
    ["defaults to Better Auth", 'AUTH_PROVIDER="better_auth"'],
    ["documents function-route token", "CARBON_FUNCTIONS_TOKEN="],
    ["documents migration database URL", "DATABASE_MIGRATION_URL="],
    ["documents app database URL", "DATABASE_URL="],
    ["documents service database URL", "DATABASE_SERVICE_URL="],
    ["documents jobs database URL", "JOBS_DATABASE_URL="],
    ["uses carbon_app for app runtime", "postgresql://carbon_app:carbon_app"],
    ["uses carbon_service for service runtime", "postgresql://carbon_service:carbon_service"],
    ["documents S3 endpoint", "S3_ENDPOINT="],
    ["documents S3 private bucket", "S3_PRIVATE_BUCKET="],
    ["documents S3 public bucket", "S3_PUBLIC_BUCKET="],
    ["documents S3 public base URL", "S3_PUBLIC_BASE_URL="]
  ]);
}

function checkPostgresInit() {
  const source = read("packages/dev/docker/postgres/001-roles.sql");
  expectAll(source, "packages/dev/docker/postgres/001-roles.sql", [
    ["creates carbon_app login role", "CREATE ROLE carbon_app LOGIN"],
    ["creates carbon_service login role", "CREATE ROLE carbon_service LOGIN"],
    ["makes carbon_service bypass RLS", "BYPASSRLS"],
    ["grants database connect to scoped roles", "GRANT CONNECT ON DATABASE carbon TO carbon_app, carbon_service"],
    ["grants public schema usage to scoped roles", "GRANT USAGE ON SCHEMA public TO carbon_app, carbon_service"],
    ["grants default table DML to scoped roles", "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO carbon_app, carbon_service"],
    ["grants default sequence usage to scoped roles", "GRANT USAGE, SELECT ON SEQUENCES TO carbon_app, carbon_service"]
  ]);
}

function checkDatabaseRoleUrlStrictness() {
  const source = read("packages/database/src/postgres.ts");
  const drizzleConfig = read("packages/database/drizzle.config.ts");
  expectAll(source, "packages/database/src/postgres.ts", [
    ["service pools require DATABASE_SERVICE_URL", 'return getEnv("DATABASE_SERVICE_URL")'],
    ["jobs pools require JOBS_DATABASE_URL", 'return getEnv("JOBS_DATABASE_URL")'],
    ["app pools require DATABASE_URL", 'return getEnv("DATABASE_URL")'],
    ["service missing-url error names DATABASE_SERVICE_URL", 'if (kind === "service") return "DATABASE_SERVICE_URL"'],
    ["jobs missing-url error names JOBS_DATABASE_URL", 'if (kind === "jobs") return "JOBS_DATABASE_URL"']
  ]);
  expectAll(drizzleConfig, "packages/database/drizzle.config.ts", [
    ["migrations require the owner role URL", "process.env.DATABASE_MIGRATION_URL"],
    ["CI migrations may use the control database URL", "process.env.CARBON_CONTROL_DATABASE_URL"],
    ["migration config fails closed without owner/control URL", "DATABASE_MIGRATION_URL or CARBON_CONTROL_DATABASE_URL is required for Drizzle migrations"],
    ["Drizzle receives the resolved migration URL only", "url: migrationUrl"]
  ]);

  for (const fallback of [
    'getEnv("DATABASE_SERVICE_URL") ?? getEnv("DATABASE_URL")',
    'getEnv("JOBS_DATABASE_URL") ?? getEnv("DATABASE_URL")',
    "process.env.DATABASE_SERVICE_URL",
    "process.env.DATABASE_URL!"
  ]) {
    if (source.includes(fallback) || drizzleConfig.includes(fallback)) {
      failures.push(
        `database connection config must not fall back across database roles: ${fallback}`
      );
    }
  }
}

function checkPg18SmokeScripts() {
  const databasePackage = JSON.parse(read("packages/database/package.json"));
  const smokeScripts = Object.entries(databasePackage.scripts ?? {})
    .filter(([name]) => name.startsWith("db:smoke:"))
    .map(([name, command]) => {
      const match = String(command).match(/\bscripts\/[^\s]+/);
      return {
        name,
        command: String(command),
        file: match?.[0] ?? null
      };
    });

  if (smokeScripts.length === 0) {
    failures.push("packages/database/package.json must expose PG18 database smoke scripts.");
  }

  const forbiddenPatterns = [
    ["local initdb shim", /run\(\s*["']initdb["']|execFileSync\(\s*["']initdb["']/],
    ["local pg_ctl shim", /\bpg_ctl\b/],
    ["local createdb shim", /\bcreatedb\b/],
    ["fake vector domain", /CREATE DOMAIN vector AS text/],
    ["temporary migration apply message", /temporary migration apply succeeded/],
    ["Unix-socket Postgres URL", /postgresql:\/\/\//],
    ["fixed smoke Postgres port env", /SMOKE_[A-Z0-9_]*PG_PORT/]
  ];

  for (const { name, command, file } of smokeScripts) {
    if (!file) {
      failures.push(`packages/database/package.json ${name} does not point at a script file: ${command}`);
      continue;
    }

    const path = `packages/database/${file}`;
    if (!existsSync(resolve(repoRoot, path))) {
      failures.push(`${name} points at missing smoke script ${path}.`);
      continue;
    }

    const source = read(path);
    expectAll(source, path, [
      ["must use the PG18 pgvector Docker image", 'pgvector/pgvector:pg18-trixie'],
      ["must mount scoped Postgres role init SQL", "/docker-entrypoint-initdb.d:ro"],
      ["must run the real Drizzle migration stack", '"db:migrate"'],
      ["must use the owner migration URL", "DATABASE_MIGRATION_URL"],
      ["must use the app runtime role URL", "DATABASE_URL"],
      ["must use the service runtime role URL", "DATABASE_SERVICE_URL"],
      ["must use carbon_service for privileged smoke setup", "carbon_service"]
    ]);

    for (const [label, pattern] of forbiddenPatterns) {
      if (pattern.test(source)) {
        failures.push(`${path} contains ${label}; smoke tests must use Docker PG18/pgvector with real migrations.`);
      }
    }
  }
}

function checkSeedCompanyDurability() {
  const source = read("packages/database/src/seed-company.ts");
  expectAll(source, "packages/database/src/seed-company.ts", [
    ["locks the company row before assigning companyGroupId", "FOR UPDATE"],
    ["seeds shared accounting data on every run", "ensureSharedAccountingData("],
    ["reuses existing chart of account numbers", 'WHERE "companyGroupId" = $1 AND number = $2'],
    ["keeps account defaults idempotent", 'SELECT 1 FROM "accountDefault" WHERE "companyId"'],
    ["keeps fiscal-year settings idempotent", 'SELECT 1 FROM "fiscalYearSettings" WHERE "companyId"'],
    ["upserts user permissions", "ON CONFLICT (id) DO UPDATE SET permissions = EXCLUDED.permissions"]
  ]);
}

function checkPg18MigrationDocs() {
  const source = read("MIGRATION_OFF_SUPABASE.md");
  const localDevStart = source.indexOf("### 12.1 Local dev");
  const localDevEnd = source.indexOf("### 12.2", localDevStart);
  const localDevSection =
    localDevStart >= 0 && localDevEnd > localDevStart
      ? source.slice(localDevStart, localDevEnd)
      : "";

  if (!localDevSection.includes("image: pgvector/pgvector:pg18-trixie")) {
    failures.push(
      "MIGRATION_OFF_SUPABASE.md local dev setup must document pgvector/pgvector:pg18-trixie as the default Postgres image."
    );
  }

  if (/image:\s*postgres:(?:1[0-7]|latest)\b/.test(localDevSection)) {
    failures.push(
      "MIGRATION_OFF_SUPABASE.md local dev setup still documents a non-PG18 Postgres image."
    );
  }
}

function checkWorkflows() {
  const deploy = read(".github/workflows/deploy.yml");
  expectAll(deploy, ".github/workflows/deploy.yml", [
    ["sets Better Auth provider for deploy", "AUTH_PROVIDER: better_auth"],
    ["uses direct S3 endpoint secret", "S3_ENDPOINT: ${{ secrets.S3_ENDPOINT }}"],
    ["uses direct S3 private bucket secret", "S3_PRIVATE_BUCKET: ${{ secrets.S3_PRIVATE_BUCKET }}"],
    ["uses direct S3 public bucket secret", "S3_PUBLIC_BUCKET: ${{ secrets.S3_PUBLIC_BUCKET }}"],
    ["uses direct S3 public base URL secret", "S3_PUBLIC_BASE_URL: ${{ secrets.S3_PUBLIC_BASE_URL }}"]
  ]);
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
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "."],
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024
    }
  )
    .split("\n")
    .filter((file) => file && existsSync(resolve(repoRoot, file)))
    .filter((file) => statSync(resolve(repoRoot, file)).isFile())
    .filter((file) => {
      const parts = file.split("/");
      return !parts.includes("node_modules") && !parts.includes(".git");
    });
}
