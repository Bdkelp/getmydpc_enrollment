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
import { hasAtLeastRole, isAtLeastAdmin } from '../auth/roles';
import { supabase } from '../lib/supabaseClient';
import { verifyRecaptcha, isRecaptchaEnabled } from '../utils/recaptcha';
import { logEPX, getRecentEPXLogs } from '../services/epx-payment-logger';
import { submitServerPostRecurringPayment } from '../services/epx-payment-service';
import { certificationLogger } from '../services/certification-logger';
import { maskAuthGuidValue, parsePaymentMetadata, persistServerPostResult } from '../utils/epx-metadata';
import { paymentEnvironment } from '../services/payment-environment-service';
import { sendEnrollmentNotification, sendPaymentNotification } from '../utils/notifications';
import { calculateCommission, RX_VALET_COMMISSION } from '../commissionCalculator';
import { transitionGroupPaymentToPayable } from '../services/group-payment-transition-service';
import { calculateNextBillingDate } from '../utils/membership-dates';

const router = Router();
const certificationLoggingEnabled = process.env.ENABLE_CERTIFICATION_LOGGING !== 'false';

const SENSITIVE_KEY_PATTERNS = [
  /account[_\s-]?nbr/i,
  /routing[_\s-]?nbr/i,
  /account[_\s-]?number/i,
  /routing[_\s-]?number/i,
  /^ssn$/i,
  /social[_\s-]?security/i,
  /bank[_\s-]?account/i,
  /bank[_\s-]?routing/i,
];

function maskSensitiveValue(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '****';

  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `****${digits.slice(-4)}`;
  }

  return '****';
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function sanitizeForLogging(value: any): any {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLogging(item));
  }

  if (value && typeof value === 'object') {
    const output: Record<string, any> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (isSensitiveKey(key)) {
        output[key] = maskSensitiveValue(nestedValue);
      } else {
        output[key] = sanitizeForLogging(nestedValue);
      }
    }
    return output;
  }

  return value;
}

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

type PaymentRecord = {
  id: number | string;
  member_id?: number | string | null;
  subscription_id?: number | string | null;
  transaction_id?: string | null;
  metadata?: Record<string, any> | null;
  amount?: number | string | null;
  status?: string | null;
} & Record<string, any>;

type HostedCallbackMetadata = {
  status?: string | null;
  amount?: string | number | null;
  message?: string | null;
  authGuidMasked?: string | null;
  authGuidSource?: string | null;
  updatedAt?: string;
  hasBricToken?: boolean;
  tranType?: string | null;
  paymentMethodType?: string | null;
} & Record<string, any>;

type HostedPaymentUpdateOptions = {
  epxTransactionId?: string | null;
  fallbackOrderNumber?: string | null;
  authGuid?: string | null;
  authGuidSource?: string | null;
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
    authGuidSource,
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
    authGuidSource: authGuidSource ?? existingHostedMeta.authGuidSource ?? null,
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
        hasAuthGuid: !!authGuid,
        authGuidSource: authGuidSource || null
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
  const envSuffix = cachedEnvironment === 'production' ? 'PRODUCTION' : 'SANDBOX';
  const scopedPublicKey = process.env[`EPX_PUBLIC_KEY_${envSuffix}`];
  const scopedTerminalProfileId = process.env[`EPX_TERMINAL_PROFILE_ID_${envSuffix}`];
  const envConfig: Partial<EPXHostedCheckoutConfig> = {
    publicKey: scopedPublicKey || process.env.EPX_PUBLIC_KEY || undefined,
    terminalProfileId: scopedTerminalProfileId || process.env.EPX_TERMINAL_PROFILE_ID || undefined,
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

  throw new Error(
    `EPX Hosted Checkout configuration missing for ${cachedEnvironment}. ` +
    'Set EPX_PUBLIC_KEY/EPX_TERMINAL_PROFILE_ID or env-scoped variants.'
  );
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

const normalizeHostedAuthGuid = (
  candidate: unknown,
  bricTokenCandidate?: unknown,
): string | null => {
  if (typeof candidate !== 'string') {
    return null;
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }

  const bricToken = typeof bricTokenCandidate === 'string'
    ? bricTokenCandidate.trim()
    : '';

  if (bricToken && trimmed === bricToken) {
    return null;
  }

  return trimmed;
};

const resolveCallbackAuthGuid = (
  payload: Record<string, any>,
  resultAuthGuid: unknown,
  bricTokenCandidate?: unknown,
): { value: string | null; source: string | null } => {
  const candidates: Array<{ value: unknown; source: string }> = [
    { value: resultAuthGuid, source: 'callback.result.authGuid' },
    { value: payload?.AUTH_GUID, source: 'callback.AUTH_GUID' },
    { value: payload?.result?.AUTH_GUID, source: 'callback.result.AUTH_GUID' },
  ];

  for (const candidate of candidates) {
    const normalized = normalizeHostedAuthGuid(candidate.value, bricTokenCandidate);
    if (normalized) {
      return { value: normalized, source: candidate.source };
    }
  }

  return { value: null, source: null };
};

const sanitizeAlphaNumericToken = (value: string, maxLength: number): string => {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, maxLength);
};

const buildShortInvoiceNo = (customerName: string | undefined, description: string | undefined, orderNumber: string): string => {
  const now = new Date();
  const datePart = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

  const nameParts = String(customerName || '').trim().split(/\s+/).filter(Boolean);
  const firstInitial = sanitizeAlphaNumericToken(nameParts[0] || 'X', 1) || 'X';
  const lastNameSource = nameParts.length > 1 ? nameParts[nameParts.length - 1] : (nameParts[0] || 'USER');
  const lastNameToken = sanitizeAlphaNumericToken(lastNameSource, 4) || 'USER';

  const normalizedDescription = String(description || '').toLowerCase();
  const tierToken = normalizedDescription.includes('elite')
    ? 'E'
    : normalizedDescription.includes('plus')
      ? 'P'
      : 'B';

  const sequence = String(orderNumber || '').replace(/\D/g, '').slice(-2).padStart(2, '0');
  return `${datePart}-${firstInitial}${lastNameToken}-${tierToken}-${sequence}`.slice(0, 25);
};

const toHostedCheckoutBaseUrl = (scriptUrl: string, environment: string): string => {
  if (scriptUrl && scriptUrl.includes('/')) {
    return scriptUrl.replace(/\/post\.js(?:\?.*)?$/i, '/');
  }

  return environment === 'production' ? 'https://hosted.epx.com/' : 'https://hosted.epxuap.com/';
};

const buildHostedPaymentLink = (options: {
  scriptUrl: string;
  environment: string;
  terminalProfileId: string;
  amount: string;
  invoiceNo: string;
  description?: string;
  billingName?: string;
  email?: string;
  billingAddress?: BillingAddress;
}): string => {
  const baseUrl = toHostedCheckoutBaseUrl(options.scriptUrl, options.environment);
  const params = new URLSearchParams();
  params.set('terminal_profile_id', options.terminalProfileId);
  params.set('amount', options.amount);
  params.set('invoice_no', options.invoiceNo);

  const safeDescription = String(options.description || '').replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 25).trim();
  if (safeDescription) {
    params.set('description', safeDescription);
  }

  if (options.billingName) {
    params.set('billing_name', String(options.billingName).replace(/[^a-zA-Z0-9 ]/g, '').trim());
  }

  if (options.email) {
    params.set('email', String(options.email).trim());
  }

  if (options.billingAddress?.streetAddress) {
    params.set('billing_address', String(options.billingAddress.streetAddress).trim());
  }
  if (options.billingAddress?.city) {
    params.set('billing_city', String(options.billingAddress.city).replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 25).trim());
  }
  if (options.billingAddress?.state) {
    const state = String(options.billingAddress.state).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
    if (state) {
      params.set('billing_state', state);
    }
  }
  if (options.billingAddress?.postalCode) {
    const postal = String(options.billingAddress.postalCode).replace(/\D/g, '').slice(0, 5);
    if (postal) {
      params.set('billing_postal_code', postal);
    }
  }

  return `${baseUrl}?${params.toString()}`;
};

const parseNumericGroupMemberId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

const parseNumericGroupMemberIdList = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueIds = new Set<number>();
  for (const item of value) {
    const parsed = parseNumericGroupMemberId(item);
    if (parsed && parsed > 0) {
      uniqueIds.add(parsed);
    }
  }

  return Array.from(uniqueIds);
};

const extractGroupPaymentContext = (metadata: Record<string, any>): { groupId: string; groupMemberId: number } | null => {
  const nested = metadata.groupPaymentContext && typeof metadata.groupPaymentContext === 'object'
    ? metadata.groupPaymentContext
    : null;

  const rawGroupId = nested?.groupId ?? metadata.groupId ?? metadata.group_id;
  const rawGroupMemberId = nested?.groupMemberId ?? metadata.groupMemberId ?? metadata.group_member_id;

  const groupId = typeof rawGroupId === 'string' ? rawGroupId.trim() : '';
  const groupMemberId = parseNumericGroupMemberId(rawGroupMemberId);

  if (!groupId || !groupMemberId) {
    return null;
  }

  return { groupId, groupMemberId };
};

const extractGroupInvoiceContext = (metadata: Record<string, any>): { groupId: string; selectedGroupMemberIds: number[] } | null => {
  const nested = metadata.groupInvoiceContext && typeof metadata.groupInvoiceContext === 'object'
    ? metadata.groupInvoiceContext
    : null;

  const rawGroupId = nested?.groupId ?? metadata.groupId ?? metadata.group_id;
  const groupId = typeof rawGroupId === 'string' ? rawGroupId.trim() : '';

  if (!groupId) {
    return null;
  }

  const rawSelectedMemberIds = nested?.selectedGroupMemberIds ?? metadata.selectedGroupMemberIds;
  const selectedGroupMemberIds = parseNumericGroupMemberIdList(rawSelectedMemberIds);

  return { groupId, selectedGroupMemberIds };
};

