import { supabase } from '../lib/supabaseClient';
import { processConfirmedPayment } from './payment-confirmed-service';
import { syncLedgerEntriesForPayment } from './commission-ledger-service';

export const FINANCIAL_EXCEPTION_TYPES = {
  COMMISSION_FAILED: 'PAYMENT_CONFIRMED_COMMISSION_FAILED',
  COMMISSION_MISSING: 'PAYMENT_CONFIRMED_COMMISSION_MISSING',
  LEDGER_SYNC_FAILED: 'COMMISSION_LEDGER_SYNC_FAILED',
  LEDGER_MISSING: 'COMMISSION_LEDGER_MISSING',
  PAYMENT_PENDING: 'PAYMENT_PENDING_REVIEW_REQUIRED',
  GROUP_DATE: 'GROUP_EFFECTIVE_DATE_UNRESOLVED',
  SOURCE_PAYMENT_MISSING: 'SOURCE_PAYMENT_MISSING',
  DUPLICATE_COMMISSION: 'DUPLICATE_COMMISSION_EVENT',
  DUPLICATE_LEDGER: 'DUPLICATE_LEDGER_ENTRY',
  RETRY_LIMIT: 'RETRY_LIMIT_EXCEEDED',
} as const;

export type FinancialExceptionStatus = 'open' | 'retrying' | 'review_required' | 'resolved' | 'ignored';
export type FinancialExceptionType = typeof FINANCIAL_EXCEPTION_TYPES[keyof typeof FINANCIAL_EXCEPTION_TYPES];
const MAX_RETRIES = 3;
const PROCESSING_WINDOW_MINUTES = 15;
const HOSTED_PAYMENT_EXPIRY_MINUTES = 30;

export interface FinancialException {
  id: string;
  fingerprint: string;
  exception_type: FinancialExceptionType;
  payment_id: number | null;
  member_id: number | null;
  commission_id: string | null;
  ledger_id: string | null;
  detected_at: string;
  retry_count: number;
  last_retry_at: string | null;
  status: FinancialExceptionStatus;
  error_reason: string | null;
  resolution_method: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  metadata: Record<string, unknown>;
}

function isSuccessful(status: unknown): boolean {
  return ['paid', 'succeeded', 'success', 'captured'].includes(String(status || '').toLowerCase());
}

function fingerprint(type: string, paymentId?: number | null, identifier?: string | null): string {
  return `${type}:${paymentId || 'none'}:${identifier || 'none'}`;
}

async function recordException(input: {
  type: FinancialExceptionType;
  paymentId?: number | null;
  memberId?: number | null;
  commissionId?: string | null;
  ledgerId?: string | null;
  reason: string;
  metadata?: Record<string, unknown>;
  status?: FinancialExceptionStatus;
}): Promise<void> {
  const key = fingerprint(input.type, input.paymentId, input.commissionId || input.ledgerId);
  const { error } = await supabase.from('financial_exceptions').upsert({
    fingerprint: key,
    exception_type: input.type,
    payment_id: input.paymentId || null,
    member_id: input.memberId || null,
    commission_id: input.commissionId || null,
    ledger_id: input.ledgerId || null,
    error_reason: input.reason,
    status: input.status || 'open',
    metadata: input.metadata || {},
    updated_at: new Date().toISOString(),
  }, { onConflict: 'fingerprint', ignoreDuplicates: false });
  if (error && !String(error.message).toLowerCase().includes('column')) {
    throw new Error(`Failed recording financial exception: ${error.message}`);
  }
}

