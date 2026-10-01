import { Router, type Response } from "express";

import { authenticateToken, type AuthRequest } from "../auth/supabaseAuth";
import {
  createPaymentTokenFromNorthTranId,
  restorePaymentCredentialFromNorthTranId,
} from "../services/member-payment-method-service";
import {
  canRestorePaymentCredential,
  PaymentCredentialRestoreError,
} from "../services/payment-credential-restore";

const router = Router();

function parsePositiveId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function handleRestore(
  req: AuthRequest,
  res: Response,
  run: (actor: { id: string; email: string | null; role: string | null }) => Promise<{
    paymentTokenId: number;
    restoredReference: string;
    created: boolean;
  }>,
) {
  if (!req.user || !canRestorePaymentCredential(req.user.role)) {
    return res
      .status(403)
      .json({ success: false, error: "Super admin access required" });
  }
  const memberId = parsePositiveId(req.params.memberId);
  try {
    const result = await run({
      id: req.user.id,
      email: req.user.email || null,
      role: req.user.role || null,
    });
    console.log("[Payment Credential Restore] North Tran ID / BRIC restored", {
      memberId,
      paymentTokenId: result.paymentTokenId,
      created: result.created,
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
      error: error?.message,
    });
    return res
      .status(500)
      .json({ success: false, error: "Unable to restore payment credential" });
  }
}

/**
 * Super-admin credential restoration from the North portal Tran ID / BRIC.
 * See docs/vendor/epx/EPX_CERTIFICATION_REFERENCE.md: the BRIC alone is the
 * certified recurring credential; AUTH_CODE and other response metadata are
 * not required. Saving submits no charge.
 */

// Replace an unusable BRIC on the member's active default payment method.
router.post(
  "/api/admin/members/:memberId/payment-methods/:paymentTokenId/restore-credential",
  authenticateToken,
  (req: AuthRequest, res: Response) => {
    const memberId = parsePositiveId(req.params.memberId);
    const paymentTokenId = parsePositiveId(req.params.paymentTokenId);
    return handleRestore(req, res, (actor) => {
      if (!memberId || !paymentTokenId) {
        throw new PaymentCredentialRestoreError(
          400,
          "invalid_request",
          "Invalid member or payment method",
        );
      }
      return restorePaymentCredentialFromNorthTranId({
        memberId,
        paymentTokenId,
        northTranId: req.body?.northTranId,
        actor,
      });
    });
  },
);

// Create the active default payment method for a member who has none.
router.post(
  "/api/admin/members/:memberId/payment-methods/restore-credential",
  authenticateToken,
  (req: AuthRequest, res: Response) => {
    const memberId = parsePositiveId(req.params.memberId);
    return handleRestore(req, res, (actor) => {
      if (!memberId) {
        throw new PaymentCredentialRestoreError(400, "invalid_request", "Invalid member");
      }
      return createPaymentTokenFromNorthTranId({
        memberId,
        paymentMethodType: req.body?.paymentMethodType,
        northTranId: req.body?.northTranId,
        actor,
      });
    });
  },
);

export default router;
