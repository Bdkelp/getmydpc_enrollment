/**
 * Payment Service Abstraction Layer
 * Supports multiple payment providers: Mock, EPX Browser Post API (North.com)
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

// Note: EPX Browser Post API integration is handled in epx-hosted-checkout-service.ts
// This payment-service.ts file is for the Mock payment provider used in testing

// Payment Service Factory
export class PaymentService {
  private provider: PaymentProvider;

  constructor() {
    // Initialize with Mock payment provider for testing
    // Production payments are handled by EPX Hosted Checkout (see epx-hosted-checkout-service.ts)
    this.provider = new MockPaymentProvider();
    console.log(`[PaymentService] Initialized with ${this.provider.name} provider (EPX Hosted Checkout used for production)`);
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