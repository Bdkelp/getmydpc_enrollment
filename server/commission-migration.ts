/**
 * Phase 2: Dual-Write Commission Functions
 * These functions write to both old and new commission tables during migration
 * Keeps the old system working while building the new one
 */

import { supabase } from './lib/supabaseClient';
import { query } from './storage'; // Existing Neon query function

// New clean commission interface
export interface AgentCommission {
  id?: number;
  agent_id: string;
  member_id: number;
  subscription_id?: number;
  commission_amount: number;
  plan_cost: number;
  plan_name: string;
  coverage_type: string;
  status: 'pending' | 'active' | 'cancelled';
  payment_status: 'unpaid' | 'paid' | 'cancelled';
  enrollment_date?: Date;
  paid_date?: Date;
}

// Commission calculation helper (simplified)
export function calculateCommission(coverageType: string, planName: string): number {
  const baseRates = {
    'Individual': 50,
    'Couple': 75,
    'Children': 60,
    'Adult/Minor': 80
  };

  const multipliers = {
    'Elite': 1.5,
    'Plus': 1.2,
    'Standard': 1.0
  };

  const baseAmount = baseRates[coverageType as keyof typeof baseRates] || 50;
  let multiplier = 1.0;
  
  if (planName.includes('Elite')) multiplier = multipliers.Elite;
  else if (planName.includes('Plus')) multiplier = multipliers.Plus;
  
  return Math.round(baseAmount * multiplier * 100) / 100;
}

/**
 * SAFE: Creates commission in both old and new tables
 * Returns old table result to maintain compatibility
 */
export async function createCommissionDualWrite(commissionData: {
  agentId: string;
  memberId: number;
  subscriptionId?: number;
  planName: string;
  coverageType: string;
  planCost: number;
}): Promise<any> {
  
  const commissionAmount = calculateCommission(commissionData.coverageType, commissionData.planName);
  
  console.log('[Commission Migration] Dual-write commission creation starting...');
  
  try {
    // STEP 1: Write to OLD table (keeps current system working)
    const oldCommissionData = {
      agentId: commissionData.agentId,
      agentNumber: 'TEMP', // Will be populated by existing logic
      subscriptionId: commissionData.subscriptionId,
      userId: null,
      memberId: commissionData.memberId,
      planName: commissionData.planName,
      planType: commissionData.coverageType,
      planTier: commissionData.planName,
      commissionAmount: commissionAmount,
      totalPlanCost: commissionData.planCost,
      status: 'pending',
      paymentStatus: 'unpaid'
    };

    // Use existing createCommission function for old table
    const { createCommission } = await import('./storage');
    const oldResult = await createCommission(oldCommissionData);
    console.log('[Commission Migration] ✅ Written to OLD commissions table');
    
    // STEP 2: Also write to NEW table (builds new system)
    const newCommissionData = {
      agent_id: commissionData.agentId,
      member_id: commissionData.memberId,
      subscription_id: commissionData.subscriptionId || null,
      commission_amount: commissionAmount,
      plan_cost: commissionData.planCost,
      plan_name: commissionData.planName,
      coverage_type: commissionData.coverageType,
      status: 'pending',
      payment_status: 'unpaid',
      enrollment_date: new Date().toISOString()
    };

    const { data: newResult, error: newError } = await supabase
      .from('agent_commissions')
      .insert(newCommissionData)
      .select()
      .single();

    if (newError) {
      console.warn('[Commission Migration] ⚠️ Failed to write to NEW table:', newError.message);
      // Don't fail the whole operation - old table write succeeded
    } else {
      console.log('[Commission Migration] ✅ Written to NEW agent_commissions table');
    }

    // Return old result to maintain compatibility with existing code
    return oldResult;

  } catch (error) {
    console.error('[Commission Migration] ❌ Dual-write failed:', error);
    throw error;
  }
}

/**
 * SAFE: Updates commission in both old and new tables
 */
