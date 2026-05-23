import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const repoRoot = resolve(packageRoot, "../..");
const migrationsDir = resolve(packageRoot, "drizzle");

const migrationSql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(resolve(migrationsDir, file), "utf8"))
  .join("\n");

const usedRpcCalls = findUsedRpcCalls();
const usedRpcNames = setFrom(usedRpcCalls.map((call) => call.name));
const currentFunctions = parseCurrentFunctions(migrationSql);
const currentFunctionSignatures = parseCurrentFunctionSignatures(migrationSql);
const currentFunctionSecurity = parseCurrentFunctionSecurity(migrationSql);
const missingCurrent = sorted(
  [...usedRpcNames].filter((name) => !currentFunctions.has(name))
);
const signatureFailures = findSignatureFailures(
  usedRpcCalls,
  currentFunctionSignatures,
  currentFunctions
);
const securityFailures = findFunctionSecurityFailures(currentFunctionSecurity);

if (
  missingCurrent.length > 0 ||
  signatureFailures.length > 0 ||
  securityFailures.length > 0
) {
  console.error("RPC function audit failed:");
  console.error(`- used RPC functions: ${usedRpcNames.size}`);
  console.error(`- functions created by generated migrations: ${currentFunctions.size}`);
  console.error(`- used RPC functions missing from generated migrations: ${missingCurrent.length}`);
  console.error(`- literal RPC signature mismatches: ${signatureFailures.length}`);
  console.error(`- function security declaration failures: ${securityFailures.length}`);
  if (missingCurrent.length > 0) {
    console.error("- used RPC functions missing from generated migrations:");
    for (const name of missingCurrent) {
      console.error(`  - ${name}`);
    }
  }
  if (signatureFailures.length > 0) {
    console.error("- literal RPC calls with incompatible argument keys:");
    for (const failure of signatureFailures.slice(0, 100)) {
      console.error(`  - ${failure}`);
    }
    if (signatureFailures.length > 100) {
      console.error(`  - ...and ${signatureFailures.length - 100} more failures.`);
    }
  }
  if (securityFailures.length > 0) {
    console.error("- generated functions with unsafe or implicit security mode:");
    for (const failure of securityFailures.slice(0, 100)) {
      console.error(`  - ${failure}`);
    }
    if (securityFailures.length > 100) {
      console.error(`  - ...and ${securityFailures.length - 100} more failures.`);
    }
  }
  process.exit(1);
}

const checkedLiteralCalls = usedRpcCalls.filter(
  (call) => call.paramNames !== null && currentFunctions.has(call.name)
).length;
const skippedDynamicCalls = usedRpcCalls.filter(
  (call) => call.paramNames === null && currentFunctions.has(call.name)
).length;
const functionSecurityModes = countFunctionSecurityModes(currentFunctionSecurity);

console.log("RPC function audit passed");
console.log(`- used RPC functions: ${usedRpcNames.size}`);
console.log(`- functions created by generated migrations: ${currentFunctions.size}`);
console.log(`- literal RPC calls checked against function signatures: ${checkedLiteralCalls}`);
console.log(`- dynamic RPC calls skipped for signature checking: ${skippedDynamicCalls}`);
console.log(
  `- function security modes checked: invoker=${functionSecurityModes.invoker}, definer=${functionSecurityModes.definer}`
);

function findUsedRpcCalls() {
  const files = git(
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "apps",
    "packages"
  )
    .split("\n")
    .filter(
      (file) =>
        /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(file) &&
        existsSync(resolve(repoRoot, file))
    );
  const calls = [];

  for (const file of files) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") || file.endsWith(".jsx")
        ? ts.ScriptKind.TSX
        : ts.ScriptKind.TS
    );

    visit(sourceFile, (node) => {
      if (!ts.isCallExpression(node) || !isRpcCallExpression(node.expression)) {
        return;
      }

      const [nameArg, paramsArg] = node.arguments;
      if (!isStringLiteralLike(nameArg)) {
        return;
      }

      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      calls.push({
        name: nameArg.text,
        file,
        line: position.line + 1,
        paramNames: parseRpcParamNames(paramsArg),
      });
    });
  }

  return calls;
}

function parseCurrentFunctions(sql) {
  return setFrom(
    [...stripLineComments(sql).matchAll(functionCreateMatcher())].map((match) =>
      functionNameFromMatch(match)
    )
  );
}

function parseCurrentFunctionSignatures(sql) {
  const stripped = stripLineComments(sql);
  const signatures = new Map();

  for (const match of stripped.matchAll(functionCreateMatcher())) {
    const name = functionNameFromMatch(match);
    const openIndex = match.index + match[0].length - 1;
    const closeIndex = findClosingParen(stripped, openIndex);
    if (closeIndex === -1) {
      continue;
    }

    const parameters = parseFunctionParameters(
      stripped.slice(openIndex + 1, closeIndex)
    );
    if (!parameters) {
      continue;
    }

    const existing = signatures.get(name) ?? [];
    existing.push(parameters);
    signatures.set(name, existing);
  }

  return signatures;
}

