import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const schemaPath = resolve(packageRoot, "src/schema/index.ts");
const migrationsDir = resolve(packageRoot, "drizzle");
const authTables = new Set([
  "authAccount",
  "authSession",
  "authUser",
  "authVerification",
]);
const expectedUniqueConstraints = new Set([
  "authSession_token_unique",
  "authUser_email_unique",
  "oauthClient_clientId_unique",
  "searchIndexRegistry_companyId_key",
  "unique_subscription_name_per_company",
]);
const expectedStaticIndexes = new Set([
  "itemStockQuantities_companyId_idx",
  "itemStockQuantities_itemId_companyId_locationId_idx",
]);
const failures = [];

const schema = readFileSync(schemaPath, "utf8");
const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();
const migrationFileTags = migrationFiles.map((file) =>
  file.replace(/\.sql$/, "")
);
const migrationJournalTags = parseMigrationJournalTags();
const migrationSql = migrationFiles
  .map((file) => readFileSync(resolve(migrationsDir, file), "utf8"))
  .join("\n");

const generatedTables = parseGeneratedObjects(schema, "pgTable");
const generatedViews = parseGeneratedObjects(schema, "pgView");
const generatedEnums = parseGeneratedEnums(schema);
const migrationTables = parseMigrationTables(migrationSql);
const migrationViews = parseMigrationViews(migrationSql);
const migrationEnums = parseMigrationEnums(migrationSql);
const scopeIndexTargets = getScopeIndexTargets(migrationTables);
const hasScopeIndexMigration = parseHasScopeIndexMigration(migrationSql);
const hasItemStockQuantitiesRefresh = parseHasItemStockQuantitiesRefresh(
  migrationSql
);
const hasAuditLogDynamicIndexes = parseHasAuditLogDynamicIndexes(migrationSql);
const hasSearchIndexDynamicIndexes = parseHasSearchIndexDynamicIndexes(
  migrationSql
);
const uniqueConstraints = parseUniqueConstraintNames(migrationSql);
const staticIndexes = parseStaticIndexNames(migrationSql);
const triggerNames = parseTriggerNames(migrationSql);
const generatedTableColumnDefaults = countColumnDefaults(migrationSql);

compareSets(
  "SQL migration files",
  setFrom(migrationFileTags),
  "Drizzle migration journal",
  setFrom(migrationJournalTags)
);

const generatedAppTableNames = setFrom(
  [...generatedTables.keys()].filter((name) => !authTables.has(name))
);
const generatedAppTables = new Map(
  [...generatedTables].filter(([name]) => !authTables.has(name))
);
const migrationAppTableNames = setFrom(
  [...migrationTables.keys()].filter((name) => !authTables.has(name))
);

compareSets(
  "generated non-auth tables",
  generatedAppTableNames,
  "migration non-auth tables",
  migrationAppTableNames
);

for (const tableName of sorted(generatedAppTableNames)) {
  compareColumnSets(
    `generated table "${tableName}"`,
    generatedTables.get(tableName),
    `migration table "${tableName}"`,
    migrationTables.get(tableName)
  );
}

for (const tableName of sorted(authTables)) {
  compareColumnSets(
    `generated auth table "${tableName}"`,
    generatedTables.get(tableName),
    `migration auth table "${tableName}"`,
    migrationTables.get(tableName)
  );
}

compareSets(
  "generated views",
  setFrom(generatedViews.keys()),
  "migration views",
  setFrom(migrationViews.keys())
);

compareSets(
  "generated enums",
  setFrom(generatedEnums.keys()),
  "migration enums",
  setFrom(migrationEnums.keys())
);

for (const enumName of sorted(generatedEnums.keys())) {
  compareOrderedValues(
    `generated enum "${enumName}"`,
    generatedEnums.get(enumName),
    `migration enum "${enumName}"`,
    migrationEnums.get(enumName)
  );
}

if (scopeIndexTargets.length > 0 && !hasScopeIndexMigration) {
  failures.push(
    `migration SQL has ${scopeIndexTargets.length} tenant/principal scope columns but no dynamic scope-index migration.`
  );
}

if (migrationViews.has("itemStockQuantities") && !hasItemStockQuantitiesRefresh) {
  failures.push(
    `migration SQL creates itemStockQuantities but has no service-callable refresh function.`
  );
}

