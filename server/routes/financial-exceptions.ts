import { Router, Response } from 'express';
import { authenticateToken, type AuthRequest } from '../auth/supabaseAuth';
import { isAtLeastAdmin } from '../auth/roles';
import { query } from '../lib/neonDb';
import { getFinancialException, listFinancialExceptions, resolveFinancialException, retryFinancialException } from '../services/financial-reconciliation-service';
import { getCommissionCenterAggregation } from '../services/commission-center-aggregation-service';
import { resolveCommissionCenterIdentity } from '../services/commission-center-authorization';

const router = Router();
const requireAdmin = (req: AuthRequest, res: Response): boolean => {
  if (!isAtLeastAdmin(req.user?.role)) {
    res.status(403).json({ error: 'Admin authorization required' });
    return false;
  }
  return true;
};

router.get('/api/admin/billing-operations', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const [configurationResult, recentRunsResult, cycleCountsResult, attentionCyclesResult, dueSubscriptionsResult, notificationsResult] = await Promise.all([
      query(`
        SELECT enabled, mode, kill_switch, business_timezone, updated_at, updated_by
        FROM public.recurring_billing_configuration
        WHERE singleton = TRUE
        LIMIT 1
      `),
      query(`
        SELECT id, trigger_source, scheduled_at, started_at, completed_at, mode, status,
               selected_count, claimed_count, succeeded_count, declined_count,
               unknown_count, skipped_count, internal_pending_count,
               amount_succeeded, amount_declined, amount_unknown, error_message
        FROM public.recurring_billing_runs
        ORDER BY id DESC
        LIMIT 12
      `),
      query(`
        SELECT state, COUNT(*)::int AS count
        FROM public.recurring_billing_cycles
        GROUP BY state
        ORDER BY state
      `),
      query(`
        SELECT c.id, c.subscription_id, c.member_id, c.cycle_date, c.amount,
               c.payment_method_type, c.state, c.attempt_count, c.next_attempt_at,
               c.processor_response_code, c.processor_response_message,
               c.failure_classification, c.skip_reason, c.processor_submitted_at,
               c.processor_responded_at, c.payment_id, c.updated_at,
               m.customer_number, m.first_name, m.last_name, m.email,
               s.next_billing_date, s.billing_mode, s.status AS subscription_status
        FROM public.recurring_billing_cycles c
        LEFT JOIN public.members m ON m.id = c.member_id
        LEFT JOIN public.subscriptions s ON s.id = c.subscription_id
        WHERE c.state IN ('declined', 'unknown', 'submitting', 'internal_sync_pending')
           OR c.failure_classification = 'decline_requires_attention'
        ORDER BY c.updated_at DESC
        LIMIT 50
      `),
      query(`
        SELECT s.id AS subscription_id, s.member_id, s.amount, s.next_billing_date,
               s.billing_mode, s.status AS subscription_status,
               m.customer_number, m.first_name, m.last_name, m.email,
               COALESCE(token.payment_method_type, m.payment_method_type) AS payment_method_type,
               CASE
                 WHEN token.original_network_trans_id ~ '^[A-Za-z0-9-]{8,128}$'
                   THEN 'payment_tokens.original_network_trans_id'
                 WHEN latest_payment.epx_auth_guid ~ '^[A-Za-z0-9-]{8,128}$'
                   THEN 'payments.epx_auth_guid'
                 WHEN token.bric_token ~ '^[A-Za-z0-9-]{8,128}$'
                   THEN 'payment_tokens.bric_token'
                 ELSE NULL
               END AS credential_source,
               CASE
                 WHEN token.original_network_trans_id ~ '^[A-Za-z0-9-]{8,128}$'
                   OR latest_payment.epx_auth_guid ~ '^[A-Za-z0-9-]{8,128}$'
                   OR token.bric_token ~ '^[A-Za-z0-9-]{8,128}$'
                   THEN 'ready'
                 ELSE 'missing_or_invalid'
               END AS credential_status,
               latest_cycle.state AS latest_cycle_state,
               latest_cycle.attempt_count AS latest_cycle_attempt_count,
               latest_cycle.failure_classification AS latest_cycle_failure_classification,
               latest_cycle.next_attempt_at AS latest_cycle_next_attempt_at
        FROM public.subscriptions s
        JOIN public.members m ON m.id = s.member_id
        LEFT JOIN LATERAL (
          SELECT pt.payment_method_type, pt.original_network_trans_id, pt.bric_token
          FROM public.payment_tokens pt
          WHERE pt.member_id = s.member_id
            AND pt.is_active = TRUE
          ORDER BY pt.is_primary DESC, pt.id DESC
          LIMIT 1
        ) token ON TRUE
        LEFT JOIN LATERAL (
          SELECT p.epx_auth_guid
          FROM public.payments p
          WHERE p.member_id = s.member_id
            AND p.epx_auth_guid IS NOT NULL
            AND lower(COALESCE(p.status, '')) IN ('success', 'succeeded', 'completed')
          ORDER BY COALESCE(p.payment_transaction_at, p.created_at) DESC, p.id DESC
          LIMIT 1
        ) latest_payment ON TRUE
        LEFT JOIN LATERAL (
          SELECT c.state, c.attempt_count, c.failure_classification, c.next_attempt_at
          FROM public.recurring_billing_cycles c
          WHERE c.subscription_id = s.id
          ORDER BY c.cycle_date DESC, c.id DESC
          LIMIT 1
        ) latest_cycle ON TRUE
        WHERE s.status = 'active'
          AND s.billing_mode = 'automatic'
          AND m.is_active = TRUE
          AND m.status = 'active'
          AND s.next_billing_date::date <= (NOW() AT TIME ZONE 'America/Chicago')::date
        ORDER BY s.next_billing_date ASC, s.id ASC
        LIMIT 100
      `),
      query(`
        SELECT id, type, member_id, subscription_id, error_message, metadata, created_at
        FROM public.admin_notifications
        WHERE resolved = FALSE
          AND type = 'recurring_billing_exception'
        ORDER BY created_at DESC
        LIMIT 50
      `),
    ]);

    const cycleCounts = Object.fromEntries(cycleCountsResult.rows.map((row: any) => [row.state, Number(row.count || 0)]));
    const dueSubscriptions = dueSubscriptionsResult.rows;
    const missingCredentialCount = dueSubscriptions.filter((row: any) => row.credential_status !== 'ready').length;
    const terminalDeclineCount = attentionCyclesResult.rows.filter((row: any) => row.failure_classification === 'decline_requires_attention').length;
    const unknownOrSubmittingCount = attentionCyclesResult.rows.filter((row: any) => row.state === 'unknown' || row.state === 'submitting').length;
    const internalSyncPendingCount = attentionCyclesResult.rows.filter((row: any) => row.state === 'internal_sync_pending').length;

    res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      configuration: configurationResult.rows[0] || null,
      summary: {
        dueActiveAutomatic: dueSubscriptions.length,
        missingCredential: missingCredentialCount,
        terminalDeclines: terminalDeclineCount,
        unknownOrSubmitting: unknownOrSubmittingCount,
        internalSyncPending: internalSyncPendingCount,
        openBillingNotifications: notificationsResult.rows.length,
      },
      cycleCounts,
      recentRuns: recentRunsResult.rows,
      attentionCycles: attentionCyclesResult.rows,
      dueSubscriptions,
      openNotifications: notificationsResult.rows,
      notes: {
        dueSubscriptions: 'Subscription-level operational snapshot. The durable billing candidate selector remains authoritative for group-payer and controlled-retry decisions.',
        credentials: 'Credential values are intentionally not returned. Only readiness and source are exposed.',
        safety: 'This endpoint is read-only and cannot submit payments, retry processor calls, or alter billing state.',
      },
    });
  }
  catch (error: any) { res.status(500).json({ error: error?.message || 'Failed to load billing operations snapshot' }); }
});

