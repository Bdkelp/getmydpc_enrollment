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

function extractAuthGuid(payload: any): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const candidates = [
    payload.AUTH_GUID,
    payload.authGuid,
    payload.ORIG_AUTH_GUID,
    payload.origAuthGuid,
    payload.ORIG_AUTH,
    payload.origAuth,
    payload.result?.AUTH_GUID,
    payload.result?.authGuid,
    payload.result?.ORIG_AUTH_GUID,
    payload.result?.origAuthGuid,
    payload.result?.ORIG_AUTH,
    payload.result?.origAuth
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length) {
      return value.trim();
    }
  }

  return undefined;
}

function normalizeStatus(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function extractTransactionId(payload: any): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const candidates = [
    payload.transactionId,
    payload.TRANSACTION_ID,
    payload.transaction_id,
    payload.TRAN_NBR,
    payload.tranNbr,
    payload.orderNumber,
    payload.ORDER_NUMBER,
    payload.invoiceNumber,
    payload.INVOICE_NUMBER,
    payload.result?.transactionId,
    payload.result?.TRANSACTION_ID,
    payload.result?.TRAN_NBR,
    payload.result?.orderNumber,
    payload.result?.ORDER_NUMBER,
    payload.result?.invoiceNumber,
    payload.result?.INVOICE_NUMBER,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function extractAuthCode(payload: any): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const candidates = [
    payload.authCode,
    payload.AUTH_CODE,
    payload.AUTH_RESP,
    payload.authResp,
    payload.result?.authCode,
    payload.result?.AUTH_CODE,
    payload.result?.AUTH_RESP,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function extractAmount(payload: any): number | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const candidates = [
    payload.amount,
    payload.AUTH_AMOUNT,
    payload.authAmount,
    payload.result?.amount,
    payload.result?.AUTH_AMOUNT,
  ];

  for (const value of candidates) {
    const parsed = typeof value === 'number' ? value : parseFloat(String(value));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
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
      captchaMode: 'recaptcha-v3'
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
    bricToken?: string; // GUID payment token for recurring billing
    authGuid?: string; // AUTH_GUID for ServerPost transactions
    error?: string;
  } {
    console.log("[EPX Hosted Checkout] Processing callback:", payload);

    const status = normalizeStatus(payload?.status || payload?.Status || payload?.result?.status || payload?.result?.Status);
    const authResp = normalizeStatus(payload?.AUTH_RESP || payload?.authResp || payload?.result?.AUTH_RESP || payload?.result?.authResp);
    const successFlag = payload?.success === true || payload?.Success === true || payload?.approved === true || payload?.Approved === true;
    // EPX callback variants can mark success via status strings, booleans, or auth response code.
    const isApproved = successFlag
      || ['approved', 'success', 'succeeded', 'completed'].includes(status)
      || ['00', '0', 'approved', 'success'].includes(authResp);

    if (isApproved) {
      const authGuid = extractAuthGuid(payload);
      return {
        isApproved: true,
        transactionId: extractTransactionId(payload),
        authCode: extractAuthCode(payload),
        amount: extractAmount(payload),
        bricToken: payload.result?.GUID || payload.GUID, // BRIC token for recurring billing
        authGuid
      };
    } else {
      return {
        isApproved: false,
        error: payload.error || payload.message || payload.StatusMessage || "Transaction declined"
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