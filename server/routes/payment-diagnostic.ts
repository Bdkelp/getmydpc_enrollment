/**
 * Payment Execution Diagnostic Tool
 * Checks if member #7 actually completed payment through EPX
 */

import { Router, Response } from 'express';
import { storage, decryptPaymentToken, getPlatformSetting, upsertPlatformSetting } from '../storage';
import { authenticateToken, type AuthRequest } from '../auth/supabaseAuth';
import { hasAtLeastRole, isAtLeastAdmin } from '../auth/roles';
import { query } from '../lib/neonDb';
import { getRecentEPXLogs } from '../services/epx-payment-logger';
import {
  getRecurringBillingSchedulerStatus,
  runRecurringBillingCycleOnce,
} from '../services/recurring-billing-scheduler';
import {
  syncCommissionLedgerFromFeed,
  buildDraftPayoutBatches,
  getPayoutDashboardData,
} from '../services/commission-ledger-service';
import { calculateNextBillingDate } from '../utils/membership-dates';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();
const RECURRING_CARD_AUTH_REPAIR_SETTING_KEY = 'recurring_card_auth_guid_repair_v1';

type OperatorMode = 'preview' | 'live';

const maskAuthGuid = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.length > 8
    ? `${normalized.slice(0, 4)}****${normalized.slice(-4)}`
    : '********';
};

const looksLikeEncryptedToken = (value: string): boolean => {
  const parts = value.split(':');
  if (parts.length !== 2) return false;
  return /^[0-9a-f]+$/i.test(parts[0]) && /^[0-9a-f]+$/i.test(parts[1]);
};

const isUsableAuthGuid = (value: string | null | undefined): value is string => {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  // EPX ORIG_AUTH_GUID/AUTH_GUID samples are token-like and can be ~19 chars.
  if (normalized.length < 16 || normalized.length > 64) return false;
  return /^[A-Za-z0-9-]+$/.test(normalized);
};

const isUsableTrustedAuthGuid = (value: string | null | undefined): value is string => {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 128) return false;
  return /^[A-Za-z0-9-]+$/.test(normalized);
};

const resolveAuthGuidForRepairRow = (row: any): {
  authGuid: string | null;
  source: 'payments.epx_auth_guid' | 'members.payment_token' | 'payment_tokens.bric_token_plain' | 'payment_tokens.bric_token_decrypted' | null;
  unresolvedReason: string | null;
} => {
  const paymentAuthGuid = typeof row?.epx_auth_guid === 'string' ? row.epx_auth_guid.trim() : '';
  if (isUsableTrustedAuthGuid(paymentAuthGuid)) {
    return { authGuid: paymentAuthGuid, source: 'payments.epx_auth_guid', unresolvedReason: null };
  }

  const memberPaymentToken = typeof row?.member_payment_token === 'string' ? row.member_payment_token.trim() : '';
  if (memberPaymentToken) {
    if (!looksLikeEncryptedToken(memberPaymentToken) && isUsableTrustedAuthGuid(memberPaymentToken)) {
      return { authGuid: memberPaymentToken, source: 'members.payment_token', unresolvedReason: null };
    }

    if (looksLikeEncryptedToken(memberPaymentToken)) {
      try {
        const decryptedMemberToken = decryptPaymentToken(memberPaymentToken).trim();
        if (isUsableAuthGuid(decryptedMemberToken)) {
          return { authGuid: decryptedMemberToken, source: 'members.payment_token', unresolvedReason: null };
        }
      } catch {
        // Continue to token fallback resolution
      }
    }
  }

  const tokenValue = typeof row?.bric_token === 'string' ? row.bric_token.trim() : '';
  if (!tokenValue) {
    return { authGuid: null, source: null, unresolvedReason: 'No token data available for auth GUID resolution' };
  }

  if (!looksLikeEncryptedToken(tokenValue) && isUsableAuthGuid(tokenValue)) {
    return { authGuid: tokenValue, source: 'payment_tokens.bric_token_plain', unresolvedReason: null };
  }

  try {
    const decrypted = decryptPaymentToken(tokenValue).trim();
    if (isUsableAuthGuid(decrypted)) {
      return { authGuid: decrypted, source: 'payment_tokens.bric_token_decrypted', unresolvedReason: null };
    }
    return { authGuid: null, source: null, unresolvedReason: 'Decrypted token did not produce a usable auth GUID' };
  } catch {
    return { authGuid: null, source: null, unresolvedReason: 'Token decryption failed for repair candidate' };
  }
};

const isRecentCycleEntry = (entryAt: string | undefined, startedAt: string, completedAt: string): boolean => {
  if (!entryAt) return false;
  const entryTs = Date.parse(entryAt);
  const startTs = Date.parse(startedAt);
  const endTs = Date.parse(completedAt);
  if (!Number.isFinite(entryTs) || !Number.isFinite(startTs) || !Number.isFinite(endTs)) return false;
  return entryTs >= startTs - 1000 && entryTs <= endTs + 1000;
};

