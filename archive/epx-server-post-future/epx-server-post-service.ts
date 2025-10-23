/**
 * EPX Server Post API Service
 * Handles Card on File (BRIC tokens) and recurring monthly membership charges
 * 
 * Based on: EPX Server Post Integration Guide
 * Documentation: https://developer.north.com/products/full-featured/server-post
 */

import crypto from 'crypto';
import type { Request, Response } from 'express';

// ============================================================
// CONFIGURATION
// ============================================================

export interface EPXServerPostConfig {
  epiId: string;        // Format: "CustNbr.DbaNbr.MerchNbr.TerminalNbr"
  epiKey: string;       // Secret key for signature generation (your EPX_MAC value)
  environment: 'sandbox' | 'production';
}

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface CardDetails {
  cardNumber: string;
  expirationDate: string;  // MMYY format
  cvv: string;
}

export interface CustomerData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

export interface BRICTokenResponse {
  Status: 'Approved' | 'Declined';
  BRIC?: string;                    // The token to store
  CardNumber?: string;              // Masked (e.g., "************1234")
  CardType?: string;                // "Visa", "Mastercard", etc.
  NetworkTransactionId?: string;    // CRITICAL: Store for recurring charges
  ResponseCode?: string;            // "00" = Approved
  Message?: string;
  TransactionId?: string;
}

export interface RecurringChargeResponse {
  Status: 'Approved' | 'Declined';
  TransactionId?: string;
  NetworkTransactionId?: string;
  ResponseCode?: string;
  Message?: string;
  Amount?: string;
  AuthorizationCode?: string;
}

export interface StorageTransactionRequest {
  cardDetails: CardDetails;
  customerData: CustomerData;
}

export interface RecurringChargeRequest {
  bricToken: string;
  amount: number;
  invoiceNumber: string;
  orderDescription: string;
  customerData: CustomerData;
  originalNetworkTransactionId: string;  // From initial transaction
  isFirstRecurringPayment: boolean;
}

// ============================================================
// EPX SERVER POST SERVICE
// ============================================================

export class EPXServerPostService {
  private config: EPXServerPostConfig;
  private apiUrl: string;

  constructor(config: EPXServerPostConfig) {
    this.config = config;
    
    // Set API URL based on environment
    // Note: Get actual URLs from North Developer Portal
    this.apiUrl = config.environment === 'production'
      ? process.env.EPX_PRODUCTION_API_URL || 'https://api.north.com'
      : process.env.EPX_SANDBOX_API_URL || 'https://api-sandbox.north.com';
    
    console.log('[EPX Server Post] Service initialized:', {
      environment: config.environment,
      epiId: config.epiId.substring(0, 10) + '...',
      apiUrl: this.apiUrl
    });
  }

  /**
   * Generate EPI-Signature for request authentication
   * Signature = HMAC-SHA256(route + JSON.stringify(payload), epiKey)
   */
  private generateEPISignature(route: string, payload: Record<string, any>): string {
    try {
      // Concatenate route + JSON payload (no separator)
      const dataToSign = route + JSON.stringify(payload);
      
      // Generate HMAC-SHA256 signature
      const signature = crypto
        .createHmac('sha256', this.config.epiKey)
        .update(dataToSign)
        .digest('hex');
      
      return signature;
    } catch (error) {
      console.error('[EPX Server Post] Error generating signature:', error);
      throw new Error('Failed to generate EPI-Signature');
    }
  }

