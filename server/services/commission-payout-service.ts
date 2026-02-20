/**
 * Commission Payout Service
 * 
 * Handles creation and management of monthly commission payouts.
 * Business Rules:
 * - Create payout only when member's payment is captured
 * - 14-day grace period before payment is eligible
 * - No clawbacks after 14 days
 * - Full commission if payment captured (no proration)
 */

import { supabase } from '../lib/supabaseClient';
import { calculatePaymentEligibleDate } from './commission-payment-calculator';

interface CreatePayoutParams {
  commissionId: string; // UUID
  memberPaymentId?: number;
  epxTransactionId?: string;
  paymentCapturedAt: Date;
  amount: number;
  commissionType?: 'direct' | 'override'; // Added to support override commissions
  overrideForAgentId?: string; // Added to track downline agent for overrides
}

/**
 * Create a monthly payout record when member's payment is captured
 */
export async function createMonthlyPayout(params: CreatePayoutParams): Promise<any> {
  const { 
    commissionId, 
    memberPaymentId, 
    epxTransactionId, 
    paymentCapturedAt, 
    amount,
    commissionType = 'direct',
    overrideForAgentId 
  } = params;
  
  // Calculate payout month (first day of the month)
  const payoutMonth = new Date(paymentCapturedAt.getFullYear(), paymentCapturedAt.getMonth(), 1);
  const payoutMonthStr = payoutMonth.toISOString().split('T')[0]; // YYYY-MM-DD format
  
  // Calculate payment eligible date (Friday after week ends)
  const paymentEligibleDate = calculatePaymentEligibleDate(paymentCapturedAt);
  
  // Determine status based on eligible date
  const now = new Date();
  const is,
    commissionType,
    overrideForAgentId: overrideForAgentId || 'none'Eligible = now >= paymentEligibleDate;
  const status = isEligible ? 'pending' : 'ineligible'; // Will become 'pending' when eligible date passes
  
  console.log('[Payout Service] Creating monthly payout:', {
    commissionId,
    payoutMonth: payoutMonthStr,
    amount,
    paymentEligibleDate: paymentEligibleDate.toISOString(),
    status
  });
  
  // Check if payout already exists for this commission and month
  const { data: existingPayout, error: checkError } = await supabase
    .from('commission_payouts')
    .select('id, status')
    .eq('commission_id', commissionId)
    .eq('payout_month', payoutMonthStr)
    .maybeSingle();
  
  if (checkError) {
    console.error('[Payout Service] Error checking existing payout:', checkError);
    throw new Error(`Failed to check existing payout: ${checkError.message}`);
  }
  
  if (existingPayout) {
    console.log('[Payout Service] Payout already exists:', existingPayout.id);
    return existingPayout;
  }
  
  // Create new payout record
  const { data: newPayout, error: insertError } = await supabase
    .from('commission_payouts')
    .insert({
      commission_id: commissionId,
      payout_month: payoutMonthStr,
      payment_captured_at: paymentCapturedAt.toISOString(),
      payment_eligible_date: paymentEligibleDate.toISOString(),
      commission_type: commissionType,
      override_for_agent_id: overrideForAgentId || null,
      member_payment_id: memberPaymentId || null,
      epx_transaction_id: epxTransactionId || null,
      notes: `${commissionType === 'override' ? 'Override commission' : 'Direct commission'} cyment_id: memberPaymentId || null,
      epx_transaction_id: epxTransactionId || null,
      notes: `Created via EPX payment capture on ${new Date().toISOString()}`
    })
    .select()
    .single();
  
  if (insertError) {
    console.error('[Payout Service] Error creating payout:', insertError);
    throw new Error(`Failed to create payout: ${insertError.message}`);
  }
  
  console.log('[Payout Service] ✅ Created payout:', newPayout.id);
  return newPayout;
}

/**
 * Create payouts for ALL commissions (direct and override) when member payment is captured
 * This is the main entry point to use from EPX webhooks/callbacks
 */
export async function createPayoutsForMemberPayment(
  memberId: number,
  memberPaymentId: number,
  epxTransactionId: string,
  paymentCapturedAt: Date
): Promise<{ direct: any[], override: any[] }> {
  console.log('[Payout Service] Creating payouts for member payment:', {
    memberId,
    memberPaymentId,
    epxTransactionId
  });
  
  // Find ALL commissions for this member (direct + override)
  const { data: commissions, error: commissionsError } = await supabase
    .from('agent_commissions')
    .select('id, commission_amount, commission_type, override_for_agent_id, agent_id, agent_number')
    .eq('member_id', memberId.toString())
    .in('status', ['pending', 'active']);
  
  if (commissionsError) {
    console.error('[Payout Service] Error fetching commissions:', commissionsError);
    throw new Error(`Failed to fetch commissions: ${commissionsError.message}`);
  }
  
  if (!commissions || commissions.length === 0) {
    console.warn('[Payout Service] No commissions found for member:', memberId);
    return { direct: [], override: [] };
  }
  
  console.log('[Payout Service] Found', commissions.length, 'commission(s) for member', memberId);
  
  const directPayouts: any[] = [];
  const overridePayouts: any[] = [];
  
  // Create payout for each commission (both direct and override)
  for (const commission of commissions) {
    try {
      const payout = await createMonthlyPayout({
        commissionId: commission.id,
        memberPaymentId,
        epxTransactionId,
        paymentCapturedAt,
        amount: parseFloat(commission.commission_amount),
        commissionType: commission.commission_type as 'direct' | 'override',
        overrideForAgentId: commission.override_for_agent_id
      });
      
      if (commission.commission_type === 'override') {
        overridePayouts.push(payout);
        console.log(`[Payout Service] ✅ Created override payout for agent ${commission.agent_id} (downline: ${commission.override_for_agent_id})`);
      } else {
        directPayouts.push(payout);
        console.log(`[Payout Service] ✅ Created direct payout for agent ${commission.agent_id}`);
      }
    } catch (error: any) {
      console.error(`[Payout Service] Failed to create payout for commission ${commission.id}:`, error.message);
      // Continue with other commissions even if one fails
    }
  }
  
  console.log(`[Payout Service] ✅ Created ${directPayouts.length} direct payout(s) and ${overridePayouts.length} override payout(s)`);
  
  return { direct: directPayouts, override: overridePayouts };
}

/**
 * Get all pending payouts that are eligible for payment
 * (Used by weekly payment batch processing)
 */
export async function getEligiblePayouts(upToDate?: Date): Promise<any[]> {
  const eligibleDate = upToDate || new Date();
  const eligibleDateStr = eligibleDate.toISOString();
  
  console.log('[Payout Service] Fetching eligible payouts up to:', eligibleDateStr);
  
  const { data: payouts, error } = await supabase
    .from('commission_payouts')
    .select(`
      *,
      agent_commissions!commission_payouts_commission_id_fkey (
        agent_id,
        agent_number,
        member_id,
        plan_name,
        coverage_type
      )
    `)
    .eq('status', 'pending')
    .lte('payment_eligible_date', eligibleDateStr)
    .order('payment_eligible_date', { ascending: true });
  
  if (error) {
    console.error('[Payout Service] Error fetching eligible payouts:', error);
    throw new Error(`Failed to fetch eligible payouts: ${error.message}`);
  }
  
  console.log('[Payout Service] Found', payouts?.length || 0, 'eligible payouts');
  return payouts || [];
}

/**
 * Mark payouts as paid (batch processing)
 */
export async function markPayoutsAsPaid(
  payoutIds: number[],
  paidDate: Date,
  batchId: string
): Promise<void> {
  console.log('[Payout Service] Marking payouts as paid:', {
    count: payoutIds.length,
    batchId,
    paidDate
  });
  
  const { error } = await supabase
    .from('commission_payouts')
    .update({
      status: 'paid',
      paid_date: paidDate.toISOString(),
      batch_id: batchId,
      updated_at: new Date().toISOString()
    })
    .in('id', payoutIds);
  
  if (error) {
    console.error('[Payout Service] Error marking payouts as paid:', error);
    throw new Error(`Failed to mark payouts as paid: ${error.message}`);
  }
  
  console.log('[Payout Service] ✅ Marked', payoutIds.length, 'payouts as paid');
}

/**
 * Get payout summary for an agent (for agent dashboard)
 */
export async function getAgentPayoutSummary(agentId: string, startDate?: string, endDate?: string): Promise<any> {
  console.log('[Payout Service] Fetching agent payout summary:', { agentId, startDate, endDate });
  
  let query = supabase
    .from('commission_payouts')
    .select(`
      *,
      agent_commissions!commission_payouts_commission_id_fkey (
        agent_id,
        agent_number,
        member_id
      )
    `)
    .eq('agent_commissions.agent_id', agentId);
  
  if (startDate) {
    query = query.gte('payout_month', startDate);
  }
  if (endDate) {
    query = query.lte('payout_month', endDate);
  }
  
  const { data: payouts, error } = await query.order('payout_month', { ascending: false });
  
  if (error) {
    console.error('[Payout Service] Error fetching agent summary:', error);
    throw new Error(`Failed to fetch agent summary: ${error.message}`);
  }
  
  // Calculate totals by status
  const summary = {
    totalPaid: 0,
    totalPending: 0,
    totalIneligible: 0,
    payouts: payouts || []
  };
  
  (payouts || []).forEach(payout => {
    const amount = parseFloat(payout.payout_amount || 0);
    if (payout.status === 'paid') {
      summary.totalPaid += amount;
    } else if (payout.status === 'pending') {
      summary.totalPending += amount;
    } else if (payout.status === 'ineligible') {
      summary.totalIneligible += amount;
    }
  });
  
  return summary;
}

/**
 * Cancel future payouts when member cancels subscription
 * (Within 14 days or before next payment)
 */
export async function cancelFuturePayouts(commissionId: string, reason: string): Promise<void> {
  console.log('[Payout Service] Cancelling future payouts for commission:', commissionId);
  
  // Only cancel payouts that haven't been paid yet
  const { error } = await supabase
    .from('commission_payouts')
    .update({
      status: 'cancelled',
      notes: reason,
      updated_at: new Date().toISOString()
    })
    .eq('commission_id', commissionId)
    .in('status', ['pending', 'ineligible']);
  
  if (error) {
    console.error('[Payout Service] Error cancelling payouts:', error);
    throw new Error(`Failed to cancel payouts: ${error.message}`);
  }
  
  console.log('[Payout Service] ✅ Cancelled future payouts for commission', commissionId);
}
