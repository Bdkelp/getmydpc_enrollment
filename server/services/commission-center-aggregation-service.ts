import { supabase } from '../lib/supabaseClient';
import { getNextPayoutDate } from './commission-ledger-service';
import { commissionPolicy } from '@shared/commissionPolicy';

export async function getCommissionCenterAggregation(agentId?: string): Promise<any> {
  let query = supabase
    .from('commission_ledger')
    .select('id, agent_id, agent_name, writing_number, member_id, member_name, source_payment_id, commission_amount, compensation_type, commission_type, commission_period_start, commission_period_end, effective_date, status, payout_batch_id, cancellation_date, cancellation_reason, metadata');

  if (agentId) query = query.eq('agent_id', agentId);

  const { data, error } = await query.order('commission_period_end', { ascending: false });
  if (error) throw new Error(`Failed loading commission center ledger data: ${error.message}`);

  const rows = data || [];
  const batchIds = Array.from(new Set(rows.map((row: any) => row.payout_batch_id).filter(Boolean)));
  const { data: batches } = batchIds.length > 0
    ? await supabase.from('commission_payout_batches').select('id, batch_type, compensation_type, scheduled_pay_date, paid_at, batch_name').in('id', batchIds)
    : { data: [] };
  const batchById = new Map((batches || []).map((batch: any) => [String(batch.id), batch]));
  const paymentIds = Array.from(new Set(rows.map((row: any) => row.source_payment_id).filter(Boolean)));
  const { data: payments } = paymentIds.length > 0
    ? await supabase.from('payments').select('id, status, payment_method, created_at, transaction_id').in('id', paymentIds)
    : { data: [] };
  const paymentById = new Map((payments || []).map((payment: any) => [String(payment.id), payment]));
  const byAgent = new Map<string, any>();
  for (const row of rows) {
    const key = String(row.agent_id || 'unknown');
    const aggregate = byAgent.get(key) || {
      agentId: row.agent_id,
      agentName: row.agent_name,
      writingNumber: row.writing_number,
      writing: { pending: 0, payable: 0, carryForward: 0, held: 0, paid: 0 },
      overrides: { pending: 0, payable: 0, carryForward: 0, held: 0, paid: 0 },
      transactions: [],
    };
    const bucket = row.compensation_type === 'override' ? aggregate.overrides : aggregate.writing;
    const status = String(row.status || '').toLowerCase();
    const amount = Number(row.commission_amount || 0);
    if (status === 'paid') bucket.paid += amount;
    else if (status === 'queued') bucket.payable += amount;
    else if (status === 'carry_forward') bucket.carryForward += amount;
    else if (status === 'held') bucket.held += amount;
    else bucket.pending += amount;
    const batch = row.payout_batch_id ? batchById.get(String(row.payout_batch_id)) : null;
    const payment = row.source_payment_id ? paymentById.get(String(row.source_payment_id)) : null;
    aggregate.transactions.push({
      ...row,
      scheduledPayDate: batch?.scheduled_pay_date || null,
      paidDate: batch?.paid_at || null,
      payoutBatch: batch ? { id: batch.id, type: batch.batch_type, name: batch.batch_name } : null,
      sourcePayment: payment ? { status: payment.status, method: payment.payment_method, receivedAt: payment.created_at } : null,
      underlyingStatus: row.status,
    });
    byAgent.set(key, aggregate);
  }

  return {
    policy: {
      ...commissionPolicy,
      nextWritingPayout: getNextPayoutDate('writing_1st').toISOString().slice(0, 10),
      nextOverridePayout: getNextPayoutDate('override_monthly').toISOString().slice(0, 10),
    },
    refreshedAt: new Date().toISOString(),
    mostRecentPayment: (payments || []).sort((a: any, b: any) => Date.parse(b.created_at || '') - Date.parse(a.created_at || ''))[0] || null,
    agents: Array.from(byAgent.values()),
  };
}
