/**
 * EPX Recurring Billing API Service
 * Implements EPX Server Post API for recurring subscription payments
 * API Documentation: https://billing.epxuap.com (UAP/Sandbox)
 */

import crypto from 'crypto';
import { certificationLogger } from './certification-logger';
import { logEPX } from './epx-payment-logger';
import { paymentEnvironment, type PaymentEnvironment } from './payment-environment-service';

// ============================================================
// CARD DATA MASKING UTILITY
// ============================================================

/**
 * Masks sensitive card data in objects for logging
 * Prevents PAN, CVV, and expiration dates from appearing in logs
 */
export function maskCardFields(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  
  const masked = Array.isArray(obj) ? [...obj] : { ...obj };
  
  for (const key in masked) {
    const lowerKey = key.toLowerCase();
    
    // Mask credit card numbers
    if (lowerKey.includes('accountnumber') || lowerKey.includes('cardnumber') || lowerKey === 'pan') {
      const value = String(masked[key]);
      if (value && value.length >= 4) {
        masked[key] = `****${value.slice(-4)}`;
      }
    }
    // Mask CVV
    else if (lowerKey.includes('cvv') || lowerKey === 'cvv2') {
      masked[key] = '***';
    }
    // Mask expiration date
    else if (lowerKey.includes('expirationdate') || lowerKey === 'expdate') {
      masked[key] = '****';
    }
    // Recurse into nested objects
    else if (typeof masked[key] === 'object' && masked[key] !== null) {
      masked[key] = maskCardFields(masked[key]);
    }
  }
  
  return masked;
}

// ============================================================
// EPX HMAC SIGNATURE GENERATION
// ============================================================

/**
 * Generates HMAC-SHA256 signature for EPX API requests
 * Required in EPI-Signature header for authentication
 * 
 * @param endpoint - API endpoint path (e.g., '/subscription')
 * @param payload - Request body object
 * @param apiKey - EPX MAC key (also called EPI-Key)
 */
export function generateEPXSignature(endpoint: string, payload: any, apiKey: string): string {
  const payloadString = JSON.stringify(payload);
  const message = endpoint + payloadString;
  
  const hmac = crypto.createHmac('sha256', apiKey);
  hmac.update(message);
  
  return hmac.digest('hex');
}

// ============================================================
// EPX API TYPES
// ============================================================

export interface EPXServerPostConfig {
  apiKey: string;        // EPX MAC key (also called EPI-Key)
  custNbr: string;       // Customer number
  merchNbr: string;      // Merchant number
  dbaNbr: string;        // DBA number
  terminalNbr: string;   // Terminal number
  environment: 'sandbox' | 'production';
  apiUrl: string;        // Base API URL
}

export interface EPXCustomerData {
  FirstName: string;
  LastName: string;
  Phone: string;
  Email: string;
}

export interface EPXCreditCardData {
  AccountNumber: string;
  ExpirationDate: string;  // YYMM format
  CVV: string;
  FirstName: string;
  LastName: string;
  PostalCode?: string;
  StreetAddress?: string;
}

export interface EPXBankAccountData {
  AccountNumber: string;
  RoutingNumber: string;
  FirstName: string;
  LastName: string;
  BankAccountType: 'Checking' | 'Savings';
}

export interface EPXSubscriptionData {
  Amount: number;           // Decimal amount (e.g., 10.99)
  Frequency: 'Weekly' | 'BiWeekly' | 'Monthly';
  BillingDate: string;      // YYYY-MM-DD format
  FailureOption: 'Forward' | 'Skip' | 'Pause';
  NumberOfPayments?: number; // Omit for never-ending subscription
  Retries?: number;         // 1-5, defaults to 3
  Description?: string;
}

export interface EPXLegacyBillingSchedule {
  Frequency: 'Weekly' | 'BiWeekly' | 'Monthly';
  StartDate: string;
  FailureOption?: 'Forward' | 'Skip' | 'Pause';
  RetryAttempts?: number;
  NumberOfPayments?: number;
}

