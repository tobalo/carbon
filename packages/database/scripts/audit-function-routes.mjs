import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const routePath = resolve(
  repoRoot,
  "apps/erp/app/routes/api+/functions.$name.ts"
);

const sourceRoots = ["apps", "packages", "examples"].map((dir) =>
  resolve(repoRoot, dir)
);
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const ignoredPathParts = new Set([
  ".git",
  "node_modules",
  "build",
  "dist",
  ".turbo",
  ["packages", "database", "supa" + "base"].join("/")
]);

const invoked = new Map();
const dynamicInvokes = [];
const legacyFunctionInvokes = [];

for (const root of sourceRoots) {
  for (const file of walk(root)) {
    const source = readFileSync(file, "utf8");
    const relativePath = file.slice(repoRoot.length + 1);
    const sourceFile = ts.createSourceFile(
      relativePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      scriptKindFor(file)
    );

    visit(sourceFile, (node) => {
      if (!ts.isCallExpression(node)) {
        return;
      }

      if (isLegacyFunctionInvokeCall(node)) {
        legacyFunctionInvokes.push(locationFor(sourceFile, node));
        return;
      }

      if (!isFunctionInvokeCall(node)) {
        return;
      }

      const name = stringLiteralText(node.arguments[0]);
      const location = locationFor(sourceFile, node);
      if (name) {
        if (!invoked.has(name)) {
          invoked.set(name, []);
        }
        invoked.get(name).push(location);
      } else {
        dynamicInvokes.push(location);
      }
    });
  }
}

const routeSource = readFileSync(routePath, "utf8");
const implemented = new Set(
  Array.from(routeSource.matchAll(/\bcase\s+["']([^"']+)["']\s*:/g)).map(
    (match) => match[1]
  )
);

const invokedNames = Array.from(invoked.keys()).sort();
const implementedInvoked = invokedNames.filter((name) => implemented.has(name));
const missing = invokedNames.filter((name) => !implemented.has(name));
const extraImplemented = Array.from(implemented)
  .filter((name) => !invoked.has(name))
  .sort();
const failures = [
  ...missing.map((name) => `Invoked function "${name}" has no route case.`),
  ...dynamicInvokes.map(
    (location) =>
      `${location} invokes a function through a non-literal name; add an explicit route audit mapping before using dynamic dispatch.`
  ),
  ...legacyFunctionInvokes.map(
    (location) =>
      `${location} uses the removed .functions.invoke compatibility surface; use invokeFunction(...) instead.`
  ),
  ...functionRouteAuthFailures(routeSource),
  ...functionRouteTenantScopeFailures(routeSource),
  ...functionCallerAuthFailures(),
  ...functionGeneratorScriptFailures()
];

console.log("Function route audit");
console.log(`- invoked literal function names: ${invokedNames.length}`);
console.log(`- implemented route cases: ${implemented.size}`);
console.log(`- invoked names implemented: ${implementedInvoked.length}`);
console.log(`- invoked names missing: ${missing.length}`);
console.log(`- dynamic function invokes skipped: ${dynamicInvokes.length}`);
console.log(`- legacy .functions.invoke calls: ${legacyFunctionInvokes.length}`);

if (implementedInvoked.length > 0) {
  console.log(`- implemented invoked names: ${implementedInvoked.join(", ")}`);
}

if (missing.length > 0) {
  console.log(`- missing invoked names: ${missing.join(", ")}`);
}

if (extraImplemented.length > 0) {
  console.log(`- implemented but not found in literal invokes: ${extraImplemented.join(", ")}`);
}

if (failures.length > 0) {
  console.error("Function route audit failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const path = resolve(dir, entry);
    const relativePath = path.slice(repoRoot.length + 1);

    if (isIgnored(relativePath)) {
      continue;
    }

    let stats;
    try {
      stats = statSync(path);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      yield* walk(path);
      continue;
    }

    if (stats.isFile() && sourceExtensions.has(extname(path))) {
      yield path;
    }
  }
}

function isIgnored(relativePath) {
  if (relativePath.split("/").some((part) => ignoredPathParts.has(part))) {
    return true;
  }

  for (const ignored of ignoredPathParts) {
    if (relativePath === ignored || relativePath.startsWith(`${ignored}/`)) {
      return true;
    }
  }
  return false;
}

function visit(node, fn) {
  fn(node);
  ts.forEachChild(node, (child) => visit(child, fn));
}

function isFunctionInvokeCall(node) {
  const expression = unwrap(node.expression);
  return ts.isIdentifier(expression) && expression.text === "invokeFunction";
}

function isLegacyFunctionInvokeCall(node) {
  const expression = unwrap(node.expression);
  if (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === "invoke"
  ) {
    const owner = unwrap(expression.expression);
    return (
      ts.isPropertyAccessExpression(owner) && owner.name.text === "functions"
    );
  }

  return false;
}

function stringLiteralText(node) {
  if (!node) {
    return null;
  }
  const expression = unwrap(node);
  return ts.isStringLiteralLike(expression) ? expression.text : null;
}

