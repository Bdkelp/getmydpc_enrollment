import { getGroupById, getGroupMemberById, setGroupMemberPaymentStatus, updateGroup } from '../storage';
import { supabase } from '../lib/supabaseClient';
import { calculatePaymentEligibleDate } from '../utils/commission-payment-calculator';
import { createMonthlyPayout } from './commission-payout-service';

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

  if (options.updateMemberPaymentStatus) {
    await setGroupMemberPaymentStatus(options.groupMemberId, normalizedPaymentStatus);
  }

  const paymentCapturedAt = options.paymentCapturedAt ?? new Date();
  const paymentCapturedAtIso = paymentCapturedAt.toISOString();
  const paymentEligibleDate = calculatePaymentEligibleDate(paymentCapturedAt);
  const paymentEligibleDateIso = paymentEligibleDate.toISOString();
  const cycleKey = getCycleKey(paymentCapturedAt);
  const syntheticMemberId = buildSyntheticGroupMemberId(options.groupMemberId);

  const { data: commissions, error: commissionError } = await supabase
    .from('agent_commissions')
    .select('id, commission_amount, commission_type, override_for_agent_id, payment_captured, notes')
    .eq('member_id', syntheticMemberId)
    .ilike('notes', `%group:${normalizedGroupId}%`)
    .ilike('notes', `%groupMember:${options.groupMemberId}%`)
    .ilike('notes', `%cycle:${cycleKey}%`)
    .order('created_at', { ascending: true });

  if (commissionError) {
    throw new Error(`Failed loading expected group commissions: ${commissionError.message}`);
  }

  const expectedCommissions = commissions || [];
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
      skippedCount += 1;
    }

    const commissionAmount = parseAmountNumber(commission.commission_amount);
    if (commissionAmount > 0) {
      await createMonthlyPayout({
        commissionId: commission.id,
        paymentCapturedAt,
        amount: commissionAmount,
        commissionType: commission.commission_type === 'override' ? 'override' : 'direct',
        overrideForAgentId: commission.override_for_agent_id || undefined,
      });
    }
  }

  const groupMetadata = group.metadata && typeof group.metadata === 'object'
    ? (group.metadata as Record<string, any>)
    : {};
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
