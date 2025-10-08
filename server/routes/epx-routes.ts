/**
 * EPX Payment Routes
 * Express routes for EPX payment integration
 */

import { Router, Request, Response } from "express";
import { getEPXService } from "../services/epx-payment-service";
import crypto from "crypto";

const router = Router();

/**
 * Create Payment Endpoint
 * Generates TAC and returns Browser Post form data for EPX payment
 */
router.post("/api/epx/create-payment", async (req: Request, res: Response) => {
  try {
    const { amount, tranNbr, customerData, metadata } = req.body;

    // Validate required fields
    if (!amount || !tranNbr) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: amount and tranNbr are required",
      });
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[EPX Create Payment] Request received:", {
        amount,
        tranNbr,
      });
    }

    // Get EPX service instance
    const epxService = getEPXService();

    // Generate TAC
    const tacResponse = await epxService.generateTAC({
      amount,
      tranNbr,
      tranGroup: metadata?.tranGroup,
      customerEmail: customerData?.email,
      invoiceNumber: metadata?.invoiceNumber,
      orderDescription: metadata?.orderDescription,
    });

    if (!tacResponse.success || !tacResponse.tac) {
      return res.status(500).json({
        success: false,
        error: "Failed to generate TAC",
        details: tacResponse.error,
      });
    }

    // Get Browser Post form data
    const formData = epxService.getPaymentFormData(
      tacResponse.tac,
      amount,
      tranNbr,
      "card",
      customerData || {},
    );

    if (process.env.NODE_ENV === "development") {
      console.log("[EPX Create Payment] Success");
    }

    return res.json({
      success: true,
      formData,
      epxEndpoint:
        epxService.getConfig().environment === "sandbox"
          ? "https://services.epxuap.com/browserpost/"
          : "https://services.epx.com/browserpost/",
    });
  } catch (error: any) {
    console.error("[EPX Create Payment] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * Payment Redirect Handler
 * Handles the redirect from EPX after payment processing
 */
router.get("/api/epx/redirect", async (req: Request, res: Response) => {
  try {
    const { TRAN_NBR, RESPONSE_CODE, MESSAGE, AMOUNT, AUTH_CODE } = req.query;

    if (process.env.NODE_ENV === "development") {
      console.log("[EPX Redirect] Payment completed:", {
        tranNbr: TRAN_NBR,
        responseCode: RESPONSE_CODE,
        amount: AMOUNT,
      });
    }

    // Check if payment was successful
    const isSuccess = RESPONSE_CODE === "00" || RESPONSE_CODE === "000";

    if (isSuccess) {
      // Redirect to success page
      return res.redirect(
        `/payment-success?tranNbr=${TRAN_NBR}&amount=${AMOUNT}&authCode=${AUTH_CODE}`,
      );
    } else {
      // Redirect to failure page
      return res.redirect(
        `/payment-failed?tranNbr=${TRAN_NBR}&message=${encodeURIComponent((MESSAGE as string) || "Payment failed")}`,
      );
    }
  } catch (error: any) {
    console.error("[EPX Redirect] Error:", error.message);
    return res.redirect("/payment-error");
  }
});

/**
 * Payment Webhook Handler
 * Receives asynchronous payment notifications from EPX
 */
router.post("/api/epx/webhook", async (req: Request, res: Response) => {
  try {
    const webhookData = req.body;

    if (process.env.NODE_ENV === "development") {
      console.log("[EPX Webhook] Notification received:", webhookData);
    }

    // Validate webhook signature if configured
    const epxService = getEPXService();
    const config = epxService.getConfig();

    if (config.webhookSecret) {
      const signature = req.headers["x-epx-signature"] as string;
      if (!signature) {
        return res.status(401).json({
          success: false,
          error: "Missing webhook signature",
        });
      }

      // Verify signature
      const expectedSignature = crypto
        .createHmac("sha256", config.webhookSecret)
        .update(JSON.stringify(webhookData))
        .digest("hex");

      if (signature !== expectedSignature) {
        return res.status(401).json({
          success: false,
          error: "Invalid webhook signature",
        });
      }
    }

    // Process webhook data (update database, send notifications, etc.)
    // TODO: Add your webhook processing logic here

    return res.json({ success: true, received: true });
  } catch (error: any) {
    console.error("[EPX Webhook] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Webhook processing failed",
    });
  }
});

/**
 * Payment Cancel Handler
 * Handles user cancellation from EPX payment page
 */
router.get("/api/epx/cancel", async (req: Request, res: Response) => {
  try {
    const { TRAN_NBR } = req.query;

    if (process.env.NODE_ENV === "development") {
      console.log("[EPX Cancel] Payment cancelled:", { tranNbr: TRAN_NBR });
    }

    return res.redirect(`/payment-cancelled?tranNbr=${TRAN_NBR}`);
  } catch (error: any) {
    console.error("[EPX Cancel] Error:", error.message);
    return res.redirect("/payment-error");
  }
});

/**
 * Health Check Endpoint
 * Verifies EPX service configuration
 */
router.get("/api/epx/health", async (req: Request, res: Response) => {
  try {
    const epxService = getEPXService();
    const config = epxService.getConfig();

    return res.json({
      success: true,
      environment: config.environment,
      configured: !!(
        config.mac &&
        config.custNbr &&
        config.merchNbr &&
        config.dbaNbr &&
        config.terminalNbr
      ),
      endpoints: {
        tac: config.tacEndpoint,
        browserPost:
          config.environment === "sandbox"
            ? "https://services.epxuap.com/browserpost/"
            : "https://services.epx.com/browserpost/",
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: "EPX service not configured",
      message: error.message,
    });
  }
});

export default router;
