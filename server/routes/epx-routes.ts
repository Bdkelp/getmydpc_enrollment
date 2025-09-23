/**
 * EPX Payment Routes
 * Browser Post API Integration with North.com EPX
 */

import { Router, Request, Response } from 'express';
import { getEPXService, initializeEPXService } from '../services/epx-payment-service';
import { storage } from '../storage';
import { nanoid } from 'nanoid';
import { sendEnrollmentNotification } from '../utils/notifications';
import { transactionLogger } from '../services/transaction-logger';

const router = Router();

// Initialize EPX Service on startup
let epxServiceInitialized = false;
let epxInitError: string | null = null;

try {
  // Get the base URL from environment
  const baseUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
      : 'http://localhost:5000';

  // EPX Browser Post API Configuration (not Hosted Checkout)
  const epxConfig = {
    // MAC key is required for Browser Post API TAC generation
    mac: process.env.EPX_MAC_KEY || '2ifP9bBSu9TrjMt8EPh1rGfJiZsfCb8Y',
    // EPI credentials for Custom Pay API (refunds/voids)
    epiId: process.env.EPX_EPI_ID,
    epiKey: process.env.EPX_EPI_KEY,
    // Merchant identification
    custNbr: process.env.EPX_CUST_NBR || '9001',
    merchNbr: process.env.EPX_MERCH_NBR || '900300',
    dbaNbr: process.env.EPX_DBA_NBR || '2',
    terminalNbr: process.env.EPX_TERMINAL_NBR || '72',
    environment: (process.env.EPX_ENVIRONMENT === 'production' ? 'production' : 'sandbox') as 'production' | 'sandbox',
    // Browser Post API URLs
    redirectUrl: process.env.EPX_REDIRECT_URL || `${baseUrl}/payment/success`,
    responseUrl: process.env.EPX_RESPONSE_URL || `${baseUrl}/api/epx/webhook`,
    cancelUrl: process.env.EPX_CANCEL_URL || `${baseUrl}/payment/cancel`,
    webhookSecret: process.env.EPX_WEBHOOK_SECRET
  };

  console.log('[EPX Routes] Configuration check:', {
    hasMac: !!epxConfig.mac,
    macLength: epxConfig.mac?.length,
    custNbr: epxConfig.custNbr,
    merchNbr: epxConfig.merchNbr,
    environment: epxConfig.environment,
    baseUrl
  });

  // Validate critical configuration
  if (!epxConfig.mac) {
    throw new Error('EPX_MAC_KEY environment variable is required for payment processing');
  }

  if (!epxConfig.custNbr || !epxConfig.merchNbr) {
    throw new Error('EPX_CUST_NBR and EPX_MERCH_NBR are required for payment processing');
  }

  initializeEPXService(epxConfig);
  const epxService = getEPXService();
  epxServiceInitialized = true;
  console.log('[EPX Routes] ✅ EPX Browser Post API Service initialized successfully');
  console.log('[EPX Routes] Payment Method: Browser Post API (NOT Hosted Checkout)');
  console.log('[EPX Routes] Environment:', process.env.EPX_ENVIRONMENT || 'sandbox');
  console.log('[EPX Routes] Base URL:', baseUrl);
  console.log('[EPX Routes] TAC Endpoint:', 'https://keyexch.epxuap.com');
  console.log('[EPX Routes] Payment Endpoint:', 'https://services.epxuap.com/browserpost/');
  console.log('[EPX Routes] Request Format:', 'Testing both form-encoded and JSON formats');

  // Test EPX connectivity on startup
  setTimeout(async () => {
    try {
      console.log('[EPX Routes] Testing EPX connectivity...');
      const testResponse = await epxService.generateTAC({
        amount: 1.00,
        tranNbr: 'CONNECTIVITY_TEST_' + Date.now(),
        customerEmail: 'test@mypremierplans.com',
        orderDescription: 'Connectivity Test'
      });

      if (testResponse.success) {
        console.log('[EPX Routes] ✅ EPX connectivity test passed');
      } else {
        console.warn('[EPX Routes] ⚠️ EPX connectivity test failed:', testResponse.error);
      }
    } catch (testError: any) {
      console.warn('[EPX Routes] ⚠️ EPX connectivity test error:', testError.message);
    }
  }, 5000); // Test after 5 seconds to allow server to fully start
} catch (error: any) {
  epxInitError = error.message || 'Unknown error during EPX initialization';
  console.error('[EPX Routes] Failed to initialize EPX Service:', error);
  console.error('[EPX Routes] Payment processing will not be available');
}

