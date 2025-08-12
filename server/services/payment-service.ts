/**
 * Payment Service Abstraction Layer
 * Supports multiple payment providers: Mock, PayAnywhere (North.com)
 */

export interface PaymentProvider {
  name: string;
  processPayment(paymentData: PaymentRequest): Promise<PaymentResponse>;
  refundPayment(transactionId: string, amount?: number): Promise<RefundResponse>;
  getTransaction(transactionId: string): Promise<TransactionDetails>;
  validateWebhook(payload: any, signature: string): boolean;
}

export interface PaymentRequest {
  amount: number;
  currency: string;
  cardToken?: string; // Tokenized card data from frontend
  customerId: string;
  customerEmail: string;
  description: string;
  metadata?: Record<string, any>;
  // PayAnywhere specific fields
  invoiceNumber?: string;
  orderNumber?: string;
  taxAmount?: number;
  tipAmount?: number;
}

export interface PaymentResponse {
  success: boolean;
  transactionId: string;
  status: 'approved' | 'declined' | 'pending' | 'error';
  message?: string;
  authorizationCode?: string;
  last4?: string;
  cardType?: string;
  processorResponse?: any;
}

export interface RefundResponse {
  success: boolean;
  refundId: string;
  status: 'approved' | 'pending' | 'failed';
  amount: number;
  message?: string;
}

export interface TransactionDetails {
  transactionId: string;
  amount: number;
  status: string;
  createdAt: Date;
  cardLast4?: string;
  cardType?: string;
  customerEmail?: string;
  refunds?: RefundResponse[];
}

// Mock Payment Provider for Development
export class MockPaymentProvider implements PaymentProvider {
  name = 'mock';

