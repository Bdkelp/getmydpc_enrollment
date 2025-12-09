/**
 * EPX Hosted Checkout Routes
 * Simpler implementation using EPX's hosted payment page
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import path from 'path';
import { EPXHostedCheckoutService, type EPXHostedCheckoutConfig } from '../services/epx-hosted-checkout-service';
import { storage } from '../storage';
import { authenticateToken, type AuthRequest } from '../auth/supabaseAuth';
import { hasAtLeastRole } from '../auth/roles';
import { supabase } from '../lib/supabaseClient';
import { verifyRecaptcha, isRecaptchaEnabled } from '../utils/recaptcha';
import { logEPX, getRecentEPXLogs } from '../services/epx-payment-logger';
import { submitServerPostRecurringPayment } from '../services/epx-payment-service';
import { certificationLogger } from '../services/certification-logger';

const router = Router();

// Initialize Hosted Checkout Service
let hostedCheckoutService: EPXHostedCheckoutService | null = null;
let serviceInitialized = false;
let initError: string | null = null;

// Lazy initialization function
const hostedConfigPaths = [
  process.env.EPX_HOSTED_CONFIG_FILE,
  path.join(process.cwd(), 'server', 'config', 'epx-hosted-config.json'),
  path.join(process.cwd(), 'config', 'epx-hosted-config.json'),
  path.join(process.cwd(), 'epx-hosted-config.json')
].filter((entry): entry is string => Boolean(entry));

type BillingAddress = {
  streetAddress?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

function loadHostedConfig(): EPXHostedCheckoutConfig {
  const envConfig: Partial<EPXHostedCheckoutConfig> = {
    publicKey: process.env.EPX_PUBLIC_KEY || undefined,
    terminalProfileId: process.env.EPX_TERMINAL_PROFILE_ID || undefined,
    environment: (process.env.EPX_ENVIRONMENT === 'production' ? 'production' : 'sandbox')
  };

  if (envConfig.publicKey && envConfig.terminalProfileId) {
    return {
      publicKey: envConfig.publicKey,
      terminalProfileId: envConfig.terminalProfileId,
      environment: envConfig.environment || 'sandbox',
      successCallback: process.env.EPX_HOSTED_SUCCESS_CALLBACK || 'epxSuccessCallback',
      failureCallback: process.env.EPX_HOSTED_FAILURE_CALLBACK || 'epxFailureCallback'
    };
  }

  for (const filePath of hostedConfigPaths) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<EPXHostedCheckoutConfig>;
      if (parsed.publicKey && parsed.terminalProfileId) {
        return {
          publicKey: parsed.publicKey,
          terminalProfileId: parsed.terminalProfileId,
          environment: (parsed.environment === 'production' ? 'production' : 'sandbox'),
          successCallback: parsed.successCallback || 'epxSuccessCallback',
          failureCallback: parsed.failureCallback || 'epxFailureCallback'
        };
      }
    } catch (error) {
      console.warn('[EPX Hosted Checkout] Failed to read config file', filePath, error);
    }
  }

  throw new Error('EPX Hosted Checkout configuration missing. Set EPX_PUBLIC_KEY and EPX_TERMINAL_PROFILE_ID.');
}

function initializeService(force = false) {
  if (!force && serviceInitialized && hostedCheckoutService) {
    return;
  }

  try {
    const config = loadHostedConfig();
    hostedCheckoutService = new EPXHostedCheckoutService(config);
    serviceInitialized = true;
    initError = null;
    console.log('[EPX Hosted Checkout] Service ready in', config.environment, 'mode');
  } catch (error: any) {
    serviceInitialized = false;
    hostedCheckoutService = null;
    initError = error?.message || 'Unknown initialization error';
    console.error('[EPX Hosted Checkout] Initialization failed:', initError);
  }
}

function normalizeBillingAddress(address: any): BillingAddress | undefined {
  if (!address || typeof address !== 'object') {
    return undefined;
  }

  const normalized: BillingAddress = {
    streetAddress: (address.streetAddress || address.address || address.line1 || '').toString().trim() || undefined,
    city: (address.city || '').toString().trim() || undefined,
    state: (address.state || address.region || '').toString().trim() || undefined,
    postalCode: (address.postalCode || address.zip || address.zipCode || '').toString().trim() || undefined,
    country: (address.country || address.countryCode || '').toString().trim() || undefined
  };

  const hasValue = Object.values(normalized).some(Boolean);
  return hasValue ? normalized : undefined;
}

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

    const numericAmount = typeof amount === 'number' ? amount : parseFloat(String(amount));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ success: false, error: 'A valid amount is required' });
    }

    const normalizedBillingAddress = normalizeBillingAddress(billingAddress);

    logEPX({
      level: 'info',
      phase: 'create-payment',
      message: 'Create payment request received',
      data: { amount: numericAmount, customerId, customerEmail, planId, hasBillingAddress: !!normalizedBillingAddress }
    });

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
      numericAmount,
      orderNumber,
      customerEmail,
      customerName || 'Customer',
      normalizedBillingAddress
    );

    if (!sessionResponse.success) {
      logEPX({ level: 'error', phase: 'create-payment', message: 'Session creation failed', data: { error: sessionResponse.error } });
      return res.status(400).json(sessionResponse);
    }

    // Determine whether the customerId refers to a member (numeric) or a staff user (uuid)
    let memberId: number | null = null;
    let userId: string | null = null;

    if (typeof customerId === 'number') {
      memberId = customerId;
    } else if (typeof customerId === 'string') {
      if (/^\d+$/.test(customerId)) {
        memberId = parseInt(customerId, 10);
      } else if (customerId.includes('-')) {
        userId = customerId;
      }
    }

    // Store payment record in pending state
    try {
      const paymentData = {
        memberId,
        userId,
        subscriptionId: subscriptionId || null,
        amount: numericAmount.toString(),
        currency: 'USD',
        status: 'pending' as const,
        paymentMethod: 'card' as const,
        transactionId: orderNumber,
        metadata: {
          planId,
          paymentType: 'hosted-checkout',
          environment: process.env.EPX_ENVIRONMENT || 'sandbox',
          customerEmail,
          description,
          orderNumber,
          originalCustomerId: customerId,
          billingAddress: normalizedBillingAddress || null
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
      captchaMode: config.captchaMode,
      paymentMethod: 'hosted-checkout',
      formData: {
        amount: numericAmount.toFixed(2),
        orderNumber,
        invoiceNumber: orderNumber,
        email: customerEmail,
        billingName: customerName || 'Customer',
        ...(normalizedBillingAddress || {})
      }
    };

    // Log the payload we send to frontend (which frontend will use to call EPX)
    console.log(
      '[EPX Hosted Checkout - REQUEST TO FRONTEND]',
      JSON.stringify({
        transactionId: orderNumber,
        amount: numericAmount.toFixed(2),
        email: customerEmail,
        billingName: customerName || 'Customer',
        publicKey: sessionResponse.publicKey,
        environment: config.environment,
        billingAddress: normalizedBillingAddress
      }, null, 2)
    );

    logEPX({ level: 'info', phase: 'create-payment', message: 'Create payment response ready', data: { transactionId: orderNumber, hasBillingAddress: !!normalizedBillingAddress } });

    if (process.env.ENABLE_CERTIFICATION_LOGGING === 'true') {
      try {
        certificationLogger.logCertificationEntry({
          transactionId: orderNumber,
          customerId: (memberId && String(memberId)) || userId || (customerId ? String(customerId) : undefined),
          amount: numericAmount,
          environment: process.env.EPX_ENVIRONMENT || 'sandbox',
          purpose: 'hosted-checkout-create-payment',
          request: {
            timestamp: new Date(requestStartTime).toISOString(),
            method: 'POST',
            endpoint: '/api/epx/hosted/create-payment',
            url: `${req.protocol}://${req.get('host')}/api/epx/hosted/create-payment`,
            headers: {
              'content-type': req.get('content-type') || 'application/json',
              'user-agent': req.get('user-agent') || 'unknown'
            },
            body: {
              amount: numericAmount,
              customerId,
              customerEmail,
              customerName,
              planId,
              subscriptionId,
              description,
              billingAddress: normalizedBillingAddress,
              captchaToken: captchaToken || null
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent') || undefined
          },
          response: {
            statusCode: 200,
            headers: {
              'content-type': 'application/json'
            },
            body: responsePayload,
            processingTimeMs: Date.now() - requestStartTime
          },
          metadata: {
            billingAddressPresent: !!normalizedBillingAddress,
            paymentMethod: 'hosted-checkout'
          }
        });
      } catch (certError: any) {
        logEPX({ level: 'warn', phase: 'create-payment', message: 'Certification logging failed', data: { error: certError.message } });
      }
    }

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

        // Persist EPX auth GUID + authorization details on payment record for future Server Post use
        const authGuid = result.authGuid || req.body?.AUTH_GUID || req.body?.authGuid || req.body?.result?.AUTH_GUID;
        if (!authGuid) {
          logEPX({ level: 'warn', phase: 'callback', message: 'Hosted callback missing AUTH_GUID', data: { transactionId: result.transactionId } });
        }
        const epxTransactionId = result.transactionId || req.body?.transactionId || req.body?.TRANSACTION_ID;
        const fallbackOrderNumber = req.body?.orderNumber || req.body?.ORDER_NUMBER || req.body?.invoiceNumber || req.body?.INVOICE_NUMBER;

        if (epxTransactionId || fallbackOrderNumber) {
          try {
            let paymentRecord = epxTransactionId
              ? await storage.getPaymentByTransactionId(epxTransactionId)
              : undefined;

            if (!paymentRecord && fallbackOrderNumber) {
              paymentRecord = await storage.getPaymentByTransactionId(fallbackOrderNumber);
            }

            if (paymentRecord) {
              const finalizedMemberId = finalizeData.member?.id ?? paymentRecord.member_id ?? null;
              const metadataBase = (typeof paymentRecord.metadata === 'object' && paymentRecord.metadata)
                ? paymentRecord.metadata as Record<string, any>
                : {};
              const updatedMetadata = {
                ...metadataBase,
                orderNumber: metadataBase.orderNumber || fallbackOrderNumber || paymentRecord.transaction_id || null,
                epxTransactionId: epxTransactionId || metadataBase.epxTransactionId || null,
                hostedCallback: {
                  status: req.body?.status,
                  amount: req.body?.amount,
                  message: req.body?.message,
                  authGuidMasked: authGuid ? `${authGuid.slice(0, 4)}***${authGuid.slice(-4)}` : undefined,
                }
              };

              await storage.updatePayment(paymentRecord.id, {
                status: 'succeeded',
                authorizationCode: result.authCode,
                transactionId: epxTransactionId || paymentRecord.transaction_id || fallbackOrderNumber || null,
                metadata: updatedMetadata,
                memberId: finalizedMemberId,
                epxAuthGuid: authGuid || paymentRecord.epxAuthGuid || null,
              });

              logEPX({
                level: 'info',
                phase: 'callback',
                message: 'Payment record updated with EPX auth GUID',
                data: {
                  paymentId: paymentRecord.id,
                  epxTransactionId,
                  fallbackOrderNumber,
                  hasAuthGuid: !!authGuid,
                }
              });
            } else {
              logEPX({
                level: 'warn',
                phase: 'callback',
                message: 'Payment record not found for transaction ID',
                data: { epxTransactionId, fallbackOrderNumber }
              });
            }
          } catch (paymentUpdateError: any) {
            logEPX({
              level: 'error',
              phase: 'callback',
              message: 'Failed to update payment record with auth GUID',
              data: { epxTransactionId, fallbackOrderNumber, error: paymentUpdateError.message }
            });
          }
        }

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
 * Submits a Manual/Recurring MIT transaction via Server Post (despite the legacy route name)
 * Use this to generate certification samples for EPX
 */
