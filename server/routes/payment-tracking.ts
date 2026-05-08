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

const normalizeBooleanQuery = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

const normalizePositiveNumber = (value: unknown, fallback: number, min = 1, max = 10000): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

const normalizeStatus = (value: unknown): string => String(value || '').trim().toLowerCase();

const buildPaymentVerification = (payment: any) => {
  const metadata = (payment?.metadata && typeof payment.metadata === 'object') ? payment.metadata : {};
  const status = normalizeStatus(payment?.status);
  const callbackStatus = normalizeStatus(
    metadata.callbackStatus
    || metadata.hostedCallbackStatus
    || metadata.epxCallbackStatus
    || metadata.Status
  );
  const authResp = normalizeStatus(metadata.AUTH_RESP || metadata.authResp);

  const callbackApproved = metadata.callbackApproved === true
    || metadata.hostedCallbackApproved === true
    || ['approved', 'success', 'succeeded', 'completed'].includes(callbackStatus)
    || ['00', '0'].includes(authResp);

  const processorConfirmed = ['succeeded', 'success', 'completed'].includes(status)
    || callbackApproved
    || metadata.processorApproved === true;

  const requiresReview = metadata.requiresReview === true || metadata.reviewRequired === true;

  let finalizationState: 'finalized' | 'requires_review' | 'pending' | 'failed' | 'unknown' = 'unknown';
  if (processorConfirmed && requiresReview) {
    finalizationState = 'requires_review';
  } else if (processorConfirmed) {
    finalizationState = 'finalized';
  } else if (['pending', 'processing', 'authorized'].includes(status)) {
    finalizationState = 'pending';
  } else if (['failed', 'declined', 'canceled', 'cancelled'].includes(status)) {
    finalizationState = 'failed';
  }

  const normalizedCommissionStatus = normalizeStatus(payment?.commission_status || payment?.commissionStatus);
  const commissionState = normalizedCommissionStatus
    || (metadata.commissionCreated === true || metadata.commissionTriggered === true
      ? 'created'
      : processorConfirmed
        ? 'pending_or_unknown'
        : 'not_applicable');

  return {
    processorConfirmed,
    callbackApproved,
    finalizationState,
    commissionState,
    transactionId: payment?.transaction_id || payment?.transactionId || null,
    authGuidPresent: Boolean(payment?.epx_auth_guid),
    archivedFromAttention: metadata.attentionArchived === true,
  };
};

