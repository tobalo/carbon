import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const repoRoot = resolve(packageRoot, "../..");
const failures = [];
const compatibilityTypeFiles = [];

checkPackageExports();
checkDrizzleConfig();
checkSchemaDeclaration();
checkRuntimeClient();
checkCompatibilitySurface();
checkNoFirstPartyKyselyBridge();
checkLineOrderDirectClient();

if (compatibilityTypeFiles.length > 0) {
  failures.push(
    `Legacy Database/Json compatibility consumers remain: ${compatibilityTypeFiles.join(", ")}`
  );
}

if (failures.length > 0) {
  console.error("Declarative schema audit failed:");
  for (const failure of failures.slice(0, 100)) {
    console.error(`- ${failure}`);
  }
  if (failures.length > 100) {
    console.error(`- ...and ${failures.length - 100} more failures.`);
  }
  process.exit(1);
}

console.log("Declarative schema audit passed");
console.log("- Drizzle package export checked");
console.log("- Drizzle Kit config checked");
console.log("- generated schema declaration checked");
console.log("- direct Drizzle runtime client checked");
console.log("- legacy compatibility schema removal checked");
console.log("- retired Kysely bridge surfaces checked");
console.log(
  `- legacy Database/Json compatibility consumers inventoried: ${compatibilityTypeFiles.length}`
);

function checkPackageExports() {
  const manifest = JSON.parse(readPackage("package.json"));
  expectEqual(
    manifest.exports?.["./schema"],
    "./src/schema/index.ts",
    "packages/database/package.json must export ./schema from the Drizzle schema declaration."
  );
  expectEqual(
    manifest.exports?.["./drizzle"],
    "./src/drizzle.ts",
    "packages/database/package.json must export ./drizzle from the direct Drizzle client."
  );
  expectEqual(
    manifest.exports?.["./postgres"],
    "./src/postgres.ts",
    "packages/database/package.json must export ./postgres from the plain Postgres pool helper."
  );
  if (Object.hasOwn(manifest.exports ?? {}, "./client")) {
    failures.push(
      "packages/database/package.json must not expose the retired Kysely client bridge as ./client."
    );
  }
  if (Object.hasOwn(manifest.dependencies ?? {}, "kysely")) {
    failures.push(
      "packages/database/package.json must not depend directly on Kysely after removing the package bridge."
    );
  }
  if (existsSync(resolve(packageRoot, "src/client.ts"))) {
    failures.push(
      "packages/database/src/client.ts must stay removed; use ./postgres, ./drizzle, or ./query-client instead."
    );
  }
  if (Object.hasOwn(manifest.exports ?? {}, "./types")) {
    failures.push(
      "packages/database/package.json must not expose the legacy generated type surface as ./types."
    );
  }
  if (Object.hasOwn(manifest.exports ?? {}, "./compat")) {
    failures.push(
      "packages/database/package.json must not expose the legacy compatibility facade as ./compat."
    );
  }
}

function checkDrizzleConfig() {
  const source = readPackage("drizzle.config.ts");
  expectAll(source, "packages/database/drizzle.config.ts", [
    ["uses PostgreSQL dialect", 'dialect: "postgresql"'],
    ["uses the Drizzle schema declaration", 'schema: "./src/schema/index.ts"'],
    ["emits migrations to the Drizzle directory", 'out: "./drizzle"'],
    ["uses the migration role URL", "process.env.DATABASE_MIGRATION_URL"],
    ["allows the CI control database URL", "process.env.CARBON_CONTROL_DATABASE_URL"],
    ["fails closed without an owner/control URL", "DATABASE_MIGRATION_URL or CARBON_CONTROL_DATABASE_URL is required for Drizzle migrations"],
    ["passes only the resolved migration URL to Drizzle", "url: migrationUrl"],
    ["keeps strict drift checks enabled", "strict: true"],
  ]);

  for (const forbidden of [
    "process.env.DATABASE_SERVICE_URL",
    "process.env.DATABASE_URL!"
  ]) {
    if (source.includes(forbidden)) {
      failures.push(
        `packages/database/drizzle.config.ts must not fall back to runtime database role ${forbidden}.`
      );
    }
  }
}

