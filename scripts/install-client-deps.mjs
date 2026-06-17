import { spawnSync } from "node:child_process";

const args = [
  "--prefix",
  "client",
  "install",
  "--include=dev",
  "--no-audit",
  "--no-fund",
];

const result = spawnSync("npm", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(
    "[build:clean] Failed to install client dependencies:",
    result.error,
  );
  process.exit(1);
}

process.exit(result.status ?? 0);