/**
 * Health check endpoint for EPX payment service
 */
router.get('/api/epx/health', (req: Request, res: Response) => {
  if (epxServiceInitialized) {
    res.json({
      status: 'healthy',
      service: 'EPX Payment Service',
      environment: process.env.EPX_ENVIRONMENT || 'sandbox',
      initialized: true
    });
  } else {
    res.status(503).json({
      status: 'unhealthy',
      service: 'EPX Payment Service',
      environment: process.env.EPX_ENVIRONMENT || 'sandbox',
      initialized: false,
      error: epxInitError || 'Service not initialized'
    });
  }
});

/**
 * Browser Post API status endpoint - we're using Browser Post, not Hosted Checkout
 */
router.get('/api/epx/browser-post-status', async (req: Request, res: Response) => {
  try {
    if (!epxServiceInitialized) {
      return res.status(503).json({
        success: false,
        error: 'EPX Browser Post API not initialized',
        method: 'browser-post'
      });
    }

    res.json({
      success: true,
      method: 'browser-post',
      environment: process.env.EPX_ENVIRONMENT || 'sandbox',
      status: 'ready'
    });
  } catch (error: any) {
    console.error('[EPX] Browser Post status error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get Browser Post status'
    });
  }
});

/**
 * Test endpoint for payment success redirect
 */
router.get('/payment/success', async (req: Request, res: Response) => {
  console.log('[EPX] Payment success redirect received');
  console.log('[EPX] Query parameters:', req.query);
  
  const { AUTH_RESP, AUTH_CODE, TRAN_NBR, AUTH_AMOUNT } = req.query;
  
  if (AUTH_RESP === 'APPROVAL') {
    res.redirect(`/confirmation?transaction=${TRAN_NBR}&amount=${AUTH_AMOUNT}&status=success`);
  } else {
    res.redirect(`/payment-failed?transaction=${TRAN_NBR}&reason=${AUTH_RESP}`);
  }
});

/**
 * Test endpoint for payment cancel redirect
 */
router.get('/payment/cancel', async (req: Request, res: Response) => {
  console.log('[EPX] Payment cancel redirect received');
  console.log('[EPX] Query parameters:', req.query);
  
  res.redirect('/payment-cancel');
});

/**
 * Debug endpoint to validate form data structure
 */
router.get('/api/epx/debug-form-data', async (req: Request, res: Response) => {
  try {
    if (!epxServiceInitialized) {
      return res.status(503).json({
        success: false,
        error: 'EPX Service not initialized'
      });
    }

    const epxService = getEPXService();

    // Generate a test TAC
    const testTacResponse = await epxService.generateTAC({
      amount: 1.00,
      tranNbr: 'DEBUG_FORM_' + Date.now(),
      customerEmail: 'debug@test.com',
      orderDescription: 'Form Debug Test'
    });

    if (!testTacResponse.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate test TAC',
        details: testTacResponse.error
      });
    }

    // Generate form data
    const formData = epxService.getPaymentFormData(
      testTacResponse.tac!,
      1.00,
      'DEBUG_FORM_' + Date.now(),
      'card'
    );

    res.json({
      success: true,
      formData: {
        ...formData,
        tac: '***MASKED***' // Don't expose real TAC in debug
      },
      tacGenerated: true,
      allRequiredFields: {
        TAC: !!formData.tac,
        TRAN_CODE: !!formData.tranCode,
        TRAN_GROUP: !!formData.tranGroup,
        AMOUNT: !!formData.amount,
        TRAN_NBR: !!formData.tranNbr,
        REDIRECT_URL: !!formData.redirectUrl,
        RESPONSE_URL: !!formData.responseUrl
      }
    });
  } catch (error: any) {
    console.error('[EPX] Debug form data error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Debug form data failed'
    });
  }
});