if (!hasAuditLogDynamicIndexes) {
  failures.push(
    "migration SQL does not cover the expected dynamic audit-log indexes."
  );
}

if (!hasSearchIndexDynamicIndexes) {
  failures.push(
    "migration SQL does not cover the expected dynamic company search-index indexes."
  );
}

compareSets(
  "expected reviewed unique constraints",
  expectedUniqueConstraints,
  "migration unique constraints",
  uniqueConstraints
);

compareSets(
  "expected reviewed static indexes",
  expectedStaticIndexes,
  "migration static indexes",
  staticIndexes
);

if (triggerNames.size > 0) {
  failures.push(
    `generated migrations create trigger(s) without schema semantic review: ${sorted(
      triggerNames
    ).join(", ")}.`
  );
}

if (generatedTableColumnDefaults > 0) {
  failures.push(
    `generated table migrations include ${generatedTableColumnDefaults} column default(s) without schema semantic review.`
  );
}

if (failures.length > 0) {
  console.error("Schema audit failed:");
  for (const failure of failures.slice(0, 100)) {
    console.error(`- ${failure}`);
  }
  if (failures.length > 100) {
    console.error(`- ...and ${failures.length - 100} more failures.`);
  }
  process.exit(1);
}

const generatedAppTableColumnCount = countValues(generatedAppTables);
const generatedViewColumnCount = countValues(generatedViews);
const generatedAuthColumnCount = countValues(
  new Map([...generatedTables].filter(([name]) => authTables.has(name)))
);

console.log("Schema audit passed");
console.log(`- generated app tables checked: ${generatedAppTables.size}`);
console.log(
  `- generated app table columns checked: ${generatedAppTableColumnCount}`
);
console.log(`- auth tables checked: ${authTables.size}`);
console.log(`- auth table columns checked: ${generatedAuthColumnCount}`);
console.log(`- generated views checked: ${generatedViews.size}`);
console.log(`- generated view columns checked: ${generatedViewColumnCount}`);
console.log(`- migration views checked: ${migrationViews.size}`);
console.log(`- generated enums checked: ${generatedEnums.size}`);
console.log(`- migration tables checked: ${migrationTables.size}`);
console.log(`- migration enum types checked: ${migrationEnums.size}`);
console.log(`- migration journal entries checked: ${migrationJournalTags.length}`);
console.log(
  `- tenant/principal scope index targets covered: ${scopeIndexTargets.length}`
);
console.log(
  `- itemStockQuantities refresh function covered: ${
    hasItemStockQuantitiesRefresh ? "yes" : "no"
  }`
);
console.log(
  `- dynamic audit-log indexes covered: ${hasAuditLogDynamicIndexes ? "yes" : "no"}`
);
console.log(
  `- dynamic search indexes covered: ${hasSearchIndexDynamicIndexes ? "yes" : "no"}`
);
console.log(`- unique constraints reviewed: ${uniqueConstraints.size}`);
console.log(`- static indexes reviewed: ${staticIndexes.size}`);
console.log(`- generated triggers covered: ${triggerNames.size}`);
console.log(
  `- generated table column defaults covered: ${generatedTableColumnDefaults}`
);
console.log(
  `- SQL object counts for manual semantic review: ${formatSqlObjectCounts(
    migrationSql
  )}`
);
console.log(`- migration files audited: ${migrationFiles.join(", ")}`);

function parseGeneratedObjects(text, kind) {
  const matcher = new RegExp(
    `^export const [A-Za-z0-9_]+ = ${kind}\\("([^"]+)", \\{`,
    "gm"
  );
  const objects = new Map();
  let match;

  while ((match = matcher.exec(text)) !== null) {
    const openIndex = text.indexOf("{", match.index);
    const columns = readBalanced(text, openIndex, "{", "}");
    objects.set(match[1], parseGeneratedColumnNames(columns.content));
  }

  return objects;
}

function parseMigrationJournalTags() {
  const journal = JSON.parse(
    readFileSync(resolve(migrationsDir, "meta/_journal.json"), "utf8")
  );
  if (!Array.isArray(journal.entries)) {
    failures.push("Drizzle migration journal has no entries array.");
    return [];
  }

  for (const [index, entry] of journal.entries.entries()) {
    if (entry.idx !== index) {
      failures.push(
        `Drizzle migration journal entry ${entry.tag ?? index} has idx ${entry.idx}, expected ${index}.`
      );
    }
    if (typeof entry.tag !== "string" || entry.tag.length === 0) {
      failures.push(`Drizzle migration journal entry ${index} has no tag.`);
    }
  }

  return journal.entries
    .map((entry) => entry.tag)
    .filter((tag) => typeof tag === "string" && tag.length > 0);
}

