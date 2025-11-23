/**
 * EPX Server Post Payment Service
 * Handles direct server-to-EPX payment requests (Server Post API)
 */

export interface EPXServerPostConfig {
  mac: string;
  custNbr: string;
  merchNbr: string;
  dbaNbr: string;
  terminalNbr: string;
  environment: 'sandbox' | 'production';
  redirectUrl: string;
  responseUrl: string;
  tacEndpoint: string;
}

export class EPXServerPostService {
  private config: EPXServerPostConfig;

  constructor(config: EPXServerPostConfig) {
    this.config = config;
  }

  /**
   * Generate TAC for payment
   */
  async generateTAC(params: any): Promise<{ success: boolean; tac?: string; error?: string }> {
    // ...simulate TAC generation (real implementation would call EPX TAC endpoint)
    return { success: true, tac: 'SIMULATED_TAC' };
  }

  /**
   * Get payment form data for Browser Post
   */
  getPaymentFormData(tac: string, amount: number, tranNbr: string, customerEmail?: string, invoiceNumber?: string, orderDescription?: string, aciExt?: string): any {
    // Return all required fields for Server Post, including ACI_EXT for MIT
    return {
      TAC: tac,
      AMOUNT: amount,
      TRAN_NBR: tranNbr,
      CUSTOMER_EMAIL: customerEmail,
      INVOICE_NUMBER: invoiceNumber,
      ORDER_DESCRIPTION: orderDescription,
      ACI_EXT: aciExt || undefined // Only for MIT/recurring billing
    };
  }
}

export function getEPXService() {
  // Use Server Post config if enabled
  const config: EPXServerPostConfig = {
    mac: process.env.EPX_MAC || process.env.EPX_MAC_KEY || '',
    custNbr: process.env.EPX_CUST_NBR || '',
    merchNbr: process.env.EPX_MERCH_NBR || '',
    dbaNbr: process.env.EPX_DBA_NBR || '',
    terminalNbr: process.env.EPX_TERMINAL_NBR || '',
    environment: (process.env.EPX_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production',
    redirectUrl: `${process.env.BASE_URL || 'https://getmydpcenrollment-production.up.railway.app'}/api/epx/redirect`,
    responseUrl: `${process.env.BASE_URL || 'https://getmydpcenrollment-production.up.railway.app'}/api/epx/webhook`,
    tacEndpoint: 'https://keyexch.epxuap.com'
  };
  return new EPXServerPostService(config);
}

export type EPXService = EPXServerPostService;
