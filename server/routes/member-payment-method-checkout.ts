import fs from "fs";
import path from "path";
import { Router, type Response } from "express";

import { authenticateToken, type AuthRequest } from "../auth/supabaseAuth";
import { query } from "../lib/neonDb";
import {
  EPXHostedCheckoutService,
  type EPXHostedCheckoutConfig,
} from "../services/epx-hosted-checkout-service";
import { paymentEnvironment } from "../services/payment-environment-service";
import {
  canManageMemberPaymentMethods,
  type PaymentMethodAction,
} from "../services/member-payment-method-service";
import { storage } from "../storage";
import { isRecaptchaEnabled, verifyRecaptcha } from "../utils/recaptcha";

const router = Router();

type BillingAddress = {
  streetAddress?: string;
  city?: string;
  state?: string;
  postalCode?: string;
};

function normalizeBillingAddress(value: unknown): BillingAddress | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const normalized: BillingAddress = {
    streetAddress: String(input.streetAddress || input.address || "").trim() || undefined,
    city: String(input.city || "").trim() || undefined,
    state: String(input.state || "").trim() || undefined,
    postalCode: String(input.postalCode || input.zipCode || input.zip || "").trim() || undefined,
  };
  return Object.values(normalized).some(Boolean) ? normalized : undefined;
}

function readFileConfig(): Partial<EPXHostedCheckoutConfig> | null {
  const candidates = [
    process.env.EPX_HOSTED_CONFIG_FILE,
    path.join(process.cwd(), "server", "config", "epx-hosted-config.production.json"),
    path.join(process.cwd(), "config", "epx-hosted-config.production.json"),
    path.join(process.cwd(), "epx-hosted-config.production.json"),
  ].filter((entry): entry is string => Boolean(entry));

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      return JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<EPXHostedCheckoutConfig>;
    } catch (error: any) {
      console.warn("[Payment Method Checkout] Unable to read hosted config", {
        filePath,
        error: error?.message,
      });
    }
  }
  return null;
}

async function resolveHostedConfig(
  paymentMethodType: "CreditCard" | "ACH",
): Promise<EPXHostedCheckoutConfig> {
  const environment = await paymentEnvironment.getEnvironment();
  const suffix = environment === "production" ? "PRODUCTION" : "SANDBOX";
  const fileConfig = readFileConfig();

  const basePublicKey =
    process.env[`EPX_PUBLIC_KEY_${suffix}`] ||
    process.env.EPX_PUBLIC_KEY ||
    fileConfig?.publicKey;
  const baseTerminalProfileId =
    process.env[`EPX_TERMINAL_PROFILE_ID_${suffix}`] ||
    process.env.EPX_TERMINAL_PROFILE_ID ||
    fileConfig?.terminalProfileId;

  const publicKey =
    paymentMethodType === "ACH"
      ? process.env[`EPX_PUBLIC_KEY_ACH_${suffix}`] ||
        process.env.EPX_PUBLIC_KEY_ACH ||
        basePublicKey
      : basePublicKey;
  const terminalProfileId =
    paymentMethodType === "ACH"
      ? process.env[`EPX_TERMINAL_PROFILE_ID_ACH_${suffix}`] ||
        process.env.EPX_TERMINAL_PROFILE_ID_ACH ||
        baseTerminalProfileId
      : baseTerminalProfileId;

  if (!publicKey || !terminalProfileId) {
    throw new Error("EPX Hosted Checkout configuration is unavailable");
  }

  return {
    publicKey,
    terminalProfileId,
    environment,
    successCallback: fileConfig?.successCallback || "epxSuccessCallback",
    failureCallback: fileConfig?.failureCallback || "epxFailureCallback",
  };
}

/**
 * Dedicated payment-method maintenance checkout.
 *
 * This route intentionally shadows the same path currently present in
 * epx-hosted-routes. It is mounted BEFORE the certified enrollment router so
 * Add/Replace/Pay Now can create a managed Hosted Checkout session without
 * changing or weakening the normal enrollment payment guards.
 */
