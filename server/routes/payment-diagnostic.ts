/**
 * Payment Execution Diagnostic Tool
 * Checks if member #7 actually completed payment through EPX
 */

import { Router, Response } from "express";
import { storage, getPlatformSetting, upsertPlatformSetting } from "../storage";
import { authenticateToken, type AuthRequest } from "../auth/supabaseAuth";
import { hasAtLeastRole, isAtLeastAdmin } from "../auth/roles";
import { query } from "../lib/neonDb";
import { getRecentEPXLogs } from "../services/epx-payment-logger";
import {
  getRecurringBillingSchedulerStatus,
} from "../services/recurring-billing-scheduler";
import {
  getDurableBillingConfiguration,
  runDurableRecurringBilling,
} from "../services/durable-recurring-billing-service";
import {
  syncCommissionLedgerFromFeed,
  buildDraftPayoutBatches,
  getPayoutDashboardData,
} from "../services/commission-ledger-service";
import { getHistoricalCutoverSchemaStatus } from "../services/historical-commission-external-settlement-service";
import {
  redactResolvedPaymentCredential,
  resolveCanonicalPaymentCredential,
} from "../services/payment-credential";
import { calculateNextBillingDate } from "../utils/membership-dates";
import * as fs from "fs";
import * as path from "path";

const router = Router();
const RECURRING_CARD_AUTH_REPAIR_SETTING_KEY =
  "recurring_card_auth_guid_repair_v1";
const RECURRING_SCHEDULER_HEARTBEAT_SETTING_KEY =
  "recurring_billing_scheduler_heartbeat_v1";
const DEFAULT_RECURRING_SCHEDULER_STALE_ALERT_MINUTES = 180;

type OperatorMode = "preview" | "live";

const maskAuthGuid = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.length > 8
    ? `${normalized.slice(0, 4)}****${normalized.slice(-4)}`
    : "********";
};

const isUsableAuthGuid = (
  value: string | null | undefined,
): value is string => {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  // EPX ORIG_AUTH_GUID/AUTH_GUID samples are token-like and can be ~19 chars.
  if (normalized.length < 16 || normalized.length > 64) return false;
  return /^[A-Za-z0-9-]+$/.test(normalized);
};

const isUsableTrustedAuthGuid = (
  value: string | null | undefined,
): value is string => {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 128) return false;
  return /^[A-Za-z0-9-]+$/.test(normalized);
};

const resolveAuthGuidForRepairRow = (
  row: any,
): {
  authGuid: string | null;
  source: "payments.epx_auth_guid" | "payment_tokens.bric_token_plain" | null;
  provenance: {
    memberMatch: boolean;
    successfulPaymentMatch: boolean;
    amountMatch: boolean;
    transactionMatch: boolean;
    dateCycleMatch: boolean;
    midStatus: "verified" | "not_available" | "failed";
  };
  unresolvedReason: string | null;
} => {
  const hasPaymentAmount =
    row?.payment_amount !== null &&
    row?.payment_amount !== undefined &&
    String(row.payment_amount).trim() !== "";
  const hasSubscriptionAmount =
    row?.subscription_amount !== null &&
    row?.subscription_amount !== undefined &&
    String(row.subscription_amount).trim() !== "";
  const paymentAmount = hasPaymentAmount
    ? Number(row.payment_amount)
    : Number.NaN;
  const subscriptionAmount = hasSubscriptionAmount
    ? Number(row.subscription_amount)
    : Number.NaN;
  const paymentDate = Date.parse(
    String(row?.payment_transaction_at || row?.payment_created_at || ""),
  );
  const nextBillingDate = Date.parse(String(row?.next_billing_date || ""));
  const paymentMid = String(row?.payment_mid || "").trim();
  const receiptMid = String(row?.receipt_mid || "").trim();
  const cycleDistanceDays =
    Number.isFinite(paymentDate) && Number.isFinite(nextBillingDate)
      ? (nextBillingDate - paymentDate) / (24 * 60 * 60 * 1000)
      : Number.NaN;
  const provenance = {
    memberMatch:
      String(row?.payment_member_id || "") === String(row?.member_id || ""),
    successfulPaymentMatch: ["success", "succeeded", "completed"].includes(
      String(row?.payment_status || "")
        .trim()
        .toLowerCase(),
    ),
    amountMatch:
      Number.isFinite(paymentAmount) &&
      Number.isFinite(subscriptionAmount) &&
      Math.abs(paymentAmount - subscriptionAmount) <= 0.01,
    transactionMatch: Boolean(
      String(row?.payment_receipt_reference || "").trim(),
    ),
    dateCycleMatch:
      Number.isFinite(cycleDistanceDays) &&
      cycleDistanceDays >= 20 &&
      cycleDistanceDays <= 40,
    midStatus:
      paymentMid && receiptMid
        ? paymentMid === receiptMid
          ? "verified"
          : "failed"
        : "not_available",
  };
  const paymentAuthGuid =
    typeof row?.epx_auth_guid === "string" ? row.epx_auth_guid.trim() : "";
  if (
    isUsableTrustedAuthGuid(paymentAuthGuid) &&
    row?.payment_auth_conflict !== true
  ) {
    return {
      authGuid: paymentAuthGuid,
      source: "payments.epx_auth_guid",
      provenance,
      unresolvedReason: null,
    };
  }

  const tokenValue =
    typeof row?.bric_token === "string" ? row.bric_token.trim() : "";
  const resolution = resolveCanonicalPaymentCredential(tokenValue);
  if (!resolution.error) {
    return {
      authGuid: null,
      source: null,
      provenance,
      unresolvedReason: "No token data available for auth GUID resolution",
    };
  }

  if (
    !looksLikeEncryptedToken(tokenValue) &&
    isUsableAuthGuid(tokenValue) &&
    row?.bric_conflict !== true
  ) {
    return {
      authGuid: tokenValue,
      source: "payment_tokens.bric_token_plain",
      provenance,
      unresolvedReason: null,
    };
  }

  return {
    authGuid: null,
    source: null,
    provenance,
    unresolvedReason:
      row?.payment_auth_conflict === true || row?.bric_conflict === true
        ? "Processor reference conflicts across member records"
        : looksLikeEncryptedToken(tokenValue)
          ? "Legacy encrypted-looking platform value requires one-time conversion"
          : "No usable platform-stored EPX reference is available",
  };
};

