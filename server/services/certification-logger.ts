import fs from 'fs';
import path from 'path';

export interface CertificationRequestInfo {
  timestamp: string;
  method: string;
  endpoint: string;
  url?: string;
  headers?: Record<string, any>;
  body?: any;
  ipAddress?: string;
  userAgent?: string;
}

export interface CertificationResponseInfo {
  statusCode: number;
  headers?: Record<string, any>;
  body?: any;
  processingTimeMs?: number;
}

export interface CertificationLogEntry {
  transactionId?: string;
  customerId?: string;
  purpose?: string;
  amount?: number;
  environment?: string;
  request?: CertificationRequestInfo;
  response?: CertificationResponseInfo;
  sensitiveFieldsMasked?: string[];
  metadata?: Record<string, any>;
  timestamp?: string;
  fileName?: string;
}

interface CertificationSummary {
  totalLogs: number;
  rawLogsDir: string;
  logFiles: string[];
}

class CertificationLogger {
  private baseDir: string;
  private rawDir: string;
  private summaryDir: string;

  constructor() {
    this.baseDir = process.env.CERTIFICATION_LOG_DIR || path.join(process.cwd(), 'logs', 'certification');
    this.rawDir = path.join(this.baseDir, 'raw-requests');
    this.summaryDir = path.join(this.baseDir, 'summaries');
    this.ensureDir(this.rawDir);
    this.ensureDir(this.summaryDir);
  }

  private readEntries(limit?: number): CertificationLogEntry[] {
    try {
      const files = fs
        .readdirSync(this.rawDir)
        .filter((file) => file.endsWith('.json'))
        .sort();

      const startIndex = typeof limit === 'number' ? Math.max(files.length - limit, 0) : 0;
      const selected = files.slice(startIndex);

      return selected.map((file) => {
        try {
          const filePath = path.join(this.rawDir, file);
          const contents = fs.readFileSync(filePath, 'utf8');
          const parsed = JSON.parse(contents);
          return {
            ...parsed,
            fileName: file
          } as CertificationLogEntry;
        } catch (fileError) {
          console.warn('[CertificationLogger] Failed to parse log file', { file, fileError });
          return { fileName: file } as CertificationLogEntry;
        }
      });
    } catch (error) {
      console.error('[CertificationLogger] Failed to read entries', { error });
      return [];
    }
  }

  getRecentEntries(limit = 10): CertificationLogEntry[] {
    return this.readEntries(limit).reverse();
  }

  getAllEntries(): CertificationLogEntry[] {
    return this.readEntries();
  }

  private ensureDir(dir: string) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private sanitizeFilename(input: string) {
    return input.replace(/[^a-z0-9_-]/gi, '_');
  }

  logCertificationEntry(entry: CertificationLogEntry) {
    const finalized: CertificationLogEntry = {
      ...entry,
      timestamp: entry.timestamp || new Date().toISOString(),
    };

    const txId = finalized.transactionId || 'unknown-transaction';
    const fileName = `${finalized.timestamp?.replace(/[:.]/g, '-')}_${this.sanitizeFilename(txId)}.json`;
    const filePath = path.join(this.rawDir, fileName);

    try {
      fs.writeFileSync(filePath, JSON.stringify(finalized, null, 2), { encoding: 'utf8' });
    } catch (error) {
      console.error('[CertificationLogger] Failed to write log file', { filePath, error });
    }
  }

  exportAllLogs(filename: string): string {
    const targetFile = path.join(this.summaryDir, filename);
    const entries = this.getAllEntries();

    try {
      fs.writeFileSync(targetFile, JSON.stringify(entries, null, 2), { encoding: 'utf8' });
    } catch (error) {
      console.error('[CertificationLogger] Failed to export logs', { error, targetFile });
      throw error;
    }

    return targetFile;
  }

  getLogsSummary(): CertificationSummary {
    try {
      const files = fs.readdirSync(this.rawDir).filter((file) => file.endsWith('.json'));
      return {
        totalLogs: files.length,
        rawLogsDir: this.rawDir,
        logFiles: files,
      };
    } catch (error) {
      console.error('[CertificationLogger] Failed to read logs summary', { error });
      return {
        totalLogs: 0,
        rawLogsDir: this.rawDir,
        logFiles: [],
      };
    }
  }

  generateCertificationReport(): string {
    const summary = this.getLogsSummary();
    const lines: string[] = [
      'EPX Certification Report',
      '========================',
      `Generated: ${new Date().toISOString()}`,
      `Total logged transactions: ${summary.totalLogs}`,
      `Logs directory: ${summary.rawLogsDir}`,
      '',
    ];

    summary.logFiles.slice(-10).forEach((file) => {
      lines.push(` - ${file}`);
    });

    if (summary.logFiles.length > 10) {
      lines.push(' (additional log files omitted for brevity)');
    }

    return lines.join('\n');
  }
}

export const certificationLogger = new CertificationLogger();
export type { CertificationSummary };
