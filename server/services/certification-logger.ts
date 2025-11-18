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
