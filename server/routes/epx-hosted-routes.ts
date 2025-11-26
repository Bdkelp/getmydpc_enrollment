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

          // CRITICAL: Create enrollment record if payment approved but no enrollment exists
          if (result.isApproved && payment.userId && !payment.metadata?.enrollmentCreated) {
            try {
              logEPX({ level: 'info', phase: 'callback', message: 'Checking enrollment existence', data: { userId: payment.userId } });
              
              // Check if user already exists in members table
              const existingMember = await storage.getUser(payment.userId);
              
              if (!existingMember || !existingMember.email) {
                logEPX({ level: 'warn', phase: 'callback', message: 'Member record missing post-payment', data: { userId: payment.userId, transactionId: result.transactionId } });
                // TODO: Send admin notification about incomplete enrollment
              } else {
                logEPX({ level: 'info', phase: 'callback', message: 'Member record found', data: { email: existingMember.email } });
                
                // Check if commission was created for this enrollment
                const { data: existingCommissions } = await supabase
                  .from('agent_commissions')
                  .select('id')
                  .eq('member_id', payment.userId.toString())
                  .eq('enrollment_id', payment.subscriptionId?.toString() || '');
                
                if (!existingCommissions || existingCommissions.length === 0) {
                  logEPX({ level: 'warn', phase: 'callback', message: 'Commission missing for enrollment', data: { memberId: payment.userId } });
                  // Commission should have been created during registration
                  // If missing, it means the registration flow was incomplete
                } else {
                    logEPX({ level: 'info', phase: 'callback', message: 'Commission exists for enrollment', data: { memberId: payment.userId } });
                }
              }
              
              // Mark enrollment as created to avoid duplicate checks
              await storage.updatePayment(payment.id, {
                metadata: {
                  ...payment.metadata,
                  enrollmentCreated: true,
                  enrollmentCheckedAt: new Date().toISOString()
                }
              });
            } catch (enrollError: any) {
              logEPX({ level: 'error', phase: 'callback', message: 'Error checking enrollment', data: { error: enrollError?.message } });
              // Don't fail the payment if enrollment check fails
            }
          }

          // Mark commission payment as captured (14-day grace period before payout)
          if (result.isApproved && payment.metadata?.memberId) {
            try {
              logEPX({ level: 'info', phase: 'callback', message: 'Mark commission captured', data: { memberId: payment.metadata.memberId } });
              await storage.markCommissionPaymentCaptured(
                payment.metadata.memberId.toString(),
                result.transactionId,
                result.transactionId
              );
              logEPX({ level: 'info', phase: 'callback', message: 'Commission captured - 14d grace', data: { transactionId: result.transactionId } });
            } catch (commError: any) {
              logEPX({ level: 'error', phase: 'callback', message: 'Commission capture failed', data: { error: commError?.message } });
              // Don't fail the payment if commission update fails
            }
          }
        }
      } catch (storageError: any) {
        logEPX({ level: 'error', phase: 'callback', message: 'Storage update error', data: { error: storageError?.message } });
      }
    }

    const callbackResponse = {
      success: result.isApproved,
      transactionId: result.transactionId,
      authCode: result.authCode,
      amount: result.amount,
      error: result.error
    };
    
    // Log our response back to EPX
    console.log(
      '[EPX Server Post - RESPONSE]',
      JSON.stringify(callbackResponse, null, 2)
    );
    
    res.json(callbackResponse);
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

export default router;
