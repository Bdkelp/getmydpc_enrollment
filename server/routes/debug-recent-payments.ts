import { Router, Request, Response } from 'express';
import { storage } from '../storage';
import { supabase } from '../lib/supabaseClient';

const router = Router();

/**
 * Debug endpoint to check recent payments for specific users
 */
router.get('/api/debug/recent-payments', async (req: Request, res: Response) => {
  try {
    console.log('[Debug Recent Payments] Checking recent payment activity for target users...');

    // Target users to check for payment activity
    const targetUsernames = ['chesty', 'ben', 'rusty'];

    // Get recent payments from last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get all payments from the last 7 days
    const { data: recentPayments, error: recentError } = await supabase
      .from('payments')
      .select('*')
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (recentError) {
      console.error('[Debug Recent Payments] Error fetching recent payments:', recentError);
      throw recentError;
    }

    // Look for target users by their usernames/emails
    const targetUsers = [];
    for (const username of targetUsernames) {
      // Try to find by email first (assuming username is email-like)
      const { data: userByEmail, error: emailError } = await supabase
        .from('users')
        .select('*')
        .or(`email.ilike.%${username}%,first_name.ilike.%${username}%,last_name.ilike.%${username}%`)
        .limit(5);

      if (!emailError && userByEmail && userByEmail.length > 0) {
        targetUsers.push(...userByEmail);
      }
    }

    console.log('[Debug Recent Payments] Found target users:', targetUsers.length);

    // Get payments for target users
    let targetUserPayments: any[] = [];
    if (targetUsers && targetUsers.length > 0) {
      const userIds = targetUsers.map(u => u.id);
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
      targetUsers: targetUsers?.length || 0,
      targetUserPayments: targetUserPayments.length,
      sandboxTransactions: sandboxTransactions.length
    });

    res.json({
      success: true,
      summary: {
        searchedUsernames: targetUsernames,
        searchPeriod: '7 days',
        recentPaymentsCount: recentPayments?.length || 0,
        targetUsersFound: targetUsers?.length || 0,
        targetUserPayments: targetUserPayments.length,
        sandboxTransactionsLast24h: sandboxTransactions.length
      },
      data: {
        targetUsers: targetUsers.map(u => ({
          id: u.id,
          name: `${u.first_name || ''} ${u.last_name || ''}`.trim(),
          email: u.email,
          created_at: u.created_at
        })),
        targetUserPayments: targetUserPayments.map(p => ({
          id: p.id,
          user_id: p.user_id,
          amount: p.amount,
          status: p.status,
          transaction_id: p.transaction_id,
          created_at: p.created_at,
          environment: p.metadata?.environment
        })),
        recentPayments: (recentPayments || []).slice(0, 10).map(p => ({
          id: p.id,
          user_id: p.user_id,
          amount: p.amount,
          status: p.status,
          transaction_id: p.transaction_id,
          created_at: p.created_at,
          environment: p.metadata?.environment
        })),
        sandboxTransactions: sandboxTransactions.slice(0, 10)
      },
      debug: {
        note: 'If no payments appear for target users, they may not have completed the payment flow',
        possibleIssues: [
          'Payment form submission failed before reaching database',
          'EPX webhook not received or processed',
          'Transaction ID mismatch between creation and webhook',
          'Users cancelled payment before completion'
        ]
      }
    });

  } catch (error: any) {
    console.error('[Debug Recent Payments] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

/**
 * Simple test endpoint to verify routing is working
 */
router.get('/api/debug/test', async (req: Request, res: Response) => {
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