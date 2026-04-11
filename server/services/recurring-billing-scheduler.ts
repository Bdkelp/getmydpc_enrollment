/**
 * Recurring Billing Scheduler
 *
 * Processes due subscriptions on a configurable interval.
 * Supports CreditCard recurring and ACH recurring (hard-gated by env flags).
 *
 * Environment flags:
 *   BILLING_SCHEDULER_ENABLED  – must be 'true' to start the scheduler
 *   BILLING_SCHEDULER_DRY_RUN  – 'true' (default) logs what would happen without charging
 *   BILLING_SCHEDULER_INTERVAL_MS – cycle interval in ms (default: 3600000 = 1 hour)
 *   ACH_RECURRING_ENABLED – must be 'true' to process ACH subscriptions
 *   ACH_RECURRING_ALLOW_PRODUCTION – must be 'true' to allow ACH recurring when payment environment is production
 *   ACH_RECURRING_TEST_MODE – defaults to true; tags ACH logs for internal/certification runs
 */

import { supabase } from '../lib/supabaseClient';
import {
  decryptSensitiveData,
  decryptPaymentToken,
  getSubscriptionsDueForBilling,
  insertRecurringBillingLog,
  updateRecurringBillingLog,
  hasExistingBillingLogEntry,
  getStalePendingBillingLogs,
  getPaymentByTransactionId,
  type BillableSubscription,
} from '../storage';
import { submitServerPostRecurringPayment } from './epx-payment-service';
import { persistRecurringPostSuccess } from './recurring-post-success-persistence';
import { paymentEnvironment } from './payment-environment-service';

const LOG_PREFIX = '[Recurring Billing]';
const ADVISORY_LOCK_KEY = 123456789; // Arbitrary fixed int64 for pg_try_advisory_lock
const STALE_PENDING_THRESHOLD_MINUTES = 30;

type SchedulerMode = 'DRY RUN' | 'LIVE';
type SchedulerCycleSource = 'automatic' | 'manual';

interface CycleMetrics {
  processed: number;
  skipped: number;
  errors: number;
}

interface DueDecisionLogEntry {
  at: string;
  source: SchedulerCycleSource;
  subscriptionId: number;
  memberId: number;
  groupId: string | null;
  payerType: 'member' | 'group';
  payerId: string;
  payerDisplayName?: string | null;
  amount?: string;
  nextBillingDate?: string;
  paymentMethodType: string;
  groupContactSource: 'responsible_person' | 'contact_person' | null;
  contactResolutionSucceeded: boolean;
  selected: boolean;
  skipped: boolean;
  skipReason: string | null;
}

interface ChargeAttemptLogEntry {
  at: string;
  source: SchedulerCycleSource;
  subscriptionId: number;
  memberId: number;
  groupId: string | null;
  payerType: 'member' | 'group';
  payerId: string;
  payerDisplayName?: string | null;
  amount?: string;
  nextBillingDate?: string;
  paymentMethodType: string;
  groupContactSource: 'responsible_person' | 'contact_person' | null;
  contactResolutionSucceeded: boolean;
  selected: boolean;
  skipped: boolean;
  skipReason: string | null;
  chargeAttemptResult: string;
  billingEventId: number | null;
}

export interface RecurringSchedulerRunResult {
  source: SchedulerCycleSource;
  mode: SchedulerMode;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  lockAcquired: boolean;
  metrics: CycleMetrics;
  requestedBy?: string;
}

export interface RecurringSchedulerStatus {
  enabled: boolean;
  defaultDryRun: boolean;
  intervalMs: number;
  achRecurringEnabled: boolean;
  achRecurringTestMode: boolean;
  simulationModeEnabled: boolean;
  initializedAt: string | null;
  lastCycle: {
    source: SchedulerCycleSource | null;
    mode: SchedulerMode | null;
    requestedBy: string | null;
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number | null;
    lockAcquired: boolean | null;
    lockSkippedAt: string | null;
    metrics: CycleMetrics | null;
    error: string | null;
  };
  manualRunsTriggered: number;
  launchDiagnostics: {
    recentDueDecisions: DueDecisionLogEntry[];
    recentChargeAttempts: ChargeAttemptLogEntry[];
  };
}

const schedulerStatusState: RecurringSchedulerStatus = {
  enabled: false,
  defaultDryRun: isDryRun(),
  intervalMs: getIntervalMs(),
  achRecurringEnabled: isAchRecurringEnabled(),
  achRecurringTestMode: isAchRecurringTestMode(),
  simulationModeEnabled: isSimulationModeEnabled(),
  initializedAt: null,
  lastCycle: {
    source: null,
    mode: null,
    requestedBy: null,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    lockAcquired: null,
    lockSkippedAt: null,
    metrics: null,
    error: null,
  },
  manualRunsTriggered: 0,
  launchDiagnostics: {
    recentDueDecisions: [],
    recentChargeAttempts: [],
  },
};

const MAX_DUE_DECISION_LOG_ENTRIES = 200;
const MAX_CHARGE_ATTEMPT_LOG_ENTRIES = 200;

function appendDueDecision(entry: DueDecisionLogEntry): void {
  schedulerStatusState.launchDiagnostics.recentDueDecisions = [
    entry,
    ...schedulerStatusState.launchDiagnostics.recentDueDecisions,
  ].slice(0, MAX_DUE_DECISION_LOG_ENTRIES);

  // Intentionally safe fields only (ids + payer/method routing), no PAN/token data.
  console.log(`${LOG_PREFIX} [LaunchDiag] ${JSON.stringify(entry)}`);
}

function appendChargeAttempt(entry: ChargeAttemptLogEntry): void {
  schedulerStatusState.launchDiagnostics.recentChargeAttempts = [
    entry,
    ...schedulerStatusState.launchDiagnostics.recentChargeAttempts,
  ].slice(0, MAX_CHARGE_ATTEMPT_LOG_ENTRIES);

  // Intentionally safe fields only (ids + payer/method routing), no PAN/token data.
  console.log(`${LOG_PREFIX} [LaunchDiagCharge] ${JSON.stringify(entry)}`);
}