const formatReadinessState = (chargeAttempt: any | undefined): string => {
  if (!chargeAttempt) {
    return 'pending_review';
  }

  if (chargeAttempt.chargeAttemptResult === 'dry_run') {
    return 'ready_preview';
  }

  if (chargeAttempt.chargeAttemptResult === 'success') {
    return 'charged_success';
  }

  if (chargeAttempt.skipped) {
    return chargeAttempt.skipReason ? `skipped_${chargeAttempt.skipReason}` : 'skipped';
  }

  return chargeAttempt.chargeAttemptResult || 'not_ready';
};

const summarizeBillingOutcomes = (chargeAttempts: any[]) => {
  const succeeded = chargeAttempts.filter((entry) => entry.chargeAttemptResult === 'success').length;
  const skipped = chargeAttempts.filter((entry) => entry.skipped || entry.chargeAttemptResult === 'skipped').length;
  const failed = chargeAttempts.filter((entry) => {
    if (entry.chargeAttemptResult === 'success') return false;
    if (entry.skipped || entry.chargeAttemptResult === 'skipped') return false;
    return true;
  }).length;

  return {
    processed: chargeAttempts.length,
    succeeded,
    failed,
    skipped,
  };
};

const buildCycleRows = (dueDecisions: any[], chargeAttempts: any[]) => {
  const chargeByKey = new Map<string, any>();
  for (const charge of chargeAttempts) {
    const key = `${charge.subscriptionId}:${charge.memberId}`;
    if (!chargeByKey.has(key)) {
      chargeByKey.set(key, charge);
    }
  }

  return dueDecisions.map((due) => {
    const key = `${due.subscriptionId}:${due.memberId}`;
    const chargeAttempt = chargeByKey.get(key);
    return {
      subscriptionId: due.subscriptionId,
      memberId: due.memberId,
      memberOrAccountName: due.payerDisplayName || `Member ${due.memberId}`,
      payerType: due.payerType,
      amount: Number(due.amount || 0),
      nextBillingDate: due.nextBillingDate || null,
      readinessState: formatReadinessState(chargeAttempt),
      skipReason: chargeAttempt?.skipReason || null,
      chargeAttemptResult: chargeAttempt?.chargeAttemptResult || null,
      billingEventId: chargeAttempt?.billingEventId ?? null,
    };
  });
};

type ReconciliationMode = 'preview' | 'apply';

const normalizePaymentStatus = (value: unknown): string => String(value || '').trim().toLowerCase();
const normalizeCallbackStatus = (value: unknown): string => String(value || '').trim().toLowerCase();
const isPaymentSucceededStatus = (status: string): boolean => ['succeeded', 'success', 'completed'].includes(status);
const isCallbackSuccessStatus = (status: string): boolean => ['success', 'succeeded', 'approved'].includes(status);

const parseNumericId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.trunc(parsed);
    }
  }
  return null;
};

const toIsoDate = (value: unknown): string | null => {
  if (!value) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const loadRecurringLogRows = async (billingEventIds: number[]) => {
  if (billingEventIds.length === 0) return [];
  const result = await query(
    `
      SELECT id, member_id, payment_id, status, created_at
      FROM recurring_billing_log
      WHERE id = ANY($1::int[])
    `,
    [billingEventIds],
  );
  return result.rows || [];
};

const loadCommissionPayoutRowsForPayments = async (paymentIds: number[], startedAt: string) => {
  if (paymentIds.length === 0) return [];
  const result = await query(
    `
      SELECT id, member_payment_id, created_at
      FROM commission_payouts
      WHERE member_payment_id = ANY($1::int[])
        AND created_at >= $2::timestamptz
    `,
    [paymentIds, startedAt],
  );
  return result.rows || [];
};

const runCommissionFollowUpSequence = async () => {
  const commissionFeed = await storage.getAllCommissionsNew();
  const syncResult = await syncCommissionLedgerFromFeed(commissionFeed || []);
  const cutoffDate = new Date().toISOString().slice(0, 10);
  const generatedBatches = await buildDraftPayoutBatches(cutoffDate);
  const payoutDashboard = await getPayoutDashboardData();

  return {
    syncResult,
    generatedBatches,
    payoutDashboard,
    cutoffDate,
    commissionFeedCount: Array.isArray(commissionFeed) ? commissionFeed.length : 0,
  };
};

/**
 * Diagnostic: recurring scheduler runtime status
 */
router.get('/api/admin/diagnostic/recurring-billing/status', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const status = getRecurringBillingSchedulerStatus();

    res.json({
      success: true,
      scheduler: status,
    });
  } catch (error: any) {
    console.error('[Diagnostic] Error fetching recurring scheduler status:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch recurring scheduler status',
    });
  }
});

