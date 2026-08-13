export const RECURRING_BILLING_IDEMPOTENCY_STATUSES = [
  "success",
  "pending",
  "ach_test_success",
] as const;

export const RECURRING_BILLING_ATTEMPT_STATUSES = [
  "failed",
  ...RECURRING_BILLING_IDEMPOTENCY_STATUSES,
] as const;

export const RECURRING_BILLING_NON_RETRYABLE_RESPONSE_CODES = [
  "41",
  "43",
] as const;

export const RECURRING_BILLING_NON_RETRYABLE_FAILURE_PATTERNS = [
  "%token decryption failed%",
  "%missing recurring token%",
  "%resolved orig_auth_guid%",
] as const;

export function isRecurringBillingFailureRetryable(options: {
  responseCode?: string | null;
  failureReason?: string | null;
}): boolean {
  const responseCode = String(options.responseCode || "").trim();
  if (
    RECURRING_BILLING_NON_RETRYABLE_RESPONSE_CODES.includes(
      responseCode as (typeof RECURRING_BILLING_NON_RETRYABLE_RESPONSE_CODES)[number],
    )
  ) {
    return false;
  }

  const failureReason = String(options.failureReason || "").toLowerCase();
  return ![
    "token decryption failed",
    "missing recurring token",
    "resolved orig_auth_guid",
  ].some((fragment) => failureReason.includes(fragment));
}

export function getNextRecurringBillingAttemptNumber(
  existingAttemptCount: number,
): number {
  return Math.max(0, Math.floor(existingAttemptCount)) + 1;
}

export function filterRecurringBillingSubscriptions<
  T extends { subscriptionId: number },
>(subscriptions: T[], subscriptionIds?: number[]): T[] {
  if (subscriptionIds === undefined) {
    return subscriptions;
  }

  const allowedIds = new Set(subscriptionIds);
  return subscriptions.filter((subscription) =>
    allowedIds.has(subscription.subscriptionId),
  );
}