function refreshSchedulerConfigState(enabledOverride?: boolean): void {
  schedulerStatusState.enabled = typeof enabledOverride === 'boolean'
    ? enabledOverride
    : process.env.BILLING_SCHEDULER_ENABLED === 'true';
  schedulerStatusState.defaultDryRun = isDryRun();
  schedulerStatusState.intervalMs = getIntervalMs();
  schedulerStatusState.achRecurringEnabled = isAchRecurringEnabled();
  schedulerStatusState.achRecurringTestMode = isAchRecurringTestMode();
  schedulerStatusState.simulationModeEnabled = isSimulationModeEnabled();
}

export function getRecurringBillingSchedulerStatus(): RecurringSchedulerStatus {
  refreshSchedulerConfigState();
  return {
    ...schedulerStatusState,
    lastCycle: {
      ...schedulerStatusState.lastCycle,
      metrics: schedulerStatusState.lastCycle.metrics
        ? { ...schedulerStatusState.lastCycle.metrics }
        : null,
    },
    launchDiagnostics: {
      recentDueDecisions: [...schedulerStatusState.launchDiagnostics.recentDueDecisions],
      recentChargeAttempts: [...schedulerStatusState.launchDiagnostics.recentChargeAttempts],
    },
  };
}

// ────────────────────────────────────────
// Configuration helpers
// ────────────────────────────────────────

function isDryRun(): boolean {
  return process.env.BILLING_SCHEDULER_DRY_RUN !== 'false';
}

function getIntervalMs(): number {
  const raw = process.env.BILLING_SCHEDULER_INTERVAL_MS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 60_000 ? parsed : 3_600_000;
}

function isSimulationModeEnabled(): boolean {
  const explicitEnable = process.env.EPX_SIMULATION_MODE === 'true';
  if (!explicitEnable) return false;

  // Hard guard: simulation mode is never allowed in production runtime.
  if (process.env.NODE_ENV === 'production') {
    console.error(`${LOG_PREFIX} EPX_SIMULATION_MODE requested but blocked in NODE_ENV=production`);
    return false;
  }

  return true;
}

function isAchRecurringEnabled(): boolean {
  return process.env.ACH_RECURRING_ENABLED === 'true';
}

function isAchRecurringProductionOverrideEnabled(): boolean {
  return process.env.ACH_RECURRING_ALLOW_PRODUCTION === 'true';
}

function isAchRecurringTestMode(): boolean {
  return process.env.ACH_RECURRING_TEST_MODE !== 'false';
}

export function normalizePaymentMethodType(paymentMethodType: string | null | undefined): 'CreditCard' | 'ACH' | 'UNKNOWN' {
  const normalized = String(paymentMethodType || '').trim().toUpperCase();
  if (normalized === 'CREDITCARD') return 'CreditCard';
  if (normalized === 'ACH' || normalized === 'BANKACCOUNT') return 'ACH';
  return 'UNKNOWN';
}

export function normalizeAchAccountType(accountType: string | null | undefined): 'Checking' | 'Savings' | null {
  const normalized = String(accountType || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'c' || normalized.startsWith('check')) return 'Checking';
  if (normalized === 's' || normalized.startsWith('sav')) return 'Savings';
  return null;
}

export function isAchRuntimeEnabled(achEnabledByFlag: boolean, paymentEnvironment: string): boolean {
  const normalizedEnvironment = String(paymentEnvironment || '').trim().toLowerCase();
  if (!achEnabledByFlag) {
    return false;
  }

  if (normalizedEnvironment === 'sandbox') {
    return true;
  }

  if (normalizedEnvironment === 'production') {
    return isAchRecurringProductionOverrideEnabled();
  }

  return false;
}

function resolveAchRuntimeData(sub: BillableSubscription):
  | {
      bankAccountData: {
        routingNumber: string;
        accountNumber: string;
        accountType: 'Checking' | 'Savings';
        accountHolderName: string;
      };
      maskedSummary: string;
    }
  | { error: string } {
  const routingNumberRaw = (sub.memberBankRoutingNumber || sub.tokenBankRoutingNumber || '').trim();
  const routingNumber = routingNumberRaw.replace(/\D/g, '');
  if (!routingNumber || routingNumber.length !== 9) {
    return { error: 'Missing or invalid ACH routing number (must be 9 digits)' };
  }

  const encryptedOrRawAccountNumber = (sub.memberBankAccountNumber || '').trim();
  if (!encryptedOrRawAccountNumber) {
    return { error: 'Missing ACH account number on member record' };
  }

  let resolvedAccountNumber = encryptedOrRawAccountNumber;
  try {
    resolvedAccountNumber = decryptSensitiveData(encryptedOrRawAccountNumber).trim();
  } catch {
    // If not encrypted with the app format, continue with the stored value.
    resolvedAccountNumber = encryptedOrRawAccountNumber;
  }

  const accountNumber = resolvedAccountNumber.replace(/\s+/g, '');
  if (!accountNumber) {
    return { error: 'Missing ACH account number after decryption/normalization' };
  }

  const accountType = normalizeAchAccountType(sub.memberBankAccountType || sub.tokenBankAccountType);
  if (!accountType) {
    return { error: 'Missing or invalid ACH account type (expected Checking or Savings)' };
  }

  const fallbackName = `${sub.memberFirstName || ''} ${sub.memberLastName || ''}`.trim();
  const accountHolderName = (sub.memberBankAccountHolderName || fallbackName).trim();
  if (!accountHolderName) {
    return { error: 'Missing ACH account holder name' };
  }

  const lastFour = accountNumber.slice(-4) || sub.memberBankAccountLastFour || sub.tokenBankAccountLastFour || '****';
  return {
    bankAccountData: {
      routingNumber,
      accountNumber,
      accountType,
      accountHolderName,
    },
    maskedSummary: `acct ****${lastFour}, type ${accountType}`,
  };
}

