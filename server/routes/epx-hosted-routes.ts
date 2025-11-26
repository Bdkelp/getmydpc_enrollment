/**
 * EPX Hosted Checkout Routes
 * Simpler implementation using EPX's hosted payment page
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import { EPXHostedCheckoutService } from '../services/epx-hosted-checkout-service';
import { storage } from '../storage';
import { authenticateToken, type AuthRequest } from '../auth/supabaseAuth';
import { supabase } from '../lib/supabaseClient';
import { verifyRecaptcha, isRecaptchaEnabled } from '../utils/recaptcha';
import { logEPX, getRecentEPXLogs } from '../services/epx-payment-logger';

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
    
    logEPX({ level: 'info', phase: 'general', message: 'Hosted service initialized', data: { env: config.environment, hasPublicKey: !!config.publicKey } });
  } catch (error: any) {
    initError = error.message || 'Unknown initialization error';
    logEPX({ level: 'error', phase: 'general', message: 'Initialization failed', data: { error: error?.message } });
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
    res.json({ success: true, config });
  } catch (error: any) {
    logEPX({ level: 'error', phase: 'general', message: 'Config error', data: { error: error?.message } });
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
  
  const requestStartTime = Date.now();
  
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
      billingAddress,
      captchaToken
    } = req.body;

    logEPX({ level: 'info', phase: 'create-payment', message: 'Create payment request received', data: { amount, customerId, customerEmail, planId } });

    // Server-side reCAPTCHA verification (production only or when enabled)
    if (isRecaptchaEnabled()) {
      const verifyResult = await verifyRecaptcha(captchaToken || '', 'hosted_checkout');
      logEPX({ level: verifyResult.success ? 'info' : 'warn', phase: 'recaptcha', message: 'Token verification', data: verifyResult });
      if (!verifyResult.success) {
        return res.status(400).json({ success: false, error: 'Captcha verification failed', code: 'RECAPTCHA_FAILED' });
      }
    }

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
      logEPX({ level: 'error', phase: 'create-payment', message: 'Session creation failed', data: { error: sessionResponse.error } });
      return res.status(400).json(sessionResponse);
    }

    // Store payment record in pending state
    try {
      const paymentData = {
        memberId: customerId, // Member ID for billing/plan management
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
      logEPX({ level: 'info', phase: 'create-payment', message: 'Payment record created', data: { transactionId: orderNumber } });
    } catch (storageError: any) {
      logEPX({ level: 'warn', phase: 'create-payment', message: 'Storage createPayment failed (non-fatal)', data: { error: storageError?.message } });
      // Continue even if storage fails - payment can still process
    }

    // Get checkout configuration
    const config = hostedCheckoutService.getCheckoutConfig();

    // Return data needed for frontend
    const responsePayload = {
      success: true,
      transactionId: orderNumber,
      sessionId: sessionResponse.sessionId,
      publicKey: sessionResponse.publicKey,
      scriptUrl: config.scriptUrl,
      environment: config.environment,
      captcha: config.captcha,
      paymentMethod: 'hosted-checkout',
      formData: {
        amount: amount.toFixed(2),
        orderNumber,
        invoiceNumber: orderNumber,
        email: customerEmail,
        billingName: customerName || 'Customer',
        ...billingAddress
      }
    };
    
    // Log the payload we send to frontend (which frontend will use to call EPX)
    console.log(
      '[EPX Hosted Checkout - REQUEST TO FRONTEND]',
      JSON.stringify({
        transactionId: orderNumber,
        amount: amount.toFixed(2),
        email: customerEmail,
        billingName: customerName || 'Customer',
        publicKey: sessionResponse.publicKey,
        environment: config.environment
      }, null, 2)
    );
    
    logEPX({ level: 'info', phase: 'create-payment', message: 'Create payment response ready', data: { transactionId: orderNumber } });
    res.json(responsePayload);
  } catch (error: any) {
    logEPX({ level: 'error', phase: 'create-payment', message: 'Unhandled exception during create-payment', data: { error: error?.message } });
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
  const callbackStartTime = Date.now();
  
  try {
    if (!hostedCheckoutService) {
      return res.status(503).json({
        success: false,
        error: 'Service not initialized'
      });
    }

    // Log the full callback request from EPX (headers + body)
    console.log(
      '[EPX Server Post - REQUEST]',
      JSON.stringify(
        {
          headers: req.headers,
          body: req.body,
        },
        null,
        2
      )
    );

    logEPX({ level: 'info', phase: 'callback', message: 'Callback received', data: { body: req.body } });

    // Process the callback
    const result = hostedCheckoutService.processCallback(req.body);

    // === PAYMENT-FIRST FLOW ===
    // Payment approved - create member record now
    if (result.isApproved && req.body.registrationData && result.bricToken) {
      try {
        logEPX({ level: 'info', phase: 'callback', message: 'Payment approved - creating member', data: { hasBRIC: !!result.bricToken } });
        
        // Parse registration data from EPX callback
        const registrationData = typeof req.body.registrationData === 'string' 
          ? JSON.parse(req.body.registrationData) 
          : req.body.registrationData;
        
        // Call finalize-registration endpoint
        const finalizeResponse = await fetch(`${process.env.API_BASE_URL || 'http://localhost:5000'}/api/finalize-registration`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            registrationData,
            paymentToken: result.bricToken,
            paymentMethodType: req.body.paymentMethodType || 'CreditCard',
            transactionId: result.transactionId,
            tempRegistrationId: req.body.tempRegistrationId
          })
        });

        if (!finalizeResponse.ok) {
          const errorData = await finalizeResponse.json();
          logEPX({ level: 'error', phase: 'callback', message: 'Finalize registration failed', data: errorData });
          
          // Return error to EPX
          return res.status(500).json({
            success: false,
            error: errorData.message || 'Failed to create member record'
          });
        }

        const finalizeData = await finalizeResponse.json();
        logEPX({ level: 'info', phase: 'callback', message: 'Member created successfully', data: { memberId: finalizeData.member?.id } });

        // Return success to EPX
        return res.json({
          success: true,
          transactionId: result.transactionId,
          authCode: result.authCode,
          amount: result.amount,
          memberId: finalizeData.member?.id,
          customerNumber: finalizeData.member?.customerNumber
        });
        
      } catch (finalizeError: any) {
        logEPX({ level: 'error', phase: 'callback', message: 'Member creation failed', data: { error: finalizeError.message } });
        
        return res.status(500).json({
          success: false,
          error: 'Failed to complete registration after payment'
        });
      }
    }

    // === PAYMENT DECLINED ===
    if (!result.isApproved) {
      logEPX({ level: 'warn', phase: 'callback', message: 'Payment declined', data: { error: result.error } });
      
      // Track payment attempt if we have temp registration ID
      if (req.body.tempRegistrationId) {
        try {
          const { incrementPaymentAttempt } = await import('../services/temp-registration-service');
          const attempts = await incrementPaymentAttempt(req.body.tempRegistrationId, result.error);
          logEPX({ level: 'info', phase: 'callback', message: 'Payment attempt tracked', data: { attempts } });
        } catch (attemptError: any) {
          logEPX({ level: 'error', phase: 'callback', message: 'Failed to track attempt', data: { error: attemptError.message } });
        }
      }
      
      return res.json({
        success: false,
        error: result.error,
        transactionId: result.transactionId
      });
    }

    // Missing registration data - cannot process
    logEPX({ level: 'error', phase: 'callback', message: 'Missing registration data or BRIC token' });
    return res.status(400).json({
      success: false,
      error: 'Invalid callback - missing registration data'
    });
  } catch (error: any) {
    logEPX({ level: 'error', phase: 'callback', message: 'Unhandled callback exception', data: { error: error?.message } });
    
    const errorResponse = {
      success: false,
      error: error.message || 'Failed to process callback'
    };
    
    // Log error response
    console.log(
      '[EPX Server Post - RESPONSE (ERROR)]',
      JSON.stringify(errorResponse, null, 2)
    );
    
    res.status(500).json(errorResponse);
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
      logEPX({ level: 'warn', phase: 'status', message: 'Status check - payment not found', data: { transactionId } });
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
    logEPX({ level: 'error', phase: 'status', message: 'Status check error', data: { error: error?.message } });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get payment status'
    });
  }
});

// Recent logs endpoint for certification samples
router.get('/api/epx/logs/recent', (req: Request, res: Response) => {
  const limit = parseInt((req.query.limit as string) || '50', 10);
  const logs = getRecentEPXLogs(isNaN(limit) ? 50 : limit);
  res.json({ success: true, logs });
});

/**
 * EPX CERTIFICATION TEST ENDPOINT - Server Post API
 * Creates a test subscription using EPX Recurring Billing API
 * Use this to generate certification samples for EPX
 */
