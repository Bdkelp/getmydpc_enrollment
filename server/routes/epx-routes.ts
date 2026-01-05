/**
 * EPX Payment Routes (Server Post)
 * Express routes for EPX Server Post payment integration
 */

import { Router, Request, Response } from "express";
import { getEPXService } from "../services/epx-payment-service";
import { certificationLogger } from "../services/certification-logger";
import { paymentEnvironment } from "../services/payment-environment-service";

const router = Router();

/**
 * Create Payment Endpoint (Server Post)
 * Generates TAC and returns Browser Post form data for EPX payment
 */
router.post("/api/epx/create-payment", async (req: Request, res: Response) => {
  const requestStartTime = Date.now();
  try {
    const { amount, tranNbr, customerData, metadata, aciExt } = req.body;

    // Validate required fields
    if (!amount || !tranNbr) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: amount and tranNbr are required",
      });
    }

    // Get EPX service instance
    const epxService = await getEPXService();
    const environment = await paymentEnvironment.getEnvironment();

    // Generate TAC
    const tacResponse = await epxService.generateTAC({
      amount,
      tranNbr,
      tranGroup: metadata?.tranGroup,
      customerEmail: customerData?.email,
      invoiceNumber: metadata?.invoiceNumber,
      orderDescription: metadata?.orderDescription,
      aciExt: aciExt || metadata?.aciExt
    });

    if (!tacResponse.success || !tacResponse.tac) {
      return res.status(500).json({
        success: false,
        error: "Failed to generate TAC",
        details: tacResponse.error,
      });
    }

    // Get Browser Post form data (includes ACI_EXT for MIT)
    const formData = epxService.getPaymentFormData(
      tacResponse.tac,
      amount,
      tranNbr,
      customerData?.email,
      metadata?.invoiceNumber,
      metadata?.orderDescription,
      aciExt || metadata?.aciExt
    );

    // Log for certification if enabled
    if (process.env.ENABLE_CERTIFICATION_LOGGING === 'true') {
      const processingTime = Date.now() - requestStartTime;
      try {
        certificationLogger.logCertificationEntry({
          transactionId: tranNbr,
          customerId: customerData?.id || 'unknown',
          request: {
            timestamp: new Date().toISOString(),
            method: 'POST',
            endpoint: '/api/epx/create-payment',
            url: `${req.protocol}://${req.get('host')}/api/epx/create-payment`,
            headers: {
              'content-type': req.get('content-type') || 'application/json',
              'user-agent': req.get('user-agent') || 'unknown'
            },
            body: req.body,
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
          },
          response: {
            statusCode: 200,
            headers: {
              'content-type': 'application/json'
            },
            body: {
              success: true,
              formData,
              environment,
              paymentMethod: 'server-post'
            },
            processingTimeMs: processingTime
          },
          amount,
          environment,
          purpose: 'server-post-payment-creation',
          sensitiveFieldsMasked: ['customerId', 'customerEmail', 'aciExt'],
          timestamp: new Date().toISOString()
        });
      } catch (certError: any) {
        console.warn('[EPX Server Post] Certification logging failed:', certError.message);
      }
    }

    // Return form data for frontend
    res.json({
      success: true,
      formData,
      paymentMethod: 'server-post',
      environment
    });
  } catch (error: any) {
    console.error('[EPX Server Post] Create payment error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create payment session'
    });
  }
});

export default router;
