/**
 * EPX Service Selector
 * Returns EPX Hosted Checkout service for payment processing
 */

import { EPXHostedCheckoutService } from './epx-hosted-checkout-service';

export function getEPXService() {
  const config = {
    publicKey: process.env.EPX_PUBLIC_KEY || '',
    terminalProfileId: process.env.EPX_TERMINAL_PROFILE_ID || '',
    environment: 'production' as const,
    successCallback: 'epxSuccessCallback',
    failureCallback: 'epxFailureCallback'
  };
  
  console.log('[EPX Service Selector] Using EPX Hosted Checkout');
  return new EPXHostedCheckoutService(config);
}

export type EPXService = EPXHostedCheckoutService;