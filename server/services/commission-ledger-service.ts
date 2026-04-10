import { supabase } from '../lib/supabaseClient.ts';
import { addDaysLocal, formatLocalDate, parseLocalDate } from '@shared/localDate';

type BatchType = '1st-cycle' | '15th-cycle';
type LedgerStatus = 'earned' | 'queued' | 'paid' | 'held' | 'reversed' | 'carry_forward';
type CommissionType = 'new' | 'renewal' | 'adjustment' | 'reversal';
export const PAYABLE_LEDGER_STATUSES: LedgerStatus[] = ['queued', 'paid'];
export const MIN_AGENT_PAYOUT_THRESHOLD = 25;

function toMoneyCents(value: unknown): number {
  return Math.round(Number(value || 0) * 100);
}

interface CommissionFeedItem {
  id: string;
  agentId?: string;
  agentName?: string;
  agentNumber?: string;
  memberId?: string;
  enrollmentId?: string;
  memberName?: string;
  userName?: string;
  planTier?: string;
  coverageType?: string;
  effectiveDate?: string;
  createdAt?: string;
  commissionAmount?: number;
  notes?: string;
  isClawedBack?: boolean;
  paymentStatus?: string;
}

function toIsoDate(value: Date): string {
  return formatLocalDate(value);
}

function getCycleAnchorForEntry(commissionPeriodEnd: Date): { batchType: BatchType; anchorDate: Date } {
  const day = commissionPeriodEnd.getDate();

  if (day <= 1) {
    const anchorDate = new Date(commissionPeriodEnd.getFullYear(), commissionPeriodEnd.getMonth(), 1);
    return { batchType: '1st-cycle', anchorDate };
  }

  if (day <= 15) {
    const anchorDate = new Date(commissionPeriodEnd.getFullYear(), commissionPeriodEnd.getMonth(), 15);
    return { batchType: '15th-cycle', anchorDate };
  }

  const anchorDate = new Date(commissionPeriodEnd.getFullYear(), commissionPeriodEnd.getMonth() + 1, 1);
  return { batchType: '1st-cycle', anchorDate };
}

function dateOnly(value: Date | string): Date {
  return parseLocalDate(value);
}

function firstFridayOnOrAfter(date: Date): Date {
  const result = dateOnly(date);
  const day = result.getDay();
  const friday = 5;
  const delta = (friday - day + 7) % 7;
  result.setDate(result.getDate() + delta);
  return result;
}

export function getNextPayoutDate(batchType: BatchType, referenceDate = new Date()): Date {
  const normalizedReference = dateOnly(referenceDate);
  const anchorDay = batchType === '1st-cycle' ? 1 : 15;
  const anchor = dateOnly(new Date(normalizedReference.getFullYear(), normalizedReference.getMonth(), anchorDay));

  if (normalizedReference.getTime() > anchor.getTime()) {
    if (batchType === '1st-cycle') {
      anchor.setMonth(anchor.getMonth() + 1, 1);
    } else {
      anchor.setMonth(anchor.getMonth() + 1, 15);
    }
  }

  return firstFridayOnOrAfter(anchor);
}

function deriveCommissionType(item: CommissionFeedItem, hasPriorForMember: boolean): CommissionType {
  const amount = Number(item.commissionAmount || 0);
  const notes = String(item.notes || '').toLowerCase();

  if (item.isClawedBack || amount < 0 || notes.includes('chargeback') || notes.includes('reversal')) {
    return 'reversal';
  }
  if (notes.includes('adjustment')) {
    return 'adjustment';
  }
  return hasPriorForMember ? 'renewal' : 'new';
}

function normalizePeriodFromDate(rawDate?: string): { start: string; end: string } {
  const base = rawDate ? parseLocalDate(rawDate) : parseLocalDate(new Date());
  const year = base.getFullYear();
  const month = base.getMonth();
  const day = base.getDate();

  if (day <= 15) {
    return {
      start: toIsoDate(new Date(year, month, 1)),
      end: toIsoDate(new Date(year, month, 15)),
    };
  }

  return {
    start: toIsoDate(new Date(year, month, 16)),
    end: toIsoDate(new Date(year, month + 1, 0)),
  };
}

function buildCommissionUnitKey(item: CommissionFeedItem): string {
  const enrollmentId = String(item.enrollmentId || '').trim();
  if (enrollmentId) {
    return `enrollment:${enrollmentId}`;
  }

  const memberId = String(item.memberId || '').trim();
  if (memberId) {
    return `member:${memberId}`;
  }

  return `source:${String(item.id || '').trim()}`;
}

function isPayableLedgerStatus(status: string): status is LedgerStatus {
  return PAYABLE_LEDGER_STATUSES.includes(String(status || '').toLowerCase() as LedgerStatus);
}

function normalizeLedgerStatus(status: unknown): LedgerStatus {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'queued') return 'queued';
  if (normalized === 'paid') return 'paid';
  if (normalized === 'held') return 'held';
  if (normalized === 'reversed') return 'reversed';
  if (normalized === 'carry_forward') return 'carry_forward';
  return 'earned';
}

function isEligibleUnpaidStatus(status: unknown): boolean {
  const normalized = normalizeLedgerStatus(status);
  return normalized === 'earned' || normalized === 'carry_forward';
}

export function calculateBatchHeaderTotals(rows: Array<{ agent_id?: string | null; commission_amount?: number; status?: string }>): {
  totalAmount: number;
  totalRecords: number;
  totalAgents: number;
} {
  const payableRows = filterPayableBatchRows(rows || []);
  const totalAmountCents = payableRows.reduce((sum: number, row: any) => sum + toMoneyCents(row.commission_amount), 0);
  const totalRecords = payableRows.length;
  const totalAgents = new Set(payableRows.map((row: any) => String(row.agent_id || 'unknown'))).size;
  return {
    totalAmount: totalAmountCents / 100,
    totalRecords,
    totalAgents: totalRecords > 0 ? totalAgents : 0,
  };
}

export function shouldCarryForwardAgent(agentNetPayableTotal: number, minimumThreshold = MIN_AGENT_PAYOUT_THRESHOLD): boolean {
  return Number(agentNetPayableTotal || 0) < Number(minimumThreshold || MIN_AGENT_PAYOUT_THRESHOLD);
}

function filterPayableBatchRows<T extends { status?: string }>(rows: T[]): T[] {
  return (Array.isArray(rows) ? rows : []).filter((row) => isPayableLedgerStatus(String(row?.status || '')));
}

