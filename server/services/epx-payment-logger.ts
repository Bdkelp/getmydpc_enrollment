import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface EPXLogEvent {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  phase:
    | 'create-payment'
    | 'callback'
    | 'recaptcha'
    | 'status'
    | 'server-post'
    | 'general'
    | 'certification'
    | 'recurring'
    | 'scheduler';
  message: string;
  data?: any;
}

const inMemoryBuffer: EPXLogEvent[] = [];
const MAX_BUFFER = 200; // keep recent events

function ensureDir(dir: string): boolean {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return true;
  } catch (error: any) {
    console.warn(`[EPX Logger] Unable to use log directory ${dir}: ${error.message}`);
    return false;
  }
}

function getLogDir(): string {
  const configuredDir = process.env.EPX_LOG_DIR;
  const fallbackDir = path.join(process.cwd(), 'logs', 'epx');
  const tmpDir = path.join(os.tmpdir(), 'epx-logs');

  const candidates = configuredDir ? [configuredDir, fallbackDir, tmpDir] : [fallbackDir, tmpDir];

  for (const candidate of candidates) {
    if (ensureDir(candidate)) {
      if (candidate !== configuredDir && configuredDir) {
        console.warn(`[EPX Logger] Falling back to ${candidate} because ${configuredDir} is not writable.`);
      }
      return candidate;
    }
  }

  // Last resort: use current working directory without ensuring (should rarely happen)
  console.error('[EPX Logger] All log directory candidates failed; using process.cwd().');
  return process.cwd();
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function logFileForDate(date: string): string {
  const dir = getLogDir();
  return path.join(dir, `epx-${date}.jsonl`);
}

function currentLogFile(): string {
  return logFileForDate(formatDate(new Date()));
}

function sanitizeDateInput(input?: string): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function buildDateCandidates(preferredDate?: string): string[] {
  const sanitized = sanitizeDateInput(preferredDate);
  if (sanitized) {
    return [sanitized];
  }

  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  return [formatDate(today), formatDate(yesterday)];
}

function matchesTransaction(event: EPXLogEvent, transactionId: string): boolean {
  if (!transactionId) {
    return false;
  }

  const normalizedNeedle = String(transactionId).toLowerCase();
  const data = event.data || {};
  const candidates = [
    data.transactionId,
    data.transaction_id,
    data.transactionReference,
    data.orderNumber,
    data.epxTransactionId,
    data.epx_transaction_id,
    data?.request?.transactionId,
    data?.request?.fields?.TRAN_NBR,
    data?.response?.transactionId
  ]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).toLowerCase());

  return candidates.some((value: string) => Boolean(value) && value === normalizedNeedle);
}

export function logEPX(event: Omit<EPXLogEvent, 'timestamp'>) {
  const full: EPXLogEvent = { ...event, timestamp: new Date().toISOString() };
  // In-memory buffer
  inMemoryBuffer.push(full);
  if (inMemoryBuffer.length > MAX_BUFFER) inMemoryBuffer.shift();
  // File append
  try {
    fs.appendFileSync(currentLogFile(), JSON.stringify(full) + '\n', { encoding: 'utf8' });
  } catch (err) {
    console.error('[EPX Logger] Failed to write log file:', err);
  }
  // Console (structured)
  const consoleMsg = `[EPX] ${full.timestamp} ${full.phase.toUpperCase()} ${full.level.toUpperCase()} - ${full.message}`;
  if (full.level === 'error') console.error(consoleMsg, full.data || '');
  else if (full.level === 'warn') console.warn(consoleMsg, full.data || '');
  else console.log(consoleMsg, full.data || '');
}

export function getRecentEPXLogs(limit: number = 50): EPXLogEvent[] {
  return inMemoryBuffer.slice(-limit).reverse();
}

type TransactionLogOptions = {
  date?: string;
  limit?: number;
  phases?: EPXLogEvent['phase'][];
  includeBuffer?: boolean;
};

export function getTransactionLogs(
  transactionId: string,
  options?: TransactionLogOptions
): EPXLogEvent[] {
  if (!transactionId || typeof transactionId !== 'string') {
    return [];
  }

  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 500);
  const phaseFilter = Array.isArray(options?.phases) && options?.phases.length
    ? new Set(options?.phases as EPXLogEvent['phase'][])
    : null;
  const includeBuffer = options?.includeBuffer !== false;
  const dedupeKeys = new Set<string>();
  const results: EPXLogEvent[] = [];

  const pushEvent = (event: EPXLogEvent) => {
    const key = `${event.timestamp}|${event.phase}|${event.message}`;
    if (dedupeKeys.has(key)) {
      return;
    }
    dedupeKeys.add(key);
    results.push(event);
  };

  if (includeBuffer) {
    for (let i = inMemoryBuffer.length - 1; i >= 0 && results.length < limit; i -= 1) {
      const entry = inMemoryBuffer[i];
      if (phaseFilter && !phaseFilter.has(entry.phase)) {
        continue;
      }
      if (matchesTransaction(entry, transactionId)) {
        pushEvent(entry);
      }
    }
  }

  const dateCandidates = buildDateCandidates(options?.date);
  for (const dateStr of dateCandidates) {
    if (results.length >= limit) {
      break;
    }

    const filePath = logFileForDate(dateStr);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    try {
      const fileContents = fs.readFileSync(filePath, 'utf8');
      const lines = fileContents.split(/\r?\n/);
      for (let i = lines.length - 1; i >= 0 && results.length < limit; i -= 1) {
        const line = lines[i]?.trim();
        if (!line) {
          continue;
        }

        let parsed: EPXLogEvent | null = null;
        try {
          parsed = JSON.parse(line) as EPXLogEvent;
        } catch {
          parsed = null;
        }

        if (!parsed) {
          continue;
        }

        if (phaseFilter && !phaseFilter.has(parsed.phase)) {
          continue;
        }

        if (matchesTransaction(parsed, transactionId)) {
          pushEvent(parsed);
        }
      }
    } catch (error) {
      console.warn('[EPX Logger] Failed to read log file for transaction lookup', {
        filePath,
        error
      });
    }
  }

  return results.slice(0, limit);
}