const extractMaskedCardProfileFromCallback = (callbackBody: Record<string, any>): {
  last4?: string;
  expiry?: string;
  billingZip?: string;
  billingName?: string;
} | null => {
  const methodRaw = String(
    callbackBody?.paymentMethodType || callbackBody?.PaymentMethodType || callbackBody?.PAYMENT_METHOD_TYPE || 'CreditCard',
  ).trim().toLowerCase();

  if (methodRaw.includes('ach') || methodRaw.includes('bank')) {
    return null;
  }

  const panRaw = String(
    callbackBody?.PAN
    || callbackBody?.CardNumber
    || callbackBody?.cardNumber
    || callbackBody?.CARD_NUMBER
    || callbackBody?.last4
    || callbackBody?.LAST4
    || callbackBody?.CardLast4
    || callbackBody?.CARD_LAST4
    || '',
  ).trim();

  const panDigits = panRaw.replace(/\D/g, '');
  const last4 = panDigits.length >= 4 ? panDigits.slice(-4) : undefined;

  const expiryRaw = String(
    callbackBody?.Expire
    || callbackBody?.EXPIRY
    || callbackBody?.expiry
    || callbackBody?.ExpDate
    || callbackBody?.EXP_DATE
    || '',
  ).trim();

  const billingZipRaw = String(
    callbackBody?.BillingPostalCode
    || callbackBody?.BillingZip
    || callbackBody?.BILLING_ZIP
    || callbackBody?.ZIP_CODE
    || '',
  ).trim();

  const billingNameRaw = String(
    callbackBody?.BillingName
    || callbackBody?.billingName
    || callbackBody?.CARDHOLDER_NAME
    || '',
  ).trim();

  if (!last4 && !expiryRaw && !billingZipRaw && !billingNameRaw) {
    return null;
  }

  return {
    ...(last4 ? { last4 } : {}),
    ...(expiryRaw ? { expiry: expiryRaw } : {}),
    ...(billingZipRaw ? { billingZip: billingZipRaw } : {}),
    ...(billingNameRaw ? { billingName: billingNameRaw } : {}),
  };
};

const upsertGroupCardProfileFromCallback = async (groupId: string, callbackBody: Record<string, any>) => {
  const maskedCardProfile = extractMaskedCardProfileFromCallback(callbackBody);
  if (!maskedCardProfile) {
    return;
  }

  const group = await storage.getGroupById(groupId);
  if (!group) {
    return;
  }

  const metadata = group.metadata && typeof group.metadata === 'object'
    ? (group.metadata as Record<string, any>)
    : {};
  const existingGroupProfile = metadata.groupProfile && typeof metadata.groupProfile === 'object'
    ? (metadata.groupProfile as Record<string, any>)
    : {};
  const existingCardDetails = existingGroupProfile.cardDetails && typeof existingGroupProfile.cardDetails === 'object'
    ? (existingGroupProfile.cardDetails as Record<string, any>)
    : {};

  const nextGroupProfile = {
    ...existingGroupProfile,
    cardDetails: {
      ...existingCardDetails,
      ...maskedCardProfile,
      updatedAt: new Date().toISOString(),
    },
  };

  await storage.updateGroup(groupId, {
    metadata: {
      ...metadata,
      groupProfile: nextGroupProfile,
    },
  } as any);
};

const parseNumericValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = parseFloat(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const parseSubscriptionId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = parseInt(value.trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
};

const resolveMemberSubscriptionForSuccessfulPayment = async (
  memberId: number,
  preferredSubscriptionId?: unknown
): Promise<Record<string, any> | null> => {
  const normalizedPreferredId = parseSubscriptionId(preferredSubscriptionId);

  if (normalizedPreferredId) {
    const { data: preferredSubscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', normalizedPreferredId)
      .eq('member_id', memberId)
      .maybeSingle();

    if (preferredSubscription) {
      return preferredSubscription as Record<string, any>;
    }
  }

  const { data: candidateSubscriptions, error: candidateError } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('member_id', memberId)
    .in('status', ['pending_payment', 'pending', 'active'])
    .order('created_at', { ascending: false })
    .limit(10);

  if (candidateError) {
    logEPX({
      level: 'warn',
      phase: 'hosted-complete',
      message: 'Failed to resolve candidate subscriptions for successful payment',
      data: {
        memberId,
        preferredSubscriptionId: normalizedPreferredId,
        error: candidateError.message,
      }
    });
    return null;
  }

  const normalizedCandidates = (candidateSubscriptions || []) as Array<Record<string, any>>;
  if (normalizedCandidates.length === 0) {
    return null;
  }

  const pendingCandidate = normalizedCandidates.find((candidate) => {
    const status = String(candidate.status || '').toLowerCase();
    return status === 'pending_payment' || status === 'pending';
  });

  return pendingCandidate || normalizedCandidates[0] || null;
};

const reconcileSubscriptionAfterSuccessfulPayment = async (options: {
  memberId: number;
  paymentRecord?: PaymentRecord | null;
  phase: 'hosted-complete' | 'callback';
  paymentToken?: string | null;
  paymentMethodType?: string | null;
}): Promise<number | null> => {
  const { memberId, paymentRecord, phase, paymentToken, paymentMethodType } = options;

  let memberRecord: Record<string, any> | null = null;
  try {
    const { data } = await supabase
      .from('members')
      .select('id, plan_id, total_monthly_price, first_payment_date, enrollment_date, status, payment_method_type')
      .eq('id', memberId)
      .maybeSingle();
    memberRecord = (data as Record<string, any> | null) || null;
  } catch (memberLoadError: any) {
    logEPX({
      level: 'warn',
      phase,
      message: 'Unable to load member while reconciling successful payment',
      data: { memberId, error: memberLoadError?.message }
    });
  }

  const normalizedMethodType = paymentMethodType === 'ACH' ? 'ACH' : 'CreditCard';
  const resolvedAuthGuid = typeof paymentRecord?.epx_auth_guid === 'string' && paymentRecord.epx_auth_guid.trim()
    ? paymentRecord.epx_auth_guid.trim()
    : null;
  const safePaymentToken = typeof paymentToken === 'string' && paymentToken.trim()
    ? paymentToken.trim()
    : null;

  if (safePaymentToken) {
    try {
      await storage.upsertMemberPaymentToken({
        memberId,
        paymentMethodType: normalizedMethodType,
        token: safePaymentToken,
        originalNetworkTransId: normalizedMethodType === 'CreditCard' ? resolvedAuthGuid : null,
      });
      logEPX({
        level: 'info',
        phase,
        message: 'Recurring token row upserted from hosted completion',
        data: { memberId, paymentId: paymentRecord?.id || null, paymentMethodType: normalizedMethodType }
      });
    } catch (tokenError: any) {
      logEPX({
        level: 'warn',
        phase,
        message: 'Failed to upsert payment_tokens during hosted completion reconciliation',
        data: {
          memberId,
          paymentId: paymentRecord?.id || null,
          paymentMethodType: normalizedMethodType,
          error: tokenError?.message,
        }
      });
    }
  }

  let candidate = await resolveMemberSubscriptionForSuccessfulPayment(memberId, paymentRecord?.subscription_id);

  if (!candidate && memberRecord?.plan_id) {
    const paymentCreatedAtIso = paymentRecord?.created_at ? new Date(paymentRecord.created_at).toISOString() : null;
    const firstPaymentIso = memberRecord?.first_payment_date ? new Date(memberRecord.first_payment_date).toISOString() : null;
    const enrollmentIso = memberRecord?.enrollment_date ? new Date(memberRecord.enrollment_date).toISOString() : null;
    const billingBaseIso = paymentCreatedAtIso || firstPaymentIso || enrollmentIso || new Date().toISOString();
    const nextBillingDate = calculateNextBillingDate(new Date(billingBaseIso)).toISOString();

    try {
      const createdSubscription = await storage.createSubscription({
        userId: null,
        memberId,
        planId: Number(memberRecord.plan_id),
        status: 'active',
        amount: parseNumericValue(memberRecord.total_monthly_price) ?? parseNumericValue(paymentRecord?.amount) ?? 0,
        startDate: new Date(enrollmentIso || billingBaseIso),
        nextBillingDate: new Date(nextBillingDate),
        updatedAt: new Date(),
      } as any);

      candidate = {
        id: createdSubscription.id,
        status: createdSubscription.status,
        next_billing_date: createdSubscription.nextBillingDate,
        amount: createdSubscription.amount,
      } as Record<string, any>;

      logEPX({
        level: 'info',
        phase,
        message: 'Created missing subscription during hosted completion reconciliation',
        data: {
          memberId,
          paymentId: paymentRecord?.id || null,
          subscriptionId: createdSubscription.id,
          nextBillingDate,
        }
      });
    } catch (createSubError: any) {
      logEPX({
        level: 'warn',
        phase,
        message: 'Failed to create missing subscription during hosted completion reconciliation',
        data: {
          memberId,
          paymentId: paymentRecord?.id || null,
          error: createSubError?.message,
        }
      });
    }
  }

  if (!candidate) {
    logEPX({
      level: 'warn',
      phase,
      message: 'No subscription found to reconcile after successful payment',
      data: {
        memberId,
        paymentId: paymentRecord?.id || null,
      }
    });
    return null;
  }

  const subscriptionId = parseSubscriptionId(candidate.id);
  if (!subscriptionId) {
    return null;
  }

  const status = String(candidate.status || '').toLowerCase();
  const paymentCreatedAtIso = paymentRecord?.created_at ? new Date(paymentRecord.created_at).toISOString() : null;
  const firstPaymentIso = memberRecord?.first_payment_date ? new Date(memberRecord.first_payment_date).toISOString() : null;
  const enrollmentIso = memberRecord?.enrollment_date ? new Date(memberRecord.enrollment_date).toISOString() : null;
  const billingBaseIso = paymentCreatedAtIso || firstPaymentIso || enrollmentIso || new Date().toISOString();
  const nextBillingDate = calculateNextBillingDate(new Date(billingBaseIso)).toISOString();
  const updatePayload: Record<string, any> = { updatedAt: new Date() };

  if (status === 'pending_payment' || status === 'pending') {
    updatePayload.status = 'active';
    updatePayload.nextBillingDate = nextBillingDate;
  } else if (status === 'active' && !candidate.next_billing_date) {
    updatePayload.nextBillingDate = nextBillingDate;
  }

  if (Object.keys(updatePayload).length > 0) {
    try {
      await storage.updateSubscription(subscriptionId, updatePayload);
    } catch (error: any) {
      logEPX({
        level: 'warn',
        phase,
        message: 'Failed updating subscription during successful payment reconciliation',
        data: {
          memberId,
          subscriptionId,
          paymentId: paymentRecord?.id || null,
          error: error?.message,
        }
      });
    }
  }

  if (paymentRecord?.id) {
    const existingPaymentSubscriptionId = parseSubscriptionId(paymentRecord.subscription_id);
    if (!existingPaymentSubscriptionId || existingPaymentSubscriptionId !== subscriptionId) {
      try {
        await storage.updatePayment(Number(paymentRecord.id), {
          subscriptionId: String(subscriptionId),
        });
      } catch (error: any) {
        logEPX({
          level: 'warn',
          phase,
          message: 'Failed to attach reconciled subscription to payment record',
          data: {
            memberId,
            subscriptionId,
            paymentId: paymentRecord.id,
            error: error?.message,
          }
        });
      }
    }
  }

  return subscriptionId;
};

const toObject = (value: unknown): Record<string, any> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, any>;
};

const resolveGroupMemberPlanId = (groupMember: any, paymentMetadata: Record<string, any>): number | null => {
  const memberMetadata = toObject(groupMember?.metadata);
  const memberPlanSelection = toObject(memberMetadata?.planSelection);
  const memberPayload = toObject(groupMember?.registration_payload ?? groupMember?.registrationPayload);
  const payloadPlanSelection = toObject(memberPayload?.planSelection);

  const rawPlanId =
    paymentMetadata.planId
    ?? memberPlanSelection?.planId
    ?? memberMetadata?.selectedPlanId
    ?? memberMetadata?.planId
    ?? payloadPlanSelection?.planId
    ?? memberPayload?.selectedPlanId
    ?? memberPayload?.planId;

  const parsedPlanId = parseNumericValue(rawPlanId);
  return parsedPlanId && parsedPlanId > 0 ? Math.trunc(parsedPlanId) : null;
};

async function ensureRecurringArtifactsForGroupPayment(options: {
  groupId: string;
  groupMemberId: number;
  paymentRecord: PaymentRecord;
  paymentMetadata: Record<string, any>;
  bricToken: string;
  paymentMethodType: string;
  authGuid?: string | null;
}): Promise<{ memberId: number | null; subscriptionId: number | null }> {
  const { groupId, groupMemberId, paymentRecord, paymentMetadata, bricToken, paymentMethodType, authGuid } = options;

  const { data: groupMember, error: groupMemberError } = await supabase
    .from('group_members')
    .select('*')
    .eq('id', groupMemberId)
    .eq('group_id', groupId)
    .maybeSingle();

  if (groupMemberError || !groupMember) {
    logEPX({
      level: 'warn',
      phase: 'callback',
      message: 'Unable to resolve group member for recurring artifact setup',
      data: { groupId, groupMemberId, error: groupMemberError?.message || null }
    });
    return { memberId: null, subscriptionId: null };
  }

  const normalizedMethodType = paymentMethodType === 'ACH' ? 'ACH' : 'CreditCard';
  const resolvedAuthGuid = typeof authGuid === 'string' && authGuid.trim()
    ? authGuid.trim()
    : (typeof paymentRecord?.epx_auth_guid === 'string' && paymentRecord.epx_auth_guid.trim()
      ? paymentRecord.epx_auth_guid.trim()
      : null);
  const currentAmount = parseNumericValue(paymentRecord.amount) ?? parseNumericValue(groupMember.total_amount) ?? 0;
  const planId = resolveGroupMemberPlanId(groupMember, paymentMetadata);

  let memberId = parseNumericValue(groupMember.member_id);
  if (memberId) {
    memberId = Math.trunc(memberId);
  }

  if (!memberId) {
    if (!planId) {
      logEPX({
        level: 'warn',
        phase: 'callback',
        message: 'Group member recurring setup skipped because planId is missing',
        data: { groupId, groupMemberId, paymentId: paymentRecord.id }
      });
      return { memberId: null, subscriptionId: null };
    }

    const createdMember = await storage.createMember({
      firstName: groupMember.first_name || 'Group',
      lastName: groupMember.last_name || 'Member',
      email: groupMember.email || `group-member-${groupMemberId}@getmydpc.local`,
      phone: groupMember.phone || null,
      dateOfBirth: groupMember.date_of_birth || null,
      memberType: groupMember.relationship === 'primary' ? 'employee' : (groupMember.relationship || 'dependent'),
      planId,
      coverageType: groupMember.tier || null,
      totalMonthlyPrice: currentAmount > 0 ? currentAmount : null,
      paymentToken: bricToken,
      paymentMethodType: normalizedMethodType,
      status: 'active',
      isActive: true,
      firstPaymentDate: new Date().toISOString(),
      membershipStartDate: new Date().toISOString(),
    });

    memberId = Number(createdMember.id);

    await supabase
      .from('group_members')
      .update({ member_id: memberId, updated_at: new Date().toISOString() })
      .eq('id', groupMemberId)
      .eq('group_id', groupId);
  } else {
    await storage.updateMember(memberId, {
      paymentToken: bricToken,
      paymentMethodType: normalizedMethodType,
      status: 'active',
      isActive: true,
      firstPaymentDate: new Date().toISOString(),
    });
  }

  await storage.upsertMemberPaymentToken({
    memberId,
    paymentMethodType: normalizedMethodType,
    token: bricToken,
    originalNetworkTransId: normalizedMethodType === 'CreditCard' ? resolvedAuthGuid : null,
  });

  const { data: existingSubscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('member_id', memberId)
    .in('status', ['active', 'pending', 'pending_payment'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextBillingDate = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString();
  let subscriptionId: number | null = null;

  if (existingSubscription?.id) {
    subscriptionId = Number(existingSubscription.id);
    await storage.updateSubscription(subscriptionId, {
      status: 'active',
      amount: currentAmount > 0 ? currentAmount : parseNumericValue(existingSubscription.amount) || 0,
      nextBillingDate,
      updatedAt: new Date(),
    });
  } else if (planId) {
    const createdSubscription = await storage.createSubscription({
      userId: null,
      memberId,
      planId,
      status: 'active',
      amount: currentAmount > 0 ? currentAmount : 0,
      startDate: new Date(),
      nextBillingDate: new Date(nextBillingDate),
      updatedAt: new Date(),
    } as any);
    subscriptionId = Number(createdSubscription.id);
  }

  if (subscriptionId) {
    await storage.updatePayment(Number(paymentRecord.id), {
      memberId,
      subscriptionId: String(subscriptionId),
    });
  }

  return { memberId, subscriptionId };
}

type RecurringReadinessIssue = {
  code: string;
  message: string;
  details?: Record<string, any>;
};

type RecurringReadinessResult = {
  passed: boolean;
  checkedAt: string;
  phase: 'hosted-complete' | 'callback';
  flowType: 'individual' | 'group';
  memberId: number | null;
  groupId: string | null;
  groupMemberId: number | null;
  paymentId: number | null;
  subscriptionId: number | null;
  payerType: 'member' | 'group' | null;
  payerId: string | null;
  issues: RecurringReadinessIssue[];
};

const normalizeMethodTypeForRecurring = (value: unknown): 'ACH' | 'CreditCard' => {
  return String(value || '').trim().toUpperCase() === 'ACH' ? 'ACH' : 'CreditCard';
};

const normalizeHostedPaymentMethodType = (
  methodCandidate: unknown,
  tranTypeCandidate?: unknown,
): 'ACH' | 'CreditCard' => {
  const methodRaw = String(methodCandidate || '').trim().toLowerCase();
  const tranTypeRaw = String(tranTypeCandidate || '').trim().toUpperCase();

  if (methodRaw.includes('ach') || methodRaw.includes('bank')) {
    return 'ACH';
  }

  if (tranTypeRaw.startsWith('CK')) {
    return 'ACH';
  }

  return 'CreditCard';
};

const resolveHostedFallbackTranType = (paymentMethodType: 'ACH' | 'CreditCard'): 'CKC2' | 'CCE1' => {
  return paymentMethodType === 'ACH' ? 'CKC2' : 'CCE1';
};

const normalizeSubscriptionStatus = (value: unknown): string => {
  return String(value || '').trim().toLowerCase();
};

const addRecurringIssue = (
  issues: RecurringReadinessIssue[],
  code: string,
  message: string,
  details?: Record<string, any>,
) => {
  if (issues.some((entry) => entry.code === code)) {
    return;
  }
  issues.push({ code, message, details });
};

const createRecurringRepairHint = (result: RecurringReadinessResult) => {
  return {
    queued: !result.passed,
    queueType: 'admin_notification_followup',
    suggestedEndpoint: '/api/admin/diagnostic/recurring-billing/operator-workflow',
    suggestedMode: 'live',
    reasonCodes: result.issues.map((issue) => issue.code),
  };
};

async function runRecurringReadinessIntegrityCheck(options: {
  phase: 'hosted-complete' | 'callback';
  flowType: 'individual' | 'group';
  memberId: number | null;
  groupId?: string | null;
  groupMemberId?: number | null;
  paymentRecord?: PaymentRecord | null;
  expectedSubscriptionId?: number | null;
  paymentMethodType?: string | null;
}): Promise<RecurringReadinessResult> {
  const issues: RecurringReadinessIssue[] = [];
  const nowIso = new Date().toISOString();

  const phase = options.phase;
  const flowType = options.flowType;
  const memberId = options.memberId && Number.isFinite(options.memberId) && options.memberId > 0
    ? Math.trunc(options.memberId)
    : null;
  const groupId = typeof options.groupId === 'string' && options.groupId.trim()
    ? options.groupId.trim()
    : null;
  const groupMemberId = options.groupMemberId && Number.isFinite(options.groupMemberId) && options.groupMemberId > 0
    ? Math.trunc(options.groupMemberId)
    : null;
  const paymentRecord = options.paymentRecord || null;
  const paymentId = parseNumericValue(paymentRecord?.id);
  const expectedSubscriptionId = parseSubscriptionId(options.expectedSubscriptionId);
  const paymentSubscriptionId = parseSubscriptionId(paymentRecord?.subscription_id);
  const paymentMemberId = parseNumericValue(paymentRecord?.member_id);
  const billingReadyStatuses = (typeof (storage as any).getRecurringBillingReadySubscriptionStatuses === 'function'
    ? (storage as any).getRecurringBillingReadySubscriptionStatuses()
    : ['active']) as string[];
  const normalizedBillingReadyStatuses = billingReadyStatuses.map((status) => normalizeSubscriptionStatus(status));

  let payerType: 'member' | 'group' | null = null;
  let payerId: string | null = null;
  let resolvedSubscriptionId: number | null = expectedSubscriptionId || paymentSubscriptionId || null;

  if (!memberId) {
    addRecurringIssue(issues, 'MISSING_MEMBER_CONTEXT', 'Recurring readiness check is missing member context.');
  }

  if (!paymentRecord) {
    addRecurringIssue(issues, 'MISSING_PAYMENT_RECORD', 'Recurring readiness check did not receive a payment record.');
  }

  if (memberId && paymentMemberId && Math.trunc(paymentMemberId) !== memberId) {
    addRecurringIssue(
      issues,
      'PAYMENT_MEMBER_MISMATCH',
      'Succeeded payment member linkage does not match expected member.',
      { expectedMemberId: memberId, paymentMemberId: Math.trunc(paymentMemberId) },
    );
  }

  let groupMemberRow: Record<string, any> | null = null;
  if (flowType === 'group' && groupId && memberId) {
    if (groupMemberId) {
      const { data: strictMatch, error: strictMatchError } = await supabase
        .from('group_members')
        .select('id, group_id, member_id, status, payor_type')
        .eq('id', groupMemberId)
        .eq('group_id', groupId)
        .maybeSingle();

      if (strictMatchError || !strictMatch) {
        addRecurringIssue(
          issues,
          'GROUP_MEMBER_CONTEXT_MISSING',
          'Group member context could not be resolved for recurring chain validation.',
          { groupId, groupMemberId, error: strictMatchError?.message || null },
        );
      } else {
        groupMemberRow = strictMatch as Record<string, any>;
      }
    } else {
      const { data: groupMembers, error: groupMemberError } = await supabase
        .from('group_members')
        .select('id, group_id, member_id, status, payor_type')
        .eq('group_id', groupId)
        .eq('member_id', memberId)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (groupMemberError || !groupMembers || groupMembers.length === 0) {
        addRecurringIssue(
          issues,
          'GROUP_MEMBER_CONTEXT_MISSING',
          'Group member linkage was not found for recurring chain validation.',
          { groupId, memberId, error: groupMemberError?.message || null },
        );
      } else {
        groupMemberRow = (groupMembers[0] || null) as Record<string, any> | null;
      }
    }

    if (groupMemberRow) {
      const mappedMemberId = parseNumericValue(groupMemberRow.member_id);
      if (!mappedMemberId || Math.trunc(mappedMemberId) !== memberId) {
        addRecurringIssue(
          issues,
          'GROUP_MEMBER_LINK_MISMATCH',
          'Group member is not linked to the expected member record.',
          { groupId, expectedMemberId: memberId, actualMemberId: mappedMemberId },
        );
      }

      if (String(groupMemberRow.status || '').toLowerCase() === 'terminated') {
        addRecurringIssue(
          issues,
          'GROUP_MEMBER_TERMINATED',
          'Group member is terminated and cannot remain in recurring-ready chain.',
          { groupId, groupMemberId: groupMemberRow.id },
        );
      }
    }

    const { data: groupRecord, error: groupError } = await supabase
      .from('groups')
      .select('id, name, payor_type, metadata')
      .eq('id', groupId)
      .maybeSingle();

    if (groupError || !groupRecord) {
      addRecurringIssue(
        issues,
        'GROUP_CONTEXT_MISSING',
        'Group context could not be loaded for recurring payer resolution.',
        { groupId, error: groupError?.message || null },
      );
    } else {
      const gmPayor = String(groupMemberRow?.payor_type || '').trim().toLowerCase();
      const groupPayor = String(groupRecord.payor_type || '').trim().toLowerCase();
      const effectivePayor = gmPayor || groupPayor;
      payerType = effectivePayor === 'full' ? 'group' : 'member';
      payerId = payerType === 'group' ? String(groupId) : String(memberId);

      if (payerType === 'group') {
        const metadata = groupRecord.metadata && typeof groupRecord.metadata === 'object'
          ? (groupRecord.metadata as Record<string, any>)
          : {};
        const groupProfile = metadata.groupProfile && typeof metadata.groupProfile === 'object'
          ? (metadata.groupProfile as Record<string, any>)
          : {};
        const responsibleEmail = String(groupProfile?.responsiblePerson?.email || '').trim();
        const contactEmail = String(groupProfile?.contactPerson?.email || '').trim();
        if (!responsibleEmail && !contactEmail) {
          addRecurringIssue(
            issues,
            'GROUP_PAYER_CONTACT_MISSING',
            'Group payer requires a responsible/contact email for recurring billing routing.',
            { groupId },
          );
        }
      }
    }
  }

  if (flowType === 'individual' && memberId) {
    payerType = 'member';
    payerId = String(memberId);
  }

  let subscriptionRows: Array<Record<string, any>> = [];
  if (memberId) {
    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from('subscriptions')
      .select('id, member_id, status, next_billing_date, created_at')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
      .limit(25);

    if (subscriptionsError) {
      addRecurringIssue(
        issues,
        'SUBSCRIPTION_LOOKUP_FAILED',
        'Failed to load subscription artifacts for recurring readiness check.',
        { memberId, error: subscriptionsError.message },
      );
    } else {
      subscriptionRows = ((subscriptions || []) as Array<Record<string, any>>);
    }
  }

  let selectedSubscription: Record<string, any> | null = null;
  if (subscriptionRows.length > 0) {
    if (expectedSubscriptionId) {
      selectedSubscription = subscriptionRows.find((row) => parseSubscriptionId(row.id) === expectedSubscriptionId) || null;
    }

    if (!selectedSubscription && paymentSubscriptionId) {
      selectedSubscription = subscriptionRows.find((row) => parseSubscriptionId(row.id) === paymentSubscriptionId) || null;
    }

    if (!selectedSubscription) {
      selectedSubscription = subscriptionRows.find((row) => normalizedBillingReadyStatuses.includes(normalizeSubscriptionStatus(row.status))) || null;
    }

    if (!selectedSubscription) {
      selectedSubscription = subscriptionRows.find((row) => {
        const status = normalizeSubscriptionStatus(row.status);
        return status === 'pending' || status === 'pending_payment';
      }) || null;
    }

    if (!selectedSubscription) {
      selectedSubscription = subscriptionRows[0] || null;
    }
  }

  if (!selectedSubscription) {
    addRecurringIssue(
      issues,
      'SUBSCRIPTION_MISSING',
      'No subscription artifact was found for recurring billing.',
      { memberId, expectedSubscriptionId, paymentSubscriptionId },
    );
  } else {
    const selectedId = parseSubscriptionId(selectedSubscription.id);
    resolvedSubscriptionId = selectedId || resolvedSubscriptionId;

    const selectedMemberId = parseNumericValue(selectedSubscription.member_id);
    if (!selectedMemberId || (memberId && Math.trunc(selectedMemberId) !== memberId)) {
      addRecurringIssue(
        issues,
        'SUBSCRIPTION_MEMBER_MISMATCH',
        'Subscription is not linked to the expected member context.',
        { memberId, subscriptionMemberId: selectedMemberId, subscriptionId: selectedId },
      );
    }

    const normalizedStatus = normalizeSubscriptionStatus(selectedSubscription.status);
    if (!normalizedBillingReadyStatuses.includes(normalizedStatus)) {
      addRecurringIssue(
        issues,
        'SUBSCRIPTION_STATUS_NOT_READY',
        'Subscription status is not recurring-ready under current business rules.',
        {
          subscriptionId: selectedId,
          status: selectedSubscription.status,
          allowedStatuses: billingReadyStatuses,
        },
      );
    }

    if (!selectedSubscription.next_billing_date) {
      addRecurringIssue(
        issues,
        'NEXT_BILLING_DATE_MISSING',
        'Subscription next_billing_date is missing for recurring scheduling.',
        { subscriptionId: selectedId },
      );
    }
  }

  if (subscriptionRows.length > 0) {
    const recurringStatuses = new Set(['active', 'pending', 'pending_payment']);
    const duplicateCandidates = subscriptionRows.filter((row) => {
      return recurringStatuses.has(normalizeSubscriptionStatus(row.status));
    });
    if (duplicateCandidates.length > 1) {
      addRecurringIssue(
        issues,
        'DUPLICATE_SUBSCRIPTION_ARTIFACTS',
        'Multiple recurring-capable subscription artifacts exist for the same member.',
        {
          memberId,
          count: duplicateCandidates.length,
          subscriptionIds: duplicateCandidates
            .map((row) => parseSubscriptionId(row.id))
            .filter((id) => Boolean(id)),
        },
      );
    }
  }

  if (memberId) {
    const normalizedMethodType = normalizeMethodTypeForRecurring(options.paymentMethodType || paymentRecord?.payment_method_type);
    const { data: paymentTokens, error: paymentTokensError } = await supabase
      .from('payment_tokens')
      .select('id, member_id, payment_method_type, is_active')
      .eq('member_id', memberId)
      .eq('is_active', true)
      .eq('payment_method_type', normalizedMethodType)
      .limit(5);

    if (paymentTokensError) {
      addRecurringIssue(
        issues,
        'TOKEN_LOOKUP_FAILED',
        'Failed to verify recurring payment token placement.',
        { memberId, paymentMethodType: normalizedMethodType, error: paymentTokensError.message },
      );
    } else if (!paymentTokens || paymentTokens.length === 0) {
      addRecurringIssue(
        issues,
        'PAYMENT_TOKEN_MISSING',
        'No active recurring payment token exists in payment_tokens for this enrollment.',
        { memberId, paymentMethodType: normalizedMethodType },
      );
    }
  }

  if (paymentRecord) {
    if (!paymentSubscriptionId || (resolvedSubscriptionId && paymentSubscriptionId !== resolvedSubscriptionId)) {
      addRecurringIssue(
        issues,
        'PAYMENT_SUBSCRIPTION_LINK_MISSING',
        'Succeeded payment is not linked to the reconciled subscription artifact.',
        {
          paymentId,
          paymentSubscriptionId,
          expectedSubscriptionId: resolvedSubscriptionId,
        },
      );
    }

    if (!paymentMemberId || (memberId && Math.trunc(paymentMemberId) !== memberId)) {
      addRecurringIssue(
        issues,
        'PAYMENT_MEMBER_LINK_MISSING',
        'Succeeded payment is not linked to the correct member context.',
        { paymentId, paymentMemberId, expectedMemberId: memberId },
      );
    }
  }

  return {
    passed: issues.length === 0,
    checkedAt: nowIso,
    phase,
    flowType,
    memberId,
    groupId,
    groupMemberId,
    paymentId: paymentId ? Math.trunc(paymentId) : null,
    subscriptionId: resolvedSubscriptionId,
    payerType,
    payerId,
    issues,
  };
}

async function handleRecurringReadinessFailure(result: RecurringReadinessResult): Promise<void> {
  if (result.passed) {
    return;
  }

  const issueSummary = result.issues.map((issue) => `${issue.code}: ${issue.message}`).join(' | ');

  logEPX({
    level: 'warn',
    phase: result.phase,
    message: 'Recurring-readiness integrity check failed',
    data: {
      flowType: result.flowType,
      memberId: result.memberId,
      groupId: result.groupId,
      groupMemberId: result.groupMemberId,
      paymentId: result.paymentId,
      subscriptionId: result.subscriptionId,
      payerType: result.payerType,
      payerId: result.payerId,
      issueCount: result.issues.length,
      issues: result.issues,
      repairHint: createRecurringRepairHint(result),
    }
  });

  try {
    await storage.createAdminNotification({
      type: 'recurring_readiness_integrity_failed',
      memberId: result.memberId,
      subscriptionId: result.subscriptionId,
      errorMessage: issueSummary || 'Recurring readiness integrity check failed',
      metadata: {
        recurringReadinessIntegrity: result,
        repairHint: createRecurringRepairHint(result),
      },
    });
  } catch (notificationError: any) {
    logEPX({
      level: 'error',
      phase: result.phase,
      message: 'Failed to create admin notification for recurring-readiness failure',
      data: {
        memberId: result.memberId,
        paymentId: result.paymentId,
        error: notificationError?.message,
      }
    });
  }

  try {
    await (storage.supabase as any).from('admin_logs').insert({
      log_type: 'recurring_readiness_integrity_failed',
      member_id: result.memberId,
      action: 'post_success_recurring_integrity_check',
      metadata: {
        recurringReadinessIntegrity: result,
        repairHint: createRecurringRepairHint(result),
      },
      created_at: new Date().toISOString(),
    });
  } catch (auditLogError: any) {
    logEPX({
      level: 'warn',
      phase: result.phase,
      message: 'Could not persist recurring-readiness failure audit log',
      data: {
        memberId: result.memberId,
        paymentId: result.paymentId,
        error: auditLogError?.message,
      }
    });
  }
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
    const { data: { user }, error } = await (supabase.auth as any).getUser(token);
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
      retryInitiatedBy,
      groupId,
      groupMemberId,
      selectedGroupMemberIds,
      paymentScope,
      paymentMethodType,
      deliveryMode,
    } = req.body;

    const normalizedRequestedPaymentMethodType = String(paymentMethodType || '').trim().toUpperCase() === 'ACH'
      ? 'ACH'
      : 'CreditCard';
    const normalizedDeliveryMode = typeof deliveryMode === 'string'
      ? deliveryMode.trim().toLowerCase()
      : '';
    const isPaymentLinkMode = normalizedDeliveryMode === 'payment_link';

    if (isPaymentLinkMode) {
      if (!authenticatedUser || !hasAtLeastRole(authenticatedUser.role, 'agent')) {
        return res.status(403).json({
          success: false,
          error: 'Authenticated agent/admin access is required to generate payment links'
        });
      }
    }

    const explicitGroupId = typeof groupId === 'string' ? groupId.trim() : '';
    const explicitGroupMemberId = parseNumericGroupMemberId(groupMemberId);
    const explicitSelectedGroupMemberIds = parseNumericGroupMemberIdList(selectedGroupMemberIds);
    const hasGroupPaymentContext = Boolean(explicitGroupId && explicitGroupMemberId);
    const normalizedPaymentScope = typeof paymentScope === 'string' ? paymentScope.trim().toLowerCase() : null;
    const isGroupInvoiceScope = normalizedPaymentScope === 'group_invoice' && Boolean(explicitGroupId);

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
    let memberId: number | null = null;
    let userId: string | null = null;

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

    // Determine whether the customerId refers to a member (numeric) or a staff user (uuid)
    memberId = derivedMemberId;
    userId = derivedUserId;

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

    // Guardrails to avoid duplicate charges from repeated checkout launches.
    if (memberId) {
      const latestEnrollmentPayment = await storage.getLatestEnrollmentPayment(memberId);

      if (latestEnrollmentPayment) {
        const latestStatus = String(latestEnrollmentPayment.status || '').toLowerCase();
        const latestTransactionId = latestEnrollmentPayment.transaction_id || null;

        if (!isRetryRequest && ['succeeded', 'success', 'completed'].includes(latestStatus)) {
          return res.status(409).json({
            success: false,
            code: 'PAYMENT_ALREADY_COMPLETED',
            message: 'This enrollment already has a successful payment. Open payment history before creating a new charge.',
            existingPaymentId: latestEnrollmentPayment.id,
            existingTransactionId: latestTransactionId,
          });
        }

        if (['pending', 'processing'].includes(latestStatus)) {
          const createdAtMs = latestEnrollmentPayment.created_at
            ? new Date(latestEnrollmentPayment.created_at as unknown as string).getTime()
            : NaN;
          const withinIntentWindow = Number.isFinite(createdAtMs)
            ? (Date.now() - createdAtMs) < (20 * 60 * 1000)
            : true;

          const resumeSamePendingIntent = isRetryRequest
            && Number(parsedRetryPaymentId) === Number(latestEnrollmentPayment.id);

          if (withinIntentWindow && !resumeSamePendingIntent) {
            return res.status(409).json({
              success: false,
              code: 'PAYMENT_INTENT_ACTIVE',
              message: 'A payment session is already in progress for this enrollment. Please complete or fail that attempt before starting another.',
              existingPaymentId: latestEnrollmentPayment.id,
              existingTransactionId: latestTransactionId,
            });
          }

          if (withinIntentWindow && resumeSamePendingIntent) {
            logEPX({
              level: 'info',
              phase: 'create-payment',
              message: 'Resuming existing active payment intent by explicit retry',
              data: {
                memberId,
                paymentId: latestEnrollmentPayment.id,
                transactionId: latestTransactionId,
              }
            });
          }
        }
      }
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
        groupId: explicitGroupId || null,
        groupMemberId: explicitGroupMemberId,
        paymentScope: normalizedPaymentScope,
        requestedPaymentMethodType: normalizedRequestedPaymentMethodType,
        amountOverride: hasAmountOverride ? parsedAmountOverride : null,
        overrideRequestedBy: overrideApprovedBy?.id || requestUserId || null
      }
    });

    // Server-side reCAPTCHA verification (production only or when enabled)
    if (isRecaptchaEnabled() && !isPaymentLinkMode) {
      const verifyResult = await verifyRecaptcha(captchaToken || '', 'hosted_checkout');
      logEPX({ level: verifyResult.success ? 'info' : 'warn', phase: 'recaptcha', message: 'Token verification', data: verifyResult });
      if (!verifyResult.success) {
        return res.status(400).json({ success: false, error: 'Captcha verification failed', code: 'RECAPTCHA_FAILED' });
      }
    }

    // Generate order number (transaction ID)
    const orderNumber = Date.now().toString().slice(-10);
    const shortInvoiceNo = buildShortInvoiceNo(effectiveCustomerName, effectiveDescription, orderNumber);

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

      paymentMetadata.requestedPaymentMethodType = normalizedRequestedPaymentMethodType;
      paymentMetadata.deliveryMode = isPaymentLinkMode ? 'payment_link' : 'embedded_checkout';
      paymentMetadata.shortInvoiceNo = shortInvoiceNo;

      if (hasGroupPaymentContext) {
        paymentMetadata.groupPaymentContext = {
          groupId: explicitGroupId,
          groupMemberId: explicitGroupMemberId,
        };
      }

      if (isGroupInvoiceScope) {
        paymentMetadata.groupInvoiceContext = {
          groupId: explicitGroupId,
          selectedGroupMemberIds: explicitSelectedGroupMemberIds,
        };
        paymentMetadata.paymentScope = 'group_invoice';
      }

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

      const resolvedSubscriptionId = parseSubscriptionId(subscriptionId)
        || (memberId ? parseSubscriptionId((await resolveMemberSubscriptionForSuccessfulPayment(memberId))?.id) : null);

      const paymentData = {
        memberId,
        userId,
        subscriptionId: resolvedSubscriptionId ? String(resolvedSubscriptionId) : null,
        amount: effectiveAmount.toString(),
        currency: 'USD',
        status: 'pending' as const,
        paymentMethod: normalizedRequestedPaymentMethodType === 'ACH' ? ('ach' as const) : ('card' as const),
        paymentMethodType: normalizedRequestedPaymentMethodType,
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

      if (memberId) {
        await storage.createAdminNotification({
          type: 'payment_initiated',
          title: 'Payment Session Started',
          message: `Hosted checkout started for member #${memberId} (${effectiveCustomerName || effectiveCustomerEmail}).`,
          memberId,
          metadata: {
            paymentId: createdPayment?.id,
            transactionId: orderNumber,
            amount: effectiveAmount,
            retryContext,
          },
        });
      }

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
    const responsePayload: {
      success: boolean;
      transactionId: string;
      sessionId: string | undefined;
      publicKey: string | undefined;
      scriptUrl: string;
      terminalProfileId: string;
      environment: 'sandbox' | 'production';
      captchaMode: string;
      paymentMethod: 'hosted-checkout';
      retryContext: Record<string, any> | undefined;
      overrideApplied: boolean | undefined;
      overrideAmount: number | undefined;
      requestedAmount: number | undefined;
      testPayment: boolean | undefined;
      hostedPaymentLink?: string;
      formData: {
        amount: string;
        orderNumber: string;
        invoiceNumber: string;
        email: string;
        billingName: string;
      } & Record<string, any>;
    } = {
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

    if (isPaymentLinkMode) {
      responsePayload.formData.invoiceNumber = shortInvoiceNo;
      responsePayload.hostedPaymentLink = buildHostedPaymentLink({
        scriptUrl: config.scriptUrl,
        environment: config.environment,
        terminalProfileId: config.terminalProfileId,
        amount: effectiveAmount.toFixed(2),
        invoiceNo: shortInvoiceNo,
        description: effectiveDescription,
        billingName: effectiveCustomerName || 'Customer',
        email: effectiveCustomerEmail,
        billingAddress: effectiveBillingAddress,
      });
    }

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
              overrideApprovedBy: overrideApprovedBy?.id || null,
              deliveryMode: isPaymentLinkMode ? 'payment_link' : 'embedded_checkout',
              shortInvoiceNo,
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
      paymentMethodType,
      memberId,
      authGuid,
      authCode,
      amount
    } = req.body || {};

    const normalizedAuthGuid = normalizeHostedAuthGuid(authGuid, paymentToken);
    const authGuidSource = normalizedAuthGuid ? 'complete.authGuid' : null;

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

    const paymentMetadata = parsePaymentMetadata(paymentRecord.metadata);
    const normalizedCompletePaymentMethodType = normalizeHostedPaymentMethodType(
      paymentMethodType
      || paymentRecord.payment_method_type
      || paymentMetadata.requestedPaymentMethodType,
    );
    const resolvedCompleteTranType = resolveHostedFallbackTranType(normalizedCompletePaymentMethodType);
    const groupPaymentContext = extractGroupPaymentContext(paymentMetadata);
    const groupInvoiceContext = extractGroupInvoiceContext(paymentMetadata);

    if (!numericMemberId) {
      if (!groupPaymentContext && !groupInvoiceContext) {
        return res.status(400).json({
          success: false,
          error: 'Unable to determine member for this payment'
        });
      }

      const persistResult = await persistHostedPaymentUpdate({
        epxTransactionId: transactionId,
        authGuid: normalizedAuthGuid,
        authGuidSource,
        authCode,
        amount,
        bricTokenPresent: true,
        paymentStatus: 'succeeded',
        tranType: resolvedCompleteTranType,
        paymentMethodType: normalizedCompletePaymentMethodType
      });

      const resolvedGroupId = groupPaymentContext?.groupId || groupInvoiceContext?.groupId || null;

      const nextMetadata: Record<string, any> = {
        ...paymentMetadata,
        groupPaymentContext: {
          ...(paymentMetadata.groupPaymentContext && typeof paymentMetadata.groupPaymentContext === 'object'
            ? paymentMetadata.groupPaymentContext
            : {}),
          ...(groupPaymentContext || {}),
          ...(resolvedGroupId ? { groupId: resolvedGroupId } : {}),
          hostedCompleteAt: new Date().toISOString(),
          hostedCompleteVia: 'frontend-complete',
        },
      };

      if (groupInvoiceContext) {
        nextMetadata.groupInvoiceContext = {
          ...(paymentMetadata.groupInvoiceContext && typeof paymentMetadata.groupInvoiceContext === 'object'
            ? paymentMetadata.groupInvoiceContext
            : {}),
          ...(resolvedGroupId ? { groupId: resolvedGroupId } : {}),
          hostedCompleteAt: new Date().toISOString(),
          hostedCompleteVia: 'frontend-complete',
        };
      }

      if (persistResult.paymentRecord?.id) {
        try {
          await storage.updatePayment(persistResult.paymentRecord.id, {
            metadata: nextMetadata,
          });
        } catch (metadataError: any) {
          logEPX({
            level: 'warn',
            phase: 'hosted-complete',
            message: 'Unable to persist group hosted completion metadata',
            data: {
              error: metadataError?.message,
              paymentId: persistResult.paymentRecord.id,
            }
          });
        }
      }

      if (persistResult.paymentRecord && typeof paymentToken === 'string' && paymentToken.trim()) {
        const recurringReadinessChecks: RecurringReadinessResult[] = [];

        if (groupPaymentContext) {
          const recurringArtifactResult = await ensureRecurringArtifactsForGroupPayment({
            groupId: groupPaymentContext.groupId,
            groupMemberId: groupPaymentContext.groupMemberId,
            paymentRecord: persistResult.paymentRecord,
            paymentMetadata: nextMetadata,
            bricToken: paymentToken,
            paymentMethodType: normalizedCompletePaymentMethodType,
          });

          const recurringReadiness = await runRecurringReadinessIntegrityCheck({
            phase: 'hosted-complete',
            flowType: 'group',
            memberId: recurringArtifactResult.memberId,
            groupId: groupPaymentContext.groupId,
            groupMemberId: groupPaymentContext.groupMemberId,
            paymentRecord: persistResult.paymentRecord,
            expectedSubscriptionId: recurringArtifactResult.subscriptionId,
            paymentMethodType: normalizedCompletePaymentMethodType,
          });
          recurringReadinessChecks.push(recurringReadiness);
          await handleRecurringReadinessFailure(recurringReadiness);
        }

        if (groupInvoiceContext && Array.isArray(groupInvoiceContext.selectedGroupMemberIds)) {
          for (const selectedGroupMemberId of groupInvoiceContext.selectedGroupMemberIds) {
            const recurringArtifactResult = await ensureRecurringArtifactsForGroupPayment({
              groupId: groupInvoiceContext.groupId,
              groupMemberId: selectedGroupMemberId,
              paymentRecord: persistResult.paymentRecord,
              paymentMetadata: nextMetadata,
              bricToken: paymentToken,
              paymentMethodType: normalizedCompletePaymentMethodType,
            });

            const recurringReadiness = await runRecurringReadinessIntegrityCheck({
              phase: 'hosted-complete',
              flowType: 'group',
              memberId: recurringArtifactResult.memberId,
              groupId: groupInvoiceContext.groupId,
              groupMemberId: selectedGroupMemberId,
              paymentRecord: persistResult.paymentRecord,
              expectedSubscriptionId: recurringArtifactResult.subscriptionId,
              paymentMethodType: normalizedCompletePaymentMethodType,
            });
            recurringReadinessChecks.push(recurringReadiness);
            await handleRecurringReadinessFailure(recurringReadiness);
          }
        }

        if (persistResult.paymentRecord.id && recurringReadinessChecks.length > 0) {
          try {
            await storage.updatePayment(persistResult.paymentRecord.id, {
              metadata: {
                ...nextMetadata,
                recurringReadinessIntegrity: {
                  checkedAt: new Date().toISOString(),
                  phase: 'hosted-complete',
                  flowType: 'group',
                  passedCount: recurringReadinessChecks.filter((entry) => entry.passed).length,
                  failedCount: recurringReadinessChecks.filter((entry) => !entry.passed).length,
                  checks: recurringReadinessChecks,
                },
              },
            });
          } catch (integrityMetadataError: any) {
            logEPX({
              level: 'warn',
              phase: 'hosted-complete',
              message: 'Unable to persist group recurring-readiness integrity metadata',
              data: {
                paymentId: persistResult.paymentRecord.id,
                error: integrityMetadataError?.message,
              }
            });
          }
        }
      }

      return res.json({
        success: true,
        member: null,
        paymentId: persistResult.paymentRecord?.id || null,
        groupPayment: true,
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
      authGuid: normalizedAuthGuid,
      authGuidSource,
      authCode,
      amount,
      memberId: numericMemberId,
      bricTokenPresent: true,
      paymentStatus: 'succeeded',
      tranType: resolvedCompleteTranType,
      paymentMethodType: normalizedCompletePaymentMethodType
    });

    let updatedMember: any = null;

    try {
      updatedMember = await storage.updateMember(numericMemberId, {
        paymentToken,
        paymentMethodType: normalizedCompletePaymentMethodType,
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

    const reconciledSubscriptionId = await reconcileSubscriptionAfterSuccessfulPayment({
      memberId: Number(numericMemberId),
      paymentRecord: persistResult.paymentRecord,
      phase: 'hosted-complete',
        paymentToken,
        paymentMethodType: normalizedCompletePaymentMethodType,
    });

    const recurringReadiness = await runRecurringReadinessIntegrityCheck({
      phase: 'hosted-complete',
      flowType: 'individual',
      memberId: Number(numericMemberId),
      paymentRecord: persistResult.paymentRecord,
      expectedSubscriptionId: reconciledSubscriptionId,
      paymentMethodType: normalizedCompletePaymentMethodType,
    });
    await handleRecurringReadinessFailure(recurringReadiness);

    return res.json({
      success: true,
      member: updatedMember,
        paymentId: persistResult.paymentRecord?.id || null,
        reconciliation: {
          memberId: Number(numericMemberId),
          subscriptionId: reconciledSubscriptionId,
          tokenUpsertAttempted: Boolean(typeof paymentToken === 'string' && paymentToken.trim()),
        },
        recurringReadiness,
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
      amount,
      paymentMethodType
    } = req.body || {};

    const normalizedFailureMethodType = String(paymentMethodType || '').trim().toUpperCase() === 'ACH'
      ? 'ACH'
      : 'CreditCard';

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
          tranType: normalizedFailureMethodType === 'ACH' ? 'CKC2' : 'CCE1',
          paymentMethodType: normalizedFailureMethodType
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
 * Handle success callback from EPX
 */
router.post('/api/epx/hosted/callback', async (req: Request, res: Response) => {
  const callbackStartTime = Date.now();
  let currentEnvironment = 'unknown';
  
  try {
    if (!hostedCheckoutService) {
      return res.status(503).json({
        success: false,
        error: 'Service not initialized'
      });
    }

    currentEnvironment = await paymentEnvironment.getEnvironment();

    // Log the full callback request from EPX (headers + body)
    const sanitizedCallbackBody = sanitizeForLogging(req.body);

    console.log(
      '[EPX Server Post - REQUEST]',
      JSON.stringify(
        {
          headers: req.headers,
          body: sanitizedCallbackBody,
        },
        null,
        2
      )
    );

    logEPX({ level: 'info', phase: 'callback', message: 'Callback received', data: { body: sanitizedCallbackBody } });

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
            body: sanitizedCallbackBody,
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

    const resolvedCallbackAuthGuid = resolveCallbackAuthGuid(
      req.body || {},
      result.authGuid,
      result.bricToken,
    );
    const authGuid = resolvedCallbackAuthGuid.value;
    const authGuidSource = resolvedCallbackAuthGuid.source;
    const epxTransactionId = result.transactionId || req.body?.transactionId || req.body?.TRANSACTION_ID;
    const fallbackOrderNumber = req.body?.orderNumber || req.body?.ORDER_NUMBER || req.body?.invoiceNumber || req.body?.INVOICE_NUMBER;
    const callbackTranTypeRaw = String(req.body?.tranType || req.body?.TRAN_TYPE || '').trim().toUpperCase();
    const callbackPaymentMethodType = normalizeHostedPaymentMethodType(
      req.body?.paymentMethodType || req.body?.PaymentMethodType || req.body?.PAYMENT_METHOD_TYPE,
      callbackTranTypeRaw,
    );
    const callbackResolvedTranType = callbackTranTypeRaw || resolveHostedFallbackTranType(callbackPaymentMethodType);
    let paymentRecordForLogging: PaymentRecord | null = null;
    let maskedAuthGuid: string | null = null;

    if (result.isApproved) {
      const persistResult = await persistHostedPaymentUpdate({
        epxTransactionId,
        fallbackOrderNumber,
        authGuid,
        authGuidSource,
        authCode: result.authCode,
        amount: result.amount,
        callbackStatus: req.body?.status || null,
        callbackMessage: req.body?.message || null,
        bricTokenPresent: Boolean(result.bricToken),
        paymentStatus: 'succeeded',
        tranType: callbackResolvedTranType,
        paymentMethodType: callbackPaymentMethodType
      });

      paymentRecordForLogging = persistResult.paymentRecord;
      maskedAuthGuid = persistResult.maskedAuthGuid;

      const paymentMetadata = paymentRecordForLogging
        ? parsePaymentMetadata(paymentRecordForLogging.metadata)
        : {};
      const groupPaymentContext = extractGroupPaymentContext(paymentMetadata);
      const groupInvoiceContext = extractGroupInvoiceContext(paymentMetadata);

      if (groupPaymentContext && paymentRecordForLogging) {
        try {
          await upsertGroupCardProfileFromCallback(groupPaymentContext.groupId, req.body || {});
          let recurringArtifactResult: { memberId: number | null; subscriptionId: number | null } | null = null;

          const transitionReference = [
            `payment:${paymentRecordForLogging.id}`,
            result.transactionId ? `transaction:${result.transactionId}` : null,
          ].filter(Boolean).join('|');

          const transitionResult = await transitionGroupPaymentToPayable({
            groupId: groupPaymentContext.groupId,
            groupMemberId: groupPaymentContext.groupMemberId,
            paymentStatusRaw: req.body?.status || 'success',
            paymentCapturedAt: new Date(),
            triggeredBy: null,
            transitionSource: 'epx-hosted-callback',
            transitionReference,
            updateMemberPaymentStatus: true,
          });

          paymentMetadata.groupPaymentContext = {
            ...groupPaymentContext,
            lastTransitionAt: new Date().toISOString(),
            lastTransitionResult: transitionResult,
          };

          const groupIdForArtifacts = typeof groupPaymentContext.groupId === 'string'
            ? groupPaymentContext.groupId.trim()
            : '';
          const groupMemberIdForArtifacts = parseNumericValue(groupPaymentContext.groupMemberId);

          if (
            typeof result.bricToken === 'string'
            && result.bricToken.trim()
            && groupIdForArtifacts
            && Number.isFinite(groupMemberIdForArtifacts)
            && Number(groupMemberIdForArtifacts) > 0
          ) {
            recurringArtifactResult = await ensureRecurringArtifactsForGroupPayment({
              groupId: groupIdForArtifacts,
              groupMemberId: Number(groupMemberIdForArtifacts),
              paymentRecord: paymentRecordForLogging,
              paymentMetadata,
              bricToken: result.bricToken,
              paymentMethodType: callbackPaymentMethodType,
            });

            paymentMetadata.groupPaymentContext = {
              ...paymentMetadata.groupPaymentContext,
              recurringSetup: {
                attemptedAt: new Date().toISOString(),
                memberId: recurringArtifactResult.memberId,
                subscriptionId: recurringArtifactResult.subscriptionId,
              },
            };

            const recurringReadiness = await runRecurringReadinessIntegrityCheck({
              phase: 'callback',
              flowType: 'group',
              memberId: recurringArtifactResult.memberId,
              groupId: groupIdForArtifacts,
              groupMemberId: Number(groupMemberIdForArtifacts),
              paymentRecord: paymentRecordForLogging,
              expectedSubscriptionId: recurringArtifactResult.subscriptionId,
              paymentMethodType: callbackPaymentMethodType,
            });
            paymentMetadata.groupPaymentContext = {
              ...paymentMetadata.groupPaymentContext,
              recurringReadinessIntegrity: recurringReadiness,
            };
            await handleRecurringReadinessFailure(recurringReadiness);
          } else {
            logEPX({
              level: 'warn',
              phase: 'callback',
              message: 'Skipping recurring artifact setup for group payment because required callback linkage data was missing',
              data: {
                groupId: groupPaymentContext.groupId,
                groupMemberId: groupPaymentContext.groupMemberId,
                hasBricToken: Boolean(typeof result.bricToken === 'string' && result.bricToken.trim()),
                paymentId: paymentRecordForLogging.id,
              }
            });

            const recurringReadiness = await runRecurringReadinessIntegrityCheck({
              phase: 'callback',
              flowType: 'group',
              memberId: parseNumericValue(paymentRecordForLogging.member_id),
              groupId: groupIdForArtifacts || groupPaymentContext.groupId,
              groupMemberId: Number.isFinite(groupMemberIdForArtifacts) ? Number(groupMemberIdForArtifacts) : null,
              paymentRecord: paymentRecordForLogging,
              expectedSubscriptionId: parseSubscriptionId(paymentRecordForLogging.subscription_id),
              paymentMethodType: callbackPaymentMethodType,
            });
            paymentMetadata.groupPaymentContext = {
              ...paymentMetadata.groupPaymentContext,
              recurringReadinessIntegrity: recurringReadiness,
            };
            await handleRecurringReadinessFailure(recurringReadiness);
          }

          await storage.updatePayment(paymentRecordForLogging.id, { metadata: paymentMetadata });

          logEPX({
            level: 'info',
            phase: 'callback',
            message: 'Group payment transitioned to payable state',
            data: {
              groupId: groupPaymentContext.groupId,
              groupMemberId: groupPaymentContext.groupMemberId,
              transitionedCount: transitionResult.transitionedCount,
              skippedCount: transitionResult.skippedCount,
              missingExpectedCommissions: transitionResult.missingExpectedCommissions,
              cycleKey: transitionResult.cycleKey,
              recurringMemberId: recurringArtifactResult?.memberId || null,
              recurringSubscriptionId: recurringArtifactResult?.subscriptionId || null,
            }
          });
        } catch (groupTransitionError: any) {
          logEPX({
            level: 'error',
            phase: 'callback',
            message: 'Group payment transition failed after successful callback',
            data: {
              error: groupTransitionError?.message,
              groupId: groupPaymentContext.groupId,
              groupMemberId: groupPaymentContext.groupMemberId,
              paymentId: paymentRecordForLogging.id,
            }
          });
        }
      }

      if (!groupPaymentContext && groupInvoiceContext && paymentRecordForLogging && result.bricToken) {
        try {
          await upsertGroupCardProfileFromCallback(groupInvoiceContext.groupId, req.body || {});
          const recurringSetupResults: Array<{ groupMemberId: number; memberId: number | null; subscriptionId: number | null }> = [];
          const recurringReadinessChecks: RecurringReadinessResult[] = [];

          for (const selectedGroupMemberId of groupInvoiceContext.selectedGroupMemberIds) {
            const recurringArtifactResult = await ensureRecurringArtifactsForGroupPayment({
              groupId: groupInvoiceContext.groupId,
              groupMemberId: selectedGroupMemberId,
              paymentRecord: paymentRecordForLogging,
              paymentMetadata,
              bricToken: result.bricToken,
              paymentMethodType: callbackPaymentMethodType,
            });

            recurringSetupResults.push({
              groupMemberId: selectedGroupMemberId,
              memberId: recurringArtifactResult.memberId,
              subscriptionId: recurringArtifactResult.subscriptionId,
            });

            const recurringReadiness = await runRecurringReadinessIntegrityCheck({
              phase: 'callback',
              flowType: 'group',
              memberId: recurringArtifactResult.memberId,
              groupId: groupInvoiceContext.groupId,
              groupMemberId: selectedGroupMemberId,
              paymentRecord: paymentRecordForLogging,
              expectedSubscriptionId: recurringArtifactResult.subscriptionId,
              paymentMethodType: callbackPaymentMethodType,
            });
            recurringReadinessChecks.push(recurringReadiness);
            await handleRecurringReadinessFailure(recurringReadiness);
          }

          paymentMetadata.groupInvoiceContext = {
            ...groupInvoiceContext,
            recurringSetup: {
              attemptedAt: new Date().toISOString(),
              processedCount: recurringSetupResults.length,
              processedMembers: recurringSetupResults,
            },
            recurringReadinessIntegrity: {
              checkedAt: new Date().toISOString(),
              passedCount: recurringReadinessChecks.filter((entry) => entry.passed).length,
              failedCount: recurringReadinessChecks.filter((entry) => !entry.passed).length,
              checks: recurringReadinessChecks,
            },
          };

          await storage.updatePayment(paymentRecordForLogging.id, { metadata: paymentMetadata });

          logEPX({
            level: 'info',
            phase: 'callback',
            message: 'Group invoice recurring artifacts prepared for selected members',
            data: {
              groupId: groupInvoiceContext.groupId,
              selectedCount: groupInvoiceContext.selectedGroupMemberIds.length,
              processedCount: recurringSetupResults.length,
            }
          });
        } catch (groupInvoiceRecurringSetupError: any) {
          logEPX({
            level: 'error',
            phase: 'callback',
            message: 'Failed preparing recurring artifacts for group invoice payment',
            data: {
              error: groupInvoiceRecurringSetupError?.message,
              groupId: groupInvoiceContext.groupId,
              selectedGroupMemberIds: groupInvoiceContext.selectedGroupMemberIds,
            }
          });
        }
      }

      if (paymentRecordForLogging?.member_id && !groupPaymentContext) {
        try {
          const memberId = Number(paymentRecordForLogging.member_id);
          const memberRecord = await storage.getMember(memberId);

          await storage.createAdminNotification({
            type: 'payment_succeeded',
            memberId,
            subscriptionId: paymentRecordForLogging.subscription_id || null,
            metadata: {
              paymentId: paymentRecordForLogging.id,
              transactionId: result.transactionId,
              amount: result.amount,
              memberEmail: memberRecord?.email,
              memberName: memberRecord ? `${memberRecord.firstName || ''} ${memberRecord.lastName || ''}`.trim() : null,
              callbackStatus: req.body?.status || 'Success',
              timestamp: new Date().toISOString(),
            },
          });
        } catch (successNotificationError: any) {
          logEPX({
            level: 'warn',
            phase: 'callback',
            message: 'Failed to create admin notification for successful payment',
            data: {
              error: successNotificationError?.message,
              paymentId: paymentRecordForLogging.id,
            }
          });
        }
      }

      if (!authGuid) {
        logEPX({ level: 'warn', phase: 'callback', message: 'Hosted callback missing AUTH_GUID', data: { transactionId: result.transactionId } });
      }

      if (result.bricToken && paymentRecordForLogging?.member_id && !groupPaymentContext) {
        try {
          await storage.updateMember(Number(paymentRecordForLogging.member_id), {
            paymentToken: result.bricToken,
            paymentMethodType: callbackPaymentMethodType,
            status: 'active',
            isActive: true,
            firstPaymentDate: new Date().toISOString()
          });

          await storage.upsertMemberPaymentToken({
            memberId: Number(paymentRecordForLogging.member_id),
            paymentMethodType: callbackPaymentMethodType,
            token: result.bricToken,
            originalNetworkTransId: callbackPaymentMethodType === 'ACH'
              ? null
              : (typeof authGuid === 'string' && authGuid.trim() ? authGuid.trim() : null),
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

      if (paymentRecordForLogging?.member_id && !groupPaymentContext) {
        const reconciledSubscriptionId = await reconcileSubscriptionAfterSuccessfulPayment({
          memberId: Number(paymentRecordForLogging.member_id),
          paymentRecord: paymentRecordForLogging,
          phase: 'callback',
        });

        const recurringReadiness = await runRecurringReadinessIntegrityCheck({
          phase: 'callback',
          flowType: 'individual',
          memberId: Number(paymentRecordForLogging.member_id),
          paymentRecord: paymentRecordForLogging,
          expectedSubscriptionId: reconciledSubscriptionId,
          paymentMethodType: callbackPaymentMethodType,
        });
        await handleRecurringReadinessFailure(recurringReadiness);

        try {
          const currentMetadata = parsePaymentMetadata(paymentRecordForLogging.metadata);
          await storage.updatePayment(paymentRecordForLogging.id, {
            metadata: {
              ...currentMetadata,
              recurringReadinessIntegrity: recurringReadiness,
            },
          });
        } catch (integrityMetadataError: any) {
          logEPX({
            level: 'warn',
            phase: 'callback',
            message: 'Failed to persist recurring-readiness integrity metadata for individual callback',
            data: {
              paymentId: paymentRecordForLogging.id,
              memberId: paymentRecordForLogging.member_id,
              error: integrityMetadataError?.message,
            }
          });
        }
      }

      // COMMISSION CREATION/VERIFICATION - Check if commission exists and create if missing
      if (paymentRecordForLogging?.member_id && !groupPaymentContext) {
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
          const callbackGroupPaymentContext = extractGroupPaymentContext(paymentMetadata);
          const notificationMeta = {
            ...(typeof paymentMetadata.notifications === 'object' && paymentMetadata.notifications ? paymentMetadata.notifications : {})
          } as Record<string, any>;
          const shouldSendPaymentEmail = !notificationMeta.paymentReceiptSentAt;
          const shouldSendEnrollmentEmail = !notificationMeta.enrollmentEmailSentAt;

          if ((shouldSendPaymentEmail || shouldSendEnrollmentEmail) && paymentRecordForLogging.member_id && !callbackGroupPaymentContext) {
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
                    transactionId: result.transactionId || paymentRecordForLogging.transaction_id || undefined,
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
                    agentEmail: agentRecord?.email || undefined,
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
          tranType: callbackResolvedTranType,
          paymentMethodType: callbackPaymentMethodType
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
    return res.status(410).json({
      success: false,
      error: 'Legacy recurring test route disabled',
      message: 'Use admin diagnostic scheduler run-once endpoint: POST /api/admin/diagnostic/recurring-billing/run-once',
    });

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

    const { scheduledDate } = req.body;

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
        scheduled_date: scheduledDate ? new Date(scheduledDate).toISOString() : null,
        notes: `Commission created manually by admin (${req.user.email}) - Plan: ${planName}, Coverage: ${coverageType}, Total: $${commissionResult.commission}${scheduledDate ? `, Scheduled: ${scheduledDate}` : ''}`
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

/**
 * ADMIN: Sync payment amount to member monthly price
 * Fixes cases where total_monthly_price wasn't set during enrollment
 */
router.post('/api/admin/members/:id/sync-price', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const memberId = parseInt(req.params.id, 10);

    if (!memberId || isNaN(memberId)) {
      return res.status(400).json({ success: false, error: 'Valid member ID required' });
    }

    // Get member's most recent successful payment using Supabase
    const { data: payments, error: paymentError } = await supabase
      .from('payments')
      .select('amount')
      .eq('member_id', memberId)
      .eq('status', 'succeeded')
      .order('created_at', { ascending: false })
      .limit(1);

    if (paymentError) {
      throw new Error(`Failed to fetch payment: ${paymentError.message}`);
    }

    if (!payments || payments.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'No successful payment found for this member' 
      });
    }

    const paymentAmount = parseFloat(payments[0].amount);

    if (!paymentAmount || isNaN(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid payment amount' 
      });
    }

    // Update member's monthly price
    await storage.updateMember(memberId, {
      total_monthly_price: paymentAmount
    });

    logEPX({
      level: 'info',
      phase: 'admin-sync-price',
      message: 'Synced payment amount to member monthly price',
      data: {
        memberId,
        amount: paymentAmount,
        adminUserId: req.user.id,
        adminEmail: req.user.email
      }
    });

    res.json({
      success: true,
      message: `Updated monthly price to $${paymentAmount.toFixed(2)}`,
      data: { memberId, totalMonthlyPrice: paymentAmount }
    });
  } catch (error: any) {
    logEPX({
      level: 'error',
      phase: 'admin-sync-price',
      message: 'Failed to sync price from payment',
      data: { error: error?.message, memberId: req.params.id }
    });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to sync price'
    });
  }
});

/**
 * ADMIN: Add family member to enrollment
 * Manually adds spouse/dependent to an existing member
 */
router.post('/api/admin/members/:id/add-family-member', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isAtLeastAdmin(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const primaryMemberId = parseInt(req.params.id, 10);

    if (!primaryMemberId || isNaN(primaryMemberId)) {
      return res.status(400).json({ success: false, error: 'Valid member ID required' });
    }

    const {
      firstName,
      lastName,
      middleName,
      dateOfBirth,
      gender,
      ssn,
      email,
      phone,
      relationship,
      memberType
    } = req.body;

    if (!firstName || !lastName || !relationship) {
      return res.status(400).json({ 
        success: false, 
        error: 'firstName, lastName, and relationship are required' 
      });
    }

    // Verify primary member exists
    const primaryMember = await storage.getMember(primaryMemberId);
    if (!primaryMember) {
      return res.status(404).json({ success: false, error: 'Primary member not found' });
    }

    const newFamilyMember = await storage.addFamilyMember({
      primaryMemberId,
      firstName,
      lastName,
      middleName: middleName || null,
      dateOfBirth: dateOfBirth || null,
      gender: gender || null,
      ssn: ssn || null,
      email: email || null,
      phone: phone || null,
      relationship,
      memberType: memberType || relationship,
      isActive: true,
    });

    logEPX({
      level: 'info',
      phase: 'admin-add-family',
      message: 'Family member added by admin',
      data: {
        primaryMemberId,
        familyMemberId: newFamilyMember.id,
        relationship,
        adminUserId: req.user.id,
        adminEmail: req.user.email
      }
    });

    res.json({
      success: true,
      message: `Added ${relationship}: ${firstName} ${lastName}`,
      data: newFamilyMember
    });
  } catch (error: any) {
    logEPX({
      level: 'error',
      phase: 'admin-add-family',
      message: 'Failed to add family member',
      data: { error: error?.message, memberId: req.params.id }
    });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to add family member'
    });
  }
});

export default router;


