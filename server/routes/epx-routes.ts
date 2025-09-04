/**
 * EPX Payment Routes
 * Handles EPX Hosted Checkout and Browser Post API
 */

import { Router, Request, Response } from 'express';
import { getEPXService, initializeEPXService } from '../services/epx-payment-service';
import { storage } from '../storage';
import { nanoid } from 'nanoid';
import { sendEnrollmentNotification } from '../utils/notifications';

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
  console.log('[EPX Routes] EPX Service initialized with credentials:', {
    custNbr: process.env.EPX_CUST_NBR,
    merchNbr: process.env.EPX_MERCH_NBR,
    dbaNbr: process.env.EPX_DBA_NBR,
    terminalNbr: process.env.EPX_TERMINAL_NBR,
    environment: process.env.EPX_ENVIRONMENT || 'sandbox'
  });
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

    if (!tacResponse.success || !tacResponse.tac) {
      return res.status(500).json({
        success: false,
        error: tacResponse.error || 'Failed to generate payment session'
      });
    }

    // Store transaction details for webhook processing
    await storage.createPayment({
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
        ...(paymentMethod === 'ach' && {
          achLastFour: achAccountNumber?.slice(-4),
          achAccountType
        })
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
        await storage.updatePayment(payment.id, {
          status: result.isApproved ? 'completed' : 'failed',
          authorizationCode: result.authCode,
          metadata: {
            ...payment.metadata,
            bricToken: result.bricToken,  // Store for refunds
            authAmount: result.amount,
            error: result.error
          }
        });

        // If approved, update subscription status
        if (result.isApproved && payment.subscriptionId) {
          await storage.updateSubscription(payment.subscriptionId, {
            status: 'active',
            lastPaymentDate: new Date()
          });
        }

        console.log(`[EPX Webhook] Payment ${result.transactionId} ${result.isApproved ? 'approved' : 'declined'}`);
        
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
        console.warn('[EPX Webhook] Payment not found for transaction:', result.transactionId);
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
          refundDate: new Date()
        }
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
          voidDate: new Date()
        }
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