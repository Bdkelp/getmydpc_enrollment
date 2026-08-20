/**
 * Commission Payout Schedule Service — Phase 2A
 *
 * The single authoritative source of truth for writing-commission and
 * override payout dates. Replaces the competing date algorithms found by the
 * forensic audit (calculatePaymentEligibleDate's Monday–Sunday-week logic,
 * and commission-ledger-service's holiday-blind firstFridayOnOrAfter).
 *
 * Business rules implemented here (see docs/COMMISSION_PAYOUT_SCHEDULING_PHASE2A_REPORT.md
 * for full derivation and test results):
 *
 *   Writing commissions: effective dates are always the 1st or 15th. Pay
 *   date = the first Friday STRICTLY AFTER the effective date (if the
 *   effective date is itself a Friday, use the following Friday). If that
 *   Friday is a Federal Reserve Bank holiday, move to the PRECEDING business
 *   day.
 *
 *   Overrides: calculated monthly, paid in arrears. Pay date = the first
 *   Friday of the month following the earned month. If that Friday is a
 *   Federal Reserve Bank holiday, move FORWARD to the next business day
 *   (never backward into the earning month).
 *
 * Deterministic: given the same commission type + effective date/earned
 * month, this always returns the same pay date. No dependency on current
 * date, timezone, or any mutable state.
 */

import {
  isFederalReserveBankHoliday,
  previousBusinessDay,
  nextBusinessDay,
  firstFridayOnOrAfter,
  firstFridayStrictlyAfter,
} from "../utils/federal-reserve-calendar";

export { isFederalReserveBankHoliday, previousBusinessDay, nextBusinessDay };

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Writing commission pay date for a given membership effective date
 * (1st or 15th). See module doc for the full rule.
 */
export function getWritingCommissionPayDate(effectiveDate: Date): Date {
  const candidate = firstFridayStrictlyAfter(effectiveDate);
  return isFederalReserveBankHoliday(candidate)
    ? previousBusinessDay(candidate)
    : candidate;
}

/**
 * Override pay date for commissions earned in `earnedMonth` (any Date
 * within the earning month — only year/month are used). Paid in arrears on
 * the first Friday of the following calendar month.
 */
export function getOverridePayDate(earnedMonth: Date): Date {
  const normalized = startOfLocalDay(earnedMonth);
  const followingMonthStart = new Date(
    normalized.getFullYear(),
    normalized.getMonth() + 1,
    1,
  );
  const candidate = firstFridayOnOrAfter(followingMonthStart);
  return isFederalReserveBankHoliday(candidate)
    ? nextBusinessDay(candidate)
    : candidate;
}

/** Minimum payable amount before a balance carries forward — writing commissions. */
export const MIN_WRITING_PAYOUT_THRESHOLD = 25;

/** Minimum payable amount before a balance carries forward — overrides. */
export const MIN_OVERRIDE_PAYOUT_THRESHOLD = 25;

/**
 * Writing and override balances are never combined to reach the $25
 * threshold — each must independently meet the minimum.
 */
export function isWritingBalancePayable(totalAmount: number): boolean {
  return Number(totalAmount || 0) >= MIN_WRITING_PAYOUT_THRESHOLD;
}

export function isOverrideBalancePayable(totalAmount: number): boolean {
  return Number(totalAmount || 0) >= MIN_OVERRIDE_PAYOUT_THRESHOLD;
}
