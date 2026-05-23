import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const schemaPath = resolve(packageRoot, "src/schema/index.ts");
const drizzlePath = resolve(packageRoot, "src/drizzle.ts");
const queryClientPath = resolve(packageRoot, "src/query-client.ts");
const migrationsDir = resolve(packageRoot, "drizzle");
const tenantOperations = ["select", "insert", "update", "delete"];
const listOpenTables = process.argv.includes("--list-open");
const authTables = new Set([
  "authAccount",
  "authSession",
  "authUser",
  "authVerification",
]);
const publicReadTables = new Set([
  "attributeDataType",
  "config",
  "country",
  "currencyCode",
  "customFieldTable",
  "integration",
  "period",
  "plan",
  "webhookTable",
]);
const serviceOnlyTables = new Set(["searchIndex_CYj9v111oXXm6PX9ZD6Yn2"]);

const schema = readFileSync(schemaPath, "utf8");
const drizzleSource = readFileSync(drizzlePath, "utf8");
const queryClientSource = readFileSync(queryClientPath, "utf8");
const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();
const migrationSql = migrationFiles
  .map((file) => readFileSync(resolve(migrationsDir, file), "utf8"))
  .join("\n");

const failures = [];
const generatedTables = parseGeneratedTables(schema);
const migrationTables = parseMigrationTables(migrationSql);
const migrationRlsTables = parseMigrationRlsTables(migrationSql);
const migrationPolicies = parseMigrationPolicies(migrationSql);

const generatedRlsScopes = computeTenantScopes(generatedTables);
const generatedBaselineRlsTables = setFrom(generatedRlsScopes.keys());
const generatedRlsTables = setFrom(
  generatedTables.filter((table) => table.rlsEnabled).map((table) => table.name)
);
const migrationRlsTableSet = setFrom(migrationRlsTables);
const generatedPolicyTables = setFrom(
  generatedTables
    .filter((table) =>
      table.block.includes(`pgPolicy("${table.name}_tenant_`) ||
      table.block.includes(`pgPolicy("${table.name}_public_`)
    )
    .map((table) => table.name)
);
const migrationPolicyTables = setFrom([...migrationPolicies.keys()]);

compareSets(
  "generated baseline RLS tables",
  generatedBaselineRlsTables,
  "generated RLS tables",
  generatedRlsTables
);
compareSets(
  "generated baseline RLS tables",
  generatedBaselineRlsTables,
  "migration RLS tables",
  migrationRlsTableSet
);

