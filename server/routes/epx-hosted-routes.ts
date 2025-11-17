/**
 * EPX Hosted Checkout Routes
 * Simpler implementation using EPX's hosted payment page
 */

import { Router, Request, Response } from 'express';
import { EPXHostedCheckoutService } from '../services/epx-hosted-checkout-service';
import { storage } from '../storage';
import { certificationLogger } from '../services/certification-logger';
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

    // Log for certification if enabled
    if (process.env.ENABLE_CERTIFICATION_LOGGING === 'true') {
      const processingTime = Date.now() - requestStartTime;
      
      try {
        certificationLogger.logCertificationEntry({
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

      // Log for certification if enabled
      if (process.env.ENABLE_CERTIFICATION_LOGGING === 'true') {
        const processingTime = Date.now() - callbackStartTime;
        
        try {
          certificationLogger.logCertificationEntry({
            transactionId: result.transactionId,
            customerId: req.body.customerId || 'unknown',
            request: {
              timestamp: new Date().toISOString(),
              method: 'POST',
              endpoint: '/api/epx/hosted/callback',
              url: `${req.protocol}://${req.get('host')}/api/epx/hosted/callback`,
              headers: {
                'content-type': req.get('content-type') || 'application/json',
                'user-agent': req.get('user-agent') || 'unknown'
              },
              body: {
                status: req.body.status,
                transactionId: req.body.transactionId,
                authCode: req.body.authCode ? '***MASKED***' : undefined,
                amount: req.body.amount
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
                success: result.isApproved,
                transactionId: result.transactionId,
                status: result.isApproved ? 'completed' : 'failed'
              },
              processingTimeMs: processingTime
            },
            amount: result.amount || 0,
            environment: (process.env.EPX_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production',
            purpose: 'callback-processing',
            sensitiveFieldsMasked: ['authCode', 'bricToken'],
            timestamp: new Date().toISOString()
          });
        } catch (certError: any) {
          console.warn('[EPX Hosted] Certification logging failed:', certError.message);
          // Don't fail the callback if cert logging fails
        }
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

/**
 * Get certification logs summary
 */
router.get('/api/epx/certification/summary', (req: Request, res: Response) => {
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

/**
 * ADMIN: Get EPX certification logs for support ticket
 * Returns raw request/response logs formatted for EPX certification process
 */
router.get('/api/admin/epx-certification-logs', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    // Check admin access
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin';
    if (!isAdmin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    console.log('[EPX Certification] Fetching certification logs for admin:', req.user?.email);

    // Get summary of certification logs
    const logsSummary = certificationLogger.getLogsSummary();

    // Generate and export consolidated report
    const exportPath = certificationLogger.exportAllLogs();

    // Send the file for download
    res.download(exportPath, `epx-certification-logs-${new Date().toISOString().split('T')[0]}.txt`, (err) => {
      if (err) {
        console.error('[EPX Certification] Download error:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Failed to download certification logs'
          });
        }
      } else {
        console.log('[EPX Certification] ✅ File downloaded successfully');
      }
    });

  } catch (error: any) {
    console.error('[EPX Certification] Export error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export certification logs'
    });
  }
});

/**
 * ADMIN: Get EPX payment logs for support ticket
 * Retrieves all payment transactions with full details for EPX support
 */
router.get('/api/admin/epx-logs', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    // Check admin access
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin';
    if (!isAdmin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    console.log('[EPX Logs] Fetching payment logs for admin:', req.user?.email);

    // Get all payments from database
    const { data: payments, error } = await supabase
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[EPX Logs] Database error:', error);
      return res.status(500).json({ error: 'Failed to fetch payments' });
    }

    // Format for EPX support ticket
    const epxLogs = payments.map((payment: any) => ({
      // Transaction identifiers
      transactionId: payment.transaction_id,
      paymentId: payment.id,
      subscriptionId: payment.subscription_id,
      
      // Timing
      createdAt: payment.created_at,
      processedAt: payment.metadata?.processedAt || null,
      
      // Payment details
      amount: payment.amount,
      currency: payment.currency || 'USD',
      status: payment.status,
      paymentMethod: payment.payment_method,
      
      // EPX specific
      authorizationCode: payment.authorization_code,
      bricToken: payment.bric_token,
      terminalProfileId: process.env.EPX_TERMINAL_PROFILE_ID,
      environment: process.env.EPX_ENVIRONMENT || 'sandbox',
      
      // Request/Response data
      requestData: payment.metadata?.requestData || null,
      callbackData: payment.metadata?.callbackData || null,
      
      // Member info (sanitized)
      memberEmail: payment.metadata?.memberEmail || null,
      planName: payment.metadata?.planName || null,
    }));

    // Summary statistics
    const stats = {
      totalTransactions: payments.length,
      successful: payments.filter((p: any) => p.status === 'completed').length,
      failed: payments.filter((p: any) => p.status === 'failed').length,
      pending: payments.filter((p: any) => p.status === 'pending').length,
      totalAmount: payments
        .filter((p: any) => p.status === 'completed')
        .reduce((sum: number, p: any) => sum + parseFloat(p.amount || 0), 0),
      dateRange: {
        earliest: payments[payments.length - 1]?.created_at,
        latest: payments[0]?.created_at
      }
    };

    res.json({
      success: true,
      stats,
      transactions: epxLogs,
      exportedAt: new Date().toISOString(),
      exportedBy: req.user?.email,
      environment: process.env.EPX_ENVIRONMENT || 'sandbox',
      terminalProfileId: process.env.EPX_TERMINAL_PROFILE_ID,
    });

  } catch (error: any) {
    console.error('[EPX Logs] Export error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export EPX logs'
    });
  }
});

export default router;