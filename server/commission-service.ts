import { supabase } from './lib/supabaseClient';

export interface AgentCommission {
  agent_id: string;
  member_id: string;
  lead_id?: string;
  enrollment_id?: string;
  commission_amount: number;
  coverage_type: 'aca' | 'medicare_advantage' | 'medicare_supplement' | 'lis' | 'other';
  policy_number?: string;
  carrier?: string;
  commission_percentage?: number;
  base_premium?: number;
  status: 'pending' | 'approved' | 'paid' | 'denied' | 'cancelled';
  payment_status: 'unpaid' | 'processing' | 'paid' | 'failed' | 'cancelled';
  epx_commission_id?: string;
  epx_transaction_id?: string;
  notes?: string;
  paid_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface LegacyCommission {
  agentId: string;
  memberId: string;
  leadId?: string;
  enrollmentId?: string;
  commissionAmount: number;
  coverageType: string;
  policyNumber?: string;
  carrier?: string;
  commissionPercentage?: number;
  basePremium?: number;
  status: string;
  paymentStatus: string;
  epxCommissionId?: string;
  epxTransactionId?: string;
  notes?: string;
  paidAt?: string;
}

/**
 * Dual-write commission creation - writes to both tables during migration
 */
export async function createCommissionDualWrite(commission: AgentCommission): Promise<{ success: boolean; agentCommissionId?: string; legacyCommissionId?: string; error?: string }> {
  try {
    console.log('Creating commission with dual-write approach...', commission);

    // Step 1: Create in new agent_commissions table
    const { data: agentCommission, error: agentError } = await supabase
      .from('agent_commissions')
      .insert([{
        agent_id: commission.agent_id,
        member_id: commission.member_id,
        lead_id: commission.lead_id || null,
        enrollment_id: commission.enrollment_id || null,
        commission_amount: commission.commission_amount,
        coverage_type: commission.coverage_type,
        policy_number: commission.policy_number || null,
        carrier: commission.carrier || null,
        commission_percentage: commission.commission_percentage || null,
        base_premium: commission.base_premium || null,
        status: commission.status,
        payment_status: commission.payment_status,
        epx_commission_id: commission.epx_commission_id || null,
        epx_transaction_id: commission.epx_transaction_id || null,
        notes: commission.notes || null,
        paid_at: commission.paid_at || null
      }])
      .select()
      .single();

    if (agentError) {
      console.error('Error creating agent commission:', agentError);
      throw new Error(`Agent commission creation failed: ${agentError.message}`);
    }

    console.log('Agent commission created successfully:', agentCommission);

    // Step 2: Create in legacy commissions table (for backwards compatibility)
    const legacyCommissionData: LegacyCommission = {
      agentId: commission.agent_id,
      memberId: commission.member_id,
      leadId: commission.lead_id || undefined,
      enrollmentId: commission.enrollment_id || undefined,
      commissionAmount: commission.commission_amount,
      coverageType: commission.coverage_type,
      policyNumber: commission.policy_number || undefined,
      carrier: commission.carrier || undefined,
      commissionPercentage: commission.commission_percentage || undefined,
      basePremium: commission.base_premium || undefined,
      status: commission.status,
      paymentStatus: commission.payment_status,
      epxCommissionId: commission.epx_commission_id || undefined,
      epxTransactionId: commission.epx_transaction_id || undefined,
      notes: commission.notes || undefined,
      paidAt: commission.paid_at || undefined
    };

    const { data: legacyCommission, error: legacyError } = await supabase
      .from('commissions')
      .insert([legacyCommissionData])
      .select()
      .single();

    if (legacyError) {
      console.warn('Legacy commission creation failed (non-critical):', legacyError);
      // Don't throw error for legacy table - new system is primary
    } else {
      console.log('Legacy commission created successfully:', legacyCommission);
    }

    return {
      success: true,
      agentCommissionId: agentCommission.id,
      legacyCommissionId: legacyCommission?.id
    };

  } catch (error) {
    console.error('Commission dual-write failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Get agent commissions from new table (primary source)
 */
export async function getAgentCommissions(agentId: string): Promise<AgentCommission[]> {
  try {
    const { data: commissions, error } = await supabase
      .from('agent_commissions')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching agent commissions:', error);
      throw new Error(`Failed to fetch agent commissions: ${error.message}`);
    }

    return commissions || [];
  } catch (error) {
    console.error('Error in getAgentCommissions:', error);
    throw error;
  }
}

/**
 * Update commission status in both tables
 */
export async function updateCommissionStatus(
  commissionId: string, 
  status: AgentCommission['status'], 
  paymentStatus?: AgentCommission['payment_status'],
  epxTransactionId?: string,
  paidAt?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Update new table
    const updateData: any = { status, updated_at: new Date().toISOString() };
    if (paymentStatus) updateData.payment_status = paymentStatus;
    if (epxTransactionId) updateData.epx_transaction_id = epxTransactionId;
    if (paidAt) updateData.paid_at = paidAt;

    const { error: agentError } = await supabase
      .from('agent_commissions')
      .update(updateData)
      .eq('id', commissionId);

    if (agentError) {
      throw new Error(`Agent commission update failed: ${agentError.message}`);
    }

    // Update legacy table (best effort)
    const legacyUpdateData: any = { status };
    if (paymentStatus) legacyUpdateData.paymentStatus = paymentStatus;
    if (epxTransactionId) legacyUpdateData.epxTransactionId = epxTransactionId;
    if (paidAt) legacyUpdateData.paidAt = paidAt;

    const { error: legacyError } = await supabase
      .from('commissions')
      .update(legacyUpdateData)
      .eq('id', commissionId); // Assume same ID for now

    if (legacyError) {
      console.warn('Legacy commission update failed (non-critical):', legacyError);
    }

    return { success: true };
  } catch (error) {
    console.error('Commission status update failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Get all commissions for admin dashboard
 */
export async function getAllCommissions(): Promise<AgentCommission[]> {
  try {
    const { data: commissions, error } = await supabase
      .from('agent_commissions')
      .select(`
        *,
        agent:users!agent_commissions_agent_id_fkey(email, firstName, lastName),
        member:users!agent_commissions_member_id_fkey(email, firstName, lastName)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all commissions:', error);
      throw new Error(`Failed to fetch all commissions: ${error.message}`);
    }

    return commissions || [];
  } catch (error) {
    console.error('Error in getAllCommissions:', error);
    throw error;
  }
}

/**
 * Get commission analytics
 */
export async function getCommissionAnalytics(agentId?: string): Promise<{
  totalCommissions: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  byStatus: Record<string, number>;
  byPaymentStatus: Record<string, number>;
}> {
  try {
    let query = supabase.from('agent_commissions').select('*');
    
    if (agentId) {
      query = query.eq('agent_id', agentId);
    }

    const { data: commissions, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch commission analytics: ${error.message}`);
    }

    const analytics = {
      totalCommissions: commissions?.length || 0,
      totalAmount: 0,
      paidAmount: 0,
      pendingAmount: 0,
      byStatus: {} as Record<string, number>,
      byPaymentStatus: {} as Record<string, number>
    };

    commissions?.forEach((commission: AgentCommission) => {
      analytics.totalAmount += commission.commission_amount || 0;
      
      if (commission.payment_status === 'paid') {
        analytics.paidAmount += commission.commission_amount || 0;
      } else {
        analytics.pendingAmount += commission.commission_amount || 0;
      }

      analytics.byStatus[commission.status] = (analytics.byStatus[commission.status] || 0) + 1;
      analytics.byPaymentStatus[commission.payment_status] = (analytics.byPaymentStatus[commission.payment_status] || 0) + 1;
    });

    return analytics;
  } catch (error) {
    console.error('Error in getCommissionAnalytics:', error);
    throw error;
  }
}