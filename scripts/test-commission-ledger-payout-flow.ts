/**
 * Commission Ledger & Payout Flow — Phase 2B automated tests.
 *
 * Pure-function tests (no live database — see
 * docs/COMMISSION_LEDGER_PAYOUT_FLOW_PHASE2B_REPORT.md for the full
 * staging-environment test plan required before production rollout).
 * Follows this repository's existing test convention (node:assert + tsx).
 */

import assert from "node:assert/strict";

// commission-ledger-service.ts transitively imports supabaseClient.ts, which
// throws at module load time without credentials — provide harmless
// placeholders (same approach as scripts/test-payment-confirmed-service.ts).
process.env.SUPABASE_URL ||= "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||=
  "eyJhbGciOiJIUzI1NiJ9." +
  Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url") +
  ".placeholder-signature";

const {
  getCycleAnchorForEntry,
  advanceCycleAnchor,
  compensationTypeOf,
  shouldCarryForwardAgent,
  MIN_AGENT_PAYOUT_THRESHOLD,
  adminOverrideCarryForwardForBatch,
} = await import("../server/services/commission-ledger-service");
const {
  getWritingCommissionPayDate,
  getOverridePayDate,
  isWritingBalancePayable,
  isOverrideBalancePayable,
} = await import("../server/services/commission-payout-schedule-service");

