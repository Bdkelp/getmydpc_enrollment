import { supabase } from '../lib/supabaseClient.ts';
import { addDaysLocal, formatLocalDate, parseLocalDate } from '@shared/localDate';
import { getWritingCommissionPayDate, getOverridePayDate } from './commission-payout-schedule-service';
import { applyHistoricalExternalSettlement, getHistoricalCutover } from './historical-commission-external-settlement-service';

// Phase 2B: writing commissions (semi-monthly, 1st/15th) and overrides
// (monthly, in-arrears) are distinct compensation types that must never share
// a payout batch or a payout-date algorithm. `compensation_type` on both
// commission_ledger and commission_payout_batches is the explicit,
// queryable signal — batch classification is never inferred from dates
// alone. See docs/COMMISSION_LEDGER_PAYOUT_FLOW_PHASE2B_REPORT.md.
export type CompensationType = 'writing' | 'override';
type BatchType = 'writing_1st' | 'writing_15th' | 'override_monthly';
type LedgerStatus = 'earned' | 'queued' | 'paid' | 'held' | 'reversed' | 'carry_forward' | 'externally_settled';
type CommissionType = 'new' | 'renewal' | 'adjustment' | 'reversal';
export const PAYABLE_LEDGER_STATUSES: LedgerStatus[] = ['queued', 'paid'];
export const MIN_AGENT_PAYOUT_THRESHOLD = 25;

function toMoneyCents(value: unknown): number {
  return Math.round(Number(value || 0) * 100);
}

/**
 * Determine a row's compensation type. NULL/legacy rows (created before
 * Phase 2B, when only writing commissions were synced) default to
 * 'writing' rather than being reclassified or guessed at as anything else.
 */
export function compensationTypeOf(row: { compensation_type?: string | null }): CompensationType {
  return row?.compensation_type === 'override' ? 'override' : 'writing';
}

/** Maps a raw agent_commissions commission_type ('direct'/'override'/etc.) to the ledger's compensation type. */
function compensationTypeFromFeedItem(item: CommissionFeedItem): CompensationType {
  return item.commissionType === 'override' ? 'override' : 'writing';
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
  paymentCaptured?: boolean;
  lineageSnapshotId?: string;
  /** WP-03 compensation type ('direct' or 'override') — distinct from the ledger's own new/renewal/adjustment/reversal `commission_type`. */
  commissionType?: 'direct' | 'override';
  /** For override rows: which downline writing agent generated this override. */
  overrideForAgentId?: string | null;
  /** Phase 1 traceability FK — the exact payment that produced this commission, when known. */
  sourcePaymentId?: number | string | null;
}