router.get('/api/admin/financial-exceptions', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try { res.json({ success: true, exceptions: await listFinancialExceptions({ status: req.query.status ? String(req.query.status) : undefined, limit: Number(req.query.limit) || 100 }) }); }
  catch (error: any) { res.status(500).json({ error: error?.message || 'Failed to load financial exceptions' }); }
});

router.get('/api/admin/financial-exceptions/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try { const exception = await getFinancialException(req.params.id); if (!exception) return res.status(404).json({ error: 'Financial exception not found' }); res.json({ success: true, exception }); }
  catch (error: any) { res.status(500).json({ error: error?.message || 'Failed to load financial exception' }); }
});

router.post('/api/admin/financial-exceptions/:id/retry', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try { res.json({ success: true, exception: await retryFinancialException(req.params.id, req.user?.id || null) }); }
  catch (error: any) { res.status(409).json({ error: error?.message || 'Financial retry failed' }); }
});

router.post('/api/admin/financial-exceptions/:id/resolve', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try { res.json({ success: true, exception: await resolveFinancialException(req.params.id, req.user?.id || '', String(req.body?.reason || ''), req.body?.status === 'ignored' ? 'ignored' : 'resolved') }); }
  catch (error: any) { res.status(400).json({ error: error?.message || 'Financial exception resolution failed' }); }
});

router.get('/api/admin/commission-center/aggregation', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.json({ success: true, data: await getCommissionCenterAggregation(req.query.agentId ? String(req.query.agentId) : undefined) });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to load commission aggregation' });
  }
});

router.get('/api/agent/commission-center', authenticateToken, async (req: AuthRequest, res: Response) => {
  const authorization = resolveCommissionCenterIdentity({
    realUser: req.realUser,
    user: req.user,
    impersonationSession: req.impersonationSession,
    impersonationContextError: req.impersonationContextError,
  });
  if (!authorization.ok) {
    console.warn('[CommissionCenter] Authorization denied:', {
      realActorUserId: req.realUser?.id || null,
      realActorRole: req.realUser?.role || null,
      effectiveUserId: req.user?.id || null,
      effectiveRole: req.user?.role || null,
      reason: authorization.reason,
    });
    return res.status(403).json({ error: 'Agent authorization required' });
  }
  try {
    const data = await getCommissionCenterAggregation(authorization.identity.effectiveAgentUserId);
    res.json({ success: true, data });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message.toLowerCase().includes('column') || message.toLowerCase().includes('relation')) {
      console.warn(`[CommissionCenter] FINANCIAL SCHEMA MIGRATION REQUIRED: ${message}`);
      return res.status(503).json({ error: 'Commission information is temporarily unavailable.', code: 'FINANCIAL_SCHEMA_MIGRATION_REQUIRED' });
    }
    res.status(500).json({ error: 'Commission information is temporarily unavailable.' });
  }
});

export default router;
