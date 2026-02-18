/**
 * Payment Tracking Routes
 * Admin endpoints for monitoring payment status and history
 */

import { Router, Response } from 'express';
import { storage } from '../storage';
import { authenticateToken, type AuthRequest } from '../auth/supabaseAuth';
import { isAtLeastAdmin } from '../auth/roles';
import { query } from '../lib/neonDb';

const router = Router();

/**
 * Get recent payments with member details
 */
router.get('/api/admin/payments/recent', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const status = req.query.status as string;

    const payments = await storage.getRecentPaymentsDetailed({ limit, status });

    res.json({
      success: true,
      payments,
      total: payments.length
    });
  } catch (error: any) {
    console.error('[Payment Tracking] Error fetching recent payments:', error);
    res.status(500).json({ 
      error: 'Failed to fetch recent payments',
      message: error.message 
    });
  }
});

/**
 * Get payment history for a specific member
 */
router.get('/api/admin/payments/member/:memberId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const memberId = parseInt(req.params.memberId);
    if (!Number.isFinite(memberId)) {
      return res.status(400).json({ error: 'Invalid member ID' });
    }

    const result = await query(
      `
        SELECT 
          p.*,
          m.first_name AS member_first_name,
          m.last_name AS member_last_name,
          m.email AS member_email,
          m.customer_number AS member_customer_number
        FROM payments p
        LEFT JOIN members m ON p.member_id = m.id
        WHERE p.member_id = $1
        ORDER BY p.created_at DESC
      `,
      [memberId]
    );

    res.json({
      success: true,
      payments: result.rows,
      total: result.rows.length
    });
  } catch (error: any) {
    console.error('[Payment Tracking] Error fetching member payments:', error);
    res.status(500).json({ 
      error: 'Failed to fetch member payment history',
      message: error.message 
    });
  }
});

/**
 * Get failed/pending payments requiring attention
 */
router.get('/api/admin/payments/failed', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    const result = await query(
      `
        SELECT 
          p.*,
          m.id AS member_id,
          m.first_name AS member_first_name,
          m.last_name AS member_last_name,
          m.email AS member_email,
          m.phone AS member_phone,
          m.customer_number AS member_customer_number,
          m.total_monthly_price AS member_monthly_price,
          m.status AS member_status,
          m.agent_number,
          pl.name AS plan_name,
          u.first_name AS agent_first_name,
          u.last_name AS agent_last_name,
          u.email AS agent_email
        FROM payments p
        LEFT JOIN members m ON p.member_id = m.id
        LEFT JOIN plans pl ON m.plan_id = pl.id
        LEFT JOIN users u ON m.enrolled_by_agent_id::uuid = u.id
        WHERE p.status IN ('failed', 'pending', 'canceled', 'declined')
        ORDER BY p.created_at DESC
        LIMIT $1
      `,
      [limit]
    );

    res.json({
      success: true,
      payments: result.rows,
      total: result.rows.length
    });
  } catch (error: any) {
    console.error('[Payment Tracking] Error fetching failed payments:', error);
    res.status(500).json({ 
      error: 'Failed to fetch failed payments',
      message: error.message 
    });
  }
});

/**
 * Get payment statistics summary
 */
router.get('/api/admin/payments/stats', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'succeeded') AS successful_count,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
        COUNT(*) AS total_count,
        SUM(CAST(amount AS DECIMAL)) FILTER (WHERE status = 'succeeded') AS total_revenue,
        SUM(CAST(amount AS DECIMAL)) FILTER (WHERE status = 'failed') AS failed_revenue
      FROM payments
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `);

    const stats = result.rows[0] || {
      successful_count: 0,
      failed_count: 0,
      pending_count: 0,
      total_count: 0,
      total_revenue: 0,
      failed_revenue: 0
    };

    res.json({
      success: true,
      stats: {
        successful: parseInt(stats.successful_count) || 0,
        failed: parseInt(stats.failed_count) || 0,
        pending: parseInt(stats.pending_count) || 0,
        total: parseInt(stats.total_count) || 0,
        totalRevenue: parseFloat(stats.total_revenue) || 0,
        failedRevenue: parseFloat(stats.failed_revenue) || 0
      }
    });
  } catch (error: any) {
    console.error('[Payment Tracking] Error fetching payment stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch payment statistics',
      message: error.message 
    });
  }
});

/**
 * Get enrollments with their payment status
 * Enhanced endpoint that includes payment information
 */
router.get('/api/admin/enrollments-with-payments', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const agentId = req.query.agentId as string;

    const agentFilter = agentId && agentId !== 'all' ? 'AND m.enrolled_by_agent_id = $2' : '';
    const params = agentFilter ? [limit, agentId] : [limit];

    const result = await query(
      `
        SELECT 
          m.*,
          pl.name AS plan_name,
          u.first_name AS agent_first_name,
          u.last_name AS agent_last_name,
          u.email AS agent_email,
          u.agent_number AS agent_number_from_user,
          p.id AS payment_id,
          p.status AS payment_status,
          p.amount AS payment_amount,
          p.transaction_id,
          p.created_at AS payment_date,
          p.epx_auth_guid
        FROM members m
        LEFT JOIN plans pl ON m.plan_id = pl.id
        LEFT JOIN users u ON m.enrolled_by_agent_id::uuid = u.id
        LEFT JOIN LATERAL (
          SELECT * FROM payments 
          WHERE member_id = m.id 
          ORDER BY created_at DESC 
          LIMIT 1
        ) p ON true
        WHERE m.status != 'archived'
        ${agentFilter}
        ORDER BY m.created_at DESC
        LIMIT $1
      `,
      params
    );

    res.json({
      success: true,
      enrollments: result.rows,
      total: result.rows.length
    });
  } catch (error: any) {
    console.error('[Payment Tracking] Error fetching enrollments with payments:', error);
    res.status(500).json({ 
      error: 'Failed to fetch enrollments with payment data',
      message: error.message 
    });
  }
});

export default router;
