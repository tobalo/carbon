import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const repoRoot = resolve(packageRoot, "../..");
const settingsModelsPath = resolve(
  repoRoot,
  "apps/erp/app/modules/settings/settings.models.ts"
);
const validActions = new Set(["view", "create", "update", "delete"]);
const ignoredPathParts = [
  "node_modules/",
  "packages/database/supa" + "base/",
  "packages/database/src/schema/index.ts",
];

const permissionModules = readPermissionModules();
const failures = [];
const checkedKeys = new Map();

for (const file of sourceFiles()) {
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
    if (!ts.isPropertyAssignment(node)) return;

    const key = propertyNameText(node.name);
    if (!key) return;

    const tuple = permissionTupleFromKey(key);
    if (!tuple) return;

    const { module, action } = tuple;
    if (!isArrayLikeInitializer(node.initializer)) return;

    addCheckedKey(key, locationFor(sourceFile, node));

    if (!permissionModules.has(module)) {
      failures.push(
        `${locationFor(sourceFile, node)} uses unknown permission module "${module}" in "${key}".`
      );
      return;
    }

    const moduleActions = permissionModules.get(module) ?? new Set();
    if (!moduleActions.has(action)) {
      failures.push(
        `${locationFor(sourceFile, node)} uses unsupported permission action "${action}" in "${key}".`
      );
    }
  });
}

if (failures.length > 0) {
  console.error("Permission-claim audit failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Permission-claim audit passed");
console.log(`- permission modules loaded: ${permissionModules.size}`);
console.log(`- static permission claim keys checked: ${checkedKeys.size}`);
console.log(`- checked keys: ${[...checkedKeys.keys()].sort().join(", ")}`);

function readPermissionModules() {
  const source = readFileSync(settingsModelsPath, "utf8");
  const sourceFile = ts.createSourceFile(
    settingsModelsPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const modules = new Map();

  visit(sourceFile, (node) => {
    if (!ts.isVariableDeclaration(node)) return;
    if (!ts.isIdentifier(node.name)) return;
    if (node.name.text !== "apiKeyPermissionModules") return;
    if (!node.initializer) return;

    const initializer = unwrap(node.initializer);
    if (!ts.isObjectLiteralExpression(initializer)) return;

    for (const property of initializer.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const module = propertyNameText(property.name);
      if (!module) continue;

      const actionInitializer = unwrap(property.initializer);
      if (!ts.isArrayLiteralExpression(actionInitializer)) continue;

      const actions = new Set();
      for (const element of actionInitializer.elements) {
        const action = stringLiteralText(element);
        if (action) actions.add(action);
      }
      modules.set(module, actions);
    }
  });

  if (modules.size === 0) {
    throw new Error(
      `Could not load apiKeyPermissionModules from ${settingsModelsPath}`
    );
  }

  return modules;
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
    .filter(
      (file) =>
        /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(file) &&
        existsSync(resolve(repoRoot, file)) &&
        !ignoredPathParts.some(
          (ignored) => file === ignored || file.startsWith(ignored)
        )
    );
}

function permissionTupleFromKey(key) {
  const index = key.lastIndexOf("_");
  if (index === -1) return null;

  const module = key.slice(0, index);
  const action = key.slice(index + 1);

  if (validActions.has(action) || permissionModules.has(module)) {
    return { module, action };
  }

  return null;
}

function isArrayLikeInitializer(node) {
  const expression = unwrap(node);
  if (ts.isArrayLiteralExpression(expression)) return true;
  return (
    ts.isIdentifier(expression) &&
    ["companyId", "companyIds", "permissions"].includes(expression.text)
  );
}

function addCheckedKey(key, location) {
  const locations = checkedKeys.get(key) ?? [];
  locations.push(location);
  checkedKeys.set(key, locations);
}

function visit(node, fn) {
  fn(node);
  ts.forEachChild(node, (child) => visit(child, fn));
}

function unwrap(node) {
  let current = node;
  while (
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function propertyNameText(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return node.text;
  return null;
}

function stringLiteralText(node) {
  const expression = unwrap(node);
  return ts.isStringLiteralLike(expression) ? expression.text : null;
}

function locationFor(sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile)
  );
  return `${sourceFile.fileName}:${line + 1}:${character + 1}`;
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}
