import { calculateNextBillingCycleDate } from "../utils/membership-dates";

export const HISTORICAL_CYCLE_EXCLUSION_REASON =
  "historical_cycle_requires_reconciliation";

const BILLING_TIMEZONE = "America/Chicago";

export function formatBillingBusinessDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BILLING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// Day of month that recurring cycles anchor to: the member's first payment
// (or enrollment) date in the billing timezone, else the cycle date's day.
// Same rule finalizeProcessorSuccess uses to set next_billing_date.
export function resolveBillingAnchorDay(
  anchorSource: string | Date | null | undefined,
  cycleDate: string,
): number {
  return anchorSource
    ? Number(formatBillingBusinessDate(new Date(anchorSource)).slice(-2))
    : Number(cycleDate.slice(-2));
}

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