function checkSchemaDeclaration() {
  const source = readPackage("src/schema/index.ts");
  expectAll(source, "packages/database/src/schema/index.ts", [
    ["imports Drizzle SQL helpers", 'import { sql } from "drizzle-orm"'],
    ["declares tables with pgTable", "pgTable("],
    ["declares views with pgView", "pgView("],
    ["declares enums with pgEnum", "pgEnum("],
    ["declares inline RLS policies", "pgPolicy("],
    ["exports Better Auth schema mapping", "export const authSchema = {"],
    ["exports full schema mapping", "export const schema = {"],
    ["exports CarbonSchema type", "export type CarbonSchema = typeof schema"],
    ["exports schema JSON helper", "export type Json ="],
    ["exports schema object names", "export type SchemaObjectName = keyof CarbonSchema"],
    ["exports table object names", "export type TableObjectName = {"],
    ["exports view object names", "export type ViewObjectName = Exclude<SchemaObjectName, TableObjectName>"],
    ["exports Drizzle-inferred row helper", "export type TableRow<Name extends SchemaObjectName>"],
    ["exports Drizzle-inferred insert helper", "export type TableInsert<Name extends SchemaObjectName>"],
    ["exports Drizzle-inferred update helper", "export type TableUpdate<Name extends SchemaObjectName>"],
    ["exports Drizzle enum value helper", "export type EnumValue<Enum extends { enumValues: readonly string[] }>"],
    ["exports direct query database helper", "export type QueryDatabase = {"],
  ]);

  if (/from\s+["'][^"']*types(?:\.ts)?["']/.test(source)) {
    failures.push(
      "packages/database/src/schema/index.ts must not import the legacy generated type surface."
    );
  }
  if (source.includes("src/types.ts")) {
    failures.push(
      "packages/database/src/schema/index.ts should describe the Drizzle declaration, not the compatibility input file."
    );
  }
}

function checkRuntimeClient() {
  const source = readPackage("src/drizzle.ts");
  expectAll(source, "packages/database/src/drizzle.ts", [
    ["imports the Drizzle schema", 'import { schema } from "./schema"'],
    ["types the client from the schema", "NodePgDatabase<typeof schema>"],
    ["creates Drizzle clients with schema", "drizzle(pool, { schema })"],
    ["exports app Drizzle client", "export const db = getDrizzleClient(appPool)"],
    [
      "exports service Drizzle client",
      "export const dbService = getDrizzleClient(servicePool)",
    ],
    ["sets user RLS context", "set_config('app.user_id'"],
    ["sets API key RLS context", "set_config('app.api_key_id'"],
  ]);
}

function checkCompatibilitySurface() {
  const indexSource = readPackage("src/index.ts");
  if (indexSource.includes('export * from "./types.ts"')) {
    failures.push(
      "packages/database/src/index.ts must not wildcard-export the legacy generated type surface."
    );
  }
  if (/export\s+type\s+\{[^}]*\b(?:Database|Json)\b[^}]*\}\s+from\s+["']\.\/compat(?:\.ts)?["']/.test(indexSource)) {
    failures.push(
      "packages/database/src/index.ts must not export the legacy compatibility types."
    );
  }
  expectAll(indexSource, "packages/database/src/index.ts", [
    ["keeps utilities exported", 'export * from "./utils.ts"'],
  ]);
  if (existsSync(resolve(packageRoot, "src/types.ts"))) {
    failures.push(
      "packages/database/src/types.ts must be removed; use @carbon/database/schema helpers instead."
    );
  }
  if (existsSync(resolve(packageRoot, "src/compat.ts"))) {
    failures.push(
      "packages/database/src/compat.ts must be removed with the legacy generated type surface."
    );
  }

  for (const file of sourceFiles()) {
    const source = readRepo(file);
    if (
      /from\s+["']@carbon\/database\/(?:src\/)?types(?:\.ts)?["']/.test(source)
    ) {
      failures.push(`${file} imports the legacy generated type surface directly.`);
    }

    if (
      file.startsWith("packages/database/src/") &&
      file !== "packages/database/src/index.ts" &&
      /from\s+["']\.\/types(?:\.ts)?["']/.test(source)
    ) {
      failures.push(
        `${file} imports the package compatibility type file directly.`
      );
    }

    if (
      file.startsWith("packages/database/src/") &&
      file !== "packages/database/src/compat.ts" &&
      /from\s+["']\.\/compat(?:\.ts)?["']/.test(source)
    ) {
      failures.push(`${file} imports the legacy compatibility facade.`);
    }

    if (
      /import\s+type\s+\{[^}]*\b(?:Database|Json)\b[^}]*\}\s+from\s+["']@carbon\/database["']/.test(
        source
      )
    ) {
      compatibilityTypeFiles.push(file);
    }
    if (
      /import\s+\{[^}]*\b(?:Database|Json)\b[^}]*\}\s+from\s+["']@carbon\/database["']/.test(
        source
      )
    ) {
      failures.push(`${file} imports Database/Json as runtime values.`);
    }
  }
}

