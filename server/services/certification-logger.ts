/**
 * Certification Logger Service
 * Captures raw HTTP request/response data for payment processor certification
 * Stores logs in structured .txt files for easy review and submission
 */

import * as fs from 'fs';
import * as path from 'path';

export interface RawRequestData {
  timestamp: string;
  method: string;
  endpoint: string;
  url: string;
  headers: Record<string, string>;
  body: any;
  ipAddress?: string;
  userAgent?: string;
}

export interface RawResponseData {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  processingTimeMs: number;
}

export interface CertificationLogEntry {
  transactionId: string;
  customerId: string;
  request: RawRequestData;
  response: RawResponseData;
  amount: number;
  environment: 'sandbox' | 'production';
  purpose: string; // e.g., 'payment-creation', 'callback-processing'
  sensitiveFieldsMasked: string[];
  timestamp: string;
}

export class CertificationLogger {
  private static instance: CertificationLogger;
  private logsDir: string;
  private rawLogsDir: string;
  private summaryLogsDir: string;

  private constructor() {
    // Create logs directory structure
    this.logsDir = path.join(process.cwd(), 'logs', 'certification');
    this.rawLogsDir = path.join(this.logsDir, 'raw-requests');
    this.summaryLogsDir = path.join(this.logsDir, 'summaries');

    // Ensure directories exist
    this.ensureDirectoriesExist();
  }

  static getInstance(): CertificationLogger {
    if (!CertificationLogger.instance) {
      CertificationLogger.instance = new CertificationLogger();
    }
    return CertificationLogger.instance;
  }

