import { spawnSync } from "node:child_process";

const r = spawnSync(
  "pnpm",
  [
    "--filter",
    "@carbon/database",
    "exec",
    "tsx",
    "src/types/generate.ts",
    ...process.argv.slice(2)
  ],
  { stdio: "inherit" }
);

if (r.status !== 0) {
  process.exit(r.status ?? 1);
}
