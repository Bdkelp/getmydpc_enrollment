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

function currentLogFile(): string {
  const dir = getLogDir();
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(dir, `epx-${date}.jsonl`);
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
