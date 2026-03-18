/**
 * Recurring Billing Scheduler — Phase 1: Credit Card Only
 *
 * Processes due subscriptions on a configurable interval.
 * ACH subscriptions are explicitly excluded in this phase.
 *
 * Environment flags:
 *   BILLING_SCHEDULER_ENABLED  – must be 'true' to start the scheduler
 *   BILLING_SCHEDULER_DRY_RUN  – 'true' (default) logs what would happen without charging
 *   BILLING_SCHEDULER_INTERVAL_MS – cycle interval in ms (default: 3600000 = 1 hour)
 */

import { supabase } from '../lib/supabaseClient';
import {
  decryptPaymentToken,
  getSubscriptionsDueForBilling,
  insertRecurringBillingLog,
  updateRecurringBillingLog,
  hasExistingBillingLogEntry,
  getStalePendingBillingLogs,
  getPaymentByTransactionId,
  type BillableSubscription,
} from '../storage';
import { submitServerPostRecurringPayment } from './epx-payment-service';
import { persistRecurringPostSuccess } from './recurring-post-success-persistence';

const LOG_PREFIX = '[Recurring Billing]';
const ADVISORY_LOCK_KEY = 123456789; // Arbitrary fixed int64 for pg_try_advisory_lock
const STALE_PENDING_THRESHOLD_MINUTES = 30;

// ────────────────────────────────────────
// Configuration helpers
// ────────────────────────────────────────

function isDryRun(): boolean {
  return process.env.BILLING_SCHEDULER_DRY_RUN !== 'false';
}

function getIntervalMs(): number {
  const raw = process.env.BILLING_SCHEDULER_INTERVAL_MS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 60_000 ? parsed : 3_600_000;
}

// ────────────────────────────────────────
// PostgreSQL advisory lock (session-level)
// ────────────────────────────────────────

async function acquireLock(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('app_try_advisory_lock', {
      lock_id: ADVISORY_LOCK_KEY,
    });
    if (error) {
      console.warn(`${LOG_PREFIX} Advisory lock RPC error:`, error.message);
      return false;
    }
    return data === true;
  } catch (err: any) {
    console.warn(`${LOG_PREFIX} Could not acquire advisory lock:`, err.message);
    return false;
  }
}

async function releaseLock(): Promise<void> {
  try {
    await supabase.rpc('app_advisory_unlock', {
      lock_id: ADVISORY_LOCK_KEY,
    });
  } catch (err: any) {
    console.warn(`${LOG_PREFIX} Could not release advisory lock:`, err.message);
  }
}

// ────────────────────────────────────────
// Transaction ID generation
// ────────────────────────────────────────

function generateTransactionId(subscriptionId: number, billingDate: Date): string {
  const ymd = billingDate.toISOString().slice(0, 10).replace(/-/g, '');
  return `RECUR-${subscriptionId}-${ymd}`;
}

function truncateBillingDate(date: string | Date): string {
  return new Date(date).toISOString().slice(0, 10) + 'T00:00:00.000Z';
}

// ────────────────────────────────────────
// Core billing cycle
// ────────────────────────────────────────

