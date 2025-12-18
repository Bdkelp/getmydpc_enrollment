#!/usr/bin/env ts-node
/**
 * Danger zone utility that wipes member/payment-related tables.
 *
 * Usage:
 *   npx tsx server/scripts/purge-test-data.ts --dry-run
 *   npx tsx server/scripts/purge-test-data.ts --yes
 *
 * Set SCRUB_CONFIRM=true to avoid passing --yes each time.
 */
import { neonPool } from "../lib/neonDb";

const TABLES_IN_DELETE_ORDER = [
  "agent_commissions",
  "recurring_billing_log",
  "billing_schedule",
  "payment_tokens",
  "payments",
  "subscriptions",
  "family_members",
  "members",
  "temp_registrations",
  "enrollment_modifications",
  "admin_notifications"
];

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const confirmed = args.includes("--yes") || process.env.SCRUB_CONFIRM === "true";

async function main() {
  if (isDryRun) {
    console.log("[Scrub] Tables that would be truncated:\n");
    TABLES_IN_DELETE_ORDER.forEach((table, index) => {
      console.log(` ${index + 1}. ${table}`);
    });
    console.log("\n(Dry run only. No data was removed.)\n");
    process.exit(0);
  }

  if (!confirmed) {
    console.error("[Scrub] Refusing to remove data without --yes flag or SCRUB_CONFIRM=true env var.");
    console.error("         Run with --dry-run to inspect the target tables first.");
    process.exit(1);
  }

  console.log("\n⚠️  WARNING: This will irreversibly delete all member/payment data listed below.\n");
  TABLES_IN_DELETE_ORDER.forEach((table, index) => console.log(` ${index + 1}. ${table}`));
  console.log("\nStarting scrub...\n");

  const client = await neonPool.connect();
  try {
    await client.query("BEGIN");

    for (const table of TABLES_IN_DELETE_ORDER) {
      console.log(`[Scrub] Truncating ${table}...`);
      await client.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE;`);
    }

    await client.query("COMMIT");
    console.log("\n✅ Data scrub completed. All relevant tables reset.\n");
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("\n❌ Data scrub failed. Changes rolled back.");
    console.error(error?.message || error);
    process.exitCode = 1;
  } finally {
    client.release();
    await neonPool.end();
  }
}

main().catch((error) => {
  console.error("Unexpected failure while scrubbing data:", error);
  process.exit(1);
});
