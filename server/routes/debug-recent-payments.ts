
import { Router } from 'express';
import { storage } from '../storage';
import { supabase } from '../lib/supabaseClient';

const router = Router();

/**
 * Debug endpoint to check recent payment attempts
 */
router.get('/api/debug/recent-payments', async (req, res) => {
  try {
    console.log('[Debug Recent Payments] Starting payment search...');

    // Use Supabase instead of direct Neon queries for consistency
    // Check recent payments from database
    const { data: recentPayments, error: paymentsError } = await supabase
      .from('payments')
      .select(`
        *,
        users!inner(first_name, last_name, email)
      `)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(20);

    if (paymentsError) {
      console.error('[Debug Recent Payments] Payments query error:', paymentsError);
    }

    // Check for specific users (chesty, ben, rusty)
    const { data: allUsers, error: usersError } = await supabase
      .from('users')
      .select(`
        id,
        first_name,
        last_name,
        email,
        created_at
      `)
      .or(`first_name.ilike.%chesty%,first_name.ilike.%ben%,first_name.ilike.%rusty%,last_name.ilike.%chesty%,last_name.ilike.%ben%,last_name.ilike.%rusty%,email.ilike.%chesty%,email.ilike.%ben%,email.ilike.%rusty%`)
      .order('created_at', { ascending: false });

    if (usersError) {
      console.error('[Debug Recent Payments] Users query error:', usersError);
    }

    // Get payments for target users
    let targetUserPayments: any[] = [];
    if (allUsers && allUsers.length > 0) {
      const userIds = allUsers.map(u => u.id);
      const { data: userPayments, error: userPaymentsError } = await supabase
        .from('payments')
        .select('*')
        .in('user_id', userIds);

      if (userPaymentsError) {
        console.error('[Debug Recent Payments] User payments query error:', userPaymentsError);
      } else {
        targetUserPayments = userPayments || [];
      }
    }

    // Check EPX sandbox transactions from last 24 hours
    const { data: epxLogs, error: epxError } = await supabase
      .from('payments')
      .select('transaction_id, amount, status, metadata, created_at')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    if (epxError) {
      console.error('[Debug Recent Payments] EPX logs query error:', epxError);
    }

    // Filter EPX sandbox transactions
    const sandboxTransactions = (epxLogs || []).filter(log => 
      log.metadata && 
      typeof log.metadata === 'object' && 
      log.metadata.environment === 'sandbox'
    );

    console.log('[Debug Recent Payments] Search completed:', {
      recentPayments: recentPayments?.length || 0,
      targetUsers: allUsers?.length || 0,
      targetUserPayments: targetUserPayments.length,
      sandboxTransactions: sandboxTransactions.length
    });

    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalRecentPayments: recentPayments?.length || 0,
        targetUsersFound: allUsers?.length || 0,
        targetUserPayments: targetUserPayments.length,
        recentEPXTransactions: sandboxTransactions.length,
        queryErrors: {
          payments: !!paymentsError,
          users: !!usersError,
          epx: !!epxError
        }
      },
      recentPayments: recentPayments || [],
      targetUsers: (allUsers || []).map(user => ({
        ...user,
        payments: targetUserPayments.filter(p => p.user_id === user.id)
      })),
      epxTransactions: sandboxTransactions,
      searchCriteria: {
        timeframe: 'Last 7 days',
        targetNames: ['chesty', 'ben', 'rusty'],
        environment: 'sandbox'
      },
      errors: {
        payments: paymentsError?.message || null,
        users: usersError?.message || null,
        epx: epxError?.message || null
      }
    };

    res.json(result);

  } catch (error: any) {
    console.error('[Debug Recent Payments] Unexpected error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: 'Failed to retrieve payment data',
      stack: error.stack
    });
  }
});

/**
 * Simple test endpoint to verify routing is working
 */
router.get('/api/debug/test', async (req, res) => {
  try {
    console.log('[Debug Test] Endpoint accessed');
    res.json({
      success: true,
      message: 'Debug routing is working!',
      timestamp: new Date().toISOString(),
      serverTime: new Date().toLocaleString(),
      environment: process.env.NODE_ENV || 'unknown'
    });
  } catch (error: any) {
    console.error('[Debug Test] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