const isRecentCycleEntry = (
  entryAt: string | undefined,
  startedAt: string,
  completedAt: string,
): boolean => {
  if (!entryAt) return false;
  const entryTs = Date.parse(entryAt);
  const startTs = Date.parse(startedAt);
  const endTs = Date.parse(completedAt);
  if (
    !Number.isFinite(entryTs) ||
    !Number.isFinite(startTs) ||
    !Number.isFinite(endTs)
  )
    return false;
  return entryTs >= startTs - 1000 && entryTs <= endTs + 1000;
};

const formatReadinessState = (chargeAttempt: any | undefined): string => {
  if (!chargeAttempt) {
    return "pending_review";
  }

  if (chargeAttempt.chargeAttemptResult === "dry_run") {
    return "ready_preview";
  }

  if (chargeAttempt.chargeAttemptResult === "success") {
    return "charged_success";
  }

  if (chargeAttempt.skipped) {
    return chargeAttempt.skipReason
      ? `skipped_${chargeAttempt.skipReason}`
      : "skipped";
  }

  return chargeAttempt.chargeAttemptResult || "not_ready";
};

const summarizeBillingOutcomes = (chargeAttempts: any[]) => {
  const succeeded = chargeAttempts.filter(
    (entry) => entry.chargeAttemptResult === "success",
  ).length;
  const skipped = chargeAttempts.filter(
    (entry) => entry.skipped || entry.chargeAttemptResult === "skipped",
  ).length;
  const failed = chargeAttempts.filter((entry) => {
    if (entry.chargeAttemptResult === "success") return false;
    if (entry.skipped || entry.chargeAttemptResult === "skipped") return false;
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

type ReconciliationMode = "preview" | "apply";

const normalizePaymentStatus = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase();
const normalizeCallbackStatus = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase();
const isPaymentSucceededStatus = (status: string): boolean =>
  ["succeeded", "success", "completed"].includes(status);
const isCallbackSuccessStatus = (status: string): boolean =>
  ["success", "succeeded", "approved"].includes(status);

const parseNumericId = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim()) {
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

const loadCommissionPayoutRowsForPayments = async (
  paymentIds: number[],
  startedAt: string,
) => {
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
    commissionFeedCount: Array.isArray(commissionFeed)
      ? commissionFeed.length
      : 0,
  };
};

const getRecurringSchedulerStaleAlertMinutes = (): number => {
  const raw = Number.parseInt(
    process.env.RECURRING_BILLING_SCHEDULER_STALE_ALERT_MINUTES ||
      String(DEFAULT_RECURRING_SCHEDULER_STALE_ALERT_MINUTES),
    10,
  );

  if (!Number.isFinite(raw)) {
    return DEFAULT_RECURRING_SCHEDULER_STALE_ALERT_MINUTES;
  }

  return Math.max(15, raw);
};

const getRecurringSchedulerHealthSnapshot = async () => {
  const staleThresholdMinutes = getRecurringSchedulerStaleAlertMinutes();
  const heartbeatRecord = await getPlatformSetting<any>(
    RECURRING_SCHEDULER_HEARTBEAT_SETTING_KEY,
  );
  const heartbeat = heartbeatRecord?.value || null;
  const referenceAt = heartbeat?.completedAt || heartbeat?.startedAt || null;
  const elapsedMs = referenceAt ? Date.now() - Date.parse(referenceAt) : null;
  const elapsedMinutes =
    typeof elapsedMs === "number" && Number.isFinite(elapsedMs)
      ? Math.max(0, Math.round(elapsedMs / 60000))
      : null;
  const stale =
    elapsedMinutes !== null && elapsedMinutes >= staleThresholdMinutes;

  const dueResult = await query(
    `
      SELECT COUNT(*)::int AS due_count
      FROM subscriptions
      WHERE status = 'active'
        AND next_billing_date IS NOT NULL
        AND next_billing_date <= NOW()
    `,
  );

  return {
    staleThresholdMinutes,
    stale,
    elapsedMinutesSinceReference: elapsedMinutes,
    referenceAt,
    dueActiveSubscriptions: Number(dueResult.rows?.[0]?.due_count || 0),
    heartbeat,
    heartbeatUpdatedAt: heartbeatRecord?.updatedAt || null,
    heartbeatUpdatedBy: heartbeatRecord?.updatedBy || null,
  };
};

/**
 * Diagnostic: recurring scheduler runtime status
 */
router.get(
  "/api/admin/diagnostic/recurring-billing/status",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user || !isAtLeastAdmin(req.user.role)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const status = getRecurringBillingSchedulerStatus();
      const health = await getRecurringSchedulerHealthSnapshot();

      res.json({
        success: true,
        scheduler: status,
        health,
      });
    } catch (error: any) {
      console.error(
        "[Diagnostic] Error fetching recurring scheduler status:",
        error,
      );
      res.status(500).json({
        success: false,
        error: error?.message || "Failed to fetch recurring scheduler status",
      });
    }
  },
);

