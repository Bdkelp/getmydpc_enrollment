/**
 * EPX Hosted Checkout Routes
 * Simpler implementation using EPX's hosted payment page
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { EPXHostedCheckoutService, type EPXHostedCheckoutConfig } from '../services/epx-hosted-checkout-service';
import { storage } from '../storage';
import { authenticateToken, type AuthRequest } from '../auth/supabaseAuth';
import { isAtLeastAdmin } from '../auth/roles';
import { supabase } from '../lib/supabaseClient';
import { verifyRecaptcha, isRecaptchaEnabled } from '../utils/recaptcha';
import { logEPX, getRecentEPXLogs } from '../services/epx-payment-logger';
import { submitServerPostRecurringPayment } from '../services/epx-payment-service';
import { certificationLogger } from '../services/certification-logger';
import { maskAuthGuidValue, parsePaymentMetadata, persistServerPostResult } from '../utils/epx-metadata';
import { paymentEnvironment } from '../services/payment-environment-service';
import { sendEnrollmentNotification, sendPaymentNotification } from '../utils/notifications';
import { calculateCommission, RX_VALET_COMMISSION } from '../commissionCalculator';

const router = Router();
const certificationLoggingEnabled = process.env.ENABLE_CERTIFICATION_LOGGING !== 'false';

// Initialize Hosted Checkout Service
let hostedCheckoutService: EPXHostedCheckoutService | null = null;
let serviceInitialized = false;
let initError: string | null = null;
let hostedConfigSource = 'uninitialized';

// Lazy initialization function - always use production config
const hostedConfigPaths = [
  process.env.EPX_HOSTED_CONFIG_FILE,
  path.join(process.cwd(), 'server', 'config', 'epx-hosted-config.production.json'),
  path.join(process.cwd(), 'config', 'epx-hosted-config.production.json'),
  path.join(process.cwd(), 'epx-hosted-config.production.json')
].filter((entry): entry is string => Boolean(entry));

const fingerprintPublicKey = (publicKey?: string | null): string | null => {
  if (!publicKey) {
    return null;
  }

  try {
    return createHash('sha256').update(publicKey).digest('hex').slice(0, 12);
  } catch (error) {
    console.warn('[EPX Hosted Checkout] Failed to fingerprint public key:', (error as Error)?.message);
    return null;
  }
};

const deriveTerminalProfileId = (publicKey?: string | null): string | undefined => {
  if (!publicKey) {
    return undefined;
  }

  try {
    const decoded = Buffer.from(publicKey, 'base64').toString('utf8').trim();
    const parsed = JSON.parse(decoded);

    if (parsed && typeof parsed === 'object') {
      if (typeof (parsed as Record<string, any>).terminalProfileId === 'string') {
        return (parsed as Record<string, any>).terminalProfileId.trim() || undefined;
      }

      for (const [key, value] of Object.entries(parsed as Record<string, any>)) {
        if (typeof value === 'string' && key.replace(/\s+/g, '') === 'terminalProfileId') {
          return value.trim() || undefined;
        }
      }
    }

    return undefined;
  } catch (error) {
    console.warn('[EPX Hosted Checkout] Unable to derive terminalProfileId from public key:', (error as Error)?.message);
    return undefined;
  }
};

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
  tranType?: string | null;
  paymentMethodType?: string | null;
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
  bricTokenPresent?: boolean;
  paymentStatus?: string;
  tranType?: string | null;
  paymentMethodType?: string | null;
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
    bricTokenPresent,
    paymentStatus = 'succeeded',
    tranType,
    paymentMethodType
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
      : existingHostedMeta.hasBricToken,
    tranType: tranType || existingHostedMeta.tranType || null,
    paymentMethodType: paymentMethodType || existingHostedMeta.paymentMethodType || null
  };

  const updatedMetadata: Record<string, any> = { ...metadataBase };

  if (!updatedMetadata.orderNumber && (fallbackOrderNumber || paymentRecord.transaction_id)) {
    updatedMetadata.orderNumber = fallbackOrderNumber || paymentRecord.transaction_id;
  }

  if (!updatedMetadata.epxTransactionId && (epxTransactionId || paymentRecord.transaction_id)) {
    updatedMetadata.epxTransactionId = epxTransactionId || paymentRecord.transaction_id;
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

function loadHostedConfig(): { config: EPXHostedCheckoutConfig; source: string } {
  const cachedEnvironment = paymentEnvironment.getCachedEnvironment();
  const envConfig: Partial<EPXHostedCheckoutConfig> = {
    publicKey: process.env.EPX_PUBLIC_KEY || undefined,
    terminalProfileId: process.env.EPX_TERMINAL_PROFILE_ID || undefined,
    environment: cachedEnvironment
  };

  if (envConfig.publicKey && !envConfig.terminalProfileId) {
    const derivedTerminalProfileId = deriveTerminalProfileId(envConfig.publicKey);
    if (derivedTerminalProfileId) {
      envConfig.terminalProfileId = derivedTerminalProfileId;
      console.log('[EPX Hosted Checkout] Derived terminalProfileId from environment public key');
    } else {
      console.warn('[EPX Hosted Checkout] EPX_TERMINAL_PROFILE_ID missing and unable to derive from public key');
    }
  }

  if (envConfig.publicKey && envConfig.terminalProfileId) {
    const config: EPXHostedCheckoutConfig = {
      publicKey: envConfig.publicKey,
      terminalProfileId: envConfig.terminalProfileId,
      environment: envConfig.environment || cachedEnvironment,
      successCallback: process.env.EPX_HOSTED_SUCCESS_CALLBACK || 'epxSuccessCallback',
      failureCallback: process.env.EPX_HOSTED_FAILURE_CALLBACK || 'epxFailureCallback'
    };

    return { config, source: 'environment variables' };
  }

  for (const filePath of hostedConfigPaths) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<EPXHostedCheckoutConfig>;
      const filePublicKey = parsed.publicKey;
      let fileTerminalProfileId = parsed.terminalProfileId;

      if (filePublicKey && !fileTerminalProfileId) {
        const derivedTerminalProfileId = deriveTerminalProfileId(filePublicKey);
        if (derivedTerminalProfileId) {
          fileTerminalProfileId = derivedTerminalProfileId;
          console.log('[EPX Hosted Checkout] Derived terminalProfileId from file public key:', filePath);
        } else {
          console.warn('[EPX Hosted Checkout] terminalProfileId missing in file and unable to derive:', filePath);
        }
      }

      if (filePublicKey && fileTerminalProfileId) {
        const config: EPXHostedCheckoutConfig = {
          publicKey: filePublicKey,
          terminalProfileId: fileTerminalProfileId,
          environment: cachedEnvironment,
          successCallback: parsed.successCallback || 'epxSuccessCallback',
          failureCallback: parsed.failureCallback || 'epxFailureCallback'
        };

        return { config, source: `file:${filePath}` };
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
    const { config, source } = loadHostedConfig();
    hostedCheckoutService = new EPXHostedCheckoutService(config);
    serviceInitialized = true;
    initError = null;
    hostedConfigSource = source;
    console.log('[EPX Hosted Checkout] Service ready in', config.environment, 'mode', {
      configSource: source,
      terminalProfileId: config.terminalProfileId,
      publicKeyFingerprint: fingerprintPublicKey(config.publicKey)
    });
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

async function resolveRequestUser(req: AuthRequest): Promise<any | null> {
  if (req.user) {
    return req.user;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return null;
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user?.email) {
      return null;
    }

    const dbUser = await storage.getUserByEmail(user.email);
    if (!dbUser || dbUser.approvalStatus === 'pending' || dbUser.approvalStatus === 'rejected' || dbUser.isActive === false) {
      return null;
    }

    const resolvedUser = { ...dbUser, supabaseUserId: user.id };
    req.user = resolvedUser;
    req.token = token;
    return resolvedUser;
  } catch (error: any) {
    console.warn('[EPX Hosted Checkout] Optional auth resolution failed', error?.message || error);
    return null;
  }
}

/**
 * Create payment session for Hosted Checkout
 */
