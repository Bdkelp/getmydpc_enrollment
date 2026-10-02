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

function isDateOnly(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function lastDayOfMonth(date: string): number {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Anchor day for future cycles, taken from the subscription's established
 * schedule rather than its history. A billing day moved away from the
 * original enrollment day (for example by an owner-approved change in North)
 * must stay moved, so the historical first-payment/enrollment day never
 * overrides it.
 *
 * Precedence:
 * 1. The scheduled cycle (next_billing_date, or the cycle being billed), then
 *    the current period start: the first one that isn't the last day of its
 *    month is the exact anchor.
 * 2. A last-day-of-month date may be a month-end clamp (Feb 28 for a 31st
 *    anchor), so it only bounds the anchor from below. A longer anchor is
 *    kept when the historical day supports it (31 for Feb 28 / Apr 30);
 *    otherwise the bound itself is used.
 * 3. With no established schedule, the historical day (then 1).
 */
export function resolveEstablishedBillingAnchorDay(options: {
  scheduledCycleDate: string | null | undefined;
  currentPeriodStart?: string | null;
  historicalAnchorSource?: string | Date | null;
}): number {
  const established = [options.scheduledCycleDate, options.currentPeriodStart].filter(isDateOnly);
  for (const date of established) {
    const day = Number(date.slice(-2));
    if (day < lastDayOfMonth(date)) return day;
  }
  const historicalDay = options.historicalAnchorSource
    ? resolveBillingAnchorDay(options.historicalAnchorSource, "1970-01-01")
    : null;
  if (established.length > 0) {
    const lowerBound = Math.max(...established.map((date) => Number(date.slice(-2))));
    return historicalDay !== null && historicalDay >= lowerBound ? historicalDay : lowerBound;
  }
  return historicalDay ?? 1;
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