function checkNoFirstPartyKyselyBridge() {
  const offenders = sourceFiles()
    .filter((file) => file !== "packages/database/scripts/audit-declarative-schema.mjs")
    .filter((file) => {
      const source = readRepo(file);
      return (
        /from\s+["']@carbon\/database\/client["']/.test(source) ||
        /from\s+["']kysely["']/.test(source) ||
        /\bKysely(?:Database|Tx|DbTx)?\b/.test(source) ||
        /getPostgresClient/.test(source) ||
        /PostgresDriver/.test(source) ||
        /getDatabaseClient/.test(source) ||
        /\.selectFrom\(/.test(source) ||
        /\.insertInto\(/.test(source) ||
        /\.updateTable\(/.test(source) ||
        /\.deleteFrom\(/.test(source) ||
        /\.executeTakeFirst/.test(source)
      );
    });

  if (offenders.length > 0) {
    failures.push(
      `First-party source must stay free of the retired Kysely bridge/query builder: ${offenders.join(", ")}`
    );
  }

  const manifests = git(
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "package.json",
    "apps",
    "packages"
  )
    .split("\n")
    .filter((file) => file.endsWith("package.json"))
    .filter((file) => existsSync(resolve(repoRoot, file)));

  const dependencyOffenders = [];
  for (const file of manifests) {
    const manifest = JSON.parse(readRepo(file));
    const sections = [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies"
    ];
    for (const section of sections) {
      if (Object.hasOwn(manifest[section] ?? {}, "kysely")) {
        dependencyOffenders.push(`${file}#${section}`);
      }
    }
  }

  if (dependencyOffenders.length > 0) {
    failures.push(
      `First-party package manifests must not depend directly on Kysely: ${dependencyOffenders.join(", ")}`
    );
  }
}

function checkLineOrderDirectClient() {
  const serviceFiles = [
    "apps/erp/app/modules/invoicing/invoicing.service.ts",
    "apps/erp/app/modules/purchasing/purchasing.service.ts",
    "apps/erp/app/modules/sales/sales.service.ts",
  ];
  const routeFiles = [
    "apps/erp/app/routes/x+/purchase-invoice+/$invoiceId.line-order.tsx",
    "apps/erp/app/routes/x+/sales-invoice+/$invoiceId.line-order.tsx",
    "apps/erp/app/routes/x+/purchase-order+/$orderId.line-order.tsx",
    "apps/erp/app/routes/x+/supplier-quote+/$id.line-order.tsx",
    "apps/erp/app/routes/x+/purchasing-rfq+/$id.line-order.tsx",
    "apps/erp/app/routes/x+/quote+/$quoteId.line-order.tsx",
    "apps/erp/app/routes/x+/sales-order+/$orderId.line-order.tsx",
    "apps/erp/app/routes/x+/sales-rfq+/$rfqId.line-order.tsx",
  ];
  const itemRouteFiles = [
    "apps/erp/app/routes/x+/items+/update.tsx",
    "apps/erp/app/routes/x+/consumable+/$itemId.inventory.tsx",
    "apps/erp/app/routes/x+/part+/$itemId.inventory.tsx",
    "apps/erp/app/routes/x+/material+/$itemId.inventory.tsx",
    "apps/erp/app/routes/x+/tool+/$itemId.inventory.tsx",
    "apps/erp/app/routes/x+/consumable+/$itemId.purchasing.$supplierPartId.tsx",
    "apps/erp/app/routes/x+/part+/$itemId.purchasing.$supplierPartId.tsx",
    "apps/erp/app/routes/x+/material+/$itemId.purchasing.$supplierPartId.tsx",
    "apps/erp/app/routes/x+/tool+/$itemId.purchasing.$supplierPartId.tsx",
  ];
  const approvalRouteFiles = [
    "apps/erp/app/routes/x+/purchase-order+/$orderId.tsx",
    "apps/erp/app/routes/x+/supplier+/$supplierId.approval.tsx",
    "apps/erp/app/routes/x+/quality-document+/$id.tsx",
    "apps/erp/app/routes/api+/mcp+/lib/tools/shared.ts",
  ];
  const erpBridgeSingleton = "apps/erp/app/services/database.server.ts";

  if (existsSync(resolve(repoRoot, erpBridgeSingleton))) {
    failures.push(
      `${erpBridgeSingleton} must stay removed; ERP writes should use request-scoped direct clients or Drizzle withAuth helpers.`
    );
  }

  const erpManifest = JSON.parse(readRepo("apps/erp/package.json"));
  if (
    Object.hasOwn(erpManifest.dependencies ?? {}, "kysely") ||
    Object.hasOwn(erpManifest.devDependencies ?? {}, "kysely")
  ) {
    failures.push(
      "apps/erp/package.json must not depend directly on Kysely after removing the ERP app bridge."
    );
  }

  const erpBridgeFiles = git(
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "apps/erp/app"
  )
    .split("\n")
    .filter((file) => file && existsSync(resolve(repoRoot, file)))
    .filter((file) => /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(file))
    .filter((file) => {
      const source = readRepo(file);
      return (
        /from\s+["']@carbon\/database\/client["']/.test(source) ||
        /from\s+["']~\/services\/database\.server["']/.test(source) ||
        /from\s+["']kysely["']/.test(source) ||
        /getDatabaseClient/.test(source) ||
        /\bKysely(?:Database)?\b/.test(source)
      );
    });

  if (erpBridgeFiles.length > 0) {
    failures.push(
      `ERP app source must stay free of the Kysely bridge: ${erpBridgeFiles.join(", ")}`
    );
  }

  for (const file of serviceFiles) {
    const source = readRepo(file);
    if (
      /from\s+["']@carbon\/database\/client["']/.test(source) ||
      /\bKysely(?:Database)?\b/.test(source)
    ) {
      failures.push(
        `${file} must keep line-order helpers on CarbonDatabaseClient instead of the Kysely bridge.`
      );
    }
  }

  for (const file of routeFiles) {
    const source = readRepo(file);
    if (
      /getDatabaseClient/.test(source) ||
      /from\s+["']~\/services\/database\.server["']/.test(source)
    ) {
      failures.push(
        `${file} must use the requirePermissions() request client for line-order updates.`
      );
    }
  }

  const itemsService = readRepo("apps/erp/app/modules/items/items.service.ts");
  if (
    /from\s+["']@carbon\/database\/client["']/.test(itemsService) ||
    /\bKysely(?:Database)?\b/.test(itemsService)
  ) {
    failures.push(
      "apps/erp/app/modules/items/items.service.ts must stay free of the Kysely bridge."
    );
  }

  const itemsServer = readRepo("apps/erp/app/modules/items/items.server.ts");
  if (
    !itemsServer.includes('from "@carbon/database/drizzle"') ||
    !itemsServer.includes("withAuth")
  ) {
    failures.push(
      "apps/erp/app/modules/items/items.server.ts must keep transactional item helpers on direct Drizzle withAuth."
    );
  }
  if (
    /from\s+["']@carbon\/database\/client["']/.test(itemsServer) ||
    /\bKysely(?:Database)?\b/.test(itemsServer)
  ) {
    failures.push(
      "apps/erp/app/modules/items/items.server.ts must not reintroduce the Kysely bridge."
    );
  }

  for (const file of itemRouteFiles) {
    const source = readRepo(file);
    if (
      /getDatabaseClient/.test(source) ||
      /from\s+["']~\/services\/database\.server["']/.test(source)
    ) {
      failures.push(
        `${file} must use server-only direct Drizzle helpers instead of getDatabaseClient().`
      );
    }
  }

  const sharedService = readRepo(
    "apps/erp/app/modules/shared/shared.service.ts"
  );
  if (
    /from\s+["']@carbon\/database\/client["']/.test(sharedService) ||
    /\bKysely(?:Database)?\b/.test(sharedService)
  ) {
    failures.push(
      "apps/erp/app/modules/shared/shared.service.ts must stay free of the Kysely bridge."
    );
  }

  const sharedServer = readRepo("apps/erp/app/modules/shared/shared.server.ts");
  if (
    !sharedServer.includes('from "@carbon/database/drizzle"') ||
    !sharedServer.includes("withAuth")
  ) {
    failures.push(
      "apps/erp/app/modules/shared/shared.server.ts must keep approval decisions on direct Drizzle withAuth."
    );
  }
  if (
    /from\s+["']~\/services\/database\.server["']/.test(sharedServer) ||
    /getDatabaseClient/.test(sharedServer) ||
    /from\s+["']@carbon\/database\/client["']/.test(sharedServer) ||
    /\bKysely(?:Database)?\b/.test(sharedServer)
  ) {
    failures.push(
      "apps/erp/app/modules/shared/shared.server.ts must not reintroduce the Kysely bridge or getDatabaseClient()."
    );
  }

  for (const file of approvalRouteFiles) {
    const source = readRepo(file);
    if (
      /approveRequest\([^,\n]+,\s*[^,\n]+,\s*[^,\n]+,\s*/.test(source) ||
      /rejectRequest\([^,\n]+,\s*[^,\n]+,\s*[^,\n]+,\s*/.test(source)
    ) {
      failures.push(
        `${file} must call the server-only approval decision helpers without a database argument.`
      );
    }
  }

  const salesServer = readRepo("apps/erp/app/modules/sales/sales.server.ts");
  if (
    /from\s+["']~\/services\/database\.server["']/.test(salesServer) ||
    /getDatabaseClient/.test(salesServer) ||
    /from\s+["']@carbon\/database\/client["']/.test(salesServer) ||
    /\bKysely(?:Database)?\b/.test(salesServer)
  ) {
    failures.push(
      "apps/erp/app/modules/sales/sales.server.ts must keep duplicate-price overrides on direct query reads plus Drizzle withAuth writes."
    );
  }

  const qualityServer = readRepo(
    "apps/erp/app/modules/quality/quality.server.ts"
  );
  if (
    !qualityServer.includes('from "@carbon/database/drizzle"') ||
    !qualityServer.includes("withAuth")
  ) {
    failures.push(
      "apps/erp/app/modules/quality/quality.server.ts must keep quality transactions on direct Drizzle withAuth."
    );
  }
  if (
    /from\s+["']~\/services\/database\.server["']/.test(qualityServer) ||
    /getDatabaseClient/.test(qualityServer) ||
    /from\s+["']@carbon\/database\/client["']/.test(qualityServer) ||
    /from\s+["']kysely["']/.test(qualityServer) ||
    /\bKysely(?:Database)?\b/.test(qualityServer)
  ) {
    failures.push(
      "apps/erp/app/modules/quality/quality.server.ts must not reintroduce the Kysely bridge or getDatabaseClient()."
    );
  }
}

function expectAll(source, file, checks) {
  for (const [description, snippet] of checks) {
    if (!source.includes(snippet)) {
      failures.push(`${file} ${description}.`);
    }
  }
}

function expectEqual(actual, expected, message) {
  if (actual !== expected) {
    failures.push(`${message} Expected ${expected}, found ${actual ?? "<missing>"}.`);
  }
}

function readPackage(path) {
  return readFileSync(resolve(packageRoot, path), "utf8");
}

function readRepo(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function sourceFiles() {
  return git(
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "apps",
    "packages"
  )
    .split("\n")
    .filter((file) => file && existsSync(resolve(repoRoot, file)))
    .filter((file) => /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(file))
    .filter(
      (file) =>
        !file.includes("/node_modules/") &&
        !file.includes("/dist/") &&
        !file.includes("/build/")
    );
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
}
