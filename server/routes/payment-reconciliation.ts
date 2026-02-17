/**
 * Payment Reconciliation Routes
 * Detects and reports members with missing or incomplete payment tracking
 */

import { Router, Response } from 'express';
import { storage } from '../storage';
import { authenticateToken, type AuthRequest } from '../auth/supabaseAuth';
import { isAtLeastAdmin } from '../auth/roles';
import { query } from '../lib/neonDb';

const router = Router();

/**
 * Find all members with missing payment records
 * These represent broken enrollment flows where commission was created but payment wasn't tracked
 */
router.get('/api/admin/reconciliation/missing-payments', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await query(`
      SELECT 
        m.id AS member_id,
        m.customer_number,
        m.first_name || ' ' || m.last_name AS member_name,
        m.email,
        m.total_monthly_price,
        m.agent_number,
        m.enrollment_date,
        m.membership_start_date,
        m.is_active,
        m.status,
        COALESCE(
          (SELECT COUNT(*) FROM payments p WHERE p.member_id = m.id),
          0
        ) AS payment_count,
        COALESCE(
          (SELECT COUNT(*) FROM agent_commissions ac WHERE ac.member_id = m.id),
          0
        ) AS commission_count
      FROM members m
      WHERE m.total_monthly_price IS NOT NULL 
        AND m.total_monthly_price > 0
        AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.member_id = m.id)
      ORDER BY m.enrollment_date DESC
    `);

    const membersWithoutPayments = result.rows || [];

    // Calculate total missing revenue
    const totalMissingRevenue = membersWithoutPayments.reduce((sum, m) => {
      return sum + (parseFloat(m.total_monthly_price) || 0);
    }, 0);

    res.json({
      success: true,
      count: membersWithoutPayments.length,
      totalMissingRevenue: totalMissingRevenue.toFixed(2),
      members: membersWithoutPayments,
      metadata: {
        queryDate: new Date().toISOString(),
        reportType: 'missing-payments',
        severity: membersWithoutPayments.length > 0 ? 'CRITICAL' : 'OK'
      }
    });

  } catch (error: any) {
    console.error('[Reconciliation] Error finding missing payments:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Find payments without BRIC tokens (can't charge recurring)
 */
router.get('/api/admin/reconciliation/missing-tokens', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await query(`
      SELECT 
        m.id AS member_id,
        m.customer_number,
        m.first_name || ' ' || m.last_name AS member_name,
        m.email,
        m.total_monthly_price,
        m.payment_token,
        m.payment_method_type,
        p.id AS payment_id,
        p.transaction_id,
        p.amount AS payment_amount,
        p.status AS payment_status,
        p.epx_auth_guid,
        p.created_at AS payment_created
      FROM members m
      LEFT JOIN payments p ON m.id = p.member_id
      WHERE m.total_monthly_price IS NOT NULL 
        AND m.total_monthly_price > 0
        AND m.is_active = true
        AND (m.payment_token IS NULL OR m.payment_method_type IS NULL)
      ORDER BY m.enrollment_date DESC
    `);

    const membersWithoutTokens = result.rows || [];

    const totalAtRisk = membersWithoutTokens.reduce((sum, m) => {
      return sum + (parseFloat(m.total_monthly_price) || 0);
    }, 0);

    res.json({
      success: true,
      count: membersWithoutTokens.length,
      monthlyRevenueAtRisk: totalAtRisk.toFixed(2),
      annualRevenueAtRisk: (totalAtRisk * 12).toFixed(2),
      members: membersWithoutTokens,
      metadata: {
        queryDate: new Date().toISOString(),
        reportType: 'missing-bric-tokens',
        severity: membersWithoutTokens.length > 0 ? 'HIGH' : 'OK',
        impact: 'These members cannot be billed automatically for recurring charges'
      }
    });

  } catch (error: any) {
    console.error('[Reconciliation] Error finding missing tokens:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Revenue reconciliation summary dashboard
 */
router.get('/api/admin/reconciliation/dashboard', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Total expected revenue (active members)
    const expectedResult = await query(`
      SELECT 
        COUNT(*) AS active_members,
        SUM(total_monthly_price) AS expected_monthly_revenue
      FROM members
      WHERE is_active = true 
        AND total_monthly_price IS NOT NULL 
        AND total_monthly_price > 0
    `);

    // Total tracked payments (succeeded)
    const trackedResult = await query(`
      SELECT 
        COUNT(DISTINCT p.member_id) AS members_with_payments,
        SUM(CAST(p.amount AS NUMERIC)) AS total_payment_amount
      FROM payments p
      WHERE p.status = 'succeeded'
    `);

    // Members missing payments
    const missingPaymentsResult = await query(`
      SELECT COUNT(*) AS count
      FROM members m
      WHERE m.total_monthly_price IS NOT NULL 
        AND m.total_monthly_price > 0
        AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.member_id = m.id)
    `);

    // Members missing BRIC tokens
    const missingTokensResult = await query(`
      SELECT COUNT(*) AS count
      FROM members m
      WHERE m.is_active = true
        AND m.total_monthly_price IS NOT NULL 
        AND m.total_monthly_price > 0
        AND (m.payment_token IS NULL OR m.payment_method_type IS NULL)
    `);

    const expected = expectedResult.rows[0] || {};
    const tracked = trackedResult.rows[0] || {};
    const missingPayments = missingPaymentsResult.rows[0] || {};
    const missingTokens = missingTokensResult.rows[0] || {};

    const expectedRevenue = parseFloat(expected.expected_monthly_revenue) || 0;
    const trackedRevenue = parseFloat(tracked.total_payment_amount) || 0;
    const revenueGap = expectedRevenue - trackedRevenue;

    res.json({
      success: true,
      dashboard: {
        activeMembers: parseInt(expected.active_members) || 0,
        expectedMonthlyRevenue: expectedRevenue.toFixed(2),
        trackedPayments: parseInt(tracked.members_with_payments) || 0,
        trackedRevenue: trackedRevenue.toFixed(2),
        revenueGap: revenueGap.toFixed(2),
        revenueGapPercentage: expectedRevenue > 0 
          ? ((revenueGap / expectedRevenue) * 100).toFixed(2) 
          : '0.00',
        issues: {
          membersWithoutPayments: parseInt(missingPayments.count) || 0,
          membersWithoutTokens: parseInt(missingTokens.count) || 0,
          totalIssues: (parseInt(missingPayments.count) || 0) + (parseInt(missingTokens.count) || 0)
        }
      },
      metadata: {
        reportDate: new Date().toISOString(),
        severity: revenueGap > 0 ? 'WARNING' : 'OK'
      }
    });

  } catch (error: any) {
    console.error('[Reconciliation] Error generating dashboard:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Create manual payment record for member (admin recovery tool)
 */
router.post('/api/admin/reconciliation/create-manual-payment', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { memberId, amount, notes } = req.body;

    if (!memberId || !amount) {
      return res.status(400).json({ 
        error: 'memberId and amount are required' 
      });
    }

    // Get member details
    const member = await storage.getMemberById(memberId);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Check if payment already exists
    const existingPaymentResult = await query(
      'SELECT COUNT(*) AS count FROM payments WHERE member_id = $1',
      [memberId]
    );

    if (parseInt(existingPaymentResult.rows[0]?.count) > 0) {
      return res.status(409).json({ 
        error: 'Payment record already exists for this member' 
      });
    }

    // Create synthetic payment record const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const transactionId = `MANUAL-RECOVERY-M${memberId}-${timestamp}`;

    const paymentData = {
      memberId: memberId,
      userId: member.enrolled_by_agent_id || req.user.id,
      amount: amount.toString(),
      currency: 'USD',
      status: 'succeeded',
      paymentMethod: 'card',
      transactionId: transactionId,
      metadata: {
        environment: 'production',
        source: 'manual-recovery',
        reason: 'Payment record missing during enrollment - created retroactively',
        original_enrollment_date: member.enrollment_date,
        recovery_date: new Date().toISOString(),
        recovery_by: req.user.email,
        admin_notes: notes || 'No notes provided',
        member_customer_number: member.customer_number
      }
    };

    const createdPayment = await storage.createPayment(paymentData);

    res.json({
      success: true,
      payment: createdPayment,
      warning: 'This is a synthetic payment record for tracking only. It does not verify actual money receipt or provide BRIC token for recurring billing.'
    });

  } catch (error: any) {
    console.error('[Reconciliation] Error creating manual payment:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;