function resolvePayerContext(sub: BillableSubscription): {
  payerType: 'member' | 'group';
  payerAccountId: string;
  payerDisplayName: string;
  payerEmail: string | null;
  groupContactSource: 'responsible_person' | 'contact_person' | null;
  contactResolutionSucceeded: boolean;
  chargeContact: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    customerNumber: string;
  };
} {
  const normalizeEmail = (value: string | null | undefined): string | null => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return null;
    if (!normalized.includes('@') || normalized.startsWith('@') || normalized.endsWith('@')) return null;
    return normalized;
  };

  const resolveGroupBillingContact = (groupSub: BillableSubscription): {
    email: string | null;
    source: 'responsible_person' | 'contact_person' | null;
    resolved: boolean;
  } => {
    const responsibleEmail = normalizeEmail(groupSub.payerResponsibleEmail);
    if (responsibleEmail) {
      return { email: responsibleEmail, source: 'responsible_person', resolved: true };
    }

    const contactEmail = normalizeEmail(groupSub.payerContactEmail);
    if (contactEmail) {
      return { email: contactEmail, source: 'contact_person', resolved: true };
    }

    const fallback = normalizeEmail(groupSub.payerEmail);
    if (fallback) {
      const fallbackSource = groupSub.payerContactSource === 'contact_person' ? 'contact_person' : 'responsible_person';
      return { email: fallback, source: fallbackSource, resolved: true };
    }

    return { email: null, source: null, resolved: false };
  };

  const payerType = sub.payerType === 'group' ? 'group' : 'member';
  const payerAccountId = String(sub.payerAccountId || sub.memberId);
  const memberName = `${sub.memberFirstName || ''} ${sub.memberLastName || ''}`.trim();
  const groupName = (sub.groupName || sub.payerDisplayName || '').trim();

  const payerDisplayName =
    payerType === 'group'
      ? (groupName || `Group ${sub.groupId || payerAccountId}`)
      : (memberName || `Member ${sub.memberId}`);

  const groupContact = payerType === 'group'
    ? resolveGroupBillingContact(sub)
    : null;

  const payerEmail = payerType === 'group'
    ? (groupContact?.email || null)
    : (sub.memberEmail || null);

  return {
    payerType,
    payerAccountId,
    payerDisplayName,
    payerEmail,
    groupContactSource: payerType === 'group' ? (groupContact?.source || null) : null,
    contactResolutionSucceeded: payerType === 'group' ? Boolean(groupContact?.resolved) : true,
    chargeContact: {
      id: payerType === 'group' ? `group:${payerAccountId}` : String(sub.memberId),
      email: payerEmail,
      firstName: payerType === 'group' ? payerDisplayName : (sub.memberFirstName || null),
      lastName: payerType === 'group' ? null : (sub.memberLastName || null),
      customerNumber: payerType === 'group' ? `GROUP-${payerAccountId}` : String(sub.memberId),
    },
  };
}

function buildMockRecurringEpxSuccess(transactionId: string, tranType: 'CCE1' | 'CKC2', contextLabel: string): {
  success: boolean;
  requestFields: Record<string, string>;
  requestPayload: string;
  responseFields: Record<string, string>;
  rawResponse: string;
  error?: string;
} {
  const now = new Date();
  const responseFields: Record<string, string> = {
    AUTH_RESP: '00',
    AUTH_RESP_TEXT: `APPROVED (SIMULATED ${contextLabel})`,
    AUTH_CODE: 'SIM123',
    TRAN_NBR: transactionId,
    TRANSACTION_ID: transactionId,
    RESPONSE_SOURCE: 'EPX_SIMULATION_MODE',
    TS: now.toISOString(),
  };

  return {
    success: true,
    requestFields: {
      TRAN_TYPE: tranType,
      TRAN_NBR: transactionId,
      AMOUNT: 'SIMULATED',
      MODE: 'EPX_SIMULATION_MODE',
    },
    requestPayload: 'SIMULATED_SERVER_POST_REQUEST',
    responseFields,
    rawResponse: Object.entries(responseFields)
      .map(([key, value]) => `${key}=${value}`)
      .join('&'),
  };
}

// ────────────────────────────────────────
// PostgreSQL advisory lock (session-level)
// ────────────────────────────────────────

async function acquireLock(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('app_try_advisory_lock', {
      lock_id: ADVISORY_LOCK_KEY,
    });
    if (error) {
      console.warn(`${LOG_PREFIX} Advisory lock RPC error:`, error.message);
      return false;
    }
    return data === true;
  } catch (err: any) {
    console.warn(`${LOG_PREFIX} Could not acquire advisory lock:`, err.message);
    return false;
  }
}

async function releaseLock(): Promise<void> {
  try {
    await supabase.rpc('app_advisory_unlock', {
      lock_id: ADVISORY_LOCK_KEY,
    });
  } catch (err: any) {
    console.warn(`${LOG_PREFIX} Could not release advisory lock:`, err.message);
  }
}

// ────────────────────────────────────────
// Transaction ID generation
// ────────────────────────────────────────

function generateTransactionId(subscriptionId: number, billingDate: Date): string {
  const ymd = billingDate.toISOString().slice(0, 10).replace(/-/g, '');
  return `RECUR-${subscriptionId}-${ymd}`;
}

function truncateBillingDate(date: string | Date): string {
  return new Date(date).toISOString().slice(0, 10) + 'T00:00:00.000Z';
}

function looksLikeEncryptedToken(value: string): boolean {
  const parts = value.split(':');
  if (parts.length !== 2) return false;
  return /^[0-9a-f]+$/i.test(parts[0]) && /^[0-9a-f]+$/i.test(parts[1]);
}

function isUsableAuthGuid(value: string | null | undefined): value is string {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  if (normalized.length < 30 || normalized.length > 64) return false;
  return /^[A-Za-z0-9-]+$/.test(normalized);
}