  async processPayment(paymentData: PaymentRequest): Promise<PaymentResponse> {
    console.log('[MockPayment] Processing payment:', paymentData);
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate successful payment
    return {
      success: true,
      transactionId: `MOCK_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      status: 'approved',
      message: 'Mock payment successful',
      authorizationCode: 'MOCK_AUTH_' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      last4: '4242',
      cardType: 'visa'
    };
  }

  async refundPayment(transactionId: string, amount?: number): Promise<RefundResponse> {
    console.log('[MockPayment] Processing refund:', { transactionId, amount });
    
    return {
      success: true,
      refundId: `REFUND_${Date.now()}`,
      status: 'approved',
      amount: amount || 0,
      message: 'Mock refund successful'
    };
  }

  async getTransaction(transactionId: string): Promise<TransactionDetails> {
    return {
      transactionId,
      amount: 100.00,
      status: 'approved',
      createdAt: new Date(),
      cardLast4: '4242',
      cardType: 'visa',
      customerEmail: 'test@example.com'
    };
  }

  validateWebhook(payload: any, signature: string): boolean {
    return true; // Always valid for mock
  }
}

// PayAnywhere Payment Provider (North.com)
export class PayAnywhereProvider implements PaymentProvider {
  name = 'payanywhere';
  private apiKey: string;
  private merchantId: string;
  private apiUrl: string;

  constructor(config: {
    apiKey: string;
    merchantId: string;
    environment: 'sandbox' | 'production';
  }) {
    this.apiKey = config.apiKey;
    this.merchantId = config.merchantId;
    // PayAnywhere typically uses different URLs for sandbox and production
    this.apiUrl = config.environment === 'production' 
      ? 'https://api.payanywhere.com/v1' // Production URL (to be confirmed)
      : 'https://sandbox.payanywhere.com/v1'; // Sandbox URL (to be confirmed)
  }

  async processPayment(paymentData: PaymentRequest): Promise<PaymentResponse> {
    console.log('[PayAnywhere] Processing payment');
    
    try {
      // PayAnywhere API implementation will go here
      // This is a placeholder structure based on typical payment gateway patterns
      
      const requestBody = {
        merchant_id: this.merchantId,
        amount: paymentData.amount,
        currency: paymentData.currency || 'USD',
        card_token: paymentData.cardToken,
        customer: {
          id: paymentData.customerId,
          email: paymentData.customerEmail
        },
        order: {
          invoice_number: paymentData.invoiceNumber,
          order_number: paymentData.orderNumber,
          description: paymentData.description
        },
        tax_amount: paymentData.taxAmount || 0,
        tip_amount: paymentData.tipAmount || 0,
        metadata: paymentData.metadata
      };

      // TODO: Implement actual PayAnywhere API call
      // const response = await fetch(`${this.apiUrl}/transactions`, {
      //   method: 'POST',
      //   headers: {
      //     'Authorization': `Bearer ${this.apiKey}`,
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify(requestBody)
      // });

      // Placeholder response - replace with actual API integration
      throw new Error('PayAnywhere API credentials not configured. Please add PAYANYWHERE_API_KEY and PAYANYWHERE_MERCHANT_ID to environment variables.');
      
    } catch (error: any) {
      console.error('[PayAnywhere] Payment error:', error);
      return {
        success: false,
        transactionId: '',
        status: 'error',
        message: error.message || 'Payment processing failed'
      };
    }
  }

  async refundPayment(transactionId: string, amount?: number): Promise<RefundResponse> {
    console.log('[PayAnywhere] Processing refund');
    
    try {
      // TODO: Implement PayAnywhere refund API call
      throw new Error('PayAnywhere refund not yet implemented');
    } catch (error: any) {
      return {
        success: false,
        refundId: '',
        status: 'failed',
        amount: amount || 0,
        message: error.message
      };
    }
  }

  async getTransaction(transactionId: string): Promise<TransactionDetails> {
    console.log('[PayAnywhere] Fetching transaction:', transactionId);
    
    // TODO: Implement PayAnywhere transaction query
    throw new Error('PayAnywhere transaction query not yet implemented');
  }

  validateWebhook(payload: any, signature: string): boolean {
    // TODO: Implement PayAnywhere webhook signature validation
    // This typically involves HMAC-SHA256 or similar verification
    console.log('[PayAnywhere] Validating webhook signature');
    return false;
  }
}

// Payment Service Factory
export class PaymentService {
  private provider: PaymentProvider;

  constructor() {
    // Initialize based on environment configuration
    const paymentProvider = process.env.PAYMENT_PROVIDER || 'mock';
    
    switch (paymentProvider) {
      case 'payanywhere':
        if (!process.env.PAYANYWHERE_API_KEY || !process.env.PAYANYWHERE_MERCHANT_ID) {
          console.warn('[PaymentService] PayAnywhere credentials not found, falling back to mock provider');
          this.provider = new MockPaymentProvider();
        } else {
          this.provider = new PayAnywhereProvider({
            apiKey: process.env.PAYANYWHERE_API_KEY,
            merchantId: process.env.PAYANYWHERE_MERCHANT_ID,
            environment: process.env.PAYANYWHERE_ENVIRONMENT === 'production' ? 'production' : 'sandbox'
          });
        }
        break;
      default:
        this.provider = new MockPaymentProvider();
    }
    
    console.log(`[PaymentService] Initialized with ${this.provider.name} provider`);
  }

  getProvider(): PaymentProvider {
    return this.provider;
  }

  async processPayment(paymentData: PaymentRequest): Promise<PaymentResponse> {
    return this.provider.processPayment(paymentData);
  }

  async refundPayment(transactionId: string, amount?: number): Promise<RefundResponse> {
    return this.provider.refundPayment(transactionId, amount);
  }

  async getTransaction(transactionId: string): Promise<TransactionDetails> {
    return this.provider.getTransaction(transactionId);
  }

  validateWebhook(payload: any, signature: string): boolean {
    return this.provider.validateWebhook(payload, signature);
  }
}

// Export singleton instance
export const paymentService = new PaymentService();