/**
 * Diagnostic: run recurring scheduler once (defaults to dry-run)
 */
router.post('/api/admin/diagnostic/recurring-billing/run-once', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const requestedDryRun = req.body?.forceDryRun;
    const forceDryRun = typeof requestedDryRun === 'boolean' ? requestedDryRun : true;
    const isSuperAdmin = hasAtLeastRole(req.user.role, 'super_admin');

    if (forceDryRun === false && !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Only super admin can override dry-run mode',
      });
    }

    const requestedBy = req.user.email || req.user.id || 'unknown-admin';
    const result = await runRecurringBillingCycleOnce({
      forceDryRun,
      requestedBy,
    });

    res.json({
      success: true,
      run: result,
      scheduler: getRecurringBillingSchedulerStatus(),
    });
  } catch (error: any) {
    console.error('[Diagnostic] Error running recurring scheduler once:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to run recurring scheduler once',
    });
  }
});

/**
 * Operator-safe recurring billing workflow:
 * preview (dry-run) or live run with commission follow-up sequence.
 */
router.post('/api/admin/diagnostic/recurring-billing/operator-workflow', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const modeRaw = String(req.body?.mode || 'preview').toLowerCase();
    const mode: OperatorMode = modeRaw === 'live' ? 'live' : 'preview';
    const isSuperAdmin = hasAtLeastRole(req.user.role, 'super_admin');

    if (mode === 'live' && !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Only super admin can run live recurring billing',
      });
    }

    const requestedBy = req.user.email || req.user.id || 'unknown-admin';
    const run = await runRecurringBillingCycleOnce({
      forceDryRun: mode !== 'live',
      requestedBy,
    });

    const scheduler = getRecurringBillingSchedulerStatus();
    const recentDueDecisions = (scheduler.launchDiagnostics?.recentDueDecisions || []).filter((entry: any) => {
      return entry.source === 'manual' && isRecentCycleEntry(entry.at, run.startedAt, run.completedAt);
    });
    const recentChargeAttempts = (scheduler.launchDiagnostics?.recentChargeAttempts || []).filter((entry: any) => {
      return entry.source === 'manual' && isRecentCycleEntry(entry.at, run.startedAt, run.completedAt);
    });

    const dueRows = buildCycleRows(recentDueDecisions, recentChargeAttempts);
    const billingOutcome = summarizeBillingOutcomes(recentChargeAttempts);

    if (mode === 'preview') {
      const readyPreviewCount = dueRows.filter((row) => row.readinessState === 'ready_preview').length;

      return res.json({
        success: true,
        mode,
        run,
        duePreview: {
          dueCount: dueRows.length,
          rows: dueRows,
          estimatedCommissionImpact: {
            potentialSuccessfulPayments: readyPreviewCount,
            estimatedCommissionEntries: readyPreviewCount,
            note: 'Preview only estimate based on currently due, dry-run-ready records.',
          },
          note: 'Preview only. No payments or commissions have been created.',
        },
        billingSummary: {
          totalDue: dueRows.length,
          ...billingOutcome,
        },
        scheduler,
      });
    }

    const succeededChargeAttempts = recentChargeAttempts.filter((entry: any) => entry.chargeAttemptResult === 'success');
    const failedOrSkippedRows = dueRows.filter((row) => row.chargeAttemptResult !== 'success');
    const billingEventIds = succeededChargeAttempts
      .map((entry: any) => Number(entry.billingEventId))
      .filter((id: number) => Number.isFinite(id));

    const recurringLogRows = await loadRecurringLogRows(billingEventIds);
    const successfulPaymentIds = Array.from(new Set(
      recurringLogRows
        .map((row: any) => Number(row.payment_id))
        .filter((id: number) => Number.isFinite(id) && id > 0)
    ));

    const commissionPayoutRows = await loadCommissionPayoutRowsForPayments(successfulPaymentIds, run.startedAt);
    const paymentsWithCommission = Array.from(new Set(
      commissionPayoutRows
        .map((row: any) => Number(row.member_payment_id))
        .filter((id: number) => Number.isFinite(id))
    ));

    const commissionFollowUp = await runCommissionFollowUpSequence();

    return res.json({
      success: true,
      mode,
      run,
      billingSummary: {
        totalDue: dueRows.length,
        ...billingOutcome,
      },
      dueRows,
      commissionSummary: {
        successfulPaymentsThatCreatedCommissionEntries: paymentsWithCommission.length,
        totalCommissionEntriesCreated: commissionPayoutRows.length,
        payoutBatchesAffectedGenerated: (commissionFollowUp.generatedBatches || []).map((batch: any) => ({
          id: batch.id,
          batchName: batch.batch_name,
          totalRecords: batch.total_records,
          totalAmount: batch.total_amount,
        })),
        membersOrAccountsWithNoCommissionBecausePaymentFailedSkipped: failedOrSkippedRows.map((row) => ({
          memberId: row.memberId,
          memberOrAccountName: row.memberOrAccountName,
          payerType: row.payerType,
          reason: row.skipReason || row.chargeAttemptResult || 'failed_or_skipped',
        })),
      },
      commissionFollowUp,
      scheduler,
    });
  } catch (error: any) {
    console.error('[Diagnostic] Error running operator recurring workflow:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to run operator recurring workflow',
    });
  }
});

