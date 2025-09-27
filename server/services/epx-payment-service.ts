/**
 * EPX Payment Service Implementation
 * Browser Post API Integration with North.com EPX
 */

import crypto from "crypto";

export interface EPXConfig {
  mac: string; // MAC key for Browser Post API (from Key Exchange)
  epiId?: string; // For Custom Pay API (refunds/voids)
  epiKey?: string; // For Custom Pay API signature
  custNbr: string; // Customer Number
  merchNbr: string; // Merchant Number
  dbaNbr: string; // DBA Number
  terminalNbr: string; // Terminal Number
  environment: "sandbox" | "production";
  redirectUrl: string;
  responseUrl: string;
  cancelUrl?: string;
  webhookSecret?: string;
  tacEndpoint?: string; // Added for TAC generation endpoint
}

export interface TACRequest {
  amount: number;
  tranNbr: string;
  tranGroup?: string;
  customerEmail?: string;
  invoiceNumber?: string;
  orderDescription?: string;
  paymentMethod?: "card" | "ach";
  achRoutingNumber?: string;
  achAccountNumber?: string;
  achAccountType?: "checking" | "savings";
  achAccountName?: string;
}

export interface TACResponse {
  success: boolean;
  tac?: string;
  error?: string;
  details?: string;
}

export interface EPXPaymentForm {
  actionUrl: string;
  tac: string;
  // 4-part merchant key (required for Browser Post transaction)
  custNbr: string;
  merchNbr: string;
  dbaNbr: string;
  terminalNbr: string;
  // Transaction details
  tranCode: string;
  tranGroup: string;
  amount: number;
  tranNbr: string;
  // URLs
  redirectUrl: string;
  responseUrl: string;
  redirectEcho: string;
  responseEcho: string;
  // Required fields
  industryType: string;
  batchId: string;
  receipt: string;
  // AVS information
  zipCode?: string;
  address?: string;
  // ACH specific fields
  paymentType?: string;
  achRoutingNumber?: string;
  achAccountNumber?: string;
  achAccountType?: string;
  achAccountName?: string;
}

export interface EPXWebhookPayload {
  AUTH_RESP: string;
  AUTH_CODE?: string;
  AUTH_GUID?: string; // BRIC token for future operations
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
    if (config.environment === "production") {
      this.apiUrl = "https://services.epxuap.com/browserpost/";
      this.keyExchangeUrl = "https://keyexch.epxuap.com";
      this.customPayApiUrl = "https://epi.epxuap.com";
    } else {
      // Sandbox URLs - using alternative endpoints for better connectivity
      this.apiUrl = "https://services.epxuap.com/browserpost/";
      this.keyExchangeUrl = "https://keyexch.epxuap.com";
      this.customPayApiUrl = "https://epi.epxuap.com";
    }

    // Ensure tacEndpoint is set for sandbox if not provided, pointing to keyExchangeUrl
    if (config.environment === "sandbox" && !config.tacEndpoint) {
      config.tacEndpoint = this.keyExchangeUrl;
    }

