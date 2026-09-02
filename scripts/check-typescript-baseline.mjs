import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const baseline = JSON.parse(
  fs.readFileSync(
    path.join(scriptDirectory, "typescript-error-baseline.json"),
    "utf8",
  ),
);
const tscPath = path.join(
  repositoryRoot,
  "node_modules",
  "typescript",
  "bin",
  "tsc",
);
const result = spawnSync(
  process.execPath,
  [tscPath, "--pretty", "false", "--incremental", "false"],
  { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
);
const output = `${result.stdout || ""}${result.stderr || ""}`;
if (output) process.stdout.write(output);

const counts = {};
for (const line of output.split(/\r?\n/)) {
  const match = /^([^\s(]+\.(?:ts|tsx))\(\d+,\d+\): error TS\d+:/.exec(line);
  if (!match) continue;
  const file = match[1].replaceAll("\\", "/");
  counts[file] = (counts[file] || 0) + 1;
}

if (result.error || (result.status !== 0 && Object.keys(counts).length === 0)) {
  console.error("TypeScript did not produce parseable diagnostics.");
  process.exit(1);
}

const regressions = Object.entries(counts)
  .filter(([file, count]) => count > (baseline[file] || 0))
  .map(
    ([file, count]) =>
      `${file}: ${count} errors (baseline ${baseline[file] || 0})`,
  );
if (regressions.length > 0) {
  console.error(
    "\nTypeScript error baseline regressed:\n" + regressions.join("\n"),
  );
  process.exit(1);
}

const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
if (total > 0) {
  console.log(
    `\nTypeScript no-regression check passed with ${total} known legacy errors.`,
  );
} else {
  console.log("TypeScript strict check passed with no errors.");
}
