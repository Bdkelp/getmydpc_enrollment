
export interface TransactionLogEntry {
  transactionId: string;
  paymentId?: string;
  action: 'create' | 'approve' | 'decline' | 'refund' | 'void' | 'webhook';
  status: 'pending' | 'completed' | 'failed' | 'refunded' | 'voided';
  amount?: number;
  environment: 'sandbox' | 'production';
  customerId: string;
  paymentMethod?: string;
  metadata?: Record<string, any>;
  timestamp: string;
  processingTime?: number;
  error?: string;
  ipAddress?: string;
  userAgent?: string;
}

export class TransactionLogger {
  private static instance: TransactionLogger;
  
  private constructor() {}

  static getInstance(): TransactionLogger {
    if (!TransactionLogger.instance) {
      TransactionLogger.instance = new TransactionLogger();
    }
    return TransactionLogger.instance;
  }

  /**
   * Log transaction events with structured data
   */
  log(entry: TransactionLogEntry): void {
    const logData = {
      ...entry,
      level: this.getLogLevel(entry.action, entry.status),
      source: 'EPX_PAYMENT_SYSTEM'
    };

    // Console logging with environment-specific formatting
    if (entry.environment === 'production') {
      // In production, use structured JSON logging
      console.log(JSON.stringify({
        message: `[EPX Transaction] ${entry.action.toUpperCase()} - ${entry.status.toUpperCase()}`,
        ...logData
      }));
    } else {
      // In sandbox, use readable format
      console.log(`[EPX Transaction Log] ${entry.action.toUpperCase()} - ${entry.status.toUpperCase()}:`, logData);
    }

    // TODO: In production, consider sending to external logging service
    // await this.sendToExternalLogger(logData);
  }

  /**
   * Log payment creation
   */
  logPaymentCreated(data: {
    transactionId: string;
    paymentId: string;
    amount: number;
    customerId: string;
    paymentMethod: string;
    environment: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
  }): void {
    this.log({
      ...data,
      action: 'create',
      status: 'pending',
      timestamp: new Date().toISOString(),
      environment: data.environment as 'sandbox' | 'production'
    });
  }

  /**
   * Log payment result from webhook
   */
  logPaymentResult(data: {
    transactionId: string;
    paymentId: string;
    status: 'completed' | 'failed';
    amount?: number;
    customerId: string;
    authCode?: string;
    bricToken?: string;
    environment: string;
    processingTime?: number;
    error?: string;
    metadata?: Record<string, any>;
  }): void {
    this.log({
      ...data,
      action: data.status === 'completed' ? 'approve' : 'decline',
      timestamp: new Date().toISOString(),
      environment: data.environment as 'sandbox' | 'production'
    });
  }

  /**
   * Log refund transaction
   */
  logRefund(data: {
    transactionId: string;
    refundId?: string;
    amount: number;
    customerId: string;
    environment: string;
    success: boolean;
    error?: string;
    metadata?: Record<string, any>;
  }): void {
    this.log({
      ...data,
      action: 'refund',
      status: data.success ? 'completed' : 'failed',
      timestamp: new Date().toISOString(),
      environment: data.environment as 'sandbox' | 'production'
    });
  }

  /**
   * Log void transaction
   */
  logVoid(data: {
    transactionId: string;
    amount: number;
    customerId: string;
    environment: string;
    success: boolean;
    error?: string;
    metadata?: Record<string, any>;
  }): void {
    this.log({
      ...data,
      action: 'void',
      status: data.success ? 'completed' : 'failed',
      timestamp: new Date().toISOString(),
      environment: data.environment as 'sandbox' | 'production'
    });
  }

  /**
   * Get log level based on action and status
   */
  private getLogLevel(action: string, status: string): 'info' | 'warn' | 'error' {
    if (status === 'failed' || status === 'declined') {
      return 'error';
    }
    if (action === 'refund' || action === 'void') {
      return 'warn';
    }
    return 'info';
  }

  /**
   * Generate daily transaction summary for monitoring
   */
  generateDailySummary(): void {
    const today = new Date().toISOString().split('T')[0];
    console.log(`[EPX Transaction Log] Daily Summary for ${today}:`, {
      environment: process.env.EPX_ENVIRONMENT || 'sandbox',
      date: today,
      note: 'Transaction details stored in database - use admin dashboard for full analytics'
    });
  }

  /**
   * Export transaction logs for audit (placeholder)
   */
  async exportAuditLogs(startDate: string, endDate: string): Promise<void> {
    console.log(`[EPX Transaction Log] Audit export requested:`, {
      startDate,
      endDate,
      environment: process.env.EPX_ENVIRONMENT || 'sandbox',
      note: 'Implement database query to export transaction logs for compliance'
    });
    
    // TODO: Implement actual export functionality
    // This would query the database for all transactions in the date range
    // and export them in a compliance-friendly format
  }
}

// Export singleton instance
export const transactionLogger = TransactionLogger.getInstance();