async function runBillingCycle(): Promise<void> {
  const cycleStart = Date.now();
  const dryRun = isDryRun();
  const mode = dryRun ? 'DRY RUN' : 'LIVE';

  console.log(`${LOG_PREFIX} ──── Cycle start (${mode}) ────`);

  // 1. Acquire lock
  const locked = await acquireLock();
  if (!locked) {
    console.log(`${LOG_PREFIX} Another instance holds the lock — skipping cycle`);
    return;
  }

  try {
    // 2. Verify and resolve stale 'pending' entries
    const staleLogs = await getStalePendingBillingLogs(STALE_PENDING_THRESHOLD_MINUTES);
    for (const stale of staleLogs) {
      // Check whether the payment actually succeeded (EPX may have responded after crash)
      const txId = generateTransactionId(stale.subscriptionId, new Date(stale.billingDate));
      const payment = await getPaymentByTransactionId(txId);

      // Also check whether the webhook already advanced next_billing_date past the stale date
      const { data: subRow } = await supabase
        .from('subscriptions')
        .select('next_billing_date')
        .eq('id', stale.subscriptionId)
        .single();
      const nextBilling = subRow?.next_billing_date ? new Date(subRow.next_billing_date) : null;
      const staleBillingDate = new Date(stale.billingDate);

      const paymentExists = !!payment && (payment.status === 'completed' || payment.status === 'succeeded');
      const dateAdvanced = nextBilling !== null && nextBilling > staleBillingDate;

      if (paymentExists || dateAdvanced) {
        // Payment went through — correct the log to success
        await updateRecurringBillingLog(stale.id, {
          status: 'success',
          failureReason: null,
          processedAt: new Date().toISOString(),
        });
        console.log(`${LOG_PREFIX} Stale pending log ${stale.id} (sub ${stale.subscriptionId}) verified as success`);
      } else {
        // No evidence of success — mark failed so it can be retried
        await updateRecurringBillingLog(stale.id, {
          status: 'failed',
          failureReason: 'Stale pending entry — no matching payment or date advancement found',
          processedAt: new Date().toISOString(),
        });
        console.warn(`${LOG_PREFIX} Marked stale pending log ${stale.id} (sub ${stale.subscriptionId}) as failed`);
      }
    }

    // 3. Query due subscriptions (card-only, filtered at DB level)
    const now = new Date();
    const dueSubscriptions = await getSubscriptionsDueForBilling(now);

    if (dueSubscriptions.length === 0) {
      console.log(`${LOG_PREFIX} No subscriptions due for billing`);
      return;
    }

    console.log(`${LOG_PREFIX} Found ${dueSubscriptions.length} card subscription(s) due`);

    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;

    // 4. Process each subscription
    for (const sub of dueSubscriptions) {
      try {
        await processSubscription(sub, dryRun);
        successCount++;
      } catch (err: any) {
        failCount++;
        console.error(`${LOG_PREFIX} Error processing subscription ${sub.subscriptionId}:`, err.message);
      }
    }

    const elapsed = Date.now() - cycleStart;
    console.log(
      `${LOG_PREFIX} ──── Cycle complete (${mode}) ────  ` +
      `${successCount} processed, ${failCount} errors, ${elapsed}ms`
    );
  } finally {
    await releaseLock();
  }
}