    console.log("[EPX Service] Initialized with config:", {
      custNbr: this.config.custNbr,
      merchNbr: this.config.merchNbr,
      dbaNbr: this.config.dbaNbr,
      terminalNbr: this.config.terminalNbr,
      environment: this.config.environment,
      redirectUrl: this.config.redirectUrl,
      hasMAC: !!this.config.mac,
      tacEndpoint: this.config.tacEndpoint,
    });
  }

  /**
   * Generate TAC (Terminal Authentication Code) for Browser Post API
   */
  async generateTAC(request: TACRequest): Promise<TACResponse> {
    try {
      console.log("[EPX] Generating TAC for transaction");

      if (!this.config.mac) {
        throw new Error("MAC value not configured for Browser Post API");
      }
      if (!this.config.tacEndpoint) {
        throw new Error("TAC Endpoint not configured");
      }

      // KeyExchange payload - only include fields required for TAC generation per EPX feedback
      const payload: any = {
        MAC: this.config.mac,
        AMOUNT: request.amount.toFixed(2),
        TRAN_NBR: request.tranNbr, // Use the provided transaction number
        TRAN_GROUP: request.tranGroup || "SALE",
        REDIRECT_URL: this.config.redirectUrl,
        REDIRECT_ECHO: "V", // Verbose response
      };

      // EPX feedback: These fields should NOT be in keyExchange, they belong in Browser Post request:
      // - CUST_NBR, MERCH_NBR, DBA_NBR, TERMINAL_NBR (go in Browser Post transaction request)
      // - RESPONSE_URL (not stored on EPX side)
      // - CANCEL_URL (not valid for Browser Post API)
      // - TRAN_CODE (only for Browser Post request)
      // - RECEIPT (for PayPage only)
      // - EMAIL (not an EPX field)
      // - DESCRIPTION (not an EPX field)

      console.log("[EPX] Sending TAC request to:", this.config.tacEndpoint);
      console.log("[EPX] TAC payload structure check:", {
        hasMAC: !!payload.MAC,
        macLength: payload.MAC?.length,
        custNbr: payload.CUST_NBR,
        merchNbr: payload.MERCH_NBR,
        dbaNbr: payload.DBA_NBR,
        terminalNbr: payload.TERMINAL_NBR,
        amount: payload.AMOUNT,
        tranNbr: payload.TRAN_NBR,
        tranCode: payload.TRAN_CODE,
        redirectUrl: payload.REDIRECT_URL,
        responseUrl: payload.RESPONSE_URL,
        fieldsCount: Object.keys(payload).length,
      });

      // Convert to form data format - EPX expects form-encoded data
      const formData = new URLSearchParams();
      Object.entries(payload).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });

      // Ensure required fields are present for keyExchange (not Browser Post)
      const requiredFields = ['MAC', 'AMOUNT', 'TRAN_NBR', 'REDIRECT_URL'];
      const missingFields = requiredFields.filter(field => !payload[field]);
      if (missingFields.length > 0) {
        console.error("[EPX] Missing required fields for keyExchange:", missingFields);
        return {
          success: false,
          error: `Missing required fields for keyExchange: ${missingFields.join(', ')}`,
        };
      }

      console.log(
        "[EPX] Form data string:",
        formData.toString().replace(/MAC=[^&]*/g, "MAC=***MASKED***"),
      );

      // Retry logic for network issues
      const maxRetries = 3;
      const baseTimeout = 30000; // 30 second timeout
      let lastError: any;
      let response: Response | null = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`[EPX] TAC generation attempt ${attempt}/${maxRetries}`);

        try {
          const controller = new AbortController();
          const timeout = baseTimeout * attempt; // Increase timeout with each retry
          const timeoutId = setTimeout(() => controller.abort(), timeout);

          // EPX requires form-encoded data only
          const requestOptions = {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "User-Agent": "Mozilla/5.0 (compatible; EPX-Integration/1.0)",
              "Cache-Control": "no-cache",
            },
            body: formData.toString(),
            signal: controller.signal,
          };

          console.log(
            `[EPX] Request ${attempt} Content-Type:`,
            requestOptions.headers["Content-Type"],
          );

          // Log the full request details
          console.log(`[EPX] === RAW KEY EXCHANGE REQUEST ${attempt} ===`);
          console.log(`[EPX] URL: ${this.config.tacEndpoint}`);
          console.log(`[EPX] Method: POST`);
          console.log(`[EPX] Headers:`, JSON.stringify(requestOptions.headers, null, 2));
          console.log(`[EPX] Body (form-encoded):`, formData.toString().replace(/MAC=[^&]*/g, "MAC=***MASKED***"));
          console.log(`[EPX] === END REQUEST ===`);

          response = await fetch(this.config.tacEndpoint, requestOptions).catch(
            (fetchError: any) => {
              // Handle network errors specifically
              if (
                fetchError.name === "AbortError" ||
                fetchError.code === "UND_ERR_CONNECT_TIMEOUT" ||
                fetchError.cause?.code === "UND_ERR_CONNECT_TIMEOUT"
              ) {
                console.error(
                  `[EPX] Network timeout on attempt ${attempt} - EPX service may be unavailable`,
                );
                throw new Error("EPX_NETWORK_TIMEOUT");
              }
              throw fetchError;
            },
          );

          clearTimeout(timeoutId);

          // If we get here, the request succeeded
          console.log(`[EPX] TAC request succeeded on attempt ${attempt}`);
          console.log("[EPX] TAC response status:", response.status);

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[EPX] TAC request failed on attempt ${attempt}:`, {
              status: response.status,
              statusText: response.statusText,
              headers: Object.fromEntries(response.headers.entries()),
              body: errorText,
              contentType: requestOptions.headers["Content-Type"],
            });

            // For 400 errors, provide specific guidance
            if (response.status === 400) {
              console.error("[EPX] 400 Bad Request - Common causes:", {
                possibleIssues: [
                  "Invalid MAC key format or value",
                  "Incorrect merchant/terminal numbers for sandbox",
                  "Missing required fields",
                  "Incorrect data format (amount, dates, etc.)",
                  "Wrong Content-Type header",
                  "Field length violations",
                ],
                sentData: { ...payload, MAC: "***MASKED***" },
              });
            }

            // Don't retry on 4xx errors (client errors) unless it's attempt 1 with form data
            if (
              response.status >= 400 &&
              response.status < 500 &&
              attempt > 1
            ) {
              return {
                success: false,
                error: `TAC request failed: ${response.status} ${errorText}`,
                details: `Request format may be incorrect. Status: ${response.status}`,
              };
            }

            // Retry on 5xx errors (server errors) or first 400 attempt
            lastError = new Error(
              `TAC request failed: ${response.status} ${errorText}`,
            );
            if (attempt === maxRetries) {
              return {
                success: false,
                error: lastError.message,
                details: "All retry attempts failed",
              };
            }
            continue;
          }

          // Parse response - EPX returns XML format
          let data;
          const responseText = await response.text();
          
          // Log the full response details
          console.log(`[EPX] === RAW KEY EXCHANGE RESPONSE ${attempt} ===`);
          console.log(`[EPX] Status: ${response.status} ${response.statusText}`);
          console.log(`[EPX] Headers:`, JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));
          console.log(`[EPX] Body:`, responseText);
          console.log(`[EPX] === END RESPONSE ===`);
          
          console.log("[EPX] Raw response:", responseText);

          // Try to parse as JSON first, then handle XML
          try {
            data = JSON.parse(responseText);
            console.log("[EPX] Parsed JSON response:", data);
          } catch (parseError) {
            console.log(
              "[EPX] Response is not JSON, parsing as XML:",
              responseText,
            );

            // Parse XML response to extract TAC
            const tacMatch = responseText.match(
              /<FIELD KEY="TAC">([^<]+)<\/FIELD>/,
            );
            if (tacMatch && tacMatch[1]) {
              console.log("[EPX] TAC extracted from XML response");
              data = { TAC: tacMatch[1] };
            } else {
              // Check for error messages in XML
              const errorMatch = responseText.match(
                /<FIELD KEY="ERROR">([^<]+)<\/FIELD>/,
              );
              const errorMsg = errorMatch
                ? errorMatch[1]
                : "Failed to parse XML response";
              console.error("[EPX] XML parsing failed:", errorMsg);
              data = { error: errorMsg, rawResponse: responseText };
            }
          }

          if (data.TAC) {
            console.log("[EPX] TAC generated successfully");
            return {
              success: true,
              tac: data.TAC,
            };
          } else {
            console.error("[EPX] TAC generation failed:", data);
            return {
              success: false,
              error: data.error || "Failed to generate TAC",
            };
          }
        } catch (error: any) {
          lastError = error;

          if (error.message === "EPX_NETWORK_TIMEOUT" && attempt < maxRetries) {
            console.log(
              `[EPX] Retrying after timeout, attempt ${attempt + 1}/${maxRetries} in 2 seconds...`,
            );
            await new Promise((resolve) => setTimeout(resolve, 2000));
            continue;
          }

          // If it's the last attempt or a non-retryable error, break
          if (
            attempt === maxRetries ||
            !error.message.includes("EPX_NETWORK_TIMEOUT")
          ) {
            break;
          }
        }
      }

      // If we get here, all retries failed - ensure we return a proper response object
      console.error(
        "[EPX] All TAC generation attempts failed:",
        lastError?.message,
      );
      return {
        success: false,
        error: lastError?.message || "EPX service timeout after all retries",
        details: "All connection attempts to EPX service failed",
      };
    } catch (error: any) {
      console.error("[EPX] TAC generation error after all retries:", error);

      if (
        error.name === "AbortError" ||
        error.message === "EPX_NETWORK_TIMEOUT"
      ) {
        return {
          success: false,
          error:
            "EPX payment service is currently unavailable. This may be due to network connectivity issues. Please try again in a few minutes.",
        };
      }

      if (
        error.message.includes("fetch") ||
        error.cause?.code === "UND_ERR_CONNECT_TIMEOUT"
      ) {
        return {
          success: false,
          error:
            "EPX payment service connection failed. Please contact support if this issue persists.",
        };
      }

      return {
        success: false,
        error: lastError?.message || error.message || "TAC generation failed",
      };
    }
  }

  /**
   * Get payment form data for Browser Post API
   */
  getPaymentFormData(
    tac: string,
    amount: number,
    tranNbr: string,
    paymentMethod: "card" | "ach" = "card",
    customerData?: {
      address?: string;
      zipCode?: string;
    }
  ): EPXPaymentForm & { [key: string]: any } {
    // Browser Post transaction request - include ALL required fields per EPX feedback
    const formData = {
      actionUrl: this.apiUrl,
      tac: tac,
      // 4-part merchant key (required for Browser Post transaction)
      custNbr: this.config.custNbr,
      merchNbr: this.config.merchNbr,
      dbaNbr: this.config.dbaNbr,
      terminalNbr: this.config.terminalNbr,
      // Transaction details
      tranCode: paymentMethod === "ach" ? "AES" : "CES", // Use valid TRAN_CODEs from EPX data dictionary
      tranGroup: "SALE", // Transaction group
      amount: parseFloat(amount.toString()),
      tranNbr: tranNbr,
      // URLs
      redirectUrl: this.config.redirectUrl,
      responseUrl: this.config.responseUrl, // For internal tracking
      redirectEcho: "V", // Verbose response
      responseEcho: "V", // Verbose response
      // Required fields
      industryType: "ECOM", // Ecommerce industry type
      batchId: Date.now().toString(), // Generate batch ID
      receipt: "Y", // Enable receipt
      // AVS information for better interchange rates
      zipCode: customerData?.zipCode || "",
      address: customerData?.address || "",
    };

    console.log('[EPX Service] Browser Post form data:', {
      actionUrl: formData.actionUrl,
      hasTAC: !!formData.tac,
      tranCode: formData.tranCode,
      tranGroup: formData.tranGroup,
      industryType: formData.industryType,
      custNbr: formData.custNbr,
      merchNbr: formData.merchNbr,
      dbaNbr: formData.dbaNbr,
      terminalNbr: formData.terminalNbr,
      hasAVS: !!(formData.zipCode || formData.address)
    });

    // === RAW TRANSACTION POST DEBUG DATA ===
    console.log('[EPX] === RAW TRANSACTION POST DATA FOR DEV TEAM ===');
    console.log('[EPX] URL:', formData.actionUrl);
    console.log('[EPX] Method: POST');
    console.log('[EPX] Headers: {');
    console.log('[EPX]   "Content-Type": "application/x-www-form-urlencoded",');
    console.log('[EPX]   "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",');
    console.log('[EPX]   "User-Agent": "Mozilla/5.0 (compatible; EPX-Integration/1.0)",');
    console.log('[EPX]   "Cache-Control": "no-cache"');
    console.log('[EPX] }');
    
    // Create form-encoded body for logging (mask sensitive data)
    const debugFormData = new URLSearchParams();
    Object.entries(formData).forEach(([key, value]) => {
      if (key === 'tac') {
        debugFormData.append(key, '***TAC_MASKED***');
      } else if (value !== undefined && value !== null && key !== 'actionUrl') {
        debugFormData.append(key.toUpperCase(), value.toString());
      }
    });
    
    console.log('[EPX] Body (form-encoded):', debugFormData.toString());
    console.log('[EPX] === END TRANSACTION POST DATA ===');

    return formData;
  }

  /**
   * Get Browser Post API status - we only support Browser Post, not Hosted Checkout
   */
  getBrowserPostStatus() {
    return {
      method: "browser-post",
      ready: !!this.config.mac,
      environment: this.config.environment,
      endpoints: {
        tac: this.keyExchangeUrl,
        payment: this.apiUrl,
      },
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
    console.log("[EPX] Processing webhook:", {
      AUTH_RESP: payload.AUTH_RESP,
      TRAN_NBR: payload.TRAN_NBR,
    });

    const isApproved = payload.AUTH_RESP === "APPROVAL";

    if (isApproved) {
      return {
        isApproved: true,
        transactionId: payload.TRAN_NBR,
        authCode: payload.AUTH_CODE,
        bricToken: payload.AUTH_GUID, // Store this for refunds/voids
        amount: payload.AUTH_AMOUNT
          ? parseFloat(payload.AUTH_AMOUNT)
          : undefined,
      };
    } else {
      return {
        isApproved: false,
        error:
          payload.NETWORK_RESPONSE ||
          payload.AUTH_RESP ||
          "Transaction declined",
      };
    }
  }

  /**
   * Validate webhook signature (if implemented by EPX)
   */
  validateWebhookSignature(payload: any, signature?: string): boolean {
    if (!this.config.webhookSecret) {
      console.warn("[EPX] Webhook secret not configured, skipping validation");
      return true; // Allow for development
    }

    // TODO: Implement actual signature validation based on EPX documentation
    // This is a placeholder - actual implementation would depend on EPX specs
    return true;
  }

  /**
   * Refund transaction using BRIC token and Custom Pay API
   */
  async refundTransaction(
    bricToken: string,
    amount: number,
    transactionId?: number,
  ): Promise<{
    success: boolean;
    refundId?: string;
    error?: string;
  }> {
    try {
      console.log("[EPX] Processing refund via Custom Pay API");

      if (!this.config.epiId || !this.config.epiKey) {
        throw new Error("EPI credentials not configured for Custom Pay API");
      }

      const endpoint = `/refund/${bricToken}`;
      const payload = {
        amount: amount,
        transaction: transactionId || Date.now(), // Use provided transaction ID or timestamp
      };

      // Generate EPI-Signature
      const signature = this.generateEPISignature(endpoint, payload);

      const response = await fetch(`${this.customPayApiUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "EPI-Id": this.config.epiId,
          "EPI-Signature": signature,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.data && data.data.response === "00") {
        return {
          success: true,
          refundId: data.data.authorization,
        };
      } else {
        return {
          success: false,
          error: data.errors || data.data?.text || "Refund failed",
        };
      }
    } catch (error: any) {
      console.error("[EPX] Refund error:", error);
      return {
        success: false,
        error: error.message || "Refund processing failed",
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
      console.log("[EPX] Processing void via Custom Pay API");

      if (!this.config.epiId || !this.config.epiKey) {
        throw new Error("EPI credentials not configured for Custom Pay API");
      }

      const endpoint = `/void/${bricToken}`;
      const signature = this.generateEPISignature(endpoint, {});

      const response = await fetch(`${this.customPayApiUrl}${endpoint}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "EPI-Id": this.config.epiId,
          "EPI-Signature": signature,
          bric: bricToken,
        },
      });

      const data = await response.json();

      if (data.data && data.data.response === "00") {
        return {
          success: true,
        };
      } else {
        return {
          success: false,
          error: data.errors || data.data?.text || "Void failed",
        };
      }
    } catch (error: any) {
      console.error("[EPX] Void error:", error);
      return {
        success: false,
        error: error.message || "Void processing failed",
      };
    }
  }

  /**
   * Generate EPI-Signature for Custom Pay API
   */
  private generateEPISignature(endpoint: string, payload: any): string {
    if (!this.config.epiKey) {
      throw new Error("EPI Key not configured");
    }

    const message = endpoint + JSON.stringify(payload);
    const signature = crypto
      .createHmac("sha256", this.config.epiKey)
      .update(message)
      .digest("hex");

    return signature;
  }
}

// Export singleton instance
let epxService: EPXPaymentService | null = null;

export function initializeEPXService(config: EPXConfig): EPXPaymentService {
  epxService = new EPXPaymentService(config);
  console.log("We Made It 1");
  return epxService;
}

export function getEPXService(): EPXPaymentService {
  if (!epxService) {
    console.log("We Made It 2");
    throw new Error(
      "EPX Service not initialized. Call initializeEPXService first.",
    );
  }
  return epxService;
}