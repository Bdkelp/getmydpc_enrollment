import { Router, type Response } from "express";

import { authenticateToken, type AuthRequest } from "../auth/supabaseAuth";
import { hasAtLeastRole } from "../auth/roles";
import {
  PaymentCredentialRestoreError,
  restorePaymentCredentialFromNorthTranId,
} from "../services/member-payment-method-service";

const router = Router();

/**
 * Super-admin credential restoration from the North portal Tran ID / BRIC.
 * See docs/vendor/epx/EPX_CERTIFICATION_REFERENCE.md: the BRIC alone is the
 * certified recurring credential; AUTH_CODE and other response metadata are
 * not required. Saving submits no charge.
 */
router.post(
  "/api/admin/members/:memberId/payment-methods/:paymentTokenId/restore-credential",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    if (!req.user || !hasAtLeastRole(req.user.role, "super_admin")) {
      return res
        .status(403)
        .json({ success: false, error: "Super admin access required" });
    }

    const memberId = Number(req.params.memberId);
    const paymentTokenId = Number(req.params.paymentTokenId);
    if (
      !Number.isInteger(memberId) ||
      memberId <= 0 ||
      !Number.isInteger(paymentTokenId) ||
      paymentTokenId <= 0
    ) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid member or payment method" });
    }

    try {
      const result = await restorePaymentCredentialFromNorthTranId({
        memberId,
        paymentTokenId,
        northTranId: req.body?.northTranId,
        actor: {
          id: req.user.id,
          email: req.user.email || null,
          role: req.user.role || null,
        },
      });
      console.log("[Payment Credential Restore] BRIC restored", {
        memberId,
        paymentTokenId,
        restoredReference: result.restoredReference,
        restoredBy: req.user.email || req.user.id,
      });
      return res.json({ success: true, chargeSubmitted: false, ...result });
    } catch (error: any) {
      if (error instanceof PaymentCredentialRestoreError) {
        return res
          .status(error.status)
          .json({ success: false, code: error.code, error: error.message });
      }
      console.error("[Payment Credential Restore] Failed", {
        memberId,
        paymentTokenId,
        error: error?.message,
      });
      return res
        .status(500)
        .json({ success: false, error: "Unable to restore payment credential" });
    }
  },
);

export default router;
