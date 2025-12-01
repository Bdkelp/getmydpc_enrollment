/**
 * EPX Recurring Billing API Service
 * Implements EPX Server Post API for recurring subscription payments
 * API Documentation: https://billing.epxuap.com (UAP/Sandbox)
 */

import crypto from 'crypto';

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

export interface EPXCreateSubscriptionRequest {
  CustomerData: EPXCustomerData;
  PaymentMethod: {
    CreditCardData?: EPXCreditCardData;
    BankAccountData?: EPXBankAccountData;
    PreviousPayment?: {
      BRIC: string;
      PaymentType: 'CreditCard' | 'BankAccount';
    };
  };
  SubscriptionData: EPXSubscriptionData;
}

export interface EPXSubscriptionResponse {
  id: number;
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

export function getEPXService() {
  const config: EPXServerPostConfig = {
    apiKey: process.env.EPX_MAC || process.env.EPX_MAC_KEY || '',
    custNbr: process.env.EPX_CUST_NBR || '',
    merchNbr: process.env.EPX_MERCH_NBR || '',
    dbaNbr: process.env.EPX_DBA_NBR || '',
    terminalNbr: process.env.EPX_TERMINAL_NBR || '',
    environment: (process.env.EPX_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production',
    apiUrl: process.env.EPX_ENVIRONMENT === 'production'
      ? 'https://billing.epx.com'
      : 'https://billing.epxuap.com'  // UAP sandbox
  };

  return new EPXServerPostService(config);
}

export type EPXService = EPXServerPostService;