router.post('/api/epx/hosted/create-payment', async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const requestStartTime = Date.now();

  try {
    const currentEnvironment = await paymentEnvironment.getEnvironment();
    const authenticatedUser = await resolveRequestUser(authReq);
    initializeService();

    if (hostedCheckoutService) {
      const activeConfig = hostedCheckoutService.getCheckoutConfig();
      if (activeConfig.environment !== currentEnvironment) {
        console.log('[EPX Hosted Checkout] Environment mismatch detected. Reinitializing service.');
        initializeService(true);
      }
    }

    if (!serviceInitialized || !hostedCheckoutService) {
      return res.status(503).json({
        success: false,
        error: initError || 'Hosted Checkout service not initialized',
        configSource: hostedConfigSource
      });
    }

    const {
      amount,
      amountOverride,
      amountOverrideReason,
      customerId,
      customerEmail,
      customerName,
      planId,
      subscriptionId,
      description,
      billingAddress,
      captchaToken,
      retryPaymentId,
      retryMemberId,
      retryReason,
      retryInitiatedBy
    } = req.body;

    const numericAmount = typeof amount === 'number'
      ? amount
      : amount !== undefined && amount !== null
        ? parseFloat(String(amount))
        : NaN;

    const parsedAmountOverride = typeof amountOverride === 'number'
      ? amountOverride
      : amountOverride !== undefined && amountOverride !== null
        ? parseFloat(String(amountOverride))
        : NaN;

    const hasAmountOverride = Number.isFinite(parsedAmountOverride) && parsedAmountOverride > 0;
    const normalizedAmountOverrideReason = typeof amountOverrideReason === 'string'
      ? amountOverrideReason.trim() || null
      : null;

    if (!Number.isNaN(parsedAmountOverride) && !hasAmountOverride) {
      return res.status(400).json({ success: false, error: 'Amount override must be a positive number' });
    }

    const normalizedBillingAddress = normalizeBillingAddress(billingAddress);

    const parsedRetryPaymentId = typeof retryPaymentId === 'string'
      ? parseInt(retryPaymentId, 10)
      : retryPaymentId;

    const parsedRetryMemberId = typeof retryMemberId === 'string'
      ? parseInt(retryMemberId, 10)
      : retryMemberId;

    const isRetryRequest = Number.isFinite(parsedRetryPaymentId);
    const requestUserId = authenticatedUser?.id || null;

    let effectiveAmount = Number.isFinite(numericAmount) ? numericAmount : NaN;
    let effectiveCustomerEmail: string | undefined = customerEmail;
    let effectiveCustomerName: string | undefined = customerName || 'Customer';
    let effectivePlanId: string | undefined = planId;
    let effectiveDescription: string | undefined = description;
    let effectiveBillingAddress = normalizedBillingAddress;
    let derivedMemberId: number | null = null;
    let derivedUserId: string | null = null;
    let overrideApprovedBy: any = null;
    let retryContext: {
      originalPaymentId: number;
      attemptNumber: number;
      triggeredByUserId?: string | null;
      timestamp: string;
      reason?: string | null;
    } | null = null;
    let retrySourceMetadata: Record<string, any> | null = null;

    if (hasAmountOverride) {
      overrideApprovedBy = authenticatedUser;
      if (!overrideApprovedBy) {
        overrideApprovedBy = await resolveRequestUser(authReq);
      }

      if (!overrideApprovedBy || !isAtLeastAdmin(overrideApprovedBy.role)) {
        return res.status(403).json({ success: false, error: 'Amount override requires admin access' });
      }

      effectiveAmount = parsedAmountOverride!;
      if (!derivedUserId && typeof overrideApprovedBy.id === 'string') {
        derivedUserId = overrideApprovedBy.id;
      }
    }

    if (isRetryRequest) {
      const originalPayment = await storage.getPaymentById(parsedRetryPaymentId!);
      if (!originalPayment) {
        return res.status(404).json({ success: false, error: 'Original payment not found' });
      }

      retrySourceMetadata = parsePaymentMetadata(originalPayment.metadata);
      const retryHistory = Array.isArray(retrySourceMetadata.retryHistory)
        ? [...retrySourceMetadata.retryHistory]
        : [];
      const attemptNumber = retryHistory.length + 1;
      const authUserId = requestUserId || undefined;

      const paymentAmount = originalPayment.amount ? parseFloat(originalPayment.amount) : NaN;
      const metadataAmount = retrySourceMetadata.amount ? parseFloat(String(retrySourceMetadata.amount)) : NaN;
      if (!Number.isFinite(effectiveAmount) || effectiveAmount <= 0) {
        const derivedAmount = Number.isFinite(paymentAmount) && paymentAmount > 0
          ? paymentAmount
          : (Number.isFinite(metadataAmount) && metadataAmount > 0 ? metadataAmount : NaN);
        effectiveAmount = derivedAmount;
      }

      const resolvedMemberId = parsedRetryMemberId
        || (typeof originalPayment.member_id === 'number' ? originalPayment.member_id
          : originalPayment.member_id ? parseInt(String(originalPayment.member_id), 10) : undefined)
        || (typeof retrySourceMetadata.memberId === 'number' ? retrySourceMetadata.memberId : undefined);

      if (Number.isFinite(resolvedMemberId as number)) {
        derivedMemberId = Number(resolvedMemberId);
      }

      const memberRecord = derivedMemberId ? await storage.getMember(derivedMemberId) : null;
      const memberRecordData = memberRecord ? (memberRecord as Record<string, any>) : null;

      const metadataEmail = retrySourceMetadata.customerEmail || retrySourceMetadata.customer_email;
      if (!effectiveCustomerEmail) {
        effectiveCustomerEmail = metadataEmail || memberRecordData?.email || undefined;
      }

      const metadataName = retrySourceMetadata.customerName || retrySourceMetadata.customer_name;
      if ((!customerName || !customerName.trim()) && metadataName) {
        effectiveCustomerName = metadataName;
      } else if ((!customerName || !customerName.trim()) && memberRecordData) {
        const combinedName = [memberRecordData.first_name || memberRecordData.firstName, memberRecordData.last_name || memberRecordData.lastName]
          .filter(Boolean)
          .join(' ')
          .trim();
        if (combinedName) {
          effectiveCustomerName = combinedName;
        }
      }

      if (!effectivePlanId && memberRecordData?.plan_id) {
        effectivePlanId = String(memberRecordData.plan_id);
      } else if (!effectivePlanId && retrySourceMetadata.planId) {
        effectivePlanId = String(retrySourceMetadata.planId);
      }

      if (!effectiveDescription) {
        effectiveDescription = retrySourceMetadata.description || `Retry of payment ${originalPayment.id}`;
      }

      if (!effectiveBillingAddress) {
        const metadataAddress = normalizeBillingAddress(retrySourceMetadata.billingAddress);
        if (metadataAddress) {
          effectiveBillingAddress = metadataAddress;
        } else if (memberRecordData) {
          effectiveBillingAddress = normalizeBillingAddress({
            streetAddress: memberRecordData.address,
            city: memberRecordData.city,
            state: memberRecordData.state,
            postalCode: memberRecordData.zip_code
          });
        }
      }

      retryContext = {
        originalPaymentId: originalPayment.id,
        attemptNumber,
        triggeredByUserId: retryInitiatedBy || authUserId || null,
        timestamp: new Date().toISOString(),
        reason: retryReason || null
      };

      logEPX({
        level: 'info',
        phase: 'retry-payment',
        message: 'Retry hosted checkout session requested',
        data: {
          originalPaymentId: originalPayment.id,
          attemptNumber,
          memberId: derivedMemberId,
          triggeredBy: retryContext.triggeredByUserId || 'unknown'
        }
      });
    }

    if (!isRetryRequest && (!Number.isFinite(effectiveAmount) || effectiveAmount <= 0)) {
      return res.status(400).json({ success: false, error: 'A valid amount is required' });
    }

    if (isRetryRequest && (!Number.isFinite(effectiveAmount) || effectiveAmount <= 0)) {
      return res.status(400).json({ success: false, error: 'Unable to resolve amount for retry payment' });
    }

    if (!effectiveCustomerEmail) {
      return res.status(400).json({ success: false, error: 'Unable to resolve customer email for payment' });
    }

    logEPX({
      level: 'info',
      phase: 'create-payment',
      message: 'Create payment request received',
      data: {
        requestedAmount: numericAmount,
        effectiveAmount,
        customerId,
        customerEmail: effectiveCustomerEmail,
        planId: effectivePlanId,
        hasBillingAddress: !!effectiveBillingAddress,
        isRetryRequest,
        retryPaymentId: parsedRetryPaymentId || null,
        amountOverride: hasAmountOverride ? parsedAmountOverride : null,
        overrideRequestedBy: overrideApprovedBy?.id || requestUserId || null
      }
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
      effectiveAmount,
      orderNumber,
      effectiveCustomerEmail,
      effectiveCustomerName || 'Customer',
      effectiveBillingAddress
    );

    if (!sessionResponse.success) {
      logEPX({ level: 'error', phase: 'create-payment', message: 'Session creation failed', data: { error: sessionResponse.error } });
      return res.status(400).json(sessionResponse);
    }

    // Determine whether the customerId refers to a member (numeric) or a staff user (uuid)
    let memberId: number | null = derivedMemberId;
    let userId: string | null = derivedUserId;

    if (!memberId) {
      if (typeof customerId === 'number') {
        memberId = customerId;
      } else if (typeof customerId === 'string') {
        if (/^\d+$/.test(customerId)) {
          memberId = parseInt(customerId, 10);
        } else if (customerId.includes('-')) {
          userId = customerId;
        }
      }
    }

    // Store payment record in pending state
    try {
      const paymentMetadata: Record<string, any> = {
        planId: effectivePlanId,
        paymentType: 'hosted-checkout',
        environment: currentEnvironment,
        customerEmail: effectiveCustomerEmail,
        customerName: effectiveCustomerName,
        description: effectiveDescription,
        orderNumber,
        originalCustomerId: customerId,
        billingAddress: effectiveBillingAddress || null,
        requestedAmount: Number.isFinite(numericAmount) ? numericAmount : null
      };

      if (hasAmountOverride) {
        paymentMetadata.amountOverride = {
          amount: parsedAmountOverride,
          approvedByUserId: overrideApprovedBy?.id || null,
          approvedByEmail: overrideApprovedBy?.email || null,
          approvedByRole: overrideApprovedBy?.role || null,
          reason: normalizedAmountOverrideReason,
          requestedAt: new Date().toISOString()
        };
        paymentMetadata.testPayment = true;
      }

      if (retryContext) {
        paymentMetadata.retryContext = retryContext;
        paymentMetadata.retrySourcePaymentId = retryContext.originalPaymentId;
        paymentMetadata.retryAttemptNumber = retryContext.attemptNumber;
        paymentMetadata.retryReason = retryContext.reason;
        paymentMetadata.retryInitiatedBy = retryContext.triggeredByUserId || null;
      }

      if (retrySourceMetadata) {
        paymentMetadata.retrySourceMetadata = retrySourceMetadata;
      }

      const paymentData = {
        memberId,
        userId,
        subscriptionId: subscriptionId || null,
        amount: effectiveAmount.toString(),
        currency: 'USD',
        status: 'pending' as const,
        paymentMethod: 'card' as const,
        transactionId: orderNumber,
        metadata: paymentMetadata
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
      terminalProfileId: config.terminalProfileId,
      environment: config.environment,
      captchaMode: config.captchaMode,
      paymentMethod: 'hosted-checkout',
      retryContext: retryContext || undefined,
      overrideApplied: hasAmountOverride || undefined,
      overrideAmount: hasAmountOverride ? effectiveAmount : undefined,
      requestedAmount: Number.isFinite(numericAmount) ? numericAmount : undefined,
      testPayment: hasAmountOverride || undefined,
      formData: {
        amount: effectiveAmount.toFixed(2),
        orderNumber,
        invoiceNumber: orderNumber,
        email: effectiveCustomerEmail,
        billingName: effectiveCustomerName || 'Customer',
        ...(effectiveBillingAddress || {})
      }
    };

    // Log the payload we send to frontend (which frontend will use to call EPX)
    console.log(
      '[EPX Hosted Checkout - REQUEST TO FRONTEND]',
      JSON.stringify({
        transactionId: orderNumber,
        amount: effectiveAmount.toFixed(2),
        email: effectiveCustomerEmail,
        billingName: effectiveCustomerName || 'Customer',
        publicKey: sessionResponse.publicKey,
        environment: config.environment,
        billingAddress: effectiveBillingAddress
      }, null, 2)
    );

    logEPX({ level: 'info', phase: 'create-payment', message: 'Create payment response ready', data: { transactionId: orderNumber, hasBillingAddress: !!effectiveBillingAddress, retry: !!retryContext, testPayment: hasAmountOverride } });

    if (certificationLoggingEnabled) {
      try {
        certificationLogger.logCertificationEntry({
          transactionId: orderNumber,
          customerId: (memberId && String(memberId)) || userId || (customerId ? String(customerId) : undefined),
          amount: effectiveAmount,
          environment: currentEnvironment,
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
              effectiveAmount,
              customerId,
              customerEmail,
              effectiveCustomerEmail,
              customerName,
              effectiveCustomerName,
              planId,
              subscriptionId,
              description,
              effectiveDescription,
              billingAddress: normalizedBillingAddress,
              effectiveBillingAddress,
              captchaToken: captchaToken || null,
              retryPaymentId: parsedRetryPaymentId || null,
              retryMemberId: parsedRetryMemberId || null,
              retryContext,
              retryReason: retryContext?.reason || retryReason || null,
              amountOverride: hasAmountOverride ? parsedAmountOverride : null,
              amountOverrideReason: normalizedAmountOverrideReason,
              overrideApprovedBy: overrideApprovedBy?.id || null
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
            billingAddressPresent: !!effectiveBillingAddress,
            paymentMethod: 'hosted-checkout',
            retryAttemptNumber: retryContext?.attemptNumber || null,
            testPayment: hasAmountOverride || null
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
 * Frontend-triggered completion when EPX hosted checkout returns success.
 * Registration already created the member, so this endpoint simply attaches the
 * payment token, marks the payment as succeeded, and activates the member/subscription.
 */
router.post('/api/epx/hosted/complete', async (req: Request, res: Response) => {
  try {
    const {
      transactionId,
      paymentToken,
      paymentMethodType = 'CreditCard',
      memberId,
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
      message: 'Recording hosted checkout completion',
      data: { transactionId, providedMemberId: memberId || 'will lookup from payment' }
    });

    // Look up payment record to find the member
    const paymentRecord = await storage.getPaymentByTransactionId(transactionId);
    if (!paymentRecord) {
      return res.status(404).json({
        success: false,
        error: 'Payment record not found for transaction'
      });
    }

    // Use memberId from payment record if not provided
    let numericMemberId = memberId;
    if (!numericMemberId && paymentRecord.member_id) {
      numericMemberId = paymentRecord.member_id;
      logEPX({
        level: 'info',
        phase: 'hosted-complete',
        message: 'Retrieved memberId from payment record',
        data: { transactionId, memberId: numericMemberId }
      });
    }

    if (!numericMemberId) {
      return res.status(400).json({
        success: false,
        error: 'Unable to determine member for this payment'
      });
    }

    if (typeof numericMemberId === 'string') {
      numericMemberId = parseInt(numericMemberId, 10);
    }

    if (!Number.isFinite(numericMemberId) || numericMemberId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid memberId' });
    }

    logEPX({
      level: 'info',
      phase: 'hosted-complete',
      message: 'Finalizing payment for member',
      data: { transactionId, memberId: numericMemberId }
    });

    const persistResult = await persistHostedPaymentUpdate({
      epxTransactionId: transactionId,
      authGuid,
      authCode,
      amount,
      memberId: numericMemberId,
      bricTokenPresent: true,
      paymentStatus: 'succeeded',
      tranType: 'CCE1',
      paymentMethodType
    });

    let updatedMember: any = null;

    try {
      updatedMember = await storage.updateMember(numericMemberId, {
        paymentToken,
        paymentMethodType,
        status: 'active',
        isActive: true,
        firstPaymentDate: new Date().toISOString()
      });
    } catch (memberUpdateError: any) {
      logEPX({
        level: 'error',
        phase: 'hosted-complete',
        message: 'Failed to update member with payment token',
        data: { error: memberUpdateError?.message, memberId: numericMemberId }
      });
    }

    if (persistResult.paymentRecord?.id) {
      try {
        await storage.updatePayment(persistResult.paymentRecord.id, {
          memberId: numericMemberId
        });
      } catch (updateError: any) {
        logEPX({
          level: 'warn',
          phase: 'hosted-complete',
          message: 'Unable to attach member to payment record',
          data: { error: updateError?.message, paymentId: persistResult.paymentRecord.id }
        });
      }
    }

    if (persistResult.paymentRecord?.subscription_id) {
      try {
        await storage.updateSubscription(Number(persistResult.paymentRecord.subscription_id), {
          status: 'active',
          nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        });
      } catch (subscriptionError: any) {
        logEPX({
          level: 'warn',
          phase: 'hosted-complete',
          message: 'Failed to activate subscription after payment',
          data: {
            error: subscriptionError?.message,
            subscriptionId: persistResult.paymentRecord?.subscription_id
          }
        });
      }
    }

    return res.json({
      success: true,
      member: updatedMember,
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
 * Frontend-triggered failure recording when EPX hosted checkout fails.
 * This endpoint logs payment decline/failure from the client-side EPX modal.
 */
router.post('/api/epx/hosted/record-failure', async (req: Request, res: Response) => {
  try {
    const {
      transactionId,
      memberId,
      statusMessage,
      status,
      amount
    } = req.body || {};

    // Parse user-friendly error message
    let failureReason = statusMessage || status || 'Payment declined';
    if (typeof statusMessage === 'string') {
      if (statusMessage.includes('INSUFF') || statusMessage.includes('51')) {
        failureReason = 'Insufficient funds';
      } else if (statusMessage.includes('DECLINED') || statusMessage.includes('05')) {
        failureReason = 'Card declined by issuer';
      } else if (statusMessage.includes('INVALID') || statusMessage.includes('EXPIRED')) {
        failureReason = 'Card information invalid or expired';
      }
    }

    logEPX({
      level: 'info',
      phase: 'record-failure',
      message: 'Recording client-side payment failure',
      data: { transactionId, memberId, failureReason, rawMessage: statusMessage }
    });

    // Update payment record if exists
    if (transactionId) {
      try {
        await persistHostedPaymentUpdate({
          epxTransactionId: transactionId,
          fallbackOrderNumber: transactionId,
          authGuid: null,
          authCode: null,
          amount: amount || null,
          callbackStatus: status || 'Failure',
          callbackMessage: statusMessage || failureReason,
          memberId: memberId || null,
          bricTokenPresent: false,
          paymentStatus: 'failed',
          tranType: 'CCE1',
          paymentMethodType: 'CreditCard'
        });
      } catch (persistError: any) {
        logEPX({
          level: 'error',
          phase: 'record-failure',
          message: 'Failed to persist payment failure',
          data: { error: persistError?.message, transactionId }
        });
      }
    }

    // Create admin notification
    if (memberId) {
      try {
        const memberRecord = await storage.getMember(Number(memberId));
        
        await storage.createAdminNotification({
          type: 'payment_failed',
          memberId: Number(memberId),
          subscriptionId: null,
          errorMessage: failureReason,
          metadata: {
            transactionId,
            amount,
            memberEmail: memberRecord?.email,
            memberName: memberRecord ? `${memberRecord.firstName || ''} ${memberRecord.lastName || ''}`.trim() : null,
            failureReason,
            rawMessage: statusMessage,
            enrollingAgentId: memberRecord?.enrolledByAgentId || memberRecord?.enrolled_by_agent_id || null,
            timestamp: new Date().toISOString()
          }
        });

        logEPX({
          level: 'info',
          phase: 'record-failure',
          message: 'Admin notification created for failed payment',
          data: { memberId, transactionId }
        });
      } catch (notificationError: any) {
        logEPX({
          level: 'error',
          phase: 'record-failure',
          message: 'Failed to create admin notification',
          data: { error: notificationError?.message, memberId }
        });
      }
    }

    return res.json({
      success: true,
      message: 'Payment failure recorded'
    });
  } catch (error: any) {
    logEPX({
      level: 'error',
      phase: 'record-failure',
      message: 'Unhandled error recording payment failure',
      data: { error: error?.message }
    });
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to record payment failure'
    });
  }
});

/**
 * Record payment failure from frontend
 * Called when EPX returns a failure response to the browser
 */
router.post('/api/epx/hosted/record-failure', async (req: Request, res: Response) => {
  try {
    const {
      transactionId,
      sessionId,
      failureMessage,
      failureStatus,
      memberId,
      amount
    } = req.body || {};

    if (!transactionId && !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'transactionId or sessionId is required'
      });
    }

    const effectiveTransactionId = transactionId || sessionId;

    logEPX({
      level: 'warn',
      phase: 'record-failure',
      message: 'Recording payment failure from frontend',
      data: {
        transactionId: effectiveTransactionId,
        memberId,
        failureMessage,
        failureStatus
      }
    });

    // Try to find existing payment record
    let paymentRecord = await storage.getPaymentByTransactionId(effectiveTransactionId);

    if (paymentRecord) {
      // Update existing record
      const updateResult = await persistHostedPaymentUpdate({
        epxTransactionId: effectiveTransactionId,
        fallbackOrderNumber: effectiveTransactionId,
        authGuid: null,
        authCode: null,
        amount: amount || paymentRecord.amount || 0,
        callbackStatus: failureStatus || 'Failure',
        callbackMessage: failureMessage || 'Payment declined',
        bricTokenPresent: false,
        paymentStatus: 'failed',
        tranType: 'CCE1',
        paymentMethodType: 'CreditCard'
      });

      paymentRecord = updateResult.paymentRecord;
    } else {
      // Create new payment record for the failure
      if (!memberId) {
        return res.status(400).json({
          success: false,
          error: 'memberId is required when payment record does not exist'
        });
      }

      try {
        paymentRecord = await storage.createPayment({
          member_id: memberId,
          amount: amount || 0,
          status: 'failed',
          payment_method: 'credit_card',
          transaction_id: effectiveTransactionId,
          metadata: {
            failureReason: failureMessage,
            failureStatus: failureStatus,
            recordedFrom: 'frontend',
            timestamp: new Date().toISOString()
          }
        });

        logEPX({
          level: 'info',
          phase: 'record-failure',
          message: 'Created payment record for frontend failure',
          data: { paymentId: paymentRecord?.id, transactionId: effectiveTransactionId }
        });
      } catch (createError: any) {
        logEPX({
          level: 'error',
          phase: 'record-failure',
          message: 'Failed to create payment record for failure',
          data: { error: createError?.message }
        });
      }
    }

    // Create admin notification
    if (paymentRecord && memberId) {
      try {
        const memberRecord = await storage.getMember(memberId);
        
        await storage.createAdminNotification({
          type: 'payment_failed',
          memberId,
          subscriptionId: null,
          errorMessage: failureMessage || 'Payment declined by processor',
          metadata: {
            transactionId: effectiveTransactionId,
            amount: amount || paymentRecord.amount,
            paymentId: paymentRecord.id,
            memberEmail: memberRecord?.email,
            memberName: memberRecord ? `${memberRecord.firstName || ''} ${memberRecord.lastName || ''}`.trim() : null,
            failureReason: failureMessage,
            failureStatus: failureStatus,
            timestamp: new Date().toISOString()
          }
        });
      } catch (notificationError: any) {
        logEPX({
          level: 'error',
          phase: 'record-failure',
          message: 'Failed to create admin notification for payment failure',
          data: { error: notificationError?.message }
        });
      }
    }

    return res.json({
      success: true,
      paymentId: paymentRecord?.id || null,
      recorded: true
    });
  } catch (error: any) {
    logEPX({
      level: 'error',
      phase: 'record-failure',
      message: 'Failed to record payment failure',
      data: { error: error?.message }
    });
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to record payment failure'
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

    const currentEnvironment = await paymentEnvironment.getEnvironment();

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
          environment: currentEnvironment,
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

    if (result.isApproved) {
      const persistResult = await persistHostedPaymentUpdate({
        epxTransactionId,
        fallbackOrderNumber,
        authGuid,
        authCode: result.authCode,
        amount: result.amount,
        callbackStatus: req.body?.status || null,
        callbackMessage: req.body?.message || null,
        bricTokenPresent: Boolean(result.bricToken),
        paymentStatus: 'succeeded',
        tranType: req.body?.tranType || req.body?.TRAN_TYPE || 'CCE1',
        paymentMethodType: req.body?.paymentMethodType || req.body?.PaymentMethodType || 'CreditCard'
      });

      paymentRecordForLogging = persistResult.paymentRecord;
      maskedAuthGuid = persistResult.maskedAuthGuid;

      if (!authGuid) {
        logEPX({ level: 'warn', phase: 'callback', message: 'Hosted callback missing AUTH_GUID', data: { transactionId: result.transactionId } });
      }

      if (result.bricToken && paymentRecordForLogging?.member_id) {
        try {
          await storage.updateMember(Number(paymentRecordForLogging.member_id), {
            paymentToken: result.bricToken,
            paymentMethodType: req.body?.paymentMethodType || 'CreditCard',
            status: 'active',
            isActive: true,
            firstPaymentDate: new Date().toISOString()
          });
        } catch (memberError: any) {
          logEPX({
            level: 'error',
            phase: 'callback',
            message: 'Failed to persist BRIC token from callback',
            data: {
              error: memberError?.message,
              memberId: paymentRecordForLogging?.member_id
            }
          });
        }
      }

      // COMMISSION CREATION/VERIFICATION - Check if commission exists and create if missing
      if (paymentRecordForLogging?.member_id) {
        try {
          const memberId = Number(paymentRecordForLogging.member_id);
          const memberRecord = await storage.getMember(memberId);
          
          if (memberRecord) {
            // Check if commission already exists for this member
            const { data: existingCommissions, error: commissionCheckError } = await supabase
              .from('agent_commissions')
              .select('id')
              .eq('member_id', memberId.toString())
              .limit(1);
            
            if (commissionCheckError) {
              logEPX({
                level: 'error',
                phase: 'callback',
                message: 'Failed to check for existing commission',
                data: { error: commissionCheckError.message, memberId }
              });
            } else if (!existingCommissions || existingCommissions.length === 0) {
              // No commission exists - create one now
              const agentId = memberRecord.enrolledByAgentId || memberRecord.enrolled_by_agent_id;
              
              if (agentId) {
                logEPX({
                  level: 'info',
                  phase: 'callback',
                  message: 'No commission found for member - creating now',
                  data: { memberId, agentId }
                });
                
                const agentRecord = await storage.getUser(agentId);
                const agentNumber = memberRecord.agentNumber || memberRecord.agent_number || agentRecord?.agentNumber || agentRecord?.agent_number || 'HOUSE';
                
                // Get plan details
                const paymentMetadata = parsePaymentMetadata(paymentRecordForLogging.metadata);
                const planIdFromMember = memberRecord.planId || memberRecord.plan_id || paymentMetadata.planId;
                
                let planName = 'MyPremierPlan Base'; // Default
                if (planIdFromMember) {
                  try {
                    const planRecord = await storage.getPlan(String(planIdFromMember));
                    if (planRecord?.name) {
                      // Extract tier from full plan name (e.g., "MyPremierPlan Base - Member Only" -> "MyPremierPlan Base")
                      planName = planRecord.name.includes(' - ') ? planRecord.name.split(' - ')[0].trim() : planRecord.name;
                    }
                  } catch (planError) {
                    logEPX({ level: 'warn', phase: 'callback', message: 'Could not load plan details', data: { error: planError } });
                  }
                }
                
                const coverageType = memberRecord.coverageType || memberRecord.coverage_type || memberRecord.memberType || memberRecord.member_type || 'Member Only';
                const hasRxValet = memberRecord.addRxValet || memberRecord.add_rx_valet || false;
                
                // Calculate commission
                const commissionResult = calculateCommission(planName, coverageType, hasRxValet);
                
                if (commissionResult) {
                  const commissionData = {
                    agent_id: agentId,
                    agent_number: agentNumber,
                    member_id: memberId.toString(),
                    enrollment_id: paymentRecordForLogging.subscription_id ? paymentRecordForLogging.subscription_id.toString() : null,
                    commission_amount: commissionResult.commission,
                    coverage_type: 'other' as const,
                    status: 'pending' as const,
                    payment_status: 'unpaid' as const,
                    base_premium: commissionResult.totalCost,
                    notes: `Commission created via EPX callback - Plan: ${planName}, Coverage: ${coverageType}${hasRxValet ? ', RxValet: +$' + RX_VALET_COMMISSION : ''}, Total: $${commissionResult.commission}`
                  };
                  
                  const { data: newCommission, error: commissionError } = await supabase
                    .from('agent_commissions')
                    .insert(commissionData)
                    .select()
                    .single();
                  
                  if (commissionError) {
                    logEPX({
                      level: 'error',
                      phase: 'callback',
                      message: 'Failed to create commission in callback',
                      data: { error: commissionError.message, memberId, agentId }
                    });
                  } else {
                    logEPX({
                      level: 'info',
                      phase: 'callback',
                      message: '✅ Commission created successfully via callback',
                      data: {
                        commissionId: newCommission.id,
                        memberId,
                        agentId,
                        agentNumber,
                        amount: commissionResult.commission,
                        plan: planName,
                        coverage: coverageType
                      }
                    });
                  }
                } else {
                  logEPX({
                    level: 'warn',
                    phase: 'callback',
                    message: 'Could not calculate commission - no matching rate found',
                    data: { planName, coverageType, memberId }
                  });
                }
              } else {
                logEPX({
                  level: 'warn',
                  phase: 'callback',
                  message: 'Cannot create commission - member has no enrolling agent',
                  data: { memberId }
                });
              }
            } else {
              logEPX({
                level: 'info',
                phase: 'callback',
                message: 'Commission already exists for member',
                data: { memberId, commissionId: existingCommissions[0].id }
              });
            }
          }
        } catch (commissionVerifyError: any) {
          logEPX({
            level: 'error',
            phase: 'callback',
            message: 'Exception during commission verification/creation',
            data: {
              error: commissionVerifyError?.message,
              stack: commissionVerifyError?.stack,
              memberId: paymentRecordForLogging?.member_id
            }
          });
          // Continue processing - commission creation failure shouldn't block payment success
        }
      }

      if (paymentRecordForLogging) {
        try {
          const paymentMetadata = parsePaymentMetadata(paymentRecordForLogging.metadata);
          const notificationMeta = {
            ...(typeof paymentMetadata.notifications === 'object' && paymentMetadata.notifications ? paymentMetadata.notifications : {})
          } as Record<string, any>;
          const shouldSendPaymentEmail = !notificationMeta.paymentReceiptSentAt;
          const shouldSendEnrollmentEmail = !notificationMeta.enrollmentEmailSentAt;

          if ((shouldSendPaymentEmail || shouldSendEnrollmentEmail) && paymentRecordForLogging.member_id) {
            const memberId = Number(paymentRecordForLogging.member_id);
            const memberRecord = await storage.getMember(memberId);

            if (memberRecord?.email) {
              const resolvedAmount = typeof result.amount === 'number'
                ? result.amount
                : result.amount
                  ? parseFloat(String(result.amount))
                  : paymentRecordForLogging.amount
                    ? parseFloat(String(paymentRecordForLogging.amount))
                    : 0;

              const planIdFromMember = memberRecord.planId
                ?? memberRecord.plan_id
                ?? paymentMetadata.planId
                ?? paymentMetadata.plan_id;

              let planName: string | null = paymentMetadata.planName
                || paymentMetadata.planLabel
                || memberRecord.planName
                || memberRecord.plan_name
                || null;

              if (!planName && planIdFromMember) {
                try {
                  const planRecord = await storage.getPlan(String(planIdFromMember));
                  planName = planRecord?.name || planName;
                } catch (planLookupError: any) {
                  logEPX({
                    level: 'warn',
                    phase: 'callback',
                    message: 'Unable to resolve plan name for notifications',
                    data: { error: planLookupError?.message, planId: planIdFromMember }
                  });
                }
              }

              const memberFirstName = memberRecord.firstName || memberRecord.first_name || '';
              const memberLastName = memberRecord.lastName || memberRecord.last_name || '';
              const memberFullName = `${memberFirstName} ${memberLastName}`.trim() || memberRecord.email;
              const coverageType = memberRecord.coverageType
                || memberRecord.coverage_type
                || paymentMetadata.coverageType
                || paymentMetadata.memberType
                || 'Member Only';

              let agentRecord: any = null;
              const agentId = memberRecord.enrolledByAgentId || memberRecord.enrolled_by_agent_id;
              if (agentId) {
                try {
                  agentRecord = await storage.getUser(agentId);
                } catch (agentError: any) {
                  logEPX({
                    level: 'warn',
                    phase: 'callback',
                    message: 'Unable to load agent for enrollment notification',
                    data: { error: agentError?.message, agentId }
                  });
                }
              }

              const agentName = agentRecord
                ? `${agentRecord.firstName || agentRecord.first_name || ''} ${agentRecord.lastName || agentRecord.last_name || ''}`.trim()
                : undefined;
              const agentNumber = memberRecord.agentNumber
                || memberRecord.agent_number
                || agentRecord?.agentNumber
                || agentRecord?.agent_number;

              if (shouldSendPaymentEmail) {
                try {
                  await sendPaymentNotification({
                    memberName: memberFullName,
                    memberEmail: memberRecord.email,
                    amount: resolvedAmount,
                    paymentMethod: req.body?.paymentMethodType || req.body?.PaymentMethodType || 'Hosted Checkout',
                    paymentStatus: 'succeeded',
                    transactionId: result.transactionId || paymentRecordForLogging.transaction_id,
                    paymentDate: new Date()
                  });
                  notificationMeta.paymentReceiptSentAt = new Date().toISOString();
                } catch (notificationError: any) {
                  logEPX({
                    level: 'error',
                    phase: 'callback',
                    message: 'Failed to send payment notification',
                    data: { error: notificationError?.message }
                  });
                }
              }

              if (shouldSendEnrollmentEmail) {
                try {
                  await sendEnrollmentNotification({
                    memberName: memberFullName,
                    memberEmail: memberRecord.email,
                    planName: planName || 'My Premier Plans Membership',
                    memberType: coverageType,
                    amount: resolvedAmount,
                    agentName,
                    agentNumber,
                    agentEmail: agentRecord?.email || null,
                    agentUserId: agentId || null,
                    enrollmentDate: new Date()
                  });
                  notificationMeta.enrollmentEmailSentAt = new Date().toISOString();
                } catch (notificationError: any) {
                  logEPX({
                    level: 'error',
                    phase: 'callback',
                    message: 'Failed to send enrollment notification',
                    data: { error: notificationError?.message }
                  });
                }
              }

              if (notificationMeta.paymentReceiptSentAt || notificationMeta.enrollmentEmailSentAt) {
                paymentMetadata.notifications = notificationMeta;
                try {
                  await storage.updatePayment(paymentRecordForLogging.id, { metadata: paymentMetadata });
                } catch (metaError: any) {
                  logEPX({
                    level: 'warn',
                    phase: 'callback',
                    message: 'Failed to persist notification metadata updates',
                    data: { error: metaError?.message, paymentId: paymentRecordForLogging.id }
                  });
                }
              }
            }
          }
        } catch (notificationSetupError: any) {
          logEPX({
            level: 'error',
            phase: 'callback',
            message: 'Notification dispatch failed',
            data: { error: notificationSetupError?.message }
          });
        }
      }

      const successPayload = {
        success: true,
        transactionId: result.transactionId,
        authCode: result.authCode,
        amount: result.amount,
        paymentId: paymentRecordForLogging?.id || null,
        memberId: paymentRecordForLogging?.member_id || null
      };

      if (certificationLoggingEnabled) {
        certificationLogger.logCertificationEntry({
          purpose: 'hosted-callback-success',
          transactionId: result.transactionId,
          amount: result.amount,
          environment: currentEnvironment,
          metadata: {
            hasAuthGuid: !!authGuid,
            paymentId: paymentRecordForLogging?.id,
            memberId: paymentRecordForLogging?.member_id,
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
    }

    // === PAYMENT DECLINED ===
    if (!result.isApproved) {
      logEPX({ level: 'warn', phase: 'callback', message: 'Payment declined', data: { error: result.error, transactionId: result.transactionId } });
      
      // Persist the failed payment status
      try {
        const persistResult = await persistHostedPaymentUpdate({
          epxTransactionId,
          fallbackOrderNumber,
          authGuid: null,
          authCode: null,
          amount: result.amount,
          callbackStatus: req.body?.status || 'Failure',
          callbackMessage: req.body?.StatusMessage || result.error || 'Payment declined',
          bricTokenPresent: false,
          paymentStatus: 'failed',
          tranType: req.body?.tranType || req.body?.TRAN_TYPE || 'CCE1',
          paymentMethodType: req.body?.paymentMethodType || req.body?.PaymentMethodType || 'CreditCard'
        });

        paymentRecordForLogging = persistResult.paymentRecord;

        // Create admin notification for failed payment
        if (paymentRecordForLogging?.member_id) {
          try {
            const memberId = Number(paymentRecordForLogging.member_id);
            const memberRecord = await storage.getMember(memberId);
            
            await storage.createAdminNotification({
              type: 'payment_failed',
              memberId,
              subscriptionId: null,
              errorMessage: req.body?.StatusMessage || result.error || 'Payment declined by processor',
              metadata: {
                transactionId: result.transactionId,
                amount: result.amount,
                paymentId: paymentRecordForLogging.id,
                memberEmail: memberRecord?.email,
                memberName: memberRecord ? `${memberRecord.firstName || ''} ${memberRecord.lastName || ''}`.trim() : null,
                failureReason: req.body?.StatusMessage || result.error,
                planId: paymentRecordForLogging.metadata?.planId || null,
                enrollingAgentId: memberRecord?.enrollingAgentId || memberRecord?.enrolled_by_agent_id || null,
                timestamp: new Date().toISOString()
              }
            });

            logEPX({
              level: 'info',
              phase: 'callback',
              message: 'Admin notification created for failed payment',
              data: {
                memberId,
                transactionId: result.transactionId,
                paymentId: paymentRecordForLogging.id
              }
            });
          } catch (notificationError: any) {
            logEPX({
              level: 'error',
              phase: 'callback',
              message: 'Failed to create admin notification for payment failure',
              data: {
                error: notificationError?.message,
                memberId: paymentRecordForLogging.member_id
              }
            });
          }
        }
      } catch (persistError: any) {
        logEPX({
          level: 'error',
          phase: 'callback',
          message: 'Failed to persist declined payment',
          data: { error: persistError?.message }
        });
      }
      
      const declinePayload = {
        success: false,
        error: result.error,
        transactionId: result.transactionId,
        paymentId: paymentRecordForLogging?.id || null,
        memberId: paymentRecordForLogging?.member_id || null
      };

      if (certificationLoggingEnabled) {
        certificationLogger.logCertificationEntry({
          purpose: 'hosted-callback-declined',
          transactionId: result.transactionId,
          amount: result.amount,
          environment: currentEnvironment,
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
        environment: currentEnvironment,
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
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
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

/**
 * ADMIN: Manually update payment status
 * Allows admins to manually change payment status when EPX callback fails
 */
router.put('/api/admin/payments/:id/status', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const paymentId = parseInt(req.params.id, 10);
    const { status, note } = req.body;

    if (!paymentId || isNaN(paymentId)) {
      return res.status(400).json({ success: false, error: 'Valid payment ID required' });
    }

    const validStatuses = ['pending', 'succeeded', 'failed', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: `Status must be one of: ${validStatuses.join(', ')}` 
      });
    }

    logEPX({
      level: 'info',
      phase: 'admin-update',
      message: 'Admin manually updating payment status',
      data: {
        paymentId,
        newStatus: status,
        adminUserId: req.user.id,
        adminEmail: req.user.email,
        note: note || 'No note provided'
      }
    });

    // Get current payment record
    const currentPayment = await storage.getPaymentById(paymentId);
    if (!currentPayment) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    // Update metadata to track the manual change
    const paymentMetadata = parsePaymentMetadata(currentPayment.metadata);
    paymentMetadata.manualStatusUpdate = {
      previousStatus: currentPayment.status,
      newStatus: status,
      updatedBy: req.user.email,
      updatedByUserId: req.user.id,
      updatedAt: new Date().toISOString(),
      note: note || null
    };

    // Update payment status
    await storage.updatePayment(paymentId, {
      status,
      metadata: paymentMetadata
    });

    // If status changed to succeeded and member exists, activate member and create commission if needed
    if (status === 'succeeded' && currentPayment.member_id) {
      const memberId = Number(currentPayment.member_id);
      
      try {
        const memberRecord = await storage.getMember(memberId);
        if (memberRecord) {
          // Activate member
          await storage.updateMember(memberId, {
            status: 'active',
            isActive: true,
            firstPaymentDate: memberRecord.firstPaymentDate || memberRecord.first_payment_date || new Date().toISOString()
          });

          logEPX({
            level: 'info',
            phase: 'admin-update',
            message: 'Member activated after manual payment approval',
            data: { memberId, paymentId }
          });

          // Check for commission
          const { data: existingCommissions } = await supabase
            .from('agent_commissions')
            .select('id')
            .eq('member_id', memberId.toString())
            .limit(1);

          if (!existingCommissions || existingCommissions.length === 0) {
            const agentId = memberRecord.enrolledByAgentId || memberRecord.enrolled_by_agent_id;
            
            if (agentId) {
              logEPX({
                level: 'info',
                phase: 'admin-update',
                message: 'Creating missing commission after manual approval',
                data: { memberId, agentId }
              });

              const agentRecord = await storage.getUser(agentId);
              const agentNumber = memberRecord.agentNumber || memberRecord.agent_number || agentRecord?.agentNumber || agentRecord?.agent_number || 'HOUSE';
              
              const planIdFromMember = memberRecord.planId || memberRecord.plan_id;
              let planName = 'MyPremierPlan Base';
              
              if (planIdFromMember) {
                try {
                  const planRecord = await storage.getPlan(String(planIdFromMember));
                  if (planRecord?.name) {
                    planName = planRecord.name.includes(' - ') ? planRecord.name.split(' - ')[0].trim() : planRecord.name;
                  }
                } catch (planError) {
                  logEPX({ level: 'warn', phase: 'admin-update', message: 'Could not load plan', data: { error: planError } });
                }
              }
              
              const coverageType = memberRecord.coverageType || memberRecord.coverage_type || memberRecord.memberType || memberRecord.member_type || 'Member Only';
              const hasRxValet = memberRecord.addRxValet || memberRecord.add_rx_valet || false;
              
              const commissionResult = calculateCommission(planName, coverageType, hasRxValet);
              
              if (commissionResult) {
                const { data: newCommission, error: commissionError } = await supabase
                  .from('agent_commissions')
                  .insert({
                    agent_id: agentId,
                    agent_number: agentNumber,
                    member_id: memberId.toString(),
                    enrollment_id: currentPayment.subscription_id ? currentPayment.subscription_id.toString() : null,
                    commission_amount: commissionResult.commission,
                    coverage_type: 'other' as const,
                    status: 'pending' as const,
                    payment_status: 'unpaid' as const,
                    base_premium: commissionResult.totalCost,
                    notes: `Commission created via admin manual payment approval - Plan: ${planName}, Coverage: ${coverageType}, Total: $${commissionResult.commission}`
                  })
                  .select()
                  .single();
                
                if (!commissionError) {
                  logEPX({
                    level: 'info',
                    phase: 'admin-update',
                    message: '✅ Commission created via admin approval',
                    data: { commissionId: newCommission.id, memberId, amount: commissionResult.commission }
                  });
                } else {
                  logEPX({
                    level: 'error',
                    phase: 'admin-update',
                    message: 'Failed to create commission',
                    data: { error: commissionError.message }
                  });
                }
              }
            }
          }
        }
      } catch (memberUpdateError: any) {
        logEPX({
          level: 'error',
          phase: 'admin-update',
          message: 'Failed to update member after payment approval',
          data: { error: memberUpdateError?.message, memberId }
        });
      }
    }

    res.json({
      success: true,
      message: 'Payment status updated successfully',
      payment: {
        id: paymentId,
        previousStatus: currentPayment.status,
        newStatus: status
      }
    });
  } catch (error: any) {
    logEPX({
      level: 'error',
      phase: 'admin-update',
      message: 'Failed to update payment status',
      data: { error: error?.message }
    });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update payment status'
    });
  }
});

/**
 * ADMIN: Manually create commission for a member
 * Useful for fixing missing commissions
 */
router.post('/api/admin/members/:id/create-commission', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const memberId = parseInt(req.params.id, 10);

    if (!memberId || isNaN(memberId)) {
      return res.status(400).json({ success: false, error: 'Valid member ID required' });
    }

    logEPX({
      level: 'info',
      phase: 'admin-commission',
      message: 'Admin manually creating commission',
      data: {
        memberId,
        adminUserId: req.user.id,
        adminEmail: req.user.email
      }
    });

    // Check if commission already exists
    const { data: existingCommissions } = await supabase
      .from('agent_commissions')
      .select('id, commission_amount, agent_id')
      .eq('member_id', memberId.toString());

    if (existingCommissions && existingCommissions.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Commission(s) already exist for this member',
        commissions: existingCommissions
      });
    }

    // Get member details
    const memberRecord = await storage.getMember(memberId);
    if (!memberRecord) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    const agentId = memberRecord.enrolledByAgentId || memberRecord.enrolled_by_agent_id;
    if (!agentId) {
      return res.status(400).json({
        success: false,
        error: 'Member has no enrolling agent - cannot create commission'
      });
    }

    const agentRecord = await storage.getUser(agentId);
    const agentNumber = memberRecord.agentNumber || memberRecord.agent_number || agentRecord?.agentNumber || agentRecord?.agent_number || 'HOUSE';

    // Get plan details
    const planIdFromMember = memberRecord.planId || memberRecord.plan_id;
    let planName = 'MyPremierPlan Base';
    
    if (planIdFromMember) {
      try {
        const planRecord = await storage.getPlan(String(planIdFromMember));
        if (planRecord?.name) {
          planName = planRecord.name.includes(' - ') ? planRecord.name.split(' - ')[0].trim() : planRecord.name;
        }
      } catch (planError) {
        logEPX({ level: 'warn', phase: 'admin-commission', message: 'Could not load plan', data: { error: planError } });
      }
    }

    const coverageType = memberRecord.coverageType || memberRecord.coverage_type || memberRecord.memberType || memberRecord.member_type || 'Member Only';
    const hasRxValet = memberRecord.addRxValet || memberRecord.add_rx_valet || false;

    // Calculate commission
    const commissionResult = calculateCommission(planName, coverageType, hasRxValet);
    
    if (!commissionResult) {
      return res.status(400).json({
        success: false,
        error: 'Could not calculate commission - no matching rate found',
        details: { planName, coverageType, hasRxValet }
      });
    }

    // Create commission
    const { data: newCommission, error: commissionError } = await supabase
      .from('agent_commissions')
      .insert({
        agent_id: agentId,
        agent_number: agentNumber,
        member_id: memberId.toString(),
        commission_amount: commissionResult.commission,
        coverage_type: 'other' as const,
        status: 'pending' as const,
        payment_status: 'unpaid' as const,
        base_premium: commissionResult.totalCost,
        notes: `Commission created manually by admin (${req.user.email}) - Plan: ${planName}, Coverage: ${coverageType}, Total: $${commissionResult.commission}`
      })
      .select()
      .single();

    if (commissionError) {
      logEPX({
        level: 'error',
        phase: 'admin-commission',
        message: 'Failed to create commission',
        data: { error: commissionError.message, memberId }
      });
      return res.status(500).json({
        success: false,
        error: commissionError.message || 'Failed to create commission'
      });
    }

    logEPX({
      level: 'info',
      phase: 'admin-commission',
      message: '✅ Commission created manually by admin',
      data: {
        commissionId: newCommission.id,
        memberId,
        agentId,
        agentNumber,
        amount: commissionResult.commission
      }
    });

    res.json({
      success: true,
      message: 'Commission created successfully',
      commission: {
        id: newCommission.id,
        memberId,
        agentId,
        agentNumber,
        amount: commissionResult.commission,
        planName,
        coverageType
      }
    });
  } catch (error: any) {
    logEPX({
      level: 'error',
      phase: 'admin-commission',
      message: 'Exception creating commission',
      data: { error: error?.message, stack: error?.stack }
    });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create commission'
    });
  }
});

/**
 * ADMIN: Commission repair utility
 * Scans for members with successful payments but no commissions and creates them
 */
router.post('/api/admin/commissions/repair', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const { dryRun = true } = req.body;

    logEPX({
      level: 'info',
      phase: 'commission-repair',
      message: `Starting commission repair utility (${dryRun ? 'DRY RUN' : 'LIVE RUN'})`,
      data: {
        adminUserId: req.user.id,
        adminEmail: req.user.email
      }
    });

    // Get all active members with an enrolling agent
    const { data: activeMembers, error: membersError } = await supabase
      .from('members')
      .select('id, enrolled_by_agent_id, agent_number, plan_id, coverage_type, member_type, add_rx_valet, first_name, last_name, email')
      .eq('is_active', true)
      .not('enrolled_by_agent_id', 'is', null);

    if (membersError) {
      throw new Error(`Failed to fetch members: ${membersError.message}`);
    }

    const results = {
      totalChecked: activeMembers?.length || 0,
      missingCommissions: 0,
      commissionsCreated: 0,
      errors: [] as any[],
      details: [] as any[]
    };

    if (!activeMembers || activeMembers.length === 0) {
      return res.json({
        success: true,
        message: 'No active members found with enrolling agents',
        results
      });
    }

    // Check each member for commission
    for (const member of activeMembers) {
      try {
        // Check if commission exists
        const { data: existingCommissions } = await supabase
          .from('agent_commissions')
          .select('id')
          .eq('member_id', member.id.toString())
          .limit(1);

        if (existingCommissions && existingCommissions.length > 0) {
          continue; // Commission exists, skip
        }

        results.missingCommissions++;

        // Get agent details
        const agentRecord = await storage.getUser(member.enrolled_by_agent_id);
        const agentNumber = member.agent_number || agentRecord?.agentNumber || agentRecord?.agent_number || 'HOUSE';

        // Get plan details
        let planName = 'MyPremierPlan Base';
        if (member.plan_id) {
          try {
            const planRecord = await storage.getPlan(String(member.plan_id));
            if (planRecord?.name) {
              planName = planRecord.name.includes(' - ') ? planRecord.name.split(' - ')[0].trim() : planRecord.name;
            }
          } catch (planError) {
            logEPX({ 
              level: 'warn', 
              phase: 'commission-repair', 
              message: 'Could not load plan for member', 
              data: { memberId: member.id, error: planError } 
            });
          }
        }

        const coverageType = member.coverage_type || member.member_type || 'Member Only';
        const hasRxValet = member.add_rx_valet || false;

        // Calculate commission
        const commissionResult = calculateCommission(planName, coverageType, hasRxValet);

        if (!commissionResult) {
          results.errors.push({
            memberId: member.id,
            memberName: `${member.first_name} ${member.last_name}`,
            error: 'Could not calculate commission - no matching rate found',
            planName,
            coverageType
          });
          continue;
        }

        const commissionData = {
          agent_id: member.enrolled_by_agent_id,
          agent_number: agentNumber,
          member_id: member.id.toString(),
          commission_amount: commissionResult.commission,
          coverage_type: 'other' as const,
          status: 'pending' as const,
          payment_status: 'unpaid' as const,
          base_premium: commissionResult.totalCost,
          notes: `Commission created via repair utility - Plan: ${planName}, Coverage: ${coverageType}, Total: $${commissionResult.commission}`
        };

        results.details.push({
          memberId: member.id,
          memberName: `${member.first_name} ${member.last_name}`,
          memberEmail: member.email,
          agentId: member.enrolled_by_agent_id,
          agentNumber,
          commissionAmount: commissionResult.commission,
          planName,
          coverageType
        });

        if (!dryRun) {
          // Actually create the commission
          const { error: commissionError } = await supabase
            .from('agent_commissions')
            .insert(commissionData);

          if (commissionError) {
            results.errors.push({
              memberId: member.id,
              memberName: `${member.first_name} ${member.last_name}`,
              error: commissionError.message
            });
          } else {
            results.commissionsCreated++;
            logEPX({
              level: 'info',
              phase: 'commission-repair',
              message: '✅ Commission created via repair utility',
              data: {
                memberId: member.id,
                agentId: member.enrolled_by_agent_id,
                amount: commissionResult.commission
              }
            });
          }
        }
      } catch (memberError: any) {
        results.errors.push({
          memberId: member.id,
          memberName: `${member.first_name} ${member.last_name}`,
          error: memberError?.message || 'Unknown error'
        });
      }
    }

    const message = dryRun
      ? `DRY RUN: Found ${results.missingCommissions} members missing commissions (no changes made)`
      : `LIVE RUN: Created ${results.commissionsCreated} commissions out of ${results.missingCommissions} missing`;

    logEPX({
      level: 'info',
      phase: 'commission-repair',
      message: 'Commission repair utility completed',
      data: results
    });

    res.json({
      success: true,
      message,
      results
    });
  } catch (error: any) {
    logEPX({
      level: 'error',
      phase: 'commission-repair',
      message: 'Commission repair utility failed',
      data: { error: error?.message, stack: error?.stack }
    });
    res.status(500).json({
      success: false,
      error: error.message || 'Commission repair failed'
    });
  }
});

export default router;


