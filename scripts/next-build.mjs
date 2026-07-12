import { spawnSync } from "node:child_process";
import { cpSync, existsSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workspace = resolve(root, "apps/web");
const typescript = resolve(workspace, "node_modules/typescript");
const typescript7 = resolve(workspace, "node_modules/.typescript-7-build");
const typescript5 = resolve(root, "node_modules/typescript-next-build");

if (!existsSync(typescript5)) {
  throw new Error("Missing TypeScript 5 compatibility package for Next build");
}

renameSync(typescript, typescript7);
cpSync(typescript5, typescript, { recursive: true });

try {
  const result = spawnSync(
    "node",
    [resolve(root, "node_modules/next/dist/bin/next"), "build"],
    { cwd: workspace, stdio: "inherit" }
  );
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(typescript, { force: true, recursive: true });
  renameSync(typescript7, typescript);
}