function resolveRecurringCardAuthGuid(sub: BillableSubscription):
  | { authGuid: string }
  | { error: string } {
  const storedAuthGuid = typeof sub.tokenOriginalNetworkTransId === 'string'
    ? sub.tokenOriginalNetworkTransId.trim()
    : '';
  if (isUsableAuthGuid(storedAuthGuid)) {
    return { authGuid: storedAuthGuid };
  }

  const tokenValue = String(sub.bricToken || '').trim();
  if (!tokenValue) {
    return { error: 'Missing recurring token for card charge' };
  }

  if (!looksLikeEncryptedToken(tokenValue) && isUsableAuthGuid(tokenValue)) {
    return { authGuid: tokenValue };
  }

  try {
    const decrypted = decryptPaymentToken(tokenValue).trim();
    if (!isUsableAuthGuid(decrypted)) {
      return { error: 'Resolved ORIG_AUTH_GUID was empty or invalid length' };
    }
    return { authGuid: decrypted };
  } catch {
    return { error: 'Token decryption failed and no stored ORIG_AUTH_GUID was available' };
  }
}

// ────────────────────────────────────────
// Core billing cycle
// ────────────────────────────────────────

async function runBillingCycle(options?: {
  dryRunOverride?: boolean;
  source?: SchedulerCycleSource;
  requestedBy?: string;
}): Promise<RecurringSchedulerRunResult> {
  const cycleStart = Date.now();
  const source: SchedulerCycleSource = options?.source || 'automatic';
  const dryRun = typeof options?.dryRunOverride === 'boolean'
    ? options.dryRunOverride
    : isDryRun();
  const achEnabledByFlag = isAchRecurringEnabled();
  const achProdOverrideEnabled = isAchRecurringProductionOverrideEnabled();
  const achTestMode = isAchRecurringTestMode();
  const currentPaymentEnvironment = await paymentEnvironment.getEnvironment();
  const achEnabled = isAchRuntimeEnabled(achEnabledByFlag, currentPaymentEnvironment);
  const mode = dryRun ? 'DRY RUN' : 'LIVE';

  refreshSchedulerConfigState();
  schedulerStatusState.lastCycle.source = source;
  schedulerStatusState.lastCycle.mode = mode;
  schedulerStatusState.lastCycle.requestedBy = options?.requestedBy || null;
  schedulerStatusState.lastCycle.startedAt = new Date(cycleStart).toISOString();
  schedulerStatusState.lastCycle.completedAt = null;
  schedulerStatusState.lastCycle.durationMs = null;
  schedulerStatusState.lastCycle.lockAcquired = null;
  schedulerStatusState.lastCycle.metrics = null;
  schedulerStatusState.lastCycle.error = null;

  if (achEnabledByFlag && currentPaymentEnvironment === 'production' && !achProdOverrideEnabled) {
    console.warn(
      `${LOG_PREFIX} ACH recurring is enabled but blocked in production. Set ACH_RECURRING_ALLOW_PRODUCTION=true to allow live ACH recurring charges.`
    );
  }

  console.log(`${LOG_PREFIX} ──── Cycle start (${mode}) ────`);

  // 1. Acquire lock
  const locked = await acquireLock();
  schedulerStatusState.lastCycle.lockAcquired = locked;
  if (!locked) {
    const completedAt = new Date().toISOString();
    schedulerStatusState.lastCycle.lockSkippedAt = completedAt;
    schedulerStatusState.lastCycle.completedAt = completedAt;
    schedulerStatusState.lastCycle.durationMs = Date.now() - cycleStart;
    schedulerStatusState.lastCycle.metrics = { processed: 0, skipped: 0, errors: 0 };
    console.log(`${LOG_PREFIX} Another instance holds the lock — skipping cycle`);
    return {
      source,
      mode,
      startedAt: new Date(cycleStart).toISOString(),
      completedAt,
      durationMs: Date.now() - cycleStart,
      lockAcquired: false,
      metrics: { processed: 0, skipped: 0, errors: 0 },
      requestedBy: options?.requestedBy,
    };
  }

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  try {
    // 2. Verify and resolve stale 'pending' entries
    const staleLogs = await getStalePendingBillingLogs(STALE_PENDING_THRESHOLD_MINUTES);
    for (const stale of staleLogs) {
      // Check whether the payment actually succeeded (EPX may have responded after crash)
      const txId = generateTransactionId(stale.subscriptionId, new Date(stale.billingDate));
      const payment = await getPaymentByTransactionId(txId);

      // Also check whether the webhook already advanced next_billing_date past the stale date
      const { data: subRow } = await supabase
        .from('subscriptions')
        .select('next_billing_date')
        .eq('id', stale.subscriptionId)
        .single();
      const nextBilling = subRow?.next_billing_date ? new Date(subRow.next_billing_date) : null;
      const staleBillingDate = new Date(stale.billingDate);

      const paymentExists = !!payment && (payment.status === 'completed' || payment.status === 'succeeded');
      const dateAdvanced = nextBilling !== null && nextBilling > staleBillingDate;

      if (paymentExists || dateAdvanced) {
        // Payment went through — correct the log to success
        await updateRecurringBillingLog(stale.id, {
          status: 'success',
          failureReason: null,
          processedAt: new Date().toISOString(),
        });
        console.log(`${LOG_PREFIX} Stale pending log ${stale.id} (sub ${stale.subscriptionId}) verified as success`);
      } else {
        // No evidence of success — mark failed so it can be retried
        await updateRecurringBillingLog(stale.id, {
          status: 'failed',
          failureReason: 'Stale pending entry — no matching payment or date advancement found',
          processedAt: new Date().toISOString(),
        });
        console.warn(`${LOG_PREFIX} Marked stale pending log ${stale.id} (sub ${stale.subscriptionId}) as failed`);
      }
    }

    // 3. Query due subscriptions (single query, ACH inclusion hard-gated)
    const now = new Date();
    const dueSubscriptions = await getSubscriptionsDueForBilling(now, {
      includeACH: achEnabled,
    });

    if (dueSubscriptions.length === 0) {
      console.log(`${LOG_PREFIX} No subscriptions due for billing`);
      const completedAt = new Date().toISOString();
      schedulerStatusState.lastCycle.completedAt = completedAt;
      schedulerStatusState.lastCycle.durationMs = Date.now() - cycleStart;
      schedulerStatusState.lastCycle.metrics = { processed: 0, skipped: 0, errors: 0 };
      return {
        source,
        mode,
        startedAt: new Date(cycleStart).toISOString(),
        completedAt,
        durationMs: Date.now() - cycleStart,
        lockAcquired: true,
        metrics: { processed: 0, skipped: 0, errors: 0 },
        requestedBy: options?.requestedBy,
      };
    }

    const cardDueCount = dueSubscriptions.filter((sub) => normalizePaymentMethodType(sub.paymentMethodType) === 'CreditCard').length;
    const achDueCount = dueSubscriptions.filter((sub) => normalizePaymentMethodType(sub.paymentMethodType) === 'ACH').length;

    console.log(
      `${LOG_PREFIX} Found ${dueSubscriptions.length} subscription(s) due ` +
      `(card=${cardDueCount}, ach=${achDueCount}, achEnabled=${achEnabled}, achEnabledByFlag=${achEnabledByFlag}, paymentEnvironment=${currentPaymentEnvironment}, achTestMode=${achTestMode})`
    );

    for (const due of dueSubscriptions) {
      const dueGroupContactSource = due.payerType === 'group'
        ? (due.payerContactSource === 'contact_person' ? 'contact_person' : (due.payerContactSource === 'responsible_person' ? 'responsible_person' : null))
        : null;
      const dueContactResolutionSucceeded = due.payerType === 'group'
        ? Boolean(String(due.payerResponsibleEmail || '').trim() || String(due.payerContactEmail || '').trim() || String(due.payerEmail || '').trim())
        : true;

      appendDueDecision({
        at: new Date().toISOString(),
        source,
        subscriptionId: due.subscriptionId,
        memberId: due.memberId,
        groupId: due.groupId,
        payerType: due.payerType,
        payerId: due.payerAccountId,
        payerDisplayName: due.payerDisplayName,
        amount: due.amount,
        nextBillingDate: due.nextBillingDate,
        paymentMethodType: due.paymentMethodType || 'UNKNOWN',
        groupContactSource: dueGroupContactSource,
        contactResolutionSucceeded: dueContactResolutionSucceeded,
        selected: true,
        skipped: false,
        skipReason: null,
      });
    }

    // 4. Process each subscription
    for (const sub of dueSubscriptions) {
      try {
        const processed = await processSubscription(sub, dryRun, achEnabled, achTestMode, source);
        if (processed.outcome === 'processed') {
          successCount++;
        } else {
          skipCount++;
        }
      } catch (err: any) {
        failCount++;
        console.error(`${LOG_PREFIX} Error processing subscription ${sub.subscriptionId}:`, err.message);
      }
    }

    const elapsed = Date.now() - cycleStart;
    const completedAt = new Date().toISOString();
    schedulerStatusState.lastCycle.completedAt = completedAt;
    schedulerStatusState.lastCycle.durationMs = elapsed;
    schedulerStatusState.lastCycle.metrics = {
      processed: successCount,
      skipped: skipCount,
      errors: failCount,
    };
    console.log(
      `${LOG_PREFIX} ──── Cycle complete (${mode}) ────  ` +
      `${successCount} processed, ${skipCount} skipped, ${failCount} errors, ${elapsed}ms`
    );
    return {
      source,
      mode,
      startedAt: new Date(cycleStart).toISOString(),
      completedAt,
      durationMs: elapsed,
      lockAcquired: true,
      metrics: {
        processed: successCount,
        skipped: skipCount,
        errors: failCount,
      },
      requestedBy: options?.requestedBy,
    };
  } catch (cycleError: any) {
    const completedAt = new Date().toISOString();
    schedulerStatusState.lastCycle.completedAt = completedAt;
    schedulerStatusState.lastCycle.durationMs = Date.now() - cycleStart;
    schedulerStatusState.lastCycle.metrics = {
      processed: successCount,
      skipped: skipCount,
      errors: failCount,
    };
    schedulerStatusState.lastCycle.error = cycleError?.message || String(cycleError);
    throw cycleError;
  } finally {
    await releaseLock();
  }
}