export function getPayableRowsForBatchOperations<T extends { status?: string }>(rows: T[]): T[] {
  return filterPayableBatchRows(rows);
}

export function getCancellationImpactedUnpaidRows<T extends { commission_period_start: string; commission_period_end: string }>(rows: T[], cancellationDate: string): T[] {
  const normalizedCancellationDate = formatLocalDate(cancellationDate);
  return (Array.isArray(rows) ? rows : []).filter((row: any) => {
    const periodStart = formatLocalDate(row.commission_period_start);
    const periodEnd = formatLocalDate(row.commission_period_end);
    const intersectsCurrentPeriod = periodStart <= normalizedCancellationDate && periodEnd >= normalizedCancellationDate;
    const isFuturePeriod = periodStart > normalizedCancellationDate;
    return intersectsCurrentPeriod || isFuturePeriod;
  });
}

export function buildCancellationReversalRows(paidRows: any[], cancellationDate: string, cancellationReason?: string | null): any[] {
  const normalizedCancellationDate = formatLocalDate(cancellationDate);
  return (Array.isArray(paidRows) ? paidRows : []).map((paid: any) => ({
    source_commission_id: null,
    parent_ledger_id: paid.id,
    agent_id: paid.agent_id,
    agent_name: paid.agent_name,
    writing_number: paid.writing_number,
    member_id: paid.member_id,
    member_name: paid.member_name,
    membership_tier: paid.membership_tier,
    coverage_type: paid.coverage_type,
    effective_date: normalizedCancellationDate,
    commission_period_start: String(paid.commission_period_start),
    commission_period_end: String(paid.commission_period_end),
    commission_amount: -Math.abs(Number(paid.commission_amount || 0)),
    commission_type: 'reversal',
    // Keep reversal rows payable in a later batch as separate negative line items.
    status: 'earned',
    payout_batch_id: null,
    cancellation_date: normalizedCancellationDate,
    cancellation_reason: cancellationReason || 'Cancellation reversal',
    notes: 'Auto-created reversal after cancellation (pending batch assignment)',
    metadata: {
      sourceLedgerId: paid.id,
      reason: cancellationReason || null,
      cancellationAdjustmentType: 'reversal',
    },
  }));
}

async function recalculateBatchTotals(batchId: string): Promise<void> {
  const { data: rows, error: rowsError } = await supabase
    .from('commission_ledger')
    .select('agent_id, commission_amount, status')
    .eq('payout_batch_id', batchId)
    .in('status', PAYABLE_LEDGER_STATUSES);

  if (rowsError) {
    throw new Error(`Failed to recalculate batch totals: ${rowsError.message}`);
  }

  const totals = calculateBatchHeaderTotals(rows || []);

  const { error: updateError } = await supabase
    .from('commission_payout_batches')
    .update({
      total_amount: totals.totalAmount,
      total_records: totals.totalRecords,
      total_agents: totals.totalAgents,
    })
    .eq('id', batchId);

  if (updateError) {
    throw new Error(`Failed to update recalculated batch totals: ${updateError.message}`);
  }
}

async function refreshOpenBatchTotals(): Promise<void> {
  const { data: openBatches, error } = await supabase
    .from('commission_payout_batches')
    .select('id')
    .in('status', ['draft', 'ready', 'exported']);

  if (error) {
    throw new Error(`Failed loading open payout batches for total refresh: ${error.message}`);
  }

  await Promise.all((openBatches || []).map((batch: any) => recalculateBatchTotals(String(batch.id))));
}

async function rebalanceOpenBatchThresholdAssignments(): Promise<void> {
  const { data: openBatches, error: openBatchesError } = await supabase
    .from('commission_payout_batches')
    .select('id')
    .in('status', ['draft', 'ready', 'exported']);

  if (openBatchesError) {
    throw new Error(`Failed loading open payout batches for threshold rebalance: ${openBatchesError.message}`);
  }

  const openBatchIds = (openBatches || []).map((row: any) => String(row.id || '')).filter(Boolean);
  if (openBatchIds.length === 0) {
    return;
  }

  const { data: rows, error: rowsError } = await supabase
    .from('commission_ledger')
    .select('id, agent_id, status, payout_batch_id, commission_amount')
    .in('payout_batch_id', openBatchIds)
    .in('status', ['queued', 'carry_forward']);

  if (rowsError) {
    throw new Error(`Failed loading ledger rows for threshold rebalance: ${rowsError.message}`);
  }

  const byBatchAgent = new Map<string, any[]>();
  for (const row of rows || []) {
    const batchId = String(row.payout_batch_id || '');
    const agentId = String(row.agent_id || 'unknown');
    if (!batchId) continue;
    const key = `${batchId}:${agentId}`;
    const existing = byBatchAgent.get(key) || [];
    existing.push(row);
    byBatchAgent.set(key, existing);
  }

  const touchedBatchIds = new Set<string>();

  for (const [groupKey, groupRows] of byBatchAgent) {
    const [batchId, agentId] = groupKey.split(':');
    const netPayableTotal = groupRows.reduce((sum: number, row: any) => sum + Number(row.commission_amount || 0), 0);
    const shouldCarryForward = shouldCarryForwardAgent(netPayableTotal);
    const targetStatus: LedgerStatus = shouldCarryForward ? 'carry_forward' : 'queued';

    const rowsToTransition = groupRows.filter((row: any) => normalizeLedgerStatus(row.status) !== targetStatus);
    if (rowsToTransition.length === 0) {
      continue;
    }

    const rowIds = rowsToTransition.map((row: any) => String(row.id));

    const { error: updateError } = await supabase
      .from('commission_ledger')
      .update({ status: targetStatus })
      .in('id', rowIds);

    if (updateError) {
      throw new Error(`Failed threshold rebalance for batch ${batchId} / agent ${agentId}: ${updateError.message}`);
    }

    await recordLedgerEvents(
      rowsToTransition.map((row: any) => ({
        ledger_id: row.id,
        event_type: 'status_transition',
        from_status: normalizeLedgerStatus(row.status),
        to_status: targetStatus,
        payout_batch_id: batchId,
        reason: shouldCarryForward
          ? `Open-batch threshold rebalance: net payable ${netPayableTotal.toFixed(2)} below minimum ${MIN_AGENT_PAYOUT_THRESHOLD.toFixed(2)}`
          : `Open-batch threshold rebalance: net payable ${netPayableTotal.toFixed(2)} meets minimum ${MIN_AGENT_PAYOUT_THRESHOLD.toFixed(2)}`,
        metadata: {
          thresholdMinimum: MIN_AGENT_PAYOUT_THRESHOLD,
          thresholdNetPayableTotal: netPayableTotal,
          rebalance: true,
        },
      }))
    );

    touchedBatchIds.add(batchId);
  }

  await Promise.all(Array.from(touchedBatchIds).map((batchId) => recalculateBatchTotals(batchId)));
}

