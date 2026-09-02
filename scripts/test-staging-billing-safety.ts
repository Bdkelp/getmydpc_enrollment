import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const expectedEnvironment = {
  NODE_ENV: "production",
  EXTERNAL_BILLING_ENABLED: "false",
  EXTERNAL_BILLING_DRY_RUN: "true",
  RECURRING_BILLING_KILL_SWITCH: "true",
  EPX_ENVIRONMENT: "sandbox",
  EPX_SIMULATION_MODE: "false",
  BILLING_SIMULATION_MODE: "false",
  ACH_RECURRING_ENABLED: "false",
} as const;

for (const [name, expected] of Object.entries(expectedEnvironment)) {
  assert.equal(
    process.env[name],
    expected,
    `Staging billing safety requires ${name}=${expected}`,
  );
}

const scheduleMigration = fs.readFileSync(
  path.join(
    process.cwd(),
    "scripts/sql/2026-09-02b_recurring_billing_external_schedule.sql",
  ),
  "utf8",
);
assert.match(
  scheduleMigration,
  /VALUES \(true, false, 'dry_run', true\)/,
  "Supabase cron configuration must be inserted disabled, dry-run, and kill-switched",
);
assert.match(
  scheduleMigration,
  /IF NOT config\.enabled OR config\.kill_switch THEN RETURN NULL/,
);

console.log("Staging billing safety configuration passed.");
