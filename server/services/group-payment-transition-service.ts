import { getGroupById, getGroupMemberById, setGroupMemberPaymentStatus, updateGroup } from '../storage';
import { supabase } from '../lib/supabaseClient';
import { calculatePaymentEligibleDate } from '../utils/commission-payment-calculator';
import { syncLedgerEntriesForPayment } from './commission-ledger-service';
import { updateFinancialProcessingState } from './financial-processing-state';

const CAPTURED_PAYMENT_STATUSES = new Set(['paid', 'succeeded', 'success', 'captured']);

const normalizePaymentStatus = (value: unknown): string => String(value || '').trim().toLowerCase();

const getCycleKey = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const parseAmountNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildSyntheticGroupMemberId = (groupMemberId: number): string => `group_member:${groupMemberId}`;

const resolveCycleKeyFromGroupMetadata = (metadata: Record<string, any>, fallbackDate: Date): string => {
  const lifecycle = metadata.groupBillingLifecycle && typeof metadata.groupBillingLifecycle === 'object'
    ? metadata.groupBillingLifecycle
    : {};

  const lifecycleCycleKey = typeof lifecycle.cycleKey === 'string' ? lifecycle.cycleKey.trim() : '';
  if (lifecycleCycleKey) {
    return lifecycleCycleKey;
  }

  const expectedCycleDate = typeof lifecycle.expectedCycleDate === 'string'
    ? lifecycle.expectedCycleDate.trim()
    : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(expectedCycleDate)) {
    const [year, month] = expectedCycleDate.split('-');
    return `${year}-${month}`;
  }

  return getCycleKey(fallbackDate);
};

const buildPayableNotes = (
  existingNotes: unknown,
  paymentStatusRaw: string,
  triggeredBy: string | null,
  transitionSource: string,
): string => {
  const parts = String(existingNotes || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !item.startsWith('stage:'))
    .filter((item) => !item.startsWith('paymentStatus:'))
    .filter((item) => !item.startsWith('transitionSource:'))
    .filter((item) => !item.startsWith('triggeredBy:'));

  parts.push('stage:payable');
  parts.push(`paymentStatus:${paymentStatusRaw}`);
  parts.push(`transitionSource:${transitionSource}`);
  if (triggeredBy) {
    parts.push(`triggeredBy:${triggeredBy}`);
  }

  return parts.join(' | ');
};

interface TransitionGroupPaymentToPayableOptions {
  groupId: string;
  groupMemberId: number;
  paymentId: number | string;
  paymentStatusRaw: string;
  paymentCapturedAt?: Date;
  triggeredBy?: string | null;
  transitionSource: 'group-member-payment-endpoint' | 'epx-hosted-callback';
  transitionReference?: string | null;
  updateMemberPaymentStatus?: boolean;
}

interface TransitionGroupPaymentToPayableResult {
  cycleKey: string;
  paymentStatus: string;
  transitionedCount: number;
  skippedCount: number;
  missingExpectedCommissions: boolean;
  scheduledPayDate: string;
}