const attachVerification = <T extends Record<string, any>>(payments: T[]): Array<T & { verification: ReturnType<typeof buildPaymentVerification> }> => {
  return payments.map((payment) => ({
    ...payment,
    verification: buildPaymentVerification(payment),
  }));
};

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
    const includeArchived = normalizeBooleanQuery(req.query.includeArchived);

    const payments = await storage.getRecentPaymentsDetailed({ limit, status, includeArchived });
    const enrichedPayments = attachVerification(payments);

    res.json({
      success: true,
      payments: enrichedPayments,
      total: enrichedPayments.length
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

    const enrichedPayments = attachVerification(result.rows || []);

    res.json({
      success: true,
      payments: enrichedPayments,
      total: enrichedPayments.length
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
    const includeArchived = normalizeBooleanQuery(req.query.includeArchived);

    const archiveFilter = includeArchived
      ? ''
      : "AND COALESCE(LOWER(p.metadata->>'attentionArchived'), 'false') <> 'true'";

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
        ${archiveFilter}
        ORDER BY p.created_at DESC
        LIMIT $1
      `,
      [limit]
    );

    const enrichedPayments = attachVerification(result.rows || []);

    res.json({
      success: true,
      payments: enrichedPayments,
      total: enrichedPayments.length
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
 * Archive stale failed/pending payments from attention dashboards.
 * Uses metadata flags so records remain fully auditable and recoverable.
 */
router.post('/api/admin/payments/archive-stale', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const mode = String(req.body?.mode || 'preview').toLowerCase() === 'apply' ? 'apply' : 'preview';
    const pendingOlderThanHours = normalizePositiveNumber(req.body?.pendingOlderThanHours, 24, 1, 24 * 60);
    const failedOlderThanHours = normalizePositiveNumber(req.body?.failedOlderThanHours, 72, 1, 24 * 180);

    const staleWhere = `
      COALESCE(LOWER(p.metadata->>'attentionArchived'), 'false') <> 'true'
      AND (
        (p.status = 'pending' AND p.created_at < NOW() - ($1::int * INTERVAL '1 hour'))
        OR (p.status IN ('failed', 'declined', 'canceled') AND p.created_at < NOW() - ($2::int * INTERVAL '1 hour'))
      )
    `;

    const summaryResult = await query(
      `
        SELECT
          COUNT(*)::int AS total_candidates,
          COUNT(*) FILTER (WHERE p.status = 'pending')::int AS pending_candidates,
          COUNT(*) FILTER (WHERE p.status IN ('failed', 'declined', 'canceled'))::int AS failed_candidates
        FROM payments p
        WHERE ${staleWhere}
      `,
      [pendingOlderThanHours, failedOlderThanHours]
    );

    const summary = summaryResult.rows[0] || {
      total_candidates: 0,
      pending_candidates: 0,
      failed_candidates: 0,
    };

    const sampleResult = await query(
      `
        SELECT p.id, p.member_id, p.status, p.transaction_id, p.created_at, p.amount
        FROM payments p
        WHERE ${staleWhere}
        ORDER BY p.created_at ASC
        LIMIT 50
      `,
      [pendingOlderThanHours, failedOlderThanHours]
    );

    if (mode === 'preview') {
      return res.json({
        success: true,
        mode,
        thresholds: {
          pendingOlderThanHours,
          failedOlderThanHours,
        },
        summary: {
          totalCandidates: Number(summary.total_candidates) || 0,
          pendingCandidates: Number(summary.pending_candidates) || 0,
          failedCandidates: Number(summary.failed_candidates) || 0,
        },
        sample: sampleResult.rows || [],
      });
    }

    const applyResult = await query(
      `
        WITH updated AS (
          UPDATE payments p
          SET
            metadata = COALESCE(p.metadata, '{}'::jsonb) || jsonb_build_object(
              'attentionArchived', true,
              'attentionArchivedAt', NOW(),
              'attentionArchivedBy', $3,
              'attentionArchivedReason', 'stale_failed_pending_cleanup',
              'attentionArchivePendingOlderThanHours', $1,
              'attentionArchiveFailedOlderThanHours', $2
            ),
            updated_at = NOW()
          WHERE ${staleWhere}
          RETURNING id
        )
        SELECT COUNT(*)::int AS archived_count FROM updated
      `,
      [pendingOlderThanHours, failedOlderThanHours, req.user.id]
    );

    res.json({
      success: true,
      mode,
      thresholds: {
        pendingOlderThanHours,
        failedOlderThanHours,
      },
      archivedCount: Number(applyResult.rows?.[0]?.archived_count) || 0,
      previousCandidateSummary: {
        totalCandidates: Number(summary.total_candidates) || 0,
        pendingCandidates: Number(summary.pending_candidates) || 0,
        failedCandidates: Number(summary.failed_candidates) || 0,
      },
      sample: sampleResult.rows || [],
    });
  } catch (error: any) {
    console.error('[Payment Tracking] Error archiving stale payments:', error);
    res.status(500).json({
      error: 'Failed to archive stale payments',
      message: error.message,
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
          m.id,
          m.first_name AS "firstName",
          m.last_name AS "lastName",
          m.email,
          m.phone,
          m.date_of_birth AS "dateOfBirth",
          m.address,
          m.city,
          m.state,
          m.zip_code AS "zipCode",
          m.member_public_id AS "memberPublicId",
          m.customer_number AS "customerNumber",
          m.plan_id AS "planId",
          m.member_type AS "memberType",
          m.total_monthly_price AS "totalMonthlyPrice",
          m.enrolled_by_agent_id AS "enrolledByAgentId",
          COALESCE(u.agent_number, '') || ' - ' || u.first_name || ' ' || u.last_name AS "enrolledBy",
          m.status,
          m.created_at AS "createdAt",
          m.updated_at AS "updatedAt",
          m.membership_start_date AS "membershipStartDate",
          pl.name AS "planName",
          u.first_name AS "agentFirstName",
          u.last_name AS "agentLastName",
          u.email AS "agentEmail",
          u.agent_number AS "agentNumber",
          p.id AS "paymentId",
          p.status AS "payment_status",
          p.amount AS "paymentAmount",
          p.transaction_id,
          p.created_at AS "payment_date",
          p.epx_auth_guid AS "epxAuthGuid",
          s.id AS "subscriptionId",
          s.status AS "subscriptionStatus",
          s.next_billing_date AS "nextBillingDate",
          s.end_date AS "subscriptionEndDate",
          s.pending_reason AS "subscriptionPendingReason",
          s.pending_details AS "subscriptionPendingDetails"
        FROM members m
        LEFT JOIN plans pl ON m.plan_id = pl.id
        LEFT JOIN users u ON m.enrolled_by_agent_id::uuid = u.id
        LEFT JOIN LATERAL (
          SELECT * FROM payments 
          WHERE member_id = m.id 
          ORDER BY created_at DESC 
          LIMIT 1
        ) p ON true
        LEFT JOIN LATERAL (
          SELECT * FROM subscriptions
          WHERE member_id = m.id
          ORDER BY
            CASE WHEN status = 'active' THEN 0 ELSE 1 END,
            COALESCE(updated_at, created_at) DESC,
            id DESC
          LIMIT 1
        ) s ON true
        WHERE m.status != 'archived'
        ${agentFilter}
        ORDER BY m.created_at DESC
        LIMIT $1
      `,
      params
    );

    const enrichLifecycleSummary = (row: any) => {
      const paymentStatus = String(row?.payment_status || '').toLowerCase();
      const paymentRiskStatus = ['failed', 'declined', 'canceled', 'cancelled'].includes(paymentStatus)
        ? 'failed'
        : paymentStatus === 'pending'
          ? 'pending'
          : paymentStatus === ''
            ? 'unknown'
            : 'ok';

      const toPaidThroughDate = (nextBillingDate?: string | null): string | null => {
        if (!nextBillingDate) return null;
        const parsed = new Date(nextBillingDate);
        if (Number.isNaN(parsed.getTime())) return null;
        parsed.setUTCDate(parsed.getUTCDate() - 1);
        return parsed.toISOString().slice(0, 10);
      };

      const pendingAction = row?.subscriptionPendingReason || null;
      const nextBillingDate = row?.nextBillingDate || null;
      const accessThroughDate = row?.subscriptionEndDate || null;

      return {
        ...row,
        lifecycleSummary: {
          subscriptionStatus: row?.subscriptionStatus || null,
          pendingAction,
          nextBillingDate,
          accessThroughDate,
          paidThroughDate: toPaidThroughDate(nextBillingDate),
          paymentRiskStatus,
          commissionStatus: null,
        },
      };
    };

    const enrollments = (result.rows || []).map(enrichLifecycleSummary);

    res.json({
      success: true,
      enrollments,
      total: enrollments.length
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