/**
 * Create payment session for Browser Post API
 */
router.post('/api/epx/create-payment', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    console.log('[EPX Create Payment] === REQUEST START ===');
    console.log('[EPX Create Payment] Headers:', JSON.stringify({
      'content-type': req.headers['content-type'],
      'authorization': req.headers.authorization ? 'Bearer ***' : 'none',
      'user-agent': req.headers['user-agent']
    }, null, 2));

    console.log('[EPX Create Payment] Body:', JSON.stringify(req.body, null, 2));

    // Check if EPX service is initialized
    if (!epxServiceInitialized) {
      console.error('[EPX Create Payment] EPX Service not initialized');
      console.error('[EPX Create Payment] Initialization error:', epxInitError);
      return res.status(503).json({
        success: false,
        error: 'Payment service temporarily unavailable',
        details: epxInitError || 'EPX service not configured properly. Please check environment variables.',
        requiredVars: [
          'EPX_MAC_KEY (32-character key from North.com)',
          'EPX_CUST_NBR (Customer number)',
          'EPX_MERCH_NBR (Merchant number)'
        ]
      });
    }

    // EPX configuration will be validated at request time, not at module load

    // Validate EPX service initialization
    let epxService;
    try {
      epxService = getEPXService();
    } catch (serviceError: any) {
      console.error('[EPX Create Payment] EPX Service retrieval failed:', serviceError);
      return res.status(503).json({
        success: false,
        error: 'Payment service temporarily unavailable',
        details: serviceError.message || 'EPX service initialization failed'
      });
    }

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

    // Comprehensive input validation
    const errors = [];
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      errors.push('Valid amount is required');
    }
    if (!customerId || customerId.toString().trim() === '') {
      errors.push('Customer ID is required');
    }
    if (!customerEmail || !customerEmail.includes('@')) {
      errors.push('Valid customer email is required');
    }

    if (errors.length > 0) {
      console.error('[EPX Create Payment] Validation errors:', errors);
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: errors.join(', ')
      });
    }

    const sanitizedAmount = parseFloat(amount);
    const sanitizedCustomerId = customerId.toString().trim();
    const sanitizedEmail = customerEmail.toString().trim();

    // Generate unique transaction number
    const tranNbr = `TXN_${Date.now()}_${nanoid(8)}`;

    console.log('[EPX Create Payment] Generating TAC with payload:', {
      amount: sanitizedAmount,
      tranNbr,
      customerEmail: sanitizedEmail,
      customerId: sanitizedCustomerId,
      planId,
      paymentMethod: paymentMethod || 'card',
      environment: process.env.EPX_ENVIRONMENT || 'sandbox'
    });

    // Generate TAC for Browser Post
    const tacResponse = await epxService.generateTAC({
      amount: sanitizedAmount,
      tranNbr,
      customerEmail: sanitizedEmail,
      orderDescription: description || `DPC Subscription Payment - Plan ${planId}`,
      paymentMethod: paymentMethod || 'card',
      achRoutingNumber,
      achAccountNumber,
      achAccountType,
      achAccountName
    });

    // Safety check: ensure tacResponse exists and has expected structure
    if (!tacResponse || typeof tacResponse !== 'object') {
      console.error('[EPX Create Payment] EPX service returned invalid response:', tacResponse);
      return res.status(500).json({
        success: false,
        error: 'EPX service returned invalid response',
        details: 'Payment service temporarily unavailable'
      });
    }

    console.log('[EPX Create Payment] TAC Response:', {
      success: tacResponse.success,
      hasTAC: !!tacResponse.tac,
      tacLength: tacResponse.tac?.length,
      error: tacResponse.error
    });

    if (!tacResponse.success || !tacResponse.tac) {
      console.error('[EPX Create Payment] TAC generation failed:', tacResponse);
      return res.status(500).json({
        success: false,
        error: tacResponse.error || 'Failed to generate payment session',
        details: 'TAC generation failed'
      });
    }

    // Store transaction details for webhook processing with comprehensive logging
    let paymentRecord;
    try {
      const paymentData = {
        userId: sanitizedCustomerId,
        subscriptionId: subscriptionId || null,
        amount: sanitizedAmount.toString(),
        currency: 'USD',
        status: 'pending',
        paymentMethod: paymentMethod || 'card',
        transactionId: tranNbr,
        metadata: {
          planId: planId ? parseInt(planId.toString()) : null,
          tac: tacResponse.tac,
          paymentType: paymentMethod || 'card',
          environment: process.env.EPX_ENVIRONMENT || 'sandbox',
          ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown',
          timestamp: new Date().toISOString(),
          requestBody: req.body,
          ...(paymentMethod === 'ach' && {
            achLastFour: achAccountNumber?.slice(-4),
            achAccountType
          })
        }
      };

      console.log('[EPX Create Payment] Creating payment record with data:', {
        ...paymentData,
        metadata: { ...paymentData.metadata, tac: '***MASKED***', requestBody: '***MASKED***' }
      });

      paymentRecord = await storage.createPayment(paymentData);

      console.log('[EPX Create Payment] ✅ Payment record created successfully:', {
        paymentId: paymentRecord?.id,
        transactionId: tranNbr,
        amount: sanitizedAmount,
        userId: sanitizedCustomerId,
        timestamp: new Date().toISOString()
      });
    } catch (storageError: any) {
      console.error('[EPX Create Payment] ❌ CRITICAL: Storage error - payment record NOT created:', {
        error: storageError.message,
        stack: storageError.stack,
        transactionId: tranNbr,
        userId: sanitizedCustomerId,
        amount: sanitizedAmount,
        timestamp: new Date().toISOString()
      });

      // Force create a minimal payment record for audit trail
      try {
        paymentRecord = await storage.createPayment({
          userId: sanitizedCustomerId,
          amount: sanitizedAmount.toString(),
          currency: 'USD',
          status: 'pending',
          paymentMethod: paymentMethod || 'card',
          transactionId: tranNbr,
          metadata: {
            error: 'Storage error during creation',
            errorMessage: storageError.message,
            timestamp: new Date().toISOString(),
            environment: process.env.EPX_ENVIRONMENT || 'sandbox'
          }
        });
        console.log('[EPX Create Payment] ✅ Minimal payment record created after error:', paymentRecord?.id);
      } catch (fallbackError: any) {
        console.error('[EPX Create Payment] ❌ FATAL: Could not create even minimal payment record:', fallbackError.message);
        // Log to file system as last resort
        const fs = require('fs');
        const logData = {
          timestamp: new Date().toISOString(),
          transactionId: tranNbr,
          userId: sanitizedCustomerId,
          amount: sanitizedAmount,
          error: 'Failed to create payment record',
          originalError: storageError.message,
          fallbackError: fallbackError.message
        };
        fs.appendFileSync('payment-errors.log', JSON.stringify(logData) + '\n');
      }
    }

    // Log transaction creation for audit trail
    try {
      transactionLogger.logPaymentCreated({
        transactionId: tranNbr,
        paymentId: paymentRecord?.id || 'storage_failed',
        amount: sanitizedAmount,
        customerId: sanitizedCustomerId,
        paymentMethod: paymentMethod || 'card',
        environment: process.env.EPX_ENVIRONMENT || 'sandbox',
        ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        metadata: {
          planId,
          subscriptionId,
          description
        }
      });
    } catch (logError) {
      console.warn('[EPX Create Payment] Transaction logging failed:', logError);
      // Don't fail the payment creation for logging errors
    }

    // Get payment form data
    const formData = epxService.getPaymentFormData(
      tacResponse.tac,
      sanitizedAmount,
      tranNbr,
      paymentMethod || 'card'
    );

    console.log('[EPX Create Payment] Generated form data:', {
      actionUrl: formData.actionUrl,
      hasTAC: !!formData.tac,
      tacLength: formData.tac?.length,
      tranCode: formData.tranCode,
      tranGroup: formData.tranGroup,
      amount: formData.amount,
      tranNbr: formData.tranNbr,
      redirectUrl: formData.redirectUrl?.substring(0, 50) + '...',
      responseUrl: formData.responseUrl?.substring(0, 50) + '...',
      paymentMethod: paymentMethod || 'card'
    });

    const processingTime = Date.now() - startTime;
    console.log(`[EPX Create Payment] SUCCESS - Processing time: ${processingTime}ms`);

    res.json({
      success: true,
      transactionId: tranNbr,
      formData,
      processingTime
    });

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error(`[EPX Create Payment] ERROR after ${processingTime}ms:`, {
      message: error.message,
      stack: error.stack,
      name: error.name,
      requestBody: req.body,
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent']
      }
    });

    // Log detailed error information for debugging
    if (error.code) {
      console.error(`[EPX Create Payment] Error code: ${error.code}`);
    }
    if (error.errno) {
      console.error(`[EPX Create Payment] Error errno: ${error.errno}`);
    }
    if (error.syscall) {
      console.error(`[EPX Create Payment] Error syscall: ${error.syscall}`);
    }

    // Check if it's a TAC generation error
    if (error.message.includes('TAC') || error.message.includes('EPX_MAC')) {
      return res.status(500).json({
        success: false,
        error: 'TAC generation failed',
        details: 'Unable to generate Transaction Authorization Code. Please check your EPX MAC key and configuration.',
        suggestion: 'Ensure the EPX_MAC environment variable is correctly set and is a valid 32-character key.',
        processingTime,
        errorType: error.name,
        errorCode: error.code || 'TAC_GENERATION_ERROR'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create payment session',
      details: 'Internal server error during payment creation',
      processingTime,
      errorType: error.name,
      errorCode: error.code || 'UNKNOWN'
    });
  }
});