export interface EPXLegacyCreateSubscriptionRequest {
  MerchantAccountCode?: string;
  Payment?: {
    PaymentMethodType?: 'CreditCard' | 'BankAccount' | 'PreviousPayment';
    PreviousPayment?: {
      GUID?: string;
      Amount?: number;
      PaymentType?: 'CreditCard' | 'BankAccount';
    };
  };
  BillingSchedule?: EPXLegacyBillingSchedule;
  SubscriptionName?: string;
  CustomerEmail?: string;
  CustomerName?: string;
  CustomerAccountCode?: string;
  CustomerPhone?: string;
}

export interface EPXCreateSubscriptionRequest extends EPXLegacyCreateSubscriptionRequest {
  CustomerData?: EPXCustomerData;
  PaymentMethod?: {
    CreditCardData?: EPXCreditCardData;
    BankAccountData?: EPXBankAccountData;
    PreviousPayment?: {
      BRIC?: string;
      PaymentType?: 'CreditCard' | 'BankAccount';
    };
  };
  SubscriptionData?: EPXSubscriptionData;
}

export interface EPXSubscriptionResponse {
  id: number;
  SubscriptionID?: string;
  Amount: number;
  Frequency: string;
  BillingDate: string;
  FailureOption: string;
  NumberOfPayments?: number;
  Retries: number;
  Description?: string;
  Status: 'Active' | 'Paused' | 'Expired' | 'Canceled';
  PaymentsRemaining: number;
  customerId: number;
  paymentmethodId: number;
  createdAt: string;
  updatedAt: string;
  VerifyResult?: {
    AVSResult?: string;
    CVResult?: string;
    Code: string;
    Text: string;
    GUID: string;
    Successful: boolean;
    Date: string;
  };
}

export interface EPXPayBillRequest {
  BillID: number;
}

export interface EPXOneTimePaymentRequest {
  PaymentMethodID: number;
  Amount: number;
}

export interface EPXPaymentResponse {
  Date: string;
  GUID: string;
  Amount: string;
  Code: string;
  Text: string;
  Approval?: string;
  Successful: boolean;
  billId?: number;
}

// ============================================================
// EPX RECURRING BILLING SERVICE
// ============================================================

export class EPXServerPostService {
  private config: EPXServerPostConfig;

  constructor(config: EPXServerPostConfig) {
    this.config = config;
  }

  /**
   * Gets EPI-Id header value (4-part merchant identifier)
   * Format: {custNbr}-{merchNbr}-{dbaNbr}-{terminalNbr}
   */
  private getEPIId(): string {
    return `${this.config.custNbr}-${this.config.merchNbr}-${this.config.dbaNbr}-${this.config.terminalNbr}`;
  }