for (const table of sorted(generatedBaselineRlsTables)) {
  const tenantScope = generatedRlsScopes.get(table);
  const generated = generatedTables.find((entry) => entry.name === table);
  if (!generated) {
    failures.push(`Missing generated pgTable for source table "${table}".`);
    continue;
  }

  if (tenantScope.columnName && !generated.columns.has(tenantScope.columnName)) {
    failures.push(
      `Generated table "${table}" is missing RLS column "${tenantScope.columnName}".`
    );
  }
  if (!generated.rlsEnabled) {
    failures.push(`Generated table "${table}" is missing .enableRLS().`);
  }

  if (tenantScope.kind === "serviceOnly") {
    if (generated.block.includes("pgPolicy(")) {
      failures.push(`Generated service-only table "${table}" has an app policy.`);
    }
    continue;
  }

  if (tenantScope.kind === "publicRead") {
    const policyName = `${table}_public_select`;
    const policyIndex = generated.block.indexOf(`pgPolicy("${policyName}"`);
    if (policyIndex === -1) {
      failures.push(`Generated table "${table}" is missing ${policyName}.`);
      continue;
    }

    const policyBlock = generated.block.slice(
      policyIndex,
      findPolicyBlockEnd(generated.block, policyIndex)
    );
    if (!policyBlock.includes('for: "select"')) {
      failures.push(`Generated policy "${policyName}" is not SELECT-only.`);
    }
    if (!policyBlock.includes('to: "carbon_app"')) {
      failures.push(`Generated policy "${policyName}" does not target carbon_app.`);
    }
    if (!policyBlock.includes("using: sql`true`")) {
      failures.push(`Generated policy "${policyName}" is not public read-only.`);
    }
    continue;
  }

  for (const operation of tenantOperations) {
    const policyName = `${table}_tenant_${operation}`;
    const policyIndex = generated.block.indexOf(`pgPolicy("${policyName}"`);
    if (policyIndex === -1) {
      failures.push(`Generated table "${table}" is missing ${policyName}.`);
      continue;
    }

    const policyBlock = generated.block.slice(
      policyIndex,
      findPolicyBlockEnd(generated.block, policyIndex)
    );
    if (!policyBlock.includes(`for: "${operation}"`)) {
      failures.push(`Generated policy "${policyName}" has the wrong operation.`);
    }
    if (!policyBlock.includes('to: "carbon_app"')) {
      failures.push(`Generated policy "${policyName}" does not target carbon_app.`);
    }
    if (tenantScope.kind === "direct") {
      if (!policyBlock.includes(`${tenantScope.contextFunction}()`)) {
        failures.push(
          `Generated policy "${policyName}" does not use ${tenantScope.contextFunction}().`
        );
      }
      if (!policyBlock.includes(`t["${tenantScope.columnName}"]`)) {
        failures.push(
          `Generated policy "${policyName}" does not use tenant column "${tenantScope.columnName}".`
        );
      }
    } else if (tenantScope.kind === "userMembership") {
      const expectedPredicate = `sql.raw(${quote(
        formatUserMembershipPredicate(table, tenantScope)
      )})`;
      if (!policyBlock.includes(expectedPredicate)) {
        failures.push(
          `Generated policy "${policyName}" does not use user membership scope.`
        );
      }
    } else {
      const expectedPredicate = `sql.raw(${quote(
        formatParentPredicate(table, tenantScope)
      )})`;
      if (!policyBlock.includes(expectedPredicate)) {
        failures.push(
          `Generated policy "${policyName}" does not use parent scope ${tenantScope.parentTableName}.${tenantScope.parentColumnName}.`
        );
      }
    }
    if (operation === "insert") {
      if (!policyBlock.includes("withCheck:")) {
        failures.push(`Generated insert policy "${policyName}" lacks withCheck.`);
      }
    } else if (operation === "update") {
      if (!policyBlock.includes("using:") || !policyBlock.includes("withCheck:")) {
        failures.push(
          `Generated update policy "${policyName}" lacks using or withCheck.`
        );
      }
    } else if (!policyBlock.includes("using:")) {
      failures.push(`Generated ${operation} policy "${policyName}" lacks using.`);
    }
  }
}

for (const table of sorted(generatedBaselineRlsTables)) {
  const tenantScope = generatedRlsScopes.get(table);
  if (!migrationRlsTables.has(table)) {
    failures.push(`Migration table "${table}" is missing ENABLE ROW LEVEL SECURITY.`);
  }

  const tablePolicies = migrationPolicies.get(table) ?? new Map();
  if (tenantScope.kind === "serviceOnly") {
    if (tablePolicies.size > 0) {
      failures.push(`Migration service-only table "${table}" has app policies.`);
    }
    continue;
  }

  if (tenantScope.kind === "publicRead") {
    const policy = tablePolicies.get(policyKey("public", "select"));
    if (!policy) {
      failures.push(`Migration table "${table}" is missing ${table}_public_select.`);
    } else if (!policy.includes("USING (true)")) {
      failures.push(
        `Migration policy "${table}_public_select" is not public read-only.`
      );
    }
    for (const operation of tenantOperations) {
      if (tablePolicies.has(policyKey("tenant", operation))) {
        failures.push(
          `Migration public-read table "${table}" unexpectedly has tenant ${operation}.`
        );
      }
    }
    continue;
  }

  for (const operation of tenantOperations) {
    const policy = tablePolicies.get(policyKey("tenant", operation));
    if (!policy) {
      failures.push(
        `Migration table "${table}" is missing ${table}_tenant_${operation}.`
      );
    } else if (!policy.includes(formatMigrationPredicate(table, tenantScope))) {
      failures.push(
        `Migration policy "${table}_tenant_${operation}" does not use the expected tenant predicate.`
      );
    }
  }
}

for (const table of sorted(difference(generatedPolicyTables, generatedBaselineRlsTables))) {
  failures.push(`Generated non-RLS table "${table}" has an app RLS policy.`);
}

for (const table of sorted(difference(migrationPolicyTables, generatedBaselineRlsTables))) {
  failures.push(`Migration non-RLS table "${table}" has an app RLS policy.`);
}

