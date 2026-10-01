import { calculateNextBillingCycleDate } from "../utils/membership-dates";

export const HISTORICAL_CYCLE_EXCLUSION_REASON =
  "historical_cycle_requires_reconciliation";

export type CycleEligibility =
  | { eligible: true }
  | {
      eligible: false;
      reason: typeof HISTORICAL_CYCLE_EXCLUSION_REASON;
      // Every scheduled cycle date from next_billing_date up to and including
      // the current cycle. All but the last are historical.
      missedCycleDates: string[];
      currentCycleDate: string;
    };

/**
 * Historical missed-cycle policy.
 *
 * Only the current billing cycle may enter automatic collection. If the cycle
 * after next_billing_date is also already due, next_billing_date is
 * historical: the platform may have failed to attempt or record billing, or
 * the member may have paid externally through North. Those months need
 * operator reconciliation, so the subscription is held instead of charged.
 *
 * Dates are YYYY-MM-DD in the billing business timezone.
 */
export function evaluateRecurringCycleEligibility(options: {
  cycleDate: string;
  anchorDay: number;
  businessDate: string;
}): CycleEligibility {
  const { cycleDate, anchorDay, businessDate } = options;
  const followingCycleDate = calculateNextBillingCycleDate(cycleDate, anchorDay);
  if (followingCycleDate > businessDate) return { eligible: true };

  const missedCycleDates = [cycleDate];
  let next = followingCycleDate;
  while (next <= businessDate) {
    missedCycleDates.push(next);
    next = calculateNextBillingCycleDate(next, anchorDay);
  }
  return {
    eligible: false,
    reason: HISTORICAL_CYCLE_EXCLUSION_REASON,
    missedCycleDates,
    currentCycleDate: missedCycleDates[missedCycleDates.length - 1],
  };
}
