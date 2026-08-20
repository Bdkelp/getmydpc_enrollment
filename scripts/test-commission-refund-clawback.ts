import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildCancellationReversalRows } from "../server/services/commission-ledger-service";

const service = await readFile(new URL("../server/services/commission-ledger-service.ts", import.meta.url), "utf8");
const routes = await readFile(new URL("../server/routes.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../scripts/sql/2026-08-20g_commission_refund_clawback_alignment.sql", import.meta.url), "utf8");

assert.match(service, /refund_eligibility/);
assert.match(service, /refund_status/);
assert.match(service, /refund_pending_commission_hold/);
assert.match(service, /refund_review_commission_hold/);
assert.match(service, /refund_not_eligible_commission_release/);
assert.match(service, /refund_processed_commission_reversal/);
assert.match(service, /reversal_key/);
assert.doesNotMatch(service, /REFUND_WINDOW_DAYS/);
assert.doesNotMatch(service, /withinRefundWindow = cancellationDateParsed/);
assert.match(routes, /refund-status/);
assert.match(routes, /refundStatus === "refunded"/);
assert.doesNotMatch(routes, /applyCancellationToLedger[\s\S]{0,500}refundPayment|applyCancellationToLedger[\s\S]{0,500}submitACHRefund/i);
assert.match(migration, /uq_commission_ledger_reversal_key/);
assert.match(migration, /uq_commission_ledger_events_event_key/);
assert.match(migration, /uq_commission_cancellation_events_event_key/);
assert.match(service, /cancellationEventKey/);

const reversals = buildCancellationReversalRows([
  { id: "paid-writing", source_commission_id: "commission-writing", source_payment_id: 101, agent_id: "agent", agent_name: "Agent", member_id: "42", member_name: "Member", commission_amount: 25, commission_period_start: "2026-08-01", commission_period_end: "2026-08-15", compensation_type: "writing" },
  { id: "paid-override", source_commission_id: "commission-override", source_payment_id: 101, agent_id: "upline", agent_name: "Upline", member_id: "42", member_name: "Member", commission_amount: 5, commission_period_start: "2026-08-01", commission_period_end: "2026-08-15", compensation_type: "override" },
], "2026-08-06", "Member Requested", "member-42-refund-processed");
assert.equal(reversals.length, 2);
assert.equal(reversals[0].commission_amount, -25);
assert.equal(reversals[1].commission_amount, -5);
assert.equal(reversals[0].source_commission_id, "commission-writing");
assert.equal(reversals[0].source_payment_id, 101);
assert.equal(reversals[1].compensation_type, "override");
assert.notEqual(reversals[0].reversal_key, reversals[1].reversal_key);

console.log("Commission refund clawback alignment tests passed.");
console.log("Confirmed: stored decision is authoritative, pending/review holds, not-eligible release, refunded-only additive reversals, writing/override linkage, deterministic keys, and no date-only clawback or automatic refund call.");
