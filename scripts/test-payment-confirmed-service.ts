/**
 * PaymentConfirmedService — Phase 1 automated tests.
 *
 * This repository has no Jest/vitest/test-database harness (see other
 * scripts/test-*.ts files for the established convention: node:assert +
 * source-pattern checks, run directly with tsx). These tests follow that
 * same convention:
 *
 *   1. Pure-function tests for the deterministic idempotency-key builder and
 *      the canonical payment-status helper (no DB required).
 *   2. Source-pattern assertions proving each of the five target routes now
 *      calls the shared PaymentConfirmedService instead of independently
 *      orchestrating commission creation, and that the two legacy repair
 *      routes no longer fabricate direct-only commissions.
 *
 * Full end-to-end integration tests (Test A–H in the Phase 1 spec — actually
 * hitting a database, simulating concurrent requests, etc.) require a live
 * Postgres instance and are NOT runnable in this environment. They are
 * listed as a Phase 1 gap in docs/PAYMENT_CONFIRMED_SERVICE_PHASE1_REPORT.md
 * with the exact scenarios that still need to be executed against a real
 * (staging) database before this ships to production.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// commission-generation-service.ts transitively imports server/lib/supabaseClient.ts
// and server/lib/neonDb.ts, both of which throw at *module load time* if their
// required env vars are absent. This test only exercises pure, side-effect-free
// functions (no network calls), so we provide harmless placeholder credentials
// purely to satisfy those modules' startup checks, then dynamically import
// after setting them (static imports are hoisted before top-level code runs).
process.env.SUPABASE_URL ||= "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||=
  "eyJhbGciOiJIUzI1NiJ9." +
  Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url") +
  ".placeholder-signature";
process.env.DATABASE_URL ||= "postgres://placeholder:placeholder@localhost:5432/placeholder";

const { buildCommissionEventKey } = await import(
  "../server/services/commission-generation-service"
);
const {
  isSuccessfulPaymentStatus,
  isFailedPaymentStatus,
  isPendingPaymentStatus,
  isPaymentConfirmationSource,
  PAYMENT_CONFIRMATION_SOURCES,
} = await import("../server/utils/payment-status");

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

// ---------------------------------------------------------------------------
// Canonical payment-status helper
// ---------------------------------------------------------------------------
assert.equal(isSuccessfulPaymentStatus("succeeded"), true);
assert.equal(isSuccessfulPaymentStatus("success"), true);
assert.equal(isSuccessfulPaymentStatus("completed"), true);
assert.equal(isSuccessfulPaymentStatus("Succeeded"), true, "must be case-insensitive");
assert.equal(isSuccessfulPaymentStatus("  succeeded  "), true, "must trim whitespace");
assert.equal(isSuccessfulPaymentStatus("pending"), false);
assert.equal(isSuccessfulPaymentStatus("failed"), false);
assert.equal(isSuccessfulPaymentStatus(null), false);
assert.equal(isSuccessfulPaymentStatus(undefined), false);

assert.equal(isFailedPaymentStatus("failed"), true);
assert.equal(isFailedPaymentStatus("declined"), true);
assert.equal(isFailedPaymentStatus("succeeded"), false);

assert.equal(isPendingPaymentStatus("pending"), true);
assert.equal(isPendingPaymentStatus("processing"), true);
assert.equal(isPendingPaymentStatus("succeeded"), false);

for (const source of PAYMENT_CONFIRMATION_SOURCES) {
  assert.equal(isPaymentConfirmationSource(source), true);
}
assert.equal(isPaymentConfirmationSource("made_up_source"), false);
assert.equal(isPaymentConfirmationSource(""), false);

console.log("✅ payment-status helper tests passed");

// ---------------------------------------------------------------------------
// Deterministic commission idempotency key
// ---------------------------------------------------------------------------

// Test B / Test C basis: identical inputs must always produce the identical
// key, so a database unique index can reject a second identical entitlement.
const keyA = buildCommissionEventKey({
  sourcePaymentId: 42,
  finalRecipientAgentId: "agent-1",
  commissionType: "direct",
  overrideForAgentId: null,
  finalPaidLevel: 0,
});
const keyARepeat = buildCommissionEventKey({
  sourcePaymentId: 42,
  finalRecipientAgentId: "agent-1",
  commissionType: "direct",
  overrideForAgentId: null,
  finalPaidLevel: 0,
});
assert.equal(keyA, keyARepeat, "identical allocation must produce identical key");
assert.ok(keyA && keyA.includes("payment:42"), "key must reference the source payment");

// Different override levels from the SAME payment must be allowed (L1/L2/L3
// are distinct entitlements) — Phase 1 requirement §7.
const keyL1 = buildCommissionEventKey({
  sourcePaymentId: 42,
  finalRecipientAgentId: "agent-2",
  commissionType: "override",
  overrideForAgentId: "agent-1",
  finalPaidLevel: 1,
});
const keyL2 = buildCommissionEventKey({
  sourcePaymentId: 42,
  finalRecipientAgentId: "agent-3",
  commissionType: "override",
  overrideForAgentId: "agent-1",
  finalPaidLevel: 2,
});
assert.notEqual(keyL1, keyL2, "different override levels must produce different keys");
assert.notEqual(keyA, keyL1, "direct commission and override must produce different keys");

// A recurring payment (different sourcePaymentId) for the same agent/type
// must be allowed to generate a new, distinct entitlement.
const keyRecurringMonth2 = buildCommissionEventKey({
  sourcePaymentId: 99,
  finalRecipientAgentId: "agent-1",
  commissionType: "direct",
  overrideForAgentId: null,
  finalPaidLevel: 0,
});
assert.notEqual(
  keyA,
  keyRecurringMonth2,
  "a different source payment (e.g. a later recurring charge) must produce a different key",
);

// No source payment id => no key (never fabricate an idempotency guarantee
// for a relationship that cannot be proven).
assert.equal(
  buildCommissionEventKey({
    sourcePaymentId: null,
    finalRecipientAgentId: "agent-1",
    commissionType: "direct",
    overrideForAgentId: null,
    finalPaidLevel: 0,
  }),
  null,
);
assert.equal(
  buildCommissionEventKey({
    sourcePaymentId: undefined,
    finalRecipientAgentId: "agent-1",
    commissionType: "direct",
    overrideForAgentId: null,
    finalPaidLevel: 0,
  }),
  null,
);

console.log("✅ commission idempotency key tests passed");

// ---------------------------------------------------------------------------
// Source-pattern assertions: every confirmation trigger must call the
// shared PaymentConfirmedService, and the legacy bypass routes must no
// longer fabricate direct-only commissions.
// ---------------------------------------------------------------------------
const epxRoutesSource = readSource("server/routes/epx-hosted-routes.ts");

assert.match(
  epxRoutesSource,
  /import \{ processConfirmedPayment \} from "\.\.\/services\/payment-confirmed-service";/,
  "epx-hosted-routes.ts must import the shared PaymentConfirmedService",
);

// Test D/E basis: the EPX callback and browser-complete handlers must each
// call processConfirmedPayment exactly through the shared entry point
// (confirmationSource literals prove which trigger calls which).
assert.match(
  epxRoutesSource,
  /confirmationSource:\s*"epx_callback"/,
  "EPX server callback must confirm via confirmationSource=epx_callback",
);
assert.match(
  epxRoutesSource,
  /confirmationSource:\s*"epx_browser_complete"/,
  "EPX browser-complete handler must confirm via confirmationSource=epx_browser_complete",
);
assert.match(
  epxRoutesSource,
  /confirmationSource:\s*"manual_admin"/,
  "Manual admin verification must confirm via confirmationSource=manual_admin",
);

// The old direct-only commission algorithm must no longer be reachable from
// the two legacy routes — they must either call processConfirmedPayment or
// refuse to fabricate a commission when no successful payment exists.
const legacyCreateCommissionRouteMatch = epxRoutesSource.match(
  /router\.post\(\s*"\/api\/admin\/members\/:id\/create-commission",[\s\S]*?\n\);\n/,
);
assert.ok(legacyCreateCommissionRouteMatch, "create-commission route must exist");
const legacyCreateCommissionRouteBody = legacyCreateCommissionRouteMatch![0];
assert.match(
  legacyCreateCommissionRouteBody,
  /processConfirmedPayment/,
  "create-commission route must delegate to PaymentConfirmedService",
);
assert.doesNotMatch(
  legacyCreateCommissionRouteBody,
  /calculateCommission\(/,
  "create-commission route must no longer run its own direct-only commission calculation",
);
assert.match(
  legacyCreateCommissionRouteBody,
  /isSuccessfulPaymentStatus\(sourcePayment\.status\)/,
  "create-commission route must require a genuinely successful source payment before confirming",
);

const legacyRepairRouteMatch = epxRoutesSource.match(
  /router\.post\(\s*"\/api\/admin\/commissions\/repair",[\s\S]*?\nexport default router;/,
);
assert.ok(legacyRepairRouteMatch, "commissions/repair route must exist");
const legacyRepairRouteBody = legacyRepairRouteMatch![0];
assert.match(
  legacyRepairRouteBody,
  /processConfirmedPayment/,
  "commissions/repair route must delegate to PaymentConfirmedService",
);
assert.doesNotMatch(
  legacyRepairRouteBody,
  /calculateCommission\(/,
  "commissions/repair route must no longer run its own direct-only commission calculation",
);
assert.match(
  legacyRepairRouteBody,
  /unresolvedMembers/,
  "commissions/repair route must report members with no provable successful payment instead of fabricating a commission",
);

console.log("✅ route delegation source-pattern tests passed");

// ---------------------------------------------------------------------------
// Enrollment-only must still never generate commission (unchanged Phase 1
// invariant — Test J). This dead-code guard predates Phase 1; we assert it
// remains disabled so a future edit cannot silently re-enable it.
// ---------------------------------------------------------------------------
const routesSource = readSource("server/routes.ts");
assert.match(
  routesSource,
  /Commission creation is deferred until payment callback confirms activation\./,
  "registration endpoint must still defer commission creation to payment confirmation",
);
assert.match(
  routesSource,
  /if \(\s*false &&/,
  "registration endpoint's inline commission-creation block must remain disabled",
);

console.log("✅ enrollment-does-not-create-commission guard test passed");

// ---------------------------------------------------------------------------
// Migration safety: unique index must be guarded by a duplicate check.
// ---------------------------------------------------------------------------
const migrationSource = readSource(
  "scripts/sql/2026-08-19_payment_confirmed_service_phase1.sql",
);
assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS payment_transaction_at/);
assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS payment_confirmed_at/);
assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS platform_verified_at/);
assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS verification_method/);
assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS verified_by_user_id/);
assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS source_payment_id/);
assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS commission_event_key/);
assert.match(
  migrationSource,
  /HAVING COUNT\(\*\) > 1/,
  "migration must check for existing duplicate keys before creating the unique index",
);
assert.match(
  migrationSource,
  /CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_commissions_commission_event_key/,
  "migration must create the database-enforced idempotency index",
);

console.log("✅ migration safety source tests passed");

console.log(
  "\nAll Phase 1 static/logic tests passed. NOTE: Tests A, B, C, D, E, F, G, H, I, J from the Phase 1 spec that require a live database (actual payment/member rows, concurrent request simulation) are NOT executed by this script — see docs/PAYMENT_CONFIRMED_SERVICE_PHASE1_REPORT.md for the required staging-environment test plan.",
);