async function getBatchHeaderTotalsFromRows(batchId: string): Promise<{ totalAmount: number; totalRecords: number; totalAgents: number }> {
  const { data: rows, error } = await supabase
    .from('commission_ledger')
    .select('agent_id, commission_amount, status')
    .eq('payout_batch_id', batchId)
    .in('status', PAYABLE_LEDGER_STATUSES);

  if (error) {
    throw new Error(`Failed loading batch rows for header validation: ${error.message}`);
  }

  return calculateBatchHeaderTotals(rows || []);
}

function formatHeaderMismatchError(action: string, batchId: string, stored: { totalAmount: number; totalRecords: number; totalAgents: number }, recalculated: { totalAmount: number; totalRecords: number; totalAgents: number }): string {
  return `Batch ${action} blocked for ${batchId}: batch header totals are out of sync with attached payable rows. Stored=${stored.totalAmount}/${stored.totalRecords}/${stored.totalAgents}, Recalculated=${recalculated.totalAmount}/${recalculated.totalRecords}/${recalculated.totalAgents}. Regenerate or refresh batch totals before proceeding.`;
}

async function assertBatchHeaderTotalsMatch(batchId: string, action: 'export' | 'mark-paid' | 'manual-release'): Promise<void> {
  const { data: batch, error: batchError } = await supabase
    .from('commission_payout_batches')
    .select('id, total_amount, total_records, total_agents')
    .eq('id', batchId)
    .single();

  if (batchError) {
    throw new Error(`Failed loading payout batch header for ${action}: ${batchError.message}`);
  }

  const recalculated = await getBatchHeaderTotalsFromRows(batchId);
  const stored = {
    totalAmount: Number(batch.total_amount || 0),
    totalRecords: Number(batch.total_records || 0),
    totalAgents: Number(batch.total_agents || 0),
  };

  const amountMismatch = toMoneyCents(stored.totalAmount) !== toMoneyCents(recalculated.totalAmount);
  const recordsMismatch = stored.totalRecords !== recalculated.totalRecords;
  const agentsMismatch = stored.totalAgents !== recalculated.totalAgents;

  if (amountMismatch || recordsMismatch || agentsMismatch) {
    throw new Error(formatHeaderMismatchError(action, batchId, stored, recalculated));
  }
}

function getRecurringPeriods(startAt: Date, endAt: Date): Array<{ start: string; end: string }> {
  const periods: Array<{ start: string; end: string }> = [];
  let cursor = dateOnly(startAt);
  const end = dateOnly(endAt);

  while (cursor.getTime() <= end.getTime()) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const day = cursor.getDate();
    const period = day <= 15
      ? {
        start: toIsoDate(new Date(year, month, 1)),
        end: toIsoDate(new Date(year, month, 15)),
      }
      : {
        start: toIsoDate(new Date(year, month, 16)),
        end: toIsoDate(new Date(year, month + 1, 0)),
      };

    const key = `${period.start}|${period.end}`;
    if (!periods.some((item) => `${item.start}|${item.end}` === key)) {
      periods.push(period);
    }

    const nextCursor = day <= 15
      ? new Date(year, month, 16)
      : new Date(year, month + 1, 1);
    cursor = dateOnly(nextCursor);
  }

  return periods;
}

function buildStatementNumber(batchId: string, writingNumber?: string | null, agentId?: string | null): string {
  return `ACS-${String(batchId).slice(0, 8)}-${String(writingNumber || agentId || 'AGENT').replace(/[^A-Za-z0-9]/g, '')}`;
}

async function recordLedgerEvents(events: any[]): Promise<void> {
  if (!Array.isArray(events) || events.length === 0) {
    return;
  }

  const { error } = await supabase
    .from('commission_ledger_events')
    .insert(events);

  if (error) {
    throw new Error(`Failed to record commission ledger events: ${error.message}`);
  }
}

async function ensureBatchStatementNumbers(batchId: string): Promise<void> {
  const { data: rows, error } = await supabase
    .from('commission_ledger')
    .select('id, statement_number, writing_number, agent_id')
    .eq('payout_batch_id', batchId);

  if (error) {
    throw new Error(`Failed to load batch rows for statement numbering: ${error.message}`);
  }

  const updates = (rows || []).filter((row: any) => !row.statement_number);

  await Promise.all(
    updates.map(async (row: any) => {
      const statementNumber = buildStatementNumber(batchId, row.writing_number, row.agent_id);
      const { error: updateError } = await supabase
        .from('commission_ledger')
        .update({ statement_number: statementNumber })
        .eq('id', row.id);

      if (updateError) {
        throw new Error(`Failed to assign statement number for ledger row ${row.id}: ${updateError.message}`);
      }

      await recordLedgerEvents([
        {
          ledger_id: row.id,
          event_type: 'statement_assigned',
          reason: 'Assigned before export/paid transition',
          metadata: { statementNumber, batchId },
        },
      ]);
    })
  );
}

async function getLatestPaidBatchCutoffDate(): Promise<string | null> {
  const { data, error } = await supabase
    .from('commission_payout_batches')
    .select('cutoff_date')
    .eq('status', 'paid')
    .order('cutoff_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load latest paid batch cutoff date: ${error.message}`);
  }

  return data?.cutoff_date || null;
}