export async function transitionGroupPaymentToPayable(
  options: TransitionGroupPaymentToPayableOptions,
): Promise<TransitionGroupPaymentToPayableResult> {
  const normalizedGroupId = String(options.groupId || '').trim();
  if (!normalizedGroupId) {
    throw new Error('Group id is required for payment transition');
  }

  if (!Number.isFinite(options.groupMemberId)) {
    throw new Error('Group member id is required for payment transition');
  }

  const normalizedPaymentStatus = normalizePaymentStatus(options.paymentStatusRaw);
  if (!CAPTURED_PAYMENT_STATUSES.has(normalizedPaymentStatus)) {
    throw new Error(`Payment status ${normalizedPaymentStatus || '(empty)'} is not eligible for payable transition`);
  }

  const group = await getGroupById(normalizedGroupId);
  if (!group) {
    throw new Error('Group not found for payment transition');
  }

  const existingMember = await getGroupMemberById(options.groupMemberId);
  if (!existingMember || existingMember.groupId !== normalizedGroupId) {
    throw new Error('Group member not found for payment transition');
  }

  if (existingMember.status === 'terminated') {
    throw new Error('Cannot transition a terminated group member payment');
  }

  const paymentId = Number(options.paymentId);
  if (!Number.isFinite(paymentId) || paymentId <= 0) {
    throw new Error('A valid successful payment id is required for group commission transition');
  }

  const { data: sourcePayment, error: sourcePaymentError } = await supabase
    .from('payments')
    .select('id, member_id, status')
    .eq('id', paymentId)
    .single();

  if (sourcePaymentError || !sourcePayment) {
    throw new Error(`Source payment ${paymentId} could not be loaded for group commission transition`);
  }

  if (!CAPTURED_PAYMENT_STATUSES.has(normalizePaymentStatus(sourcePayment.status))) {
    throw new Error(`Source payment ${paymentId} is not successful; refusing group commission transition`);
  }

  if (options.updateMemberPaymentStatus) {
    await setGroupMemberPaymentStatus(options.groupMemberId, normalizedPaymentStatus);
  }

  const paymentCapturedAt = options.paymentCapturedAt ?? new Date();
  const paymentCapturedAtIso = paymentCapturedAt.toISOString();
  const groupMetadata = group.metadata && typeof group.metadata === 'object'
    ? (group.metadata as Record<string, any>)
    : {};
  // Phase 2B: writing commission scheduling must use the group's actual
  // cycle effective date, never the real-time payment-capture moment. Fall
  // back to paymentCapturedAt only when no cycle date is recorded, and flag
  // it rather than silently treating payment time as the effective date.
  const groupCycleEffectiveDateRaw =
    groupMetadata?.groupBillingLifecycle?.expectedCycleDate ||
    groupMetadata?.billingScheduler?.scheduledStartDate ||
    null;
  const groupCycleEffectiveDate = groupCycleEffectiveDateRaw
    ? new Date(groupCycleEffectiveDateRaw)
    : null;
  const effectiveDateForScheduling =
    groupCycleEffectiveDate && !Number.isNaN(groupCycleEffectiveDate.getTime())
      ? groupCycleEffectiveDate
      : paymentCapturedAt;
  if (!groupCycleEffectiveDate || Number.isNaN(groupCycleEffectiveDate.getTime())) {
    console.warn(
      `[GroupPaymentTransition] No group cycle effective date found for group ${normalizedGroupId} — falling back to payment-capture time for writing commission scheduling. FLAG FOR REVIEW.`,
    );
  }
  const paymentEligibleDate = calculatePaymentEligibleDate(effectiveDateForScheduling);
  const paymentEligibleDateIso = paymentEligibleDate.toISOString();
  const cycleKey = resolveCycleKeyFromGroupMetadata(groupMetadata, paymentCapturedAt);
  const syntheticMemberId = buildSyntheticGroupMemberId(options.groupMemberId);

  const { data: commissions, error: commissionError } = await supabase
    .from('agent_commissions')
    .select('id, commission_amount, commission_type, override_for_agent_id, payment_captured, source_payment_id, notes')
    .eq('member_id', syntheticMemberId)
    .ilike('notes', `%group:${normalizedGroupId}%`)
    .ilike('notes', `%groupMember:${options.groupMemberId}%`)
    .ilike('notes', `%cycle:${cycleKey}%`)
    .order('created_at', { ascending: true });

  if (commissionError) {
    throw new Error(`Failed loading expected group commissions: ${commissionError.message}`);
  }

  const expectedCommissions = commissions || [];
  await updateFinancialProcessingState({
    paymentId,
    commissionStatus: 'pending',
    ledgerStatus: 'pending',
    commissionError: null,
    ledgerError: null,
  });
  let transitionedCount = 0;
  let skippedCount = 0;

  for (const commission of expectedCommissions) {
    const alreadyCaptured = Boolean(commission.payment_captured);

    if (!alreadyCaptured) {
      const { error: updateError } = await supabase
        .from('agent_commissions')
        .update({
          status: 'approved',
          payment_status: 'unpaid',
          payment_captured: true,
          payment_captured_at: paymentCapturedAtIso,
          source_payment_id: paymentId,
          payment_eligible_date: paymentEligibleDateIso,
          notes: buildPayableNotes(
            commission.notes,
            normalizedPaymentStatus,
            options.triggeredBy || null,
            options.transitionSource,
          ),
        })
        .eq('id', commission.id);

      if (updateError) {
        throw new Error(`Failed transitioning expected commission ${commission.id}: ${updateError.message}`);
      }

      transitionedCount += 1;
    } else {
      if (commission.source_payment_id && Number(commission.source_payment_id) !== paymentId) {
        throw new Error(`Expected group commission ${commission.id} is already linked to a different payment`);
      }
      if (!commission.source_payment_id) {
        const { error: sourceLinkError } = await supabase
          .from('agent_commissions')
          .update({ source_payment_id: paymentId })
          .eq('id', commission.id)
          .is('source_payment_id', null);
        if (sourceLinkError) {
          throw new Error(`Failed linking expected group commission ${commission.id} to payment ${paymentId}: ${sourceLinkError.message}`);
        }
      }
      skippedCount += 1;
    }
  }

  const ledgerSyncResult = await syncLedgerEntriesForPayment({
    paymentId,
    memberId: Number(sourcePayment.member_id || 0),
    effectiveDate: effectiveDateForScheduling,
  });
  if ('error' in ledgerSyncResult) {
    await updateFinancialProcessingState({
      paymentId,
      commissionStatus: 'complete',
      ledgerStatus: 'failed',
      ledgerError: ledgerSyncResult.error,
    });
    throw new Error(`Group commission ledger sync failed for payment ${paymentId}: ${ledgerSyncResult.error}`);
  }
  await updateFinancialProcessingState({
    paymentId,
    commissionStatus: 'complete',
    ledgerStatus: 'complete',
    ledgerError: null,
  });
  const existingTransitions = Array.isArray(groupMetadata.paymentTransitions)
    ? groupMetadata.paymentTransitions
    : [];

  const transitionEntry = {
    type: 'payment_confirmed_to_payable',
    source: options.transitionSource,
    reference: options.transitionReference || null,
    at: paymentCapturedAtIso,
    by: options.triggeredBy || null,
    memberId: options.groupMemberId,
    paymentStatus: normalizedPaymentStatus,
    scheduledPayDate: paymentEligibleDateIso,
    cycle: cycleKey,
    transitionedCount,
    skippedCount,
    missingExpectedCommissions: expectedCommissions.length === 0,
  };

  const isDuplicateTransition = options.transitionReference
    ? existingTransitions.some((item: any) => item?.reference === options.transitionReference)
    : false;

  await updateGroup(normalizedGroupId, {
    metadata: {
      ...groupMetadata,
      groupBillingLifecycle: {
        ...(groupMetadata.groupBillingLifecycle && typeof groupMetadata.groupBillingLifecycle === 'object'
          ? groupMetadata.groupBillingLifecycle
          : {}),
        state: 'payment_confirmed',
        paymentConfirmedAt: paymentCapturedAtIso,
        paymentConfirmedBy: options.triggeredBy || null,
        paymentStatus: normalizedPaymentStatus,
        scheduledPayDate: paymentEligibleDateIso,
        cycle: cycleKey,
      },
      paymentTransitions: isDuplicateTransition
        ? existingTransitions
        : [transitionEntry, ...existingTransitions].slice(0, 50),
    },
    updatedBy: options.triggeredBy || undefined,
  });

  return {
    cycleKey,
    paymentStatus: normalizedPaymentStatus,
    transitionedCount,
    skippedCount,
    missingExpectedCommissions: expectedCommissions.length === 0,
    scheduledPayDate: paymentEligibleDateIso,
  };
}