function parseCurrentFunctionSecurity(sql) {
  const metadata = new Map();

  for (const statement of splitSqlStatements(stripLineComments(sql))) {
    const create = [...statement.matchAll(functionCreateMatcher())][0];
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
  return /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\.)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\s*\(/gi;
}

function functionNameFromMatch(match) {
  return match[3] ?? match[4];
}

function findFunctionSecurityFailures(metadata) {
  const failures = [];

  for (const [name, { mode, hasSearchPath }] of metadata) {
    if (!mode) {
      failures.push(
        `${name} does not explicitly declare SECURITY INVOKER or SECURITY DEFINER.`
      );
      continue;
    }

    if (mode === "definer" && !hasSearchPath) {
      failures.push(
        `${name} is SECURITY DEFINER without SET search_path = public.`
      );
    }
  }

  return failures;
}

function countFunctionSecurityModes(metadata) {
  const counts = { invoker: 0, definer: 0 };

  for (const { mode } of metadata.values()) {
    if (mode === "invoker") {
      counts.invoker += 1;
    } else if (mode === "definer") {
      counts.definer += 1;
    }
  }

  return counts;
}

function findSignatureFailures(calls, signatures, currentFunctions) {
  const failures = [];

  for (const call of calls) {
    if (!currentFunctions.has(call.name) || call.paramNames === null) {
      continue;
    }

    const functionSignatures = signatures.get(call.name) ?? [];
    if (functionSignatures.length === 0) {
      continue;
    }

    const accepted = functionSignatures.some((signature) =>
      signatureAcceptsCall(signature, call.paramNames)
    );
    if (!accepted) {
      failures.push(
        `${call.file}:${call.line} ${call.name}(${call.paramNames.join(
          ", "
        )}) does not match ${formatSignatures(functionSignatures)}`
      );
    }
  }

  return failures;
}

function signatureAcceptsCall(signature, paramNames) {
  const passed = new Set(paramNames);
  const known = new Set(signature.params.map((param) => param.name));
  const required = new Set(
    signature.params
      .filter((param) => param.required)
      .map((param) => param.name)
  );

  for (const name of passed) {
    if (!known.has(name)) {
      return false;
    }
  }

  for (const name of required) {
    if (!passed.has(name)) {
      return false;
    }
  }

  return true;
}

function formatSignatures(signatures) {
  return signatures
    .map(
      (signature) =>
        `(${signature.params
          .map((param) => `${param.name}${param.required ? "" : "?"}`)
          .join(", ")})`
    )
    .join(" or ");
}

function parseRpcParamNames(node) {
  if (!node) {
    return [];
  }

  if (!ts.isObjectLiteralExpression(node)) {
    return null;
  }

  const names = [];
  for (const property of node.properties) {
    if (ts.isSpreadAssignment(property)) {
      return null;
    }

    const name =
      ts.isPropertyAssignment(property) ||
      ts.isShorthandPropertyAssignment(property) ||
      ts.isMethodDeclaration(property)
        ? propertyNameText(property.name)
        : null;

    if (!name) {
      return null;
    }

    names.push(name);
  }

  return names;
}

function propertyNameText(name) {
  if (!name) {
    return null;
  }

  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }

  return null;
}

function isRpcCallExpression(expression) {
  return (
    ts.isPropertyAccessExpression(expression) && expression.name.text === "rpc"
  );
}

function isStringLiteralLike(node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node));
}

function visit(node, visitor) {
  visitor(node);
  ts.forEachChild(node, (child) => visit(child, visitor));
}

function parseFunctionParameters(source) {
  const params = [];
  const trimmed = source.trim();
  if (trimmed === "") {
    return { params };
  }

  for (const rawParam of splitTopLevel(trimmed, ",")) {
    const param = rawParam.trim();
    if (param === "") {
      continue;
    }

    const match = param.match(
      /^(?:(?:IN|OUT|INOUT|VARIADIC)\s+)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\b\s+(.+)$/i
    );
    if (!match) {
      return null;
    }

    params.push({
      name: match[1] ?? match[2],
      required: !/\bDEFAULT\b|=/.test(match[3]),
    });
  }

  return { params };
}

function findClosingParen(source, openIndex) {
  let depth = 0;
  let quote = null;
  let dollarQuote = null;
  let escaped = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];

    if (dollarQuote) {
      if (source.startsWith(dollarQuote, index)) {
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

    const dollarMatch = source.slice(index).match(/^\$[A-Za-z0-9_]*\$/);
    if (dollarMatch) {
      dollarQuote = dollarMatch[0];
      index += dollarQuote.length - 1;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function splitTopLevel(source, delimiter) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

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

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth -= 1;
      continue;
    }

    if (depth === 0 && char === delimiter) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(source.slice(start));
  return parts;
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

function git(...args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
}

function sorted(items) {
  return [...items].sort((left, right) => left.localeCompare(right));
}

function setFrom(items) {
  return new Set(items);
}
