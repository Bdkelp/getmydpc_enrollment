import { createHash, timingSafeEqual } from "node:crypto";

import type { Request, RequestHandler, Response } from "express";

type BillingMode = "dry_run" | "live";

type RunBilling = (options: {
  dryRun: boolean;
  triggerSource: "supabase_cron";
  scheduledAt?: string;
}) => Promise<unknown>;

interface RunHandlerDependencies {
  runBilling: RunBilling;
  getConfiguration: () => unknown;
  environment?: NodeJS.ProcessEnv;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function envTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function schedulerAuthorized(
  req: Request,
  environment: NodeJS.ProcessEnv,
): boolean {
  const expected = String(environment.BILLING_SCHEDULER_TOKEN || "");
  const authorization = String(req.headers.authorization || "");
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!expected || !supplied) return false;
  return timingSafeEqual(digest(supplied), digest(expected));
}

function reject(res: Response, status: number, error: string): void {
  res.status(status).json({ success: false, error });
}

export function createInternalRecurringBillingRunHandler(
  dependencies: RunHandlerDependencies,
): RequestHandler {
  const environment = dependencies.environment || process.env;

  return async (req, res) => {
    if (!schedulerAuthorized(req, environment)) {
      reject(res, 401, "Scheduler authentication required");
      return;
    }

    const mode = req.body?.mode as BillingMode | undefined;
    if (mode !== "dry_run" && mode !== "live") {
      reject(res, 400, "Billing mode must be dry_run or live");
      return;
    }

    if (!envTrue(environment.EXTERNAL_BILLING_ENABLED)) {
      reject(res, 503, "EXTERNAL_BILLING_DISABLED");
      return;
    }
    if (envTrue(environment.RECURRING_BILLING_KILL_SWITCH)) {
      reject(res, 503, "RECURRING_BILLING_KILL_SWITCH_ACTIVE");
      return;
    }
    if (mode === "live" && environment.EXTERNAL_BILLING_DRY_RUN !== "false") {
      reject(res, 503, "EXTERNAL_BILLING_DRY_RUN_ENABLED");
      return;
    }

    try {
      const result = await dependencies.runBilling({
        dryRun: mode === "dry_run",
        triggerSource: "supabase_cron",
        scheduledAt:
          typeof req.body?.scheduledAt === "string"
            ? req.body.scheduledAt
            : undefined,
      });
      res.json({
        success: true,
        configuration: dependencies.getConfiguration(),
        run: result,
      });
    } catch (error: any) {
      console.error("[Durable Billing] External run failed", {
        error: error?.message || String(error),
      });
      res.status(503).json({
        success: false,
        error: error?.message || "External recurring billing run failed",
        configuration: dependencies.getConfiguration(),
      });
    }
  };
}
