import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const migrationsDir = resolve(packageRoot, "drizzle");
const hostedVendor = "supa" + "base";
const allowedExtensions = new Set(["pgcrypto", "pg_trgm", "vector"]);
const failures = [];

const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();
const migrationSql = migrationFiles
  .map((file) => readFileSync(resolve(migrationsDir, file), "utf8"))
  .join("\n");
const executableSql = stripLineComments(migrationSql);
const statements = splitSqlStatements(executableSql);
const functions = parseFunctionSecurity(statements);
const extensions = parseExtensions(executableSql);

checkAllowedExtensions();
checkNoProviderSql();
checkFunctionSecurity();

if (failures.length > 0) {
  console.error("SQL portability audit failed:");
  for (const failure of failures.slice(0, 100)) {
    console.error(`- ${failure}`);
  }
  if (failures.length > 100) {
    console.error(`- ...and ${failures.length - 100} more failures.`);
  }
  process.exit(1);
}

const securityModes = countFunctionSecurityModes(functions);

console.log("SQL portability audit passed");
console.log(`- migration files checked: ${migrationFiles.length}`);
console.log(`- allowed extensions checked: ${extensions.size}`);
console.log(
  `- functions checked: ${functions.size} (invoker=${securityModes.invoker}, definer=${securityModes.definer})`
);
console.log("- provider-specific SQL helper patterns checked: none found");

function checkAllowedExtensions() {
  for (const extension of extensions) {
    if (!allowedExtensions.has(extension)) {
      failures.push(`Unexpected PostgreSQL extension in migrations: ${extension}.`);
    }
  }
}

function checkNoProviderSql() {
  const patterns = [
    ["hosted database vendor token", new RegExp(`\\b${hostedVendor}\\b`, "i")],
    ["hosted auth uid helper", /\bauth\.uid\s*\(/i],
    ["hosted auth JWT setting", /\brequest\.jwt|jwt\.claims\b/i],
    ["hosted anonymous/authenticated role", /\bTO\s+(?:anon|authenticated)\b|\bGRANT\b[\s\S]{0,120}\b(?:anon|authenticated)\b/i],
    ["hosted service role", /\bservice_role\b/i],
    ["managed scheduler schema", /\b(?:cron|pg_cron)\./i],
    ["storage service schema", /\bstorage\./i],
    ["realtime service schema", /\brealtime\b/i],
    ["network extension schema", /\bnet\./i],
    ["HTTP extension call", /\bhttp(?:_|\.|\s*\()/i],
    ["vault extension schema", /\bvault\./i],
    ["provider extension schema prefix", /\bextensions\./i],
    ["edge-runtime schema", /\bedge_runtime\b/i],
  ];

  for (const [label, pattern] of patterns) {
    if (pattern.test(executableSql)) {
      failures.push(`Migration SQL contains ${label}.`);
    }
  }
}

function checkFunctionSecurity() {
  for (const [name, metadata] of functions) {
    if (!metadata.mode) {
      failures.push(
        `${name} does not explicitly declare SECURITY INVOKER or SECURITY DEFINER.`
      );
      continue;
    }

    if (metadata.mode === "definer" && !metadata.hasSearchPath) {
      failures.push(`${name} is SECURITY DEFINER without SET search_path = public.`);
    }
  }
}

function parseExtensions(sql) {
  return new Set(
    [...sql.matchAll(/\bCREATE\s+EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))/gi)]
      .map((match) => match[1] ?? match[2])
  );
}

function parseFunctionSecurity(sqlStatements) {
  const metadata = new Map();

  for (const statement of sqlStatements) {
    const create = statement.match(functionCreateMatcher());
    if (!create) {
      continue;
    }

    const name = functionNameFromMatch(create);
    const isDefiner = /\bSECURITY\s+DEFINER\b/i.test(statement);
    const isInvoker = /\bSECURITY\s+INVOKER\b/i.test(statement);
    metadata.set(name, {
      mode: isDefiner ? "definer" : isInvoker ? "invoker" : null,
      hasSearchPath: /\bSET\s+search_path\s*=\s*public\b/i.test(statement),
    });
  }

  return metadata;
}

function functionCreateMatcher() {
  return /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\.)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\s*\(/i;
}

function functionNameFromMatch(match) {
  return match[3] ?? match[4];
}

function countFunctionSecurityModes(metadata) {
  let invoker = 0;
  let definer = 0;

  for (const { mode } of metadata.values()) {
    if (mode === "invoker") {
      invoker += 1;
    } else if (mode === "definer") {
      definer += 1;
    }
  }

  return { invoker, definer };
}

function splitSqlStatements(sql) {
  const statements = [];
  let start = 0;
  let quote = null;
  let dollarQuote = null;
  let escaped = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];

    if (dollarQuote) {
      if (sql.startsWith(dollarQuote, index)) {
        index += dollarQuote.length - 1;
        dollarQuote = null;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    const dollarMatch = sql.slice(index).match(/^\$[A-Za-z0-9_]*\$/);
    if (dollarMatch) {
      dollarQuote = dollarMatch[0];
      index += dollarQuote.length - 1;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === ";") {
      statements.push(sql.slice(start, index + 1));
      start = index + 1;
    }
  }

  if (start < sql.length) {
    statements.push(sql.slice(start));
  }

  return statements;
}

function stripLineComments(sql) {
  let result = "";
  let quote = null;
  let dollarQuote = null;
  let escaped = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (dollarQuote) {
      if (sql.startsWith(dollarQuote, index)) {
        result += dollarQuote;
        index += dollarQuote.length - 1;
        dollarQuote = null;
      } else {
        result += char;
      }
      continue;
    }

    if (quote) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    const dollarMatch = sql.slice(index).match(/^\$[A-Za-z0-9_]*\$/);
    if (dollarMatch) {
      dollarQuote = dollarMatch[0];
      result += dollarQuote;
      index += dollarQuote.length - 1;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      result += char;
      continue;
    }

    if (char === "-" && next === "-") {
      while (index < sql.length && sql[index] !== "\n") {
        index += 1;
      }
      result += "\n";
      continue;
    }

    result += char;
  }

  return result;
}
