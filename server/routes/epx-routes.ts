/**
 * EPX Payment Routes
 * Handles EPX Hosted Checkout and Browser Post API
 */

import { Router, Request, Response } from 'express';
import { getEPXService, initializeEPXService } from '../services/epx-payment-service';
import { storage } from '../storage';
import { nanoid } from 'nanoid';
import { sendEnrollmentNotification } from '../utils/notifications';
import { transactionLogger } from '../services/transaction-logger';

const router = Router();

// Initialize EPX Service on startup
try {
  // Get the base URL from environment
  const baseUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
      : 'http://localhost:5000';

  initializeEPXService({
    checkoutId: process.env.EPX_CHECKOUT_ID,
    mac: process.env.EPX_MAC || '2ifP9bBSu9TrjMt8EPh1rGfJiZsfCb8Y',
    epiId: process.env.EPX_EPI_ID,
    epiKey: process.env.EPX_EPI_KEY,
    custNbr: process.env.EPX_CUST_NBR || '9001',
    merchNbr: process.env.EPX_MERCH_NBR || '900300',
    dbaNbr: process.env.EPX_DBA_NBR || '2',
    terminalNbr: process.env.EPX_TERMINAL_NBR || '72',
    environment: process.env.EPX_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
    redirectUrl: process.env.EPX_REDIRECT_URL || `${baseUrl}/payment/success`,
    responseUrl: process.env.EPX_RESPONSE_URL || `${baseUrl}/api/epx/webhook`,
    cancelUrl: process.env.EPX_CANCEL_URL || `${baseUrl}/payment/cancel`,
    webhookSecret: process.env.EPX_WEBHOOK_SECRET
  });
  const epxService = getEPXService();
  console.log('[EPX Routes] EPX Service initialized successfully');
  console.log('[EPX Routes] Environment:', process.env.EPX_ENVIRONMENT || 'sandbox');
  console.log('[EPX Routes] Base URL:', baseUrl);
} catch (error) {
  console.error('[EPX Routes] Failed to initialize EPX Service:', error);
}

/**
 * Get EPX Hosted Checkout configuration for frontend
 */
router.get('/api/epx/checkout-config', async (req: Request, res: Response) => {
  try {
    const epxService = getEPXService();
    const config = epxService.getHostedCheckoutConfig();

    res.json({
      success: true,
      config
    });
  } catch (error: any) {
    console.error('[EPX] Checkout config error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get checkout configuration'
    });
  }
});

/**
 * Create payment session for Browser Post API
 */
router.post('/api/epx/create-payment', async (req: Request, res: Response) => {
  try {
    const epxService = getEPXService();
    const {
      amount,
      customerId,
      customerEmail,
      planId,
      subscriptionId,
      description,
      paymentMethod,
      achRoutingNumber,
      achAccountNumber,
      achAccountType,
      achAccountName
    } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid amount'
      });
    }

    // Generate unique transaction number
    const tranNbr = `TXN_${Date.now()}_${nanoid(6)}`;

    console.log('[EPX] Generating TAC with payload:', {
      amount,
      tranNbr,
      customerEmail,
      paymentMethod: paymentMethod || 'card',
      environment: process.env.EPX_ENVIRONMENT || 'sandbox'
    });

    // Generate TAC for Browser Post
    const tacResponse = await epxService.generateTAC({
      amount,
      tranNbr,
      customerEmail,
      orderDescription: description || 'DPC Subscription Payment',
      paymentMethod: paymentMethod || 'card',
      achRoutingNumber,
      achAccountNumber,
      achAccountType,
      achAccountName
    });

    console.log('[EPX] TAC Response:', {
      success: tacResponse.success,
      hasTAC: !!tacResponse.tac,
      error: tacResponse.error
    });

    if (!tacResponse.success || !tacResponse.tac) {
      console.error('[EPX] TAC generation failed:', tacResponse);
      return res.status(500).json({
        success: false,
        error: tacResponse.error || 'Failed to generate payment session'
      });
    }

    // Store transaction details for webhook processing with comprehensive logging
    const paymentRecord = await storage.createPayment({
      userId: customerId,
      subscriptionId: subscriptionId || null,
      amount: amount.toString(),
      currency: 'USD',
      status: 'pending',
      paymentMethod: paymentMethod || 'card',
      transactionId: tranNbr,
      metadata: {
        planId,
        tac: tacResponse.tac,
        paymentType: paymentMethod || 'card',
        environment: process.env.EPX_ENVIRONMENT || 'sandbox',
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        timestamp: new Date().toISOString(),
        ...(paymentMethod === 'ach' && {
          achLastFour: achAccountNumber?.slice(-4),
          achAccountType
        })
      }
    });

    // Log transaction creation for audit trail
    transactionLogger.logPaymentCreated({
      transactionId: tranNbr,
      paymentId: paymentRecord?.id || 'unknown',
      amount,
      customerId,
      paymentMethod: paymentMethod || 'card',
      environment: process.env.EPX_ENVIRONMENT || 'sandbox',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      metadata: {
        planId,
        subscriptionId,
        description
      }
    });

    // Get payment form data
    const formData = epxService.getPaymentFormData(tacResponse.tac, amount, tranNbr, paymentMethod || 'card');

    res.json({
      success: true,
      transactionId: tranNbr,
      formData
    });
  } catch (error: any) {
    console.error('[EPX] Create payment error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create payment session'
    });
  }
});