export async function syncCommissionLedgerFromFeed(feed: CommissionFeedItem[]): Promise<{ inserted: number; skipped: number; newlyEligible: number }> {
  const commissions = Array.isArray(feed) ? feed : [];
  if (commissions.length === 0) {
    return { inserted: 0, skipped: 0, newlyEligible: 0 };
  }

  const sourceIds = commissions.map((c) => c.id).filter(Boolean);
  const memberIds = [...new Set(commissions.map((c) => String(c.memberId || '')).filter(Boolean))];
  const agentIds = [...new Set(commissions.map((c) => String(c.agentId || '')).filter(Boolean))];
  const [latestPaidCutoff, existingResult, memberHistoryResult, cancellationsResult] = await Promise.all([
    getLatestPaidBatchCutoffDate(),
    supabase
      .from('commission_ledger')
      .select('source_commission_id, commission_period_start, commission_period_end, member_id, agent_id')
      .in('source_commission_id', sourceIds),
    memberIds.length > 0 && agentIds.length > 0
      ? supabase
        .from('commission_ledger')
        .select('member_id, agent_id')
        .in('member_id', memberIds)
        .in('agent_id', agentIds)
      : Promise.resolve({ data: [], error: null } as any),
    memberIds.length > 0
      ? supabase
        .from('commission_cancellation_events')
      .select('member_id, cancellation_date, cancellation_reason')
        .in('member_id', memberIds)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (existingResult.error) {
    throw new Error(`Failed to inspect existing ledger records: ${existingResult.error.message}`);
  }

  if (memberHistoryResult.error) {
    throw new Error(`Failed to inspect prior member/agent ledger history: ${memberHistoryResult.error.message}`);
  }

  if (cancellationsResult.error) {
    throw new Error(`Failed to inspect cancellation events for ledger sync: ${cancellationsResult.error.message}`);
  }

  const existingBySourcePeriod = new Set(
    (existingResult.data || []).map((row: any) => `${row.source_commission_id}|${row.commission_period_start}|${row.commission_period_end}`)
  );
  const memberAgentSeen = new Set((memberHistoryResult.data || []).map((r: any) => `${r.agent_id || ''}:${r.member_id || ''}`));
  const cancellationByMember = new Map<string, { date: string; reason: string | null }>();

  for (const row of (cancellationsResult.data || [])) {
    if (!row?.member_id || !row?.cancellation_date) continue;
    const key = String(row.member_id);
    const existing = cancellationByMember.get(key);
    if (!existing || dateOnly(row.cancellation_date).getTime() < dateOnly(existing.date).getTime()) {
      cancellationByMember.set(key, {
        date: row.cancellation_date,
        reason: row.cancellation_reason || null,
      });
    }
  }

  const rowsToInsert: any[] = [];
  const eventPayloads: any[] = [];
  const incomingUnitPeriodSeen = new Set<string>();
  let skipped = 0;

  for (const item of commissions) {
    if (!item.id) {
      skipped += 1;
      continue;
    }

    const periodSeed = normalizePeriodFromDate(item.effectiveDate || item.createdAt);
    const rangeStart = dateOnly(periodSeed.start);
    const rangeEnd = dateOnly(new Date());
    const memberKey = String(item.memberId || '');
    const cancellationInfo = memberKey ? cancellationByMember.get(memberKey) : undefined;
    const cancellationDate = cancellationInfo?.date;

    const periods = getRecurringPeriods(rangeStart, rangeEnd);
    const memberAgentKey = `${item.agentId || ''}:${item.memberId || ''}`;
    const commissionUnitKey = buildCommissionUnitKey(item);
    const hasPriorForMember = memberAgentSeen.has(memberAgentKey);

    periods.forEach((period, index) => {
      const dedupeKey = `${item.id}|${period.start}|${period.end}`;
      if (existingBySourcePeriod.has(dedupeKey)) {
        skipped += 1;
        return;
      }

      const unitPeriodDedupeKey = `${String(item.agentId || '')}|${commissionUnitKey}|${period.start}|${period.end}`;
      if (incomingUnitPeriodSeen.has(unitPeriodDedupeKey)) {
        skipped += 1;
        return;
      }

      if (cancellationDate && dateOnly(period.start).getTime() > dateOnly(cancellationDate).getTime()) {
        skipped += 1;
        return;
      }

      const intersectsCancellation = Boolean(
        cancellationDate
        && dateOnly(period.start).getTime() <= dateOnly(cancellationDate).getTime()
        && dateOnly(period.end).getTime() >= dateOnly(cancellationDate).getTime()
      );

      const firstRowForItem = index === 0;
      const commissionType = firstRowForItem
        ? deriveCommissionType(item, hasPriorForMember)
        : 'renewal';

      const paidFromFeed = item.paymentStatus === 'paid' && firstRowForItem;
      const rowStatus: LedgerStatus = intersectsCancellation && !paidFromFeed
        ? 'held'
        : (paidFromFeed ? 'paid' : 'earned');

      const row = {
        source_commission_id: item.id,
        agent_id: item.agentId || null,
        agent_name: item.agentName || 'Unknown Agent',
        writing_number: item.agentNumber || null,
        member_id: item.memberId || null,
        member_name: item.memberName || item.userName || 'Unknown Member',
        membership_tier: item.planTier || null,
        coverage_type: item.coverageType || null,
        effective_date: item.effectiveDate ? toIsoDate(new Date(item.effectiveDate)) : period.start,
        commission_period_start: period.start,
        commission_period_end: period.end,
        commission_amount: Number(item.commissionAmount || 0),
        commission_type: commissionType,
        status: rowStatus,
        cancellation_date: intersectsCancellation ? cancellationDate : null,
        cancellation_reason: intersectsCancellation ? (cancellationInfo?.reason || null) : null,
        notes: item.notes || null,
        metadata: {
          importedAt: new Date().toISOString(),
          recurringSync: true,
          cancellationIntersected: intersectsCancellation,
          commissionUnitKey,
          enrollmentId: item.enrollmentId || null,
        },
      };

      rowsToInsert.push(row);
      existingBySourcePeriod.add(dedupeKey);
      incomingUnitPeriodSeen.add(unitPeriodDedupeKey);
    });

    memberAgentSeen.add(memberAgentKey);
  }

  if (rowsToInsert.length === 0) {
    return { inserted: 0, skipped, newlyEligible: 0 };
  }

  const { data: insertedRows, error: insertError } = await supabase
    .from('commission_ledger')
    .insert(rowsToInsert)
    .select('id, source_commission_id, commission_period_end, status');

  if (insertError) {
    throw new Error(`Failed to insert commission ledger records: ${insertError.message}`);
  }

  for (const row of (insertedRows || [])) {
    eventPayloads.push({
      ledger_id: row.id,
      event_type: 'ledger_created',
      to_status: row.status,
      reason: 'Recurring ledger sync',
      metadata: {
        sourceCommissionId: row.source_commission_id,
        commissionPeriodEnd: row.commission_period_end,
      },
    });
  }

  await recordLedgerEvents(eventPayloads);

  const nowIso = toIsoDate(new Date());
  const newlyEligible = (insertedRows || []).filter((row: any) => {
    const periodEnd = String(row.commission_period_end || '');
    if (!periodEnd || periodEnd > nowIso) {
      return false;
    }
    if (!latestPaidCutoff) {
      return true;
    }
    return periodEnd > latestPaidCutoff;
  }).length;

  return { inserted: rowsToInsert.length, skipped, newlyEligible };
}

export async function buildDraftPayoutBatches(cutoffDateRaw?: string): Promise<any[]> {
  const cutoffDate = cutoffDateRaw ? dateOnly(cutoffDateRaw) : dateOnly(new Date());

  const { data: ledgerRows, error: ledgerError } = await supabase
    .from('commission_ledger')
    .select('*')
    .is('payout_batch_id', null)
    .in('status', ['earned', 'carry_forward'])
    .order('commission_period_end', { ascending: true });

  if (ledgerError) {
    throw new Error(`Failed to load eligible ledger records: ${ledgerError.message}`);
  }

  const eligible = (ledgerRows || []).filter((row: any) => {
    if (row.cancellation_date && parseLocalDate(row.cancellation_date).getTime() <= parseLocalDate(row.commission_period_end).getTime()) {
      return false;
    }
    const cycle = getCycleAnchorForEntry(parseLocalDate(row.commission_period_end));
    return cycle.anchorDate <= cutoffDate;
  });

  const grouped = new Map<string, any[]>();
  for (const row of eligible) {
    const cycle = getCycleAnchorForEntry(parseLocalDate(row.commission_period_end));
    const key = `${cycle.batchType}:${toIsoDate(cycle.anchorDate)}`;
    const items = grouped.get(key) || [];
    items.push({ ...row, __cycle: cycle });
    grouped.set(key, items);
  }

  const createdBatches: any[] = [];

  for (const [key, items] of grouped) {
    const [batchType, cutoffDateString] = key.split(':');
    const scheduledPayDate = firstFridayOnOrAfter(new Date(cutoffDateString));
    const batchName = `Commission ${batchType} ${cutoffDateString}`;

    const { data: existingBatch, error: existingBatchError } = await supabase
      .from('commission_payout_batches')
      .select('*')
      .eq('batch_type', batchType)
      .eq('cutoff_date', cutoffDateString)
      .in('status', ['draft', 'ready', 'exported'])
      .maybeSingle();

    if (existingBatchError) {
      throw new Error(`Failed to check existing payout batch: ${existingBatchError.message}`);
    }

    let batch = existingBatch;

    if (!batch) {
      const { data: created, error: createError } = await supabase
        .from('commission_payout_batches')
        .insert({
          batch_name: batchName,
          batch_type: batchType,
          cutoff_date: cutoffDateString,
          scheduled_pay_date: toIsoDate(scheduledPayDate),
          status: 'draft',
        })
        .select('*')
        .single();

      if (createError) {
        throw new Error(`Failed to create payout batch: ${createError.message}`);
      }
      batch = created;
    }

    const eligibleItems = items.filter((row: any) => isEligibleUnpaidStatus(row.status));
    const byAgent = new Map<string, any[]>();
    for (const row of eligibleItems) {
      const key = String(row.agent_id || 'unknown');
      const existing = byAgent.get(key) || [];
      existing.push(row);
      byAgent.set(key, existing);
    }

    for (const [agentKey, agentRows] of byAgent) {
      const netPayableTotal = agentRows.reduce((sum: number, row: any) => sum + Number(row.commission_amount || 0), 0);
      const shouldCarryForward = shouldCarryForwardAgent(netPayableTotal);
      const targetStatus: LedgerStatus = shouldCarryForward ? 'carry_forward' : 'queued';
      const targetBatchId = batch.id;

      const rowIds = agentRows.map((row: any) => row.id);
      const { error: transitionError } = await supabase
        .from('commission_ledger')
        .update({
          status: targetStatus,
          payout_batch_id: targetBatchId,
        })
        .in('id', rowIds);

      if (transitionError) {
        throw new Error(`Failed applying payout threshold transition for agent ${agentKey}: ${transitionError.message}`);
      }

      await recordLedgerEvents(
        rowIds.map((ledgerId: string) => ({
          ledger_id: ledgerId,
          event_type: shouldCarryForward ? 'threshold_carry_forward' : 'batch_assigned',
          from_status: normalizeLedgerStatus(agentRows.find((r: any) => r.id === ledgerId)?.status),
          to_status: targetStatus,
          payout_batch_id: targetBatchId,
          reason: shouldCarryForward
            ? `Net payable ${netPayableTotal.toFixed(2)} below minimum ${MIN_AGENT_PAYOUT_THRESHOLD.toFixed(2)}; carry forward`
            : `Auto-grouped into ${batchName}`,
          metadata: {
            thresholdMinimum: MIN_AGENT_PAYOUT_THRESHOLD,
            thresholdNetPayableTotal: netPayableTotal,
          },
        }))
      );
    }

    await recalculateBatchTotals(batch.id);

    const { data: refreshedBatch, error: refreshedBatchError } = await supabase
      .from('commission_payout_batches')
      .select('*')
      .eq('id', batch.id)
      .single();

    if (refreshedBatchError) {
      throw new Error(`Failed loading refreshed payout batch totals: ${refreshedBatchError.message}`);
    }

    createdBatches.push(refreshedBatch);
  }

  await rebalanceOpenBatchThresholdAssignments();
  await refreshOpenBatchTotals();

  return createdBatches;
}

export async function getPayoutDashboardData(): Promise<any> {
  const now = new Date();
  const nextFirst = getNextPayoutDate('1st-cycle', now);
  const nextFifteenth = getNextPayoutDate('15th-cycle', now);
  const nextPayoutDate = nextFirst < nextFifteenth ? nextFirst : nextFifteenth;

  const { data: draftBatches, error: batchError } = await supabase
    .from('commission_payout_batches')
    .select('*')
    .in('status', ['draft', 'ready', 'exported'])
    .order('scheduled_pay_date', { ascending: true });

  if (batchError) {
    throw new Error(`Failed to load payout batches: ${batchError.message}`);
  }

  const draftBatchIds = (draftBatches || []).map((b: any) => b.id);
  let ledgerRows: any[] = [];

  if (draftBatchIds.length > 0) {
    const { data, error } = await supabase
      .from('commission_ledger')
      .select('*')
      .in('payout_batch_id', draftBatchIds);

    if (error) {
      throw new Error(`Failed to load draft ledger rows: ${error.message}`);
    }
    ledgerRows = data || [];
  }

  ledgerRows = filterPayableBatchRows(ledgerRows);

  const { data: cancellationRows, error: cancellationRowsError } = await supabase
    .from('commission_ledger')
    .select('id, status, commission_type, commission_amount, cancellation_date, cancellation_reason, payout_batch_id')
    .or('cancellation_date.not.is.null,commission_type.eq.reversal')
    .order('created_at', { ascending: false })
    .limit(500);

  if (cancellationRowsError) {
    throw new Error(`Failed to load cancellation ledger rows for dashboard: ${cancellationRowsError.message}`);
  }

  const cancellationSummaryRows = cancellationRows || [];
  const heldRows = cancellationSummaryRows.filter((row: any) => String(row.status || '').toLowerCase() === 'held');
  const pendingReversalRows = cancellationSummaryRows.filter((row: any) => {
    const normalizedStatus = String(row.status || '').toLowerCase();
    const normalizedType = String(row.commission_type || '').toLowerCase();
    return normalizedType === 'reversal' && (normalizedStatus === 'earned' || normalizedStatus === 'queued' || normalizedStatus === 'carry_forward');
  });
  const paidReversalRows = cancellationSummaryRows.filter((row: any) => {
    const normalizedStatus = String(row.status || '').toLowerCase();
    const normalizedType = String(row.commission_type || '').toLowerCase();
    return normalizedType === 'reversal' && normalizedStatus === 'paid';
  });

  const totalPayableAmount = ledgerRows.reduce((sum, row) => sum + Number(row.commission_amount || 0), 0);
  const agentCount = new Set(ledgerRows.map((row) => String(row.agent_id || 'unknown'))).size;

  const countByType = {
    new: ledgerRows.filter((row) => row.commission_type === 'new').length,
    renewal: ledgerRows.filter((row) => row.commission_type === 'renewal').length,
    adjustmentOrReversal: ledgerRows.filter((row) => row.commission_type === 'adjustment' || row.commission_type === 'reversal').length,
    cancellations: ledgerRows.filter((row) => !!row.cancellation_date || row.status === 'reversed' || row.commission_type === 'reversal').length,
  };

  return {
    nextPayoutDate: toIsoDate(nextPayoutDate),
    draftBatches: draftBatches || [],
    totalPayableAmount,
    totalAgents: agentCount,
    counts: countByType,
    cancellations: {
      heldCount: heldRows.length,
      heldAmount: heldRows.reduce((sum: number, row: any) => sum + Number(row.commission_amount || 0), 0),
      pendingReversalCount: pendingReversalRows.length,
      pendingReversalAmount: pendingReversalRows.reduce((sum: number, row: any) => sum + Number(row.commission_amount || 0), 0),
      paidReversalCount: paidReversalRows.length,
      paidReversalAmount: paidReversalRows.reduce((sum: number, row: any) => sum + Number(row.commission_amount || 0), 0),
    },
  };
}

export async function getBatchDetails(batchId: string): Promise<any> {
  const { data: batch, error: batchError } = await supabase
    .from('commission_payout_batches')
    .select('*')
    .eq('id', batchId)
    .single();

  if (batchError) {
    throw new Error(`Failed to load payout batch: ${batchError.message}`);
  }

  const { data: rows, error: rowsError } = await supabase
    .from('commission_ledger')
    .select('*')
    .eq('payout_batch_id', batchId)
    .in('status', PAYABLE_LEDGER_STATUSES)
    .order('agent_name', { ascending: true })
    .order('member_name', { ascending: true });

  if (rowsError) {
    throw new Error(`Failed to load ledger rows for batch: ${rowsError.message}`);
  }

  const byAgent = new Map<string, any[]>();
  for (const row of rows || []) {
    const key = String(row.agent_id || row.agent_name || 'unknown');
    const items = byAgent.get(key) || [];
    items.push(row);
    byAgent.set(key, items);
  }

  return {
    batch,
    rows: rows || [],
    byAgent: Array.from(byAgent.values()).map((items) => ({
      agentId: items[0].agent_id,
      agentName: items[0].agent_name,
      writingNumber: items[0].writing_number,
      totalAmount: items.reduce((sum, row) => sum + Number(row.commission_amount || 0), 0),
      items,
    })),
  };
}

export function buildQuickBooksCsvFromBatch(batch: any, rows: any[]): string {
  const csvEscape = (value: any) => {
    const text = value === null || value === undefined ? '' : String(value);
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const payableRows = filterPayableBatchRows(rows || []);

  const grouped = new Map<string, any[]>();
  for (const row of payableRows) {
    const key = String(row.agent_id || row.agent_name || 'unknown');
    const existing = grouped.get(key) || [];
    existing.push(row);
    grouped.set(key, existing);
  }

  const output: string[][] = [[
    'bill_number',
    'supplier_vendor_name',
    'bill_date',
    'due_date',
    'expense_account',
    'description',
    'line_amount',
    'reference_memo',
  ]];

  for (const [, items] of grouped) {
    const seed = items[0];
    const vendor = seed.agent_name || 'Unknown Agent';
    const writing = seed.writing_number || 'NA';
    const billNumber = `QB-${String(batch.id).slice(0, 8)}-${String(writing).replace(/[^A-Za-z0-9]/g, '')}`;

    for (const row of items) {
      output.push([
        billNumber,
        vendor,
        batch.cutoff_date,
        batch.scheduled_pay_date,
        'Commissions Expense',
        `${row.member_name || 'Member'} | ${row.membership_tier || 'Membership'} | ${row.coverage_type || ''}`,
        Number(row.commission_amount || 0).toFixed(2),
        `Batch ${batch.id} | Statement ${row.statement_number || ''}`,
      ]);
    }
  }

  return output.map((row) => row.map(csvEscape).join(',')).join('\n');
}

export function buildHexonaCsvFromBatch(batch: any, rows: any[]): string {
  const csvEscape = (value: any) => {
    const text = value === null || value === undefined ? '' : String(value);
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const output: string[][] = [[
    'agent_name',
    'writing_number',
    'payout_period',
    'member_name',
    'membership_tier',
    'commission_amount',
    'statement_number',
    'batch_id',
    'commission_type',
    'status',
  ]];

  const payoutPeriod = `${batch.cutoff_date} -> ${batch.scheduled_pay_date}`;

  const payableRows = filterPayableBatchRows(rows || []);

  for (const row of payableRows) {
    output.push([
      row.agent_name || '',
      row.writing_number || '',
      payoutPeriod,
      row.member_name || '',
      row.membership_tier || '',
      Number(row.commission_amount || 0).toFixed(2),
      row.statement_number || '',
      batch.id,
      row.commission_type || '',
      row.status || '',
    ]);
  }

  return output.map((row) => row.map(csvEscape).join(',')).join('\n');
}

export async function prepareBatchForExport(batchId: string, format: 'quickbooks-csv' | 'hexona-csv'): Promise<void> {
  await assertBatchHeaderTotalsMatch(batchId, 'export');
  await ensureBatchStatementNumbers(batchId);

  const { data: rows, error } = await supabase
    .from('commission_ledger')
    .select('id, statement_number')
    .eq('payout_batch_id', batchId)
    .in('status', PAYABLE_LEDGER_STATUSES);

  if (error) {
    throw new Error(`Failed to verify statement references before export: ${error.message}`);
  }

  const missing = (rows || []).filter((row: any) => !row.statement_number);
  if (missing.length > 0) {
    const ids = missing.slice(0, 10).map((row: any) => row.id).join(', ');
    throw new Error(`Batch export blocked: missing statement references for ledger rows: ${ids}`);
  }

  await recordLedgerEvents(
    (rows || []).map((row: any) => ({
      ledger_id: row.id,
      event_type: 'batch_exported',
      payout_batch_id: batchId,
      reason: `${format} export`,
      metadata: { format },
    }))
  );
}

export async function markBatchAsPaid(batchId: string): Promise<void> {
  await assertBatchHeaderTotalsMatch(batchId, 'mark-paid');

  const { data: batch, error: batchError } = await supabase
    .from('commission_payout_batches')
    .select('id, status')
    .eq('id', batchId)
    .single();

  if (batchError) {
    throw new Error(`Failed to load payout batch before paid transition: ${batchError.message}`);
  }

  if (!['ready', 'exported'].includes(String(batch?.status || ''))) {
    throw new Error(`Invalid batch state for paid transition: ${batch?.status || 'unknown'}. Batch must be ready or exported.`);
  }

  const { data: rows, error: rowsError } = await supabase
    .from('commission_ledger')
    .select('id, status, agent_id, writing_number, statement_number')
    .eq('payout_batch_id', batchId);

  if (rowsError) {
    throw new Error(`Failed to load payout batch ledger rows: ${rowsError.message}`);
  }

  const nonPayableRows = (rows || []).filter((row: any) => !isPayableLedgerStatus(String(row.status || '')));
  if (nonPayableRows.length > 0) {
    const detachedIds = nonPayableRows.map((row: any) => row.id);
    const { error: detachError } = await supabase
      .from('commission_ledger')
      .update({ payout_batch_id: null })
      .in('id', detachedIds);

    if (detachError) {
      throw new Error(`Failed detaching non-payable rows before paid transition: ${detachError.message}`);
    }

    await recordLedgerEvents(
      nonPayableRows.map((row: any) => ({
        ledger_id: row.id,
        event_type: 'batch_detached_nonpayable',
        from_status: row.status,
        to_status: row.status,
        payout_batch_id: batchId,
        reason: 'Detached from payout batch during paid transition guard',
      }))
    );

    await recalculateBatchTotals(batchId);
  }

  const payableRows = (rows || []).filter((row: any) => row.status === 'queued');
  if (payableRows.length === 0) {
    throw new Error('No queued ledger rows found for this batch');
  }

  const payableIds = payableRows.map((row: any) => row.id);

  await Promise.all(
    payableRows.map(async (row: any) => {
      if (row.statement_number) {
        return;
      }
      const statementNumber = buildStatementNumber(batchId, row.writing_number, row.agent_id);
      await supabase
        .from('commission_ledger')
        .update({ statement_number: statementNumber })
        .eq('id', row.id);

      await recordLedgerEvents([
        {
          ledger_id: row.id,
          event_type: 'statement_assigned',
          from_status: 'queued',
          to_status: 'queued',
          payout_batch_id: batchId,
          reason: 'Assigned before paid transition',
          metadata: { statementNumber },
        },
      ]);
    })
  );

  const { error: ledgerUpdateError } = await supabase
    .from('commission_ledger')
    .update({ status: 'paid' as LedgerStatus })
    .in('id', payableIds)
    .neq('status', 'paid');

  if (ledgerUpdateError) {
    throw new Error(`Failed to mark ledger rows as paid: ${ledgerUpdateError.message}`);
  }

  await recordLedgerEvents(
    payableIds.map((ledgerId: string) => ({
      ledger_id: ledgerId,
      event_type: 'status_transition',
      from_status: 'queued',
      to_status: 'paid',
      payout_batch_id: batchId,
      reason: 'Batch marked as paid',
    }))
  );

  const { error: batchUpdateError } = await supabase
    .from('commission_payout_batches')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
    })
    .eq('id', batchId)
    .neq('status', 'paid');

  if (batchUpdateError) {
    throw new Error(`Failed to mark payout batch as paid: ${batchUpdateError.message}`);
  }

  await recalculateBatchTotals(batchId);
}

export async function adminOverrideCarryForwardForBatch(
  batchIdInput: string,
  input: {
    agentId?: string | null;
    actorUserId?: string | null;
    actorRole?: string | null;
    reason?: string | null;
  }
): Promise<{
  releasedRows: number;
  batchId: string;
  agentCount: number;
  affectedAgentId: string | null;
  currentCarryForwardTotal: number;
  resultingPayoutAmount: number;
}> {
  const batchId = String(batchIdInput || '').trim();
  const selectedAgentId = String(input?.agentId || '').trim() || null;
  const reason = String(input?.reason || '').trim();

  if (!batchId) {
    throw new Error('batchId is required');
  }

  if (!reason) {
    throw new Error('Override reason is required');
  }

  const { data: batch, error: batchError } = await supabase
    .from('commission_payout_batches')
    .select('id, cutoff_date, status')
    .eq('id', batchId)
    .single();

  if (batchError) {
    throw new Error(`Failed loading payout batch for override: ${batchError.message}`);
  }

  if (!['draft', 'ready', 'exported'].includes(String(batch.status || ''))) {
    throw new Error(`Cannot override below-minimum rows for batch status ${batch.status}`);
  }

  await assertBatchHeaderTotalsMatch(batchId, 'manual-release');

  let carryForwardQuery = supabase
    .from('commission_ledger')
    .select('id, status, agent_id, commission_amount')
    .eq('payout_batch_id', batchId)
    .eq('status', 'carry_forward');

  if (selectedAgentId) {
    carryForwardQuery = carryForwardQuery.eq('agent_id', selectedAgentId);
  }

  const { data: rows, error: rowsError } = await carryForwardQuery.order('agent_id', { ascending: true });

  if (rowsError) {
    throw new Error(`Failed loading carry-forward rows for override: ${rowsError.message}`);
  }

  const rowIds = (rows || []).map((row: any) => row.id);
  if (rowIds.length === 0) {
    return {
      releasedRows: 0,
      batchId,
      agentCount: 0,
      affectedAgentId: selectedAgentId,
      currentCarryForwardTotal: 0,
      resultingPayoutAmount: 0,
    };
  }

  const agentCount = new Set((rows || []).map((row: any) => String(row.agent_id || 'unknown'))).size;
  const currentCarryForwardTotal = (rows || []).reduce((sum: number, row: any) => sum + Number(row.commission_amount || 0), 0);

  let resultingPayoutAmount = currentCarryForwardTotal;
  if (selectedAgentId) {
    const { data: existingPayableRows, error: payableRowsError } = await supabase
      .from('commission_ledger')
      .select('commission_amount')
      .eq('payout_batch_id', batchId)
      .eq('agent_id', selectedAgentId)
      .in('status', PAYABLE_LEDGER_STATUSES);

    if (payableRowsError) {
      throw new Error(`Failed loading existing payable rows for override: ${payableRowsError.message}`);
    }

    const existingPayableTotal = (existingPayableRows || []).reduce((sum: number, row: any) => sum + Number(row.commission_amount || 0), 0);
    resultingPayoutAmount = existingPayableTotal + currentCarryForwardTotal;
  }

  const { error: updateError } = await supabase
    .from('commission_ledger')
    .update({
      status: 'queued',
      payout_batch_id: batchId,
    })
    .in('id', rowIds)
    .eq('status', 'carry_forward');

  if (updateError) {
    throw new Error(`Failed applying admin carry-forward override: ${updateError.message}`);
  }

  await recordLedgerEvents(
    rowIds.map((ledgerId: string) => ({
      ledger_id: ledgerId,
      event_type: 'manual_under_minimum_release',
      from_status: 'carry_forward',
      to_status: 'queued',
      payout_batch_id: batchId,
      actor_id: input?.actorUserId || null,
      reason,
      metadata: {
        actionType: 'manual_under_minimum_release',
        overrideType: 'below_minimum_threshold',
        actorRole: input?.actorRole || null,
        actorUserId: input?.actorUserId || null,
        timestamp: new Date().toISOString(),
        affectedAgentId: selectedAgentId,
        affectedLedgerRowIds: rowIds,
        affectedBatchId: batchId,
        currentCarryForwardTotal,
        resultingPayoutAmount,
      },
    }))
  );

  await recalculateBatchTotals(batchId);
  await assertBatchHeaderTotalsMatch(batchId, 'manual-release');

  return {
    releasedRows: rowIds.length,
    batchId,
    agentCount,
    affectedAgentId: selectedAgentId,
    currentCarryForwardTotal,
    resultingPayoutAmount,
  };
}

export async function applyCancellationToLedger(input: {
  memberId: string;
  cancellationDate: string;
  cancellationReason?: string;
  createReversalForPaid?: boolean;
}): Promise<{ heldCount: number; reversalCount: number }> {
  const memberId = String(input.memberId);
  const cancellationDate = toIsoDate(new Date(input.cancellationDate));

  const { error: cancelAuditError } = await supabase
    .from('commission_cancellation_events')
    .insert({
      member_id: memberId,
      cancellation_date: cancellationDate,
      cancellation_reason: input.cancellationReason || null,
      source: 'admin-workflow',
    });

  if (cancelAuditError) {
    throw new Error(`Failed to create cancellation audit event: ${cancelAuditError.message}`);
  }

  const { data: unpaidRows, error: unpaidRowsError } = await supabase
    .from('commission_ledger')
    .select('*')
    .eq('member_id', memberId)
    .in('status', ['earned', 'queued', 'carry_forward'])
    .order('commission_period_start', { ascending: true });

  if (unpaidRowsError) {
    throw new Error(`Failed to load unpaid ledger rows for cancellation: ${unpaidRowsError.message}`);
  }

  const impactedUnpaidRows = getCancellationImpactedUnpaidRows(unpaidRows || [], cancellationDate);

  const impactedIds = impactedUnpaidRows.map((row: any) => row.id);
  const detachedBatchIds = [...new Set(impactedUnpaidRows.map((row: any) => row.payout_batch_id).filter(Boolean))];
  if (impactedIds.length > 0) {
    const { error: holdError } = await supabase
      .from('commission_ledger')
      .update({
        status: 'held',
        payout_batch_id: null,
        cancellation_date: cancellationDate,
        cancellation_reason: input.cancellationReason || null,
      })
      .in('id', impactedIds)
      .in('status', ['earned', 'queued', 'carry_forward']);

    if (holdError) {
      throw new Error(`Failed to hold future ledger rows: ${holdError.message}`);
    }

    await recordLedgerEvents(
      impactedUnpaidRows.map((row: any) => ({
        ledger_id: row.id,
        event_type: 'status_transition',
        from_status: row.status,
        to_status: 'held',
        reason: 'Cancellation applied to unpaid commission row',
        metadata: {
          previousPayoutBatchId: row.payout_batch_id || null,
          cancellationDate,
          cancellationReason: input.cancellationReason || null,
        },
      }))
    );

    await Promise.all(detachedBatchIds.map((batchId) => recalculateBatchTotals(String(batchId))));
  }

  let reversalCount = 0;

  if (input.createReversalForPaid) {
    const { data: paidRows, error: paidRowsError } = await supabase
      .from('commission_ledger')
      .select('*')
      .eq('member_id', memberId)
      .eq('status', 'paid')
      .gte('commission_period_end', cancellationDate)
      .order('commission_period_end', { ascending: false });

    if (paidRowsError) {
      throw new Error(`Failed to inspect paid rows for cancellation reversal: ${paidRowsError.message}`);
    }

    if ((paidRows || []).length > 0) {
      const reversalRows = buildCancellationReversalRows(paidRows || [], cancellationDate, input.cancellationReason || null);

      const { data: createdReversals, error: reversalError } = await supabase
        .from('commission_ledger')
        .insert(reversalRows)
        .select('id, parent_ledger_id');

      if (reversalError) {
        throw new Error(`Failed to create cancellation reversal rows: ${reversalError.message}`);
      }

      reversalCount = (createdReversals || []).length;

      await recordLedgerEvents(
        (createdReversals || []).map((row: any) => ({
          ledger_id: row.id,
          event_type: 'reversal_created',
          reason: 'Cancellation reversal row created from previously paid record',
          metadata: {
            parentLedgerId: row.parent_ledger_id,
            cancellationDate,
            cancellationReason: input.cancellationReason || null,
          },
        }))
      );
    }
  }

  return {
    heldCount: impactedIds.length,
    reversalCount,
  };
}
