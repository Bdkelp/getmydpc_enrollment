import * as fs from 'fs';
import * as path from 'path';

export interface EPXLogEvent {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  phase: 'create-payment' | 'callback' | 'recaptcha' | 'status' | 'server-post' | 'general';
  message: string;
  data?: any;
}

const inMemoryBuffer: EPXLogEvent[] = [];
const MAX_BUFFER = 200; // keep recent events

function getLogDir(): string {
  const base = process.env.EPX_LOG_DIR || path.join(process.cwd(), 'logs', 'epx');
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }
  return base;
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
