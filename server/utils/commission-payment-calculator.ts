/**
 * Commission Payment Date Calculator
 *
 * Phase 2A: this file's date math previously implemented its own
 * Monday–Sunday-week rule that the forensic audit found non-compliant with
 * the actual business rule (failed 4 of 7 required acceptance cases).
 *
 * `calculatePaymentEligibleDate` is now a compatibility wrapper that
 * delegates to the single unified payout schedule service
 * (server/services/commission-payout-schedule-service.ts). Callers
 * (server/services/commission-payout-service.ts,
 * server/services/group-payment-transition-service.ts,
 * server/routes/group-enrollment.ts) are unchanged — they still pass a
 * "captured payment" anchor date, which this wrapper now schedules using the
 * unified writing-commission Friday/holiday rule instead of the old
 * incorrect logic. See docs/COMMISSION_PAYOUT_SCHEDULING_PHASE2A_REPORT.md
 * (§ KEEP/REDIRECT/DEPRECATE matrix) for why the callers themselves were not
 * changed in this phase.
 */

import { getWritingCommissionPayDate } from "../services/commission-payout-schedule-service";

/**
 * Calculate the payment eligible date for a commission.
 * @param enrollmentDate - The anchor date supplied by the caller (historically
 *   the member's enrollment/payment-capture date).
 * @returns The unified writing-commission payout date for that anchor date.
 */
export function calculatePaymentEligibleDate(enrollmentDate: Date): Date {
  return getWritingCommissionPayDate(enrollmentDate);
}

/**
 * Format the payment schedule explanation for display
 * @param enrollmentDate - The date the member enrolled
 * @returns Human-readable explanation of the payment schedule
 */
export function formatPaymentSchedule(enrollmentDate: Date): string {
  const paymentDate = calculatePaymentEligibleDate(enrollmentDate);
  const formatter = new Intl.DateTimeFormat('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  return `Enrolled ${formatter.format(enrollmentDate)}, eligible for payment ${formatter.format(paymentDate)}`;
}

/**
 * Check if a commission is currently eligible for payment
 * @param paymentEligibleDate - The calculated payment eligible date
 * @returns true if the current date is on or after the payment eligible date
 */
export function isEligibleForPayment(paymentEligibleDate: Date): boolean {
  const now = new Date();
  return now >= paymentEligibleDate;
}