export async function detectFinancialExceptions(limit = 200): Promise<{ detected: number; historical: number }> {
  const { data: payments, error: paymentError } = await supabase
    .from('payments')
    .select('id, member_id, status, created_at, commission_processing_status, ledger_sync_status, commission_processing_error, ledger_sync_error, metadata')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (paymentError) throw new Error(`Failed loading payments for reconciliation: ${paymentError.message}`);

  let detected = 0;
  for (const payment of payments || []) {
    const paymentId = Number(payment.id);
    const memberId = payment.member_id ? Number(payment.member_id) : null;
    const successful = isSuccessful(payment.status);
    const ageMinutes = payment.created_at ? (Date.now() - Date.parse(payment.created_at)) / 60000 : 0;
    if (successful && payment.commission_processing_status === 'failed') {
      await recordException({ type: FINANCIAL_EXCEPTION_TYPES.COMMISSION_FAILED, paymentId, memberId, reason: payment.commission_processing_error || 'Commission processing failed' }); detected++;
    }
    if (successful && payment.commission_processing_status === 'pending' && ageMinutes > PROCESSING_WINDOW_MINUTES) {
      await recordException({ type: FINANCIAL_EXCEPTION_TYPES.COMMISSION_FAILED, paymentId, memberId, reason: 'Commission processing pending beyond normal processing window' }); detected++;
    }
    if (successful && payment.ledger_sync_status === 'failed') {
      await recordException({ type: FINANCIAL_EXCEPTION_TYPES.LEDGER_SYNC_FAILED, paymentId, memberId, reason: payment.ledger_sync_error || 'Ledger sync failed' }); detected++;
    }
    if (payment.status === 'pending' && ageMinutes > HOSTED_PAYMENT_EXPIRY_MINUTES) {
      await recordException({ type: FINANCIAL_EXCEPTION_TYPES.PAYMENT_PENDING, paymentId, memberId, reason: 'Payment pending beyond hosted-checkout review window', metadata: { verification: 'PAYMENT VERIFICATION REQUIRED', createdAt: payment.created_at } }); detected++;
    }

    if (!successful || !paymentId) continue;
    const { data: commissions } = await supabase.from('agent_commissions').select('id, source_payment_id').eq('source_payment_id', paymentId);
    if (!commissions || commissions.length === 0) {
      await recordException({ type: FINANCIAL_EXCEPTION_TYPES.COMMISSION_MISSING, paymentId, memberId, reason: 'Successful payment has no source-linked commission entitlement' }); detected++;
      continue;
    }
    for (const commission of commissions) {
      const { data: ledgerRows } = await supabase.from('commission_ledger').select('id, source_payment_id').eq('source_commission_id', commission.id);
      if (!ledgerRows || ledgerRows.length === 0) {
        await recordException({ type: FINANCIAL_EXCEPTION_TYPES.LEDGER_MISSING, paymentId, memberId, commissionId: String(commission.id), reason: 'Commission entitlement has no ledger row' }); detected++;
      }
      if (commission.source_payment_id && Number(commission.source_payment_id) !== paymentId) {
        await recordException({ type: FINANCIAL_EXCEPTION_TYPES.SOURCE_PAYMENT_MISSING, paymentId, memberId, commissionId: String(commission.id), reason: 'Commission source payment does not match inspected payment' }); detected++;
      }
    }
  }

  const { data: commissionKeys } = await supabase
    .from('agent_commissions')
    .select('id, commission_event_key')
    .not('commission_event_key', 'is', null)
    .limit(5000);
  const commissionKeyGroups = new Map<string, any[]>();
  for (const row of commissionKeys || []) {
    const key = String(row.commission_event_key);
    commissionKeyGroups.set(key, [...(commissionKeyGroups.get(key) || []), row]);
  }
  for (const [key, rows] of commissionKeyGroups) {
    if (rows.length > 1) {
      await recordException({
        type: FINANCIAL_EXCEPTION_TYPES.DUPLICATE_COMMISSION,
        commissionId: String(rows[0].id),
        reason: 'Duplicate commission_event_key detected; manual review required',
        metadata: { commissionEventKey: key, commissionIds: rows.map((row) => row.id) },
        status: 'review_required',
      });
      detected++;
    }
  }

  const { data: ledgerKeys } = await supabase
    .from('commission_ledger')
    .select('id, source_commission_id, commission_period_start, commission_period_end')
    .limit(5000);
  const ledgerKeyGroups = new Map<string, any[]>();
  for (const row of ledgerKeys || []) {
    const key = `${row.source_commission_id}|${row.commission_period_start}|${row.commission_period_end}`;
    ledgerKeyGroups.set(key, [...(ledgerKeyGroups.get(key) || []), row]);
  }
  for (const [key, rows] of ledgerKeyGroups) {
    if (rows.length > 1) {
      await recordException({
        type: FINANCIAL_EXCEPTION_TYPES.DUPLICATE_LEDGER,
        ledgerId: String(rows[0].id),
        reason: 'Duplicate ledger source/period combination detected; manual review required',
        metadata: { sourcePeriodKey: key, ledgerIds: rows.map((row) => row.id) },
        status: 'review_required',
      });
      detected++;
    }
  }

  const { data: unlinkedLedgerRows } = await supabase
    .from('commission_ledger')
    .select('id, source_commission_id, source_payment_id')
    .is('source_payment_id', null)
    .not('source_commission_id', 'is', null)
    .limit(500);
  const sourceCommissionIds = (unlinkedLedgerRows || []).map((row) => String(row.source_commission_id));
  if (sourceCommissionIds.length > 0) {
    const { data: sourceRows } = await supabase
      .from('agent_commissions')
      .select('id, source_payment_id')
      .in('id', sourceCommissionIds);
    const sourceById = new Map((sourceRows || []).map((row) => [String(row.id), row]));
    for (const row of unlinkedLedgerRows || []) {
      const source = sourceById.get(String(row.source_commission_id));
      if (source?.source_payment_id) {
        await recordException({
          type: FINANCIAL_EXCEPTION_TYPES.SOURCE_PAYMENT_MISSING,
          paymentId: Number(source.source_payment_id),
          ledgerId: String(row.id),
          reason: 'New ledger row is missing the source payment linkage present on its commission',
          metadata: { sourceCommissionId: row.source_commission_id },
        });
        detected++;
      }
    }
  }

  const { data: historicalCommissions } = await supabase
    .from('agent_commissions')
    .select('id, member_id, created_at')
    .is('source_payment_id', null)
    .limit(500);
  let historical = 0;
  for (const row of historicalCommissions || []) {
    await recordException({
      type: FINANCIAL_EXCEPTION_TYPES.SOURCE_PAYMENT_MISSING,
      memberId: Number(row.member_id) || null,
      commissionId: String(row.id),
      reason: 'Historical commission has no source payment; no automatic link will be guessed',
      metadata: { historical: true, createdAt: row.created_at },
      status: 'ignored',
    });
    historical++;
  }

  const { data: groupMembers } = await supabase.from('group_members').select('id, group_id').limit(1000);
  const groupIds = [...new Set((groupMembers || []).map((row) => String(row.group_id)).filter(Boolean))];
  if (groupIds.length > 0) {
    const { data: groups } = await supabase.from('groups').select('id, metadata').in('id', groupIds);
    const groupById = new Map((groups || []).map((row) => [String(row.id), row]));
    const unresolvedGroupMemberIds = (groupMembers || []).filter((member) => {
      const metadata = groupById.get(String(member.group_id))?.metadata;
      return !metadata?.groupBillingLifecycle?.expectedCycleDate && !metadata?.billingScheduler?.scheduledStartDate;
    }).map((member) => `group_member:${member.id}`);
    if (unresolvedGroupMemberIds.length > 0) {
      const { data: groupCommissions } = await supabase.from('agent_commissions').select('id, member_id, source_payment_id').in('member_id', unresolvedGroupMemberIds).limit(1000);
      for (const commission of groupCommissions || []) {
        await recordException({
          type: FINANCIAL_EXCEPTION_TYPES.GROUP_DATE,
          paymentId: commission.source_payment_id ? Number(commission.source_payment_id) : null,
          commissionId: String(commission.id),
          reason: 'Group commission has no resolvable lifecycle effective date; review required',
          metadata: { memberId: commission.member_id },
          status: 'review_required',
        });
        detected++;
      }
    }
  }

  return { detected, historical };
}