router.post(
  "/api/members/:memberId/payment-methods/checkout",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const memberId = Number(req.params.memberId);
      const action = String(req.body?.action || "") as PaymentMethodAction;
      const paymentMethodType =
        String(req.body?.paymentMethodType || "")
          .trim()
          .toUpperCase() === "ACH"
          ? "ACH"
          : "CreditCard";

      if (
        !Number.isInteger(memberId) ||
        memberId <= 0 ||
        !["add", "replace", "pay_now"].includes(action) ||
        !req.user ||
        !(await canManageMemberPaymentMethods(memberId, req.user))
      ) {
        return res.status(403).json({ success: false, error: "Access denied" });
      }

      if (paymentMethodType === "ACH" && action !== "pay_now") {
        return res.status(422).json({
          success: false,
          code: "ACH_CREDENTIAL_VERIFICATION_UNVERIFIED",
          error:
            "Bank account Add/Replace requires Pay Now & Use for Recurring so EPX can authorize and save the recurring credential.",
        });
      }

      if (isRecaptchaEnabled()) {
        const captchaResult = await verifyRecaptcha(
          String(req.body?.captchaToken || ""),
          "hosted_checkout",
        );
        if (!captchaResult.success) {
          return res.status(400).json({
            success: false,
            code: "RECAPTCHA_FAILED",
            error: "Captcha verification failed",
          });
        }
      }

      const member = await storage.getMember(memberId);
      const subscriptionResult = await query(
        `SELECT id, amount
         FROM subscriptions
         WHERE member_id = $1 AND status = 'active'
         ORDER BY id DESC
         LIMIT 1`,
        [memberId],
      );
      const subscription = subscriptionResult.rows[0];

      if (!member || !subscription) {
        return res.status(404).json({
          success: false,
          error: "Active member subscription not found",
        });
      }

      const amount = action === "pay_now" ? Number(subscription.amount) : 1;
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({
          success: false,
          error: "A valid amount is required",
        });
      }

      const customerEmail = String(member.email || "").trim();
      if (!customerEmail) {
        return res.status(400).json({
          success: false,
          error: "Member email is required for secure checkout",
        });
      }

      const customerName =
        `${member.firstName || ""} ${member.lastName || ""}`.trim() ||
        `Member ${memberId}`;
      const billingAddress =
        normalizeBillingAddress(req.body?.billingAddress) ||
        normalizeBillingAddress({
          streetAddress: member.address,
          city: member.city,
          state: member.state,
          postalCode: member.zipCode,
        });

      const config = await resolveHostedConfig(paymentMethodType);
      const hostedCheckoutService = new EPXHostedCheckoutService(config);
      const orderNumber = Date.now().toString().slice(-10);
      const session = hostedCheckoutService.createCheckoutSession(
        amount,
        orderNumber,
        customerEmail,
        customerName,
        billingAddress,
      );

      if (!session.success) {
        return res.status(400).json(session);
      }

      const paymentMethodManagement = {
        memberId,
        action,
        replaceTokenId: Number(req.body?.replaceTokenId) || null,
        initiatedByUserId: req.user.id,
        initiatedByEmail: req.user.email || null,
        initiatedByRole: req.user.role || null,
        initiatedAt: new Date().toISOString(),
        status: "pending",
      };

      const metadata: Record<string, any> = {
        paymentType: "hosted-checkout",
        environment: config.environment,
        customerEmail,
        customerName,
        description: `Payment method ${action} for member #${memberId}`,
        orderNumber,
        originalCustomerId: String(memberId),
        billingAddress: billingAddress || null,
        requestedAmount: amount,
        requestedPaymentMethodType: paymentMethodType,
        deliveryMode: "embedded_checkout",
        paymentMethodManagement,
      };

      if (action !== "pay_now") {
        metadata.transactionPurpose = "payment_method_verification";
        metadata.excludeFromMembershipPayment = true;
        metadata.manualReversalRequired = true;
      }

      const createdPayment = await storage.createPayment({
        memberId,
        userId: null,
        subscriptionId: String(subscription.id),
        amount: amount.toFixed(2),
        currency: "USD",
        status: "pending",
        paymentMethod: paymentMethodType === "ACH" ? "ach" : "card",
        paymentMethodType,
        transactionId: orderNumber,
        metadata,
      });

      const checkoutConfig = hostedCheckoutService.getCheckoutConfig();

      console.log("[Payment Method Checkout] Managed session created", {
        memberId,
        action,
        paymentMethodType,
        paymentId: createdPayment?.id || null,
        transactionId: orderNumber,
      });

      return res.json({
        success: true,
        transactionId: orderNumber,
        sessionId: session.sessionId,
        publicKey: session.publicKey,
        scriptUrl: checkoutConfig.scriptUrl,
        terminalProfileId: config.terminalProfileId,
        environment: config.environment,
        captchaMode: checkoutConfig.captchaMode,
        paymentMethod: "hosted-checkout",
        requestedAmount: amount,
        tranType: "CCE1",
        formData: {
          amount: amount.toFixed(2),
          orderNumber,
          invoiceNumber: orderNumber,
          email: customerEmail,
          billingName: customerName,
          ...(billingAddress || {}),
        },
      });
    } catch (error: any) {
      console.error("[Payment Method Checkout] Failed to create managed session", {
        error: error?.message,
      });
      return res.status(500).json({
        success: false,
        error: error?.message || "Unable to initialize payment method checkout",
      });
    }
  },
);

export default router;