async function processSubscription(
  sub: BillableSubscription,
  dryRun: boolean,
  achEnabled: boolean,
  achTestMode: boolean,
  source: SchedulerCycleSource,
): Promise<{ outcome: 'processed' | 'skipped'; skipReason?: string }> {
  const payerContext = resolvePayerContext(sub);
  const buildAttemptDiagBase = () => ({
    at: new Date().toISOString(),
    source,
    subscriptionId: sub.subscriptionId,
    memberId: sub.memberId,
    groupId: sub.groupId,
    payerType: payerContext.payerType,
    payerId: payerContext.payerAccountId,
    payerDisplayName: payerContext.payerDisplayName,
    amount: sub.amount,
    nextBillingDate: sub.nextBillingDate,
    groupContactSource: payerContext.groupContactSource,
    contactResolutionSucceeded: payerContext.contactResolutionSucceeded,
  });
  const methodType = normalizePaymentMethodType(sub.paymentMethodType);
  if (methodType === 'UNKNOWN') {
    console.warn(
      `${LOG_PREFIX} Skipping subscription ${sub.subscriptionId} — unsupported payment method type '${sub.paymentMethodType || 'null'}'`
    );
    appendDueDecision({
      at: new Date().toISOString(),
      source,
      subscriptionId: sub.subscriptionId,
      memberId: sub.memberId,
      groupId: sub.groupId,
      payerType: payerContext.payerType,
      payerId: payerContext.payerAccountId,
      payerDisplayName: payerContext.payerDisplayName,
      amount: sub.amount,
      nextBillingDate: sub.nextBillingDate,
      paymentMethodType: sub.paymentMethodType || 'UNKNOWN',
      groupContactSource: payerContext.groupContactSource,
      contactResolutionSucceeded: payerContext.contactResolutionSucceeded,
      selected: true,
      skipped: true,
      skipReason: 'unsupported_payment_method_type',
    });
    appendChargeAttempt({
      ...buildAttemptDiagBase(),
      paymentMethodType: sub.paymentMethodType || 'UNKNOWN',
      selected: true,
      skipped: true,
      skipReason: 'unsupported_payment_method_type',
      chargeAttemptResult: 'skipped',
      billingEventId: null,
    });
    return { outcome: 'skipped', skipReason: 'unsupported_payment_method_type' };
  }

  if (payerContext.payerType === 'group' && !payerContext.payerEmail) {
    console.warn(`${LOG_PREFIX} Skipping subscription ${sub.subscriptionId} — missing group billing contact email`);
    appendDueDecision({
      at: new Date().toISOString(),
      source,
      subscriptionId: sub.subscriptionId,
      memberId: sub.memberId,
      groupId: sub.groupId,
      payerType: payerContext.payerType,
      payerId: payerContext.payerAccountId,
      payerDisplayName: payerContext.payerDisplayName,
      amount: sub.amount,
      nextBillingDate: sub.nextBillingDate,
      paymentMethodType: methodType,
      groupContactSource: payerContext.groupContactSource,
      contactResolutionSucceeded: payerContext.contactResolutionSucceeded,
      selected: true,
      skipped: true,
      skipReason: 'missing_group_contact',
    });
    appendChargeAttempt({
      ...buildAttemptDiagBase(),
      paymentMethodType: methodType,
      selected: true,
      skipped: true,
      skipReason: 'missing_group_contact',
      chargeAttemptResult: 'skipped',
      billingEventId: null,
    });
    return { outcome: 'skipped', skipReason: 'missing_group_contact' };
  }

  if (methodType === 'ACH' && !achEnabled) {
    console.log(`${LOG_PREFIX} Skipping subscription ${sub.subscriptionId} — ACH_RECURRING_ENABLED is not true`);
    appendDueDecision({
      at: new Date().toISOString(),
      source,
      subscriptionId: sub.subscriptionId,
      memberId: sub.memberId,
      groupId: sub.groupId,
      payerType: payerContext.payerType,
      payerId: payerContext.payerAccountId,
      payerDisplayName: payerContext.payerDisplayName,
      amount: sub.amount,
      nextBillingDate: sub.nextBillingDate,
      paymentMethodType: methodType,
      groupContactSource: payerContext.groupContactSource,
      contactResolutionSucceeded: payerContext.contactResolutionSucceeded,
      selected: true,
      skipped: true,
      skipReason: 'ach_disabled',
    });
    appendChargeAttempt({
      ...buildAttemptDiagBase(),
      paymentMethodType: methodType,
      selected: true,
      skipped: true,
      skipReason: 'ach_disabled',
      chargeAttemptResult: 'skipped',
      billingEventId: null,
    });
    return { outcome: 'skipped', skipReason: 'ach_disabled' };
  }

  const billingDate = truncateBillingDate(sub.nextBillingDate);
  const transactionId = generateTransactionId(sub.subscriptionId, new Date(billingDate));

  // 5. Idempotency check
  const existing = await hasExistingBillingLogEntry(sub.subscriptionId, billingDate);
  if (existing.exists) {
    console.log(
      `${LOG_PREFIX} Subscription ${sub.subscriptionId} already has '${existing.status}' entry for ${billingDate} — skipping`
    );
    appendDueDecision({
      at: new Date().toISOString(),
      source,
      subscriptionId: sub.subscriptionId,
      memberId: sub.memberId,
      groupId: sub.groupId,
      payerType: payerContext.payerType,
      payerId: payerContext.payerAccountId,
      payerDisplayName: payerContext.payerDisplayName,
      amount: sub.amount,
      nextBillingDate: sub.nextBillingDate,
      paymentMethodType: methodType,
      groupContactSource: payerContext.groupContactSource,
      contactResolutionSucceeded: payerContext.contactResolutionSucceeded,
      selected: true,
      skipped: true,
      skipReason: 'already_processed_for_cycle',
    });
    appendChargeAttempt({
      ...buildAttemptDiagBase(),
      paymentMethodType: methodType,
      selected: true,
      skipped: true,
      skipReason: 'already_processed_for_cycle',
      chargeAttemptResult: 'skipped',
      billingEventId: null,
    });
    return { outcome: 'skipped', skipReason: 'already_processed_for_cycle' };
  }

  // 6. Resolve card auth GUID (ACH does not require ORIG_AUTH_GUID for debit MIT)
  let authGuid: string | undefined;
  if (methodType === 'CreditCard') {
    const cardAuthGuidResult = resolveRecurringCardAuthGuid(sub);
    if ('error' in cardAuthGuidResult) {
      console.error(`${LOG_PREFIX} Failed to resolve auth GUID for subscription ${sub.subscriptionId}:`, cardAuthGuidResult.error);
      const billingEventId = await insertRecurringBillingLog({
        subscriptionId: sub.subscriptionId,
        memberId: sub.memberId,
        paymentTokenId: sub.tokenId,
        paymentMethodType: methodType,
        amount: sub.amount,
        billingDate,
        attemptNumber: 1,
        status: 'failed',
        failureReason: cardAuthGuidResult.error,
        processedAt: new Date().toISOString(),
      });
      appendChargeAttempt({
        ...buildAttemptDiagBase(),
        paymentMethodType: methodType,
        selected: true,
        skipped: false,
        skipReason: null,
        chargeAttemptResult: 'failed_auth_guid_resolution',
        billingEventId,
      });
      return { outcome: 'processed' };
    }
    authGuid = cardAuthGuidResult.authGuid;
  }

  const achRuntimeData = methodType === 'ACH' ? resolveAchRuntimeData(sub) : null;
  if (achRuntimeData && 'error' in achRuntimeData) {
    const billingEventId = await insertRecurringBillingLog({
      subscriptionId: sub.subscriptionId,
      memberId: sub.memberId,
      paymentTokenId: sub.tokenId,
      paymentMethodType: methodType,
      amount: sub.amount,
      billingDate,
      attemptNumber: 1,
      status: 'failed',
      epxTransactionId: transactionId,
      failureReason: achRuntimeData.error,
      processedAt: new Date().toISOString(),
    });
    console.error(`${LOG_PREFIX} ACH runtime data missing for subscription ${sub.subscriptionId}: ${achRuntimeData.error}`);
    appendChargeAttempt({
      ...buildAttemptDiagBase(),
      paymentMethodType: methodType,
      selected: true,
      skipped: false,
      skipReason: null,
      chargeAttemptResult: 'failed_ach_runtime_data',
      billingEventId,
    });
    return { outcome: 'processed' };
  }

  // 7. DRY RUN path
  if (dryRun) {
    const methodLabel = methodType === 'ACH' ? 'ach' : 'card';
    const achMaskSuffix = achRuntimeData && !('error' in achRuntimeData)
      ? `, ${achRuntimeData.maskedSummary}`
      : '';
    console.log(
      `${LOG_PREFIX} DRY RUN — Would charge subscription ${sub.subscriptionId}, ` +
      `payer ${payerContext.payerType}:${payerContext.payerAccountId} (${payerContext.payerDisplayName}), ` +
      `amount $${sub.amount}, method ${methodLabel}${achMaskSuffix}`
    );
    const billingEventId = await insertRecurringBillingLog({
      subscriptionId: sub.subscriptionId,
      memberId: sub.memberId,
      paymentTokenId: sub.tokenId,
      paymentMethodType: methodType,
      amount: sub.amount,
      billingDate,
      attemptNumber: 1,
      status: 'dry_run',
      epxTransactionId: transactionId,
      processedAt: new Date().toISOString(),
    });
    appendChargeAttempt({
      ...buildAttemptDiagBase(),
      paymentMethodType: methodType,
      selected: true,
      skipped: false,
      skipReason: null,
      chargeAttemptResult: 'dry_run',
      billingEventId,
    });
    return { outcome: 'processed' };
  }

  // 8. LIVE charge path — write pending log first
  const logId = await insertRecurringBillingLog({
    subscriptionId: sub.subscriptionId,
    memberId: sub.memberId,
    paymentTokenId: sub.tokenId,
    paymentMethodType: methodType,
    amount: sub.amount,
    billingDate,
    attemptNumber: 1,
    status: 'pending',
    epxTransactionId: transactionId,
  });

  try {
    const simulationMode = isSimulationModeEnabled();
    const tranType = methodType === 'ACH' ? 'CKC2' : 'CCE1';
    const achTestLabel = methodType === 'ACH' && achTestMode ? '[ACH_TEST_MODE] ' : '';
    const result = simulationMode
      ? buildMockRecurringEpxSuccess(transactionId, tranType, achTestLabel ? 'ACH_TEST_MODE' : methodType)
      : await submitServerPostRecurringPayment({
          authGuid,
          amount: parseFloat(sub.amount),
          transactionId,
          tranType,
          member: payerContext.chargeContact,
          description: `${achTestLabel}Recurring billing — subscription ${sub.subscriptionId} — payer ${payerContext.payerType}:${payerContext.payerAccountId}`,
          metadata: {
            payerType: payerContext.payerType,
            payerAccountId: payerContext.payerAccountId,
            payerDisplayName: payerContext.payerDisplayName,
            groupId: sub.groupId,
          },
          bankAccountData:
            methodType === 'ACH' && achRuntimeData && !('error' in achRuntimeData)
              ? achRuntimeData.bankAccountData
              : undefined,
        });

    if (simulationMode) {
      console.warn(
        `${LOG_PREFIX} SIMULATED EPX success for subscription ${sub.subscriptionId} ` +
        `(transaction ${transactionId})`
      );
    }

    if (methodType === 'ACH' && achTestMode) {
      console.warn(
        `${LOG_PREFIX} ACH test mode execution for subscription ${sub.subscriptionId} ` +
        `(transaction ${transactionId})`
      );
    }

    if (result.success) {
      const successResponseMessage = methodType === 'ACH' && achTestMode
        ? `${result.responseFields?.AUTH_RESP_TEXT || 'APPROVED'} [ACH_TEST_MODE]`
        : result.responseFields?.AUTH_RESP_TEXT || null;

      if (methodType === 'ACH' && achTestMode) {
        await updateRecurringBillingLog(logId, {
          status: 'ach_test_success',
          epxTransactionId: result.responseFields?.TRANSACTION_ID || transactionId,
          epxAuthCode: result.responseFields?.AUTH_CODE || null,
          epxResponseCode: result.responseFields?.AUTH_RESP || null,
          epxResponseMessage: successResponseMessage,
          failureReason: null,
          processedAt: new Date().toISOString(),
        });

        console.log(
          `${LOG_PREFIX} ✅ ACH test success for subscription ${sub.subscriptionId} ` +
          `(transaction ${transactionId}) — post-success persistence intentionally skipped`
        );
        appendChargeAttempt({
          ...buildAttemptDiagBase(),
          paymentMethodType: methodType,
          selected: true,
          skipped: false,
          skipReason: null,
          chargeAttemptResult: 'ach_test_success',
          billingEventId: logId,
        });
        return { outcome: 'processed' };
      }

      const persistenceResult = await persistRecurringPostSuccess({
        subscriptionId: sub.subscriptionId,
        memberId: sub.memberId,
        amount: sub.amount,
        paymentMethodType: methodType,
        billedCycleDate: billingDate,
        transactionId,
        epxAuthCode: result.responseFields?.AUTH_CODE || null,
        epxResponseCode: result.responseFields?.AUTH_RESP || null,
        epxResponseMessage: successResponseMessage,
        paymentCapturedAt: new Date(),
      });

      if (!persistenceResult.success) {
        await updateRecurringBillingLog(logId, {
          status: 'failed',
          epxTransactionId: result.responseFields?.TRANSACTION_ID || transactionId,
          epxAuthCode: result.responseFields?.AUTH_CODE || null,
          epxResponseCode: result.responseFields?.AUTH_RESP || null,
          epxResponseMessage: successResponseMessage,
          failureReason: persistenceResult.failureReason || 'Post-success persistence failed',
          processedAt: new Date().toISOString(),
        });

        console.error(
          `${LOG_PREFIX} ❌ Controlled persistence failure for subscription ${sub.subscriptionId}: ` +
          `${persistenceResult.failureReason || 'unknown reason'}`
        );
        appendChargeAttempt({
          ...buildAttemptDiagBase(),
          paymentMethodType: methodType,
          selected: true,
          skipped: false,
          skipReason: null,
          chargeAttemptResult: 'failed_post_success_persistence',
          billingEventId: logId,
        });
        return { outcome: 'processed' };
      }

      // Update log to success only after payment persistence + billing advancement + payout creation succeed.
      await updateRecurringBillingLog(logId, {
        status: 'success',
        paymentId: persistenceResult.paymentId,
        epxTransactionId: result.responseFields?.TRANSACTION_ID || transactionId,
        epxAuthCode: result.responseFields?.AUTH_CODE || null,
        epxResponseCode: result.responseFields?.AUTH_RESP || null,
        epxResponseMessage: successResponseMessage,
        processedAt: new Date().toISOString(),
      });

      console.log(
        `${LOG_PREFIX} ✅ Charged ${methodType} subscription ${sub.subscriptionId} — $${sub.amount} — ` +
        `payer ${payerContext.payerType}:${payerContext.payerAccountId} — ` +
        `auth ${result.responseFields?.AUTH_CODE || 'n/a'}`
      );
      appendChargeAttempt({
        ...buildAttemptDiagBase(),
        paymentMethodType: methodType,
        selected: true,
        skipped: false,
        skipReason: null,
        chargeAttemptResult: 'success',
        billingEventId: logId,
      });
    } else {
      const failureResponseMessage = methodType === 'ACH' && achTestMode
        ? `${result.error || result.responseFields?.AUTH_RESP_TEXT || 'EPX declined'} [ACH_TEST_MODE]`
        : result.error || result.responseFields?.AUTH_RESP_TEXT || null;

      // EPX declined
      await updateRecurringBillingLog(logId, {
        status: 'failed',
        epxResponseCode: result.responseFields?.AUTH_RESP || null,
        epxResponseMessage: failureResponseMessage,
        failureReason: failureResponseMessage || 'EPX declined',
        processedAt: new Date().toISOString(),
      });

      console.warn(
        `${LOG_PREFIX} ❌ Declined subscription ${sub.subscriptionId} — ` +
        `code ${result.responseFields?.AUTH_RESP || 'n/a'}: ${result.error || 'unknown'}`
      );
      appendChargeAttempt({
        ...buildAttemptDiagBase(),
        paymentMethodType: methodType,
        selected: true,
        skipped: false,
        skipReason: null,
        chargeAttemptResult: 'declined',
        billingEventId: logId,
      });
    }
  } catch (epxError: any) {
    // Network / timeout / unexpected error
    await updateRecurringBillingLog(logId, {
      status: 'failed',
      failureReason: epxError.message || 'Unexpected error during EPX call',
      processedAt: new Date().toISOString(),
    });
    console.error(
      `${LOG_PREFIX} ❌ Error charging subscription ${sub.subscriptionId}:`,
      epxError.message
    );
    appendChargeAttempt({
      ...buildAttemptDiagBase(),
      paymentMethodType: methodType,
      selected: true,
      skipped: false,
      skipReason: null,
      chargeAttemptResult: 'failed_epx_exception',
      billingEventId: logId,
    });
  }

  return { outcome: 'processed' };
}