export async function listFinancialExceptions(options: { status?: string; limit?: number } = {}): Promise<FinancialException[]> {
  let query = supabase.from('financial_exceptions').select('*').order('detected_at', { ascending: false }).limit(options.limit || 100);
  if (options.status) query = query.eq('status', options.status);
  const { data, error } = await query;
  if (error) throw new Error(`Failed loading financial exceptions: ${error.message}`);
  return (data || []) as FinancialException[];
}

export async function getFinancialException(id: string): Promise<FinancialException | null> {
  const { data, error } = await supabase.from('financial_exceptions').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed loading financial exception: ${error.message}`);
  return data as FinancialException | null;
}

export async function retryFinancialException(id: string, actorUserId?: string | null): Promise<FinancialException> {
  const exception = await getFinancialException(id);
  if (!exception) throw new Error('Financial exception not found');
  if (!exception.payment_id) throw new Error('This exception has no payment to retry');
  if (exception.retry_count >= MAX_RETRIES) {
    await supabase.from('financial_exceptions').update({ status: 'review_required', exception_type: FINANCIAL_EXCEPTION_TYPES.RETRY_LIMIT, resolution_method: 'retry_limit', updated_at: new Date().toISOString() }).eq('id', id);
    throw new Error('Retry limit exceeded; exception requires review');
  }

  const retryCount = exception.retry_count + 1;
  const retryAt = new Date().toISOString();
  const retryHistory = Array.isArray((exception.metadata || {}).retryHistory)
    ? (exception.metadata as any).retryHistory
    : [];
  await supabase.from('financial_exceptions').update({
    status: 'retrying',
    retry_count: retryCount,
    last_retry_at: retryAt,
    updated_at: retryAt,
    metadata: {
      ...(exception.metadata || {}),
      lastRetryActor: actorUserId || null,
      retryHistory: [...retryHistory, { retryCount, at: retryAt, actorUserId: actorUserId || null }],
    },
  }).eq('id', id);
  try {
    if ([FINANCIAL_EXCEPTION_TYPES.COMMISSION_FAILED, FINANCIAL_EXCEPTION_TYPES.COMMISSION_MISSING].includes(exception.exception_type)) {
      const result = await processConfirmedPayment({ paymentId: exception.payment_id, confirmationSource: 'reconciliation' });
      if (result.commissionSkippedReason) throw new Error(result.commissionSkippedReason);
    } else {
      const { data: payment } = await supabase.from('payments').select('member_id').eq('id', exception.payment_id).maybeSingle();
      const { data: member } = await supabase.from('members').select('membership_start_date').eq('id', Number(payment?.member_id || exception.member_id || 0)).maybeSingle();
      const result = await syncLedgerEntriesForPayment({ paymentId: exception.payment_id, memberId: Number(payment?.member_id || exception.member_id || 0), effectiveDate: member?.membership_start_date || null });
      if ('error' in result) throw new Error(result.error);
    }
    await supabase.from('financial_exceptions').update({ status: 'resolved', resolution_method: 'automatic_retry', resolved_at: new Date().toISOString(), resolved_by: actorUserId || null, updated_at: new Date().toISOString() }).eq('id', id);
  } catch (error: any) {
    const nextStatus = retryCount >= MAX_RETRIES ? 'review_required' : 'open';
    await supabase.from('financial_exceptions').update({ status: nextStatus, error_reason: error?.message || 'Retry failed', updated_at: new Date().toISOString() }).eq('id', id);
  }
  const updated = await getFinancialException(id);
  if (!updated) throw new Error('Exception disappeared after retry');
  return updated;
}

export async function resolveFinancialException(id: string, actorUserId: string, reason: string, status: 'resolved' | 'ignored' = 'resolved'): Promise<FinancialException> {
  if (!String(reason || '').trim()) throw new Error('Resolution reason is required');
  const { error } = await supabase.from('financial_exceptions').update({ status, resolution_method: reason.trim(), resolved_at: new Date().toISOString(), resolved_by: actorUserId, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(`Failed resolving financial exception: ${error.message}`);
  const updated = await getFinancialException(id);
  if (!updated) throw new Error('Financial exception not found after resolution');
  return updated;
}

export { MAX_RETRIES };
