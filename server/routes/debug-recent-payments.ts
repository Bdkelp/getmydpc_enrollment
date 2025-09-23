
import { Router } from 'express';
import { storage } from '../storage';
import { query } from '../lib/neonDb';

const router = Router();

/**
 * Debug endpoint to check recent payment attempts
 */
router.get('/api/debug/recent-payments', async (req, res) => {
  try {
    console.log('[Debug] Checking recent payment attempts...');

    // Check recent payments from database
    const recentPayments = await query(`
      SELECT 
        p.*,
        u.first_name,
        u.last_name,
        u.email
      FROM payments p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.created_at > NOW() - INTERVAL '7 days'
      ORDER BY p.created_at DESC
      LIMIT 20
    `);

    // Check for specific users (chesty, ben, rusty)
    const targetUsers = await query(`
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.created_at,
        p.id as payment_id,
        p.amount,
        p.status,
        p.transaction_id,
        p.created_at as payment_date
      FROM users u
      LEFT JOIN payments p ON u.id = p.user_id
      WHERE LOWER(u.first_name) IN ('chesty', 'ben', 'rusty')
         OR LOWER(u.last_name) IN ('chesty', 'ben', 'rusty')
         OR LOWER(u.email) LIKE '%chesty%'
         OR LOWER(u.email) LIKE '%ben%'
         OR LOWER(u.email) LIKE '%rusty%'
      ORDER BY u.created_at DESC
    `);

    // Check EPX transaction logs
    const epxLogs = await query(`
      SELECT 
        transaction_id,
        amount,
        status,
        metadata,
        created_at
      FROM payments
      WHERE metadata->>'environment' = 'sandbox'
        AND created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      summary: {
        totalRecentPayments: recentPayments.rows.length,
        targetUsersFound: targetUsers.rows.length,
        recentEPXTransactions: epxLogs.rows.length
      },
      recentPayments: recentPayments.rows,
      targetUsers: targetUsers.rows,
      epxTransactions: epxLogs.rows,
      searchCriteria: {
        timeframe: 'Last 7 days',
        targetNames: ['chesty', 'ben', 'rusty'],
        environment: 'sandbox'
      }
    });

  } catch (error: any) {
    console.error('[Debug] Error checking recent payments:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: 'Failed to retrieve payment data'
    });
  }
});

export default router;
