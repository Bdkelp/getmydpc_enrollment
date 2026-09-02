import { createHash, timingSafeEqual } from "node:crypto";

import { Router, type Request, type Response } from "express";

import { query } from "../lib/neonDb";
import {
  getDurableBillingConfiguration,
  runDurableRecurringBilling,
} from "../services/durable-recurring-billing-service";
import { sendBillingSchedulerNotRunningAlert } from "../email";

const router = Router();
const DEFAULT_STALE_MINUTES = 15;

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function schedulerAuthorized(req: Request): boolean {
  const expected = String(process.env.BILLING_SCHEDULER_TOKEN || "");
  const authorization = String(req.headers.authorization || "");
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!expected || !supplied) return false;
  return timingSafeEqual(digest(supplied), digest(expected));
}

function requireSchedulerAuth(req: Request, res: Response): boolean {
  if (schedulerAuthorized(req)) return true;
  res.status(401).json({ success: false, error: "Scheduler authentication required" });
  return false;
}

router.post(
  "/api/internal/recurring-billing/run",
  async (req: Request, res: Response) => {
    if (!requireSchedulerAuth(req, res)) return;
    try {
      const forceLive = req.body?.mode === "live";
      const result = await runDurableRecurringBilling({
        dryRun: !forceLive,
        triggerSource: "supabase_cron",
        scheduledAt:
          typeof req.body?.scheduledAt === "string" ? req.body.scheduledAt : undefined,
      });
      res.json({ success: true, configuration: getDurableBillingConfiguration(), run: result });
    } catch (error: any) {
      console.error("[Durable Billing] External run failed", {
        error: error?.message || String(error),
      });
      res.status(503).json({
        success: false,
        error: error?.message || "External recurring billing run failed",
        configuration: getDurableBillingConfiguration(),
      });
    }
  },
);

router.post(
  "/api/internal/recurring-billing/health-check",
  async (req: Request, res: Response) => {
    if (!requireSchedulerAuth(req, res)) return;
    const parsedThreshold = Number.parseInt(
      process.env.RECURRING_BILLING_STALE_ALERT_MINUTES || String(DEFAULT_STALE_MINUTES),
      10,
    );
    const staleThresholdMinutes = Number.isFinite(parsedThreshold)
      ? Math.max(10, parsedThreshold)
      : DEFAULT_STALE_MINUTES;
    const latest = await query(
      `SELECT id, started_at, completed_at, status
       FROM public.recurring_billing_runs
       ORDER BY started_at DESC LIMIT 1`,
    );
    const exceptionalCycles = await query(
      `SELECT state, COUNT(*)::integer AS count
       FROM public.recurring_billing_cycles
       WHERE state IN ('unknown', 'internal_sync_pending', 'submitting')
       GROUP BY state`,
    );
    const stuckRuns = await query(
      `SELECT COUNT(*)::integer AS count
       FROM public.recurring_billing_runs
       WHERE status = 'running'
         AND started_at < NOW() - make_interval(mins => $1)`,
      [staleThresholdMinutes],
    );
    const completedAt = latest.rows[0]?.completed_at
      ? new Date(latest.rows[0].completed_at)
      : null;
    const elapsedMinutes = completedAt
      ? Math.max(0, Math.floor((Date.now() - completedAt.getTime()) / 60_000))
      : null;
    const stale = elapsedMinutes === null || elapsedMinutes >= staleThresholdMinutes;
    const latestFailed = latest.rows[0]?.status === "failed";
    const stuckRunCount = Number(stuckRuns.rows[0]?.count || 0);
    const cycleCounts = Object.fromEntries(
      exceptionalCycles.rows.map((row) => [row.state, Number(row.count)]),
    ) as Record<string, number>;
    const unresolvedCycleCount =
      (cycleCounts.unknown || 0) +
      (cycleCounts.internal_sync_pending || 0) +
      (cycleCounts.submitting || 0);
    const unhealthy =
      stale || latestFailed || stuckRunCount > 0 || unresolvedCycleCount > 0;

    if (unhealthy) {
      await sendBillingSchedulerNotRunningAlert({
        recipients: String(
          process.env.RECURRING_BILLING_REPORT_RECIPIENTS || "info@mypremierplans.com",
        )
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        elapsedMinutes: elapsedMinutes ?? staleThresholdMinutes,
        staleThresholdMinutes,
        lastOutcome: latestFailed
          ? "failed"
          : stuckRunCount > 0
            ? "stuck_running"
            : unresolvedCycleCount > 0
              ? "reconciliation_required"
              : latest.rows[0]?.status || "no_external_run",
        lastStartedAt: latest.rows[0]?.started_at
          ? new Date(latest.rows[0].started_at).toISOString()
          : null,
        lastCompletedAt: completedAt?.toISOString() || null,
      });
    }

    res.status(unhealthy ? 503 : 200).json({
      success: !unhealthy,
      stale,
      latestFailed,
      stuckRunCount,
      unresolvedCycles: {
        unknown: cycleCounts.unknown || 0,
        internalSyncPending: cycleCounts.internal_sync_pending || 0,
        submitting: cycleCounts.submitting || 0,
      },
      staleThresholdMinutes,
      elapsedMinutesSinceCompletedRun: elapsedMinutes,
      lastCompletedAt: completedAt?.toISOString() || null,
      configuration: getDurableBillingConfiguration(),
    });
  },
);

export default router;