async function processSubscription(sub: BillableSubscription, dryRun: boolean): Promise<void> {
  // Defensive: skip non-CreditCard tokens that somehow got through
  if (sub.paymentMethodType !== 'CreditCard') {
    console.log(`${LOG_PREFIX} Skipping subscription ${sub.subscriptionId} — ACH not supported in Phase 1`);
    return;
  }

  const billingDate = truncateBillingDate(sub.nextBillingDate);
  const transactionId = generateTransactionId(sub.subscriptionId, new Date(billingDate));

  // 5. Idempotency check
  const existing = await hasExistingBillingLogEntry(sub.subscriptionId, billingDate);
  if (existing.exists) {
    console.log(
      `${LOG_PREFIX} Subscription ${sub.subscriptionId} already has '${existing.status}' entry for ${billingDate} — skipping`
    );
    return;
  }

  // 6. Decrypt BRIC token
  let authGuid: string;
  try {
    authGuid = decryptPaymentToken(sub.bricToken);
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Failed to decrypt token for subscription ${sub.subscriptionId}:`, err.message);
    await insertRecurringBillingLog({
      subscriptionId: sub.subscriptionId,
      memberId: sub.memberId,
      paymentTokenId: sub.tokenId,
      amount: sub.amount,
      billingDate,
      attemptNumber: 1,
      status: 'failed',
      failureReason: 'Token decryption failed',
      processedAt: new Date().toISOString(),
    });
    return;
  }

  // 7. DRY RUN path
  if (dryRun) {
    console.log(
      `${LOG_PREFIX} DRY RUN — Would charge subscription ${sub.subscriptionId}, ` +
      `member ${sub.memberId}, amount $${sub.amount}, card ****${sub.cardLastFour || '????'}`
    );
    await insertRecurringBillingLog({
      subscriptionId: sub.subscriptionId,
      memberId: sub.memberId,
      paymentTokenId: sub.tokenId,
      amount: sub.amount,
      billingDate,
      attemptNumber: 1,
      status: 'dry_run',
      epxTransactionId: transactionId,
      processedAt: new Date().toISOString(),
    });
    return;
  }

  // 8. LIVE charge path — write pending log first
  const logId = await insertRecurringBillingLog({
    subscriptionId: sub.subscriptionId,
    memberId: sub.memberId,
    paymentTokenId: sub.tokenId,
    amount: sub.amount,
    billingDate,
    attemptNumber: 1,
    status: 'pending',
    epxTransactionId: transactionId,
  });

  try {
    const result = await submitServerPostRecurringPayment({
      authGuid,
      amount: parseFloat(sub.amount),
      transactionId,
      tranType: 'CCE1',
      member: {
        id: sub.memberId,
        email: sub.memberEmail,
        firstName: sub.memberFirstName,
        lastName: sub.memberLastName,
      },
      description: `Recurring billing — subscription ${sub.subscriptionId}`,
    });

    if (result.success) {
      const persistenceResult = await persistRecurringPostSuccess({
        subscriptionId: sub.subscriptionId,
        memberId: sub.memberId,
        amount: sub.amount,
        billedCycleDate: billingDate,
        transactionId,
        epxAuthCode: result.responseFields?.AUTH_CODE || null,
        epxResponseCode: result.responseFields?.AUTH_RESP || null,
        epxResponseMessage: result.responseFields?.AUTH_RESP_TEXT || null,
        paymentCapturedAt: new Date(),
      });

      if (!persistenceResult.success) {
        await updateRecurringBillingLog(logId, {
          status: 'failed',
          epxTransactionId: result.responseFields?.TRANSACTION_ID || transactionId,
          epxAuthCode: result.responseFields?.AUTH_CODE || null,
          epxResponseCode: result.responseFields?.AUTH_RESP || null,
          epxResponseMessage: result.responseFields?.AUTH_RESP_TEXT || null,
          failureReason: persistenceResult.failureReason || 'Post-success persistence failed',
          processedAt: new Date().toISOString(),
        });

        console.error(
          `${LOG_PREFIX} ❌ Controlled persistence failure for subscription ${sub.subscriptionId}: ` +
          `${persistenceResult.failureReason || 'unknown reason'}`
        );
        return;
      }

      // Update log to success only after payment persistence + billing advancement + payout creation succeed.
      await updateRecurringBillingLog(logId, {
        status: 'success',
        paymentId: persistenceResult.paymentId,
        epxTransactionId: result.responseFields?.TRANSACTION_ID || transactionId,
        epxAuthCode: result.responseFields?.AUTH_CODE || null,
        epxResponseCode: result.responseFields?.AUTH_RESP || null,
        epxResponseMessage: result.responseFields?.AUTH_RESP_TEXT || null,
        processedAt: new Date().toISOString(),
      });

      console.log(
        `${LOG_PREFIX} ✅ Charged subscription ${sub.subscriptionId} — $${sub.amount} — ` +
        `auth ${result.responseFields?.AUTH_CODE || 'n/a'}`
      );
    } else {
      // EPX declined
      await updateRecurringBillingLog(logId, {
        status: 'failed',
        epxResponseCode: result.responseFields?.AUTH_RESP || null,
        epxResponseMessage: result.error || result.responseFields?.AUTH_RESP_TEXT || null,
        failureReason: result.error || 'EPX declined',
        processedAt: new Date().toISOString(),
      });

      console.warn(
        `${LOG_PREFIX} ❌ Declined subscription ${sub.subscriptionId} — ` +
        `code ${result.responseFields?.AUTH_RESP || 'n/a'}: ${result.error || 'unknown'}`
      );
    }
  } catch (epxError: any) {
    // Network / timeout / unexpected error
    await updateRecurringBillingLog(logId, {
      status: 'failed',
      failureReason: epxError.message || 'Unexpected error during EPX call',
      processedAt: new Date().toISOString(),
    });
    console.error(
      `${LOG_PREFIX} ❌ Error charging subscription ${sub.subscriptionId}:`,
      epxError.message
    );
  }
}

// ────────────────────────────────────────
// Scheduler init (called from server/index.ts)
// ────────────────────────────────────────

export function scheduleRecurringBilling(): void {
  if (process.env.BILLING_SCHEDULER_ENABLED !== 'true') {
    console.log(`${LOG_PREFIX} Scheduler disabled (BILLING_SCHEDULER_ENABLED !== 'true')`);
    return;
  }

  const intervalMs = getIntervalMs();
  const dryRun = isDryRun();
  const mode = dryRun ? 'DRY RUN' : 'LIVE';

  console.log(`${LOG_PREFIX} Scheduler initialized (${mode})`);
  console.log(`${LOG_PREFIX} Interval: ${Math.round(intervalMs / 60_000)} minutes`);
  console.log(`${LOG_PREFIX} Phase 1 — Credit card only (ACH disabled)`);

  // Run first cycle after a short delay (let server finish startup)
  setTimeout(() => {
    runBillingCycle().catch((err) =>
      console.error(`${LOG_PREFIX} Unhandled cycle error:`, err)
    );
  }, 15_000);

  // Schedule recurring cycles
  setInterval(() => {
    runBillingCycle().catch((err) =>
      console.error(`${LOG_PREFIX} Unhandled cycle error:`, err)
    );
  }, intervalMs);
}