/**
 * Handle EPX webhook/response URL
 * This receives payment results from EPX Browser Post API
 */
router.post('/api/epx/webhook', async (req: Request, res: Response) => {
  try {
    console.log('[EPX Webhook] Received payment result');
    const epxService = getEPXService();

    // Validate webhook signature if configured
    const signature = req.headers['x-epx-signature'] as string;
    const isValid = epxService.validateWebhookSignature(req.body, signature);

    if (!isValid) {
      console.error('[EPX Webhook] Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Process the webhook payload
    const result = epxService.processWebhook(req.body);

    if (result.transactionId) {
      // Update payment status in database
      const payment = await storage.getPaymentByTransactionId(result.transactionId);

      if (payment) {
        // Update payment with comprehensive logging
        await storage.updatePayment(payment.id, {
          status: result.isApproved ? 'completed' : 'failed',
          authorizationCode: result.authCode,
          metadata: {
            ...payment.metadata,
            bricToken: result.bricToken,  // Store for refunds
            authAmount: result.amount,
            error: result.error,
            webhookProcessedAt: new Date().toISOString(),
            epxResponse: req.body // Store full EPX response for audit
          }
        });

        // Comprehensive transaction logging
        console.log(`[EPX Transaction Log] Payment ${result.isApproved ? 'APPROVED' : 'DECLINED'}:`, {
          transactionId: result.transactionId,
          paymentId: payment.id,
          status: result.isApproved ? 'completed' : 'failed',
          amount: result.amount,
          authCode: result.authCode,
          bricToken: result.bricToken,
          environment: process.env.EPX_ENVIRONMENT || 'sandbox',
          subscriptionId: payment.subscriptionId,
          customerId: payment.userId,
          paymentMethod: payment.paymentMethod,
          processingTime: new Date().getTime() - new Date(payment.metadata?.timestamp || new Date()).getTime(),
          error: result.error,
          timestamp: new Date().toISOString()
        });

        // If approved, update subscription status
        if (result.isApproved && payment.subscriptionId) {
          await storage.updateSubscription(payment.subscriptionId, {
            status: 'active',
            lastPaymentDate: new Date()
          });

          console.log(`[EPX Transaction Log] Subscription activated:`, {
            subscriptionId: payment.subscriptionId,
            transactionId: result.transactionId,
            environment: process.env.EPX_ENVIRONMENT || 'sandbox'
          });
        }

        // Send comprehensive enrollment notification (member, agent, admins)
        await sendEnrollmentNotification({
          memberEmail: payment.userId, // Assuming userId is the member's email for notification
          agentEmail: 'agent@example.com', // Replace with actual agent email
          adminEmail: 'info@mypremierplans.com', // Admin email
          transactionDetails: {
            transactionId: result.transactionId,
            status: result.isApproved ? 'completed' : 'failed',
            amount: result.amount,
            date: new Date()
          }
        });
      } else {
        console.error('[EPX Transaction Log] PAYMENT NOT FOUND:', {
          transactionId: result.transactionId,
          environment: process.env.EPX_ENVIRONMENT || 'sandbox',
          webhookData: req.body,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Acknowledge receipt
    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('[EPX Webhook] Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Handle payment redirect (user returns from EPX)
 */
router.get('/api/epx/redirect', async (req: Request, res: Response) => {
  try {
    console.log('[EPX Redirect] User returned from payment');

    // Parse response parameters
    const { AUTH_RESP, AUTH_CODE, TRAN_NBR, AUTH_AMOUNT } = req.query;

    const isApproved = AUTH_RESP === 'APPROVAL';

    // Redirect to appropriate frontend page
    if (isApproved) {
      res.redirect(`/confirmation?transaction=${TRAN_NBR}&amount=${AUTH_AMOUNT}`);
    } else {
      res.redirect(`/payment/failed?transaction=${TRAN_NBR}&reason=${AUTH_RESP}`);
    }
  } catch (error: any) {
    console.error('[EPX Redirect] Error handling redirect:', error);
    res.redirect('/payment/error');
  }
});

/**
 * Refund transaction
 */
router.post('/api/epx/refund', async (req: Request, res: Response) => {
  try {
    const epxService = getEPXService();
    const { transactionId, amount } = req.body;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        error: 'Transaction ID required'
      });
    }

    // Get original payment to retrieve BRIC token
    const payment = await storage.getPaymentByTransactionId(transactionId);

    if (!payment || !payment.metadata?.bricToken) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found or refund not available'
      });
    }

    // Process refund
    const refundAmount = amount || parseFloat(payment.amount);
    const result = await epxService.refundTransaction(payment.metadata.bricToken, refundAmount);

    if (result.success) {
      // Update payment status
      await storage.updatePayment(payment.id, {
        status: 'refunded',
        metadata: {
          ...payment.metadata,
          refundId: result.refundId,
          refundAmount,
          refundDate: new Date().toISOString()
        }
      });

      // Log refund transaction
      console.log(`[EPX Transaction Log] REFUND PROCESSED:`, {
        originalTransactionId: transactionId,
        refundId: result.refundId,
        refundAmount,
        originalAmount: payment.amount,
        bricToken: payment.metadata?.bricToken,
        environment: process.env.EPX_ENVIRONMENT || 'sandbox',
        customerId: payment.userId,
        timestamp: new Date().toISOString()
      });
    } else {
      console.error(`[EPX Transaction Log] REFUND FAILED:`, {
        originalTransactionId: transactionId,
        refundAmount,
        error: result.error,
        bricToken: payment.metadata?.bricToken,
        environment: process.env.EPX_ENVIRONMENT || 'sandbox',
        timestamp: new Date().toISOString()
      });
    }

    res.json(result);
  } catch (error: any) {
    console.error('[EPX] Refund error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Refund failed'
    });
  }
});

/**
 * Void transaction
 */
router.post('/api/epx/void', async (req: Request, res: Response) => {
  try {
    const epxService = getEPXService();
    const { transactionId } = req.body;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        error: 'Transaction ID required'
      });
    }

    // Get original payment to retrieve BRIC token
    const payment = await storage.getPaymentByTransactionId(transactionId);

    if (!payment || !payment.metadata?.bricToken) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found or void not available'
      });
    }

    // Process void
    const result = await epxService.voidTransaction(payment.metadata.bricToken);

    if (result.success) {
      // Update payment status
      await storage.updatePayment(payment.id, {
        status: 'voided',
        metadata: {
          ...payment.metadata,
          voidDate: new Date().toISOString()
        }
      });

      // Log void transaction
      console.log(`[EPX Transaction Log] VOID PROCESSED:`, {
        transactionId: transactionId,
        originalAmount: payment.amount,
        bricToken: payment.metadata?.bricToken,
        environment: process.env.EPX_ENVIRONMENT || 'sandbox',
        customerId: payment.userId,
        timestamp: new Date().toISOString()
      });
    } else {
      console.error(`[EPX Transaction Log] VOID FAILED:`, {
        transactionId: transactionId,
        error: result.error,
        bricToken: payment.metadata?.bricToken,
        environment: process.env.EPX_ENVIRONMENT || 'sandbox',
        timestamp: new Date().toISOString()
      });
    }

    res.json(result);
  } catch (error: any) {
    console.error('[EPX] Void error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Void failed'
    });
  }
});

export default router;