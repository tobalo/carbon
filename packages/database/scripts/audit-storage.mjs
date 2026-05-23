import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const failures = [];

checkStoragePathHelpers();
checkStorageSigningHelpers();
checkStorageMinioSmoke();
checkQueryClientHasNoStorageAdapter();
checkJobsQueryClientHasNoStorageAdapter();
checkBrowserClientHasNoStorageFacade();
checkUploadRoutes();
checkRemoveRoutes();
checkPreviewRoutes();
checkBrowserUploadClients();
checkServiceWorkerPublicStorage();
checkNoStorageFacadeConsumers();
checkDirectS3Imports();

if (failures.length > 0) {
  console.error("Storage audit failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Storage audit passed");
console.log("- path helper contract checked");
console.log("- S3 signing/download helper contract checked");
console.log("- MinIO storage smoke checked");
console.log("- direct query storage facade removal checked");
console.log("- browser carbon storage facade removal checked");
console.log("- upload routes checked: 2");
console.log("- remove routes checked: 2");
console.log("- preview/share routes checked: 4");
console.log("- browser upload/remove clients checked: 2");
console.log("- service-worker public avatar paths checked: 4");
console.log("- storage facade consumer scan checked");
console.log(`- source files scanned for direct S3 imports: ${sourceFiles().length}`);

function checkStoragePathHelpers() {
  const source = read("packages/storage/src/path.ts");

  expectAll(source, "packages/storage/src/path.ts", [
    ["rejects empty/dot path segments", 'segment === "."'],
    ["rejects parent path segments", 'segment === ".."'],
    ["decodes percent-encoded segments before accepting them", "decodeURIComponent(segment)"],
    ["rejects decoded slash traversal", 'decoded.includes("/")'],
    ["rejects decoded backslash traversal", 'decoded.includes("\\\\")'],
    ["normalizes company IDs through storage-key validation", "function normalizeCompanyId"],
    ["asserts the first storage-key segment is the company ID", "prefix !== normalizedCompanyId"],
    ["rejects bare company-prefix object keys", "normalizedKey === normalizedCompanyId"],
    ["provides companyKey for prefixing tenant object paths", "export function companyKey"],
    ["provides companyPrefix for prefixing tenant object lists", "export function companyPrefix"]
  ]);
}

function checkStorageSigningHelpers() {
  const source = read("packages/storage/src/sign.ts");
  const checks = {
    signUpload: ["companyKey(args.companyId, args.path)", "PRIVATE_BUCKET"],
    signPrivateUpload: ["assertCompanyPath(args.companyId, args.key)", "PRIVATE_BUCKET"],
    signPublicUpload: ["normalizeStorageKey(args.key)", "PUBLIC_BUCKET"],
    uploadObject: ["assertCompanyPath(args.companyId, args.key)", "PRIVATE_BUCKET"],
    downloadObject: ["assertCompanyPath(args.companyId, args.key)", "PRIVATE_BUCKET"],
    signDownload: ["assertCompanyPath(args.companyId, args.key)", "PRIVATE_BUCKET"],
    removeObject: ["assertCompanyPath(args.companyId, args.key)", "PRIVATE_BUCKET"],
    removePublicObject: ["normalizeStorageKey(args.key)", "PUBLIC_BUCKET"],
    moveObject: [
      "assertCompanyPath(args.companyId, args.fromKey)",
      "assertCompanyPath(args.companyId, args.toKey)",
      "PRIVATE_BUCKET"
    ],
    listObjects: ["companyPrefix(args.companyId, args.prefix)", "PRIVATE_BUCKET"]
  };

  for (const [fnName, snippets] of Object.entries(checks)) {
    const block = exportedAsyncFunctionBlock(source, fnName);
    if (!block) {
      failures.push(`packages/storage/src/sign.ts is missing ${fnName}.`);
      continue;
    }

    for (const snippet of snippets) {
      if (!block.includes(snippet)) {
        failures.push(
          `packages/storage/src/sign.ts ${fnName} does not contain ${snippet}.`
        );
      }
    }
  }

  const mapper = exportedFunctionBlock(source, "toStorageFileObject");
  if (!mapper) {
    failures.push("packages/storage/src/sign.ts is missing toStorageFileObject.");
  } else {
    for (const snippet of ["bucket_id: bucket", "metadata: {", "size: object.size"]) {
      if (!mapper.includes(snippet)) {
        failures.push(
          `packages/storage/src/sign.ts toStorageFileObject does not contain ${snippet}.`
        );
      }
    }
  }
}

function checkStorageMinioSmoke() {
  const packageJson = JSON.parse(read("packages/storage/package.json"));
  if (packageJson.scripts?.["smoke:minio"] !== "tsx scripts/smoke-minio.ts") {
    failures.push(
      "packages/storage/package.json must expose smoke:minio for direct S3 runtime checks."
    );
  }

  const source = read("packages/storage/scripts/smoke-minio.ts");
  expectAll(source, "packages/storage/scripts/smoke-minio.ts", [
    ["runs isolated MinIO container", "minio/minio:latest"],
    ["binds MinIO only to localhost", "`127.0.0.1:${port}:9000`"],
    ["sets S3-compatible endpoint env", "process.env.S3_ENDPOINT = endpoint"],
    ["creates private bucket through S3 API", "new CreateBucketCommand({ Bucket: storage.PRIVATE_BUCKET })"],
    ["creates public bucket through S3 API", "new CreateBucketCommand({ Bucket: storage.PUBLIC_BUCKET })"],
    ["verifies private signed uploads", "storage.signUpload({"],
    ["verifies private signed downloads", "storage.signDownload({"],
    ["verifies direct server uploads", "storage.uploadObject({"],
    ["verifies direct private downloads", "storage.downloadObject({"],
    ["verifies tenant-prefixed listings", "storage.listObjects({"],
    ["verifies object moves", "storage.moveObject({"],
    ["verifies private object removal", "storage.removeObject({"],
    ["verifies public signed uploads", "storage.signPublicUpload({"],
    ["verifies public object removal", "storage.removePublicObject({"],
    ["rejects cross-tenant private paths", "company-b/documents/nope.txt"],
    ["rejects encoded traversal", "company-a/%2e%2e/nope.txt"],
    ["cleans up temporary MinIO container", 'docker(["rm", "-f", container]']
  ]);
}

function checkQueryClientHasNoStorageAdapter() {
  const source = read("packages/database/src/query-client.ts");

  for (const snippet of [
    "readonly storage =",
    "export type StorageClient",
    "StorageResult",
    "companyIdFromStorageKey",
    "toStorageFileObject",
    'import("@carbon/storage")',
    'from("@carbon/storage")'
  ]) {
    if (source.includes(snippet)) {
      failures.push(
        `packages/database/src/query-client.ts still exposes storage compatibility surface ${snippet}.`
      );
    }
  }
}

function checkJobsQueryClientHasNoStorageAdapter() {
  const source = read("packages/jobs/src/lib/query-client.ts");

  for (const snippet of [
    "storage?:",
    "storage:",
    "from(bucket",
    "StorageClient",
    "StorageResult"
  ]) {
    if (source.includes(snippet)) {
      failures.push(
        `packages/jobs/src/lib/query-client.ts still exposes storage compatibility surface ${snippet}.`
      );
    }
  }
}

function checkBrowserClientHasNoStorageFacade() {
  const source = read("packages/auth/src/lib/carbon/client.ts");
  for (const snippet of [
    "createBrowserStorage",
    "storageError",
    "encodeStoragePath",
    "storage:",
    ".storage",
    ".from("
  ]) {
    if (source.includes(snippet)) {
      failures.push(
        `packages/auth/src/lib/carbon/client.ts still exposes browser storage compatibility surface ${snippet}.`
      );
    }
  }
}

function checkUploadRoutes() {
  for (const file of [
    "apps/erp/app/routes/file+/upload.ts",
    "apps/mes/app/routes/file+/upload.ts"
  ]) {
    const source = read(file);
    expectAll(source, file, [
      ["requires authenticated company context", "requirePermissions(request, {})"],
      ["defaults to private bucket", 'const bucket = body.bucket ?? "private"'],
      ["normalizes leading slashes before signing", "body.path.replace(/^\\/+/, \"\")"],
      ["rejects missing paths", 'return Response.json({ error: "Missing path" }'],
      ["signs private uploads through signPrivateUpload", "signPrivateUpload({"],
      ["signs public uploads through signPublicUpload", "signPublicUpload({"],
      ["constrains feedback uploads to feedback namespace", "normalizeStorageKey(`feedback/${storagePath}`)"],
      ["returns only feedback-relative paths to callers", 'signed.key.slice("feedback/".length)'],
      ["constrains avatar uploads to the active user", 'normalizedPath.startsWith(`${userId}.`)'],
      ["stores avatar uploads under the public avatars namespace", "normalizeStorageKey(`avatars/${normalizedPath}`)"],
      ["returns only avatar-relative paths to callers", 'signed.key.slice("avatars/".length)'],
      ["rejects unsupported buckets", 'return Response.json({ error: "Unsupported bucket" }']
    ]);

    expectPattern(
      source,
      file,
      /if \(bucket === "private"\)[\s\S]*assertCompanyPath\(companyId, storagePath\)[\s\S]*signPrivateUpload/,
      "does not require company-prefixed private upload keys before signing"
    );
    expectPattern(
      source,
      file,
      /if \(bucket === "public"\)[\s\S]*assertCompanyPath\(companyId, storagePath\)[\s\S]*signPublicUpload/,
      "does not require company-prefixed public upload keys before signing"
    );
    expectPattern(
      source,
      file,
      /if \(bucket === "feedback"\)[\s\S]*normalizeStorageKey\(`feedback\/\$\{storagePath\}`\)[\s\S]*signPublicUpload/,
      "does not constrain feedback uploads to the public feedback/ namespace"
    );
    expectPattern(
      source,
      file,
      /if \(bucket === "avatars"\)[\s\S]*normalizedPath\.startsWith\(`\$\{userId\}\.`\)[\s\S]*normalizeStorageKey\(`avatars\/\$\{normalizedPath\}`\)[\s\S]*signPublicUpload/,
      "does not constrain avatar uploads to the public avatars/ namespace and active user"
    );
  }
}

function checkRemoveRoutes() {
  for (const file of [
    "apps/erp/app/routes/file+/remove.ts",
    "apps/mes/app/routes/file+/remove.ts"
  ]) {
    const source = read(file);
    expectAll(source, file, [
      ["requires authenticated company context", "requirePermissions(request, {})"],
      ["defaults to private bucket", 'const bucket = body.bucket ?? "private"'],
      ["normalizes leading slashes before removing", "path.replace(/^\\/+/, \"\")"],
      ["rejects missing paths", 'return Response.json({ error: "Missing path" }'],
      ["removes private objects through removeObject", "removeObject({ companyId, key })"],
      ["removes public objects through removePublicObject", "removePublicObject({ key })"],
      ["constrains feedback removals to feedback namespace", "normalizeStorageKey(`feedback/${storagePath}`)"],
      ["constrains avatar removals to the active user", 'normalizedPath.startsWith(`${userId}.`)'],
      ["stores avatar removals under the public avatars namespace", "normalizeStorageKey(`avatars/${normalizedPath}`)"],
      ["rejects unsupported buckets", 'return Response.json({ error: "Unsupported bucket" }']
    ]);

    expectPattern(
      source,
      file,
      /if \(bucket === "private"\)[\s\S]*assertCompanyPath\(companyId, storagePath\)[\s\S]*removeObject/,
      "does not require company-prefixed private remove keys before deleting"
    );
    expectPattern(
      source,
      file,
      /if \(bucket === "public"\)[\s\S]*assertCompanyPath\(companyId, storagePath\)[\s\S]*removePublicObject/,
      "does not require company-prefixed public remove keys before deleting"
    );
    expectPattern(
      source,
      file,
      /if \(bucket === "feedback"\)[\s\S]*normalizeStorageKey\(`feedback\/\$\{storagePath\}`\)[\s\S]*removePublicObject/,
      "does not constrain feedback removals to the public feedback/ namespace"
    );
    expectPattern(
      source,
      file,
      /if \(bucket === "avatars"\)[\s\S]*normalizedPath\.startsWith\(`\$\{userId\}\.`\)[\s\S]*normalizeStorageKey\(`avatars\/\$\{normalizedPath\}`\)[\s\S]*removePublicObject/,
      "does not constrain avatar removals to the public avatars/ namespace and active user"
    );
  }
}

function checkPreviewRoutes() {
  const erpPreview = read("apps/erp/app/routes/file+/preview+/$bucket.$.tsx");
  const mesPreview = read("apps/mes/app/routes/file+/preview+/$bucket.$.tsx");

  for (const [file, source] of [
    ["apps/erp/app/routes/file+/preview+/$bucket.$.tsx", erpPreview],
    ["apps/mes/app/routes/file+/preview+/$bucket.$.tsx", mesPreview]
  ]) {
    expectAll(source, file, [
      ["requires authenticated company context", "requirePermissions(request, {})"],
      ["asserts decoded preview paths stay in the active company", "assertCompanyPath(companyId, decodeURIComponent(path))"],
      ["downloads through the shared private-object helper", "downloadObject({ companyId, key: storageKey })"]
    ]);
  }

  expectAll(erpPreview, "apps/erp/app/routes/file+/preview+/$bucket.$.tsx", [
    ["imports document read authorization", "canReadDocumentPath"],
    ["checks document access for private preview downloads", 'if (bucket === "private")'],
    ["passes the authenticated user into document read authorization", "canReadDocumentPath(client, storageKey, userId)"]
  ]);

  const publicModel = read("apps/erp/app/routes/file+/model+/public.$.tsx");
  expectAll(publicModel, "apps/erp/app/routes/file+/model+/public.$.tsx", [
    ["normalizes public model route paths", "normalizeStorageKey(path)"],
    ["only serves keys from a models path segment", 'storageKey.split("/").includes("models")'],
    ["derives company ID from the normalized key", 'const companyId = storageKey.split("/")[0]'],
    ["asserts the model key belongs to that company", "assertCompanyPath(companyId, storageKey)"],
    ["downloads through the shared private-object helper", "downloadObject({ companyId, key: storageKey })"]
  ]);

  const customerShare = read("apps/erp/app/routes/share+/customer.$id.$.tsx");
  expectAll(customerShare, "apps/erp/app/routes/share+/customer.$id.$.tsx", [
    ["loads customer portal scope before download", "getCustomerPortal(serviceClient, id)"],
    ["asserts customer-share paths stay in the portal company", "assertCompanyPath(customerData.companyId, decodeURIComponent(path))"],
    ["restricts shared files to job-scoped paths", "path.match(/^([^/]+)\\/job\\/([^/]+)\\/[^/]+$/)"],
    ["checks the job belongs to the portal company", "job.data.companyId !== customerData.companyId"],
    ["checks the job belongs to the portal customer", "job.data.customerId !== customerData.customerId"],
    ["downloads through the shared private-object helper", "downloadObject({ companyId: storageCompanyId, key: storageKey })"]
  ]);
}

function checkBrowserUploadClients() {
  const mesStorage = read("apps/mes/app/utils/storage.ts");
  expectAll(mesStorage, "apps/mes/app/utils/storage.ts", [
    ["requests upload signing through /file/upload", 'fetch("/file/upload"'],
    ["uploads directly to the signed object-storage URL", "fetch(signed.url"],
    ["uses PUT for signed object upload", 'method: "PUT"'],
    ["sends bucket, path, and content type for upload signing", "JSON.stringify({ bucket, path, contentType })"]
  ]);

  const erpStorage = read("apps/erp/app/utils/storage.ts");
  expectAll(erpStorage, "apps/erp/app/utils/storage.ts", [
    ["requests upload signing through /file/upload", 'fetch("/file/upload"'],
    ["uploads directly to the signed object-storage URL", "fetch(signed.url"],
    ["uses PUT for signed object upload", 'method: "PUT"'],
    ["sends bucket, path, and content type for upload signing", "JSON.stringify({ bucket, path, contentType })"],
    ["requests removals through /file/remove", 'fetch("/file/remove"'],
    ["sends bucket and paths for removals", "JSON.stringify({ bucket, paths })"]
  ]);

  for (const file of [
    "apps/erp/app/components/CadModel.tsx",
    "apps/erp/app/components/Documents.tsx",
    "apps/erp/app/components/ImportCSVModal/UploadCSV.tsx",
    "apps/erp/app/components/ItemThumnailUpload.tsx",
    "apps/erp/app/components/Layout/Topbar/Feedback.tsx",
    "apps/erp/app/components/Layout/Topbar/Suggestion.tsx",
    "apps/erp/app/routes/x+/training+/$id.tsx",
    "apps/erp/app/routes/x+/procedure+/$id.tsx",
    "apps/erp/app/modules/account/ui/Profile/ProfilePhotoForm.tsx",
    "apps/erp/app/modules/account/ui/UserAttributes/UserAttributesForm.tsx",
    "apps/erp/app/modules/documents/ui/Documents/DocumentCreateForm.tsx",
    "apps/erp/app/modules/inventory/ui/Receipts/ReceiptLines.tsx",
    "apps/erp/app/modules/inventory/ui/Shipments/ShipmentNotes.tsx",
    "apps/erp/app/modules/inventory/ui/StockTransfers/StockTransferNotes.tsx",
    "apps/erp/app/modules/items/ui/Item/BillOfProcess.tsx",
    "apps/erp/app/modules/items/ui/Item/ItemDocuments.tsx",
    "apps/erp/app/modules/items/ui/Item/ItemNotes.tsx",
    "apps/erp/app/modules/items/ui/Parts/PartForm.tsx",
    "apps/erp/app/modules/items/ui/Tools/ToolForm.tsx",
    "apps/erp/app/modules/production/ui/Jobs/JobNotes.tsx",
    "apps/erp/app/modules/production/ui/Jobs/JobBillOfProcess.tsx",
    "apps/erp/app/modules/production/ui/Jobs/JobDocuments.tsx",
    "apps/erp/app/modules/production/ui/Procedures/ProcedureExplorer.tsx",
    "apps/erp/app/modules/purchasing/ui/Supplier/SupplierTaxForm.tsx",
    "apps/erp/app/modules/purchasing/ui/SupplierInteraction/SupplierInteractionDocuments.tsx",
    "apps/erp/app/modules/purchasing/ui/SupplierInteraction/SupplierInteractionLineDocuments.tsx",
    "apps/erp/app/modules/purchasing/ui/SupplierInteraction/SupplierInteractionLineNotes.tsx",
    "apps/erp/app/modules/purchasing/ui/SupplierInteraction/SupplierInteractionNotes.tsx",
    "apps/erp/app/modules/quality/ui/Calibrations/GaugeCalibrationRecordForm.tsx",
    "apps/erp/app/modules/quality/ui/Documents/QualityDocumentExplorer.tsx",
    "apps/erp/app/modules/sales/ui/Opportunity/OpportunityNotes.tsx",
    "apps/erp/app/modules/quality/ui/Issue/IssueContent.tsx",
    "apps/erp/app/modules/quality/ui/Issue/IssueTask.tsx",
    "apps/erp/app/modules/quality/ui/IssueWorkflows/IssueWorkflowForm.tsx",
    "apps/erp/app/modules/quality/ui/RiskRegister/RiskRegisterForm.tsx",
    "apps/erp/app/modules/resources/ui/Maintenance/MaintenanceDispatchForm.tsx",
    "apps/erp/app/modules/resources/ui/Maintenance/MaintenanceDispatchNotes.tsx",
    "apps/erp/app/modules/sales/ui/Customer/CustomerTaxForm.tsx",
    "apps/erp/app/modules/sales/ui/Opportunity/OpportunityDocuments.tsx",
    "apps/erp/app/modules/sales/ui/Opportunity/OpportunityLineDocuments.tsx",
    "apps/erp/app/modules/sales/ui/Opportunity/OpportunityLineNotes.tsx",
    "apps/erp/app/modules/sales/ui/Quotes/QuoteBillOfProcess.tsx",
    "apps/erp/app/modules/settings/ui/Company/CompanyLogoForm.tsx"
  ]) {
    const source = read(file);
    expectAll(source, file, [
      ["uses the direct signed-upload helper", "uploadStorageObject({"]
    ]);
    if (source.includes('storage.from("private").upload')) {
      failures.push(
        `${file} must upload browser files through uploadStorageObject(), not carbon.storage.from("private").upload().`
      );
    }
  }

  for (const file of sourceFiles().filter((file) => file.startsWith("apps/erp/app/"))) {
    const source = read(file);
    if (source.includes("carbon.storage")) {
      failures.push(
        `${file} must not use carbon.storage in browser/server ERP code; use route helpers or server storage helpers directly.`
      );
    }
    if (/\.storage\s*\.from\([^)]+\)\s*\.upload/.test(source)) {
      failures.push(`${file} still uploads through a storage.from(...).upload facade.`);
    }
    if (/\.storage\s*\.from\([^)]+\)\s*\.remove/.test(source)) {
      failures.push(`${file} still removes through a storage.from(...).remove facade.`);
    }
  }
}