export async function updateCommissionDualWrite(
  identifier: { commissionId?: number; memberId?: number; subscriptionId?: number },
  updates: {
    status?: string;
    paymentStatus?: string;
    paidDate?: Date;
  }
): Promise<any> {
  
  console.log('[Commission Migration] Dual-write commission update starting...');
  
  try {
    let oldResult = null;
    let newResult = null;

    // STEP 1: Update OLD table (keeps current system working)
    if (identifier.commissionId) {
      const { updateCommission } = await import('./storage');
      oldResult = await updateCommission(identifier.commissionId, updates);
    } else if (identifier.memberId) {
      // Find and update by member ID in old table
      const findResult = await query(
        'SELECT * FROM commissions WHERE member_id = $1 LIMIT 1',
        [identifier.memberId]
      );
      
      if (findResult.rows.length > 0) {
        const commissionId = findResult.rows[0].id;
        const { updateCommission } = await import('./storage');
        oldResult = await updateCommission(commissionId, updates);
      }
    }
    
    if (oldResult) {
      console.log('[Commission Migration] ✅ Updated OLD commissions table');
    }

    // STEP 2: Update NEW table
    let updateQuery = supabase.from('agent_commissions');
    
    if (identifier.commissionId) {
      // Map old commission ID to new table (this is tricky during migration)
      // For now, try to find by member_id if we have it
      if (identifier.memberId) {
        updateQuery = updateQuery.eq('member_id', identifier.memberId);
      } else {
        console.warn('[Commission Migration] ⚠️ Cannot map old commission ID to new table');
        return oldResult;
      }
    } else if (identifier.memberId) {
      updateQuery = updateQuery.eq('member_id', identifier.memberId);
    } else if (identifier.subscriptionId) {
      updateQuery = updateQuery.eq('subscription_id', identifier.subscriptionId);
    }

    const newUpdateData: any = {};
    if (updates.status) newUpdateData.status = updates.status;
    if (updates.paymentStatus) newUpdateData.payment_status = updates.paymentStatus;
    if (updates.paidDate) newUpdateData.paid_date = updates.paidDate.toISOString();

    const { data: newUpdateResult, error: newUpdateError } = await updateQuery
      .update(newUpdateData)
      .select()
      .single();

    if (newUpdateError) {
      console.warn('[Commission Migration] ⚠️ Failed to update NEW table:', newUpdateError.message);
    } else {
      console.log('[Commission Migration] ✅ Updated NEW agent_commissions table');
      newResult = newUpdateResult;
    }

    // Return old result to maintain compatibility
    return oldResult || newResult;

  } catch (error) {
    console.error('[Commission Migration] ❌ Dual-write update failed:', error);
    throw error;
  }
}

/**
 * SAFE: Reads from NEW table with fallback to OLD table
 * Use this when we want to start testing the new table
 */
export async function getCommissionsNew(agentId: string, options: {
  startDate?: string;
  endDate?: string;
  paymentStatus?: string;
} = {}): Promise<AgentCommission[]> {
  
  try {
    // Try NEW table first
    let query = supabase
      .from('agent_commissions')
      .select('*')
      .eq('agent_id', agentId);

    if (options.startDate) {
      query = query.gte('enrollment_date', options.startDate);
    }
    if (options.endDate) {
      query = query.lte('enrollment_date', options.endDate);
    }
    if (options.paymentStatus) {
      query = query.eq('payment_status', options.paymentStatus);
    }

    const { data: newData, error: newError } = await query.order('enrollment_date', { ascending: false });

    if (!newError && newData && newData.length > 0) {
      console.log('[Commission Migration] ✅ Read from NEW agent_commissions table');
      return newData;
    }

    // Fallback to OLD table if new table is empty or has errors
    console.log('[Commission Migration] 🔄 Falling back to OLD commissions table');
    const { getAgentCommissions } = await import('./storage');
    const oldData = await getAgentCommissions(agentId, options.startDate, options.endDate);
    
    // Transform old data to new format
    return oldData.map((old: any) => ({
      id: old.id,
      agent_id: old.agentId || old.agent_id,
      member_id: old.memberId || old.member_id,
      subscription_id: old.subscriptionId || old.subscription_id,
      commission_amount: parseFloat(old.commissionAmount || old.commission_amount),
      plan_cost: parseFloat(old.totalPlanCost || old.total_plan_cost || old.plan_cost || 0),
      plan_name: old.planName || old.plan_name,
      coverage_type: old.planType || old.plan_type || old.coverage_type,
      status: old.status,
      payment_status: old.paymentStatus || old.payment_status,
      enrollment_date: old.createdAt || old.created_at || old.enrollment_date,
      paid_date: old.paidDate || old.paid_date
    }));

  } catch (error) {
    console.error('[Commission Migration] ❌ Failed to read commissions:', error);
    throw error;
  }
}

export { createCommissionDualWrite as createCommission };