/**
 * EPX Hosted Checkout Service Implementation
 * Simpler implementation using EPX's hosted payment page
 * No TAC generation required - uses PublicKey instead
 */

export interface EPXHostedCheckoutConfig {
  publicKey: string; // PublicKey provided by EPX
  terminalProfileId: string; // Terminal profile ID
  environment: "sandbox" | "production";
  successCallback?: string; // JavaScript callback function name
  failureCallback?: string; // JavaScript callback function name
}

export interface HostedCheckoutSession {
  publicKey: string;
  amount: number;
  orderNumber: string;
  invoiceNumber?: string;
  email: string;
  billingName: string;
  billingStreetAddress?: string;
  billingCity?: string;
  billingState?: string;
  billingPostalCode?: string;
  captcha?: string; // 'bypass' for sandbox, actual token for production
}

export interface HostedCheckoutResponse {
  success: boolean;
  sessionId?: string;
  publicKey?: string;
  error?: string;
}

export class EPXHostedCheckoutService {
  private config: EPXHostedCheckoutConfig;
  private scriptUrl: string;
  private buttonScriptUrl: string;

  constructor(config: EPXHostedCheckoutConfig) {
    this.config = config;
    
    // Set URLs based on environment
    const baseUrl = config.environment === "production" 
      ? "https://hosted.epx.com"
      : "https://hosted.epxuap.com";
    
    this.scriptUrl = `${baseUrl}/post.js`;
    this.buttonScriptUrl = `${baseUrl}/button.js`;
    
    console.log("[EPX Hosted Checkout] Service initialized:", {
      environment: config.environment,
      terminalProfileId: config.terminalProfileId,
      scriptUrl: this.scriptUrl,
      hasPublicKey: !!config.publicKey
    });
  }

  /**
   * Create a hosted checkout session
   * Returns the data needed for the frontend to display the payment form
   */
  createCheckoutSession(
    amount: number,
    orderNumber: string,
    customerEmail: string,
    customerName: string,
    billingAddress?: {
      streetAddress?: string;
      city?: string;
      state?: string;
      postalCode?: string;
    }
  ): HostedCheckoutResponse {
    try {
      // Generate order number if not provided
      const finalOrderNumber = orderNumber || Date.now().toString().slice(-10);
      
      // For Hosted Checkout, we just return the configuration
      // The actual payment form is handled client-side with post.js
      return {
        success: true,
        sessionId: finalOrderNumber,
        publicKey: this.config.publicKey,
      };
    } catch (error: any) {
      console.error("[EPX Hosted Checkout] Error creating session:", error);
      return {
        success: false,
        error: error.message || "Failed to create checkout session"
      };
    }
  }

  /**
   * Get the configuration for the frontend
   * This includes the PublicKey and script URLs
   */
  getCheckoutConfig() {
    return {
      publicKey: this.config.publicKey,
      terminalProfileId: this.config.terminalProfileId,
      scriptUrl: this.scriptUrl,
      buttonScriptUrl: this.buttonScriptUrl,
      environment: this.config.environment,
      successCallback: this.config.successCallback || "epxSuccessCallback",
      failureCallback: this.config.failureCallback || "epxFailureCallback",
      // For sandbox testing, use 'bypass' for captcha
      captcha: this.config.environment === "sandbox" ? "bypass" : null
    };
  }

  /**
   * Process the callback from EPX after payment
   * This is called when EPX redirects back to our site
   */
  processCallback(payload: any): {
    isApproved: boolean;
    transactionId?: string;
    authCode?: string;
    amount?: number;
    error?: string;
  } {
    console.log("[EPX Hosted Checkout] Processing callback:", payload);

    // The exact response format will depend on EPX's callback structure
    // This is a placeholder implementation
    const isApproved = payload.status === "approved" || payload.success === true;

    if (isApproved) {
      return {
        isApproved: true,
        transactionId: payload.transactionId || payload.orderNumber,
        authCode: payload.authCode,
        amount: payload.amount ? parseFloat(payload.amount) : undefined
      };
    } else {
      return {
        isApproved: false,
        error: payload.error || payload.message || "Transaction declined"
      };
    }
  }

  /**
   * Validate callback signature (if EPX provides one)
   */
  validateCallbackSignature(payload: any, signature?: string): boolean {
    // For now, return true as Hosted Checkout may not use signatures
    // This can be implemented if EPX provides signature validation
    console.log("[EPX Hosted Checkout] Signature validation not implemented for Hosted Checkout");
    return true;
  }

  /**
   * Get the payment method type
   */
  getPaymentMethod(): string {
    return "hosted-checkout";
  }
}