/**
 * Diagnostic: run recurring scheduler once (defaults to dry-run)
 */
router.post(
  "/api/admin/diagnostic/recurring-billing/run-once",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user || !isAtLeastAdmin(req.user.role)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const requestedDryRun = req.body?.forceDryRun;
      const forceDryRun =
        typeof requestedDryRun === "boolean" ? requestedDryRun : true;
      const isSuperAdmin = hasAtLeastRole(req.user.role, "super_admin");
      const subscriptionIds = Array.from(
        new Set(
          (Array.isArray(req.body?.subscriptionIds)
            ? req.body.subscriptionIds
            : []
          )
            .map((value: unknown) => Number(value))
            .filter((value: number) => Number.isInteger(value) && value > 0),
        ),
      );
      if (forceDryRun === false && !isSuperAdmin) {
        return res.status(403).json({
          success: false,
          error: "Only super admin can override dry-run mode",
        });
      }
      const result = await runDurableRecurringBilling({
        dryRun: forceDryRun,
        triggerSource: "manual",
        subscriptionIds:
          subscriptionIds.length > 0 ? subscriptionIds : undefined,
      });

      res.json({
        success: true,
        run: result,
        scheduler: getDurableBillingConfiguration(),
      });
    } catch (error: any) {
      console.error(
        "[Diagnostic] Error running recurring scheduler once:",
        error,
      );
      res.status(500).json({
        success: false,
        error: error?.message || "Failed to run recurring scheduler once",
      });
    }
  },
);

/**
 * Operator-safe recurring billing workflow:
 * preview (dry-run) or live run with commission follow-up sequence.
 */
router.post(
  "/api/admin/diagnostic/recurring-billing/operator-workflow",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user || !isAtLeastAdmin(req.user.role)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const modeRaw = String(req.body?.mode || "preview").toLowerCase();
      const mode: OperatorMode = modeRaw === "live" ? "live" : "preview";
      const isSuperAdmin = hasAtLeastRole(req.user.role, "super_admin");

      if (mode === "live" && !isSuperAdmin) {
        return res.status(403).json({
          success: false,
          error: "Only super admin can run live recurring billing",
        });
      }

      const commissionSchema = await getHistoricalCutoverSchemaStatus();
      if (mode === "live" && !commissionSchema.ready) {
        return res.status(503).json({
          success: false,
          code: "COMMISSION_SCHEMA_NOT_READY",
          error:
            "Live recurring billing is blocked until the required commission migration is applied.",
          commissionSchema,
        });
      }

      const run = await runDurableRecurringBilling({
        dryRun: mode !== "live",
        triggerSource: "manual",
      });
      const scheduler = getDurableBillingConfiguration();

      if (mode === "preview") {
        const readyPreviewCount = run.candidates.filter(
          (row) => row.exclusionReason === null,
        ).length;

        return res.json({
          success: true,
          mode,
          run,
          duePreview: {
            dueCount: run.candidates.length,
            rows: run.candidates,
            estimatedCommissionImpact: {
              potentialSuccessfulPayments: readyPreviewCount,
              estimatedCommissionEntries: readyPreviewCount,
              note: "Preview only estimate based on currently due, dry-run-ready records.",
            },
            note: "Preview only. No payments or commissions have been created.",
          },
          billingSummary: {
            totalDue: run.selected,
            succeeded: run.succeeded,
            declined: run.declined,
            unknown: run.unknown,
            skipped: run.skipped,
            internalPending: run.internalPending,
          },
          commissionSchema,
          scheduler,
        });
      }

      return res.json({
        success: true,
        mode,
        run,
        billingSummary: {
          totalDue: run.selected,
          succeeded: run.succeeded,
          declined: run.declined,
          unknown: run.unknown,
          skipped: run.skipped,
          internalPending: run.internalPending,
        },
        dueRows: run.candidates,
        commissionSummary: {
          internalSynchronizationIsPerPayment: true,
          internalPending: run.internalPending,
        },
        scheduler,
      });
    } catch (error: any) {
      console.error(
        "[Diagnostic] Error running operator recurring workflow:",
        error,
      );
      res.status(500).json({
        success: false,
        error: error?.message || "Failed to run operator recurring workflow",
      });
    }
  },
);

