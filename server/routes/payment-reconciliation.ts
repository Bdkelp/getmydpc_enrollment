/**
 * Payment Reconciliation Routes
 * Detects and reports members with missing or incomplete payment tracking
 */

import { Router, Response } from "express";
import { storage } from "../storage";
import { authenticateToken, type AuthRequest } from "../auth/supabaseAuth";
import { isAtLeastAdmin } from "../auth/roles";
import { query } from "../lib/neonDb";

const router = Router();

/**
 * Find all members with missing payment records
 * These represent broken enrollment flows where commission was created but payment wasn't tracked
 */
router.get(
  "/api/admin/reconciliation/missing-payments",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user || !isAtLeastAdmin(req.user.role)) {
        return res.status(403).json({ error: "Admin access required" });
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
          reportType: "missing-payments",
          severity: membersWithoutPayments.length > 0 ? "CRITICAL" : "OK",
        },
      });
    } catch (error: any) {
      console.error("[Reconciliation] Error finding missing payments:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
);

/**
 * Find payments without BRIC tokens (can't charge recurring)
 */
router.get(
  "/api/admin/reconciliation/missing-tokens",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user || !isAtLeastAdmin(req.user.role)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const result = await query(`
      SELECT
        m.id AS member_id,
        m.customer_number,
        m.first_name || ' ' || m.last_name AS member_name,
        m.email,
        m.total_monthly_price,
        s.id AS subscription_id,
        s.billing_mode,
        s.pending_reason,
        token.id AS payment_token_id,
        token.payment_method_type,
        token.card_last_four,
        receipt.id AS payment_id,
        CASE
          WHEN group_payer.is_group_paid THEN 'group_payment_managed_separately'
          WHEN s.billing_mode <> 'automatic' THEN 'billing_mode_' || s.billing_mode
          WHEN s.pending_reason = 'member_cancelled' THEN 'scheduled_cancellation'
          WHEN NULLIF(TRIM(token.original_network_trans_id), '') IS NOT NULL THEN 'original_network_reference_available'
          WHEN NULLIF(TRIM(receipt.epx_auth_guid), '') IS NOT NULL THEN 'payment_auth_guid_fallback_available'
          WHEN NULLIF(TRIM(token.bric_token), '') IS NOT NULL THEN NULL
          ELSE 'missing_all_processor_references'
        END AS exception_reason,
        NOT COALESCE(group_payer.is_group_paid, false)
          AND s.billing_mode = 'automatic'
          AND COALESCE(s.pending_reason, '') <> 'member_cancelled'
          AND NULLIF(TRIM(token.original_network_trans_id), '') IS NULL
          AND NULLIF(TRIM(receipt.epx_auth_guid), '') IS NULL
          AND NULLIF(TRIM(token.bric_token), '') IS NULL AS requires_action
      FROM members m
      INNER JOIN subscriptions s ON s.member_id = m.id AND s.status = 'active'
      LEFT JOIN LATERAL (
        SELECT true AS is_group_paid
        FROM group_members gm
        INNER JOIN groups g ON g.id = gm.group_id
        WHERE gm.member_id = m.id
          AND COALESCE(gm.status, '') <> 'terminated'
          AND LOWER(COALESCE(NULLIF(gm.payor_type, ''), NULLIF(g.payor_type, ''), '')) = 'full'
        LIMIT 1
      ) group_payer ON true
      LEFT JOIN LATERAL (
        SELECT pt.id, pt.payment_method_type, pt.card_last_four,
               pt.bric_token, pt.original_network_trans_id
        FROM payment_tokens pt
        WHERE pt.member_id = m.id AND pt.is_active = true
        ORDER BY pt.is_primary DESC, COALESCE(pt.last_used_at, pt.created_at) DESC, pt.id DESC
        LIMIT 1
      ) token ON true
      LEFT JOIN LATERAL (
        SELECT p.id, p.epx_auth_guid
        FROM payments p
        WHERE p.member_id = m.id AND p.epx_auth_guid IS NOT NULL
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT 1
      ) receipt ON true
      WHERE m.total_monthly_price IS NOT NULL
        AND m.total_monthly_price > 0
        AND m.is_active = true
        AND (
          COALESCE(group_payer.is_group_paid, false)
          OR s.billing_mode <> 'automatic'
          OR s.pending_reason = 'member_cancelled'
          OR NULLIF(TRIM(token.bric_token), '') IS NULL
        )
      ORDER BY m.enrollment_date DESC
    `);

      const reportedRows = result.rows || [];
      const membersWithoutTokens = reportedRows.filter(
        (row) => row.requires_action === true,
      );
      const exceptions = reportedRows.filter(
        (row) => row.requires_action !== true,
      );

      const totalAtRisk = membersWithoutTokens.reduce((sum, m) => {
        return sum + (parseFloat(m.total_monthly_price) || 0);
      }, 0);

      res.json({
        success: true,
        count: membersWithoutTokens.length,
        exceptionCount: exceptions.length,
        monthlyRevenueAtRisk: totalAtRisk.toFixed(2),
        annualRevenueAtRisk: (totalAtRisk * 12).toFixed(2),
        members: membersWithoutTokens,
        exceptions,
        metadata: {
          queryDate: new Date().toISOString(),
          reportType: "missing-bric-tokens",
          severity: membersWithoutTokens.length > 0 ? "HIGH" : "OK",
          impact:
            "Only requires_action rows lack every authorized recurring processor reference",
        },
      });
    } catch (error: any) {
      console.error("[Reconciliation] Error finding missing tokens:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
);

/**
 * Revenue reconciliation summary dashboard
 */
router.get(
  "/api/admin/reconciliation/dashboard",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user || !isAtLeastAdmin(req.user.role)) {
        return res.status(403).json({ error: "Admin access required" });
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
      FROM subscriptions s
      INNER JOIN members m ON m.id = s.member_id
      WHERE s.status = 'active'
        AND s.billing_mode = 'automatic'
        AND COALESCE(s.pending_reason, '') <> 'member_cancelled'
        AND m.is_active = true
        AND m.total_monthly_price > 0
        AND NOT EXISTS (
          SELECT 1 FROM group_members gm
          INNER JOIN groups g ON g.id = gm.group_id
          WHERE gm.member_id = m.id
            AND COALESCE(gm.status, '') <> 'terminated'
            AND LOWER(COALESCE(NULLIF(gm.payor_type, ''), NULLIF(g.payor_type, ''), '')) = 'full'
        )
        AND NOT EXISTS (
          SELECT 1 FROM payment_tokens pt
          WHERE pt.member_id = m.id AND pt.is_active = true
            AND (
              NULLIF(TRIM(pt.bric_token), '') IS NOT NULL
              OR NULLIF(TRIM(pt.original_network_trans_id), '') IS NOT NULL
            )
        )
        AND NOT EXISTS (
          SELECT 1 FROM payments p
          WHERE p.member_id = m.id AND NULLIF(TRIM(p.epx_auth_guid), '') IS NOT NULL
        )
    `);

      const expected = expectedResult.rows[0] || {};
      const tracked = trackedResult.rows[0] || {};
      const missingPayments = missingPaymentsResult.rows[0] || {};
      const missingTokens = missingTokensResult.rows[0] || {};

      const expectedRevenue =
        parseFloat(expected.expected_monthly_revenue) || 0;
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
          revenueGapPercentage:
            expectedRevenue > 0
              ? ((revenueGap / expectedRevenue) * 100).toFixed(2)
              : "0.00",
          issues: {
            membersWithoutPayments: parseInt(missingPayments.count) || 0,
            membersWithoutTokens: parseInt(missingTokens.count) || 0,
            totalIssues:
              (parseInt(missingPayments.count) || 0) +
              (parseInt(missingTokens.count) || 0),
          },
        },
        metadata: {
          reportDate: new Date().toISOString(),
          severity: revenueGap > 0 ? "WARNING" : "OK",
        },
      });
    } catch (error: any) {
      console.error("[Reconciliation] Error generating dashboard:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
);

/** Retained temporarily so stale clients fail closed with migration guidance. */
router.post(
  "/api/admin/reconciliation/create-manual-payment",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
      return res.status(403).json({ error: "Admin access required" });
    }

    return res.status(410).json({
      success: false,
      error:
        "Synthetic succeeded payments are no longer supported. Use the Super Admin payment-status workflow with processedExternally=true, an external method, and an external reference.",
    });
  },
);

export default router;