/**
 * One-time repair endpoint: backfill payment_tokens.original_network_trans_id for active card tokens.
 * Mode defaults to preview. Use { mode: 'apply' } to persist updates.
 */
router.post('/api/admin/diagnostic/recurring-billing/repair-card-auth-guids', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const mode = String(req.body?.mode || 'preview').toLowerCase() === 'apply' ? 'apply' : 'preview';
    const force = req.body?.force === true;
    const isSuperAdmin = hasAtLeastRole(req.user.role, 'super_admin');
    const requestedBy = req.user.email || req.user.id || 'unknown-admin';

    if (mode === 'apply' && !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Only super admin can apply recurring auth-guid repairs',
      });
    }

    const requestedLimit = Number(req.body?.limit);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 5000)
      : 500;

    let priorRun: any = null;
    try {
      const existingRepairSetting = await getPlatformSetting<any>(RECURRING_CARD_AUTH_REPAIR_SETTING_KEY);
      priorRun = existingRepairSetting?.value || null;
    } catch (platformSettingReadError: any) {
      console.warn('[Diagnostic] Could not read recurring repair platform setting:', platformSettingReadError?.message);
    }
    const alreadyCompleted = Boolean(priorRun?.completedAt);

    if (mode === 'apply' && alreadyCompleted && !force) {
      return res.status(409).json({
        success: false,
        error: 'Recurring card auth-guid repair already completed. Set force=true to run again.',
        alreadyCompleted: true,
        priorRun,
      });
    }

    const candidateResult = await query(
      `
        SELECT
          pt.id AS token_id,
          pt.member_id,
          pt.bric_token,
          pt.payment_method_type,
          pt.original_network_trans_id,
          m.payment_token AS member_payment_token,
          p.id AS payment_id,
          p.epx_auth_guid,
          p.created_at AS payment_created_at
        FROM payment_tokens pt
        LEFT JOIN members m
          ON m.id::text = pt.member_id::text
        LEFT JOIN LATERAL (
          SELECT id, epx_auth_guid, created_at
          FROM payments
          WHERE member_id::text = pt.member_id::text
            AND epx_auth_guid IS NOT NULL
            AND LENGTH(TRIM(epx_auth_guid::text)) >= 8
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        ) p ON true
        WHERE pt.is_active = true
          AND pt.payment_method_type = 'CreditCard'
          AND (
            pt.original_network_trans_id IS NULL
            OR LENGTH(TRIM(pt.original_network_trans_id::text)) < 16
            OR LENGTH(TRIM(pt.original_network_trans_id::text)) > 64
            OR TRIM(pt.original_network_trans_id::text) !~ '^[A-Za-z0-9-]+$'
          )
        ORDER BY COALESCE(p.created_at, pt.last_used_at, pt.created_at) DESC, pt.id DESC
        LIMIT $1
      `,
      [limit],
    );

    const candidates = (candidateResult.rows || []).map((row: any) => {
      const resolution = resolveAuthGuidForRepairRow(row);
      return {
      tokenId: Number(row.token_id),
      memberId: String(row.member_id),
      paymentId: Number(row.payment_id || 0) || null,
      paymentCreatedAt: row.payment_created_at,
      resolvedAuthGuid: resolution.authGuid,
      resolvedAuthGuidMasked: maskAuthGuid(resolution.authGuid),
      resolutionSource: resolution.source,
      unresolvedReason: resolution.unresolvedReason,
    };
    });

    const resolvableCandidates = candidates.filter((row: any) => typeof row.resolvedAuthGuid === 'string' && row.resolvedAuthGuid.trim().length > 0);
    const unresolvedCandidates = candidates.filter((row: any) => !isUsableAuthGuid(row.resolvedAuthGuid));

    if (mode === 'preview') {
      return res.json({
        success: true,
        mode,
        alreadyCompleted,
        priorRun,
        candidateCount: candidates.length,
        resolvableCount: resolvableCandidates.length,
        unresolvedCount: unresolvedCandidates.length,
        candidates,
        note: 'Preview only. No records were changed.',
      });
    }

    const updated: Array<{ tokenId: number; memberId: string; paymentId: number; authGuidMasked: string | null }> = [];

    for (const row of resolvableCandidates) {
      const updateResult = await query(
        `
          UPDATE payment_tokens
          SET original_network_trans_id = $2,
              last_used_at = NOW()
          WHERE id = $1
            AND (
              original_network_trans_id IS NULL
                OR LENGTH(TRIM(original_network_trans_id::text)) < 16
              OR LENGTH(TRIM(original_network_trans_id::text)) > 64
              OR TRIM(original_network_trans_id::text) !~ '^[A-Za-z0-9-]+$'
            )
          RETURNING id
        `,
        [row.tokenId, row.resolvedAuthGuid],
      );

      if ((updateResult.rows || []).length > 0) {
        updated.push({
          tokenId: row.tokenId,
          memberId: row.memberId,
          paymentId: row.paymentId,
          authGuidMasked: row.resolvedAuthGuidMasked,
        });
      }
    }

    const completedAt = new Date().toISOString();
    const repairSummary = {
      completedAt,
      completedBy: requestedBy,
      force,
      limit,
      candidateCount: candidates.length,
      resolvableCount: resolvableCandidates.length,
      unresolvedCount: unresolvedCandidates.length,
      updatedCount: updated.length,
      endpoint: '/api/admin/diagnostic/recurring-billing/repair-card-auth-guids',
      version: 1,
    };

    try {
      await upsertPlatformSetting(RECURRING_CARD_AUTH_REPAIR_SETTING_KEY, repairSummary, requestedBy);
    } catch (platformSettingWriteError: any) {
      console.warn('[Diagnostic] Could not persist recurring repair platform setting:', platformSettingWriteError?.message);
    }

    return res.json({
      success: true,
      mode,
      alreadyCompleted,
      priorRun,
      repairSummary,
      updated,
      unresolvedCandidates,
    });
  } catch (error: any) {
    console.error('[Diagnostic] Error running recurring auth-guid repair:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to run recurring auth-guid repair',
    });
  }
});