  /**
   * Make authenticated API request to EPX
   */
  private async makeRequest(route: string, payload: Record<string, any>): Promise<any> {
    const signature = this.generateEPISignature(route, payload);
    const url = `${this.apiUrl}${route}`;
    
    console.log('[EPX Server Post] Request:', {
      route,
      url,
      epiId: this.config.epiId,
      hasSignature: !!signature
    });
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'EPI-Id': this.config.epiId,
          'EPI-Signature': signature
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      console.log('[EPX Server Post] Response:', {
        route,
        status: result.Status,
        responseCode: result.ResponseCode,
        message: result.Message
      });
      
      return result;
    } catch (error: any) {
      console.error('[EPX Server Post] Request failed:', error);
      throw new Error(`EPX API request failed: ${error.message}`);
    }
  }

  /**
   * Create BRIC token (Storage Transaction)
   * Use this during initial enrollment after successful payment
   * to tokenize the card for future recurring charges
   */
  async createBRICToken(request: StorageTransactionRequest): Promise<BRICTokenResponse> {
    const route = '/storage';
    
    const payload = {
      TransactionType: 'Storage',
      CardData: {
        AccountNumber: request.cardDetails.cardNumber,
        ExpirationDate: request.cardDetails.expirationDate, // MMYY
        CVV: request.cardDetails.cvv
      },
      CustomerData: {
        FirstName: request.customerData.firstName,
        LastName: request.customerData.lastName,
        Email: request.customerData.email,
        Phone: request.customerData.phone
      }
    };
    
    const result = await this.makeRequest(route, payload);
    return result as BRICTokenResponse;
  }

  /**
   * Process recurring monthly membership charge
   * Called by the billing scheduler for automated monthly charges
   */
  async processRecurringCharge(request: RecurringChargeRequest): Promise<RecurringChargeResponse> {
    const route = '/sale';
    
    const payload = {
      TransactionType: 'Sale',
      Amount: request.amount.toFixed(2), // Format: "29.99"
      BRIC: request.bricToken,
      InvoiceNumber: request.invoiceNumber,
      OrderDescription: request.orderDescription,
      CustomerData: {
        FirstName: request.customerData.firstName,
        LastName: request.customerData.lastName,
        Email: request.customerData.email
      },
      // Card on File compliance fields (REQUIRED)
      StoredCredentialIndicator: 'Recurring', // or 'Unscheduled' for one-time
      IsFirstRecurringPayment: request.isFirstRecurringPayment,
      OriginalNetworkTransactionId: request.originalNetworkTransactionId
    };
    
    const result = await this.makeRequest(route, payload);
    return result as RecurringChargeResponse;
  }

  /**
   * Void a transaction (same-day cancellation)
   */
  async voidTransaction(transactionId: string): Promise<any> {
    const route = '/void';
    
    const payload = {
      TransactionType: 'Void',
      TransactionId: transactionId
    };
    
    return await this.makeRequest(route, payload);
  }

  /**
   * Refund a settled transaction
   */
  async refundTransaction(
    bricToken: string,
    amount: number,
    originalTransactionId: string
  ): Promise<any> {
    const route = '/refund';
    
    const payload = {
      TransactionType: 'Refund',
      Amount: amount.toFixed(2),
      BRIC: bricToken,
      OriginalTransactionId: originalTransactionId
    };
    
    return await this.makeRequest(route, payload);
  }

  /**
   * Get test card numbers for sandbox testing
   */
  static getTestCards() {
    return {
      visa: {
        approved: '4012881888818888',
        declined: '4000000000000002'
      },
      mastercard: {
        approved: '5425233430109903'
      },
      discover: {
        approved: '6011111111111117'
      },
      testExpiry: '1225', // MMYY format
      testCVV: '123'
    };
  }
}

// ============================================================
// FACTORY FUNCTION
// ============================================================

/**
 * Create EPX Server Post service instance from environment variables
 */
export function createEPXServerPostService(): EPXServerPostService {
  // Construct EPI-Id from existing credentials
  const epiId = [
    process.env.EPX_CUST_NBR,
    process.env.EPX_DBA_NBR,
    process.env.EPX_MERCH_NBR,
    process.env.EPX_TERMINAL_NBR
  ].join('.');
  
  const epiKey = process.env.EPX_MAC;
  const environment = (process.env.EPX_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';
  
  if (!epiKey) {
    throw new Error('EPX_MAC (EPI-Key) not configured in environment variables');
  }
  
  const config: EPXServerPostConfig = {
    epiId,
    epiKey,
    environment
  };
  
  return new EPXServerPostService(config);
}

// ============================================================
// RESPONSE CODE MAPPINGS
// ============================================================

export const EPX_RESPONSE_CODES: Record<string, string> = {
  '00': 'Approved',
  '05': 'Do not honor',
  '12': 'Invalid transaction',
  '13': 'Invalid amount',
  '14': 'Invalid card number',
  '51': 'Insufficient funds',
  '54': 'Expired card',
  '55': 'Invalid PIN',
  '57': 'Transaction not permitted',
  '91': 'Issuer unavailable'
};

export function getResponseMessage(responseCode: string): string {
  return EPX_RESPONSE_CODES[responseCode] || 'Unknown error';
}
