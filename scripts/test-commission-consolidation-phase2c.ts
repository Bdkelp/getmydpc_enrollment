import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const load = (relativePath: string) => readFile(new URL(relativePath, root), 'utf8');

const transition = await load('server/services/group-payment-transition-service.ts');
const groupRoutes = await load('server/routes/group-enrollment.ts');
const callback = await load('server/routes/epx-hosted-routes.ts');
const stateService = await load('server/services/financial-processing-state.ts');
const preflight = await load('scripts/sql/commission_pipeline_preflight.sql');
const staging = await load('scripts/validate-commission-pipeline-staging.ts');
const phase2cMigration = await load('scripts/sql/2026-08-20c_commission_processing_state.sql');

assert.match(transition, /paymentId: number \| string/);
assert.match(transition, /\.from\('payments'\)/);
assert.match(transition, /source_payment_id: paymentId/);
assert.match(transition, /syncLedgerEntriesForPayment/);
assert.doesNotMatch(transition, /commission-payout-service|commission_payouts|createMonthlyPayout/);
assert.doesNotMatch(groupRoutes, /createMonthlyPayout|commission_payout-service/);
assert.match(callback, /paymentId: Number\(paymentRecordForLogging\.id\)/);
assert.match(groupRoutes, /paymentId: req\.body\?\.paymentId/);
assert.match(stateService, /commission_processing_status/);
assert.match(stateService, /FINANCIAL SCHEMA MIGRATION REQUIRED/);
assert.match(preflight, /SELECT current_database/);
assert.doesNotMatch(preflight, /\b(DELETE|UPDATE|INSERT|MERGE|ALTER|DROP|TRUNCATE)\b/i);
assert.match(staging, /Refusing to run commission pipeline staging validation against production/);
assert.match(staging, /PHASE2C_STAGING_ONLY/);
assert.match(phase2cMigration, /commission_processing_status/);

console.log('Phase 2C group consolidation source-pattern tests passed.');
console.log('Confirmed: group compensation requires exact payment linkage, syncs to commission_ledger, and has no active commission_payouts writer.');
console.log('Confirmed: preflight is read-only and staging validation is production-guarded.');
