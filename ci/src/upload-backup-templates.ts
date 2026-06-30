import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { objectExists, uploadObject } from "@carbon/object-storage/server";
import * as dotenv from "dotenv";

dotenv.config();

const TEMPLATE_BUCKET = "company-templates";
const BACKUP_SUFFIX = ".carbon.json.gz";
// A backup's storage files live in a sibling `<industryId>.assets/` folder
// (generation 2: assets are no longer base64-embedded in the gz). Must match
// `BACKUP_GZ_SUFFIX` / `backupAssetPrefix` in @carbon/jobs company-backup.ts.
const ASSETS_SUFFIX = ".assets";

// The bucket the app serves per-company assets (3D models, …) from, and the
// shared prefix within it where each template's assets live ONCE per workspace.
// A template import references these instead of copying files per company.
// NOTE: `_templates` must match `TEMPLATE_ASSET_PREFIX` in
// packages/jobs/src/inngest/functions/tasks/company-backup.ts — keep in sync.
const PRIVATE_BUCKET = "private";
const TEMPLATE_ASSET_PREFIX = "_templates";

// Idempotent by default: skip any object that already exists, so re-running is a
// cheap no-op. Pass `--force` to overwrite (republish an updated template).
const FORCE = process.argv.includes("--force");

/**
 * Upload one object, idempotently. Without `--force`, an object that already
 * exists is left untouched and reported as "skipped". With `--force`, it is
 * overwritten.
 */
async function publishObject(
  bucket: string,
  path: string,
  bytes: Buffer,
  contentType?: string
): Promise<"uploaded" | "skipped" | { error: string }> {
  try {
    if (!FORCE && (await objectExists({ bucket, key: path }))) {
      return "skipped";
    }

    await uploadObject({
      bucket,
      key: path,
      body: bytes,
      contentType
    });
    return "uploaded";
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Repo-committed onboarding demo templates. Authored manually (export a
// populated company from Settings → Backups, download the .gz, commit it here),
// versioned so we control when to break backwards compatibility via the
// backup's own manifest version.
const BACKUPS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "packages",
  "database",
  "backups"
);

type TemplateAsset = { path: string; bytes: Buffer };
type Template = {
  fileName: string;
  industryId: string;
  bytes: Buffer;
  assets: TemplateAsset[];
};

async function loadTemplates(): Promise<Template[]> {
  let entries: string[];
  try {
    entries = await readdir(BACKUPS_DIR);
  } catch {
    return [];
  }
  const files = entries.filter((f) => f.endsWith(BACKUP_SUFFIX));
  return Promise.all(
    files.map(async (fileName) => {
      const bytes = await readFile(join(BACKUPS_DIR, fileName));
      const industryId = fileName.slice(0, -BACKUP_SUFFIX.length);
      return {
        fileName,
        industryId,
        bytes,
        assets: await extractTemplateAssets(industryId, bytes)
      };
    })
  );
}

/** Every file under a directory, recursing into subfolders (absolute paths). */
async function walkFiles(dir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkFiles(full)));
    } else {
      out.push(full);
    }
  }
  return out;
}

// A template's storage assets live in a committed `<industryId>.assets/` folder
// next to the gz, mirroring the source path (`{sourceCompanyId}/models/{id}.stl`).
// Rekey them to the shared `_templates/{industryId}/…` location so a referenced
// import can point at them without copying. Mirrors `rewriteToTemplateAssetPath`
// in @carbon/jobs. The gz itself carries only the manifest + data.
async function extractTemplateAssets(
  industryId: string,
  gzBytes: Buffer
): Promise<TemplateAsset[]> {
  let sourceCompanyId: string | undefined;
  try {
    const backup = JSON.parse(gunzipSync(gzBytes).toString()) as {
      manifest?: { sourceCompanyId?: string };
    };
    sourceCompanyId = backup.manifest?.sourceCompanyId;
  } catch (err) {
    console.error(`🔴 ${industryId}: failed to read template gz`, err);
    return [];
  }
  if (!sourceCompanyId) return [];

  const assetsDir = join(BACKUPS_DIR, `${industryId}${ASSETS_SUFFIX}`);
  const assets: TemplateAsset[] = [];
  for (const file of await walkFiles(assetsDir)) {
    // Path within the assets folder, e.g. `{sourceCompanyId}/models/x.stl`.
    const rel = relative(assetsDir, file).split(sep).join("/");
    const rest = rel.startsWith(`${sourceCompanyId}/`)
      ? rel.slice(sourceCompanyId.length + 1)
      : rel;
    assets.push({
      path: `${TEMPLATE_ASSET_PREFIX}/${industryId}/${rest}`,
      bytes: await readFile(file)
    });
  }
  return assets;
}

// Manual publish step (NOT run on every deploy — see the "Publish backup
// templates" workflow). Templates change rarely and are large, so they're
// published deliberately to the configured Carbon object store. Onboarding then
// provisions a new company from the matching <industryId> template. Idempotent:
// existing objects are skipped unless `--force` is passed.
async function main(): Promise<void> {
  const templates = await loadTemplates();
  if (templates.length === 0) {
    console.log("⏭️ No backup templates committed — nothing to upload");
    return;
  }
  console.log(
    `✅ Publishing ${templates.length} backup template(s)${
      FORCE ? " (force overwrite)" : " (skip existing)"
    }: ${templates.map((t) => t.fileName).join(", ")}`
  );

  let hasErrors = false;

  for (const { fileName, bytes, assets } of templates) {
    const gz = await publishObject(
      TEMPLATE_BUCKET,
      `templates/${fileName}`,
      bytes,
      "application/gzip"
    );
    if (typeof gz === "object") {
      console.error(`🔴 Failed to upload templates/${fileName}`, gz.error);
      hasErrors = true;
    }

    // Fan the template's storage assets into the shared `_templates/` prefix
    // so onboarding-from-template can reference them instead of copying files
    // into every company's bucket.
    let uploaded = gz === "uploaded" ? 1 : 0;
    let skipped = gz === "skipped" ? 1 : 0;
    for (const asset of assets) {
      const result = await publishObject(PRIVATE_BUCKET, asset.path, asset.bytes);
      if (typeof result === "object") {
        console.error(`🔴 Failed to upload ${asset.path}`, result.error);
        hasErrors = true;
      } else if (result === "uploaded") {
        uploaded++;
      } else {
        skipped++;
      }
    }

    console.log(
      `✅ ${fileName} — ${uploaded} uploaded, ${skipped} skipped`
    );
  }

  if (hasErrors) {
    console.error("🔴 Backup template upload completed with errors");
    process.exit(1);
  }

  console.log("✅ Uploaded backup templates");
}

main()
  .catch((err) => {
    console.error("🔴 upload-backup-templates failed", err);
    process.exitCode = 1;
  });