function parseGeneratedEnums(text) {
  const enums = new Map();
  const matcher =
    /^export const [A-Za-z0-9_]+ = pgEnum\("([^"]+)", \[([^\]]*)\]\);/gm;
  let match;

  while ((match = matcher.exec(text)) !== null) {
    enums.set(match[1], parseDoubleQuotedValues(match[2]));
  }

  return enums;
}

function parseMigrationTables(sql) {
  const tableMatcher = /CREATE TABLE "([^"]+)" \(/g;
  const tables = new Map();
  let match;

  while ((match = tableMatcher.exec(sql)) !== null) {
    const end = sql.indexOf("\n);", match.index);
    const block = sql.slice(match.index, end === -1 ? sql.length : end);
    tables.set(match[1], parseMigrationColumnNames(block));
  }

  return tables;
}

function parseMigrationViews(sql) {
  const views = new Map();
  const matcher =
    /^\s*CREATE\s+(?:(?:OR\s+REPLACE\s+)?(?:RECURSIVE\s+)?VIEW|MATERIALIZED\s+VIEW)\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/gim;
  let match;

  while ((match = matcher.exec(sql)) !== null) {
    views.set(match[1] ?? match[2], true);
  }

  return views;
}

function parseMigrationEnums(sql) {
  const enums = new Map();
  const matcher = /CREATE TYPE "public"\."([^"]+)" AS ENUM\(([^)]*)\)/g;
  let match;

  while ((match = matcher.exec(sql)) !== null) {
    enums.set(match[1], parseSqlStringValues(match[2]));
  }

  return enums;
}

function parseUniqueConstraintNames(sql) {
  return new Set(
    [...sql.matchAll(/(?:ADD\s+)?CONSTRAINT\s+"([^"]+)"\s+UNIQUE\s*\(/g)].map(
      (match) => match[1]
    )
  );
}

function parseStaticIndexNames(sql) {
  return new Set(
    [
      ...sql.matchAll(
        /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/g
      ),
    ].map((match) => match[1])
  );
}

function parseTriggerNames(sql) {
  return new Set(
    [...sql.matchAll(/CREATE\s+TRIGGER\s+"?([^"\s]+)"?/g)].map(
      (match) => match[1]
    )
  );
}

function getScopeIndexTargets(tables) {
  const scopeColumns = new Set(["companyId", "companyGroupId", "userId"]);
  const targets = [];

  for (const [table, columns] of tables) {
    for (const column of columns) {
      if (scopeColumns.has(column)) {
        targets.push(`${table}.${column}`);
      }
    }
  }

  return targets.sort();
}

function parseHasScopeIndexMigration(sql) {
  return (
    /column_name\s+IN\s*\(\s*'companyId'\s*,\s*'companyGroupId'\s*,\s*'userId'\s*\)/i.test(
      sql
    ) && /scope_column\.table_name\s*\|\|\s*'_'\s*\|\|\s*scope_column\.column_name\s*\|\|\s*'_idx'/i.test(
      sql
    )
  );
}

function parseHasItemStockQuantitiesRefresh(sql) {
  return (
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+refresh_item_stock_quantities\(\)/i.test(
      sql
    ) &&
    /REFRESH\s+MATERIALIZED\s+VIEW\s+"itemStockQuantities"/i.test(sql) &&
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+refresh_item_stock_quantities\(\)\s+TO\s+carbon_service/i.test(
      sql
    )
  );
}

function parseHasAuditLogDynamicIndexes(sql) {
  const requiredPatterns = [
    /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+%I\s+ON\s+%I\s+\("entityType",\s*"entityId"\)/i,
    /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+%I\s+ON\s+%I\s+\("tableName"\)/i,
    /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+%I\s+ON\s+%I\s+\("recordId"\)/i,
    /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+%I\s+ON\s+%I\s+\("actorId"\)/i,
    /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+%I\s+ON\s+%I\s+\("createdAt"\s+DESC\)/i,
  ];

  return requiredPatterns.every((pattern) => pattern.test(sql));
}