/**
 * Diagnostic/repair endpoint: reconcile payments approved by EPX but left in partial app state.
 * Mode defaults to preview. Use { mode: 'apply' } to persist updates.
 */
router.post('/api/admin/diagnostic/epx-approved-reconciliation', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const mode: ReconciliationMode = String(req.body?.mode || 'preview').toLowerCase() === 'apply' ? 'apply' : 'preview';
    const isSuperAdmin = hasAtLeastRole(req.user.role, 'super_admin');

    if (mode === 'apply' && !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Only super admin can apply EPX reconciliation changes',
      });
    }

    const requestedLookbackDays = Number(req.body?.lookbackDays);
    const lookbackDays = Number.isFinite(requestedLookbackDays)
      ? Math.min(Math.max(Math.trunc(requestedLookbackDays), 1), 90)
      : 14;

    const requestedLimit = Number(req.body?.limit);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 500)
      : 200;

    const candidateResult = await query(
      `
        SELECT
          p.id AS payment_id,
          p.member_id,
          p.subscription_id,
          p.status AS payment_status,
          p.transaction_id,
          p.amount,
          p.created_at AS payment_created_at,
          p.metadata,
          m.status AS member_status,
          m.is_active AS member_is_active,
          m.first_payment_date AS member_first_payment_date,
          s.status AS subscription_status,
          s.next_billing_date,
          s.member_id AS subscription_member_id
        FROM payments p
        LEFT JOIN members m ON m.id::text = p.member_id::text
        LEFT JOIN subscriptions s ON s.id::text = p.subscription_id::text
        WHERE p.created_at >= NOW() - ($1::int * INTERVAL '1 day')
          AND (
            (
              LOWER(COALESCE(p.status, '')) NOT IN ('succeeded', 'success', 'completed')
              AND LOWER(COALESCE(p.metadata->'hostedCallback'->>'status', '')) IN ('success', 'succeeded', 'approved')
            )
            OR (
              LOWER(COALESCE(p.status, '')) IN ('succeeded', 'success', 'completed')
              AND p.member_id IS NOT NULL
              AND (
                LOWER(COALESCE(m.status, '')) <> 'active'
                OR COALESCE(m.is_active, false) = false
                OR (
                  p.subscription_id IS NOT NULL
                  AND LOWER(COALESCE(s.status, '')) IN ('pending', 'pending_payment')
                )
                OR (
                  p.subscription_id IS NULL
                  AND COALESCE((p.metadata->>'paymentType'), '') = 'hosted-checkout'
                )
              )
            )
          )
        ORDER BY p.created_at DESC
        LIMIT $2
      `,
      [lookbackDays, limit],
    );

    const candidates = (candidateResult.rows || []).map((row: any) => {
      const paymentStatus = normalizePaymentStatus(row.payment_status);
      const callbackStatus = normalizeCallbackStatus(row?.metadata?.hostedCallback?.status);
      const paymentId = parseNumericId(row.payment_id);
      const memberId = parseNumericId(row.member_id);
      const subscriptionId = parseNumericId(row.subscription_id);
      const subscriptionMemberId = parseNumericId(row.subscription_member_id);

      const needsPaymentStatusFix = !isPaymentSucceededStatus(paymentStatus) && isCallbackSuccessStatus(callbackStatus);
      const needsMemberActivationFix = Boolean(memberId)
        && isPaymentSucceededStatus(paymentStatus)
        && (normalizePaymentStatus(row.member_status) !== 'active' || row.member_is_active !== true);
      const needsSubscriptionActivationFix = Boolean(subscriptionId)
        && normalizePaymentStatus(row.subscription_status) in ({ pending: true, pending_payment: true } as Record<string, boolean>);
      const needsSubscriptionLinkFix = Boolean(memberId)
        && !subscriptionId
        && isPaymentSucceededStatus(paymentStatus);
      const needsSubscriptionMemberAlignmentFix = Boolean(memberId && subscriptionId && subscriptionMemberId)
        && memberId !== subscriptionMemberId;

      return {
        paymentId,
        memberId,
        subscriptionId,
        paymentStatus,
        callbackStatus,
        paymentCreatedAt: toIsoDate(row.payment_created_at),
        memberStatus: normalizePaymentStatus(row.member_status),
        memberIsActive: row.member_is_active === true,
        subscriptionStatus: normalizePaymentStatus(row.subscription_status),
        nextBillingDate: toIsoDate(row.next_billing_date),
        drift: {
          needsPaymentStatusFix,
          needsMemberActivationFix,
          needsSubscriptionActivationFix,
          needsSubscriptionLinkFix,
          needsSubscriptionMemberAlignmentFix,
        },
      };
    }).filter((row: any) => row.paymentId);

    if (mode === 'preview') {
      return res.json({
        success: true,
        mode,
        lookbackDays,
        limit,
        candidateCount: candidates.length,
        candidates,
        summary: {
          paymentStatusFixes: candidates.filter((row: any) => row.drift.needsPaymentStatusFix).length,
          memberActivationFixes: candidates.filter((row: any) => row.drift.needsMemberActivationFix).length,
          subscriptionActivationFixes: candidates.filter((row: any) => row.drift.needsSubscriptionActivationFix).length,
          subscriptionLinkFixes: candidates.filter((row: any) => row.drift.needsSubscriptionLinkFix).length,
          subscriptionMemberAlignmentIssues: candidates.filter((row: any) => row.drift.needsSubscriptionMemberAlignmentFix).length,
        },
        note: 'Preview only. No records were changed.',
      });
    }

    const applied: any[] = [];
    const errors: any[] = [];

    for (const candidate of candidates) {
      const actions: string[] = [];

      try {
        if (candidate.drift.needsPaymentStatusFix) {
          await storage.updatePayment(candidate.paymentId, { status: 'succeeded' as any });
          actions.push('payment_status->succeeded');
        }

        if (candidate.memberId && candidate.drift.needsMemberActivationFix) {
          const firstPaymentDate = candidate.paymentCreatedAt || new Date().toISOString();
          await storage.updateMember(candidate.memberId, {
            status: 'active',
            isActive: true,
            firstPaymentDate,
          } as any);
          actions.push('member->active');
        }

        let effectiveSubscriptionId = candidate.subscriptionId;

        if (candidate.memberId && candidate.drift.needsSubscriptionLinkFix) {
          const { data: latestSubscription } = await supabase
            .from('subscriptions')
            .select('id, status, next_billing_date')
            .eq('member_id', candidate.memberId)
            .in('status', ['active', 'pending', 'pending_payment'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestSubscription?.id) {
            effectiveSubscriptionId = Number(latestSubscription.id);
            await storage.updatePayment(candidate.paymentId, { subscriptionId: String(effectiveSubscriptionId) });
            actions.push('payment.subscription_id->linked');
          }
        }

        if (effectiveSubscriptionId && candidate.memberId) {
          const { data: currentSubscription } = await supabase
            .from('subscriptions')
            .select('id, status, next_billing_date, member_id')
            .eq('id', effectiveSubscriptionId)
            .maybeSingle();

          const subscriptionStatus = normalizePaymentStatus(currentSubscription?.status);
          const requiresStatusFix = subscriptionStatus === 'pending' || subscriptionStatus === 'pending_payment';
          const requiresDateFix = !currentSubscription?.next_billing_date;
          const memberMismatch = parseNumericId(currentSubscription?.member_id) !== candidate.memberId;

          if (requiresStatusFix || requiresDateFix || memberMismatch) {
            const subscriptionPatch: Record<string, any> = {
              updated_at: new Date().toISOString(),
            };

            if (requiresStatusFix && !memberMismatch) {
              subscriptionPatch.status = 'active';
            }

            if (requiresDateFix) {
              const base = candidate.paymentCreatedAt ? new Date(candidate.paymentCreatedAt) : new Date();
              subscriptionPatch.next_billing_date = calculateNextBillingDate(base).toISOString();
            }

            if (Object.keys(subscriptionPatch).length > 1) {
              const { error: subscriptionUpdateError } = await supabase
                .from('subscriptions')
                .update(subscriptionPatch)
                .eq('id', effectiveSubscriptionId)
                .eq('member_id', candidate.memberId);

              if (subscriptionUpdateError) {
                throw new Error(`Failed updating subscription ${effectiveSubscriptionId}: ${subscriptionUpdateError.message}`);
              }

              if (subscriptionPatch.status === 'active') {
                actions.push('subscription->active');
              }
              if (subscriptionPatch.next_billing_date) {
                actions.push('subscription.next_billing_date->set');
              }
            }

            if (memberMismatch) {
              actions.push('subscription_member_mismatch_detected');
            }
          }
        }

        applied.push({
          paymentId: candidate.paymentId,
          memberId: candidate.memberId,
          subscriptionId: effectiveSubscriptionId,
          actions,
        });
      } catch (applyError: any) {
        errors.push({
          paymentId: candidate.paymentId,
          memberId: candidate.memberId,
          subscriptionId: candidate.subscriptionId,
          error: applyError?.message || 'Unknown apply error',
        });
      }
    }

    return res.json({
      success: true,
      mode,
      lookbackDays,
      limit,
      candidateCount: candidates.length,
      appliedCount: applied.length,
      errorCount: errors.length,
      applied,
      errors,
      note: 'Apply mode attempted deterministic reconciliation for EPX-approved drift records.',
    });
  } catch (error: any) {
    console.error('[Diagnostic] Error running EPX approved reconciliation:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to run EPX approved reconciliation',
    });
  }
});