function unwrap(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression?.(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function locationFor(sourceFile, node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  return `${sourceFile.fileName}:${position.line + 1}`;
}

function scriptKindFor(file) {
  if (file.endsWith(".tsx") || file.endsWith(".jsx")) {
    return ts.ScriptKind.TSX;
  }
  if (file.endsWith(".mjs")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function functionRouteAuthFailures(source) {
  const failures = [];
  const authCall = source.indexOf("const unauthorized = validateFunctionAuth(request)");
  const authReturn = source.indexOf("return unauthorized", authCall);
  const methodCheck = source.indexOf('request.method !== "POST"');
  const bodyParse = source.indexOf("await request.json()");
  const dispatch = source.indexOf("switch (name)");

  if (authCall === -1 || authReturn === -1) {
    failures.push(
      "Function dispatcher does not call validateFunctionAuth(request) and return its response."
    );
  }

  for (const [label, position] of [
    ["method check", methodCheck],
    ["body parsing", bodyParse],
    ["route dispatch", dispatch]
  ]) {
    if (position === -1) {
      failures.push(`Function dispatcher ${label} could not be found.`);
    } else if (authCall === -1 || position < authCall || authReturn > position) {
      failures.push(
        `Function dispatcher does not complete auth validation before ${label}.`
      );
    }
  }

  if (!/const\s+token\s*=\s*process\.env\.CARBON_FUNCTIONS_TOKEN/.test(source)) {
    failures.push("Function auth does not read CARBON_FUNCTIONS_TOKEN.");
  }

  if (
    !/process\.env\.NODE_ENV\s*===\s*"production"[\s\S]*CARBON_FUNCTIONS_TOKEN is required in production[\s\S]*status:\s*500/.test(
      source
    )
  ) {
    failures.push(
      "Function auth does not fail closed when CARBON_FUNCTIONS_TOKEN is missing in production."
    );
  }

  if (
    !/request\.headers\.get\("authorization"\)[\s\S]*authorization\s*!==\s*`Bearer \$\{token\}`[\s\S]*status:\s*401/.test(
      source
    )
  ) {
    failures.push(
      "Function auth does not require an exact Bearer CARBON_FUNCTIONS_TOKEN authorization header."
    );
  }

  return failures;
}

function functionRouteTenantScopeFailures(source) {
  const failures = [];

  if (
    !/const\s+embedJobSchema\s*=\s*z\.object\(\{[\s\S]*companyId:\s*z\.string\(\)/.test(
      source
    )
  ) {
    failures.push(
      "Function route embed jobs must require companyId before using the service client."
    );
  }

  const embedScopeMatches =
    source.match(/\.eq\("companyId",\s*job\.companyId\)/g) ?? [];
  if (embedScopeMatches.length < 2) {
    failures.push(
      "Function route embed service-client reads and writes must both be scoped by job.companyId."
    );
  }

  const embeddingWorker = readFileSync(
    resolve(
      repoRoot,
      "packages/jobs/src/inngest/functions/events/embedding.ts"
    ),
    "utf8"
  );
  if (
    !/jobs:\s*\{\s*id:\s*string;\s*table:\s*string;\s*companyId:\s*string\s*\}\[\]/.test(
      embeddingWorker
    ) ||
    !/companyId:\s*record\.companyId/.test(embeddingWorker)
  ) {
    failures.push(
      "Embedding event worker must pass the event companyId into embed function jobs."
    );
  }

  return failures;
}

function functionCallerAuthFailures() {
  const failures = [];
  const callerFiles = [
    "packages/auth/src/services/functions.server.ts",
    "packages/jobs/src/lib/functions.ts"
  ];

  for (const file of callerFiles) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    if (!source.includes("CARBON_FUNCTIONS_TOKEN")) {
      failures.push(`${file} does not read CARBON_FUNCTIONS_TOKEN.`);
    }
    if (!/Authorization[":\s=]+`Bearer \$\{process\.env\.CARBON_FUNCTIONS_TOKEN\}`/.test(source)) {
      failures.push(`${file} does not forward CARBON_FUNCTIONS_TOKEN as a Bearer header.`);
    }
    if (!/\/api\/functions\/\$\{(?:name|fn)\}/.test(source)) {
      failures.push(`${file} does not call the Node /api/functions/:name dispatcher.`);
    }
  }

  const envExample = readFileSync(resolve(repoRoot, ".env.example"), "utf8");
  if (!/^CARBON_FUNCTIONS_TOKEN=/m.test(envExample)) {
    failures.push(".env.example does not document CARBON_FUNCTIONS_TOKEN.");
  }

  return failures;
}

function functionGeneratorScriptFailures() {
  const failures = [];
  for (const file of ["package.json", "packages/database/package.json"]) {
    const manifest = JSON.parse(readFileSync(resolve(repoRoot, file), "utf8"));
    if (Object.hasOwn(manifest.scripts ?? {}, "db:function:new")) {
      failures.push(`${file} still exposes the removed db:function:new script.`);
    }
  }
  return failures;
}
