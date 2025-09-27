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
  // ALWAYS use production domain for EPX - never send Replit URLs to EPX
  const baseUrl = 'https://enrollment.getmydpc.com';

  // EPX Browser Post API Configuration (not Hosted Checkout)
  const epxConfig = {
    // MAC key is required for Browser Post API TAC generation
    mac: process.env.EPX_MAC || process.env.EPX_MAC_KEY || '2ifP9bBSu9TrjMt8EPh1rGfJiZsfCb8Y',
    // EPI credentials for Custom Pay API (refunds/voids)
    epiId: process.env.EPX_EPI_ID,
    epiKey: process.env.EPX_EPI_KEY,
    // Merchant identification
    custNbr: process.env.EPX_CUST_NBR || '9001',
    merchNbr: process.env.EPX_MERCH_NBR || '900300',
    dbaNbr: process.env.EPX_DBA_NBR || '2',
    terminalNbr: process.env.EPX_TERMINAL_NBR || '72',
    environment: (process.env.EPX_ENVIRONMENT === 'production' ? 'production' : 'sandbox') as 'production' | 'sandbox',
    // Browser Post API URLs - Only REDIRECT_URL is stored on EPX side
    redirectUrl: process.env.EPX_REDIRECT_URL || `${baseUrl}/api/epx/redirect`,
    responseUrl: `${baseUrl}/api/epx/webhook`, // For internal use only, not sent to EPX
    cancelUrl: `${baseUrl}/api/epx/redirect?status=cancelled`, // For internal use only
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
 * Test EPX redirect URL configuration
 */
router.get('/api/epx/test-redirect-config', async (req: Request, res: Response) => {
  try {
    if (!epxServiceInitialized) {
      return res.status(503).json({
        success: false,
        error: 'EPX Service not initialized'
      });
    }

    const redirectConfig = {
      baseUrl: baseUrl,
      redirectUrl: `${baseUrl}/api/epx/redirect`,
      responseUrl: `${baseUrl}/api/epx/webhook`,
      cancelUrl: `${baseUrl}/api/epx/redirect?status=cancelled`,
      frontendRedirects: {
        success: `${baseUrl}/payment-success`,
        failed: `${baseUrl}/payment-failed`,
        cancel: `${baseUrl}/payment-cancel`
      }
    };

    console.log('[EPX Test] Current redirect configuration:', redirectConfig);

    res.json({
      success: true,
      config: redirectConfig,
      note: 'These are the URLs EPX will use for redirects after payment processing'
    });
  } catch (error: any) {
    console.error('[EPX Test] Error checking redirect config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Test endpoint for payment success redirect (legacy)
 */
router.get('/payment/success', async (req: Request, res: Response) => {
  console.log('[EPX] Legacy payment success redirect received');
  console.log('[EPX] Query parameters:', req.query);
  console.log('[EPX] This endpoint should not be used - redirecting to API handler');

  // Redirect to proper API handler
  const queryString = new URLSearchParams(req.query as any).toString();
  res.redirect(`/api/epx/redirect?${queryString}`);
});

/**
 * Test endpoint for payment cancel redirect (legacy)
 */
router.get('/payment/cancel', async (req: Request, res: Response) => {
  console.log('[EPX] Legacy payment cancel redirect received');
  console.log('[EPX] Query parameters:', req.query);
  console.log('[EPX] This endpoint should not be used - redirecting to API handler');

  res.redirect('/api/epx/redirect?status=cancelled');
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

    // Get payment form data with customer data for AVS
    const formData = epxService.getPaymentFormData(
      tacResponse.tac,
      sanitizedAmount,
      tranNbr,
      paymentMethod || 'card',
      {
        // Include AVS data if available from request body
        zipCode: req.body.zipCode,
        address: req.body.address
      }
    );

    // === RAW TRANSACTION POST DEBUG DATA ===
    console.log('[EPX] === RAW TRANSACTION POST DATA FOR DEV TEAM ===');
    console.log('[EPX] URL:', formData.actionUrl);
    console.log('[EPX] Method: POST');
    console.log('[EPX] Headers: {');
    console.log('[EPX]   "Content-Type": "application/x-www-form-urlencoded",');
    console.log('[EPX]   "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",');
    console.log('[EPX]   "User-Agent": "Mozilla/5.0 (compatible; EPX-Integration/1.0)",');
    console.log('[EPX]   "Cache-Control": "no-cache"');
    console.log('[EPX] }');

    // Create form-encoded body for logging (mask sensitive data)
    const debugFormData = new URLSearchParams();
    Object.entries(formData).forEach(([key, value]) => {
      if (key === 'tac') {
        debugFormData.append(key, '***TAC_MASKED***');
      } else if (value !== undefined && value !== null && key !== 'actionUrl') {
        debugFormData.append(key.toUpperCase(), value.toString());
      }
    });

    console.log('[EPX] Body (form-encoded):', debugFormData.toString());
    console.log('[EPX] === END TRANSACTION POST DATA ===');

    // Additional debugging for redirect URL validation
    console.log('[EPX] === REDIRECT URL VALIDATION ===');
    console.log('[EPX] Configured redirect URL:', formData.redirectUrl);
    console.log('[EPX] Expected EPX redirect to:', `${formData.redirectUrl}?AUTH_RESP=...`);
    console.log('[EPX] Redirect endpoint should be accessible at: GET /api/epx/redirect');
    console.log('[EPX] === END REDIRECT URL VALIDATION ===');

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

    // === RAW EPX WEBHOOK DATA FOR DEV TEAM ===
    console.log('[EPX] === RAW EPX WEBHOOK DATA FOR DEV TEAM ===');
    console.log('[EPX] Webhook URL: /api/epx/webhook');
    console.log('[EPX] Method:', req.method);
    console.log('[EPX] Headers:', JSON.stringify(req.headers, null, 2));
    console.log('[EPX] Body:', JSON.stringify(req.body, null, 2));
    console.log('[EPX] Query:', JSON.stringify(req.query, null, 2));
    console.log('[EPX] Content-Type:', req.headers['content-type']);
    console.log('[EPX] Timestamp:', new Date().toISOString());
    console.log('[EPX] === END EPX WEBHOOK DATA ===');

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
 * Transaction debug endpoint - captures all EPX transaction flow data
 */
router.get('/api/epx/debug-transaction-flow', async (req: Request, res: Response) => {
  try {
    console.log('[EPX Debug] Transaction flow debug endpoint called');

    const epxService = getEPXService();

    // Generate a debug TAC
    const debugTacResponse = await epxService.generateTAC({
      amount: 1.00,
      tranNbr: 'DEBUG_FLOW_' + Date.now(),
      customerEmail: 'debug@getmydpc.com',
      orderDescription: 'Debug Transaction Flow Test'
    });

    // Get form data that would be POSTed to EPX
    let formData = null;
    if (debugTacResponse.success && debugTacResponse.tac) {
      formData = epxService.getPaymentFormData(
        debugTacResponse.tac,
        1.00,
        'DEBUG_FLOW_' + Date.now(),
        'card'
      );
    }

    // Provide complete data for dev team
    const debugData = {
      keyExchangeRequest: {
        url: 'https://keyexch.epxuap.com',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (compatible; EPX-Integration/1.0)',
          'Cache-Control': 'no-cache'
        },
        body: `MAC=***MASKED***&AMOUNT=1.00&TRAN_NBR=DEBUG_FLOW_${Date.now()}&TRAN_GROUP=SALE&REDIRECT_URL=${encodeURIComponent('https://enrollment.getmydpc.com/api/epx/redirect')}&REDIRECT_ECHO=V`
      },
      keyExchangeResponse: debugTacResponse.success ? {
        status: '200 OK',
        tac: '***TAC_GENERATED***',
        success: true
      } : {
        status: 'ERROR',
        error: debugTacResponse.error,
        success: false
      },
      transactionPostData: formData ? {
        url: formData.actionUrl,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `TAC=***MASKED***&TRAN_CODE=${formData.tranCode}&TRAN_GROUP=${formData.tranGroup}&AMOUNT=${formData.amount}&TRAN_NBR=${formData.tranNbr}&CUST_NBR=${formData.custNbr}&MERCH_NBR=${formData.merchNbr}&DBA_NBR=${formData.dbaNbr}&TERMINAL_NBR=${formData.terminalNbr}&REDIRECT_URL=${encodeURIComponent(formData.redirectUrl)}&REDIRECT_ECHO=V&INDUSTRY_TYPE=${formData.industryType}&BATCH_ID=${formData.batchId}&RECEIPT=${formData.receipt}`
      } : null,
      redirectEndpoint: 'https://enrollment.getmydpc.com/api/epx/redirect',
      webhookEndpoint: 'https://enrollment.getmydpc.com/api/epx/webhook',
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      message: 'Transaction flow debug data captured',
      debugData,
      note: 'This data can be provided to EPX dev team for debugging'
    });

  } catch (error: any) {
    console.error('[EPX Debug] Error generating debug data:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      note: 'Debug data generation failed'
    });
  }
});

/**
 * Test the redirect endpoint directly
 */
router.get('/api/epx/test-redirect', (req: Request, res: Response) => {
  console.log('[EPX Test Redirect] Direct test of redirect endpoint');
  console.log('[EPX Test Redirect] Query params:', req.query);
  
  res.json({
    success: true,
    message: 'Redirect endpoint is accessible',
    query: req.query,
    note: 'This confirms the route is registered and working'
  });
});

/**
 * Test endpoint to verify EPX routes are working
 */
router.get('/api/epx/test', (req: Request, res: Response) => {
  console.log('[EPX Test] Test endpoint called');
  res.json({
    success: true,
    message: 'EPX routes are working',
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      'GET /api/epx/health',
      'GET /api/epx/redirect',
      'POST /api/epx/webhook',
      'POST /api/epx/create-payment',
      'GET /api/epx/debug-transaction-flow'
    ]
  });
});

/**
 * Handle payment redirect (user returns from EPX)
 */
router.get('/api/epx/redirect', async (req: Request, res: Response) => {
  try {
    console.log('[EPX Redirect] === USER RETURNED FROM EPX PAYMENT ===');
    console.log('[EPX Redirect] Route matched successfully');
    console.log('[EPX Redirect] Request method:', req.method);
    console.log('[EPX Redirect] Request path:', req.path);
    console.log('[EPX Redirect] Query parameters:', JSON.stringify(req.query, null, 2));
    console.log('[EPX Redirect] Full URL:', req.url);

    // === RAW EPX REDIRECT RESPONSE DATA FOR DEV TEAM ===
    console.log('[EPX] === RAW EPX REDIRECT RESPONSE DATA FOR DEV TEAM ===');
    console.log('[EPX] Redirect URL:', req.url);
    console.log('[EPX] Method:', req.method);
    console.log('[EPX] Headers:', JSON.stringify(req.headers, null, 2));
    console.log('[EPX] Query Parameters:', JSON.stringify(req.query, null, 2));
    console.log('[EPX] Raw Query String:', req.url.split('?')[1] || 'none');
    console.log('[EPX] Timestamp:', new Date().toISOString());
    console.log('[EPX] === END EPX REDIRECT RESPONSE DATA ===');

    // Define baseUrl in the handler scope
    const baseUrl = 'https://enrollment.getmydpc.com';

    // Parse response parameters from EPX
    const { 
      AUTH_RESP, 
      AUTH_CODE, 
      TRAN_NBR, 
      AUTH_AMOUNT, 
      AUTH_GUID,
      TRAN_TYPE,
      BP_RESP_CODE,
      NETWORK_RESPONSE,
      status // For cancelled payments
    } = req.query;

    // Handle cancelled payments
    if (status === 'cancelled') {
      console.log('[EPX Redirect] Payment was cancelled by user');
      return res.redirect(`${baseUrl.replace(/^https?:\/\/[^\/]+/, '')}/payment-cancel`);
    }

    const isApproved = AUTH_RESP === 'APPROVAL';

    console.log('[EPX Redirect] Payment result:', {
      isApproved,
      authResponse: AUTH_RESP,
      transactionId: TRAN_NBR,
      amount: AUTH_AMOUNT,
      authCode: AUTH_CODE,
      timestamp: new Date().toISOString()
    });

    // Update payment in database if we have transaction info
    if (TRAN_NBR) {
      try {
        const epxService = getEPXService();
        const result = epxService.processWebhook(req.query);

        const payment = await storage.getPaymentByTransactionId(TRAN_NBR as string);

        if (payment) {
          console.log('[EPX Redirect] Updating payment record:', payment.id);

          await storage.updatePayment(payment.id, {
            status: result.isApproved ? 'completed' : 'failed',
            authorizationCode: result.authCode,
            metadata: {
              ...payment.metadata,
              bricToken: result.bricToken,
              authAmount: result.amount,
              error: result.error,
              redirectProcessedAt: new Date().toISOString(),
              epxRedirectResponse: req.query
            }
          });

          // If approved, update subscription status
          if (result.isApproved && payment.subscriptionId) {
            await storage.updateSubscription(payment.subscriptionId, {
              status: 'active',
              lastPaymentDate: new Date()
            });
            console.log('[EPX Redirect] Subscription activated:', payment.subscriptionId);
          }
        } else {
          console.warn('[EPX Redirect] Payment record not found for transaction:', TRAN_NBR);
        }
      } catch (dbError: any) {
        console.error('[EPX Redirect] Database update error:', dbError);
        // Continue with redirect even if DB update fails
      }
    }

    // Redirect to appropriate frontend page with proper base URL handling
    const redirectBase = baseUrl.replace(/^https?:\/\/[^\/]+/, ''); // Remove protocol and domain for relative redirects

    if (isApproved) {
      // Redirect to confirmation page instead of payment-success
      const redirectUrl = `${redirectBase}/confirmation?transaction=${TRAN_NBR}&amount=${AUTH_AMOUNT}&status=success`;
      console.log('[EPX Redirect] Redirecting to confirmation page:', redirectUrl);
      res.redirect(redirectUrl);
    } else {
      const redirectUrl = `${redirectBase}/payment-failed?transaction=${TRAN_NBR}&reason=${AUTH_RESP}`;
      console.log('[EPX Redirect] Redirecting to failure page:', redirectUrl);
      res.redirect(redirectUrl);
    }
  } catch (error: any) {
    console.error('[EPX Redirect] Error handling redirect:', error);
    // Define baseUrl for error handling as well
    const baseUrl = 'https://enrollment.getmydpc.com';
    const redirectBase = baseUrl.replace(/^https?:\/\/[^\/]+/, '');
    res.redirect(`${redirectBase}/payment-failed?error=redirect_error`);
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

/**
 * Catch-all debug handler for EPX routes to diagnose redirect issues
 */
router.all('/api/epx/*', (req: Request, res: Response, next: NextFunction) => {
  console.log('[EPX] Catch-all hit:', req.method, req.url);
  console.log('[EPX] Path:', req.path);
  console.log('[EPX] Params:', req.params);
  console.log('[EPX] Query:', req.query);
  console.log('[EPX] Body:', req.body);
  
  // If it's the redirect endpoint, let it pass through to the specific handler
  if (req.path === '/api/epx/redirect' && req.method === 'GET') {
    console.log('[EPX] Redirect route - passing to specific handler');
    next();
    return;
  }
  
  // For other unmatched routes, provide debug info
  console.log('[EPX] Route not specifically matched, available routes:');
  console.log('[EPX] - GET /api/epx/redirect (the one EPX should call)');
  
  res.json({ 
    received: true, 
    method: req.method, 
    url: req.url,
    path: req.path,
    note: 'EPX route debugging - this endpoint caught an unmatched route'
  });
});

// Log available routes when module loads
console.log('[EPX Routes] Registering EPX endpoints:');
console.log('[EPX Routes] - GET /api/epx/health');
console.log('[EPX Routes] - GET /api/epx/browser-post-status');
console.log('[EPX Routes] - GET /api/epx/test-redirect-config');
console.log('[EPX Routes] - GET /api/epx/debug-form-data');
console.log('[EPX Routes] - POST /api/epx/create-payment');
console.log('[EPX Routes] - POST /api/epx/webhook');
console.log('[EPX Routes] - GET /api/epx/webhook');
console.log('[EPX Routes] - GET /api/epx/redirect');
console.log('[EPX Routes] - POST /api/epx/refund');
console.log('[EPX Routes] - POST /api/epx/void');

export default router;