// ────────────────────────────────────────
// Scheduler init (called from server/index.ts)
// ────────────────────────────────────────

export function scheduleRecurringBilling(): void {
  if (process.env.BILLING_SCHEDULER_ENABLED !== 'true') {
    refreshSchedulerConfigState(false);
    console.log(`${LOG_PREFIX} Scheduler disabled (BILLING_SCHEDULER_ENABLED !== 'true')`);
    return;
  }

  const intervalMs = getIntervalMs();
  const dryRun = isDryRun();
  const simulationMode = isSimulationModeEnabled();
  const achEnabled = isAchRecurringEnabled();
  const achTestMode = isAchRecurringTestMode();
  const mode = dryRun ? 'DRY RUN' : 'LIVE';

  schedulerStatusState.initializedAt = new Date().toISOString();
  refreshSchedulerConfigState(true);

  console.log(`${LOG_PREFIX} Scheduler initialized (${mode})`);
  console.log(`${LOG_PREFIX} Interval: ${Math.round(intervalMs / 60_000)} minutes`);
  console.log(`${LOG_PREFIX} ACH recurring enabled: ${achEnabled}`);
  console.log(`${LOG_PREFIX} ACH recurring test mode: ${achTestMode}`);
  if (simulationMode) {
    console.warn(`${LOG_PREFIX} EPX simulation mode is ENABLED — recurring charges will be simulated and no EPX request will be sent`);
  }

  // Run first cycle after a short delay (let server finish startup)
  setTimeout(() => {
    runBillingCycle({ source: 'automatic' }).catch((err) => {
      schedulerStatusState.lastCycle.error = err?.message || String(err);
      console.error(`${LOG_PREFIX} Unhandled cycle error:`, err);
    });
  }, 15_000);

  // Schedule recurring cycles
  setInterval(() => {
    runBillingCycle({ source: 'automatic' }).catch((err) => {
      schedulerStatusState.lastCycle.error = err?.message || String(err);
      console.error(`${LOG_PREFIX} Unhandled cycle error:`, err);
    });
  }, intervalMs);
}

export async function runRecurringBillingCycleOnce(options?: {
  forceDryRun?: boolean;
  requestedBy?: string;
}): Promise<RecurringSchedulerRunResult> {
  const forceDryRun = options?.forceDryRun !== false;
  schedulerStatusState.manualRunsTriggered += 1;

  return runBillingCycle({
    source: 'manual',
    dryRunOverride: forceDryRun,
    requestedBy: options?.requestedBy,
  });
}