function checkNoStorageFacadeConsumers() {
  const allowed = new Set([
    "packages/database/scripts/audit-storage.mjs"
  ]);
  const forbiddenPattern =
    /\b(?:carbon|client|serviceClient)\.storage\b|\.storage\s*\.from\s*\(/;

  for (const file of sourceFiles()) {
    if (allowed.has(file)) continue;

    const source = read(file);
    if (forbiddenPattern.test(source)) {
      failures.push(
        `${file} still consumes the storage facade; use @carbon/storage helpers or app file routes directly.`
      );
    }
  }
}

function checkServiceWorkerPublicStorage() {
  const files = [
    "apps/academy/public/serviceWorker.js",
    "apps/erp/public/serviceWorker.js",
    "apps/mes/public/serviceWorker.js",
    "apps/starter/public/serviceWorker.js"
  ];

  for (const file of files) {
    const source = read(file);
    if (source.includes("storage/" + "v1/object/public")) {
      failures.push(
        `${file} still caches Supabase public-storage URLs; cache direct public avatar paths instead.`
      );
    }
    if (!source.includes('url.pathname.includes("/avatars/")')) {
      failures.push(`${file} does not cache direct public avatar paths.`);
    }
  }
}

function checkDirectS3Imports() {
  const disallowed = [
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
    "S3Client",
    "PutObjectCommand",
    "GetObjectCommand",
    "DeleteObjectCommand",
    "CopyObjectCommand",
    "ListObjectsV2Command"
  ];

  for (const file of sourceFiles()) {
    if (
      file.startsWith("packages/storage/") ||
      file === "packages/database/scripts/audit-storage.mjs"
    ) {
      continue;
    }

    const source = read(file);
    for (const token of disallowed) {
      if (source.includes(token)) {
        failures.push(`${file} imports or references direct S3 primitive ${token}.`);
      }
    }
  }
}

function exportedAsyncFunctionBlock(source, fnName) {
  const start = source.indexOf(`export async function ${fnName}`);
  if (start === -1) {
    return null;
  }

  const next = source.indexOf("\nexport async function ", start + 1);
  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function exportedFunctionBlock(source, fnName) {
  const start = source.indexOf(`export function ${fnName}`);
  if (start === -1) {
    return null;
  }

  const next = source.indexOf("\nexport ", start + 1);
  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function storageMethodBlock(source, methodName) {
  const startPattern =
    methodName === "move"
      ? `${methodName}: async (\n        fromPath: string`
      : methodName === "upload"
        ? `${methodName}: async (\n        path: string`
        : `${methodName}: async`;
  const start = source.indexOf(startPattern);
  if (start === -1) {
    return null;
  }

  const nextMethodStarts = [
    "createSignedUrl: async",
    "download: async",
    "list: async",
    "remove: async",
    "move: async",
    "upload: async"
  ]
    .map((pattern) => source.indexOf(pattern, start + startPattern.length))
    .filter((position) => position !== -1)
    .sort((a, b) => a - b);

  return source.slice(start, nextMethodStarts[0] ?? source.length);
}

function expectAll(source, file, checks) {
  for (const [description, snippet] of checks) {
    if (!source.includes(snippet)) {
      failures.push(`${file} ${description}.`);
    }
  }
}

function expectPattern(source, file, pattern, description) {
  if (!pattern.test(source)) {
    failures.push(`${file} ${description}.`);
  }
}

function read(file) {
  return readFileSync(resolve(repoRoot, file), "utf8");
}

function sourceFiles() {
  return git(
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "apps",
    "packages",
    "examples"
  )
    .split("\n")
    .filter(
      (file) =>
        /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json)$/.test(file) &&
        existsSync(resolve(repoRoot, file)) &&
        !file.includes("/node_modules/") &&
        !file.startsWith("packages/database/supa" + "base/")
    );
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024
  });
}
