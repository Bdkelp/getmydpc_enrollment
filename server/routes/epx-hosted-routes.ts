/**
 * EPX Hosted Checkout Routes
 * Simpler implementation using EPX's hosted payment page
 */

import { Router, Request, Response } from 'express';
import { EPXHostedCheckoutService } from '../services/epx-hosted-checkout-service';
import { storage } from '../storage';

const router = Router();

// Initialize Hosted Checkout Service
let hostedCheckoutService: EPXHostedCheckoutService | null = null;
let serviceInitialized = false;
let initError: string | null = null;

// Lazy initialization function
const initializeService = () => {
  if (serviceInitialized || hostedCheckoutService) return;
  
  try {
    const config = {
      publicKey: process.env.EPX_PUBLIC_KEY || 'eyAidGVybWluYWxQcm9maWxlSWQiOiAiYjE1NjFjODAtZTgxZC00NTNmLTlkMDUtYTI2NGRjOTZiODhkIiB9',
      terminalProfileId: process.env.EPX_TERMINAL_PROFILE_ID || 'b1561c80-e81d-453f-9d05-a264dc96b88d',
      environment: (process.env.EPX_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production',
      successCallback: 'epxSuccessCallback',
      failureCallback: 'epxFailureCallback'
    };

    hostedCheckoutService = new EPXHostedCheckoutService(config);
    serviceInitialized = true;
    
    console.log('[EPX Hosted Routes] ✅ Service initialized successfully');
    console.log('[EPX Hosted Routes] Environment:', config.environment);
    console.log('[EPX Hosted Routes] Has PublicKey:', !!config.publicKey);
  } catch (error: any) {
    initError = error.message || 'Unknown initialization error';
    console.error('[EPX Hosted Routes] ❌ Failed to initialize:', error);
  }
};

/**
 * Health check for Hosted Checkout service
 */
router.get('/api/epx/hosted/health', (req: Request, res: Response) => {
  initializeService(); // Ensure service is initialized
  
  if (serviceInitialized) {
    res.json({
      status: 'healthy',
      service: 'EPX Hosted Checkout',
      environment: process.env.EPX_ENVIRONMENT || 'sandbox',
      paymentMethod: 'hosted-checkout',
      initialized: true
    });
  } else {
    res.status(503).json({
      status: 'unhealthy',
      service: 'EPX Hosted Checkout',
      initialized: false,
      error: initError
    });
  }
});

/**
 * Get configuration for frontend
 */
router.get('/api/epx/hosted/config', (req: Request, res: Response) => {
  initializeService(); // Ensure service is initialized
  
  try {
    if (!serviceInitialized || !hostedCheckoutService) {
      return res.status(503).json({
        success: false,
        error: 'Hosted Checkout service not initialized'
      });
    }

    const config = hostedCheckoutService.getCheckoutConfig();
    res.json({
      success: true,
      config
    });
  } catch (error: any) {
    console.error('[EPX Hosted] Config error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get configuration'
    });
  }
});

/**
 * Create payment session for Hosted Checkout
 */
router.post('/api/epx/hosted/create-payment', async (req: Request, res: Response) => {
  initializeService(); // Ensure service is initialized
  
  try {
    if (!serviceInitialized || !hostedCheckoutService) {
      return res.status(503).json({
        success: false,
        error: 'Hosted Checkout service not initialized'
      });
    }

    const {
      amount,
      customerId,
      customerEmail,
      customerName,
      planId,
      subscriptionId,
      description,
      billingAddress
    } = req.body;

    console.log('[EPX Hosted] Creating payment session:', {
      amount,
      customerId,
      customerEmail,
      planId
    });

    // Generate order number (transaction ID)
    const orderNumber = Date.now().toString().slice(-10);

    // Create checkout session
    const sessionResponse = hostedCheckoutService.createCheckoutSession(
      amount,
      orderNumber,
      customerEmail,
      customerName || 'Customer',
      billingAddress
    );

    if (!sessionResponse.success) {
      return res.status(400).json(sessionResponse);
    }

    // Store payment record in pending state
    try {
      const paymentData = {
        userId: customerId,
        subscriptionId: subscriptionId || null,
        amount: amount.toString(),
        currency: 'USD',
        status: 'pending' as const,
        paymentMethod: 'card' as const,
        transactionId: orderNumber,
        metadata: {
          planId,
          paymentType: 'hosted-checkout',
          environment: process.env.EPX_ENVIRONMENT || 'sandbox',
          customerEmail,
          description
        }
      };

      await storage.createPayment(paymentData);
      console.log('[EPX Hosted] Payment record created:', orderNumber);
    } catch (storageError: any) {
      console.error('[EPX Hosted] Storage error (non-fatal):', storageError.message);
      // Continue even if storage fails - payment can still process
    }

    // Get checkout configuration
    const config = hostedCheckoutService.getCheckoutConfig();

    // Return data needed for frontend
    res.json({
      success: true,
      transactionId: orderNumber,
      sessionId: sessionResponse.sessionId,
      publicKey: sessionResponse.publicKey,
      scriptUrl: config.scriptUrl,
      environment: config.environment,
      captcha: config.captcha,
      paymentMethod: 'hosted-checkout',
      // Form data for frontend
      formData: {
        amount: amount.toFixed(2),
        orderNumber,
        invoiceNumber: orderNumber,
        email: customerEmail,
        billingName: customerName || 'Customer',
        ...billingAddress
      }
    });
  } catch (error: any) {
    console.error('[EPX Hosted] Create payment error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create payment session'
    });
  }
});

/**
 * Handle success callback from EPX
 */
router.post('/api/epx/hosted/callback', async (req: Request, res: Response) => {
  try {
    if (!hostedCheckoutService) {
      return res.status(503).json({
        success: false,
        error: 'Service not initialized'
      });
    }

    console.log('[EPX Hosted] Callback received:', req.body);

    // Process the callback
    const result = hostedCheckoutService.processCallback(req.body);

    // Update payment record
    if (result.transactionId) {
      try {
        const payment = await storage.getPaymentByTransactionId(result.transactionId);
        if (payment) {
          await storage.updatePayment(payment.id, {
            status: result.isApproved ? 'completed' : 'failed',
            authorizationCode: result.authCode,
            metadata: {
              ...payment.metadata,
              callbackData: req.body,
              processedAt: new Date().toISOString()
            }
          });

          // Update subscription if approved
          if (result.isApproved && payment.subscriptionId) {
            await storage.updateSubscription(payment.subscriptionId, {
              status: 'active',
              lastPaymentDate: new Date()
            });
          }
        }
      } catch (storageError: any) {
        console.error('[EPX Hosted] Storage update error:', storageError);
      }
    }

    res.json({
      success: result.isApproved,
      transactionId: result.transactionId,
      authCode: result.authCode,
      amount: result.amount,
      error: result.error
    });
  } catch (error: any) {
    console.error('[EPX Hosted] Callback error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process callback'
    });
  }
});

/**
 * Get payment status
 */
router.get('/api/epx/hosted/status/:transactionId', async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.params;
    
    const payment = await storage.getPaymentByTransactionId(transactionId);
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    res.json({
      success: true,
      status: payment.status,
      amount: payment.amount,
      transactionId: payment.transactionId,
      authorizationCode: payment.authorizationCode
    });
  } catch (error: any) {
    console.error('[EPX Hosted] Status check error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get payment status'
    });
  }
});

export default router;