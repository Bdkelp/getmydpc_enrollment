import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function run() {
  const indexSource = read('server/index.ts');
  const schedulerSource = read('server/services/recurring-billing-scheduler.ts');
  const storageSource = read('server/storage.ts');

  // Scheduler must be initialized from server startup.
  assert.match(indexSource, /scheduleRecurringBilling\(\);/, 'scheduleRecurringBilling() is not invoked at server startup');

  // Card recurring must always be considered in the due-subscription query.
  assert.match(
    storageSource,
    /const supportedPaymentMethodTypes = includeACH \? \['CreditCard', 'ACH'\] : \['CreditCard'\];/,
    'Card-only fallback query for recurring billing is missing',
  );

  // ACH must be hard-gated by sandbox runtime in scheduler.
  assert.match(
    schedulerSource,
    /const achEnabled = isAchRuntimeEnabled\(achEnabledByFlag, currentPaymentEnvironment\);/,
    'ACH runtime gating is missing from scheduler',
  );
  assert.match(
    schedulerSource,
    /if \(methodType === 'ACH' && !achEnabled\)/,
    'ACH skip guard is missing when ACH runtime is disabled',
  );

  // Recurring processing should normalize and handle card method type.
  assert.match(
    schedulerSource,
    /normalizePaymentMethodType\(sub\.paymentMethodType\)/,
    'Payment method normalization is missing in processSubscription',
  );
  assert.match(
    schedulerSource,
    /if \(normalized === 'CREDITCARD'\) return 'CreditCard';/,
    'CreditCard normalization path is missing',
  );

  console.log('[Scheduler Smoke Test] PASS');
  console.log('- Startup wiring verified');
  console.log('- Card recurring query path verified');
  console.log('- ACH sandbox gating verified');
  console.log('- Method normalization path verified');
}

try {
  run();
} catch (error) {
  console.error('[Scheduler Smoke Test] FAIL');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