for (const table of sorted(authTables)) {
  const generated = generatedTables.find((entry) => entry.name === table);
  const migration = migrationTables.find((entry) => entry.name === table);

  if (!generated) {
    failures.push(`Auth table "${table}" is missing from generated schema.`);
  }
  if (!migration) {
    failures.push(`Auth table "${table}" is missing from migrations.`);
  }
  if (generated?.block.includes(".enableRLS();")) {
    failures.push(`Auth table "${table}" unexpectedly enables tenant RLS.`);
  }
  if (migrationRlsTables.has(table)) {
    failures.push(`Auth table "${table}" unexpectedly enables SQL RLS.`);
  }
  if (generatedPolicyTables.has(table) || migrationPolicyTables.has(table)) {
    failures.push(`Auth table "${table}" unexpectedly has app RLS policies.`);
  }
}

if (!migrationSql.includes("CREATE ROLE carbon_app")) {
  failures.push("Migrations do not create the carbon_app role.");
}
if (!migrationSql.includes("CREATE ROLE carbon_service")) {
  failures.push("Migrations do not create the carbon_service role.");
}
if (!migrationSql.includes("BYPASSRLS")) {
  failures.push("Migrations do not mark the service role as BYPASSRLS.");
}
if (!migrationSql.includes("CREATE OR REPLACE FUNCTION app_companies_for_context()")) {
  failures.push("Migrations do not create app_companies_for_context().");
}
if (!migrationSql.includes("current_setting('app.user_id', true)")) {
  failures.push("Migrations do not read the app.user_id RLS context setting.");
}
if (!migrationSql.includes("current_setting('app.api_key_id', true)")) {
  failures.push("Migrations do not read the app.api_key_id RLS context setting.");
}
if (!drizzleSource.includes("set_config('app.user_id'")) {
  failures.push("withAuth does not set the app.user_id RLS context setting.");
}
if (!drizzleSource.includes("set_config('app.api_key_id'")) {
  failures.push("withAuth does not set the app.api_key_id RLS context setting.");
}
if (!queryClientSource.includes("set_config('app.user_id'")) {
  failures.push(
    "The direct query client does not set the app.user_id RLS context setting."
  );
}
if (!queryClientSource.includes("set_config('app.api_key_id'")) {
  failures.push(
    "The direct query client does not set the app.api_key_id RLS context setting."
  );
}
if (
  [...generatedRlsScopes.values()].some(
    (scope) => scope.contextFunction === "app_company_groups_for_context"
  ) &&
  !migrationSql.includes("CREATE OR REPLACE FUNCTION app_company_groups_for_context()")
) {
  failures.push("Migrations do not create app_company_groups_for_context().");
}

if (failures.length > 0) {
  console.error("RLS audit failed:");
  for (const failure of failures.slice(0, 80)) {
    console.error(`- ${failure}`);
  }
  if (failures.length > 80) {
    console.error(`- ...and ${failures.length - 80} more failures.`);
  }
  process.exit(1);
}

const nonTenantSourceTables = generatedTables.filter(
  (table) => !generatedRlsScopes.has(table.name)
);
const tenantScopedTableCount = [...generatedRlsScopes.values()].filter((scope) =>
  ["direct", "parent", "userMembership"].includes(scope.kind)
).length;
const publicReadTableCount = [...generatedRlsScopes.values()].filter(
  (scope) => scope.kind === "publicRead"
).length;
const serviceOnlyTableCount = [...generatedRlsScopes.values()].filter(
  (scope) => scope.kind === "serviceOnly"
).length;
const trackedAuthTables = [...authTables].filter(
  (table) =>
    generatedTables.some((entry) => entry.name === table) &&
    migrationTables.some((entry) => entry.name === table)
);

console.log("RLS audit passed");
console.log(`- generated baseline RLS tables: ${generatedBaselineRlsTables.size}`);
console.log(`- generated RLS tables: ${generatedRlsTables.size}`);
console.log(`- migration RLS tables: ${migrationRlsTableSet.size}`);
console.log(
  `- tenant/member policies checked: ${tenantScopedTableCount * tenantOperations.length}`
);
console.log(`- public read policies checked: ${publicReadTableCount}`);
console.log(`- service-only RLS tables checked: ${serviceOnlyTableCount}`);
console.log(
  `- generated tables without baseline RLS: ${nonTenantSourceTables.length}`
);
if (listOpenTables) {
  console.log(
    `- open non-baseline-RLS tables: ${nonTenantSourceTables
      .map((table) => table.name)
      .sort()
      .join(", ")}`
  );
}
console.log(
  `- auth tables tracked outside app RLS: ${trackedAuthTables.sort().join(", ")}`
);
console.log(`- migration files audited: ${migrationFiles.join(", ")}`);

