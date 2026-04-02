#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const cwd = process.cwd();
const envPath = path.join(cwd, '.env');
const strictMode = process.argv.includes('--strict');

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^"|"$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const normalize = (value) => String(value || '').replace(/["']/g, '').trim();
const normalizeLower = (value) => normalize(value).toLowerCase();
const boolFromEnv = (value, defaultValue = false) => {
  const normalized = normalizeLower(value);
  if (!normalized) return defaultValue;
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return defaultValue;
};

const checks = [];
const addCheck = (name, pass, value, expected, notes = '') => {
  checks.push({ name, pass: !!pass, value, expected, notes });
};

const paymentProvider = normalizeLower(process.env.PAYMENT_PROVIDER);
const epxEnvironment = normalizeLower(process.env.EPX_ENVIRONMENT);
const schedulerEnabled = boolFromEnv(process.env.BILLING_SCHEDULER_ENABLED, false);
const schedulerDryRun = boolFromEnv(process.env.BILLING_SCHEDULER_DRY_RUN, true);
const achRecurringEnabled = boolFromEnv(process.env.ACH_RECURRING_ENABLED, false);
const achRecurringAllowProduction = boolFromEnv(process.env.ACH_RECURRING_ALLOW_PRODUCTION, false);

const epxPublicKey = normalize(process.env.EPX_PUBLIC_KEY);
const epxTerminalProfileId = normalize(process.env.EPX_TERMINAL_PROFILE_ID);
const epxCustNbr = normalize(process.env.EPX_CUST_NBR);
const epxDbaNbr = normalize(process.env.EPX_DBA_NBR);
const epxMerchNbr = normalize(process.env.EPX_MERCH_NBR);
const epxTerminalNbr = normalize(process.env.EPX_TERMINAL_NBR);
const epxMac = normalize(process.env.EPX_MAC);

addCheck('PAYMENT_PROVIDER is not mock', paymentProvider !== 'mock', paymentProvider || '(empty)', 'non-mock provider for live charges');
addCheck('EPX_ENVIRONMENT is production', epxEnvironment === 'production', epxEnvironment || '(empty)', 'production');
addCheck('BILLING_SCHEDULER_ENABLED', schedulerEnabled, String(schedulerEnabled), 'true');
addCheck('BILLING_SCHEDULER_DRY_RUN disabled', schedulerDryRun === false, String(schedulerDryRun), 'false');
addCheck('ACH_RECURRING_ENABLED', achRecurringEnabled, String(achRecurringEnabled), 'true');
addCheck('ACH_RECURRING_ALLOW_PRODUCTION', achRecurringAllowProduction, String(achRecurringAllowProduction), 'true');
addCheck('EPX_PUBLIC_KEY set', !!epxPublicKey, epxPublicKey ? 'set' : 'missing', 'set');
addCheck('EPX_TERMINAL_PROFILE_ID set', !!epxTerminalProfileId, epxTerminalProfileId ? 'set' : 'missing', 'set');
addCheck('EPX_CUST_NBR set', !!epxCustNbr, epxCustNbr ? 'set' : 'missing', 'set');
addCheck('EPX_DBA_NBR set', !!epxDbaNbr, epxDbaNbr ? 'set' : 'missing', 'set');
addCheck('EPX_MERCH_NBR set', !!epxMerchNbr, epxMerchNbr ? 'set' : 'missing', 'set');
addCheck('EPX_TERMINAL_NBR set', !!epxTerminalNbr, epxTerminalNbr ? 'set' : 'missing', 'set');
addCheck('EPX_MAC set', !!epxMac, epxMac ? 'set' : 'missing', 'set');

const supabaseUrl = normalize(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const supabaseServiceKey = normalize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);

let platformPaymentEnvironment = null;
let platformCheckSkipped = false;
let platformCheckError = null;

if (!supabaseUrl || !supabaseServiceKey) {
  platformCheckSkipped = true;
  platformCheckError = 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY missing';
} else {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'public' },
  });

  const { data, error } = await supabase
    .from('platform_settings')
    .select('key, value, updated_at, updated_by')
    .eq('key', 'payment_environment')
    .limit(1);

  if (error) {
    platformCheckError = error.message;
  } else {
    const row = Array.isArray(data) ? data[0] : null;
    const rawEnv = row?.value && typeof row.value === 'object' ? row.value.environment : null;
    platformPaymentEnvironment = normalizeLower(rawEnv || '');
  }
}

if (platformCheckSkipped) {
  addCheck(
    'platform_settings.payment_environment',
    false,
    'skipped',
    'production',
    'Unable to verify persisted runtime environment without Supabase service credentials',
  );
} else if (platformCheckError) {
  addCheck(
    'platform_settings.payment_environment',
    false,
    `error: ${platformCheckError}`,
    'production',
    'Fix DB access before go-live',
  );
} else {
  addCheck(
    'platform_settings.payment_environment is production',
    platformPaymentEnvironment === 'production',
    platformPaymentEnvironment || '(unset)',
    'production',
  );
}

const passCount = checks.filter((c) => c.pass).length;
const failCount = checks.length - passCount;

console.log('\\nACH Go-Live Audit');
console.log('=================');
console.log(`Mode: ${strictMode ? 'strict' : 'report-only'}`);
console.log(`Checks: ${checks.length}, Passed: ${passCount}, Failed: ${failCount}\\n`);

for (const check of checks) {
  const status = check.pass ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${check.name}`);
  console.log(`       value:    ${check.value}`);
  console.log(`       expected: ${check.expected}`);
  if (check.notes) {
    console.log(`       notes:    ${check.notes}`);
  }
}

const readyForLiveAchRecurring = failCount === 0;
console.log('');
console.log(`ACH recurring live readiness: ${readyForLiveAchRecurring ? 'READY' : 'NOT READY'}`);

if (!readyForLiveAchRecurring) {
  console.log('Action: resolve FAIL checks before enabling live ACH recurring.');
}

if (strictMode && !readyForLiveAchRecurring) {
  process.exit(1);
}