export function normalizeCommissionLedgerAgentId(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

/**
 * The Phase 2B migration (scripts/sql/2026-08-20b_commission_ledger_payout_flow_phase2b.sql)
 * has not necessarily been executed in every environment yet. If the target
 * database is missing `compensation_type`/`source_payment_id`, retry once
 * without those columns rather than failing the whole sync.
 */
async function insertLedgerRowsWithPhase2BFallback(rows: any[]): Promise<{ data: any[] | null; error: any }> {
  const { data, error } = await supabase
    .from('commission_ledger')
    .insert(rows)
    .select('id, source_commission_id, commission_period_end, status');

  if (!error) {
    return { data, error: null };
  }

  if (!String(error.message || '').toLowerCase().includes('column')) {
    return { data: null, error };
  }

  const legacyRows = rows.map((row) => {
    const { compensation_type, source_payment_id, ...rest } = row;
    return rest;
  });

  const fallback = await supabase
    .from('commission_ledger')
    .insert(legacyRows)
    .select('id, source_commission_id, commission_period_end, status');

  return { data: fallback.data, error: fallback.error };
}

function toIsoDate(value: Date): string {
  return formatLocalDate(value);
}

/**
 * Writing commissions: semi-monthly 1st/15th cycles, unchanged from Phase 2A.
 * Overrides: monthly-in-arrears cycles — anchor is the 1st of the month
 * AFTER the earned month (commissionPeriodEnd is, for override rows, always
 * the last day of the earned calendar month — see getMonthlyPeriods below).
 */
export function getCycleAnchorForEntry(
  commissionPeriodEnd: Date,
  compensationType: CompensationType,
): { batchType: BatchType; anchorDate: Date } {
  if (compensationType === 'override') {
    const anchorDate = new Date(commissionPeriodEnd.getFullYear(), commissionPeriodEnd.getMonth() + 1, 1);
    return { batchType: 'override_monthly', anchorDate };
  }

  const day = commissionPeriodEnd.getDate();

  if (day <= 1) {
    const anchorDate = new Date(commissionPeriodEnd.getFullYear(), commissionPeriodEnd.getMonth(), 1);
    return { batchType: 'writing_1st', anchorDate };
  }

  if (day <= 15) {
    const anchorDate = new Date(commissionPeriodEnd.getFullYear(), commissionPeriodEnd.getMonth(), 15);
    return { batchType: 'writing_15th', anchorDate };
  }

  const anchorDate = new Date(commissionPeriodEnd.getFullYear(), commissionPeriodEnd.getMonth() + 1, 1);
  return { batchType: 'writing_1st', anchorDate };
}

/**
 * Advances a cycle anchor exactly one cycle step forward. Used only for
 * rows being carried forward past a cycle where they were already
 * considered — see docs/COMMISSION_LEDGER_PAYOUT_FLOW_PHASE2B_REPORT.md §9
 * for the worked examples this implements ($15 on the 1st + $20 on the 15th
 * = $35 payable on the 15th; August override carry + September override =
 * payable on the October cycle).
 */
export function advanceCycleAnchor(
  previousAnchor: Date,
  compensationType: CompensationType,
): { batchType: BatchType; anchorDate: Date } {
  if (compensationType === 'override') {
    const anchorDate = new Date(previousAnchor.getFullYear(), previousAnchor.getMonth() + 1, 1);
    return { batchType: 'override_monthly', anchorDate };
  }

  if (previousAnchor.getDate() <= 1) {
    return {
      batchType: 'writing_15th',
      anchorDate: new Date(previousAnchor.getFullYear(), previousAnchor.getMonth(), 15),
    };
  }

  return {
    batchType: 'writing_1st',
    anchorDate: new Date(previousAnchor.getFullYear(), previousAnchor.getMonth() + 1, 1),
  };
}

function dateOnly(value: Date | string): Date {
  return parseLocalDate(value);
}

export function getNextPayoutDate(batchType: BatchType, referenceDate = new Date()): Date {
  const normalizedReference = dateOnly(referenceDate);

  if (batchType === 'override_monthly') {
    // "Next" override cycle relative to referenceDate: the monthly cycle
    // whose earning month is referenceDate's month (paid the following
    // month), advanced once more if that payout date has already passed.
    let earnedMonthAnchor = new Date(normalizedReference.getFullYear(), normalizedReference.getMonth(), 1);
    let payDate = getOverridePayDate(earnedMonthAnchor);
    if (payDate.getTime() < normalizedReference.getTime()) {
      earnedMonthAnchor = new Date(earnedMonthAnchor.getFullYear(), earnedMonthAnchor.getMonth() + 1, 1);
      payDate = getOverridePayDate(earnedMonthAnchor);
    }
    return payDate;
  }

  const anchorDay = batchType === 'writing_1st' ? 1 : 15;
  const anchor = dateOnly(new Date(normalizedReference.getFullYear(), normalizedReference.getMonth(), anchorDay));

  if (normalizedReference.getTime() > anchor.getTime()) {
    if (batchType === 'writing_1st') {
      anchor.setMonth(anchor.getMonth() + 1, 1);
    } else {
      anchor.setMonth(anchor.getMonth() + 1, 15);
    }
  }

  return getWritingCommissionPayDate(anchor);
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

/** Override earning period = one full calendar month (start=1st, end=last day). */
function normalizeMonthlyPeriodFromDate(rawDate?: string): { start: string; end: string } {
  const base = rawDate ? parseLocalDate(rawDate) : parseLocalDate(new Date());
  const year = base.getFullYear();
  const month = base.getMonth();
  return {
    start: toIsoDate(new Date(year, month, 1)),
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

export function buildCancellationReversalRows(paidRows: any[], cancellationDate: string, cancellationReason?: string | null, refundEventReference = 'refund-processed'): any[] {
  const normalizedCancellationDate = formatLocalDate(cancellationDate);
  return (Array.isArray(paidRows) ? paidRows : []).map((paid: any) => ({
    source_commission_id: paid.source_commission_id || null,
    source_payment_id: paid.source_payment_id || null,
    parent_ledger_id: paid.id,
    reversal_key: `refund:${refundEventReference}:ledger:${paid.id}`,
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
    compensation_type: paid.compensation_type === 'override' ? 'override' : 'writing',
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
      refundEventReference,
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

/** Override analog of getRecurringPeriods: one period per full calendar month. */
function getMonthlyRecurringPeriods(startAt: Date, endAt: Date): Array<{ start: string; end: string }> {
  const periods: Array<{ start: string; end: string }> = [];
  let cursor = dateOnly(startAt);
  const end = dateOnly(endAt);

  while (cursor.getTime() <= end.getTime()) {
    const period = normalizeMonthlyPeriodFromDate(toIsoDate(cursor));
    const key = `${period.start}|${period.end}`;
    if (!periods.some((item) => `${item.start}|${item.end}` === key)) {
      periods.push(period);
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
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
  const agentIds = [...new Set(commissions.map((c) => normalizeCommissionLedgerAgentId(c.agentId)).filter((id): id is string => Boolean(id)))];
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

    const compensationType = compensationTypeFromFeedItem(item);
    const periodSeed = compensationType === 'override'
      ? normalizeMonthlyPeriodFromDate(item.effectiveDate || item.createdAt)
      : normalizePeriodFromDate(item.effectiveDate || item.createdAt);
    const rangeStart = dateOnly(periodSeed.start);
    const rangeEnd = dateOnly(new Date());
    const memberKey = String(item.memberId || '');
    const cancellationInfo = memberKey ? cancellationByMember.get(memberKey) : undefined;
    const cancellationDate = cancellationInfo?.date;

    const periods = compensationType === 'override'
      ? getMonthlyRecurringPeriods(rangeStart, rangeEnd)
      : getRecurringPeriods(rangeStart, rangeEnd);
    const normalizedAgentId = normalizeCommissionLedgerAgentId(item.agentId);
    const memberAgentKey = `${normalizedAgentId || ''}:${item.memberId || ''}`;
    const commissionUnitKey = buildCommissionUnitKey(item);
    const hasPriorForMember = memberAgentSeen.has(memberAgentKey);

    periods.forEach((period, index) => {
      const dedupeKey = `${item.id}|${period.start}|${period.end}`;
      if (existingBySourcePeriod.has(dedupeKey)) {
        skipped += 1;
        return;
      }

      const unitPeriodDedupeKey = `${normalizedAgentId || ''}|${commissionUnitKey}|${period.start}|${period.end}`;
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
      // Hold if: cancellation intersects, OR member's payment was not captured (unfunded).
      // paymentCaptured === false means explicitly unfunded (e.g. admin-created without payment).
      // undefined means source commission predates this field — do not hold for backward compat.
      const unfundedHold = item.paymentCaptured === false;
      const rowStatus: LedgerStatus = (intersectsCancellation && !paidFromFeed) || unfundedHold
        ? 'held'
        : (paidFromFeed ? 'paid' : 'earned');

      const row = {
        source_commission_id: item.id,
        source_payment_id: item.sourcePaymentId ?? null,
        lineage_snapshot_id: item.lineageSnapshotId || null,
        agent_id: normalizedAgentId,
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
        compensation_type: compensationType,
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
          overrideForAgentId: item.overrideForAgentId || null,
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

  const { data: insertedRows, error: insertError } = await insertLedgerRowsWithPhase2BFallback(rowsToInsert);

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

  const establishedCutover = await getHistoricalCutover();
  if (establishedCutover && (insertedRows || []).length > 0) {
    await applyHistoricalExternalSettlement(
      establishedCutover,
      (insertedRows || []).map((row: any) => String(row.id)),
    );
  }

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

/**
 * Phase 2B: automatic, idempotent ledger sync for a single confirmed
 * payment. Called by PaymentConfirmedService right after it creates
 * agent_commissions rows, so an admin no longer has to remember to run the
 * bulk `/api/admin/commissions/ledger/sync` endpoint before new compensation
 * appears in reporting. Idempotency is inherited from
 * syncCommissionLedgerFromFeed's existing source_commission_id/period dedupe
 * — safe to call more than once for the same payment.
 */
export async function syncLedgerEntriesForPayment(options: {
  paymentId: number | string;
  memberId?: number;
  effectiveDate: string | Date | null;
}): Promise<{ inserted: number; skipped: number; newlyEligible: number } | { error: string }> {
  try {
    const { data: commissions, error: commissionsError } = await supabase
      .from('agent_commissions')
      .select('id, agent_id, agent_number, member_id, enrollment_id, lineage_snapshot_id, commission_amount, coverage_type, notes, status, payment_status, commission_type, override_for_agent_id, source_payment_id, created_at')
      .eq('source_payment_id', options.paymentId);

    if (commissionsError) {
      return { error: `Failed loading commissions for ledger sync: ${commissionsError.message}` };
    }

    if (!commissions || commissions.length === 0) {
      return { inserted: 0, skipped: 0, newlyEligible: 0 };
    }

    const agentIds = [...new Set(commissions.map((c: any) => String(c.agent_id || '')).filter(Boolean))];
    const { data: agents, error: agentsError } = agentIds.length > 0
      ? await supabase.from('users').select('id, first_name, last_name, email, agent_number').in('id', agentIds)
      : { data: [], error: null };

    if (agentsError) {
      return { error: `Failed loading agents for ledger sync: ${agentsError.message}` };
    }

    const agentById = new Map((agents || []).map((a: any) => [String(a.id), a]));
    const { data: member, error: memberError } = options.memberId
      ? await supabase
        .from('members')
        .select('first_name, last_name, coverage_type')
        .eq('id', options.memberId)
        .maybeSingle()
      : { data: null, error: null };

    if (memberError) {
      return { error: `Failed loading member for ledger sync: ${memberError.message}` };
    }

    const memberName = member?.first_name && member?.last_name
      ? `${member.first_name} ${member.last_name}`
      : `Group commission payment ${options.paymentId}`;
    const resolvedEffectiveDate = options.effectiveDate ? toIsoDate(dateOnly(options.effectiveDate)) : undefined;

    const feed: CommissionFeedItem[] = commissions.map((commission: any) => {
      const agent = agentById.get(String(commission.agent_id));
      const agentName = agent?.first_name && agent?.last_name
        ? `${agent.first_name} ${agent.last_name}`
        : agent?.email || 'Unknown Agent';

      return {
        id: String(commission.id),
        agentId: commission.agent_id ? String(commission.agent_id) : undefined,
        agentName,
        agentNumber: commission.agent_number || agent?.agent_number || undefined,
        memberId: String(commission.member_id || options.memberId || ''),
        enrollmentId: commission.enrollment_id ? String(commission.enrollment_id) : undefined,
        lineageSnapshotId: commission.lineage_snapshot_id ? String(commission.lineage_snapshot_id) : undefined,
        memberName,
        coverageType: commission.coverage_type || member?.coverage_type || undefined,
        effectiveDate: resolvedEffectiveDate || commission.created_at,
        createdAt: commission.created_at,
        commissionAmount: Number(commission.commission_amount || 0),
        notes: commission.notes || undefined,
        paymentStatus: commission.payment_status || undefined,
        paymentCaptured: true,
        commissionType: commission.commission_type === 'override' ? 'override' : 'direct',
        overrideForAgentId: commission.override_for_agent_id || null,
        sourcePaymentId: commission.source_payment_id || options.paymentId,
      };
    });

    return await syncCommissionLedgerFromFeed(feed);
  } catch (error: any) {
    return { error: `Failed syncing commission ledger for payment: ${error?.message || 'unknown error'}` };
  }
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

  const VESTING_DAYS = parseInt(process.env.COMMISSION_VESTING_DAYS || '30', 10);

  /**
   * Phase 2B: a row already marked 'carry_forward' (detached from a prior,
   * now-paid batch) is reconsidered in the NEXT cycle step past wherever it
   * was last placed — never re-anchored to its original earned period,
   * which would leave it stuck replaying the same closed cycle forever.
   * `current_cycle_anchor_date` is the "where in the queue is this row now"
   * pointer; a freshly-earned row (status 'earned', never yet batched) has
   * no pointer and uses its natural earned-period anchor.
   */
  function resolveCycleForRow(row: any): { batchType: BatchType; anchorDate: Date } {
    const compensationType = compensationTypeOf(row);
    const naturalCycle = getCycleAnchorForEntry(parseLocalDate(row.commission_period_end), compensationType);

    if (row.status !== 'carry_forward') {
      return naturalCycle;
    }

    const previousAnchor = row.current_cycle_anchor_date
      ? parseLocalDate(row.current_cycle_anchor_date)
      : naturalCycle.anchorDate;
    return advanceCycleAnchor(previousAnchor, compensationType);
  }

  const eligible = (ledgerRows || []).filter((row: any) => {
    if (row.cancellation_date && parseLocalDate(row.cancellation_date).getTime() <= parseLocalDate(row.commission_period_end).getTime()) {
      return false;
    }
    // Vesting check: commission must be at least VESTING_DAYS old before it can be batched.
    // Uses effective_date (member's coverage start) as the vesting clock start.
    if (row.effective_date) {
      const vestedAt = parseLocalDate(row.effective_date);
      vestedAt.setDate(vestedAt.getDate() + VESTING_DAYS);
      if (vestedAt > cutoffDate) {
        return false; // Not yet vested — stays as 'earned', picked up in a future batch run
      }
    }
    const cycle = resolveCycleForRow(row);
    return cycle.anchorDate <= cutoffDate;
  });

  const grouped = new Map<string, any[]>();
  for (const row of eligible) {
    const cycle = resolveCycleForRow(row);
    const key = `${cycle.batchType}:${toIsoDate(cycle.anchorDate)}`;
    const items = grouped.get(key) || [];
    items.push({ ...row, __cycle: cycle });
    grouped.set(key, items);
  }

  const createdBatches: any[] = [];

  for (const [key, items] of grouped) {
    const [batchType, cutoffDateString] = key.split(':') as [BatchType, string];
    const compensationType: CompensationType = batchType === 'override_monthly' ? 'override' : 'writing';
    const scheduledPayDate = compensationType === 'override'
      // cutoffDateString is the 1st of the month AFTER the earned month — getOverridePayDate wants the earned month itself.
      ? getOverridePayDate(new Date(new Date(cutoffDateString).getFullYear(), new Date(cutoffDateString).getMonth() - 1, 1))
      : getWritingCommissionPayDate(new Date(cutoffDateString));
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
      let { data: created, error: createError } = await supabase
        .from('commission_payout_batches')
        .insert({
          batch_name: batchName,
          batch_type: batchType,
          compensation_type: compensationType,
          cutoff_date: cutoffDateString,
          scheduled_pay_date: toIsoDate(scheduledPayDate),
          status: 'draft',
        })
        .select('*')
        .single();

      // Phase 2B migration not yet applied to this database — retry without the new column.
      if (createError && String(createError.message || '').toLowerCase().includes('column')) {
        ({ data: created, error: createError } = await supabase
          .from('commission_payout_batches')
          .insert({
            batch_name: batchName,
            batch_type: batchType,
            cutoff_date: cutoffDateString,
            scheduled_pay_date: toIsoDate(scheduledPayDate),
            status: 'draft',
          })
          .select('*')
          .single());
      }

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
      const updatePayload: Record<string, any> = {
        status: targetStatus,
        payout_batch_id: targetBatchId,
      };
      // Record where this row currently sits in the cycle queue so a future
      // carry-forward pass advances from here, not from the original period.
      if (shouldCarryForward) {
        updatePayload.current_cycle_anchor_date = toIsoDate(agentRows[0].__cycle.anchorDate);
      }

      const { error: transitionError } = await supabase
        .from('commission_ledger')
        .update(updatePayload)
        .in('id', rowIds);

      let finalTransitionError = transitionError;
      // Phase 2B migration not yet applied — retry without the new column.
      if (finalTransitionError && String(finalTransitionError.message || '').toLowerCase().includes('column')) {
        const { current_cycle_anchor_date, ...legacyPayload } = updatePayload;
        const retry = await supabase
          .from('commission_ledger')
          .update(legacyPayload)
          .in('id', rowIds);
        finalTransitionError = retry.error;
      }

      if (finalTransitionError) {
        throw new Error(`Failed applying payout threshold transition for agent ${agentKey}: ${finalTransitionError.message}`);
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
  const nextFirst = getNextPayoutDate('writing_1st', now);
  const nextFifteenth = getNextPayoutDate('writing_15th', now);
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

export async function markBatchAsPaid(
  batchId: string,
  confirmation: {
    paidAt: string;
    quickBooksReference: string;
    confirmedBy?: string | null;
  },
): Promise<void> {
  await assertBatchHeaderTotalsMatch(batchId, 'mark-paid');

  const { data: batch, error: batchError } = await supabase
    .from('commission_payout_batches')
    .select('id, status')
    .eq('id', batchId)
    .single();

  if (batchError) {
    throw new Error(`Failed to load payout batch before paid transition: ${batchError.message}`);
  }

  const batchStatus = String(batch?.status || '');

  if (batchStatus === 'paid') {
    // Idempotent success for repeat mark-paid requests.
    return;
  }

  if (batchStatus !== 'exported') {
    throw new Error(`Invalid batch state for paid transition: ${batch?.status || 'unknown'}. Export the batch to QuickBooks before marking it paid.`);
  }

  const quickBooksReference = String(confirmation?.quickBooksReference || '').trim();
  const paidAt = parseLocalDate(confirmation?.paidAt || '');
  if (!quickBooksReference) {
    throw new Error('QuickBooks payment reference is required.');
  }
  if (Number.isNaN(paidAt.getTime())) {
    throw new Error('A valid QuickBooks payment date is required.');
  }
  const paidAtIso = paidAt.toISOString();
  const auditMetadata = {
    paymentMethod: 'quickbooks-manual',
    quickBooksReference,
    confirmedBy: confirmation?.confirmedBy || null,
    confirmedAt: new Date().toISOString(),
    paidAt: paidAtIso,
  };

  const { data: rows, error: rowsError } = await supabase
    .from('commission_ledger')
    .select('id, status, agent_id, writing_number, statement_number, source_commission_id')
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
    throw new Error('Payout batch has no queued ledger rows to mark as paid.');
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
      reason: 'Manually confirmed paid after QuickBooks export',
      metadata: auditMetadata,
    }))
  );

  const sourceCommissionIds = [...new Set(
    payableRows
      .map((row: any) => String(row?.source_commission_id || '').trim())
      .filter(Boolean)
  )];

  if (sourceCommissionIds.length > 0) {
    const { error: legacyUpdateError } = await supabase
      .from('agent_commissions')
      .update({
        payment_status: 'paid',
        paid_date: paidAtIso,
      })
      .in('id', sourceCommissionIds)
      .neq('payment_status', 'paid');

    if (legacyUpdateError) {
      console.error('[CommissionLedger] Warning: failed reconciling legacy commission payment status after batch paid:', {
        batchId,
        sourceCommissionCount: sourceCommissionIds.length,
        error: legacyUpdateError.message,
      });
    }
  }

  const { error: batchUpdateError } = await supabase
    .from('commission_payout_batches')
    .update({
      status: 'paid',
      paid_at: paidAtIso,
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
  refundEligibility?: 'eligible' | 'not_eligible' | 'review_required' | null;
  refundStatus?: 'not_applicable' | 'pending_manual_refund' | 'refunded' | 'denied' | 'cancelled' | null;
  actorId?: string | null;
  refundEventReference?: string | null;
}): Promise<{ heldCount: number; releasedCount: number; reversalCount: number; withinRefundWindow: boolean | null; reason: string }> {
  const memberId = String(input.memberId);
  const cancellationDate = toIsoDate(new Date(input.cancellationDate));
  const cancellationEventKey = `cancellation:${memberId}:${cancellationDate}`;

  const { data: existingCancelAudit, error: cancelAuditLookupError } = await supabase
    .from('commission_cancellation_events')
    .select('id')
    .eq('member_id', memberId)
    .eq('cancellation_date', cancellationDate)
    .eq('event_key', cancellationEventKey)
    .limit(1);
  if (cancelAuditLookupError) {
    throw new Error(`Failed to inspect cancellation audit event: ${cancelAuditLookupError.message}`);
  }
  if (!existingCancelAudit?.length) {
    const { error: cancelAuditError } = await supabase
      .from('commission_cancellation_events')
      .insert({
        member_id: memberId,
        cancellation_date: cancellationDate,
        cancellation_reason: input.cancellationReason || null,
        source: 'admin-workflow',
        event_key: cancellationEventKey,
      });
    if (cancelAuditError) {
      throw new Error(`Failed to create cancellation audit event: ${cancelAuditError.message}`);
    }
  }

  const { data: member, error: memberError } = await supabase
    .from('members')
    .select('membership_start_date, refund_eligibility, refund_status, refund_eligibility_reason')
    .eq('id', memberId)
    .maybeSingle();

  if (memberError) {
    throw new Error(`Failed to load member for refund window check: ${memberError.message}`);
  }

  const refundEligibility = input.refundEligibility ?? member?.refund_eligibility ?? null;
  const refundStatus = input.refundStatus ?? member?.refund_status ?? null;
  const decisionReason = member?.refund_eligibility_reason || 'refund_eligibility_review';
  if (!refundEligibility || !refundStatus) {
    return { heldCount: 0, releasedCount: 0, reversalCount: 0, withinRefundWindow: null, reason: 'refund_decision_missing_manual_review' };
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

  const sourceCommissionIds = [...new Set((unpaidRows || []).map((row: any) => row.source_commission_id).filter(Boolean))];
  const { data: sourceCommissions } = sourceCommissionIds.length > 0
    ? await supabase.from('agent_commissions').select('id, source_payment_id').in('id', sourceCommissionIds)
    : { data: [] };
  const sourcePaymentByCommission = new Map((sourceCommissions || []).map((row: any) => [String(row.id), row.source_payment_id || null]));
  const linkedRows = (unpaidRows || []).filter((row: any) => row.source_payment_id || sourcePaymentByCommission.get(String(row.source_commission_id)));
  const impactedUnpaidRows = getCancellationImpactedUnpaidRows(linkedRows, cancellationDate);
  const shouldHold = (refundEligibility === 'eligible' && refundStatus === 'pending_manual_refund') || refundEligibility === 'review_required';
  const rowsToHold = shouldHold ? impactedUnpaidRows.filter((row: any) => ['earned', 'queued', 'carry_forward'].includes(row.status)) : [];
  const rowsToRelease = impactedUnpaidRows.filter((row: any) => row.status === 'held' && row.metadata?.refundEligibilityHold && (refundEligibility === 'not_eligible' || ['denied', 'cancelled'].includes(refundStatus)));
  let releasedCount = 0;

  if (rowsToRelease.length > 0) {
    const releaseIds = rowsToRelease.map((row: any) => row.id);
    const { error: releaseError } = await supabase.from('commission_ledger').update({
      status: 'earned',
      payout_batch_id: null,
      metadata: { refundEligibilityHold: false, refundReleaseReason: refundStatus === 'not_applicable' ? 'refund_not_eligible' : `refund_${refundStatus}_commission_release` },
    }).in('id', releaseIds).eq('status', 'held');
    if (releaseError) throw new Error(`Failed to release refund-held commission rows: ${releaseError.message}`);
    releasedCount = releaseIds.length;
    await recordLedgerEvents(rowsToRelease.map((row: any) => ({
      ledger_id: row.id,
      event_key: `refund-release:${memberId}:${row.id}:${refundStatus}:${refundEligibility}`,
      event_type: refundStatus === 'not_applicable' ? 'refund_not_eligible_commission_release' : `${refundStatus}_commission_release`,
      from_status: 'held',
      to_status: 'earned',
      reason: decisionReason,
      metadata: { memberId, sourceCommissionId: row.source_commission_id, sourcePaymentId: row.source_payment_id || sourcePaymentByCommission.get(String(row.source_commission_id)) || null, compensationType: row.compensation_type === 'override' ? 'override' : 'writing', refundEligibility, refundStatus, actorId: input.actorId || null },
    })));
  }

  const detachedBatchIds = [...new Set(rowsToHold.map((row: any) => row.payout_batch_id).filter(Boolean))];
  if (rowsToHold.length > 0) {
    const holdIds = rowsToHold.map((row: any) => row.id);
    const { error: holdError } = await supabase
      .from('commission_ledger')
      .update({
        status: 'held',
        payout_batch_id: null,
        cancellation_date: cancellationDate,
        cancellation_reason: input.cancellationReason || null,
      })
      .in('id', holdIds)
      .in('status', ['earned', 'queued', 'carry_forward']);

    if (holdError) {
      throw new Error(`Failed to hold future ledger rows: ${holdError.message}`);
    }

    await recordLedgerEvents(
      rowsToHold.map((row: any) => ({
        ledger_id: row.id,
        event_key: `refund-hold:${memberId}:${row.id}:${refundEligibility}:${refundStatus}`,
        event_type: refundEligibility === 'review_required' ? 'refund_review_commission_hold' : 'refund_pending_commission_hold',
        from_status: row.status,
        to_status: 'held',
        reason: 'Cancellation applied to unpaid commission row',
        metadata: {
          memberId,
          sourceCommissionId: row.source_commission_id,
          sourcePaymentId: row.source_payment_id || sourcePaymentByCommission.get(String(row.source_commission_id)) || null,
          compensationType: row.compensation_type === 'override' ? 'override' : 'writing',
          refundEligibility,
          refundStatus,
          refundEligibilityReason: decisionReason,
          actorId: input.actorId || null,
          previousPayoutBatchId: row.payout_batch_id || null,
          cancellationDate,
          cancellationReason: input.cancellationReason || null,
        },
      }))
    );

    await Promise.all(detachedBatchIds.map((batchId) => recalculateBatchTotals(String(batchId))));
  }

  let reversalCount = 0;

  if (refundEligibility === 'eligible' && refundStatus === 'refunded' && input.createReversalForPaid) {
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

    const linkedPaidRows = (paidRows || []).filter((row: any) => row.source_payment_id || sourcePaymentByCommission.get(String(row.source_commission_id)));
    if (linkedPaidRows.length > 0) {
      const refundEventReference = input.refundEventReference || `member-${memberId}-refund-processed`;
      const reversalRows = buildCancellationReversalRows(linkedPaidRows, cancellationDate, input.cancellationReason || null, refundEventReference);

      const { data: createdReversals, error: reversalError } = await supabase
        .from('commission_ledger')
        .upsert(reversalRows, { onConflict: 'reversal_key', ignoreDuplicates: true })
        .select('id, parent_ledger_id, reversal_key');

      if (reversalError) {
        throw new Error(`Failed to create cancellation reversal rows: ${reversalError.message}`);
      }

      reversalCount = (createdReversals || []).length;

      await recordLedgerEvents(
        (createdReversals || []).map((row: any) => ({
          ledger_id: row.id,
          event_key: `refund-reversal-event:${row.reversal_key}`,
          event_type: 'refund_processed_commission_reversal',
          reason: 'Cancellation reversal row created from previously paid record',
          metadata: {
            memberId,
            parentLedgerId: row.parent_ledger_id,
            refundEligibility,
            refundStatus,
            actorId: input.actorId || null,
            cancellationDate,
            cancellationReason: input.cancellationReason || null,
          },
        }))
      );
    }
  }

  return {
    heldCount: rowsToHold.length,
    releasedCount,
    reversalCount,
    withinRefundWindow: refundEligibility === 'eligible' ? true : refundEligibility === 'not_eligible' ? false : null,
    reason: decisionReason,
  };
}