/**
 * Diagnostic: Check if payment actually executed for a specific member
 */
router.get('/api/admin/diagnostic/payment-execution/:memberId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const memberId = parseInt(req.params.memberId);
    if (isNaN(memberId)) {
      return res.status(400).json({ error: 'Invalid member ID' });
    }

    // 1. Get member details
    const member = await storage.getMemberById(memberId);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // 2. Check for payment record linked to this member
    const memberPaymentResult = await query(
      'SELECT * FROM payments WHERE member_id = $1 ORDER BY created_at DESC LIMIT 1',
      [memberId]
    );
    const memberPayment = memberPaymentResult.rows[0];

    // 3. Check for payments by this agent around enrollment date
    const enrollmentDate = new Date(member.enrollment_date);
    const dateBefore = new Date(enrollmentDate.getTime() - 24 * 60 * 60 * 1000); // 1 day before
    const dateAfter = new Date(enrollmentDate.getTime() + 24 * 60 * 60 * 1000); // 1 day after

    const agentPaymentsResult = await query(
      `SELECT * FROM payments 
       WHERE user_id = $1 
         AND created_at >= $2 
         AND created_at <= $3
       ORDER BY created_at DESC`,
      [member.enrolled_by_agent_id, dateBefore.toISOString(), dateAfter.toISOString()]
    );
    const agentPayments = agentPaymentsResult.rows;

    // 4. Check for orphaned payments (no member linked) around that time
    const orphanedPaymentsResult = await query(
      `SELECT * FROM payments 
       WHERE member_id IS NULL 
         AND created_at >= $1 
         AND created_at <= $2
       ORDER BY created_at DESC`,
      [dateBefore.toISOString(), dateAfter.toISOString()]
    );
    const orphanedPayments = orphanedPaymentsResult.rows;

    // 5. Check for payments with matching amount
    const matchingAmountResult = await query(
      `SELECT * FROM payments 
       WHERE amount::numeric = $1 
         AND created_at >= $2 
         AND created_at <= $3
       ORDER BY created_at DESC`,
      [member.total_monthly_price, dateBefore.toISOString(), dateAfter.toISOString()]
    );
    const matchingAmountPayments = matchingAmountResult.rows;

    // 6. Check commission record
    const commissionResult = await query(
      'SELECT * FROM agent_commissions WHERE member_id = $1',
      [memberId]
    );
    const commissions = commissionResult.rows;

    // 7. Check EPX logs (in-memory buffer + log files)
    let epxLogs: any[] = [];
    try {
      // Get recent EPX logs from memory
      const recentLogs = getRecentEPXLogs(200);
      
      // Filter logs around enrollment date
      const enrollmentDateStr = enrollmentDate.toISOString().split('T')[0];
      epxLogs = recentLogs.filter(log => {
        const logDate = log.timestamp.split('T')[0];
        return logDate === enrollmentDateStr;
      });

      // Also try to read from log files
      const logDir = process.env.EPX_LOG_DIR || path.join(process.cwd(), 'logs', 'epx');
      const logFile = path.join(logDir, `epx-${enrollmentDateStr}.jsonl`);
      
      if (fs.existsSync(logFile)) {
        const fileContent = fs.readFileSync(logFile, 'utf8');
        const fileLines = fileContent.split('\n').filter(line => line.trim());
        const fileLogs = fileLines.map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        }).filter(log => log !== null);
        
        // Look for logs mentioning this member or agent
        const relevantLogs = fileLogs.filter((log: any) => {
          const data = log.data || {};
          return (
            data.memberId === memberId ||
            data.member_id === memberId ||
            data.customerId === member.customer_number ||
            data.customerEmail === member.email ||
            data.userId === member.enrolled_by_agent_id ||
            (data.amount && parseFloat(data.amount) === member.total_monthly_price)
          );
        });
        
        epxLogs = [...epxLogs, ...relevantLogs];
      }
    } catch (logError: any) {
      console.warn('[Diagnostic] Error reading EPX logs:', logError.message);
    }

    // 8. Determine conclusion
    let conclusion = '';
    let paymentExecuted = false;
    let evidence: string[] = [];

    if (memberPayment) {
      paymentExecuted = true;
      evidence.push(`✅ Payment record exists (ID: ${memberPayment.id}, Status: ${memberPayment.status})`);
    } else {
      evidence.push('❌ No payment record found for this member');
    }

    if (agentPayments.length > 0) {
      evidence.push(`🔍 Found ${agentPayments.length} payment(s) by this agent around enrollment date`);
    }

    if (orphanedPayments.length > 0) {
      evidence.push(`⚠️  Found ${orphanedPayments.length} orphaned payment(s) (no member linked) around enrollment date`);
    }

    if (matchingAmountPayments.length > 0) {
      evidence.push(`💰 Found ${matchingAmountPayments.length} payment(s) matching amount ($${member.total_monthly_price})`);
    }

    if (commissions.length > 0) {
      evidence.push(`✅ Commission record exists (${commissions.length} record(s))`);
    }

    if (epxLogs.length > 0) {
      const successLogs = epxLogs.filter((log: any) => 
        log.message?.toLowerCase().includes('success') || 
        log.data?.status === 'succeeded'
      );
      evidence.push(`📋 Found ${epxLogs.length} EPX log entries (${successLogs.length} success indicators)`);
    }

    // Determine what likely happened
    if (memberPayment && memberPayment.status === 'succeeded') {
      conclusion = '✅ PAYMENT EXECUTED: Payment record exists with succeeded status. Member completed checkout successfully.';
    } else if (orphanedPayments.length > 0 || matchingAmountPayments.length > 0) {
      conclusion = '⚠️  PAYMENT LIKELY EXECUTED BUT NOT LINKED: Found payment records that might belong to this member but aren\'t properly associated.';
      paymentExecuted = true;
    } else if (epxLogs.some((log: any) => log.level === 'error' || log.message?.toLowerCase().includes('fail'))) {
      conclusion = '❌ PAYMENT FAILED: EPX logs show errors. Payment processing failed.';
    } else if (commissions.length > 0 && !memberPayment) {
      conclusion = '🚨 INCONSISTENT STATE: Commission exists but payment record missing. This is the bug we found - payment tracking failed during enrollment.';
    } else {
      conclusion = '❓ PAYMENT LIKELY NOT EXECUTED: No evidence of payment processing. Member may have abandoned checkout or payment was never initiated.';
    }

    res.json({
      success: true,
      memberId: memberId,
      memberInfo: {
        customerNumber: member.customer_number,
        name: `${member.first_name} ${member.last_name}`,
        email: member.email,
        amount: member.total_monthly_price,
        enrollmentDate: member.enrollment_date,
        agentNumber: member.agent_number,
        status: member.status,
        hasPaymentToken: !!member.payment_token
      },
      evidence: {
        memberPayment: memberPayment || null,
        agentPayments: agentPayments.length,
        orphanedPayments: orphanedPayments.length,
        matchingAmountPayments: matchingAmountPayments.length,
        commissions: commissions.length,
        epxLogs: epxLogs.length
      },
      detailedEvidence: evidence,
      conclusion: conclusion,
      paymentExecuted: paymentExecuted,
      recommendations: paymentExecuted ? [
        'Payment likely executed - verify with EPX settlement reports',
        'If payment confirmed, create manual payment record for tracking',
        'Investigate why payment record wasn\'t created automatically'
      ] : [
        'Payment may not have been completed',
        'Check EPX merchant portal for transaction on this date',
        'If no transaction found, member abandoned checkout',
        'If transaction found, create manual payment record'
      ]
    });

  } catch (error: any) {
    console.error('[Diagnostic] Error checking payment execution:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;
