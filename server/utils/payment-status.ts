/**
 * Canonical payment-status helpers.
 *
 * The forensic audit found `succeeded` / `success` / `completed` used
 * interchangeably across the codebase. This module is the single source of
 * truth going forward for "is this payment successful" checks. Existing
 * legacy string comparisons are NOT rewritten in Phase 1 — new code (the
 * PaymentConfirmedService and its callers) should use this helper instead of
 * inlining another string list.
 */

const SUCCESSFUL_PAYMENT_STATUSES = new Set([
  "succeeded",
  "success",
  "completed",
]);

const FAILED_PAYMENT_STATUSES = new Set([
  "failed",
  "declined",
  "cancelled",
  "canceled",
]);

const PENDING_PAYMENT_STATUSES = new Set(["pending", "processing"]);

export function normalizePaymentStatusValue(status: unknown): string {
  return String(status || "")
    .trim()
    .toLowerCase();
}

export function isSuccessfulPaymentStatus(status: unknown): boolean {
  return SUCCESSFUL_PAYMENT_STATUSES.has(normalizePaymentStatusValue(status));
}

export function isFailedPaymentStatus(status: unknown): boolean {
  return FAILED_PAYMENT_STATUSES.has(normalizePaymentStatusValue(status));
}

export function isPendingPaymentStatus(status: unknown): boolean {
  return PENDING_PAYMENT_STATUSES.has(normalizePaymentStatusValue(status));
}

/**
 * Normalized set of sources allowed to confirm a payment through
 * PaymentConfirmedService. Keep this list in sync with
 * docs/PAYMENT_CONFIRMED_SERVICE_PHASE1_REPORT.md.
 */
export const PAYMENT_CONFIRMATION_SOURCES = [
  "epx_callback",
  "epx_browser_complete",
  "manual_admin",
  "reconciliation",
  "recurring_billing",
] as const;

export type PaymentConfirmationSource =
  (typeof PAYMENT_CONFIRMATION_SOURCES)[number];

export function isPaymentConfirmationSource(
  value: unknown,
): value is PaymentConfirmationSource {
  return PAYMENT_CONFIRMATION_SOURCES.includes(value as PaymentConfirmationSource);
}
