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
      console.log('[EPX Hosted] Payment record created:', orderNumber);
    } catch (storageError: any) {
      console.error('[EPX Hosted] Storage error (non-fatal):', storageError.message);
      // Continue even if storage fails - payment can still process
    }

    // Get checkout configuration
    const config = hostedCheckoutService.getCheckoutConfig();

    // Redirect user to EPX hosted checkout
    res.json({
          transactionId: orderNumber,
          customerId,
          request: {
            timestamp: new Date().toISOString(),
            method: 'POST',
            endpoint: '/api/epx/hosted/create-payment',
            url: `${req.protocol}://${req.get('host')}/api/epx/hosted/create-payment`,
            headers: {
              'content-type': req.get('content-type') || 'application/json',
              'user-agent': req.get('user-agent') || 'unknown'
            },
            body: {
              amount,
              customerId: '***CUSTOMER_ID***',
              customerEmail: customerEmail?.substring(0, 2) + '***@***' || '***EMAIL***',
              customerName: customerName || 'Customer',
              planId,
              description
            },
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
              transactionId: orderNumber,
              amount,
              environment: config.environment,
              paymentMethod: 'hosted-checkout'
            },
            processingTimeMs: processingTime
          },
          amount,
          environment: (process.env.EPX_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production',
          purpose: 'payment-creation',
          sensitiveFieldsMasked: ['customerId', 'customerEmail', 'billingAddress'],
          timestamp: new Date().toISOString()
        });
      } catch (certError: any) {
        console.warn('[EPX Hosted] Certification logging failed:', certError.message);
        // Don't fail the payment request if cert logging fails
      }
    }

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
  const callbackStartTime = Date.now();
  
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

          // CRITICAL: Create enrollment record if payment approved but no enrollment exists
          if (result.isApproved && payment.userId && !payment.metadata?.enrollmentCreated) {
            try {
              console.log('[EPX Callback] Checking if member enrollment exists for userId:', payment.userId);
              
              // Check if user already exists in members table
              const existingMember = await storage.getUser(payment.userId);
              
              if (!existingMember || !existingMember.email) {
                console.log('[EPX Callback] ⚠️ No member record found - payment succeeded but enrollment incomplete');
                console.log('[EPX Callback] This can happen if user paid directly without completing registration form');
                console.log('[EPX Callback] UserId:', payment.userId, 'TransactionId:', result.transactionId);
                // TODO: Send admin notification about incomplete enrollment
              } else {
                console.log('[EPX Callback] ✅ Member record found:', existingMember.email);
                
                // Check if commission was created for this enrollment
                const { data: existingCommissions } = await supabase
                  .from('agent_commissions')
                  .select('id')
                  .eq('member_id', payment.userId.toString())
                  .eq('enrollment_id', payment.subscriptionId?.toString() || '');
                
                if (!existingCommissions || existingCommissions.length === 0) {
                  console.log('[EPX Callback] ⚠️ No commission found for this enrollment');
                  // Commission should have been created during registration
                  // If missing, it means the registration flow was incomplete
                } else {
                  console.log('[EPX Callback] ✅ Commission exists for enrollment');
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
              console.error('[EPX Callback] Error checking enrollment:', enrollError);
              // Don't fail the payment if enrollment check fails
            }
          }

          // Mark commission payment as captured (14-day grace period before payout)
          if (result.isApproved && payment.metadata?.memberId) {
            try {
              console.log('[EPX Callback] Marking commission payment captured for member:', payment.metadata.memberId);
              await storage.markCommissionPaymentCaptured(
                payment.metadata.memberId.toString(),
                result.transactionId,
                result.transactionId
              );
              console.log('[EPX Callback] ✅ Commission payment captured - eligible for payout in 14 days');
            } catch (commError: any) {
              console.error('[EPX Callback] Error marking commission payment captured:', commError);
              // Don't fail the payment if commission update fails
            }
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
  try {
    const summary = certificationLogger.getLogsSummary();
    
    res.json({
      success: true,
      data: summary,
      message: `Total certification logs: ${summary.totalLogs}`,
      directory: summary.rawLogsDir
    });
  } catch (error: any) {
    console.error('[EPX Certification] Summary error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get certification summary'
    });
  }
});

/**
 * Generate certification report
 */
router.get('/api/epx/certification/report', (req: Request, res: Response) => {
  try {
    const report = certificationLogger.generateCertificationReport();
    
    res.setHeader('Content-Type', 'text/plain');
    res.send(report);
  } catch (error: any) {
    console.error('[EPX Certification] Report error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate report'
    });
  }
});

/**
 * Export all certification logs to single file
 */
router.post('/api/epx/certification/export', (req: Request, res: Response) => {
  try {
    const filename = req.body.filename || undefined;
    const filepath = certificationLogger.exportAllLogs(filename);
    
    res.json({
      success: true,
      message: 'All certification logs exported',
      filepath,
      note: 'File can be found in logs/certification/summaries/ directory'
    });
  } catch (error: any) {
    console.error('[EPX Certification] Export error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export logs'
    });
  }
});

/**
 * Enable/disable certification logging
 */
router.post('/api/epx/certification/toggle', (req: Request, res: Response) => {
  try {
    const { enable } = req.body;
    const currentState = process.env.ENABLE_CERTIFICATION_LOGGING === 'true';
    
    res.json({
      success: true,
      message: `Certification logging is currently ${currentState ? 'ENABLED' : 'DISABLED'}`,
      note: 'To enable, set ENABLE_CERTIFICATION_LOGGING=true in your .env file and restart the server',
      currentState,
      environment: process.env.EPX_ENVIRONMENT || 'sandbox'
    });
  } catch (error: any) {
    console.error('[EPX Certification] Toggle error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to toggle certification logging'
    });
  }
});

export default router;