router.post('/api/epx/test-recurring', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !hasAtLeastRole(req.user.role, 'admin')) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const {
      memberId,
      transactionId,
      amount,
      description,
      aciExt,
      cardEntryMethod,
      industryType,
      tranType,
      authGuid
    } = req.body || {};

    logEPX({
      level: 'info',
      phase: 'certification',
      message: 'Server Post admin test invoked',
      data: {
        userId: req.user.id,
        memberId,
        transactionId,
        aciExt: aciExt || 'RB'
      }
    });

    if (!memberId && !transactionId) {
      return res.status(400).json({
        success: false,
        error: 'Provide either memberId or transactionId to locate an EPX auth GUID'
      });
    }

    let paymentRecord = transactionId
      ? await storage.getPaymentByTransactionId(transactionId)
      : undefined;

    const providedAuthGuid = typeof authGuid === 'string' && authGuid.trim().length > 0
      ? authGuid.trim()
      : undefined;

    const resolvedMemberId = memberId || paymentRecord?.member_id;

    if (!paymentRecord && resolvedMemberId) {
      paymentRecord = await storage.getLatestPaymentWithAuthGuid(Number(resolvedMemberId));
    }

    if (!paymentRecord && !providedAuthGuid) {
      return res.status(404).json({ success: false, error: 'Unable to find payment with stored EPX auth GUID. Provide a transaction/member linked to a completed payment or paste the AUTH_GUID manually.' });
    }

    const resolvedAuthGuid = providedAuthGuid || paymentRecord?.epx_auth_guid;

    if (!resolvedAuthGuid) {
      return res.status(400).json({ success: false, error: 'No EPX AUTH GUID available. Paste it manually or select a payment that captured it.' });
    }

    const memberRecord = paymentRecord?.member_id
      ? await storage.getMember(Number(paymentRecord.member_id))
      : resolvedMemberId
        ? await storage.getMember(Number(resolvedMemberId))
        : undefined;

    const parsedAmount = typeof amount === 'number'
      ? amount
      : amount
        ? parseFloat(String(amount))
        : paymentRecord?.amount
          ? parseFloat(String(paymentRecord.amount))
          : NaN;

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid amount supplied for Server Post test' });
    }

    const transactionReference = paymentRecord?.transaction_id || transactionId || null;

    const mitResult = await submitServerPostRecurringPayment({
      amount: parsedAmount,
      authGuid: resolvedAuthGuid,
      transactionId: transactionReference,
      member: memberRecord ? (memberRecord as unknown as Record<string, any>) : undefined,
      description: description || `Admin test by ${req.user.email}`,
      aciExt,
      cardEntryMethod,
      industryType,
      tranType,
      metadata: {
        initiatedBy: req.user.email,
        paymentId: paymentRecord?.id,
        source: 'admin-test-route'
      }
    });

    const maskedGuid = resolvedAuthGuid.length > 8
      ? `${resolvedAuthGuid.slice(0, 4)}****${resolvedAuthGuid.slice(-4)}`
      : '********';

    res.status(mitResult.success ? 200 : 502).json({
      success: mitResult.success,
      message: mitResult.success
        ? 'Server Post MIT transaction submitted. Check logs for certification samples.'
        : mitResult.error || 'Server Post MIT transaction failed.',
      payment: paymentRecord ? {
        id: paymentRecord.id,
        transactionId: paymentRecord.transaction_id,
        authGuid: maskedGuid,
        memberId: paymentRecord.member_id,
        amount: paymentRecord.amount
      } : undefined,
      transactionReference,
      authGuidSource: providedAuthGuid ? 'manual' : 'payment-record',
      request: {
        fields: mitResult.requestFields,
        payload: mitResult.requestPayload
      },
      response: {
        fields: mitResult.responseFields,
        raw: mitResult.rawResponse
      },
      error: mitResult.error
    });
  } catch (error: any) {
    logEPX({
      level: 'error',
      phase: 'certification',
      message: 'Server Post admin test failed',
      data: { error: error.message, stack: error.stack }
    });

    res.status(500).json({
      success: false,
      error: error.message || 'Server Post test failed',
      message: 'Check server logs for details'
    });
  }
});

export default router;