function computeTenantScopes(tables) {
  const scopes = new Map();

  for (const table of tables) {
    const directScope = getDirectTenantScope(table);
    if (directScope) {
      scopes.set(table.name, directScope);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;

    for (const table of tables) {
      if (scopes.has(table.name)) {
        continue;
      }

      for (const [columnName, reference] of table.references) {
        const referenceScope = scopes.get(reference.tableName);
        if (
          !referenceScope ||
          !canInheritTenantScope(referenceScope, columnName)
        ) {
          continue;
        }

        scopes.set(table.name, {
          kind: "parent",
          columnName,
          parentTableName: reference.tableName,
          parentColumnName: reference.columnName,
        });
        changed = true;
        break;
      }
    }
  }

  return scopes;
}

function canInheritTenantScope(scope, columnName) {
  if (["publicRead", "serviceOnly"].includes(scope.kind)) {
    return false;
  }

  if (scope.kind === "userMembership") {
    return columnName === "userId" || columnName === "id";
  }

  return true;
}

function getDirectTenantScope(table) {
  if (serviceOnlyTables.has(table.name)) {
    return {
      kind: "serviceOnly",
    };
  }

  if (publicReadTables.has(table.name)) {
    return {
      kind: "publicRead",
    };
  }

  if (table.name === "user" && table.columns.has("id")) {
    return {
      kind: "userMembership",
      columnName: "id",
    };
  }

  if (table.columns.has("companyId")) {
    return {
      kind: "direct",
      columnName: "companyId",
      contextFunction: "app_companies_for_context",
    };
  }

  if (table.name === "company" && table.columns.has("id")) {
    return {
      kind: "direct",
      columnName: "id",
      contextFunction: "app_companies_for_context",
    };
  }

  const idReference = table.references.get("id");
  if (idReference?.tableName === "company" && idReference.columnName === "id") {
    return {
      kind: "direct",
      columnName: "id",
      contextFunction: "app_companies_for_context",
    };
  }

  if (table.columns.has("companyGroupId")) {
    return {
      kind: "direct",
      columnName: "companyGroupId",
      contextFunction: "app_company_groups_for_context",
    };
  }

  if (table.name === "companyGroup" && table.columns.has("id")) {
    return {
      kind: "direct",
      columnName: "id",
      contextFunction: "app_company_groups_for_context",
    };
  }

  return null;
}

function parseGeneratedTables(text) {
  const tableMatcher =
    /^export const ([A-Za-z0-9_]+) = pgTable\("([^"]+)", \{/gm;
  const exportMatcher = /^export const /gm;
  const exports = [...text.matchAll(exportMatcher)].map((match) => match.index);
  const tableMatches = [...text.matchAll(tableMatcher)];
  const variableToTable = new Map(
    tableMatches.map((match) => [match[1], match[2]])
  );
  const tables = [];

  for (const match of tableMatches) {
    const nextExport = exports.find((index) => index > match.index) ?? text.length;
    const openIndex = text.indexOf("{", match.index);
    const columns = readBalanced(text, openIndex, "{", "}");
    const block = text.slice(match.index, nextExport);
    tables.push({
      name: match[2],
      columns: setFrom(parseGeneratedColumnNames(columns.content)),
      references: parseGeneratedReferences(columns.content, variableToTable),
      rlsEnabled: block.includes(".enableRLS();"),
      block,
    });
  }

  return tables;
}

function parseGeneratedReferences(block, variableToTable) {
  const references = new Map();
  const matcher =
    /^ {2}"([^"]+)": [^\n]*\.references\(\(\) => ([A-Za-z0-9_]+)\["([^"]+)"\]\)/gm;
  let match;

  while ((match = matcher.exec(block)) !== null) {
    const [, columnName, targetVariable, targetColumn] = match;
    const targetTable = variableToTable.get(targetVariable);
    if (targetTable && !references.has(columnName)) {
      references.set(columnName, {
        tableName: targetTable,
        columnName: targetColumn,
      });
    }
  }

  return references;
}

function parseMigrationTables(sql) {
  const tableMatcher = /CREATE TABLE "([^"]+)" \(/g;
  const tables = [];
  let match;

  while ((match = tableMatcher.exec(sql)) !== null) {
    const end = sql.indexOf("\n);", match.index);
    const block = sql.slice(match.index, end === -1 ? sql.length : end);
    tables.push({
      name: match[1],
      columns: setFrom(parseMigrationColumnNames(block)),
    });
  }

  return tables;
}

