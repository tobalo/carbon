import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const vendor = "supa" + "base";
const vendorUpper = vendor.toUpperCase();
const liveVendorDir = `packages/database/${vendor}`;
const ignoredExactPaths = new Set([
  `MIGRATION_OFF_${vendorUpper}.md`,
  "packages/database/scripts/audit-vendor-removal.mjs",
]);
const ignoredPathParts = new Set([
  ".git",
  ".turbo",
  "build",
  "dist",
  "node_modules",
]);
const textExtensions = new Set([
  ".cjs",
  ".css",
  ".env",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".md",
  ".mts",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);
const textBasenames = new Set([
  ".env.example",
  "Dockerfile",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
]);
const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
const sourcePatterns = [
  {
    label: `${vendor} package import`,
    pattern: new RegExp(`@${vendor}/|${vendor}-js`, "i"),
  },
  {
    label: `${vendor} environment variable`,
    pattern: new RegExp(
      `(?:NEXT_PUBLIC_|VITE_)?${vendorUpper}_|${vendor}Url|${vendor}Key`,
      "i"
    ),
  },
  {
    label: `${vendor} auth helper`,
    pattern: /\bauth\.uid\s*\(/,
  },
  {
    label: `${vendor} helper path or hosted URL`,
    pattern: new RegExp(
      `(?:lib|utils)/${vendor}|${vendor}\\.co`,
      "i"
    ),
  },
  {
    label: "legacy hosted API path",
    pattern: /\b(?:auth|rest|storage)\/v1\b/i,
  },
  {
    label: "legacy edge-function terminology",
    pattern: /\bedge[- \t]+functions?\b/i,
  },
  {
    label: "legacy Deno function runtime compatibility",
    pattern: /\bglobalThis\b[\s\S]{0,80}\bDeno\b|\bDeno\.env\b/,
  },
  {
    label: "legacy service-role helper name",
    pattern: /\bgetCarbonServiceRole\b/,
  },
];
const dependencyPatterns = [
  new RegExp(`^@${vendor}/`, "i"),
  new RegExp(`^${vendor}$`, "i"),
  new RegExp(`${vendor}-js`, "i"),
];
const lockfileDependencyPattern = new RegExp(
  `@${vendor}/|\\b${vendor}-js\\b|\\b${vendor}@`,
  "i"
);
const helperPathPattern = new RegExp(
  `(?:^|/)(?:lib|utils)/${vendor}\\.(?:cjs|js|jsx|mjs|mts|ts|tsx)$`,
  "i"
);
const vendorPathPattern = new RegExp(`(?:^|/)${vendor}(?:[./-]|$)`, "i");

const failures = [];
const files = sourceFiles();
const packageFiles = files.filter((file) => basename(file) === "package.json");

if (existsSync(resolve(repoRoot, liveVendorDir))) {
  failures.push(`Live vendor directory still exists: ${liveVendorDir}`);
}

for (const file of packageFiles) {
  auditPackageJson(file);
}

auditLockfile();

let scannedFiles = 0;
for (const file of files) {
  if (ignoredExactPaths.has(file)) {
    continue;
  }

  if (vendorPathPattern.test(file)) {
    failures.push(`${file} is a live ${vendor}-named path.`);
  }
  if (helperPathPattern.test(file)) {
    failures.push(`${file} is a live ${vendor} helper path.`);
  }

  if (!isTextFile(file)) {
    continue;
  }

  const source = readFileSync(resolve(repoRoot, file), "utf8");
  scannedFiles += 1;
  for (const { label, pattern } of sourcePatterns) {
    if (pattern.test(source)) {
      failures.push(`${file} contains live ${label}.`);
    }
  }
}

if (failures.length > 0) {
  console.error("Vendor-removal audit failed:");
  for (const failure of failures.slice(0, 100)) {
    console.error(`- ${failure}`);
  }
  if (failures.length > 100) {
    console.error(`- ...and ${failures.length - 100} more failures.`);
  }
  process.exit(1);
}

console.log("Vendor-removal audit passed");
console.log(`- source/config files scanned: ${scannedFiles}`);
console.log(`- package manifests checked: ${packageFiles.length}`);
console.log(
  `- lockfile checked: ${existsSync(resolve(repoRoot, "pnpm-lock.yaml")) ? "yes" : "no"}`
);
console.log(`- removed live vendor directory checked: ${liveVendorDir}`);

function auditPackageJson(file) {
  const path = resolve(repoRoot, file);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    failures.push(`${file} could not be parsed as JSON: ${error.message}`);
    return;
  }

  for (const section of dependencySections) {
    for (const dependency of Object.keys(manifest[section] ?? {})) {
      if (dependencyPatterns.some((pattern) => pattern.test(dependency))) {
        failures.push(`${file} ${section} contains ${dependency}.`);
      }
    }
  }
}

function auditLockfile() {
  const lockfilePath = resolve(repoRoot, "pnpm-lock.yaml");
  if (!existsSync(lockfilePath)) {
    return;
  }

  const lockfile = readFileSync(lockfilePath, "utf8");
  if (lockfileDependencyPattern.test(lockfile)) {
    failures.push("pnpm-lock.yaml contains a live vendor package reference.");
  }
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
    .filter((file) => file && existsSync(resolve(repoRoot, file)))
    .filter((file) => !isIgnored(file));
}

function isIgnored(file) {
  if (file.startsWith(`${liveVendorDir}/`)) {
    return true;
  }
  return file.split("/").some((part) => ignoredPathParts.has(part));
}

function isTextFile(file) {
  return textExtensions.has(extname(file)) || textBasenames.has(basename(file));
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
}