  /**
   * Makes authenticated request to EPX API
   */
  private async makeEPXRequest<T>(
    endpoint: string,
    payload: any
  ): Promise<{ success: boolean; data?: T; error?: string }> {
    try {
      const signature = generateEPXSignature(endpoint, payload, this.config.apiKey);
      const url = `${this.config.apiUrl}${endpoint}`;

      // Log request (with masked card data) - EPX CERTIFICATION FORMAT
      console.log('═══════════════════════════════════════════════════════════');
      console.log('[EPX ServerPost Request]', JSON.stringify({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'EPI-Id': this.getEPIId(),
          'EPI-Signature': signature
        },
        body: maskCardFields(payload)
      }, null, 2));
      console.log('═══════════════════════════════════════════════════════════');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'EPI-Id': this.getEPIId(),
          'EPI-Signature': signature
        },
        body: JSON.stringify(payload)
      });

      const responseData = await response.json();

      // Log response - EPX CERTIFICATION FORMAT
      if (response.ok) {
        console.log('═══════════════════════════════════════════════════════════');
        console.log('[EPX ServerPost Response]', JSON.stringify({
          status: response.status,
          data: maskCardFields(responseData)
        }, null, 2));
        console.log('═══════════════════════════════════════════════════════════');

        return { success: true, data: responseData };
      } else {
        console.log('═══════════════════════════════════════════════════════════');
        console.log('[EPX ServerPost Response (ERROR)]', JSON.stringify({
          status: response.status,
          error: responseData
        }, null, 2));
        console.log('═══════════════════════════════════════════════════════════');

        return {
          success: false,
          error: responseData.message || responseData.Message || 'EPX API request failed'
        };
      }
    } catch (error: any) {
      console.error('[EPX Server Post - EXCEPTION]', JSON.stringify({
        timestamp: new Date().toISOString(),
        endpoint,
        error: error.message,
        stack: error.stack
      }));

      return {
        success: false,
        error: error.message || 'Network error communicating with EPX'
      };
    }
  }

  /**
   * Create a new recurring subscription
   * POST /subscription
   */
  async createSubscription(
    request: EPXCreateSubscriptionRequest
  ): Promise<{ success: boolean; data?: EPXSubscriptionResponse; error?: string }> {
    return this.makeEPXRequest<EPXSubscriptionResponse>('/subscription', request);
  }

  /**
   * Manually pay a subscription bill
   * POST /paybill
   */
  async payBill(
    request: EPXPayBillRequest
  ): Promise<{ success: boolean; data?: EPXPaymentResponse; error?: string }> {
    return this.makeEPXRequest<EPXPaymentResponse>('/paybill', request);
  }

  /**
   * Process one-time payment (not part of subscription)
   * POST /chargepaymentmethod
   */
  async chargePaymentMethod(
    request: EPXOneTimePaymentRequest
  ): Promise<{ success: boolean; data?: EPXPaymentResponse; error?: string }> {
    return this.makeEPXRequest<EPXPaymentResponse>('/chargepaymentmethod', request);
  }

  /**
   * Update existing subscription
   * PUT /subscription
   */
  async updateSubscription(
    subscriptionId: number,
    subscriptionData: Partial<EPXSubscriptionData>
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const payload = {
      SubscriptionID: subscriptionId,
      SubscriptionData: subscriptionData
    };

    // PUT requests use same signature mechanism
    try {
      const signature = generateEPXSignature('/subscription', payload, this.config.apiKey);
      const url = `${this.config.apiUrl}/subscription`;

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'EPI-Id': this.getEPIId(),
          'EPI-Signature': signature
        },
        body: JSON.stringify(payload)
      });

      const responseData = await response.json();

      if (response.ok) {
        return { success: true, data: responseData };
      } else {
        return {
          success: false,
          error: responseData.message || responseData.Message || 'Update failed'
        };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Cancel a subscription
   * POST /subscription/cancel
   */
  async cancelSubscription(
    subscriptionId: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    return this.makeEPXRequest('/subscription/cancel', {
      SubscriptionID: subscriptionId
    });
  }

  /**
   * Pause or resume a subscription
   * POST /subscription/pause
   */
  async pauseResumeSubscription(
    subscriptionId: number,
    paused: boolean
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    return this.makeEPXRequest('/subscription/pause', {
      SubscriptionID: subscriptionId,
      Paused: paused
    });
  }

  /**
   * Lookup subscription details
   * POST /subscription/list
   */
  async getSubscription(
    subscriptionId: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    return this.makeEPXRequest('/subscription/list', {
      SubscriptionID: subscriptionId
    });
  }

  // ============================================================
  // LEGACY COMPATIBILITY METHODS (for existing routes)
  // ============================================================

  /**
   * @deprecated Use createSubscription() instead
   * Legacy method for backward compatibility
   */
  async generateTAC(params: any): Promise<{ success: boolean; tac?: string; error?: string }> {
    console.warn('[EPX] generateTAC is deprecated. Use createSubscription() for recurring billing.');
    return { success: false, error: 'Use createSubscription() for EPX Recurring Billing API' };
  }

  /**
   * @deprecated Legacy method for backward compatibility
   */
  getPaymentFormData(tac: string, amount: number, tranNbr: string, customerEmail?: string, invoiceNumber?: string, orderDescription?: string, aciExt?: string): any {
    console.warn('[EPX] getPaymentFormData is deprecated. Use createSubscription() for recurring billing.');
    return null;
  }
}

// ============================================================
// SERVICE FACTORY
// ============================================================

