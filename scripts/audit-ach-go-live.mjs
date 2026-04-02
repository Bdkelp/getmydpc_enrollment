#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const cwd = process.cwd();
const defaultEnvPath = path.join(cwd, '.env');
const strictMode = process.argv.includes('--strict');
const envFileArg = process.argv.find((arg) => arg.startsWith('--env-file='));
const explicitEnvPath = envFileArg ? envFileArg.slice('--env-file='.length).trim() : '';
const shouldSkipEnvFile = process.argv.includes('--no-env-file');
const envPath = shouldSkipEnvFile
  ? null
  : (explicitEnvPath ? path.resolve(cwd, explicitEnvPath) : defaultEnvPath);
let loadedEnvFile = null;

if (envPath && fs.existsSync(envPath)) {
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
  loadedEnvFile = envPath;
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
const addCheck = (name, pass, value, expected, notes = '', severity = 'required') => {
  checks.push({ name, pass: !!pass, value, expected, notes, severity });
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

const runtimeEnvironment = platformPaymentEnvironment || epxEnvironment || 'production';
const runtimeSuffix = runtimeEnvironment === 'production' ? 'PRODUCTION' : 'SANDBOX';

const resolveScoped = (baseKey) => {
  const scopedValue = normalize(process.env[`${baseKey}_${runtimeSuffix}`]);
  if (scopedValue) {
    return { value: scopedValue, source: `${baseKey}_${runtimeSuffix}` };
  }

  const fallback = normalize(process.env[baseKey]);
  if (fallback) {
    return { value: fallback, source: baseKey };
  }

  return { value: '', source: '(missing)' };
};

const resolvedPublicKey = resolveScoped('EPX_PUBLIC_KEY');
const resolvedTerminalProfileId = resolveScoped('EPX_TERMINAL_PROFILE_ID');
const resolvedCustNbr = resolveScoped('EPX_CUST_NBR');
const resolvedDbaNbr = resolveScoped('EPX_DBA_NBR');
const resolvedMerchNbr = resolveScoped('EPX_MERCH_NBR');
const resolvedTerminalNbr = resolveScoped('EPX_TERMINAL_NBR');
const resolvedMac = resolveScoped('EPX_MAC');

addCheck(
  'EPX runtime environment aligns (warning only)',
  !platformPaymentEnvironment || platformPaymentEnvironment === epxEnvironment || !epxEnvironment,
  `platform=${platformPaymentEnvironment || '(unknown)'}, EPX_ENVIRONMENT=${epxEnvironment || '(empty)'}`,
  'both production (or EPX_ENVIRONMENT omitted)',
  'platform_settings.payment_environment is treated as authoritative runtime source',
  'warning',
);

addCheck(
  'PAYMENT_PROVIDER is not mock (warning only)',
  paymentProvider !== 'mock',
  paymentProvider || '(empty)',
  'non-mock provider for live charges',
  'local .env may still be mock while hosted production uses different env vars',
  'warning',
);

addCheck('BILLING_SCHEDULER_ENABLED', schedulerEnabled, String(schedulerEnabled), 'true');
addCheck('BILLING_SCHEDULER_DRY_RUN disabled', schedulerDryRun === false, String(schedulerDryRun), 'false');
addCheck('ACH_RECURRING_ENABLED', achRecurringEnabled, String(achRecurringEnabled), 'true');
addCheck('ACH_RECURRING_ALLOW_PRODUCTION', achRecurringAllowProduction, String(achRecurringAllowProduction), 'true');

addCheck(
  `EPX_PUBLIC_KEY resolved for ${runtimeEnvironment}`,
  !!resolvedPublicKey.value,
  resolvedPublicKey.value ? `set via ${resolvedPublicKey.source}` : 'missing',
  'set',
);
addCheck(
  `EPX_TERMINAL_PROFILE_ID resolved for ${runtimeEnvironment}`,
  !!resolvedTerminalProfileId.value,
  resolvedTerminalProfileId.value ? `set via ${resolvedTerminalProfileId.source}` : 'missing',
  'set',
);
addCheck(
  `EPX_CUST_NBR resolved for ${runtimeEnvironment}`,
  !!resolvedCustNbr.value,
  resolvedCustNbr.value ? `set via ${resolvedCustNbr.source}` : 'missing',
  'set',
);
addCheck(
  `EPX_DBA_NBR resolved for ${runtimeEnvironment}`,
  !!resolvedDbaNbr.value,
  resolvedDbaNbr.value ? `set via ${resolvedDbaNbr.source}` : 'missing',
  'set',
);
addCheck(
  `EPX_MERCH_NBR resolved for ${runtimeEnvironment}`,
  !!resolvedMerchNbr.value,
  resolvedMerchNbr.value ? `set via ${resolvedMerchNbr.source}` : 'missing',
  'set',
);
addCheck(
  `EPX_TERMINAL_NBR resolved for ${runtimeEnvironment}`,
  !!resolvedTerminalNbr.value,
  resolvedTerminalNbr.value ? `set via ${resolvedTerminalNbr.source}` : 'missing',
  'set',
);
addCheck(
  `EPX_MAC resolved for ${runtimeEnvironment}`,
  !!resolvedMac.value,
  resolvedMac.value ? `set via ${resolvedMac.source}` : 'missing',
  'set',
);

const requiredChecks = checks.filter((c) => c.severity !== 'warning');
const warningChecks = checks.filter((c) => c.severity === 'warning');
const passCount = checks.filter((c) => c.pass).length;
const failCount = checks.length - passCount;
const requiredFailCount = requiredChecks.filter((c) => !c.pass).length;
const warningFailCount = warningChecks.filter((c) => !c.pass).length;

console.log('\\nACH Go-Live Audit');
console.log('=================');
console.log(`Mode: ${strictMode ? 'strict' : 'report-only'}`);
console.log(`Runtime environment target: ${runtimeEnvironment}`);
console.log(`Env file loaded: ${loadedEnvFile || '(none)'}`);
console.log(`Checks: ${checks.length}, Passed: ${passCount}, Failed: ${failCount}`);
console.log(`Required failures: ${requiredFailCount}, Warnings: ${warningFailCount}\n`);

for (const check of checks) {
  const status = check.pass ? 'PASS' : (check.severity === 'warning' ? 'WARN' : 'FAIL');
  const badge = check.severity === 'warning' ? '[warning]' : '[required]';
  console.log(`[${status}] ${check.name} ${badge}`);
  console.log(`       value:    ${check.value}`);
  console.log(`       expected: ${check.expected}`);
  if (check.notes) {
    console.log(`       notes:    ${check.notes}`);
  }
}

const readyForLiveAchRecurring = requiredFailCount === 0;
console.log('');
console.log(`ACH recurring live readiness: ${readyForLiveAchRecurring ? 'READY' : 'NOT READY'}`);

if (!readyForLiveAchRecurring) {
  console.log('Action: resolve FAIL checks before enabling live ACH recurring.');
}

if (strictMode && !readyForLiveAchRecurring) {
  process.exit(1);
}
