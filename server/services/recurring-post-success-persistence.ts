import { supabase } from '../lib/supabaseClient';
import { createPayment, getPaymentByTransactionId } from '../storage';
import { processConfirmedPayment } from './payment-confirmed-service';
import { calculateNextBillingDate } from '../utils/membership-dates';

interface RecurringPostSuccessOptions {
  subscriptionId: number;
  memberId: number;
  amount: string;
  paymentMethodType?: string;
  billedCycleDate: string;
  transactionId: string;
  epxAuthCode?: string | null;
  epxResponseCode?: string | null;
  epxResponseMessage?: string | null;
  paymentCapturedAt?: Date;
}

interface RecurringPostSuccessResult {
  success: boolean;
  paymentId?: number;
  nextBillingDate?: string;
  payoutSummary?: {
    directCount: number;
    overrideCount: number;
  };
  ledgerSyncSummary?: {
    inserted: number;
    skipped: number;
    newlyEligible: number;
    error?: string;
  };
  failureReason?: string;
}

function isUniqueViolation(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('duplicate key')
    || message.includes('unique constraint')
    || message.includes('payments_transaction_id_key')
    || message.includes('idx_commission_payouts_unique_month')
  );
}

function dayKey(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

async function ensureRecurringPaymentRow(options: RecurringPostSuccessOptions): Promise<{ paymentId: number } | { error: string }> {
  const existingPayment = await getPaymentByTransactionId(options.transactionId);
  if (existingPayment?.id) {
    return { paymentId: Number(existingPayment.id) };
  }

  const normalizedPaymentMethodType = options.paymentMethodType === 'ACH' ? 'ACH' : 'CreditCard';
  const internalPaymentMethod = normalizedPaymentMethodType === 'ACH' ? 'ach' : 'card';
  const recurringFlow = normalizedPaymentMethodType === 'ACH'
    ? 'server_post_recurring_ach'
    : 'server_post_recurring_card';

  try {
    const createdPayment = await createPayment({
      userId: null,
      memberId: options.memberId,
      subscriptionId: String(options.subscriptionId),
      amount: options.amount,
      currency: 'USD',
      status: 'succeeded',
      paymentMethod: internalPaymentMethod,
      transactionId: options.transactionId,
      metadata: {
        source: 'recurring_scheduler',
        flow: recurringFlow,
        paymentMethodType: normalizedPaymentMethodType,
        recurring: true,
        billingDate: options.billedCycleDate,
        epxResponseCode: options.epxResponseCode ?? null,
        epxResponseMessage: options.epxResponseMessage ?? null,
        epxAuthCode: options.epxAuthCode ?? null,
      },
    });

    if (!createdPayment?.id) {
      return { error: 'Payment insert returned no id' };
    }

    return { paymentId: Number(createdPayment.id) };
  } catch (error: any) {
    if (!isUniqueViolation(error)) {
      return { error: `Payment insert failed: ${error?.message || 'unknown error'}` };
    }

    // Idempotent race: another worker likely inserted the same transaction_id.
    const racedPayment = await getPaymentByTransactionId(options.transactionId);
    if (racedPayment?.id) {
      return { paymentId: Number(racedPayment.id) };
    }

    return { error: 'Payment insert hit unique constraint but row could not be reloaded' };
  }
}

async function advanceBillingDateIdempotently(options: RecurringPostSuccessOptions): Promise<{ nextBillingDate: string } | { error: string }> {
  const billedDay = dayKey(options.billedCycleDate);

  const { data: currentSub, error: readError } = await supabase
    .from('subscriptions')
    .select('id, next_billing_date, start_date, current_period_start, current_period_end')
    .eq('id', options.subscriptionId)
    .single();

  if (readError) {
    return { error: `Failed reading subscription for billing advancement: ${readError.message}` };
  }

  const currentNextBillingDate = currentSub?.next_billing_date as string | null;
  if (!currentNextBillingDate) {
    return { error: 'Subscription has no next_billing_date to advance' };
  }

  const currentDay = dayKey(currentNextBillingDate);

  if (currentDay !== billedDay) {
    // If already beyond billed day, treat as idempotent success.
    if (new Date(currentNextBillingDate) > new Date(options.billedCycleDate)) {
      return { nextBillingDate: currentNextBillingDate };
    }

    return {
      error:
        `Controlled persistence failure: subscription next_billing_date (${currentNextBillingDate}) ` +
        `does not match billed cycle date (${options.billedCycleDate}) and is not already advanced`,
    };
  }

  // Derive the original enrollment anchor day from start_date so that dates clamped
  // by short months (e.g. Jan 31 → Feb 28) snap back correctly in longer months (→ Mar 31).
  const startDate = currentSub?.start_date as string | null;
  const anchorDay = startDate ? new Date(startDate).getUTCDate() : undefined;

  const computedNextBillingDate = calculateNextBillingDate(new Date(options.billedCycleDate), anchorDay).toISOString();

  const { data: updatedRows, error: updateError } = await supabase
    .from('subscriptions')
    .update({
      current_period_start: currentNextBillingDate,
      current_period_end: computedNextBillingDate,
      next_billing_date: computedNextBillingDate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', options.subscriptionId)
    .eq('next_billing_date', currentNextBillingDate)
    .select('id, next_billing_date');

  if (updateError) {
    return { error: `Failed advancing next_billing_date: ${updateError.message}` };
  }

  if (Array.isArray(updatedRows) && updatedRows.length > 0) {
    return { nextBillingDate: updatedRows[0].next_billing_date };
  }

  // CAS miss: re-read and verify if already advanced by another worker.
  const { data: rereadSub, error: rereadError } = await supabase
    .from('subscriptions')
    .select('next_billing_date')
    .eq('id', options.subscriptionId)
    .single();

  if (rereadError) {
    return { error: `Failed re-reading subscription after CAS miss: ${rereadError.message}` };
  }

  const rereadNextBillingDate = rereadSub?.next_billing_date as string | null;
  if (rereadNextBillingDate && new Date(rereadNextBillingDate) > new Date(options.billedCycleDate)) {
    return { nextBillingDate: rereadNextBillingDate };
  }

  return {
    error:
      `Controlled persistence failure: next_billing_date was not advanced for subscription ${options.subscriptionId}`,
  };
}

export async function persistRecurringPostSuccess(
  options: RecurringPostSuccessOptions
): Promise<RecurringPostSuccessResult> {
  const paymentResult = await ensureRecurringPaymentRow(options);
  if ('error' in paymentResult) {
    return { success: false, failureReason: paymentResult.error };
  }

  const billingResult = await advanceBillingDateIdempotently(options);
  if ('error' in billingResult) {
    return {
      success: false,
      paymentId: paymentResult.paymentId,
      failureReason: billingResult.error,
    };
  }

  let confirmationResult;
  try {
    confirmationResult = await processConfirmedPayment({
      paymentId: paymentResult.paymentId,
      confirmationSource: 'recurring_billing',
      providerTransactionAt: options.paymentCapturedAt || new Date(),
    });
    if (confirmationResult.commissionSkippedReason) {
      return {
        success: false,
        paymentId: paymentResult.paymentId,
        nextBillingDate: billingResult.nextBillingDate,
        failureReason: `Recurring financial processing failed: ${confirmationResult.commissionSkippedReason}`,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      paymentId: paymentResult.paymentId,
      nextBillingDate: billingResult.nextBillingDate,
      failureReason: `Recurring financial processing failed: ${error?.message || 'unknown error'}`,
    };
  }

  return {
    success: true,
    paymentId: paymentResult.paymentId,
    nextBillingDate: billingResult.nextBillingDate,
    payoutSummary: {
      directCount: confirmationResult.commissionsCreated,
      overrideCount: confirmationResult.overridesRetained,
    },
    ledgerSyncSummary: {
      inserted: confirmationResult.commissionsCreated + confirmationResult.overridesRetained,
      skipped: confirmationResult.alreadyConfirmed ? 1 : 0,
      newlyEligible: 0,
    },
  };
}
