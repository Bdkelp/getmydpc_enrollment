/**
 * EPX Service Selector
 * Dynamically selects between Browser Post and Hosted Checkout
 * based on environment configuration
 */

import { EPXHostedCheckoutService } from './epx-hosted-checkout-service';
// Import Browser Post service when reactivating
// import { EPXPaymentService } from './epx-payment-service';

export function getEPXService() {
  const paymentMethod = process.env.EPX_PAYMENT_METHOD || 'hosted-checkout';
  
  console.log(`[EPX Service Selector] Payment method: ${paymentMethod}`);
  
  if (paymentMethod === 'hosted-checkout') {
    // Use Hosted Checkout
    const config = {
      publicKey: process.env.EPX_PUBLIC_KEY || '',
      terminalProfileId: process.env.EPX_TERMINAL_PROFILE_ID || '',
      environment: (process.env.EPX_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production',
      successCallback: 'epxSuccessCallback',
      failureCallback: 'epxFailureCallback'
    };
    
    return new EPXHostedCheckoutService(config);
  } else {
    // Use Browser Post (when reactivated)
    throw new Error('Browser Post implementation is currently commented out. Set EPX_PAYMENT_METHOD=hosted-checkout');
    
    /* To reactivate Browser Post:
    const config = {
      mac: process.env.EPX_MAC || '',
      custNbr: process.env.EPX_CUST_NBR || '',
      merchNbr: process.env.EPX_MERCH_NBR || '',
      dbaNbr: process.env.EPX_DBA_NBR || '',
      terminalNbr: process.env.EPX_TERMINAL_NBR || '',
      environment: process.env.EPX_ENVIRONMENT || 'sandbox',
      redirectUrl: `${process.env.FRONTEND_URL}/payment/callback`,
      responseUrl: `${process.env.BACKEND_URL}/api/epx/webhook`,
      tacEndpoint: process.env.EPX_TAC_ENDPOINT
    };
    return new EPXPaymentService(config);
    */
  }
}

export type EPXService = EPXHostedCheckoutService; // | EPXPaymentService when reactivated