export async function getEPXService() {
  const environment = await paymentEnvironment.getEnvironment();
  const config: EPXServerPostConfig = {
    apiKey: process.env.EPX_MAC || process.env.EPX_MAC_KEY || '',
    custNbr: process.env.EPX_CUST_NBR || '',
    merchNbr: process.env.EPX_MERCH_NBR || '',
    dbaNbr: process.env.EPX_DBA_NBR || '',
    terminalNbr: process.env.EPX_TERMINAL_NBR || '',
    environment,
    apiUrl: environment === 'production'
      ? 'https://billing.epx.com'
      : 'https://billing.epxuap.com'  // UAP sandbox
  };

  return new EPXServerPostService(config);
}

export type EPXService = EPXServerPostService;

// ============================================================
// SERVER POST MIT HELPERS
// ============================================================

const SERVER_POST_ENDPOINTS = {
  // Server Post endpoints provided by EPX (secure.* hosts)
  sandbox: 'https://secure.epxuap.com/',
  production: 'https://secure.epx.com/'
} as const;

type ServerPostTranType = 'CCE1' | 'CCE7' | 'CCE9';

interface ServerPostRecurringOptions {
  amount: number;
  authGuid: string;
  transactionId?: string | null;
  member?: Record<string, any> | null;
  description?: string;
  aciExt?: string;
  cardEntryMethod?: string;
  industryType?: string;
  tranType?: ServerPostTranType;
  tranNbr?: string;
  batchId?: string;
  metadata?: Record<string, any>;
}

interface ServerPostRecurringResult {
  success: boolean;
  requestFields: Record<string, string>;
  requestPayload: string;
  responseFields: Record<string, string>;
  rawResponse: string;
  error?: string;
}

type ServerPostCredentials = {
  environment: PaymentEnvironment;
  custNbr: string;
  merchNbr: string;
  dbaNbr: string;
  terminalNbr: string;
  serverPostUrl: string;
};

async function ensureServerPostCredentials(): Promise<ServerPostCredentials> {
  const environment = await paymentEnvironment.getEnvironment();
  const custNbr = process.env.EPX_CUST_NBR || '';
  const merchNbr = process.env.EPX_MERCH_NBR || '';
  const dbaNbr = process.env.EPX_DBA_NBR || '';
  const terminalNbr = process.env.EPX_TERMINAL_NBR || '';
  const serverPostUrl = process.env.EPX_SERVER_POST_URL
    || (environment === 'production' ? SERVER_POST_ENDPOINTS.production : SERVER_POST_ENDPOINTS.sandbox);

  if (!custNbr || !merchNbr || !dbaNbr || !terminalNbr) {
    throw new Error('Missing EPX merchant credentials (CUST_NBR, MERCH_NBR, DBA_NBR, TERMINAL_NBR).');
  }

  return {
    environment,
    custNbr,
    merchNbr,
    dbaNbr,
    terminalNbr,
    serverPostUrl
  };
}

function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

function buildServerPostPayload(fields: Record<string, string>): string {
  const params = new URLSearchParams();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, value);
    }
  });
  return params.toString();
}

function maskAuthGuid(value?: string | null): string {
  if (!value) return '********';
  return value.length > 8 ? `${value.slice(0, 4)}****${value.slice(-4)}` : '********';
}

function maskServerPostFields(fields: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  Object.entries(fields).forEach(([key, value]) => {
    if (key === 'ORIG_AUTH_GUID' && value) {
      masked[key] = maskAuthGuid(value);
    } else {
      masked[key] = value;
    }
  });
  return masked;
}

function shouldLogAuthGuidRaw(): boolean {
  return (process.env.EPX_LOG_AUTH_GUID_RAW || '').toLowerCase() === 'true';
}

function parseServerPostResponse(xml: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const fieldRegex = /<FIELD\s+KEY="([^"]+)">([^<]*)<\/FIELD>/gi;
  let match: RegExpExecArray | null;
  while ((match = fieldRegex.exec(xml)) !== null) {
    fields[match[1]] = match[2];
  }
  return fields;
}

