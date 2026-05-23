const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const DISALLOWED_CHARS = /[?#]/;

function decodeSegment(segment: string, key: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new Error(`Invalid storage key encoding: ${key}`);
  }
}

function assertSegment(segment: string, key: string) {
  if (!segment || segment === "." || segment === "..") {
    throw new Error(`Invalid storage key segment: ${key}`);
  }

  if (
    segment.includes("\\") ||
    CONTROL_CHARS.test(segment) ||
    DISALLOWED_CHARS.test(segment)
  ) {
    throw new Error(`Invalid storage key characters: ${key}`);
  }

  const decoded = decodeSegment(segment, key);
  if (
    !decoded ||
    decoded === "." ||
    decoded === ".." ||
    decoded.includes("/") ||
    decoded.includes("\\") ||
    CONTROL_CHARS.test(decoded) ||
    DISALLOWED_CHARS.test(decoded)
  ) {
    throw new Error(`Invalid storage key segment: ${key}`);
  }
}

function normalizeStorageParts(
  key: string,
  options: { allowTrailingSlash?: boolean } = {}
) {
  if (typeof key !== "string" || key.length === 0) {
    throw new Error("Storage key is required");
  }

  if (key !== key.trim() || key.startsWith("/")) {
    throw new Error(`Invalid storage key: ${key}`);
  }

  const parts = key.split("/");
  const lastPart = parts.at(-1);

  if (lastPart === "") {
    if (!options.allowTrailingSlash) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    parts.pop();
  }

  if (parts.length === 0) {
    throw new Error(`Invalid storage key: ${key}`);
  }

  for (const part of parts) {
    assertSegment(part, key);
  }

  return parts;
}

function normalizeCompanyId(companyId: string) {
  const normalized = normalizeStorageKey(companyId);
  if (normalized.includes("/")) {
    throw new Error(`Invalid company storage prefix: ${companyId}`);
  }
  return normalized;
}

export function normalizeStorageKey(key: string) {
  return normalizeStorageParts(key).join("/");
}

export function normalizeStoragePrefix(prefix: string) {
  const normalizedPrefix = prefix.replace(/^\/+/, "");
  if (!normalizedPrefix) return "";

  const hasTrailingSlash = normalizedPrefix.endsWith("/");
  const normalized = normalizeStorageParts(normalizedPrefix, {
    allowTrailingSlash: true
  }).join("/");

  return hasTrailingSlash ? `${normalized}/` : normalized;
}

export function assertCompanyPath(companyId: string, key: string) {
  const normalizedCompanyId = normalizeCompanyId(companyId);
  const normalizedKey = normalizeStorageKey(key);
  const [prefix] = normalizedKey.split("/");

  if (prefix !== normalizedCompanyId || normalizedKey === normalizedCompanyId) {
    throw new Error(`Cross-tenant storage access blocked for ${key}`);
  }

  return normalizedKey;
}

export function assertCompanyPrefix(companyId: string, prefix: string) {
  const normalizedCompanyId = normalizeCompanyId(companyId);
  const normalizedPrefix = normalizeStoragePrefix(prefix);
  const path = normalizedPrefix.endsWith("/")
    ? normalizedPrefix.slice(0, -1)
    : normalizedPrefix;

  if (!path) return `${normalizedCompanyId}/`;

  const [firstSegment] = path.split("/");
  if (firstSegment !== normalizedCompanyId) {
    throw new Error(`Cross-tenant storage access blocked for ${prefix}`);
  }

  return normalizedPrefix.endsWith("/")
    ? normalizedPrefix
    : `${normalizedPrefix}/`;
}

export function companyKey(companyId: string, path: string) {
  const normalizedCompanyId = normalizeCompanyId(companyId);
  const normalizedPath = normalizeStorageKey(path.replace(/^\/+/, ""));
  const [firstSegment] = normalizedPath.split("/");
  const key =
    firstSegment === normalizedCompanyId
      ? normalizedPath
      : `${normalizedCompanyId}/${normalizedPath}`;

  return assertCompanyPath(normalizedCompanyId, key);
}

export function companyPrefix(companyId: string, prefix: string) {
  const normalizedCompanyId = normalizeCompanyId(companyId);
  const normalizedPrefix = normalizeStoragePrefix(prefix);

  if (!normalizedPrefix) return `${normalizedCompanyId}/`;

  const path = normalizedPrefix.endsWith("/")
    ? normalizedPrefix.slice(0, -1)
    : normalizedPrefix;
  const [firstSegment] = path.split("/");
  const fullPrefix =
    firstSegment === normalizedCompanyId
      ? normalizedPrefix
      : `${normalizedCompanyId}/${normalizedPrefix}`;

  return assertCompanyPrefix(normalizedCompanyId, fullPrefix);
}
