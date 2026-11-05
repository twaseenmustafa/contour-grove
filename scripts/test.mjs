import { realpathSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
// Windows drive-letter casing can load two copies of Vitest's runner.
// Use the filesystem's canonical project path for both cwd and CLI path.
const root = realpathSync.native(process.cwd());
const result = spawnSync(
  process.execPath,
  [join(root, "node_modules/vitest/vitest.mjs"), ...process.argv.slice(2)],
  { cwd: root, stdio: "inherit" },
);
if (result.error) {
  console.error(result.error.message);
  process.exitCode = 1;
} else process.exitCode = result.status ?? 1;
