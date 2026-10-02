import { Router, type Response } from "express";

import { authenticateToken, type AuthRequest } from "../auth/supabaseAuth";
import {
  canReconcileNorthPayments,
  NorthReconciliationError,
} from "../services/north-payment-reconciliation";
import { reconcileNorthPayment } from "../services/north-payment-reconciliation-service";

const router = Router();

/**
 * Super-admin reconciliation of a North merchant-portal payment (or waiver of
 * a platform-caused gap) for one billing month. mode=preview (default) makes
 * no changes; mode=apply records it. Never submits a processor charge.
 */
router.post(
  "/api/admin/billing-operations/reconcile-north-payment",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    if (!req.user || !canReconcileNorthPayments(req.user.role)) {
      return res
        .status(403)
        .json({ success: false, error: "Super admin access required" });
    }
    const dryRun = String(req.body?.mode || "preview").toLowerCase() !== "apply";
    try {
      const result = await reconcileNorthPayment(
        (req.body || {}) as Record<string, unknown>,
        {
          id: req.user.id,
          email: req.user.email || null,
          role: req.user.role || null,
        },
        { dryRun },
      );
      if (!dryRun) {
        console.log("[North Reconciliation] Recorded", {
          outcome: result.outcome,
          decision: result.decision,
          memberId: result.memberId,
          subscriptionId: result.subscriptionId,
          cycleDate: result.cycleDate,
          nextBillingDate: result.nextBillingDate,
          paymentId: result.paymentId,
          cycleId: result.cycleId,
          paymentConfirmation: result.paymentConfirmation,
          recordedBy: req.user.email || req.user.id,
        });
      }
      return res.json({ success: true, ...result });
    } catch (error: any) {
      if (error instanceof NorthReconciliationError) {
        return res.status(error.status).json({
          success: false,
          code: error.code,
          error: error.message,
          ...(error.details ? { details: error.details } : {}),
        });
      }
      console.error("[North Reconciliation] Failed", { error: error?.message });
      return res
        .status(500)
        .json({ success: false, error: "Unable to reconcile North payment" });
    }
  },
);

export default router;
