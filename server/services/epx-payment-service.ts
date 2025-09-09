/**
 * EPX Payment Service Implementation
 * Supports EPX Hosted Checkout and Browser Post API
 */

import crypto from 'crypto';

export interface EPXConfig {
  checkoutId?: string;  // For Hosted Checkout
  mac?: string;         // For Browser Post API (MAC from Key Exchange)
  epiId?: string;       // For Custom Pay API
  epiKey?: string;      // For Custom Pay API signature
  custNbr?: string;     // Customer Number
  merchNbr?: string;    // Merchant Number
  dbaNbr?: string;      // DBA Number
  terminalNbr?: string; // Terminal Number
  environment: 'sandbox' | 'production';
  redirectUrl: string;
  responseUrl: string;
  cancelUrl?: string;
  webhookSecret?: string;
}

export interface TACRequest {
  amount: number;
  tranNbr: string;
  tranGroup?: string;
  customerEmail?: string;
  invoiceNumber?: string;
  orderDescription?: string;
  paymentMethod?: 'card' | 'ach';
  achRoutingNumber?: string;
  achAccountNumber?: string;
  achAccountType?: 'checking' | 'savings';
  achAccountName?: string;
}

export interface TACResponse {
  success: boolean;
  tac?: string;
  error?: string;
}

export interface EPXPaymentForm {
  actionUrl: string;
  tac: string;
  tranCode: string;
  tranGroup: string;
  amount: number;
  tranNbr: string;
  redirectUrl: string;
  responseUrl: string;
  redirectEcho: string;
  responseEcho: string;
  receipt: string;
  cancelUrl?: string;
  paymentType?: string;
  achRoutingNumber?: string;
  achAccountNumber?: string;
  achAccountType?: string;
  achAccountName?: string;
}

export interface EPXWebhookPayload {
  AUTH_RESP: string;
  AUTH_CODE?: string;
  AUTH_GUID?: string;  // BRIC token for future operations
  AUTH_AMOUNT?: string;
  AUTH_AMOUNT_REQUESTED?: string;
  AUTH_CARD_TYPE?: string;
  AUTH_AVS?: string;
  AUTH_CVV2?: string;
  TRAN_NBR?: string;
  TRAN_TYPE?: string;
  BP_RESP_CODE?: string;
  NETWORK_RESPONSE?: string;
  LOCAL_TIME?: string;
  // Additional fields for verbose response
  [key: string]: any;
}

export class EPXPaymentService {
  private config: EPXConfig;
  private apiUrl: string;
  private keyExchangeUrl: string;
  private customPayApiUrl: string;

  constructor(config: EPXConfig) {
    this.config = config;

    // Set URLs based on environment
    if (config.environment === 'production') {
      this.apiUrl = 'https://epxuap.com/post';
      this.keyExchangeUrl = 'https://epxuap.com/key-exchange';
      this.customPayApiUrl = 'https://epi.epxuap.com';
    } else {
      // Sandbox URLs - EPX uses same endpoints for sandbox with different credentials
      this.apiUrl = 'https://epxuap.com/post';
      this.keyExchangeUrl = 'https://epxuap.com/key-exchange';  // Removed /api/ prefix
      this.customPayApiUrl = 'https://epi.epxuap.com';
    }

    console.log('[EPX Service] Initialized with config:', {
      custNbr: this.config.custNbr,
      merchNbr: this.config.merchNbr,
      dbaNbr: this.config.dbaNbr,
      terminalNbr: this.config.terminalNbr,
      environment: this.config.environment,
      redirectUrl: this.config.redirectUrl,
      hasMAC: !!this.config.mac
    });
  }