/**
 * Handle EPX webhook/response URL
 * This receives payment results from EPX Browser Post API
 */
router.post('/api/epx/webhook', async (req: Request, res: Response) => {
  try {
    console.log('[EPX Webhook] === WEBHOOK RECEIVED ===');
    console.log('[EPX Webhook] Request method:', req.method);
    console.log('[EPX Webhook] Request headers:', JSON.stringify(req.headers, null, 2));
    console.log('[EPX Webhook] Request body:', JSON.stringify(req.body, null, 2));
    console.log('[EPX Webhook] Request query:', JSON.stringify(req.query, null, 2));
    
    const epxService = getEPXService();

    // Validate webhook signature if configured
    const signature = req.headers['x-epx-signature'] as string;
    const isValid = epxService.validateWebhookSignature(req.body, signature);

    if (!isValid) {
      console.error('[EPX Webhook] Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Process the webhook payload
    console.log('[EPX Webhook] Processing webhook payload:', {
      body: req.body,
      headers: req.headers,
      timestamp: new Date().toISOString()
    });

    const result = epxService.processWebhook(req.body);

    console.log('[EPX Webhook] Webhook processing result:', {
      isApproved: result.isApproved,
      transactionId: result.transactionId,
      authCode: result.authCode,
      error: result.error,
      timestamp: new Date().toISOString()
    });

    if (result.transactionId) {
      // Update payment status in database
      console.log('[EPX Webhook] Looking up payment by transaction ID:', result.transactionId);
      const payment = await storage.getPaymentByTransactionId(result.transactionId);

      if (payment) {
        console.log('[EPX Webhook] Found payment record:', {
          paymentId: payment.id,
          currentStatus: payment.status,
          amount: payment.amount,
          userId: payment.userId
        });

        // Update payment with comprehensive logging
        const updateResult = await storage.updatePayment(payment.id, {
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

        console.log('[EPX Webhook] Payment update result:', updateResult);

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
          adminEmail: 'info@mypremierplans.com', // Admin email
          transactionDetails: {
            transactionId: result.transactionId,
            status: result.isApproved ? 'completed' : 'failed',
            amount: result.amount,
            date: new Date()
          }
        });
      } else {
        console.error('[EPX Transaction Log] ❌ PAYMENT NOT FOUND:', {
          transactionId: result.transactionId,
          environment: process.env.EPX_ENVIRONMENT || 'sandbox',
          webhookData: req.body,
          timestamp: new Date().toISOString(),
          note: 'This could indicate the payment was never created or transaction ID mismatch'
        });

        // Log to file system for critical analysis
        const fs = require('fs');
        const errorLog = {
          timestamp: new Date().toISOString(),
          error: 'PAYMENT_NOT_FOUND_IN_WEBHOOK',
          transactionId: result.transactionId,
          webhookData: req.body,
          environment: process.env.EPX_ENVIRONMENT || 'sandbox'
        };
        fs.appendFileSync('payment-errors.log', JSON.stringify(errorLog) + '\n');
      }
    } else {
      console.error('[EPX Webhook] ❌ No transaction ID in webhook result:', {
        result,
        originalPayload: req.body,
        timestamp: new Date().toISOString()
      });
    }

    // Acknowledge receipt
    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('[EPX Webhook] Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Handle EPX webhook/response URL via GET (EPX may send results via GET)
 */
router.get('/api/epx/webhook', async (req: Request, res: Response) => {
  try {
    console.log('[EPX Webhook GET] === WEBHOOK GET RECEIVED ===');
    console.log('[EPX Webhook GET] Query parameters:', JSON.stringify(req.query, null, 2));
    
    const epxService = getEPXService();

    // Process the webhook payload from query parameters
    const result = epxService.processWebhook(req.query);

    console.log('[EPX Webhook GET] Webhook processing result:', {
      isApproved: result.isApproved,
      transactionId: result.transactionId,
      authCode: result.authCode,
      error: result.error,
      timestamp: new Date().toISOString()
    });

    if (result.transactionId) {
      // Update payment status in database
      console.log('[EPX Webhook GET] Looking up payment by transaction ID:', result.transactionId);
      const payment = await storage.getPaymentByTransactionId(result.transactionId);

      if (payment) {
        console.log('[EPX Webhook GET] Found payment record:', {
          paymentId: payment.id,
          currentStatus: payment.status,
          amount: payment.amount,
          userId: payment.userId
        });

        // Update payment with comprehensive logging
        const updateResult = await storage.updatePayment(payment.id, {
          status: result.isApproved ? 'completed' : 'failed',
          authorizationCode: result.authCode,
          metadata: {
            ...payment.metadata,
            bricToken: result.bricToken,
            authAmount: result.amount,
            error: result.error,
            webhookProcessedAt: new Date().toISOString(),
            epxResponse: req.query
          }
        });

        console.log('[EPX Webhook GET] Payment update result:', updateResult);

        // Log transaction
        console.log(`[EPX Transaction Log] Payment ${result.isApproved ? 'APPROVED' : 'DECLINED'}:`, {
          transactionId: result.transactionId,
          paymentId: payment.id,
          status: result.isApproved ? 'completed' : 'failed',
          amount: result.amount,
          authCode: result.authCode,
          environment: process.env.EPX_ENVIRONMENT || 'sandbox',
          timestamp: new Date().toISOString()
        });

        // If approved, update subscription status
        if (result.isApproved && payment.subscriptionId) {
          await storage.updateSubscription(payment.subscriptionId, {
            status: 'active',
            lastPaymentDate: new Date()
          });
        }
      } else {
        console.error('[EPX Webhook GET] ❌ PAYMENT NOT FOUND:', {
          transactionId: result.transactionId,
          environment: process.env.EPX_ENVIRONMENT || 'sandbox',
          webhookData: req.query,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Acknowledge receipt
    res.status(200).json({ received: true, processed: true });
  } catch (error: any) {
    console.error('[EPX Webhook GET] Error processing webhook:', error);
    res.status(200).json({ received: true, error: error.message }); // Still return 200 to EPX
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