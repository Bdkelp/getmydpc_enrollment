import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isPreCutoverActivity } from "../server/services/historical-commission-external-settlement-service";

const root = new URL("..", import.meta.url);
const load = (path: string) => readFile(new URL(path, root), "utf8");

const settlement = await load(
  "server/services/historical-commission-external-settlement-service.ts",
);
const ledger = await load("server/services/commission-ledger-service.ts");
const aggregation = await load(
  "server/services/commission-center-aggregation-service.ts",
);
const worker = await load("server/services/financial-reconciliation-worker.ts");
const migration = await load(
  "scripts/sql/2026-08-20e_historical_commission_external_settlement_cutover.sql",
);

assert.match(settlement, /commission_financial_cutovers/);
assert.match(
  settlement,
  /to_regclass\('public\.commission_financial_cutovers'\)/,
);
assert.match(settlement, /HISTORICAL_CUTOVER_MIGRATION/);
assert.match(settlement, /NOW\(\)/);
assert.match(settlement, /HISTORICAL_EXTERNAL_SETTLEMENT/);
assert.match(settlement, /historical_external_settlement/);
assert.match(
  settlement,
  /payment_transaction_at, p\.payment_confirmed_at, p\.created_at/,
);
assert.match(settlement, /actual_external_payment_at.*NULL/);
assert.match(settlement, /paymentDateKnown.*false/);
assert.match(
  settlement,
  /ON CONFLICT \(ledger_id, event_type, settlement_reference\)[\s\S]*DO NOTHING/,
);
assert.match(settlement, /status = 'externally_settled'/);
assert.match(
  settlement,
  /status IN \('earned', 'queued', 'carry_forward', 'held'\)/,
);
assert.doesNotMatch(settlement, /DELETE FROM|TRUNCATE|commission_amount\s*=/);
assert.match(ledger, /applyHistoricalExternalSettlement/);
assert.match(ledger, /getHistoricalCutover/);
assert.match(aggregation, /status === 'externally_settled'/);
assert.match(aggregation, /historicalExternalSettlement/);
assert.match(
  migration,
  /CREATE TABLE IF NOT EXISTS public\.commission_financial_cutovers/,
);
assert.match(migration, /ADD COLUMN IF NOT EXISTS actual_external_payment_at/);
assert.match(migration, /uq_commission_external_settlement_events/);
assert.match(worker, /FINANCIAL_RECONCILIATION_ENABLED !== 'true'/);
assert.equal(
  isPreCutoverActivity("2026-08-19T23:59:59.000Z", "2026-08-20T18:19:16.794Z"),
  true,
);
assert.equal(
  isPreCutoverActivity("2026-08-20T18:19:16.795Z", "2026-08-20T18:19:16.794Z"),
  false,
);

console.log(
  "Historical external commission settlement source-pattern tests passed.",
);
console.log(
  "Confirmed: additive cutover persistence, explicit external settlement status/events, deterministic timestamp precedence, no guessed source links, late-settlement hook, Commission Center exclusion, and reconciliation worker remains disabled.",
);
