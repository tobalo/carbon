import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type NewMigrationOptions = {
  migrationsDir: string;
  name: string;
};

export async function createMigrationFile({
  migrationsDir,
  name
}: NewMigrationOptions) {
  const slug = slugify(name);
  if (!slug) {
    throw new Error(
      "Migration name must contain at least one letter or number"
    );
  }

  await mkdir(migrationsDir, { recursive: true });
  const fileName = `${timestamp()}_${slug}.sql`;
  const path = resolve(migrationsDir, fileName);
  await writeFile(path, "", { flag: "wx" });
  return path;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function timestamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${arg} requires a value`);
    }
    args.set(arg.slice(2), value);
    i += 1;
  }

  return { args, positional };
}

async function main() {
  const { args, positional } = parseArgs(process.argv.slice(2));
  const name = args.get("name") ?? positional.join(" ");
  if (!name) {
    throw new Error("Usage: pnpm db:migrate:new <name>");
  }

  const migrationsDir =
    args.get("migrations-dir") ?? resolve(process.cwd(), "migrations");
  const path = await createMigrationFile({ migrationsDir, name });
  console.log(path);
}

if (process.argv[1]?.endsWith("new.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
