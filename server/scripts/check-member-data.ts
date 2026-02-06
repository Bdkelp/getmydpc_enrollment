#!/usr/bin/env ts-node
/**
 * Utility script to report row counts for member/payment-related tables.
 *
 * Usage:
 *   npx tsx server/scripts/check-member-data.ts
 */
import { neonPool } from "../lib/neonDb";

const TARGET_TABLES = [
  { name: "members", label: "Members" },
  { name: "family_members", label: "Family members" },
  { name: "subscriptions", label: "Subscriptions" },
  { name: "payments", label: "Payments" },
  { name: "payment_tokens", label: "Payment tokens" },
  { name: "billing_schedule", label: "Billing schedule" },
  { name: "recurring_billing_log", label: "Recurring billing log" },
  { name: "agent_commissions", label: "Agent commissions" },
  { name: "enrollment_modifications", label: "Enrollment modifications" },
  { name: "admin_notifications", label: "Admin notifications" },
];

async function main() {
  console.log("\n[Check] Counting membership/payment tables...\n");
  const client = await neonPool.connect();

  try {
    for (const table of TARGET_TABLES) {
      const exists = await client.query<{ oid: string | null }>(
        "SELECT to_regclass($1) AS oid",
        [`public.${table.name}`]
      );

      if (!exists.rows[0]?.oid) {
        console.log(`- ${table.label} (${table.name}): table not found (skipped)`);
        continue;
      }

      const result = await client.query<{ count: string }>(
        `SELECT COUNT(*)::bigint AS count FROM ${table.name}`
      );

      const count = Number(result.rows[0]?.count || 0);
      console.log(`- ${table.label} (${table.name}): ${count}`);
    }

    console.log("\n[Check] Complete.\n");
  } catch (error: any) {
    console.error("\n[Check] Failed to read table counts:", error?.message || error);
    process.exitCode = 1;
  } finally {
    client.release();
    await neonPool.end();
  }
}

main().catch((error) => {
  console.error("Unexpected failure while checking member data:", error);
  process.exit(1);
});
