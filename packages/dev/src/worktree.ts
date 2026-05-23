import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from "node:fs";
import net from "node:net";
import { homedir } from "node:os";
import { execa } from "execa";
import { basename, dirname, join, normalize } from "pathe";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

export const PORT_NAMES = [
  "PORT_DB",
  "PORT_STORAGE",
  "PORT_CONSOLE",
  "PORT_INBUCKET",
  "PORT_INNGEST",
  "PORT_ERP",
  "PORT_MES"
] as const;
type PortName = (typeof PORT_NAMES)[number];

export type PortMap = Record<PortName, number>;
export type AuthSecret = { secret: string };
type RegistryEntry = {
  worktreeRoot: string;
  ports: PortMap;
  redisDb: number;
  auth: AuthSecret;
};
type Registry = Record<string, RegistryEntry>;

export const SHARED_REDIS_PORT = 6379;
const REDIS_DB_MAX = 16;
const SLUG_FILE = ".carbon-worktree";
const REGISTRY_PATH = join(homedir(), ".carbon", "dev-ports.json");

// ---------------------------------------------------------------------------
// Worktree identity (slug)
// ---------------------------------------------------------------------------

export function resolveSlug(worktreeRoot: string): string {
  const fromEnv = process.env.CARBON_WORKTREE?.trim();
  if (fromEnv) return slugify(fromEnv);

  const filePath = join(worktreeRoot, SLUG_FILE);
  if (existsSync(filePath)) {
    const fromFile = readFileSync(filePath, "utf8").trim();
    if (fromFile) return slugify(fromFile);
  }

  return slugify(basename(worktreeRoot));
}

export function persistSlug(worktreeRoot: string, slug: string) {
  writeFileSync(join(worktreeRoot, SLUG_FILE), `${slug}\n`);
}

export async function getWorktreeRoot(): Promise<string> {
  try {
    const r = await execa("git", ["rev-parse", "--show-toplevel"]);
    return r.stdout.trim();
  } catch {
    return process.cwd();
  }
}

export function projectName(slug: string): string {
  return `carbon-${slug}`;
}

// Resolve symlinks + normalize separators / trailing slashes so two strings
// pointing at the same worktree compare equal (e.g. /tmp/x vs symlinked path).
function canonicalWorktreePath(input: string): string {
  let p = input.trim();
  try {
    p = realpathSync.native(p);
  } catch {
    // Best-effort: fall through to string normalization.
  }
  return normalize(p).replace(/\/+$/, "");
}

export function sameWorktreePath(a: string, b: string): boolean {
  return canonicalWorktreePath(a) === canonicalWorktreePath(b);
}