function parseHasSearchIndexDynamicIndexes(sql) {
  const requiredPatterns = [
    /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+%I\s+ON\s+%I\s+USING\s+GIN\s+\("searchVector"\)/i,
    /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+%I\s+ON\s+%I\s+USING\s+GIN\s+\("title"\s+gin_trgm_ops\)/i,
    /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+%I\s+ON\s+%I\s+USING\s+GIN\s+\("description"\s+gin_trgm_ops\)/i,
  ];

  return requiredPatterns.every((pattern) => pattern.test(sql));
}

function parseGeneratedColumnNames(block) {
  return [...block.matchAll(/^ {2}"([^"]+)":/gm)]
    .map((match) => match[1])
    .sort();
}

function parseMigrationColumnNames(block) {
  return [...block.matchAll(/^\s+"([^"]+)"\s+/gm)]
    .map((match) => match[1])
    .sort();
}

function parseDoubleQuotedValues(text) {
  return [...text.matchAll(/"((?:\\"|[^"])*)"/g)].map((match) =>
    match[1].replaceAll('\\"', '"')
  );
}

function parseSqlStringValues(text) {
  return [...text.matchAll(/'((?:''|[^'])*)'/g)].map((match) =>
    match[1].replaceAll("''", "'")
  );
}

function compareColumnSets(leftName, leftColumns, rightName, rightColumns) {
  if (!leftColumns) {
    failures.push(`${leftName} is missing.`);
    return;
  }
  if (!rightColumns) {
    failures.push(`${rightName} is missing.`);
    return;
  }

  compareSets(leftName, setFrom(leftColumns), rightName, setFrom(rightColumns));
}

function compareSets(leftName, left, rightName, right) {
  for (const item of sorted(difference(left, right))) {
    failures.push(`"${item}" exists in ${leftName} but not in ${rightName}.`);
  }
  for (const item of sorted(difference(right, left))) {
    failures.push(`"${item}" exists in ${rightName} but not in ${leftName}.`);
  }
}

function compareOrderedValues(leftName, leftValues, rightName, rightValues) {
  if (!leftValues) {
    failures.push(`${leftName} is missing.`);
    return;
  }
  if (!rightValues) {
    failures.push(`${rightName} is missing.`);
    return;
  }
  if (leftValues.length !== rightValues.length) {
    failures.push(
      `${leftName} has ${leftValues.length} values but ${rightName} has ${rightValues.length}.`
    );
    return;
  }

  for (let index = 0; index < leftValues.length; index += 1) {
    if (leftValues[index] !== rightValues[index]) {
      failures.push(
        `${leftName} value ${index} is "${leftValues[index]}" but ${rightName} has "${rightValues[index]}".`
      );
      return;
    }
  }
}

function formatSqlObjectCounts(sql) {
  const counts = {
    functions: countMatches(sql, /CREATE OR REPLACE FUNCTION /g),
    foreignKeys: countMatches(sql, / ADD CONSTRAINT "[^"]+" FOREIGN KEY /g),
    uniqueConstraints: parseUniqueConstraintNames(sql).size,
    createIndexes: countMatches(sql, /CREATE (?:UNIQUE )?INDEX /g),
    triggers: countMatches(sql, /CREATE TRIGGER /g),
    materializedViews: countMatches(sql, /CREATE MATERIALIZED VIEW /g),
    columnDefaults: countColumnDefaults(sql),
  };

  return Object.entries(counts)
    .map(([name, count]) => `${name}=${count}`)
    .join(", ");
}

function countColumnDefaults(sql) {
  const tableMatcher = /CREATE TABLE "([^"]+)" \(/g;
  let count = 0;
  let match;

  while ((match = tableMatcher.exec(sql)) !== null) {
    const end = sql.indexOf("\n);", match.index);
    const block = sql.slice(match.index, end === -1 ? sql.length : end);
    count += countMatches(block, /^\s+"[^"]+"\s+.+\bDEFAULT\b/gm);
  }

  return count;
}

function countValues(map) {
  return [...map.values()].reduce((sum, values) => sum + values.length, 0);
}

function countMatches(text, regex) {
  return [...text.matchAll(regex)].length;
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

function difference(left, right) {
  return new Set([...left].filter((item) => !right.has(item)));
}

function setFrom(items) {
  return new Set(items);
}

function sorted(items) {
  return [...items].sort((left, right) => left.localeCompare(right));
}