/**
 * One-time repair endpoint: backfill payment_tokens.original_network_trans_id for active card tokens.
 * Mode defaults to preview. Use { mode: 'apply' } to persist updates.
 */
router.post(
  "/api/admin/diagnostic/recurring-billing/repair-card-auth-guids",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user || !isAtLeastAdmin(req.user.role)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const mode =
        String(req.body?.mode || "preview").toLowerCase() === "apply"
          ? "apply"
          : "preview";
      const force = req.body?.force === true;
      const isSuperAdmin = hasAtLeastRole(req.user.role, "super_admin");
      const requestedBy = req.user.email || req.user.id || "unknown-admin";

      if (mode === "apply" && !isSuperAdmin) {
        return res.status(403).json({
          success: false,
          error: "Only super admin can apply recurring auth-guid repairs",
        });
      }

      const requestedLimit = Number(req.body?.limit);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 5000)
        : 500;

      let priorRun: any = null;
      try {
        const existingRepairSetting = await getPlatformSetting<any>(
          RECURRING_CARD_AUTH_REPAIR_SETTING_KEY,
        );
        priorRun = existingRepairSetting?.value || null;
      } catch (platformSettingReadError: any) {
        console.warn(
          "[Diagnostic] Could not read recurring repair platform setting:",
          platformSettingReadError?.message,
        );
      }
      const alreadyCompleted = Boolean(priorRun?.completedAt);

      if (mode === "apply" && alreadyCompleted && !force) {
        return res.status(409).json({
          success: false,
          error:
            "Recurring card auth-guid repair already completed. Set force=true to run again.",
          alreadyCompleted: true,
          priorRun,
        });
      }

      const candidateResult = await query(
        `
        SELECT
          pt.id AS token_id,
          pt.member_id,
          TRIM(CONCAT(COALESCE(m.first_name, ''), ' ', COALESCE(m.last_name, ''))) AS member_name,
          pt.bric_token,
          pt.payment_method_type,
          pt.original_network_trans_id,
          s.amount AS subscription_amount,
          s.next_billing_date,
          p.id AS payment_id,
          p.member_id AS payment_member_id,
          p.status AS payment_status,
          p.amount AS payment_amount,
          COALESCE(
            NULLIF(TRIM(p.transaction_id), ''),
            NULLIF(TRIM(p.metadata->>'invoiceNumber'), ''),
            NULLIF(TRIM(p.metadata->>'Invoice'), ''),
            NULLIF(TRIM(p.metadata->>'orderNumber'), '')
          ) AS payment_receipt_reference,
          p.epx_auth_guid,
          p.payment_transaction_at,
          p.created_at AS payment_created_at,
          COALESCE(p.metadata->>'MID', p.metadata->>'mid', p.metadata->>'merchantId') AS payment_mid,
          COALESCE(
            p.metadata->'hostedCallback'->>'MID',
            p.metadata->'hostedCallback'->>'mid',
            p.metadata->'hostedCallback'->>'merchantId'
          ) AS receipt_mid,
          CASE WHEN p.epx_auth_guid IS NULL THEN false ELSE EXISTS (
            SELECT 1
            FROM payments p2
            WHERE TRIM(p2.epx_auth_guid) = TRIM(p.epx_auth_guid)
              AND p2.member_id::text <> pt.member_id::text
          ) END AS payment_auth_conflict,
          CASE WHEN pt.bric_token IS NULL THEN false ELSE EXISTS (
            SELECT 1
            FROM payment_tokens pt2
            WHERE TRIM(pt2.bric_token) = TRIM(pt.bric_token)
              AND pt2.id <> pt.id
              AND pt2.member_id::text <> pt.member_id::text
          ) END AS bric_conflict
        FROM payment_tokens pt
        LEFT JOIN members m
          ON m.id::text = pt.member_id::text
        INNER JOIN LATERAL (
          SELECT amount, next_billing_date
          FROM subscriptions
          WHERE member_id::text = pt.member_id::text
            AND status = 'active'
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        ) s ON true
        LEFT JOIN LATERAL (
          SELECT id, member_id, status, amount, transaction_id, epx_auth_guid,
                 payment_transaction_at, created_at, metadata
          FROM payments
          WHERE member_id::text = pt.member_id::text
            AND epx_auth_guid IS NOT NULL
            AND LENGTH(TRIM(epx_auth_guid::text)) >= 8
            AND LOWER(COALESCE(status, '')) IN ('success', 'succeeded', 'completed')
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        ) p ON true
        WHERE pt.is_active = true
          AND pt.payment_method_type = 'CreditCard'
          AND m.status = 'active'
          AND COALESCE(m.is_active, true) = true
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
          memberName: String(row.member_name || "").trim(),
          sourceTransactionOrInvoice: row.payment_receipt_reference || null,
          sourceAmount: row.payment_amount ?? null,
          subscriptionAmount: row.subscription_amount ?? null,
          paymentStatus: row.payment_status || null,
          paymentDate:
            row.payment_transaction_at || row.payment_created_at || null,
          referenceConflict:
            row.payment_auth_conflict === true || row.bric_conflict === true,
          candidateSourceType: isUsableTrustedAuthGuid(row.epx_auth_guid)
            ? "payments.epx_auth_guid"
            : !looksLikeEncryptedToken(String(row.bric_token || "")) &&
                isUsableAuthGuid(row.bric_token)
              ? "payment_tokens.bric_token_plain"
              : looksLikeEncryptedToken(String(row.bric_token || ""))
                ? "legacy_encrypted_bric"
                : "no_verified_processor_source",
          paymentCreatedAt: row.payment_created_at,
          resolvedAuthGuid: resolution.authGuid,
          resolvedAuthGuidMasked: maskAuthGuid(resolution.authGuid),
          resolutionSource: resolution.source,
          provenance: resolution.provenance,
          unresolvedReason: resolution.unresolvedReason,
        };
      });

      const resolvableCandidates = candidates.filter(
        (row: any) =>
          typeof row.resolvedAuthGuid === "string" &&
          row.resolvedAuthGuid.trim().length > 0,
      );
      const unresolvedCandidates = candidates.filter(
        (row: any) => !isUsableAuthGuid(row.resolvedAuthGuid),
      );

      const previewTable = candidates.map((row: any) => {
        const failedChecks = [
          !row.provenance.memberMatch ? "member match missing or failed" : null,
          !row.provenance.successfulPaymentMatch
            ? "successful payment status missing or failed"
            : null,
          !row.provenance.amountMatch
            ? "amount comparison missing or outside one cent"
            : null,
          !row.provenance.transactionMatch
            ? "transaction/order/invoice reference missing"
            : null,
          !row.provenance.dateCycleMatch
            ? "payment date does not fit expected cycle"
            : null,
          row.provenance.midStatus === "failed" ? "MID mismatch" : null,
        ].filter(Boolean);
        const autoRepairAllowed = isUsableAuthGuid(row.resolvedAuthGuid);

        return {
          member_id: row.memberId,
          member_name: row.memberName,
          source_type: row.candidateSourceType,
          source_transaction_or_invoice: row.sourceTransactionOrInvoice,
          source_amount: row.sourceAmount,
          subscription_amount: row.subscriptionAmount,
          amount_match: row.provenance.amountMatch,
          payment_status: row.paymentStatus,
          payment_date: row.paymentDate,
          mid_match_or_na: row.provenance.midStatus,
          repair_action: autoRepairAllowed
            ? "backfill_original_network_trans_id"
            : "review_only",
          auto_repair_allowed: autoRepairAllowed,
          review_reason: autoRepairAllowed
            ? null
            : [...failedChecks, row.unresolvedReason]
                .filter(Boolean)
                .join("; "),
        };
      });

      if (mode === "preview") {
        return res.json({
          success: true,
          mode,
          alreadyCompleted,
          priorRun,
          candidateCount: candidates.length,
          resolvableCount: resolvableCandidates.length,
          unresolvedCount: unresolvedCandidates.length,
          candidates: previewTable,
          note: "Preview only. No records were changed.",
        });
      }

      const updated: Array<{
        tokenId: number;
        memberId: string;
        paymentId: number;
        authGuidMasked: string | null;
      }> = [];

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
        endpoint:
          "/api/admin/diagnostic/recurring-billing/repair-card-auth-guids",
        version: 1,
      };

      try {
        await upsertPlatformSetting(
          RECURRING_CARD_AUTH_REPAIR_SETTING_KEY,
          repairSummary,
          requestedBy,
        );
      } catch (platformSettingWriteError: any) {
        console.warn(
          "[Diagnostic] Could not persist recurring repair platform setting:",
          platformSettingWriteError?.message,
        );
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
      console.error(
        "[Diagnostic] Error running recurring auth-guid repair:",
        error,
      );
      res.status(500).json({
        success: false,
        error: error?.message || "Failed to run recurring auth-guid repair",
      });
    }
  },
);

/**
 * Diagnostic/repair endpoint: reconcile payments approved by EPX but left in partial app state.
 * Mode defaults to preview. Use { mode: 'apply' } to persist updates.
 */
router.post(
  "/api/admin/diagnostic/epx-approved-reconciliation",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user || !isAtLeastAdmin(req.user.role)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const mode: ReconciliationMode =
        String(req.body?.mode || "preview").toLowerCase() === "apply"
          ? "apply"
          : "preview";
      const isSuperAdmin = hasAtLeastRole(req.user.role, "super_admin");

      if (mode === "apply" && !isSuperAdmin) {
        return res.status(403).json({
          success: false,
          error: "Only super admin can apply EPX reconciliation changes",
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

      const candidates = (candidateResult.rows || [])
        .map((row: any) => {
          const paymentStatus = normalizePaymentStatus(row.payment_status);
          const callbackStatus = normalizeCallbackStatus(
            row?.metadata?.hostedCallback?.status,
          );
          const paymentId = parseNumericId(row.payment_id);
          const memberId = parseNumericId(row.member_id);
          const subscriptionId = parseNumericId(row.subscription_id);
          const subscriptionMemberId = parseNumericId(
            row.subscription_member_id,
          );

          const needsPaymentStatusFix =
            !isPaymentSucceededStatus(paymentStatus) &&
            isCallbackSuccessStatus(callbackStatus);
          const needsMemberActivationFix =
            Boolean(memberId) &&
            isPaymentSucceededStatus(paymentStatus) &&
            (normalizePaymentStatus(row.member_status) !== "active" ||
              row.member_is_active !== true);
          const needsSubscriptionActivationFix =
            Boolean(subscriptionId) &&
            normalizePaymentStatus(row.subscription_status) in
              ({ pending: true, pending_payment: true } as Record<
                string,
                boolean
              >);
          const needsSubscriptionLinkFix =
            Boolean(memberId) &&
            !subscriptionId &&
            isPaymentSucceededStatus(paymentStatus);
          const needsSubscriptionMemberAlignmentFix =
            Boolean(memberId && subscriptionId && subscriptionMemberId) &&
            memberId !== subscriptionMemberId;

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
        })
        .filter((row: any) => row.paymentId);

      if (mode === "preview") {
        return res.json({
          success: true,
          mode,
          lookbackDays,
          limit,
          candidateCount: candidates.length,
          candidates,
          summary: {
            paymentStatusFixes: candidates.filter(
              (row: any) => row.drift.needsPaymentStatusFix,
            ).length,
            memberActivationFixes: candidates.filter(
              (row: any) => row.drift.needsMemberActivationFix,
            ).length,
            subscriptionActivationFixes: candidates.filter(
              (row: any) => row.drift.needsSubscriptionActivationFix,
            ).length,
            subscriptionLinkFixes: candidates.filter(
              (row: any) => row.drift.needsSubscriptionLinkFix,
            ).length,
            subscriptionMemberAlignmentIssues: candidates.filter(
              (row: any) => row.drift.needsSubscriptionMemberAlignmentFix,
            ).length,
          },
          note: "Preview only. No records were changed.",
        });
      }

      const applied: any[] = [];
      const errors: any[] = [];

      for (const candidate of candidates) {
        const actions: string[] = [];

        try {
          if (candidate.drift.needsPaymentStatusFix) {
            await storage.updatePayment(candidate.paymentId, {
              status: "succeeded" as any,
            });
            actions.push("payment_status->succeeded");
          }

          if (candidate.memberId && candidate.drift.needsMemberActivationFix) {
            const firstPaymentDate =
              candidate.paymentCreatedAt || new Date().toISOString();
            await storage.updateMember(candidate.memberId, {
              status: "active",
              isActive: true,
              firstPaymentDate,
            } as any);
            actions.push("member->active");
          }

          let effectiveSubscriptionId = candidate.subscriptionId;

          if (candidate.memberId && candidate.drift.needsSubscriptionLinkFix) {
            const { data: latestSubscription } = await supabase
              .from("subscriptions")
              .select("id, status, next_billing_date")
              .eq("member_id", candidate.memberId)
              .in("status", ["active", "pending", "pending_payment"])
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (latestSubscription?.id) {
              effectiveSubscriptionId = Number(latestSubscription.id);
              await storage.updatePayment(candidate.paymentId, {
                subscriptionId: String(effectiveSubscriptionId),
              });
              actions.push("payment.subscription_id->linked");
            }
          }

          if (effectiveSubscriptionId && candidate.memberId) {
            const { data: currentSubscription } = await supabase
              .from("subscriptions")
              .select("id, status, next_billing_date, member_id")
              .eq("id", effectiveSubscriptionId)
              .maybeSingle();

            const subscriptionStatus = normalizePaymentStatus(
              currentSubscription?.status,
            );
            const requiresStatusFix =
              subscriptionStatus === "pending" ||
              subscriptionStatus === "pending_payment";
            const requiresDateFix = !currentSubscription?.next_billing_date;
            const memberMismatch =
              parseNumericId(currentSubscription?.member_id) !==
              candidate.memberId;

            if (requiresStatusFix || requiresDateFix || memberMismatch) {
              const subscriptionPatch: Record<string, any> = {
                updated_at: new Date().toISOString(),
              };

              if (requiresStatusFix && !memberMismatch) {
                subscriptionPatch.status = "active";
              }

              if (requiresDateFix) {
                const base = candidate.paymentCreatedAt
                  ? new Date(candidate.paymentCreatedAt)
                  : new Date();
                subscriptionPatch.next_billing_date =
                  calculateNextBillingDate(base).toISOString();
              }

              if (Object.keys(subscriptionPatch).length > 1) {
                const { error: subscriptionUpdateError } = await supabase
                  .from("subscriptions")
                  .update(subscriptionPatch)
                  .eq("id", effectiveSubscriptionId)
                  .eq("member_id", candidate.memberId);

                if (subscriptionUpdateError) {
                  throw new Error(
                    `Failed updating subscription ${effectiveSubscriptionId}: ${subscriptionUpdateError.message}`,
                  );
                }

                if (subscriptionPatch.status === "active") {
                  actions.push("subscription->active");
                }
                if (subscriptionPatch.next_billing_date) {
                  actions.push("subscription.next_billing_date->set");
                }
              }

              if (memberMismatch) {
                actions.push("subscription_member_mismatch_detected");
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
            error: applyError?.message || "Unknown apply error",
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
        note: "Apply mode attempted deterministic reconciliation for EPX-approved drift records.",
      });
    } catch (error: any) {
      console.error(
        "[Diagnostic] Error running EPX approved reconciliation:",
        error,
      );
      res.status(500).json({
        success: false,
        error: error?.message || "Failed to run EPX approved reconciliation",
      });
    }
  },
);

/**
 * Diagnostic: Check if payment actually executed for a specific member
 */
router.get(
  "/api/admin/diagnostic/payment-execution/:memberId",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user || !isAtLeastAdmin(req.user.role)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const memberId = parseInt(req.params.memberId);
      if (isNaN(memberId)) {
        return res.status(400).json({ error: "Invalid member ID" });
      }

      // 1. Get member details
      const member = await storage.getMemberById(memberId);
      if (!member) {
        return res.status(404).json({ error: "Member not found" });
      }

      // 2. Check for payment record linked to this member
      const memberPaymentResult = await query(
        "SELECT * FROM payments WHERE member_id = $1 ORDER BY created_at DESC LIMIT 1",
        [memberId],
      );
      const memberPayment = memberPaymentResult.rows[0];

      // 3. Check for payments by this agent around enrollment date
      const enrollmentDate = new Date(member.enrollment_date);
      const dateBefore = new Date(
        enrollmentDate.getTime() - 24 * 60 * 60 * 1000,
      ); // 1 day before
      const dateAfter = new Date(
        enrollmentDate.getTime() + 24 * 60 * 60 * 1000,
      ); // 1 day after

      const agentPaymentsResult = await query(
        `SELECT * FROM payments 
       WHERE user_id = $1 
         AND created_at >= $2 
         AND created_at <= $3
       ORDER BY created_at DESC`,
        [
          member.enrolled_by_agent_id,
          dateBefore.toISOString(),
          dateAfter.toISOString(),
        ],
      );
      const agentPayments = agentPaymentsResult.rows;

      // 4. Check for orphaned payments (no member linked) around that time
      const orphanedPaymentsResult = await query(
        `SELECT * FROM payments 
       WHERE member_id IS NULL 
         AND created_at >= $1 
         AND created_at <= $2
       ORDER BY created_at DESC`,
        [dateBefore.toISOString(), dateAfter.toISOString()],
      );
      const orphanedPayments = orphanedPaymentsResult.rows;

      // 5. Check for payments with matching amount
      const matchingAmountResult = await query(
        `SELECT * FROM payments 
       WHERE amount::numeric = $1 
         AND created_at >= $2 
         AND created_at <= $3
       ORDER BY created_at DESC`,
        [
          member.total_monthly_price,
          dateBefore.toISOString(),
          dateAfter.toISOString(),
        ],
      );
      const matchingAmountPayments = matchingAmountResult.rows;

      // 6. Check commission record
      const commissionResult = await query(
        "SELECT * FROM agent_commissions WHERE member_id = $1",
        [memberId],
      );
      const commissions = commissionResult.rows;

      // 7. Check EPX logs (in-memory buffer + log files)
      let epxLogs: any[] = [];
      try {
        // Get recent EPX logs from memory
        const recentLogs = getRecentEPXLogs(200);

        // Filter logs around enrollment date
        const enrollmentDateStr = enrollmentDate.toISOString().split("T")[0];
        epxLogs = recentLogs.filter((log) => {
          const logDate = log.timestamp.split("T")[0];
          return logDate === enrollmentDateStr;
        });

        // Also try to read from log files
        const logDir =
          process.env.EPX_LOG_DIR || path.join(process.cwd(), "logs", "epx");
        const logFile = path.join(logDir, `epx-${enrollmentDateStr}.jsonl`);

        if (fs.existsSync(logFile)) {
          const fileContent = fs.readFileSync(logFile, "utf8");
          const fileLines = fileContent
            .split("\n")
            .filter((line) => line.trim());
          const fileLogs = fileLines
            .map((line) => {
              try {
                return JSON.parse(line);
              } catch {
                return null;
              }
            })
            .filter((log) => log !== null);

          // Look for logs mentioning this member or agent
          const relevantLogs = fileLogs.filter((log: any) => {
            const data = log.data || {};
            return (
              data.memberId === memberId ||
              data.member_id === memberId ||
              data.customerId === member.customer_number ||
              data.customerEmail === member.email ||
              data.userId === member.enrolled_by_agent_id ||
              (data.amount &&
                parseFloat(data.amount) === member.total_monthly_price)
            );
          });

          epxLogs = [...epxLogs, ...relevantLogs];
        }
      } catch (logError: any) {
        console.warn("[Diagnostic] Error reading EPX logs:", logError.message);
      }

      // 8. Determine conclusion
      let conclusion = "";
      let paymentExecuted = false;
      let evidence: string[] = [];

      if (memberPayment) {
        paymentExecuted = true;
        evidence.push(
          `✅ Payment record exists (ID: ${memberPayment.id}, Status: ${memberPayment.status})`,
        );
      } else {
        evidence.push("❌ No payment record found for this member");
      }

      if (agentPayments.length > 0) {
        evidence.push(
          `🔍 Found ${agentPayments.length} payment(s) by this agent around enrollment date`,
        );
      }

      if (orphanedPayments.length > 0) {
        evidence.push(
          `⚠️  Found ${orphanedPayments.length} orphaned payment(s) (no member linked) around enrollment date`,
        );
      }

      if (matchingAmountPayments.length > 0) {
        evidence.push(
          `💰 Found ${matchingAmountPayments.length} payment(s) matching amount ($${member.total_monthly_price})`,
        );
      }

      if (commissions.length > 0) {
        evidence.push(
          `✅ Commission record exists (${commissions.length} record(s))`,
        );
      }

      if (epxLogs.length > 0) {
        const successLogs = epxLogs.filter(
          (log: any) =>
            log.message?.toLowerCase().includes("success") ||
            log.data?.status === "succeeded",
        );
        evidence.push(
          `📋 Found ${epxLogs.length} EPX log entries (${successLogs.length} success indicators)`,
        );
      }

      // Determine what likely happened
      if (memberPayment && memberPayment.status === "succeeded") {
        conclusion =
          "✅ PAYMENT EXECUTED: Payment record exists with succeeded status. Member completed checkout successfully.";
      } else if (
        orphanedPayments.length > 0 ||
        matchingAmountPayments.length > 0
      ) {
        conclusion =
          "⚠️  PAYMENT LIKELY EXECUTED BUT NOT LINKED: Found payment records that might belong to this member but aren't properly associated.";
        paymentExecuted = true;
      } else if (
        epxLogs.some(
          (log: any) =>
            log.level === "error" ||
            log.message?.toLowerCase().includes("fail"),
        )
      ) {
        conclusion =
          "❌ PAYMENT FAILED: EPX logs show errors. Payment processing failed.";
      } else if (commissions.length > 0 && !memberPayment) {
        conclusion =
          "🚨 INCONSISTENT STATE: Commission exists but payment record missing. This is the bug we found - payment tracking failed during enrollment.";
      } else {
        conclusion =
          "❓ PAYMENT LIKELY NOT EXECUTED: No evidence of payment processing. Member may have abandoned checkout or payment was never initiated.";
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
          hasPaymentToken: !!member.payment_token,
        },
        evidence: {
          memberPayment: memberPayment || null,
          agentPayments: agentPayments.length,
          orphanedPayments: orphanedPayments.length,
          matchingAmountPayments: matchingAmountPayments.length,
          commissions: commissions.length,
          epxLogs: epxLogs.length,
        },
        detailedEvidence: evidence,
        conclusion: conclusion,
        paymentExecuted: paymentExecuted,
        recommendations: paymentExecuted
          ? [
              "Payment likely executed - verify with EPX settlement reports",
              "If payment confirmed, create manual payment record for tracking",
              "Investigate why payment record wasn't created automatically",
            ]
          : [
              "Payment may not have been completed",
              "Check EPX merchant portal for transaction on this date",
              "If no transaction found, member abandoned checkout",
              "If transaction found, create manual payment record",
            ],
      });
    } catch (error: any) {
      console.error("[Diagnostic] Error checking payment execution:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
);

export default router;
