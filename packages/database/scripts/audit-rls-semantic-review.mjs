import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const repoRoot = resolve(packageRoot, "../..");
const manifestPath = resolve(scriptDir, "rls-semantic-review.json");
const listReview = process.argv.includes("--list-review");
const failures = [];
const validOperations = new Set(["select", "insert", "update", "delete"]);
const validActions = new Set(["view", "create", "update", "delete"]);

const manifest = readManifest();
const profiles = manifest.profiles ?? {};
const reviews = Array.isArray(manifest.reviews) ? manifest.reviews : [];
const reviewKeys = new Set();
const permissionTuples = new Set();
const profileCounts = new Map();

validateProfiles(profiles);
validateReviews(reviews, profiles);

if (failures.length > 0) {
  console.error("RLS semantic review audit failed:");
  for (const failure of failures.slice(0, 100)) {
    console.error(`- ${failure}`);
  }
  if (failures.length > 100) {
    console.error(`- ...and ${failures.length - 100} more failures.`);
  }
  process.exit(1);
}

console.log("RLS semantic review audit passed");
console.log(`- profiles checked: ${Object.keys(profiles).length}`);
console.log(`- review entries checked: ${reviews.length}`);
console.log(`- permission tuples checked: ${permissionTuples.size}`);
console.log(`- profile coverage: ${formatCountMap(profileCounts)}`);
console.log(`- permission tuples: ${[...permissionTuples].sort().join(", ")}`);

if (listReview) {
  console.log("- semantic-review accepted entry list:");
  for (const review of [...reviews].sort(compareReviews)) {
    console.log(
      `  - ${review.table}: ${review.name} [${review.operations.join(
        ", "
      )}] -> ${review.profile}`
    );
  }
}

function readManifest() {
  if (!existsSync(manifestPath)) {
    failures.push("Missing RLS semantic review manifest.");
    return {};
  }

  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    failures.push(`Could not parse RLS semantic review manifest: ${error.message}`);
    return {};
  }
}

function validateProfiles(items) {
  if (!items || typeof items !== "object" || Array.isArray(items)) {
    failures.push("RLS semantic review manifest must contain a profiles object.");
    return;
  }

  for (const [name, profile] of Object.entries(items)) {
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      failures.push(`RLS semantic review profile "${name}" must be an object.`);
      continue;
    }
    if (typeof profile.description !== "string" || profile.description === "") {
      failures.push(`RLS semantic review profile "${name}" needs a description.`);
    }
    validateEvidence(
      profile.evidence,
      `RLS semantic review profile "${name}"`
    );
  }
}

function validateReviews(items, itemsProfiles) {
  if (!Array.isArray(manifest.reviews)) {
    failures.push("RLS semantic review manifest must contain a reviews array.");
    return;
  }

  for (const [index, review] of items.entries()) {
    if (!review || typeof review !== "object" || Array.isArray(review)) {
      failures.push(`RLS semantic review entry ${index} must be an object.`);
      continue;
    }

    const label =
      typeof review.table === "string" && typeof review.name === "string"
        ? `RLS semantic review entry "${review.table}.${review.name}"`
        : `RLS semantic review entry ${index}`;

    if (typeof review.table !== "string" || review.table === "") {
      failures.push(`${label} needs a table.`);
    }
    if (typeof review.name !== "string" || review.name === "") {
      failures.push(`${label} needs a name.`);
    }
    if (!Array.isArray(review.operations) || review.operations.length === 0) {
      failures.push(`${label} needs at least one operation.`);
    } else {
      for (const operation of review.operations) {
        if (!validOperations.has(operation)) {
          failures.push(`${label} has invalid operation "${operation}".`);
        }
      }
    }
    if (typeof review.profile !== "string" || !itemsProfiles[review.profile]) {
      failures.push(`${label} references unknown profile "${review.profile}".`);
    } else {
      profileCounts.set(
        review.profile,
        (profileCounts.get(review.profile) ?? 0) + 1
      );
    }

    validateEvidence(review.evidence ?? [], label);
    validatePermissions(review.permissions ?? [], label);

    if (
      typeof review.table === "string" &&
      typeof review.name === "string" &&
      Array.isArray(review.operations)
    ) {
      const key = `${review.table}.${review.name}.${review.operations.join("|")}`;
      if (reviewKeys.has(key)) {
        failures.push(`Duplicate RLS semantic review entry "${key}".`);
      }
      reviewKeys.add(key);
    }
  }
}

function validateEvidence(evidence, label) {
  if (!Array.isArray(evidence)) {
    failures.push(`${label} evidence must be an array.`);
    return;
  }

  for (const evidencePath of evidence) {
    if (typeof evidencePath !== "string" || evidencePath === "") {
      failures.push(`${label} has an invalid evidence path.`);
      continue;
    }
    if (!existsSync(resolve(repoRoot, evidencePath))) {
      failures.push(`${label} references missing evidence path "${evidencePath}".`);
    }
  }
}

function validatePermissions(permissions, label) {
  if (!Array.isArray(permissions)) {
    failures.push(`${label} permissions must be an array.`);
    return;
  }

  for (const permission of permissions) {
    if (!permission || typeof permission !== "object" || Array.isArray(permission)) {
      failures.push(`${label} has an invalid permission entry.`);
      continue;
    }

    const entries = Object.entries(permission);
    if (entries.length !== 1) {
      failures.push(`${label} permission entries must contain exactly one action.`);
      continue;
    }

    const [action, module] = entries[0];
    if (!validActions.has(action)) {
      failures.push(`${label} has invalid permission action "${action}".`);
    }
    if (typeof module !== "string" || module === "") {
      failures.push(`${label} has invalid permission module "${module}".`);
      continue;
    }
    permissionTuples.add(`${action}:${module}`);
  }
}

function formatCountMap(counts) {
  return [...counts.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([key, count]) => `${key}=${count}`)
    .join(", ");
}

function compareReviews(left, right) {
  return (
    left.table.localeCompare(right.table) ||
    left.name.localeCompare(right.name) ||
    left.operations.join("|").localeCompare(right.operations.join("|"))
  );
}