function getMemberField(member: Record<string, any> | undefined | null, keys: string[]): string | undefined {
  if (!member) return undefined;
  for (const key of keys) {
    const value = member[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function generateBatchId(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function generateTranNbr(transactionId?: string | null): string {
  if (transactionId) return transactionId;
  return `MIT${Date.now()}`;
}

function isApprovedResponse(code?: string): boolean {
  return code === '00' || code === '000';
}

export async function submitServerPostRecurringPayment(
  options: ServerPostRecurringOptions
): Promise<ServerPostRecurringResult> {
  const startTime = Date.now();
  const logAuthGuidRaw = shouldLogAuthGuidRaw();
  const authGuidVisibility: 'raw' | 'masked' = logAuthGuidRaw ? 'raw' : 'masked';
  let authGuidLogValue = '********';
  let requestFields: Record<string, string> = {};
  let rawFieldSnapshot: Record<string, string> | undefined;
  let requestPayload = '';
  let responseFields: Record<string, string> = {};
  let rawResponse = '';
  const resolvedTranType: ServerPostTranType = options.tranType || 'CCE1';
  const certificationPurpose =
    resolvedTranType === 'CCE7'
      ? 'server-post-reversal'
      : resolvedTranType === 'CCE9'
        ? 'server-post-refund'
        : 'server-post-mit';

  let credentials: ServerPostCredentials | null = null;

  try {
    const resolvedCredentials = await ensureServerPostCredentials();
    credentials = resolvedCredentials;

    const amount = Number(options.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Invalid amount for Server Post transaction.');
    }

    const authGuid = typeof options.authGuid === 'string' ? options.authGuid.trim() : '';
    if (!authGuid) {
      throw new Error('Missing EPX auth GUID (ORIG_AUTH_GUID) for Server Post MIT transaction.');
    }

    const member = options.member || undefined;
    const firstName = getMemberField(member, ['firstName', 'first_name']);
    const lastName = getMemberField(member, ['lastName', 'last_name']);
    const email = getMemberField(member, ['email']);
    const address = getMemberField(member, ['address', 'address1']);
    const city = getMemberField(member, ['city']);
    const stateRaw = getMemberField(member, ['state']);
    const zipCode = getMemberField(member, ['zipCode', 'zip_code']);
    const phone = getMemberField(member, ['phone']);
    const customerIdField = getMemberField(member, ['customerNumber', 'customer_number']);
    const resolvedCustomerId = customerIdField
      || (typeof (member as any)?.customerNumber === 'string' ? (member as any).customerNumber
      : (member as any)?.customer_number)
      || (typeof (member as any)?.id !== 'undefined' ? String((member as any).id)
      : typeof (member as any)?.member_id !== 'undefined' ? String((member as any).member_id) : undefined);

    const resolvedAciExt = resolvedTranType === 'CCE1'
      ? (options.aciExt ?? 'RB')
      : undefined;

    requestFields = {
      CUST_NBR: resolvedCredentials.custNbr,
      MERCH_NBR: resolvedCredentials.merchNbr,
      DBA_NBR: resolvedCredentials.dbaNbr,
      TERMINAL_NBR: resolvedCredentials.terminalNbr,
      TRAN_TYPE: resolvedTranType,
      AMOUNT: formatAmount(amount),
      BATCH_ID: options.batchId || generateBatchId(),
      TRAN_NBR: options.tranNbr || generateTranNbr(options.transactionId),
      ORIG_AUTH_GUID: authGuid,
      CARD_ENT_METH: options.cardEntryMethod || 'Z',
      INDUSTRY_TYPE: options.industryType || 'E'
    };

    if (resolvedAciExt) {
      requestFields.ACI_EXT = resolvedAciExt;
    }

    if (firstName) requestFields.FIRST_NAME = firstName;
    if (lastName) requestFields.LAST_NAME = lastName;
    if (email) {
      // EPX does not accept an EMAIL field; stash it in a user-data slot instead
      requestFields.USER_DATA_1 = email;
    }
    if (address) requestFields.ADDRESS = address;
    if (city) requestFields.CITY = city;
    if (stateRaw) requestFields.STATE = stateRaw.slice(0, 2).toUpperCase();
    if (zipCode) requestFields.ZIP_CODE = zipCode;
    if (phone) requestFields.PHONE_CELL = phone;
    if (options.description) requestFields.USER_DATA_2 = options.description;

    rawFieldSnapshot = { ...requestFields };

    requestPayload = buildServerPostPayload(requestFields);
    const maskedFields = maskServerPostFields(requestFields);
    const maskedAuthGuid = maskAuthGuid(authGuid);
    authGuidLogValue = logAuthGuidRaw ? authGuid : maskedAuthGuid;

    logEPX({
      level: 'info',
      phase: 'server-post',
      message: 'Submitting Server Post transaction',
      data: {
        transactionId: options.transactionId || requestFields.TRAN_NBR,
        environment: resolvedCredentials.environment,
        authGuidPresent: Boolean(authGuid),
        authGuidVisibility,
        authGuid: authGuidLogValue,
        tranType: resolvedTranType,
        request: maskedFields
      }
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout

    let response;
    try {
      response = await fetch(resolvedCredentials.serverPostUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: requestPayload,
        signal: controller.signal
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('EPX Server Post request timed out after 25 seconds');
      }
      throw new Error(`EPX Server Post request failed: ${fetchError.message}`);
    } finally {
      clearTimeout(timeoutId);
    }

    rawResponse = await response.text();
    responseFields = parseServerPostResponse(rawResponse);
    const approved = response.ok && isApprovedResponse(responseFields.AUTH_RESP);

    logEPX({
      level: approved ? 'info' : 'warn',
      phase: 'server-post',
      message: approved ? 'Server Post transaction approved' : 'Server Post transaction declined',
      data: {
        transactionId: requestFields.TRAN_NBR,
        tranType: resolvedTranType,
        authResp: responseFields.AUTH_RESP,
        authCode: responseFields.AUTH_CODE,
        message: responseFields.AUTH_RESP_TEXT || responseFields.RESPONSE_TEXT
      }
    });

    certificationLogger.logCertificationEntry({
      transactionId: options.transactionId || requestFields.TRAN_NBR,
      customerId: resolvedCustomerId,
      amount,
      environment: resolvedCredentials.environment,
      purpose: certificationPurpose,
      request: {
        timestamp: new Date().toISOString(),
        method: 'POST',
        endpoint: '/serverpost',
        url: resolvedCredentials.serverPostUrl,
        headers: {
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: {
          form: maskedFields,
          rawFields: rawFieldSnapshot,
          raw: requestPayload,
          authGuid: authGuidLogValue,
          authGuidVisibility
        }
      },
      response: {
        statusCode: response.status,
        body: {
          raw: rawResponse,
          fields: responseFields
        },
        processingTimeMs: Date.now() - startTime
      },
      sensitiveFieldsMasked: ['ORIG_AUTH_GUID'],
      metadata: {
        tranNbr: requestFields.TRAN_NBR,
        tranType: resolvedTranType,
        memberId: (member as any)?.id || (member as any)?.member_id || null,
        additional: options.metadata || null
      }
    });

    return {
      success: approved,
      requestFields,
      requestPayload,
      responseFields,
      rawResponse,
      error: approved ? undefined : (responseFields.AUTH_RESP_TEXT || 'Server Post transaction declined')
    };
  } catch (error: any) {
    logEPX({
      level: 'error',
      phase: 'server-post',
      message: 'Server Post transaction failed',
      data: {
        error: error.message,
        transactionId: requestFields.TRAN_NBR,
        tranType: resolvedTranType
      }
    });

    if (requestPayload) {
      const fallbackRawFields = rawFieldSnapshot || (Object.keys(requestFields).length ? { ...requestFields } : undefined);
      const fallbackEnvironment = credentials?.environment ?? paymentEnvironment.getCachedEnvironment();
      certificationLogger.logCertificationEntry({
        transactionId: options.transactionId || requestFields.TRAN_NBR,
        amount: options.amount,
        environment: fallbackEnvironment,
        purpose: certificationPurpose,
        request: {
          timestamp: new Date().toISOString(),
          method: 'POST',
          endpoint: '/serverpost',
          body: {
            raw: requestPayload,
            rawFields: fallbackRawFields,
            authGuid: authGuidLogValue,
            authGuidVisibility
          }
        },
        response: {
          statusCode: 500,
          body: {
            error: error.message
          },
          processingTimeMs: Date.now() - startTime
        },
        sensitiveFieldsMasked: ['ORIG_AUTH_GUID']
      });
    }

    return {
      success: false,
      requestFields,
      requestPayload,
      responseFields,
      rawResponse,
      error: error.message || 'Server Post request failed'
    };
  }
}
