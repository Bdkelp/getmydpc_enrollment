import { supabase } from '../lib/supabaseClient';
import { createPayment, getPaymentByTransactionId } from '../storage';
import { syncCommissionLedgerFromFeed } from './commission-ledger-service';
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
    .select('id, next_billing_date')
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

  const computedNextBillingDate = calculateNextBillingDate(new Date(options.billedCycleDate)).toISOString();

  const { data: updatedRows, error: updateError } = await supabase
    .from('subscriptions')
    .update({
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

async function createCommissionPayoutsIdempotently(options: RecurringPostSuccessOptions, paymentId: number): Promise<{ directCount: number; overrideCount: number } | { error: string }> {
  try {
    const payoutModule = (await import('./commission-payout-service')) as any;
    const createPayoutsForMemberPayment = payoutModule?.createPayoutsForMemberPayment;

    if (typeof createPayoutsForMemberPayment !== 'function') {
      return { error: 'Failed creating commission payouts: createPayoutsForMemberPayment is unavailable' };
    }

    const payoutResult = await createPayoutsForMemberPayment(
      options.memberId,
      paymentId,
      options.transactionId,
      options.paymentCapturedAt || new Date()
    );

    return {
      directCount: payoutResult.direct.length,
      overrideCount: payoutResult.override.length,
    };
  } catch (error: any) {
    if (isUniqueViolation(error)) {
      // Idempotent race on unique payout-month constraint is safe.
      return { directCount: 0, overrideCount: 0 };
    }

    return { error: `Failed creating commission payouts: ${error?.message || 'unknown error'}` };
  }
}

async function syncCommissionLedgerForMemberIdempotently(
  options: RecurringPostSuccessOptions
): Promise<{ inserted: number; skipped: number; newlyEligible: number } | { error: string }> {
  try {
    const { data: sourceCommissions, error: sourceError } = await supabase
      .from('agent_commissions')
      .select('id, agent_id, agent_number, member_id, enrollment_id, commission_amount, coverage_type, notes, is_clawed_back, payment_status, payment_captured, created_at')
      .eq('member_id', options.memberId);

    if (sourceError) {
      return { error: `Failed loading source commissions for ledger sync: ${sourceError.message}` };
    }

    const commissions = Array.isArray(sourceCommissions) ? sourceCommissions : [];
    if (commissions.length === 0) {
      return { inserted: 0, skipped: 0, newlyEligible: 0 };
    }

    const agentIds = [...new Set(
      commissions
        .map((commission: any) => String(commission?.agent_id || '').trim())
        .filter(Boolean)
    )];

    const agentById = new Map<string, any>();
    if (agentIds.length > 0) {
      const { data: agents, error: agentsError } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, agent_number')
        .in('id', agentIds);

      if (agentsError) {
        return { error: `Failed loading agents for ledger sync: ${agentsError.message}` };
      }

      for (const agent of agents || []) {
        if (!agent?.id) continue;
        agentById.set(String(agent.id), agent);
      }
    }

    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('id, first_name, last_name, coverage_type, membership_start_date, created_at')
      .eq('id', options.memberId)
      .maybeSingle();

    if (memberError) {
      return { error: `Failed loading member for ledger sync: ${memberError.message}` };
    }

    const memberName = member?.first_name && member?.last_name
      ? `${member.first_name} ${member.last_name}`
      : (member?.first_name || member?.last_name || `Member ${options.memberId}`);

    const feed = commissions.map((commission: any) => {
      const agentId = String(commission?.agent_id || '').trim();
      const agent = agentById.get(agentId);
      const agentName = agent?.first_name && agent?.last_name
        ? `${agent.first_name} ${agent.last_name}`
        : (agent?.email || 'Unknown Agent');

      return {
        id: String(commission.id),
        agentId: agentId || undefined,
        agentName,
        agentNumber: commission?.agent_number || agent?.agent_number || undefined,
        memberId: String(commission?.member_id || options.memberId),
        enrollmentId: commission?.enrollment_id ? String(commission.enrollment_id) : undefined,
        memberName,
        coverageType: commission?.coverage_type || member?.coverage_type || undefined,
        effectiveDate: member?.membership_start_date || commission?.created_at || options.billedCycleDate,
        createdAt: commission?.created_at || options.billedCycleDate,
        commissionAmount: Number(commission?.commission_amount || 0),
        notes: commission?.notes || undefined,
        isClawedBack: Boolean(commission?.is_clawed_back),
        paymentStatus: commission?.payment_status || undefined,
        paymentCaptured: commission?.payment_captured === true ? true : (commission?.payment_captured === false ? false : undefined),
      };
    });

    return await syncCommissionLedgerFromFeed(feed);
  } catch (error: any) {
    return { error: `Failed syncing commission ledger: ${error?.message || 'unknown error'}` };
  }
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

  const payoutResult = await createCommissionPayoutsIdempotently(options, paymentResult.paymentId);
  if ('error' in payoutResult) {
    return {
      success: false,
      paymentId: paymentResult.paymentId,
      nextBillingDate: billingResult.nextBillingDate,
      failureReason: payoutResult.error,
    };
  }

  const ledgerSyncResult = await syncCommissionLedgerForMemberIdempotently(options);
  if ('error' in ledgerSyncResult) {
    console.error('[RecurringPostSuccess] Ledger sync warning:', {
      memberId: options.memberId,
      transactionId: options.transactionId,
      error: ledgerSyncResult.error,
    });
  }

  return {
    success: true,
    paymentId: paymentResult.paymentId,
    nextBillingDate: billingResult.nextBillingDate,
    payoutSummary: payoutResult,
    ledgerSyncSummary: 'error' in ledgerSyncResult
      ? {
        inserted: 0,
        skipped: 0,
        newlyEligible: 0,
        error: ledgerSyncResult.error,
      }
      : ledgerSyncResult,
  };
}