function parseMigrationRlsTables(sql) {
  return setFrom(
    [...sql.matchAll(/ALTER TABLE "([^"]+)" ENABLE ROW LEVEL SECURITY/g)].map(
      (match) => match[1]
    )
  );
}

function parseMigrationPolicies(sql) {
  const policyMatcher =
    /CREATE POLICY "([^"]+)_(tenant|public)_(select|insert|update|delete)" ON "([^"]+)"[^;]*;/g;
  const policies = new Map();
  let match;

  while ((match = policyMatcher.exec(sql)) !== null) {
    const [, policyTable, policyKind, operation, targetTable] = match;
    if (policyTable !== targetTable) {
      failures.push(
        `Migration policy "${policyTable}_${policyKind}_${operation}" targets "${targetTable}".`
      );
      continue;
    }
    if (policyKind === "public" && operation !== "select") {
      failures.push(
        `Migration policy "${policyTable}_public_${operation}" should be SELECT-only.`
      );
      continue;
    }

    const tablePolicies = policies.get(targetTable) ?? new Map();
    tablePolicies.set(policyKey(policyKind, operation), match[0]);
    policies.set(targetTable, tablePolicies);
  }

  return policies;
}

function policyKey(policyKind, operation) {
  return `${policyKind}:${operation}`;
}

function compareSets(leftName, left, rightName, right) {
  for (const item of sorted(difference(left, right))) {
    failures.push(`"${item}" exists in ${leftName} but not in ${rightName}.`);
  }
  for (const item of sorted(difference(right, left))) {
    failures.push(`"${item}" exists in ${rightName} but not in ${leftName}.`);
  }
}

function formatMigrationPredicate(tableName, scope) {
  if (scope.kind === "direct") {
    return `"${tableName}"."${scope.columnName}" = ANY(${scope.contextFunction}())`;
  }

  if (scope.kind === "userMembership") {
    return formatUserMembershipPredicate(tableName, scope);
  }

  return formatParentPredicate(tableName, scope);
}

function formatUserMembershipPredicate(tableName, scope) {
  return `EXISTS (SELECT 1 FROM "userToCompany" WHERE "userToCompany"."userId" = ${sqlIdentifier(
    tableName
  )}.${sqlIdentifier(
    scope.columnName
  )} AND "userToCompany"."companyId" = ANY(app_companies_for_context()))`;
}

function formatParentPredicate(tableName, scope) {
  return `EXISTS (SELECT 1 FROM ${sqlIdentifier(
    scope.parentTableName
  )} WHERE ${sqlIdentifier(scope.parentTableName)}.${sqlIdentifier(
    scope.parentColumnName
  )} = ${sqlIdentifier(tableName)}.${sqlIdentifier(scope.columnName)})`;
}

function findPolicyBlockEnd(text, start) {
  const nextPolicy = text.indexOf("  pgPolicy(", start + 1);
  const tableEnd = text.indexOf("]).enableRLS();", start + 1);

  if (nextPolicy !== -1 && nextPolicy < tableEnd) {
    return nextPolicy;
  }

  return tableEnd === -1 ? text.length : tableEnd;
}

function readBalanced(text, openIndex, openToken, closeToken) {
  let depth = 0;
  let stringQuote = null;
  let escaped = false;

  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];

    if (stringQuote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === stringQuote) {
        stringQuote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      stringQuote = char;
      continue;
    }

    if (char === openToken) {
      depth += 1;
    } else if (char === closeToken) {
      depth -= 1;
      if (depth === 0) {
        return {
          content: text.slice(openIndex + 1, index),
          end: index,
        };
      }
    }
  }

  throw new Error(`Unbalanced ${openToken}${closeToken} block`);
}

function parseGeneratedColumnNames(block) {
  return [...block.matchAll(/^ {2}"([^"]+)":/gm)].map((match) => match[1]);
}

function parseMigrationColumnNames(block) {
  return [...block.matchAll(/^\s+"([^"]+)"\s+/gm)].map((match) => match[1]);
}

function difference(left, right) {
  return new Set([...left].filter((item) => !right.has(item)));
}

function setFrom(items) {
  return new Set(items);
}

function sorted(items) {
  return [...items].sort((left, right) => left.localeCompare(right));
}

function quote(value) {
  return JSON.stringify(value);
}

function sqlIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}