  /**
   * Generate TAC (Terminal Authentication Code) for Browser Post API
   */
  async generateTAC(request: TACRequest): Promise<TACResponse> {
    try {
      console.log('[EPX] Generating TAC for transaction');

      if (!this.config.mac) {
        throw new Error('MAC value not configured for Browser Post API');
      }

      const payload: any = {
        MAC: this.config.mac,
        CUST_NBR: this.config.custNbr,
        MERCH_NBR: this.config.merchNbr,
        DBA_NBR: this.config.dbaNbr,
        TERMINAL_NBR: this.config.terminalNbr,
        AMOUNT: request.amount.toFixed(2),
        TRAN_NBR: request.tranNbr,
        TRAN_GROUP: request.tranGroup || 'SALE',
        REDIRECT_URL: this.config.redirectUrl,
        RESPONSE_URL: this.config.responseUrl,
        CANCEL_URL: this.config.cancelUrl,
        REDIRECT_ECHO: 'V',  // Verbose response
        RESPONSE_ECHO: 'V',   // Verbose response
        RECEIPT: 'Y',
        // Optional fields
        ...(request.customerEmail && { EMAIL: request.customerEmail }),
        ...(request.invoiceNumber && { INVOICE_NBR: request.invoiceNumber }),
        ...(request.orderDescription && { DESCRIPTION: request.orderDescription })
      };

      // Add ACH-specific fields if payment method is ACH
      if (request.paymentMethod === 'ach') {
        payload.PAYMENT_TYPE = 'ACH';
        payload.ACH_ROUTING_NBR = request.achRoutingNumber;
        payload.ACH_ACCOUNT_NBR = request.achAccountNumber;
        payload.ACH_ACCOUNT_TYPE = request.achAccountType?.toUpperCase() || 'CHECKING';
        payload.ACH_ACCOUNT_NAME = request.achAccountName;
        payload.TRAN_CODE = 'ACE1';  // ACH Ecommerce Sale
      } else {
        payload.TRAN_CODE = 'CCE1';  // Card Ecommerce Sale
      }

      console.log('[EPX] Sending TAC request to:', this.keyExchangeUrl);
      console.log('[EPX] TAC payload:', { ...payload, MAC: '***MASKED***' });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout for Replit environment

      const response = await fetch(this.keyExchangeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'DPC-EPX-Integration/1.0'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      }).catch((fetchError: any) => {
        // Handle network errors specifically
        if (fetchError.code === 'UND_ERR_CONNECT_TIMEOUT' || fetchError.cause?.code === 'UND_ERR_CONNECT_TIMEOUT') {
          console.error('[EPX] Network timeout - EPX service may be unavailable from this environment');
          throw new Error('EPX_NETWORK_TIMEOUT');
        }
        throw fetchError;
      });

      clearTimeout(timeoutId);

      console.log('[EPX] TAC response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[EPX] TAC request failed:', response.status, errorText);
        throw new Error(`TAC request failed: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log('[EPX] TAC response data:', data);

      if (data.TAC) {
        console.log('[EPX] TAC generated successfully');
        return {
          success: true,
          tac: data.TAC
        };
      } else {
        console.error('[EPX] TAC generation failed:', data);
        return {
          success: false,
          error: data.error || 'Failed to generate TAC'
        };
      }
    } catch (error: any) {
      console.error('[EPX] TAC generation error:', error);
      
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'EPX service timeout - The payment processor is not responding. Please try again later.'
        };
      }
      
      if (error.message === 'EPX_NETWORK_TIMEOUT' || error.message.includes('fetch') || error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT') {
        return {
          success: false,
          error: 'EPX payment service is currently unavailable. This may be due to network restrictions in the development environment. Please contact support if this persists.'
        };
      }
      
      return {
        success: false,
        error: error.message || 'TAC generation failed'
      };
    }
  }

  /**
   * Get payment form data for Browser Post API
   */
  getPaymentFormData(tac: string, amount: number, tranNbr: string, paymentMethod: 'card' | 'ach' = 'card'): EPXPaymentForm {
    return {
      actionUrl: this.apiUrl,
      tac: tac,
      tranCode: paymentMethod === 'ach' ? 'ACE1' : 'CCE1',  // ACH or Card Ecommerce Sale
      tranGroup: 'SALE',
      amount: amount,
      tranNbr: tranNbr,
      redirectUrl: this.config.redirectUrl,
      responseUrl: this.config.responseUrl,
      redirectEcho: 'V',
      responseEcho: 'V',
      receipt: 'Y',
      cancelUrl: this.config.cancelUrl
    };
  }

  /**
   * Get hosted checkout configuration
   */
  getHostedCheckoutConfig() {
    if (!this.config.checkoutId) {
      throw new Error('Checkout ID not configured for Hosted Checkout');
    }

    return {
      checkoutId: this.config.checkoutId,
      scriptUrl: 'https://hosted.epxuap.com/button.js',
      environment: this.config.environment
    };
  }

  /**
   * Process webhook from EPX
   */
  processWebhook(payload: EPXWebhookPayload): {
    isApproved: boolean;
    transactionId?: string;
    authCode?: string;
    bricToken?: string;
    amount?: number;
    error?: string;
  } {
    console.log('[EPX] Processing webhook:', {
      AUTH_RESP: payload.AUTH_RESP,
      TRAN_NBR: payload.TRAN_NBR
    });

    const isApproved = payload.AUTH_RESP === 'APPROVAL';

    if (isApproved) {
      return {
        isApproved: true,
        transactionId: payload.TRAN_NBR,
        authCode: payload.AUTH_CODE,
        bricToken: payload.AUTH_GUID,  // Store this for refunds/voids
        amount: payload.AUTH_AMOUNT ? parseFloat(payload.AUTH_AMOUNT) : undefined
      };
    } else {
      return {
        isApproved: false,
        error: payload.NETWORK_RESPONSE || payload.AUTH_RESP || 'Transaction declined'
      };
    }
  }

  /**
   * Validate webhook signature (if implemented by EPX)
   */
  validateWebhookSignature(payload: any, signature?: string): boolean {
    if (!this.config.webhookSecret) {
      console.warn('[EPX] Webhook secret not configured, skipping validation');
      return true;  // Allow for development
    }

    // TODO: Implement actual signature validation based on EPX documentation
    // This is a placeholder - actual implementation would depend on EPX specs
    return true;
  }

  /**
   * Refund transaction using BRIC token and Custom Pay API
   */
  async refundTransaction(bricToken: string, amount: number, transactionId?: number): Promise<{
    success: boolean;
    refundId?: string;
    error?: string;
  }> {
    try {
      console.log('[EPX] Processing refund via Custom Pay API');

      if (!this.config.epiId || !this.config.epiKey) {
        throw new Error('EPI credentials not configured for Custom Pay API');
      }

      const endpoint = `/refund/${bricToken}`;
      const payload = {
        amount: amount,
        transaction: transactionId || Date.now()  // Use provided transaction ID or timestamp
      };

      // Generate EPI-Signature
      const signature = this.generateEPISignature(endpoint, payload);

      const response = await fetch(`${this.customPayApiUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'EPI-Id': this.config.epiId,
          'EPI-Signature': signature
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (data.data && data.data.response === '00') {
        return {
          success: true,
          refundId: data.data.authorization
        };
      } else {
        return {
          success: false,
          error: data.errors || data.data?.text || 'Refund failed'
        };
      }
    } catch (error: any) {
      console.error('[EPX] Refund error:', error);
      return {
        success: false,
        error: error.message || 'Refund processing failed'
      };
    }
  }

  /**
   * Void transaction using BRIC token
   */
  async voidTransaction(bricToken: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      console.log('[EPX] Processing void via Custom Pay API');

      if (!this.config.epiId || !this.config.epiKey) {
        throw new Error('EPI credentials not configured for Custom Pay API');
      }

      const endpoint = `/void/${bricToken}`;
      const signature = this.generateEPISignature(endpoint, {});

      const response = await fetch(`${this.customPayApiUrl}${endpoint}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'EPI-Id': this.config.epiId,
          'EPI-Signature': signature,
          'bric': bricToken
        }
      });

      const data = await response.json();

      if (data.data && data.data.response === '00') {
        return {
          success: true
        };
      } else {
        return {
          success: false,
          error: data.errors || data.data?.text || 'Void failed'
        };
      }
    } catch (error: any) {
      console.error('[EPX] Void error:', error);
      return {
        success: false,
        error: error.message || 'Void processing failed'
      };
    }
  }

  /**
   * Generate EPI-Signature for Custom Pay API
   */
  private generateEPISignature(endpoint: string, payload: any): string {
    if (!this.config.epiKey) {
      throw new Error('EPI Key not configured');
    }

    const message = endpoint + JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', this.config.epiKey)
      .update(message)
      .digest('hex');

    return signature;
  }
}

// Export singleton instance
let epxService: EPXPaymentService | null = null;

export function initializeEPXService(config: EPXConfig): EPXPaymentService {
  epxService = new EPXPaymentService(config);
  return epxService;
}

export function getEPXService(): EPXPaymentService {
  if (!epxService) {
    throw new Error('EPX Service not initialized. Call initializeEPXService first.');
  }
  return epxService;
}