  private ensureDirectoriesExist(): void {
    const dirs = [this.logsDir, this.rawLogsDir, this.summaryLogsDir];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Log raw request/response pair for certification
   */
  logCertificationEntry(entry: CertificationLogEntry): void {
    try {
      // Create individual transaction log file
      const filename = `${entry.transactionId}_${entry.purpose}.txt`;
      const filepath = path.join(this.rawLogsDir, filename);

      const logContent = this.formatCertificationLog(entry);
      fs.writeFileSync(filepath, logContent, 'utf-8');

      console.log(`[Certification Logger] ✅ Logged transaction ${entry.transactionId} to ${filename}`);

      // Also log to console for immediate visibility
      console.log(`[Certification] ${entry.environment.toUpperCase()} - ${entry.purpose}: ${entry.transactionId}`);
    } catch (error: any) {
      console.error('[Certification Logger] ❌ Failed to write certification log:', error);
    }
  }

  /**
   * Format certification log entry as readable text
   */
  private formatCertificationLog(entry: CertificationLogEntry): string {
    const lines: string[] = [];

    lines.push('='.repeat(80));
    lines.push('EPX PAYMENT CERTIFICATION LOG');
    lines.push('='.repeat(80));
    lines.push('');

    // EPX Environment Variables (as requested by EPX)
    lines.push('EPX ENVIRONMENT VARIABLES:');
    lines.push(`  EPX_CUST_NBR: '${process.env.EPX_CUST_NBR || 'NOT_SET'}',`);
    lines.push(`  EPX_MERCH_NBR: '${process.env.EPX_MERCH_NBR || 'NOT_SET'}',`);
    lines.push(`  EPX_DBA_NBR: '${process.env.EPX_DBA_NBR || 'NOT_SET'}',`);
    lines.push(`  EPX_TERMINAL_NBR: '${process.env.EPX_TERMINAL_NBR || 'NOT_SET'}',`);
    lines.push(`  EPX_TERMINAL_PROFILE_ID: '${process.env.EPX_TERMINAL_PROFILE_ID || 'NOT_SET'}',`);
    lines.push(`  EPX_ENVIRONMENT: '${process.env.EPX_ENVIRONMENT || 'sandbox'}',`);
    lines.push('');

    // Transaction Details
    lines.push('TRANSACTION DETAILS:');
    lines.push(`  Transaction ID: ${entry.transactionId}`);
    lines.push(`  Customer ID: ${entry.customerId}`);
    lines.push(`  Amount: $${entry.amount.toFixed(2)}`);
    lines.push(`  Environment: ${entry.environment.toUpperCase()}`);
    lines.push(`  Purpose: ${entry.purpose}`);
    lines.push(`  Logged: ${entry.timestamp}`);
    lines.push('');

    // Masked Fields Notice
    if (entry.sensitiveFieldsMasked.length > 0) {
      lines.push('SENSITIVE DATA MASKED:');
      entry.sensitiveFieldsMasked.forEach(field => {
        lines.push(`  • ${field}`);
      });
      lines.push('');
    }

    // REQUEST SECTION
    lines.push('-'.repeat(80));
    lines.push('HTTP REQUEST:');
    lines.push('-'.repeat(80));
    lines.push('');

    lines.push(`Method: ${entry.request.method}`);
    lines.push(`URL: ${entry.request.url}`);
    lines.push('');

    lines.push('Headers:');
    Object.entries(entry.request.headers).forEach(([key, value]) => {
      // Mask sensitive headers
      const maskedValue = this.maskSensitiveHeader(key, value as string);
      lines.push(`  ${key}: ${maskedValue}`);
    });
    lines.push('');

    lines.push('Body:');
    if (entry.request.body) {
      const maskedBody = this.maskSensitiveData(entry.request.body);
      const bodyJson = JSON.stringify(maskedBody, null, 2);
      bodyJson.split('\n').forEach(line => lines.push(`  ${line}`));
      
      // Highlight reCaptcha token if present (EPX certification requirement)
      if (entry.request.body.captcha || entry.request.body.recaptchaToken) {
        lines.push('');
        lines.push('  ⚠️ reCaptcha Token Present: YES');
        lines.push(`  reCaptcha Value: ${entry.request.body.captcha || entry.request.body.recaptchaToken}`);
      }
      
      // Highlight ACI_EXT for MIT transactions (EPX requirement)
      if (entry.request.body.ACI_EXT || entry.request.body.aci_ext) {
        lines.push('');
        lines.push('  ⚠️ ACI_EXT (Merchant Initiated Transaction): YES');
        lines.push(`  ACI_EXT Value: ${entry.request.body.ACI_EXT || entry.request.body.aci_ext}`);
      }
    } else {
      lines.push('  (empty)');
    }
    lines.push('');

    // RESPONSE SECTION
    lines.push('-'.repeat(80));
    lines.push('HTTP RESPONSE:');
    lines.push('-'.repeat(80));
    lines.push('');

    lines.push(`Status Code: ${entry.response.statusCode}`);
    lines.push(`Processing Time: ${entry.response.processingTimeMs}ms`);
    lines.push('');

    lines.push('Headers:');
    Object.entries(entry.response.headers).forEach(([key, value]) => {
      const maskedValue = this.maskSensitiveHeader(key, value as string);
      lines.push(`  ${key}: ${maskedValue}`);
    });
    lines.push('');

    lines.push('Body:');
    if (entry.response.body) {
      const maskedBody = this.maskSensitiveData(entry.response.body);
      const bodyJson = JSON.stringify(maskedBody, null, 2);
      bodyJson.split('\n').forEach(line => lines.push(`  ${line}`));
    } else {
      lines.push('  (empty)');
    }
    lines.push('');

    lines.push('='.repeat(80));
    lines.push('END OF LOG');
    lines.push('='.repeat(80));

    return lines.join('\n');
  }

  /**
   * Mask sensitive data in request/response bodies
   */
  private maskSensitiveData(data: any, masked: string[] = []): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.maskSensitiveData(item, masked));
    }

    const sensitiveFields = [
      'card_number',
      'cardNumber',
      'cvv',
      'cvc',
      'pin',
      'password',
      'secret',
      'token',
      'apiKey',
      'api_key',
      'mac',
      'mac_key',
      'macKey',
      'EPX_MAC',
      'EPX_MAC_KEY'
    ];

    const result = { ...data };

    Object.keys(result).forEach(key => {
      if (sensitiveFields.some(sf => key.toLowerCase().includes(sf.toLowerCase()))) {
        if (typeof result[key] === 'string' && result[key].length > 4) {
          result[key] = `${result[key].substring(0, 4)}${'*'.repeat(Math.max(0, result[key].length - 8))}${result[key].slice(-4)}`;
          masked.push(key);
        } else {
          result[key] = '***MASKED***';
          masked.push(key);
        }
      } else if (typeof result[key] === 'object' && result[key] !== null) {
        result[key] = this.maskSensitiveData(result[key], masked);
      }
    });

    return result;
  }

  /**
   * Mask sensitive headers
   */
  private maskSensitiveHeader(headerName: string, value: string): string {
    const sensitiveHeaders = [
      'authorization',
      'x-api-key',
      'x-auth-token',
      'cookie',
      'set-cookie'
    ];

    if (sensitiveHeaders.some(h => headerName.toLowerCase().includes(h))) {
      if (value.length > 8) {
        return `${value.substring(0, 4)}${'*'.repeat(Math.max(0, value.length - 8))}${value.slice(-4)}`;
      } else {
        return '***MASKED***';
      }
    }

    return value;
  }

  /**
   * Generate certification report summarizing all logged transactions
   */
  generateCertificationReport(startDate?: Date, endDate?: Date): string {
    try {
      const files = fs.readdirSync(this.rawLogsDir).filter(f => f.endsWith('.txt'));

      if (files.length === 0) {
        return 'No certification logs found.';
      }

      const lines: string[] = [];
      lines.push('='.repeat(80));
      lines.push('EPX PAYMENT CERTIFICATION REPORT');
      lines.push('='.repeat(80));
      lines.push('');
      lines.push(`Report Generated: ${new Date().toISOString()}`);
      lines.push(`Total Transactions Logged: ${files.length}`);
      lines.push('');

      lines.push('FILES INCLUDED:');
      files.forEach(file => {
        const filepath = path.join(this.rawLogsDir, file);
        const stats = fs.statSync(filepath);
        lines.push(`  • ${file} (${stats.size} bytes, ${stats.mtime.toISOString()})`);
      });
      lines.push('');

      lines.push('INSTRUCTIONS:');
      lines.push('1. Each file contains a single transaction with raw request/response data');
      lines.push('2. Sensitive data has been masked (see "SENSITIVE DATA MASKED" section in each file)');
      lines.push('3. Submit all .txt files to the payment processor for review');
      lines.push('4. Files are located in: logs/certification/raw-requests/');
      lines.push('');

      lines.push('='.repeat(80));

      return lines.join('\n');
    } catch (error: any) {
      console.error('[Certification Logger] Report generation error:', error);
      return `Error generating report: ${error.message}`;
    }
  }

  /**
   * Export all certification logs to a single .txt file (for easy sharing)
   */
  exportAllLogs(filename?: string): string {
    try {
      const exportFilename = filename || `certification_export_${new Date().toISOString().split('T')[0]}.txt`;
      const exportPath = path.join(this.summaryLogsDir, exportFilename);

      const files = fs.readdirSync(this.rawLogsDir).filter(f => f.endsWith('.txt'));

      const lines: string[] = [];
      lines.push('='.repeat(80));
      lines.push('FULL CERTIFICATION LOG EXPORT');
      lines.push('='.repeat(80));
      lines.push(`Generated: ${new Date().toISOString()}`);
      lines.push(`Total Transactions: ${files.length}`);
      lines.push('='.repeat(80));
      lines.push('');

      // Concatenate all logs
      files.sort().forEach((file, index) => {
        const filepath = path.join(this.rawLogsDir, file);
        const content = fs.readFileSync(filepath, 'utf-8');
        lines.push(content);
        if (index < files.length - 1) {
          lines.push('\n\n');
        }
      });

      fs.writeFileSync(exportPath, lines.join('\n'), 'utf-8');

      console.log(`[Certification Logger] ✅ Exported ${files.length} transactions to ${filename}`);
      return exportPath;
    } catch (error: any) {
      console.error('[Certification Logger] Export error:', error);
      throw error;
    }
  }

  /**
   * Get the raw logs directory path (for file access)
   */
  getRawLogsDir(): string {
    return this.rawLogsDir;
  }

  /**
   * Get temporary certification directory for one-time exports
   */
  getTempCertificationDir(): string {
    const tempDir = path.join(process.cwd(), 'logs', 'certification', 'temp-export');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    return tempDir;
  }

  /**
   * Clean up temporary certification files
   */
  cleanupTempCertification(): { filesDeleted: number; success: boolean } {
    try {
      const tempDir = this.getTempCertificationDir();
      const files = fs.readdirSync(tempDir);
      
      files.forEach(file => {
        fs.unlinkSync(path.join(tempDir, file));
      });

      console.log(`[Certification Logger] 🧹 Cleaned up ${files.length} temporary certification files`);
      
      return {
        filesDeleted: files.length,
        success: true
      };
    } catch (error: any) {
      console.error('[Certification Logger] Cleanup error:', error);
      return {
        filesDeleted: 0,
        success: false
      };
    }
  }

  /**
   * Generate certification logs from database transactions (retroactive)
   * Used for creating logs from past transactions for certification purposes
   */
  generateLogsFromTransactions(transactions: any[], useTemp = true): string {
    try {
      const targetDir = useTemp ? this.getTempCertificationDir() : this.rawLogsDir;
      
      // Generate individual log files for each transaction
      transactions.forEach((txn, index) => {
        const filename = `${txn.transactionId}_retroactive-cert.txt`;
        const filepath = path.join(targetDir, filename);
        
        const logContent = this.formatRetroactiveLog(txn, index + 1, transactions.length);
        fs.writeFileSync(filepath, logContent, 'utf-8');
      });

      console.log(`[Certification Logger] ✅ Generated ${transactions.length} retroactive certification logs in ${useTemp ? 'TEMP' : 'permanent'} directory`);

      // Create consolidated export
      const exportFilename = `certification_october_successful_${new Date().toISOString().split('T')[0]}.txt`;
      const exportPath = path.join(targetDir, exportFilename);

      const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.txt') && f !== exportFilename);

      const lines: string[] = [];
      lines.push('='.repeat(80));
      lines.push('EPX CERTIFICATION LOG EXPORT - OCTOBER SUCCESSFUL TRANSACTIONS');
      lines.push('='.repeat(80));
      lines.push(`Generated: ${new Date().toISOString()}`);
      lines.push(`Total Successful Transactions: ${transactions.length}`);
      lines.push(`Period: October 2025`);
      lines.push(`Status Filter: Completed transactions only`);
      lines.push(`⚠️ TEMPORARY EXPORT - Delete after EPX certification`);
      lines.push('='.repeat(80));
      lines.push('');

      // Concatenate all logs
      files.sort().forEach((file, index) => {
        const filepath = path.join(targetDir, file);
        const content = fs.readFileSync(filepath, 'utf-8');
        lines.push(content);
        if (index < files.length - 1) {
          lines.push('\n\n');
        }
      });

      fs.writeFileSync(exportPath, lines.join('\n'), 'utf-8');

      return exportPath;
    } catch (error: any) {
      console.error('[Certification Logger] Retroactive generation error:', error);
      throw error;
    }
  }

  /**
   * Format a retroactive certification log from database transaction
   */
  private formatRetroactiveLog(txn: any, index: number, total: number): string {
    const lines: string[] = [];
    
    lines.push('='.repeat(80));
    lines.push(`RETROACTIVE CERTIFICATION LOG - Transaction ${index} of ${total}`);
    lines.push('='.repeat(80));
    lines.push('');
    
    // EPX Environment Variables
    lines.push('EPX ENVIRONMENT VARIABLES:');
    lines.push(`  EPX_CUST_NBR: '${process.env.EPX_CUST_NBR || 'NOT_SET'}',`);
    lines.push(`  EPX_MERCH_NBR: '${process.env.EPX_MERCH_NBR || 'NOT_SET'}',`);
    lines.push(`  EPX_DBA_NBR: '${process.env.EPX_DBA_NBR || 'NOT_SET'}',`);
    lines.push(`  EPX_TERMINAL_NBR: '${process.env.EPX_TERMINAL_NBR || 'NOT_SET'}',`);
    lines.push(`  EPX_TERMINAL_PROFILE_ID: '${process.env.EPX_TERMINAL_PROFILE_ID || 'NOT_SET'}',`);
    lines.push(`  EPX_ENVIRONMENT: '${process.env.EPX_ENVIRONMENT || 'sandbox'}',`);
    lines.push('');
    
    lines.push(`Transaction ID: ${txn.transactionId || 'N/A'}`);
    lines.push(`Payment ID: ${txn.paymentId || 'N/A'}`);
    lines.push(`Amount: $${parseFloat(txn.amount || 0).toFixed(2)}`);
    lines.push(`Status: ${txn.status || 'N/A'}`);
    lines.push(`Created: ${txn.createdAt || 'N/A'}`);
    lines.push(`Environment: ${txn.environment || 'sandbox'}`);
    lines.push(`Purpose: Retroactive certification export (October successful transactions)`);
    lines.push('');

    lines.push('NOTE: This is a retroactive certification log generated from database records.');
    lines.push('Real-time logging was not enabled during the original transaction.');
    lines.push('Sensitive data masked for security compliance.');
    lines.push('');

    // REQUEST SECTION (reconstructed from metadata)
    lines.push('-'.repeat(80));
    lines.push('HTTP REQUEST (Reconstructed):');
    lines.push('-'.repeat(80));
    lines.push('');
    
    lines.push('Method: POST');
    lines.push('Endpoint: /api/epx/hosted/callback');
    lines.push('');
    
    lines.push('Request Data:');
    if (txn.metadata?.callbackData) {
      const maskedData = this.maskSensitiveData(txn.metadata.callbackData);
      const dataJson = JSON.stringify(maskedData, null, 2);
      dataJson.split('\n').forEach(line => lines.push(`  ${line}`));
    } else {
      lines.push('  (Callback data not stored in database)');
    }
    lines.push('');

    // RESPONSE SECTION
    lines.push('-'.repeat(80));
    lines.push('HTTP RESPONSE:');
    lines.push('-'.repeat(80));
    lines.push('');

    lines.push(`Status: ${txn.status === 'completed' ? '200 OK' : '400 Error'}`);
    lines.push(`Authorization Code: ${txn.authorizationCode || 'N/A'}`);
    lines.push(`BRIC Token: ${txn.bricToken ? this.maskSensitiveData(txn.bricToken) : 'N/A'}`);
    lines.push('');

    lines.push('Transaction Details:');
    lines.push(`  Plan: ${txn.planName || 'N/A'}`);
    lines.push(`  Member Email: ${txn.memberEmail || 'N/A'}`);
    lines.push(`  Payment Method: ${txn.paymentMethod || 'N/A'}`);
    lines.push('');

    lines.push('='.repeat(80));
    lines.push('END OF RETROACTIVE LOG');
    lines.push('='.repeat(80));

    return lines.join('\n');
  }

  /**
   * Get summary of logs
   */
  getLogsSummary(): {
    totalLogs: number;
    logFiles: string[];
    rawLogsDir: string;
  } {
    const files = fs.readdirSync(this.rawLogsDir).filter(f => f.endsWith('.txt'));
    return {
      totalLogs: files.length,
      logFiles: files,
      rawLogsDir: this.rawLogsDir
    };
  }

  /**
   * Export logs filtered by date range
   */
  exportLogsByDateRange(startDate?: string, endDate?: string): string {
    try {
      const files = fs.readdirSync(this.rawLogsDir).filter(f => f.endsWith('.txt'));
      
      // Filter files by date if provided
      const filteredFiles = files.filter(file => {
        const filepath = path.join(this.rawLogsDir, file);
        const stats = fs.statSync(filepath);
        const fileDate = stats.mtime;

        if (startDate && fileDate < new Date(startDate)) return false;
        if (endDate && fileDate > new Date(endDate)) return false;
        
        return true;
      });

      if (filteredFiles.length === 0) {
        throw new Error('No logs found for the specified date range');
      }

      const exportFilename = `certification_export_${startDate || 'all'}_to_${endDate || 'now'}.txt`;
      const exportPath = path.join(this.summaryLogsDir, exportFilename);

      const lines: string[] = [];
      lines.push('='.repeat(80));
      lines.push('CERTIFICATION LOG EXPORT - DATE FILTERED');
      lines.push('='.repeat(80));
      lines.push(`Generated: ${new Date().toISOString()}`);
      lines.push(`Date Range: ${startDate || 'Beginning'} to ${endDate || 'Now'}`);
      lines.push(`Total Transactions: ${filteredFiles.length}`);
      lines.push('='.repeat(80));
      lines.push('');

      // Concatenate filtered logs
      filteredFiles.sort().forEach((file, index) => {
        const filepath = path.join(this.rawLogsDir, file);
        const content = fs.readFileSync(filepath, 'utf-8');
        lines.push(content);
        if (index < filteredFiles.length - 1) {
          lines.push('\n\n');
        }
      });

      fs.writeFileSync(exportPath, lines.join('\n'), 'utf-8');

      console.log(`[Certification Logger] ✅ Exported ${filteredFiles.length} transactions (date filtered) to ${exportFilename}`);
      return exportPath;
    } catch (error: any) {
      console.error('[Certification Logger] Date range export error:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const certificationLogger = CertificationLogger.getInstance();