export async function ensureSlugAvailable(slug: string, worktreeRoot: string) {
  const project = projectName(slug);
  let runningPath: string | null = null;
  try {
    const r = await execa(
      "docker",
      [
        "ps",
        "--filter",
        `label=com.docker.compose.project=${project}`,
        "--format",
        '{{.Label "com.docker.compose.project.working_dir"}}'
      ],
      { reject: false }
    );
    const out = r.stdout.trim();
    if (out) runningPath = out.split("\n")[0] ?? null;
  } catch {
    return;
  }
  if (runningPath && !sameWorktreePath(runningPath, worktreeRoot)) {
    throw new Error(
      `Slug "${slug}" is already in use by another worktree at:\n  ${runningPath}\n\nSet CARBON_WORKTREE to a unique slug for this worktree, or stop the other stack.`
    );
  }
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

// ---------------------------------------------------------------------------
// Per-worktree slot (ports + redis db + auth secret)
// ---------------------------------------------------------------------------

export async function resolveSlot(
  slug: string,
  worktreeRoot: string
): Promise<{ ports: PortMap; redisDb: number; auth: AuthSecret }> {
  const registry = readRegistry();
  const existing = registry[slug];

  // Fast path: registry entry is valid, points at this worktree, and all
  // ports are still available (no stale processes holding them).
  if (existing && sameWorktreePath(existing.worktreeRoot, worktreeRoot)) {
    const allFree = await portsAvailable(Object.values(existing.ports));
    if (allFree) {
      return {
        ports: existing.ports,
        redisDb: existing.redisDb,
        auth: existing.auth
      };
    }
    // Some cached ports are taken — fall through to re-allocate.
  }

  // Slug collision (different path) or no entry — allocate fresh.
  // The Better Auth secret signs local sessions; reuse it when present so
  // existing dev sessions stay valid.
  const { claimedPorts, claimedDbs } = collectClaims(registry, slug);
  const ports = await pickPorts(claimedPorts);
  const redisDb = pickRedisDb(claimedDbs);
  const auth = existing?.auth ?? generateAuthSecret();

  registry[slug] = { worktreeRoot, ports, redisDb, auth };
  writeRegistry(registry);
  return { ports, redisDb, auth };
}

function collectClaims(
  registry: Registry,
  excludeSlug: string
): { claimedPorts: Set<number>; claimedDbs: Set<number> } {
  const claimedPorts = new Set<number>();
  const claimedDbs = new Set<number>();
  for (const [s, entry] of Object.entries(registry)) {
    if (s === excludeSlug) continue;
    for (const p of Object.values(entry.ports)) claimedPorts.add(p);
    claimedDbs.add(entry.redisDb);
  }
  return { claimedPorts, claimedDbs };
}

export function getSlot(slug: string): RegistryEntry | null {
  return readRegistry()[slug] ?? null;
}

export function listSlugs(): Registry {
  return readRegistry();
}

export function removeSlot(slug: string) {
  const registry = readRegistry();
  if (!(slug in registry)) return;
  delete registry[slug];
  writeRegistry(registry);
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function readRegistry(): Registry {
  if (!existsSync(REGISTRY_PATH)) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
  } catch {
    return {};
  }
  return parseRegistry(raw);
}

// Drop entries that don't match the expected shape rather than letting silently
// corrupt JSON poison `crbn up`. Returning {} on outer failure would re-allocate
// fresh slots and break running stacks — drop-bad-entries preserves the good
// ones and only forces re-allocation for the corrupt slugs.
function parseRegistry(raw: unknown): Registry {
  if (!raw || typeof raw !== "object") return {};
  const out: Registry = {};
  for (const [slug, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = parseRegistryEntry(value);
    if (entry) out[slug] = entry;
  }
  return out;
}

function parseRegistryEntry(raw: unknown): RegistryEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.worktreeRoot !== "string") return null;
  const ports = parsePortMap(r.ports);
  if (!ports) return null;
  if (typeof r.redisDb !== "number" || !Number.isInteger(r.redisDb))
    return null;
  const auth = parseAuthSecret(r.auth ?? r.jwt);
  if (!auth) return null;
  return {
    worktreeRoot: r.worktreeRoot,
    ports,
    redisDb: r.redisDb,
    auth
  };
}

function parsePortMap(v: unknown): PortMap | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const ports = {} as PortMap;
  for (const name of PORT_NAMES) {
    const value =
      name === "PORT_STORAGE"
        ? o.PORT_STORAGE ?? o[`PORT_${"API"}`]
        : name === "PORT_CONSOLE"
          ? o.PORT_CONSOLE ?? o[`PORT_${"STUDIO"}`]
          : o[name];
    if (typeof value !== "number" || !Number.isInteger(value)) return null;
    ports[name] = value;
  }
  return ports;
}

function parseAuthSecret(v: unknown): AuthSecret | null {
  if (!v || typeof v !== "object") return null;
  const auth = v as Record<string, unknown>;
  if (typeof auth.secret !== "string" || auth.secret.length === 0) return null;
  return { secret: auth.secret };
}

function writeRegistry(registry: Registry) {
  mkdirSync(dirname(REGISTRY_PATH), { recursive: true });
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

function pickRedisDb(taken: Set<number>): number {
  for (let i = 0; i < REDIS_DB_MAX; i++) {
    if (!taken.has(i)) return i;
  }
  throw new Error(
    `Redis DB pool exhausted (max ${REDIS_DB_MAX}). Free a slot via \`crbn remove\`.`
  );
}

export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, "0.0.0.0", () => {
      server.close(() => resolve(true));
    });
  });
}

async function portsAvailable(ports: number[]): Promise<boolean> {
  const results = await Promise.all(ports.map(isPortAvailable));
  return results.every(Boolean);
}

async function pickPorts(claimed: Set<number>): Promise<PortMap> {
  const ports = {} as PortMap;
  for (const name of PORT_NAMES) {
    ports[name] = await pickFreePort(claimed);
  }
  return ports;
}

async function pickFreePort(taken: Set<number>): Promise<number> {
  // OS-assigned ephemeral via listen(0); retry on collision with other
  // worktrees' claimed-set.
  for (let attempt = 0; attempt < 100; attempt++) {
    const port = await new Promise<number>((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (typeof addr === "object" && addr) {
          const p = addr.port;
          server.close(() => resolve(p));
        } else {
          server.close();
          reject(new Error("could not determine port"));
        }
      });
    });
    if (!taken.has(port)) {
      taken.add(port);
      return port;
    }
  }
  throw new Error("Failed to allocate a free port after 100 attempts");
}

function generateAuthSecret(): AuthSecret {
  return { secret: randomBytes(32).toString("hex") };
}
