#!/usr/bin/env node
/**
 * PBM (Enhanced Pharmacy Benefit Plan) price migration.
 *
 * Moves existing active members/subscriptions from the old $21/month
 * add-on price to the new $30/month price (effective 08/01/2026).
 *
 * IMPORTANT — SCOPE:
 *   This script ONLY touches:
 *     - members.total_monthly_price
 *     - subscriptions.amount
 *   It NEVER touches: payment_tokens, payments.epx_auth_guid,
 *   subscriptions.next_billing_date/status, or any EPX auth/token data.
 *   Recurring billing continuity (which card/ACH token is charged) is
 *   resolved entirely from payment_tokens/payments records elsewhere in
 *   the codebase and is completely independent of these two amount
 *   fields, so this migration cannot disrupt AUTH_GUID resolution.
 *
 * Modes:
 *   (default)  Dry run — reads data, computes proposed new amounts,
 *              writes a report to scripts/output/, makes NO db writes.
 *   --apply    Live run — applies the update ONLY to rows with zero
 *              flags from the dry-run pass. Flagged rows are always
 *              skipped and must be handled manually.
 *
 * Usage:
 *   node server/scripts/pbm-price-migration.mjs                # dry run
 *   node server/scripts/pbm-price-migration.mjs --verbose      # dry run, per-row logs
 *   node server/scripts/pbm-price-migration.mjs --apply        # live run (08/01/2026 or later)
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.resolve(__dirname, "..", "..", "scripts", "output");

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const VERBOSE = args.has("--verbose");

// Must match shared/pricing.ts. OLD_ADDON_PRICE is the price every existing
// PBM member was enrolled/last-updated at prior to this migration.
const OLD_ADDON_PRICE = 21;
const NEW_ADDON_PRICE = 30; // shared/pricing.ts RX_ADDON_MONTHLY_PRICE
const ADMIN_FEE_RATE = 0.04; // matches (subtotal * 1.04) used at registration
const ADDON_DELTA_WITH_FEE = round2(
  NEW_ADDON_PRICE * (1 + ADMIN_FEE_RATE) -
    OLD_ADDON_PRICE * (1 + ADMIN_FEE_RATE),
);
// Loose sanity window for "does this member's current total look like it
// already includes the old $21 add-on (plus 4% fee) on top of their plan?"
const EXPECTED_OLD_ADDON_WITH_FEE = round2(
  OLD_ADDON_PRICE * (1 + ADMIN_FEE_RATE),
);
const ADDON_SANITY_TOLERANCE = 3; // dollars

const normalizeEnvValue = (value) => (value || "").replace(/['"]/g, "").trim();
const supabaseUrl = normalizeEnvValue(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
);
const supabaseServiceKey = normalizeEnvValue(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
);

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY in environment",
  );
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: "public" },
});

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function parseAmount(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchPbmMembers() {
  const { data, error } = await supabase
    .from("members")
    .select(
      "id, customer_number, first_name, last_name, email, plan_id, coverage_type, total_monthly_price, add_rx_valet, status, is_active",
    )
    .eq("add_rx_valet", true)
    .eq("status", "active")
    .eq("is_active", true);

  if (error) {
    throw new Error(`Failed to fetch members: ${error.message}`);
  }
  return data || [];
}

async function fetchActiveSubscriptionsByMemberIds(memberIds) {
  if (memberIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, member_id, plan_id, status, amount, next_billing_date")
    .in("member_id", memberIds)
    .eq("status", "active");

  if (error) {
    throw new Error(`Failed to fetch subscriptions: ${error.message}`);
  }

  const byMember = new Map();
  for (const sub of data || []) {
    // Keep the most recently created/highest-id active subscription per member.
    const existing = byMember.get(sub.member_id);
    if (!existing || sub.id > existing.id) {
      byMember.set(sub.member_id, sub);
    }
  }
  return byMember;
}

async function fetchPlansById(planIds) {
  const uniqueIds = [
    ...new Set(planIds.filter((id) => id !== null && id !== undefined)),
  ];
  if (uniqueIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("plans")
    .select("id, name, price")
    .in("id", uniqueIds);
  if (error) {
    throw new Error(`Failed to fetch plans: ${error.message}`);
  }
  return new Map((data || []).map((plan) => [plan.id, plan]));
}

function buildRow(member, subscription, plan) {
  const currentTotal = parseAmount(member.total_monthly_price);
  const currentSubAmount = subscription
    ? parseAmount(subscription.amount)
    : null;
  const planPrice = plan ? parseAmount(plan.price) : null;

  const flags = [];

  if (currentTotal === null) {
    flags.push("MISSING_TOTAL_MONTHLY_PRICE");
  }
  if (!subscription) {
    flags.push("NO_ACTIVE_SUBSCRIPTION");
  } else if (currentSubAmount === null) {
    flags.push("MISSING_SUBSCRIPTION_AMOUNT");
  } else if (
    currentTotal !== null &&
    Math.abs(currentTotal - currentSubAmount) > 0.01
  ) {
    flags.push("MEMBER_SUBSCRIPTION_AMOUNT_MISMATCH");
  }

  if (currentTotal !== null && planPrice !== null) {
    const impliedBaseWithFee = round2(planPrice * (1 + ADMIN_FEE_RATE));
    const impliedAddonPortion = round2(currentTotal - impliedBaseWithFee);
    if (
      Math.abs(impliedAddonPortion - EXPECTED_OLD_ADDON_WITH_FEE) >
      ADDON_SANITY_TOLERANCE
    ) {
      flags.push(
        `UNEXPECTED_ADDON_PORTION(implied=$${impliedAddonPortion}, expected~$${EXPECTED_OLD_ADDON_WITH_FEE})`,
      );
    }
  } else if (planPrice === null) {
    flags.push("PLAN_NOT_FOUND");
  }

  const newTotal =
    currentTotal !== null ? round2(currentTotal + ADDON_DELTA_WITH_FEE) : null;
  const newSubAmount =
    currentSubAmount !== null
      ? round2(currentSubAmount + ADDON_DELTA_WITH_FEE)
      : null;

  return {
    memberId: member.id,
    customerNumber: member.customer_number,
    name: `${member.first_name || ""} ${member.last_name || ""}`.trim(),
    email: member.email,
    planId: member.plan_id,
    planName: plan?.name || null,
    subscriptionId: subscription?.id || null,
    nextBillingDate: subscription?.next_billing_date || null,
    currentTotalMonthlyPrice: currentTotal,
    proposedTotalMonthlyPrice: newTotal,
    currentSubscriptionAmount: currentSubAmount,
    proposedSubscriptionAmount: newSubAmount,
    delta: ADDON_DELTA_WITH_FEE,
    flags,
    clean: flags.length === 0,
  };
}

async function applyCleanRows(rows) {
  const results = [];
  for (const row of rows.filter((r) => r.clean)) {
    try {
      const { error: memberError } = await supabase
        .from("members")
        .update({
          total_monthly_price: row.proposedTotalMonthlyPrice,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.memberId);
      if (memberError)
        throw new Error(`members update failed: ${memberError.message}`);

      const { error: subError } = await supabase
        .from("subscriptions")
        .update({
          amount: row.proposedSubscriptionAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.subscriptionId);
      if (subError)
        throw new Error(`subscriptions update failed: ${subError.message}`);

      results.push({ ...row, applied: true, error: null });
      if (VERBOSE) {
        console.log(
          `  ✅ member ${row.memberId} (${row.customerNumber}) — $${row.currentTotalMonthlyPrice} → $${row.proposedTotalMonthlyPrice}`,
        );
      }
    } catch (err) {
      results.push({ ...row, applied: false, error: err.message });
      console.error(
        `  ❌ member ${row.memberId} (${row.customerNumber}) — ${err.message}`,
      );
    }
  }
  return results;
}

async function main() {
  console.log(
    `${APPLY ? "🔴 LIVE APPLY" : "🟡 DRY RUN"} — PBM price migration ($${OLD_ADDON_PRICE} → $${NEW_ADDON_PRICE}, delta incl. 4% fee = $${ADDON_DELTA_WITH_FEE})`,
  );

  const members = await fetchPbmMembers();
  console.log(
    `Found ${members.length} active member(s) with add_rx_valet = true`,
  );

  const subsByMember = await fetchActiveSubscriptionsByMemberIds(
    members.map((m) => m.id),
  );
  const plansById = await fetchPlansById(members.map((m) => m.plan_id));

  const rows = members.map((member) =>
    buildRow(
      member,
      subsByMember.get(member.id) || null,
      plansById.get(member.plan_id) || null,
    ),
  );

  const clean = rows.filter((r) => r.clean);
  const flagged = rows.filter((r) => !r.clean);

  console.log(`Clean (ready to migrate): ${clean.length}`);
  console.log(
    `Flagged (needs manual review, will be skipped): ${flagged.length}`,
  );

  if (VERBOSE || flagged.length > 0) {
    for (const row of flagged) {
      console.log(
        `  ⚠️  member ${row.memberId} (${row.customerNumber || "no cust#"}) — flags: ${row.flags.join(", ")}`,
      );
    }
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (!APPLY) {
    const reportPath = path.join(
      OUTPUT_DIR,
      `pbm-price-migration-dry-run-${timestamp}.json`,
    );
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          oldAddonPrice: OLD_ADDON_PRICE,
          newAddonPrice: NEW_ADDON_PRICE,
          adminFeeRate: ADMIN_FEE_RATE,
          deltaAppliedPerMember: ADDON_DELTA_WITH_FEE,
          totalMembers: rows.length,
          cleanCount: clean.length,
          flaggedCount: flagged.length,
          rows,
        },
        null,
        2,
      ),
    );
    console.log(`\nDry-run report written to: ${reportPath}`);
    console.log(
      "No database changes were made. Review the report, then re-run with --apply on/after 08/01/2026.",
    );
    return;
  }

  console.log("\nApplying updates to clean rows only...");
  const results = await applyCleanRows(rows);
  const succeeded = results.filter((r) => r.applied).length;
  const failed = results.filter((r) => !r.applied).length;

  const applyLogPath = path.join(
    OUTPUT_DIR,
    `pbm-price-migration-applied-${timestamp}.json`,
  );
  fs.writeFileSync(
    applyLogPath,
    JSON.stringify(
      {
        appliedAt: new Date().toISOString(),
        succeeded,
        failed,
        skippedFlaggedCount: flagged.length,
        results,
        skippedFlaggedRows: flagged,
      },
      null,
      2,
    ),
  );

  console.log(
    `\nApplied: ${succeeded} succeeded, ${failed} failed, ${flagged.length} skipped (flagged).`,
  );
  console.log(`Apply log written to: ${applyLogPath}`);
}

main().catch((err) => {
  console.error("Migration script failed:", err);
  process.exitCode = 1;
});