router.post('/api/epx/test-recurring', async (req: Request, res: Response) => {
  try {
    logEPX({ level: 'info', phase: 'certification', message: 'Starting Server Post API certification test' });

    // Check if EPX Recurring service is available
    const recurringService = await import('../services/epx-recurring-billing');
    if (!recurringService) {
      throw new Error('EPX Recurring Billing service not available');
    }

    // Use test data for certification
    const testData = {
      customerId: `CERT-TEST-${Date.now()}`,
      planCode: 'MPP-BASE',
      planName: 'MyPremierPlan Base',
      amount: 59.00,
      firstName: 'Test',
      lastName: 'Certification',
      email: 'cert@test.com',
      phone: '1234567890',
      // EPX Test Card for sandbox
      cardNumber: '4111111111111111',
      expiryDate: '1225', // MMYY format
      cvv: '999'
    };

    logEPX({
      level: 'info',
      phase: 'certification',
      message: 'EPX Server Post - CreateSubscription Request',
      data: {
        customerId: testData.customerId,
        planCode: testData.planCode,
        amount: testData.amount,
        cardLast4: testData.cardNumber.slice(-4)
      }
    });

    // Note: This will fail if EPX_MAC or other credentials aren't set
    // That's okay - we just need the request/response samples logged
    const result = await recurringService.createTestSubscription(testData);

    logEPX({
      level: 'info',
      phase: 'certification',
      message: 'EPX Server Post - CreateSubscription Response',
      data: result
    });

    res.json({
      success: true,
      message: 'Certification test completed - check logs for request/response samples',
      result
    });

  } catch (error: any) {
    logEPX({
      level: 'error',
      phase: 'certification',
      message: 'Certification test failed',
      data: { error: error.message, stack: error.stack }
    });

    res.status(500).json({
      success: false,
      error: error.message || 'Certification test failed',
      message: 'Check server logs for details'
    });
  }
});

export default router;

