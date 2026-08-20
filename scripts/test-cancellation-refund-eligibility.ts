import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateRefundEligibility } from "../server/services/cancellation-refund-eligibility-service";

const base = {
  reasonCode: "member_requested",
  membershipStartDate: "2026-08-01",
  cancellationRequestedAt: "2026-08-06T18:00:00.000Z",
};

assert.deepEqual(evaluateRefundEligibility({ ...base, serviceUsageStatus: "no" }), {
  eligibility: "eligible",
  reason: "within_14_days_no_service_usage",
  withinRefundWindow: true,
  refundStatus: "pending_manual_refund",
});
assert.equal(evaluateRefundEligibility({ ...base, serviceUsageStatus: "yes" }).reason, "service_usage");
assert.equal(evaluateRefundEligibility({ ...base, serviceUsageStatus: "yes" }).eligibility, "not_eligible");
assert.equal(evaluateRefundEligibility({ ...base, cancellationRequestedAt: "2026-08-21", serviceUsageStatus: "no" }).reason, "outside_14_day_window");
assert.equal(evaluateRefundEligibility({ ...base, serviceUsageStatus: "unknown" }).eligibility, "review_required");
assert.equal(evaluateRefundEligibility({ ...base, reasonCode: "non_payment", serviceUsageStatus: "no" }).eligibility, "not_eligible");
assert.equal(evaluateRefundEligibility({ ...base, reasonCode: "non_payment", serviceUsageStatus: "no" }).refundStatus, "not_applicable");
assert.equal(evaluateRefundEligibility({ ...base, membershipStartDate: null, serviceUsageStatus: "no" }).eligibility, "review_required");

const route = await readFile(new URL("../server/routes.ts", import.meta.url), "utf8");
assert.match(route, /refund-eligibility/);
assert.match(route, /serviceUsageStatus/);
assert.match(route, /refundStatus: refundEvaluation\.refundStatus/);
assert.doesNotMatch(route, /processConfirmedPayment.*refund|submitACHRefund.*cancel/i);

console.log("Cancellation refund eligibility tests passed.");
console.log("Confirmed: 14-day member-requested rule, service usage yes/no/unknown states, non-payment exclusion, missing-date review, manual refund status, and no automatic refund call.");