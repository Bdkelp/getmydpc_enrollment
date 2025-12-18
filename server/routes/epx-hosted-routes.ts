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
import { maskAuthGuidValue, parsePaymentMetadata, persistServerPostResult } from '../utils/epx-metadata';
import { getTempRegistration } from '../services/temp-registration-service';

const router = Router();
const certificationLoggingEnabled = process.env.ENABLE_CERTIFICATION_LOGGING !== 'false';

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

type PaymentRecord = ReturnType<typeof storage.getPaymentByTransactionId> extends Promise<infer T> ? T : never;

type HostedCallbackMetadata = {
  status?: string | null;
  amount?: string | number | null;
  message?: string | null;
  authGuidMasked?: string | null;
  updatedAt?: string;
  hasBricToken?: boolean;
} & Record<string, any>;

type HostedPaymentUpdateOptions = {
  epxTransactionId?: string | null;
  fallbackOrderNumber?: string | null;
  authGuid?: string | null;
  authCode?: string | null;
  amount?: number | string | null;
  callbackStatus?: string | null;
  callbackMessage?: string | null;
  memberId?: number | null;
  tempRegistrationId?: string | null;
  bricTokenPresent?: boolean;
  paymentStatus?: string;
}

async function persistHostedPaymentUpdate(options: HostedPaymentUpdateOptions) {
  const {
    epxTransactionId,
    fallbackOrderNumber,
    authGuid,
    authCode,
    amount,
    callbackStatus,
    callbackMessage,
    memberId,
    tempRegistrationId,
    bricTokenPresent,
    paymentStatus = 'succeeded'
  } = options;

  if (!epxTransactionId && !fallbackOrderNumber) {
    return { paymentRecord: null as PaymentRecord | null, maskedAuthGuid: null as string | null };
  }

  let paymentRecord: PaymentRecord | undefined;

  if (epxTransactionId) {
    paymentRecord = await storage.getPaymentByTransactionId(epxTransactionId);
  }

  if (!paymentRecord && fallbackOrderNumber) {
    paymentRecord = await storage.getPaymentByTransactionId(fallbackOrderNumber);
  }

  if (!paymentRecord) {
    logEPX({
      level: 'warn',
      phase: 'callback',
      message: 'Unable to locate payment record for hosted callback',
      data: { epxTransactionId, fallbackOrderNumber }
    });
    return { paymentRecord: null as PaymentRecord | null, maskedAuthGuid: null as string | null };
  }

  const metadataBase = parsePaymentMetadata(paymentRecord.metadata);
  const existingHostedMeta: HostedCallbackMetadata = typeof metadataBase.hostedCallback === 'object' && metadataBase.hostedCallback
    ? { ...metadataBase.hostedCallback }
    : {};

  const maskedAuthGuid = authGuid ? maskAuthGuidValue(authGuid) : (existingHostedMeta.authGuidMasked || null);

  const hostedCallbackMetadata: HostedCallbackMetadata = {
    ...existingHostedMeta,
    status: callbackStatus ?? existingHostedMeta.status ?? null,
    amount: amount ?? existingHostedMeta.amount ?? null,
    message: callbackMessage ?? existingHostedMeta.message ?? null,
    authGuidMasked: maskedAuthGuid,
    updatedAt: new Date().toISOString(),
    hasBricToken: typeof bricTokenPresent === 'boolean'
      ? bricTokenPresent
      : existingHostedMeta.hasBricToken
  };

  const updatedMetadata: Record<string, any> = { ...metadataBase };

  if (!updatedMetadata.orderNumber && (fallbackOrderNumber || paymentRecord.transaction_id)) {
    updatedMetadata.orderNumber = fallbackOrderNumber || paymentRecord.transaction_id;
  }

  if (!updatedMetadata.epxTransactionId && (epxTransactionId || paymentRecord.transaction_id)) {
    updatedMetadata.epxTransactionId = epxTransactionId || paymentRecord.transaction_id;
  }

  if (tempRegistrationId) {
    updatedMetadata.tempRegistrationId = tempRegistrationId;
  }

  updatedMetadata.hostedCallback = hostedCallbackMetadata;

  const normalizedTransactionId = epxTransactionId || paymentRecord.transaction_id || fallbackOrderNumber || null;
  const updatePayload: Record<string, any> = {
    metadata: updatedMetadata,
    status: paymentStatus
  };

  if (authCode) {
    updatePayload.authorizationCode = authCode;
  }

  if (normalizedTransactionId) {
    updatePayload.transactionId = normalizedTransactionId;
  }

  if (typeof memberId === 'number') {
    updatePayload.memberId = memberId;
  }

  if (authGuid) {
    updatePayload.epxAuthGuid = authGuid;
  }

  try {
    await storage.updatePayment(paymentRecord.id, updatePayload);
    logEPX({
      level: 'info',
      phase: 'callback',
      message: 'Payment record updated from hosted callback',
      data: {
        paymentId: paymentRecord.id,
        transactionId: normalizedTransactionId,
        hasAuthGuid: !!authGuid
      }
    });
  } catch (error: any) {
    logEPX({
      level: 'error',
      phase: 'callback',
      message: 'Failed to persist hosted payment update',
      data: {
        error: error?.message,
        paymentId: paymentRecord.id,
        transactionId: normalizedTransactionId
      }
    });
  }

  return { paymentRecord, maskedAuthGuid };
}

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
      captchaToken,
      tempRegistrationId
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
      data: { amount: numericAmount, customerId, customerEmail, planId, hasBillingAddress: !!normalizedBillingAddress, tempRegistrationId }
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
          billingAddress: normalizedBillingAddress || null,
          tempRegistrationId: tempRegistrationId || null
        }
      };

      logEPX({
        level: 'info',
        phase: 'create-payment',
        message: 'Attempting to insert payment row',
        data: {
          transactionId: orderNumber,
          amount: paymentData.amount,
          userId,
          memberId,
          metadataKeys: Object.keys(paymentData.metadata || {})
        }
      });

      const createdPayment = await storage.createPayment(paymentData);

      logEPX({
        level: 'info',
        phase: 'create-payment',
        message: 'Payment record created successfully',
        data: {
          transactionId: orderNumber,
          paymentId: createdPayment?.id,
          status: createdPayment?.status,
          environment: createdPayment?.metadata?.environment || paymentData.metadata?.environment
        }
      });
    } catch (storageError: any) {
      logEPX({
        level: 'error',
        phase: 'create-payment',
        message: 'Storage createPayment failed (non-fatal)',
        data: {
          error: storageError?.message,
          stack: storageError?.stack,
          transactionId: orderNumber
        }
      });
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

    if (certificationLoggingEnabled) {
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
              captchaToken: captchaToken || null,
              tempRegistrationId: tempRegistrationId || null
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
 * Frontend-triggered completion when EPX hosted checkout returns success
 * This replaces the never-fired server callback by running finalize-registration directly.
 */
router.post('/api/epx/hosted/complete', async (req: Request, res: Response) => {
  try {
    const {
      transactionId,
      paymentToken,
      paymentMethodType = 'CreditCard',
      tempRegistrationId,
      registrationData,
      authGuid,
      authCode,
      amount
    } = req.body || {};

    if (!transactionId || !paymentToken) {
      return res.status(400).json({
        success: false,
        error: 'transactionId and paymentToken are required'
      });
    }

    logEPX({
      level: 'info',
      phase: 'hosted-complete',
      message: 'Finalize requested from frontend',
      data: {
        transactionId,
        tempRegistrationId,
        hasRegistration: Boolean(registrationData)
      }
    });

    const persistResult = await persistHostedPaymentUpdate({
      epxTransactionId: transactionId,
      authGuid,
      authCode,
      amount,
      tempRegistrationId,
      bricTokenPresent: true,
      paymentStatus: 'succeeded'
    });

    const finalizePayload = {
      registrationData,
      paymentToken,
      paymentMethodType,
      transactionId,
      tempRegistrationId
    };

    const inferredHost = req.get('host');
    const fallbackBase = inferredHost ? `${req.protocol}://${inferredHost}` : 'http://127.0.0.1';
    const finalizeBaseUrl = process.env.API_BASE_URL || fallbackBase;
    const finalizeUrl = `${finalizeBaseUrl.replace(/\/$/, '')}/api/finalize-registration`;

    const finalizeResponse = await fetch(finalizeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalizePayload)
    });

    const finalizeData = await finalizeResponse.json().catch(() => ({}));

    if (!finalizeResponse.ok) {
      logEPX({
        level: 'error',
        phase: 'hosted-complete',
        message: 'Finalize registration failed via frontend flow',
        data: { transactionId, error: finalizeData }
      });
      return res.status(finalizeResponse.status).json({
        success: false,
        error: finalizeData?.error || finalizeData?.message || 'Failed to finalize registration'
      });
    }

    if (persistResult.paymentRecord && finalizeData?.member?.id) {
      try {
        await storage.updatePayment(persistResult.paymentRecord.id, {
          memberId: finalizeData.member.id
        });
      } catch (updateError: any) {
        logEPX({
          level: 'warn',
          phase: 'hosted-complete',
          message: 'Failed to attach member to payment after frontend finalize',
          data: { paymentId: persistResult.paymentRecord.id, error: updateError?.message }
        });
      }
    }

    return res.json({
      success: true,
      member: finalizeData.member,
      subscription: finalizeData.subscription || null,
      paymentId: persistResult.paymentRecord?.id || null
    });
  } catch (error: any) {
    logEPX({
      level: 'error',
      phase: 'hosted-complete',
      message: 'Unhandled error finalizing hosted payment from frontend',
      data: { error: error?.message }
    });
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to complete hosted payment'
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

    if (certificationLoggingEnabled) {
      try {
        certificationLogger.logCertificationEntry({
          purpose: 'hosted-callback-received',
          transactionId: req.body?.transactionId || req.body?.orderNumber || req.body?.TRANSACTION_ID,
          amount: req.body?.amount ? parseFloat(req.body.amount) : undefined,
          environment: process.env.EPX_ENVIRONMENT || 'sandbox',
          request: {
            timestamp: new Date().toISOString(),
            method: 'POST',
            endpoint: '/api/epx/hosted/callback',
            headers: req.headers as Record<string, any>,
            body: req.body,
            ipAddress: req.ip,
            userAgent: req.get('user-agent') || undefined
          }
        });
      } catch (callbackLogError: any) {
        console.warn('[EPX Hosted Callback] Certification logging failed', callbackLogError.message);
      }
    }

    // Process the callback
    const result = hostedCheckoutService.processCallback(req.body);

    logEPX({
      level: 'info',
      phase: 'callback',
      message: 'Processed EPX callback payload',
      data: {
        transactionId: result.transactionId || req.body?.transactionId || req.body?.orderNumber,
        approved: result.isApproved,
        hasRegistrationData: Boolean(req.body?.registrationData),
        hasBricToken: Boolean(result.bricToken),
        status: req.body?.status,
        amount: req.body?.amount
      }
    });

    const authGuid = result.authGuid || req.body?.AUTH_GUID || req.body?.authGuid || req.body?.result?.AUTH_GUID;
    const epxTransactionId = result.transactionId || req.body?.transactionId || req.body?.TRANSACTION_ID;
    const fallbackOrderNumber = req.body?.orderNumber || req.body?.ORDER_NUMBER || req.body?.invoiceNumber || req.body?.INVOICE_NUMBER;
    let paymentRecordForLogging: PaymentRecord | null = null;
    let maskedAuthGuid: string | null = null;
    let tempRegistrationId: string | null = req.body?.tempRegistrationId || req.body?.TEMP_REGISTRATION_ID || null;

    if (result.isApproved) {
      const persistResult = await persistHostedPaymentUpdate({
        epxTransactionId,
        fallbackOrderNumber,
        authGuid,
        authCode: result.authCode,
        amount: result.amount,
        callbackStatus: req.body?.status || null,
        callbackMessage: req.body?.message || null,
        tempRegistrationId,
        bricTokenPresent: Boolean(result.bricToken),
        paymentStatus: 'succeeded'
      });

      paymentRecordForLogging = persistResult.paymentRecord;
      maskedAuthGuid = persistResult.maskedAuthGuid;
      if (!tempRegistrationId && paymentRecordForLogging?.metadata?.tempRegistrationId) {
        tempRegistrationId = paymentRecordForLogging.metadata.tempRegistrationId;
      }

      if (!authGuid) {
        logEPX({ level: 'warn', phase: 'callback', message: 'Hosted callback missing AUTH_GUID', data: { transactionId: result.transactionId } });
      }
    }

    let registrationData: any = null;
    let registrationDataSource: string | null = null;

    if (req.body.registrationData) {
      try {
        registrationData = typeof req.body.registrationData === 'string'
          ? JSON.parse(req.body.registrationData)
          : req.body.registrationData;
        registrationDataSource = 'callback';
      } catch (registrationParseError) {
        logEPX({ level: 'error', phase: 'callback', message: 'Failed to parse registrationData from callback', data: { error: registrationParseError?.message } });
      }
    }

    if (!registrationData && tempRegistrationId) {
      try {
        const tempRecord = await getTempRegistration(tempRegistrationId);
        if (tempRecord?.registrationData) {
          registrationData = typeof tempRecord.registrationData === 'string'
            ? JSON.parse(tempRecord.registrationData)
            : tempRecord.registrationData;
          registrationDataSource = 'temp-storage';
        }
      } catch (tempError) {
        logEPX({ level: 'error', phase: 'callback', message: 'Failed to load temp registration data', data: { error: tempError?.message, tempRegistrationId } });
      }
    }

    // === PAYMENT-FIRST FLOW ===
    // Payment approved - create member record now
    if (result.isApproved && registrationData && result.bricToken) {
      try {
        logEPX({ level: 'info', phase: 'callback', message: 'Payment approved - creating member', data: { hasBRIC: !!result.bricToken, registrationDataSource } });
        
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
            tempRegistrationId
          })
        });

        if (!finalizeResponse.ok) {
          const errorData = await finalizeResponse.json();
          logEPX({
            level: 'error',
            phase: 'callback',
            message: 'Finalize registration failed',
            data: {
              error: errorData,
              transactionId: result.transactionId
            }
          });
          
          // Return error to EPX
          return res.status(500).json({
            success: false,
            error: errorData.message || 'Failed to create member record'
          });
        }

        const finalizeData = await finalizeResponse.json();
        logEPX({ level: 'info', phase: 'callback', message: 'Member created successfully', data: { memberId: finalizeData.member?.id, transactionId: result.transactionId } });

        if (paymentRecordForLogging && finalizeData.member?.id) {
          try {
            await storage.updatePayment(paymentRecordForLogging.id, {
              memberId: finalizeData.member.id
            });
          } catch (memberUpdateError: any) {
            logEPX({
              level: 'error',
              phase: 'callback',
              message: 'Failed to attach member to payment record',
              data: {
                paymentId: paymentRecordForLogging.id,
                error: memberUpdateError?.message
              }
            });
          }
        }

        // Return success to EPX
        const successPayload = {
          success: true,
          transactionId: result.transactionId,
          authCode: result.authCode,
          amount: result.amount,
          memberId: finalizeData.member?.id,
          customerNumber: finalizeData.member?.customerNumber
        };

        if (certificationLoggingEnabled) {
          certificationLogger.logCertificationEntry({
            purpose: 'hosted-callback-success',
            transactionId: result.transactionId,
            amount: result.amount,
            environment: process.env.EPX_ENVIRONMENT || 'sandbox',
            metadata: {
              hasAuthGuid: !!authGuid,
              paymentId: paymentRecordForLogging?.id,
              memberId: finalizeData.member?.id,
              authGuidMasked: maskedAuthGuid,
              transactionLookup: {
                epxTransactionId,
                fallbackOrderNumber
              }
            },
            request: {
              timestamp: new Date().toISOString(),
              method: 'POST',
              endpoint: '/api/epx/hosted/callback',
              headers: req.headers as Record<string, any>,
              body: req.body,
              ipAddress: req.ip,
              userAgent: req.get('user-agent') || undefined
            },
            response: {
              statusCode: 200,
              headers: { 'content-type': 'application/json' },
              body: successPayload
            }
          });
        }

        return res.json(successPayload);
        
      } catch (finalizeError: any) {
        logEPX({ level: 'error', phase: 'callback', message: 'Member creation failed', data: { error: finalizeError.message } });
        
        return res.status(500).json({
          success: false,
          error: 'Failed to complete registration after payment'
        });
      }
    }

    if (result.isApproved && (!registrationData || !result.bricToken)) {
      logEPX({
        level: 'error',
        phase: 'callback',
        message: 'Missing registration payload or BRIC token after approval',
        data: {
          transactionId: result.transactionId,
          hasRegistrationData: Boolean(registrationData),
          hasBricToken: Boolean(result.bricToken),
          tempRegistrationId,
          registrationDataSource
        }
      });
      return res.status(400).json({
        success: false,
        error: 'Payment approved but registration data missing'
      });
    }

    if (result.isApproved) {
      logEPX({
        level: 'info',
        phase: 'callback',
        message: 'Payment approved without registration payload',
        data: {
          transactionId: result.transactionId,
          hasRegistrationData: Boolean(req.body?.registrationData),
          hasBricToken: Boolean(result.bricToken)
        }
      });

      const successPayload = {
        success: true,
        transactionId: result.transactionId,
        authCode: result.authCode,
        amount: result.amount,
        registrationDataReceived: Boolean(req.body?.registrationData),
        paymentId: paymentRecordForLogging?.id || null,
        memberId: paymentRecordForLogging?.member_id || null
      };

      if (certificationLoggingEnabled) {
        certificationLogger.logCertificationEntry({
          purpose: 'hosted-callback-success-manual',
          transactionId: result.transactionId,
          amount: result.amount,
          environment: process.env.EPX_ENVIRONMENT || 'sandbox',
          metadata: {
            hasAuthGuid: !!authGuid,
            paymentId: paymentRecordForLogging?.id,
            authGuidMasked: maskedAuthGuid,
            registrationDataProvided: Boolean(req.body?.registrationData)
          },
          request: {
            timestamp: new Date().toISOString(),
            method: 'POST',
            endpoint: '/api/epx/hosted/callback',
            headers: req.headers as Record<string, any>,
            body: req.body,
            ipAddress: req.ip,
            userAgent: req.get('user-agent') || undefined
          },
          response: {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: successPayload
          }
        });
      }

      return res.json(successPayload);
    }

    // === PAYMENT DECLINED ===
    if (!result.isApproved) {
      logEPX({ level: 'warn', phase: 'callback', message: 'Payment declined', data: { error: result.error, transactionId: result.transactionId } });
      
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
      
      const declinePayload = {
        success: false,
        error: result.error,
        transactionId: result.transactionId
      };

      if (certificationLoggingEnabled) {
        certificationLogger.logCertificationEntry({
          purpose: 'hosted-callback-declined',
          transactionId: result.transactionId,
          amount: result.amount,
          environment: process.env.EPX_ENVIRONMENT || 'sandbox',
          request: {
            timestamp: new Date().toISOString(),
            method: 'POST',
            endpoint: '/api/epx/hosted/callback',
            headers: req.headers as Record<string, any>,
            body: req.body,
            ipAddress: req.ip,
            userAgent: req.get('user-agent') || undefined
          },
          response: {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: declinePayload
          }
        });
      }

      return res.json(declinePayload);
    }

  } catch (error: any) {
    logEPX({ level: 'error', phase: 'callback', message: 'Unhandled callback exception', data: { error: error?.message } });
    if (certificationLoggingEnabled) {
      certificationLogger.logCertificationEntry({
        purpose: 'hosted-callback-error',
        transactionId: req.body?.transactionId || req.body?.orderNumber,
        environment: process.env.EPX_ENVIRONMENT || 'sandbox',
        request: {
          timestamp: new Date().toISOString(),
          method: 'POST',
          endpoint: '/api/epx/hosted/callback',
          headers: req.headers as Record<string, any>,
          body: req.body,
          ipAddress: req.ip,
          userAgent: req.get('user-agent') || undefined
        },
        response: {
          statusCode: 500,
          headers: { 'content-type': 'application/json' },
          body: { success: false, error: error.message || 'Failed to process callback' }
        },
        metadata: {
          error: error?.message,
          stack: error?.stack
        }
      });
    }
    
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

    if (paymentRecord) {
      await persistServerPostResult({
        paymentRecord,
        tranType: mitResult.requestFields?.TRAN_TYPE || tranType || 'CCE1',
        amount: parsedAmount,
        initiatedBy: req.user.email,
        requestFields: mitResult.requestFields,
        responseFields: mitResult.responseFields,
        transactionReference: mitResult.requestFields?.TRAN_NBR || transactionReference,
        authGuidUsed: resolvedAuthGuid,
        metadataSource: 'admin-test-route'
      });
    }

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