const date = (mmddyyyy: string): Date => {
  const [m, d, y] = mmddyyyy.split("/").map(Number);
  return new Date(y, m - 1, d);
};
const fmt = (d: Date): string =>
  `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;

// ---------------------------------------------------------------------------
// §19 — Writing cycles route through the unified schedule service and land
// in a writing_1st/writing_15th batch (never override_monthly).
// ---------------------------------------------------------------------------
{
  const cases: Array<[string, string, "writing_1st" | "writing_15th"]> = [
    ["04/01/2026", "04/03/2026", "writing_1st"],
    ["05/01/2026", "05/08/2026", "writing_1st"],
    ["06/15/2026", "06/18/2026", "writing_15th"],
  ];
  for (const [effective, expectedPayDate, expectedBatchType] of cases) {
    const cycle = getCycleAnchorForEntry(date(effective), "writing");
    assert.equal(cycle.batchType, expectedBatchType, `${effective} must route to ${expectedBatchType}`);
    const scheduledPayDate = getWritingCommissionPayDate(cycle.anchorDate);
    assert.equal(fmt(scheduledPayDate), expectedPayDate, `${effective} scheduled pay date`);
  }
  console.log("✅ Writing ledger cycle classification tests passed");
}

// ---------------------------------------------------------------------------
// §20 — Override cycles always classify as override_monthly, never a
// writing 1st/15th batch, and pay on the correct month-in-arrears date.
// ---------------------------------------------------------------------------
{
  const cases: Array<[string, string]> = [
    ["08/31/2026", "09/04/2026"], // August 2026 earning-period end
    ["09/30/2026", "10/02/2026"], // September 2026
    ["12/31/2026", "01/04/2027"], // December 2026 (holiday-adjusted)
  ];
  for (const [periodEnd, expectedPayDate] of cases) {
    const cycle = getCycleAnchorForEntry(date(periodEnd), "override");
    assert.equal(cycle.batchType, "override_monthly", `${periodEnd} must never be a writing batch`);
    assert.notEqual(cycle.batchType, "writing_1st");
    assert.notEqual(cycle.batchType, "writing_15th");
    const earnedMonthAnchor = new Date(cycle.anchorDate.getFullYear(), cycle.anchorDate.getMonth() - 1, 1);
    const scheduledPayDate = getOverridePayDate(earnedMonthAnchor);
    assert.equal(fmt(scheduledPayDate), expectedPayDate, `${periodEnd} scheduled override pay date`);
  }
  console.log("✅ Override ledger cycle classification tests passed (never placed in writing batches)");
}

// ---------------------------------------------------------------------------
// compensationTypeOf: legacy/NULL rows default to 'writing', never guessed
// as 'override'.
// ---------------------------------------------------------------------------
assert.equal(compensationTypeOf({ compensation_type: null }), "writing");
assert.equal(compensationTypeOf({ compensation_type: undefined }), "writing");
assert.equal(compensationTypeOf({ compensation_type: "override" }), "override");
assert.equal(compensationTypeOf({ compensation_type: "writing" }), "writing");
console.log("✅ compensationTypeOf legacy-row default test passed");

// ---------------------------------------------------------------------------
// §9/§22 — Carry-forward across cycles: advancing one cycle step must land
// a carried writing row in the SAME batch key as a fresh row naturally
// earned in that next cycle, and similarly for overrides.
// ---------------------------------------------------------------------------
{
  // Writing: March 1st-cycle carry ($15) must advance into March 15th-cycle,
  // matching a fresh March 15 commission's own natural cycle.
  const march1Cycle = getCycleAnchorForEntry(date("03/01/2026"), "writing");
  const advanced = advanceCycleAnchor(march1Cycle.anchorDate, "writing");
  const march15FreshCycle = getCycleAnchorForEntry(date("03/15/2026"), "writing");
  assert.equal(advanced.batchType, march15FreshCycle.batchType);
  assert.equal(fmt(advanced.anchorDate), fmt(march15FreshCycle.anchorDate));
  console.log("✅ Writing carry-forward advances into the correct next (15th) cycle — $15 + $20 = $35 scenario routes to one batch");

  // Override: August carry ($12) must advance into September's own natural
  // cycle (both pay in October).
  const augustCycle = getCycleAnchorForEntry(date("08/31/2026"), "override");
  const advancedOverride = advanceCycleAnchor(augustCycle.anchorDate, "override");
  const septemberFreshCycle = getCycleAnchorForEntry(date("09/30/2026"), "override");
  assert.equal(advancedOverride.batchType, "override_monthly");
  assert.equal(fmt(advancedOverride.anchorDate), fmt(septemberFreshCycle.anchorDate));
  console.log("✅ Override carry-forward advances into the correct next (September) cycle — $12 + $18 = $30 payable in October scenario routes to one batch");
}

// ---------------------------------------------------------------------------
// §21 — $25 threshold, independently for writing and override.
// ---------------------------------------------------------------------------
assert.equal(shouldCarryForwardAgent(24.99), true, "writing $24.99 must carry forward");
assert.equal(shouldCarryForwardAgent(25.0), false, "writing $25.00 must be payable");
assert.equal(isWritingBalancePayable(24.99), false);
assert.equal(isWritingBalancePayable(25.0), true);
assert.equal(isOverrideBalancePayable(24.99), false);
assert.equal(isOverrideBalancePayable(25.0), true);
assert.equal(MIN_AGENT_PAYOUT_THRESHOLD, 25);

// $20 writing + $10 override must never combine into a payable $30.
const writingOnly = 20;
const overrideOnly = 10;
assert.equal(shouldCarryForwardAgent(writingOnly), true);
assert.equal(isOverrideBalancePayable(overrideOnly), false);
assert.equal(
  !shouldCarryForwardAgent(writingOnly) || isOverrideBalancePayable(overrideOnly),
  false,
  "$20 writing + $10 override must not become a payable combined $30",
);
console.log("✅ Threshold + separate-balance tests passed");

// ---------------------------------------------------------------------------
// §18/§24 — Manual below-$25 threshold override must require both a batch
// id and a mandatory reason before it does anything (validated
// synchronously, before any database call — so this is testable without a
// live database). The real code path also requires admin auth at the route
// layer and records an immutable commission_ledger_events entry — see
// docs/COMMISSION_LEDGER_PAYOUT_FLOW_PHASE2B_REPORT.md §Exception Handling.
// ---------------------------------------------------------------------------
await assert.rejects(
  () => adminOverrideCarryForwardForBatch("", { reason: "test" }),
  /batchId is required/,
  "empty batchId must be rejected before any database call",
);
await assert.rejects(
  () => adminOverrideCarryForwardForBatch("batch-123", { reason: "" }),
  /Override reason is required/,
  "empty reason must be rejected before any database call — no silent threshold bypass",
);
await assert.rejects(
  () => adminOverrideCarryForwardForBatch("batch-123", { reason: "   " }),
  /Override reason is required/,
  "whitespace-only reason must also be rejected",
);
console.log("✅ Manual threshold-override validation guard tests passed (reason mandatory, no silent bypass)");

console.log("\nAll Phase 2B commission-ledger cycle-classification tests passed.");
console.log(
  "NOTE: full end-to-end ledger/batch DB tests (§19-§24 of the Phase 2B spec — actual row insertion, batch creation, idempotent sync execution, manual threshold override against a live database) require a staging Postgres/Supabase instance and are NOT executed by this script. See docs/COMMISSION_LEDGER_PAYOUT_FLOW_PHASE2B_REPORT.md for the required test plan.",
);
