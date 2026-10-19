import assert from "node:assert/strict";
import {
  calculatePbmAmount,
  canWithdrawPbmChange,
  getPbmAmountDelta,
  getPbmCycleAmount,
  isPbmChangeEffective,
  resolvePbmRequestError,
  shouldApplyPbmChangeAfterBilling,
} from "../server/services/pbm-membership-policy";

assert.equal(getPbmAmountDelta(false, true), 30, "PBM add is $30 per household");
assert.equal(getPbmAmountDelta(true, false), -30, "PBM removal subtracts $30");
assert.equal(getPbmAmountDelta(true, true), 0, "unchanged state has no delta");
assert.equal(calculatePbmAmount(129, 30), 159);
assert.equal(calculatePbmAmount(159, -30), 129);

assert.equal(isPbmChangeEffective("2026-11-01", "2026-10-01"), false,
  "future PBM selection does not alter October billing");
assert.equal(isPbmChangeEffective("2026-11-01", "2026-11-01"), true,
  "selection applies on the next billing date");
assert.equal(getPbmCycleAmount(129, 30, false), 129,
  "billing before the effective cycle keeps the existing charge");
assert.equal(getPbmCycleAmount(129, 30, true), 159,
  "billing on the effective cycle uses the adjusted amount");
assert.equal(getPbmCycleAmount(129, 30, true), 159,
  "a failed attempt can retry with the same cycle amount without mutating the stored base");
assert.equal(shouldApplyPbmChangeAfterBilling("declined"), false,
  "declined payments do not activate or remove PBM");
assert.equal(shouldApplyPbmChangeAfterBilling("unknown"), false,
  "possible captures require reconciliation before applying PBM state");
assert.equal(shouldApplyPbmChangeAfterBilling("completed"), true,
  "only a confirmed successful charge applies PBM state");
assert.equal(canWithdrawPbmChange("Pending Submission"), true,
  "a pending request can be withdrawn before manual eligibility submission");
assert.equal(canWithdrawPbmChange("Submitted"), false,
  "an already-submitted eligibility change cannot be silently withdrawn");
assert.equal(canWithdrawPbmChange("Pending Submission", true), false,
  "a request cannot be withdrawn after its durable billing cycle has started");

assert.equal(resolvePbmRequestError({
  inScope: false, memberActive: true, subscriptionActive: true,
  currentEnabled: false, targetEnabled: true, hasPendingChange: false,
})?.status, 403, "out-of-scope agents are denied");
assert.equal(resolvePbmRequestError({
  inScope: true, memberActive: false, subscriptionActive: true,
  currentEnabled: false, targetEnabled: true, hasPendingChange: false,
})?.status, 409, "inactive members cannot be changed");
assert.equal(resolvePbmRequestError({
  inScope: true, memberActive: true, subscriptionActive: true,
  currentEnabled: false, targetEnabled: true, hasPendingChange: true,
})?.status, 409, "duplicate and conflicting pending requests are rejected");
assert.equal(resolvePbmRequestError({
  inScope: true, memberActive: true, subscriptionActive: true,
  currentEnabled: false, targetEnabled: false, hasPendingChange: false,
})?.status, 409, "same-state requests are rejected");
assert.equal(resolvePbmRequestError({
  inScope: true, memberActive: true, subscriptionActive: true,
  currentEnabled: false, targetEnabled: true, hasPendingChange: false,
}), null, "eligible in-scope member request is accepted");

console.log("✓ PBM membership servicing policy tests passed");
