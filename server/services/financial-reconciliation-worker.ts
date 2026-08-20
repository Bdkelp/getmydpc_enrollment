import { detectFinancialExceptions, listFinancialExceptions, retryFinancialException } from './financial-reconciliation-service';
import { neonPool } from '../lib/neonDb';

let running = false;
const INTERVAL_MS = 60 * 60 * 1000;
const BATCH_SIZE = 25;
const RECONCILIATION_LOCK_KEY = 2_031_032;

async function withReconciliationLease<T>(work: () => Promise<T>): Promise<T | null> {
  const client = await neonPool.connect();
  try {
    const lockResult = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [RECONCILIATION_LOCK_KEY]);
    if (!lockResult.rows[0]?.acquired) return null;
    try {
      return await work();
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [RECONCILIATION_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

export async function runFinancialReconciliationOnce(): Promise<{ detected: number; retried: number }> {
  if (running) return { detected: 0, retried: 0 };
  running = true;
  try {
    const result = await withReconciliationLease(async () => {
      const detection = await detectFinancialExceptions(200);
      const retryable = await listFinancialExceptions({ status: 'open', limit: BATCH_SIZE });
      let retried = 0;
      for (const exception of retryable) {
        if (!["PAYMENT_CONFIRMED_COMMISSION_FAILED", "PAYMENT_CONFIRMED_COMMISSION_MISSING", "COMMISSION_LEDGER_SYNC_FAILED", "COMMISSION_LEDGER_MISSING"].includes(exception.exception_type)) continue;
        await retryFinancialException(String(exception.id));
        retried++;
      }
      return { detected: detection.detected, retried };
    });
    return result || { detected: 0, retried: 0 };
  } finally {
    running = false;
  }
}

export { RECONCILIATION_LOCK_KEY, withReconciliationLease };

export function scheduleFinancialReconciliation(): void {
  if (process.env.FINANCIAL_RECONCILIATION_ENABLED !== 'true') {
    console.log('[FinancialReconciliation] Disabled (FINANCIAL_RECONCILIATION_ENABLED !== true)');
    return;
  }
  if (process.env.NODE_ENV === 'production' && process.env.FINANCIAL_RECONCILIATION_STAGING_APPROVED !== 'true') {
    console.warn('[FinancialReconciliation] FINANCIAL RECONCILIATION BLOCKED: staging approval flag is not set');
    return;
  }
  console.log('[FinancialReconciliation] Enabled with bounded hourly reconciliation');
  runFinancialReconciliationOnce().catch((error) => console.error('[FinancialReconciliation] Initial run failed:', error?.message || error));
  setInterval(() => {
    runFinancialReconciliationOnce().catch((error) => console.error('[FinancialReconciliation] Scheduled run failed:', error?.message || error));
  }, INTERVAL_MS);
}
