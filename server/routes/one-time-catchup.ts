import { Router, type Response } from "express";
import { authenticateToken, type AuthRequest } from "../auth/supabaseAuth";
import { canRestorePaymentCredential } from "../services/payment-credential-restore";
import { resolveCanonicalPaymentCredential } from "../services/payment-credential";
import { query } from "../lib/neonDb";

const router = Router();

/** Read-only preflight for a future schedule-neutral catch-up action.
 * No charge endpoint is exposed until idempotent processor handling is implemented.
 */
router.post("/api/admin/billing-operations/one-time-catchup/preview", authenticateToken,
  async (req: AuthRequest, res: Response) => {
    if (!req.user || !canRestorePaymentCredential(req.user.role)) {
      return res.status(403).json({ success: false, error: "Super Admin required" });
    }
    const memberId = Number(req.body?.memberId);
    const month = String(req.body?.cycleMonth || "");
    if (!Number.isSafeInteger(memberId) || memberId <= 0 ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ success: false, error: "Member ID and YYYY-MM month are required" });
    }
    try {
      const result = await query(
        `SELECT m.id AS member_id, m.first_name, m.last_name, m.status AS member_status,
                s.id AS subscription_id, s.status AS subscription_status,
                s.billing_mode, s.amount, s.next_billing_date,
                t.id AS token_id, t.payment_method_type,
                t.bric_token, t.original_network_trans_id
         FROM members m
         JOIN subscriptions s ON s.member_id = m.id
         LEFT JOIN LATERAL (
           SELECT id, payment_method_type, bric_token, original_network_trans_id
           FROM payment_tokens
           WHERE member_id = m.id AND is_active = true AND is_primary = true
           ORDER BY id DESC LIMIT 1
         ) t ON true
         WHERE m.id = $1 AND s.status = 'active'
         ORDER BY s.id DESC LIMIT 1`,
        [memberId],
      );
      const row = result.rows[0];
      if (!row) return res.status(404).json({ success: false, error: "Active subscription not found" });
      const reference = resolveCanonicalPaymentCredential(row.original_network_trans_id).error
        ? resolveCanonicalPaymentCredential(row.bric_token)
        : resolveCanonicalPaymentCredential(row.original_network_trans_id);
      const settled = await query(
        `SELECT EXISTS(
           SELECT 1 FROM recurring_billing_cycles
           WHERE member_id = $1 AND subscription_id = $2
             AND to_char(cycle_date, 'YYYY-MM') = $3
             AND state IN ('completed','processor_succeeded','internal_sync_pending','unknown','submitting')
         ) AS covered_cycle,
         EXISTS(
           SELECT 1 FROM payments
           WHERE member_id = $1 AND subscription_id = $2
             AND to_char(created_at, 'YYYY-MM') = $3
             AND status IN ('success','succeeded','completed')
         ) AS recorded_success`,
        [memberId, row.subscription_id, month],
      );
      const alreadyCovered = Boolean(settled.rows[0]?.covered_cycle || settled.rows[0]?.recorded_success);
      const eligible = row.member_status !== "cancelled" && row.subscription_status === "active" &&
        row.payment_method_type === "CreditCard" && !reference.error && !alreadyCovered;
      return res.json({
        success: true, chargeSubmitted: false, chargeEnabled: false,
        memberId, memberName: [row.first_name, row.last_name].join(" "),
        subscriptionId: row.subscription_id, amount: row.amount,
        cycleMonth: month, nextBillingDate: row.next_billing_date,
        billingMode: row.billing_mode, paymentMethodType: row.payment_method_type || null,
        credentialAvailable: !reference.error,
        alreadyCovered, candidateEligible: eligible,
        message: "Preview only. Schedule-neutral payment execution is not enabled or deployed.",
      });
    } catch (error: any) {
      console.error("[Catch-up preview] Failed", { memberId, message: error?.message });
      return res.status(500).json({ success: false, error: "Unable to preview catch-up" });
    }
  });
export default router;
