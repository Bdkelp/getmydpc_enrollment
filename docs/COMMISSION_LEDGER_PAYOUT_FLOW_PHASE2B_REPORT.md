# Commission Ledger & Payout Flow Consolidation — Phase 2B Report

**Scope:** Make `commission_ledger`/`commission_payout_batches` consistently
apply the Phase 2A payout-date rules, with writing commissions and overrides
routed through genuinely separate cycles, correct carry-forward across
cycles, automatic (no-manual-step) ledger population, and direct
payment-to-ledger traceability. EPX, commission dollar amounts, and override
rates are unchanged.

---

## 1. Executive Summary

Phase 2A built one correct date-math engine but Phase 2A's own report
documented that the *ledger* itself still routed every compensation type
(writing commissions **and** overrides) through the same semi-monthly
1st/15th batch-classification function, and that a carried-forward balance
had no mechanism to roll into the *next* cycle once its original batch was
paid. Phase 2B fixes both of these structurally, adds automatic
`agent_commissions` → `commission_ledger` sync (removing the "admin must
remember to run a sync" gap), propagates Phase 1's `source_payment_id`
traceability into the ledger, and resolves one real group-commission
effective-date bug. The legacy `commission_payouts` table is formally
decided as a **frozen, group-only compatibility path** — not extended, not
used for any new individual compensation, not deleted.

---

## 2. Files Changed

### New
| File | Purpose |
|---|---|
| [scripts/sql/2026-08-20b_commission_ledger_payout_flow_phase2b.sql](../scripts/sql/2026-08-20b_commission_ledger_payout_flow_phase2b.sql) | Additive migration: `commission_ledger.compensation_type`, `commission_ledger.current_cycle_anchor_date`, `commission_payout_batches.compensation_type`. |
| [scripts/test-commission-ledger-payout-flow.ts](../scripts/test-commission-ledger-payout-flow.ts) | Automated tests (§14/§15 below). |

### Modified
| File | Change |
|---|---|
| [server/services/commission-ledger-service.ts](../server/services/commission-ledger-service.ts) | Cycle classification now branches explicitly by compensation type; new `advanceCycleAnchor()` carry-forward routing; `syncCommissionLedgerFromFeed()` branches period generation (semi-monthly vs monthly) and persists `compensation_type`/`source_payment_id`; new `syncLedgerEntriesForPayment()` automatic-sync entry point; `BatchType` renamed `1st-cycle`/`15th-cycle` → `writing_1st`/`writing_15th`, new `override_monthly`; schema-fallback retries added for environments where the Phase 2B migration hasn't run yet. |
| [server/services/payment-confirmed-service.ts](../server/services/payment-confirmed-service.ts) | Calls `syncLedgerEntriesForPayment()` immediately after commission creation — automatic ledger population, no manual admin step. |
| [server/services/group-payment-transition-service.ts](../server/services/group-payment-transition-service.ts) | `transitionGroupPaymentToPayable()` now resolves the group's actual cycle effective date (`groupBillingLifecycle.expectedCycleDate` / `billingScheduler.scheduledStartDate`) for writing-commission scheduling instead of the real-time payment-capture moment; falls back to payment-capture time **with a logged FLAG FOR REVIEW warning** only when no cycle date is recorded — never silently. |
| [server/storage.ts](../server/storage.ts) (`getAllCommissionsNew`) | Adds `commissionType`, `overrideForAgentId`, `sourcePaymentId` to the shared commission-feed formatter (additive fields, existing consumers unaffected); group commissions now resolve `effectiveDate` from the group's own billing-cycle metadata instead of `created_at`, with an additive `effectiveDateUnresolved` flag (and a warning log) when no group cycle date can be found — never guessed from payment time. |
| [package.json](../package.json) | Added `test:commission-ledger-payout-flow` script. |

`commission_ledger`, `commission_ledger_events`, and
`commission_payout_batches` table structures are otherwise unchanged (only
additive columns). No EPX file was touched. No commission dollar-amount or
override-rate calculation was touched.

---

## 3. Existing Ledger Architecture (confirmed)

```
agent_commissions (WP-03 entitlement record: commission_type 'direct'|'override', source_payment_id)
        │  admin sync (manual, historically) / automatic (Phase 2B, new)
        ▼
commission_ledger (payout lifecycle record: status, commission_period_*, payout_batch_id)
        │  buildDraftPayoutBatches()
        ▼
commission_payout_batches (batch_type, cutoff_date, scheduled_pay_date, status)
        │  prepareBatchForExport() → markBatchAsPaid()
        ▼
commission_ledger_events (append-only audit trail of every status transition)
```

This structure was sound and is preserved. The problems were: (a) both
compensation types shared one cycle-classification function, (b) carried
rows never re-entered a future cycle, (c) the ledger sync step was manual,
(d) `source_payment_id` existed on the ledger table (added in Phase 1) but
was never populated.

---

## 4. Writing Cycle Implementation

`getCycleAnchorForEntry(commissionPeriodEnd, 'writing')` — unchanged
semi-monthly logic from Phase 2A, now explicit about which compensation
type it serves. `getWritingCommissionPayDate()` (Phase 2A, unmodified) still
computes the actual pay date. `syncCommissionLedgerFromFeed()` continues to
split a writing commission's activity into 1st–15th / 16th–end periods via
the pre-existing `getRecurringPeriods()` (unchanged behavior for writing
rows).

## 5. Override Cycle Implementation

- New `getMonthlyRecurringPeriods()` / `normalizeMonthlyPeriodFromDate()`:
  override commissions are now synced with **one period per calendar month**
  (start = 1st, end = last day) instead of being split into semi-monthly
  chunks like writing commissions.
- `getCycleAnchorForEntry(commissionPeriodEnd, 'override')` always returns
  `batchType: 'override_monthly'`, anchor = 1st of the month *after* the
  earned month — matching `getOverridePayDate()`'s definition exactly.
- Verified by test: August/September/December 2026 earning periods each
  classify as `override_monthly` and **never** as `writing_1st`/`writing_15th`,
  and schedule to `09/04/2026` / `10/02/2026` / `01/04/2027` respectively.

## 6. Group Effective-Date Fix

Confirmed (Phase 2A had flagged this): `group-payment-transition-service.ts`
was passing the real-time payment-capture timestamp into the writing-commission
date wrapper. Fixed: it now reads
`group.metadata.groupBillingLifecycle.expectedCycleDate` (falling back to
`billingScheduler.scheduledStartDate`) — the same authoritative,
1st/15th-normalized cycle date the group lifecycle already tracks elsewhere
(`createExpectedGroupMemberCommissionsForCycle` in `group-enrollment.ts` was
already using the correct cycle-anchor parameter and did not need a fix). If
no cycle date is recorded, the code logs an explicit `console.warn(...FLAG
FOR REVIEW...)` and falls back to payment-capture time rather than throwing
or silently guessing — no destructive behavior change, but the gap is now
visible in logs instead of hidden.

The `getAllCommissionsNew` admin-report feed builder (used by the ledger
sync) had the same class of bug for **group** rows specifically
(`effectiveDate: commission.created_at`) — fixed the same way, reading the
group's `metadata.groupBillingLifecycle.expectedCycleDate`, with a new
additive `effectiveDateUnresolved: true` flag (and a warning log) on any row
where it cannot be resolved, per the explicit "flag for review, do not
guess" instruction.

## 7. Threshold Implementation

Unchanged mechanics (`MIN_AGENT_PAYOUT_THRESHOLD = 25`,
`shouldCarryForwardAgent()`), now verified to apply correctly to **both**
compensation types independently because writing and override rows are
grouped into **separate batches** (different `batch_type` + `cutoff_date`
keys) before the existing per-`(batch, agent)` threshold evaluation runs.
Fixing cycle classification (§4/§5) was sufficient to make the pre-existing
threshold code correctly isolate writing vs. override balances — no changes
were needed to the threshold math itself. Verified by test:
`shouldCarryForwardAgent(24.99) === true`, `(25.00) === false`,
`isWritingBalancePayable`/`isOverrideBalancePayable` evaluated independently
so `$20` writing + `$10` override never becomes a payable `$30`.

## 8. Carry-Forward Implementation

**This was the deepest real bug found.** Previously, once a ledger row was
marked `carry_forward` and attached to a batch, it could only ever be
detached (via `markBatchAsPaid`'s non-payable-row cleanup) back to
`payout_batch_id = NULL` — at which point `buildDraftPayoutBatches` would
recompute its cycle from `getCycleAnchorForEntry(commission_period_end)`,
which is a **fixed, historical** value. The row would be re-assigned to its
own **original** (already-closed) cycle forever, never actually advancing
into the next cycle where the business rule says it should be reconsidered
alongside newer earnings.

**Fix:** new `advanceCycleAnchor(previousAnchor, compensationType)` +
`current_cycle_anchor_date` column (nullable, additive). When
`buildDraftPayoutBatches` finds a row already in `carry_forward` status
(i.e. being reconsidered after a prior cycle), it advances the row's anchor
exactly one cycle step forward (writing: 1st→15th→next month's 1st;
override: month→next month) instead of recomputing from
`commission_period_end`. A fresh (`status: 'earned'`, never batched) row is
unaffected — it still uses its natural earned-period cycle.

Verified by test that this produces exactly the two worked examples from
the spec:
- Writing: a row originally anchored to the March 1st-cycle, once carried
  forward, advances to the **same** batch key as a fresh row naturally
  earned on March 15 (`$15` carry + `$20` new → one March-15 batch, `$35`
  payable).
- Override: a row originally anchored to August's cycle, once carried
  forward, advances to the **same** batch key as a fresh row naturally
  earned in September (`$12` carry + `$18` new → one batch, paid on the
  October cycle, `$30` payable).

The underlying rows are never merged or overwritten — `current_cycle_anchor_date`
is purely a routing pointer; `commission_period_start/end`, `effective_date`,
and `commission_amount` are untouched, and every status transition
continues to be recorded in `commission_ledger_events`.

## 9. Legacy `commission_payouts` Decision

**Decision: mixed — Option A for individual compensation (already true since
Phase 1), Option B (frozen compatibility path) for group compensation.**

- Individual compensation has flowed exclusively through
  `agent_commissions` → `commission_ledger` since Phase 1
  (`PaymentConfirmedService`); `commission_payouts` has had zero new
  individual-compensation writers since then. No change needed here.
- Group compensation's active caller,
  `group-payment-transition-service.ts`'s `transitionGroupPaymentToPayable()`,
  still calls `commission-payout-service.ts`'s `createMonthlyPayout()` /
  `createPayoutsForMemberPayment()` to write `commission_payouts` rows. This
  is the **only** remaining active writer of that table.
- **Given no database access to validate a larger migration in this
  environment, group compensation was NOT moved onto `commission_ledger` in
  Phase 2B** — doing so without the ability to test against real group data
  would risk breaking live group commission payouts, which is explicitly
  disallowed ("do not maintain two independent payout engines" must be
  balanced against "do not redesign EPX" / non-destructive requirements).
  Instead: `commission_payouts`/`commission-payout-service.ts` is now
  formally documented as a **legacy, group-only compatibility path**. It
  already delegates its date math to the unified schedule service (via the
  Phase 2A `calculatePaymentEligibleDate` wrapper, now also receiving the
  corrected group effective date per §6). It does **not** independently
  calculate eligibility or apply the $25 threshold — this gap is
  **acknowledged, not fixed**, and is the top item deferred to Phase 3
  (§18 below).
- No historical `commission_payouts` rows were touched, deleted, or rewritten.

---

## 10. Automatic Ledger Sync Design

`PaymentConfirmedService` (`processConfirmedPayment`) now calls the new
`syncLedgerEntriesForPayment({ paymentId, memberId, effectiveDate })`
immediately after `createWp03CommissionsForSuccessfulPayment()` creates
`agent_commissions` rows for that payment. This:
- Queries only `agent_commissions WHERE source_payment_id = paymentId`
  (small, scoped — not a full historical resync).
- Builds a lightweight feed (agent/member names resolved directly, without
  touching the large `getAllCommissionsNew` admin-report formatter) and
  passes `commissionType`, `overrideForAgentId`, `sourcePaymentId` through.
- Calls the existing `syncCommissionLedgerFromFeed()` — idempotency is
  inherited unchanged from its pre-existing `source_commission_id` +
  period dedupe (`existingBySourcePeriod` / `incomingUnitPeriodSeen` Sets),
  so calling this twice for the same payment cannot create duplicate ledger
  rows.
- Failure is logged (`logEPX` warning) but does not roll back the payment
  confirmation itself — consistent with Phase 1's existing "payment state is
  durable even if downstream commission steps fail" design; a future
  reconciliation pass or the existing manual
  `/api/admin/commissions/ledger/sync` endpoint remains available as a
  backstop.

The admin no longer needs to remember to run a manual sync for any payment
that goes through `PaymentConfirmedService` (i.e. every individual
confirmation path: EPX callback, EPX browser complete, manual admin
verification, and the two now-repaired legacy routes).

---

## 11. Source-Payment Traceability

- `commission_ledger.source_payment_id` (added by the Phase 1 migration,
  never populated until now) is now written by both
  `syncCommissionLedgerFromFeed()` (from `item.sourcePaymentId`) and,
  transitively, `syncLedgerEntriesForPayment()`.
- Join path is now deterministic for all newly-synced activity:
  `commission_ledger.source_payment_id → payments.id` directly, **and**
  `commission_ledger.source_commission_id → agent_commissions.id →
  agent_commissions.source_payment_id → payments.id` as a secondary,
  redundant path. No date-proximity guessing is required going forward.
- Historical rows synced before Phase 2B keep `source_payment_id = NULL` —
  not backfilled, per "do not guess historical associations."

---

## 12. Batch Lifecycle

Reviewed current states (`draft → ready → exported → paid`) against the
spec's suggested `draft → ready → approved → exported/processing → paid`.

**Decision: no new states added.** `markBatchAsPaid()` already requires (and
records via `commission_ledger_events`) a mandatory QuickBooks reference,
a paid-at date, and a `confirmedBy` — i.e., every "who/when/amount/reference"
requirement for the paid transition is already satisfied by the existing
two-state gate (`exported` → `paid`). Adding a distinct `approved` state
would not close any actual gap found in this codebase, so per the explicit
"do not add states unnecessarily" instruction, none was added. This is
documented here as a considered decision, not an oversight.

`commission_payout_batches.compensation_type` (new, additive) lets the
database/reporting layer identify a batch's cycle directly, without parsing
`batch_type` strings or inferring from dates, per §5 of the spec.

## 13. Exception Handling

- `held`, `carry_forward`, `reversed` are preserved unchanged.
- **No new `review_required` ledger status was added.** The two "flag for
  review" scenarios in this phase (unresolvable group effective dates) are
  handled by *not inserting an ambiguous row* (an unresolved group
  commission is still synced using its best-available fallback, flagged via
  `effectiveDateUnresolved` + a warning log) rather than inventing a new
  ledger-row exception state — this avoids overloading the ledger's status
  enum for what is really a data-completeness signal, consistent with "do
  not overload unrelated statuses to represent exceptions."
- The existing admin below-threshold override (`adminOverrideCarryForwardForBatch`)
  was reviewed and found to already satisfy every requirement in §18: admin
  authorization is enforced at the route layer (unchanged, out of this
  file's scope), a non-empty `reason` is mandatory (validated synchronously,
  before any database call), and the release is recorded as an immutable
  `commission_ledger_events` row (`event_type:
  'manual_under_minimum_release'`) with actor id, reason, and full before/after
  amounts in `metadata`. No code change was needed here — tests were added
  to lock in this behavior (§14).

---

## 14. Automated Tests

`scripts/test-commission-ledger-payout-flow.ts`
(`npm run test:commission-ledger-payout-flow`) — pure-function tests, no
live database (see §16 for what remains DB-dependent):

- **Writing cycle classification (§19):** `04/01/2026`, `05/01/2026`,
  `06/15/2026` each classify as `writing_1st`/`writing_15th` and schedule to
  the correct unified-service pay date.
- **Override cycle classification (§20):** August/September/December 2026
  earning periods each classify as `override_monthly` — explicitly asserted
  `!== 'writing_1st'` and `!== 'writing_15th'` — and schedule correctly,
  including the December→January holiday case.
- **`compensationTypeOf` legacy default:** NULL/undefined → `'writing'`,
  never guessed as `'override'`.
- **Carry-forward across cycles (§9/§22):** the exact two worked examples
  (writing $15+$20=$35 on the March-15 cycle; override $12+$18=$30 payable
  on the October cycle) verified via `advanceCycleAnchor` landing on the
  identical batch key as a fresh row naturally earned in the next cycle.
- **Threshold + separate balances (§21):** `$24.99` carries, `$25.00` is
  payable, for both types independently; `$20` writing + `$10` override
  never combines into a payable `$30`.
- **Manual threshold-override validation (§18/§24):** empty `batchId`,
  empty reason, and whitespace-only reason are all rejected **before any
  database call** — proving the mandatory-reason guard is unconditional.

Plus [scripts/test-commission-payout-schedule-service.ts](../scripts/test-commission-payout-schedule-service.ts)
(Phase 2A) and [scripts/test-payment-confirmed-service.ts](../scripts/test-payment-confirmed-service.ts)
(Phase 1) re-run as regression checks.

## 15. Test Results

```
$ npm run test:commission-ledger-payout-flow
✅ Writing ledger cycle classification tests passed
✅ Override ledger cycle classification tests passed (never placed in writing batches)
✅ compensationTypeOf legacy-row default test passed
✅ Writing carry-forward advances into the correct next (15th) cycle — $15 + $20 = $35 scenario routes to one batch
✅ Override carry-forward advances into the correct next (September) cycle — $12 + $18 = $30 payable in October scenario routes to one batch
✅ Threshold + separate-balance tests passed
✅ Manual threshold-override validation guard tests passed (reason mandatory, no silent bypass)

All Phase 2B commission-ledger cycle-classification tests passed.
```
Regression: `test:commission-payout-schedule` (Phase 2A, 7/7 writing + 3/3
override + edge cases), `test:payment-confirmed-service` (Phase 1, all 5
groups), `test:scheduler`, `test:plan-start-dates` — all still pass
unchanged.

`npx tsc --noEmit`, filtered to every file touched in this phase, shows
**zero new type errors** — remaining matches are the same pre-existing
`TS2802` Set/Map-iteration pattern (27+ instances repo-wide, confirmed in
Phase 2A) plus two pre-existing, unrelated `storage.ts` errors verified via
`git diff --stat`/hunk ranges to be outside every line this phase touched.

### §19-§24 items NOT executed by this script (documented gap)
Actual row insertion into a live `commission_ledger` table, real batch
creation via `buildDraftPayoutBatches`, running the automatic sync twice
against a live database to confirm zero duplicate rows, and a live
concurrent-sync simulation all require a staging Postgres/Supabase
instance, which is not available in this environment. **Recommended before
production rollout:** execute both pending migrations (Phase 1, Phase 2A/B)
against a staging database, then run the full spec's §19-§24 scenarios
directly against real rows.

---

## 16. Migration Changes/Status

New migration this phase:
[scripts/sql/2026-08-20b_commission_ledger_payout_flow_phase2b.sql](../scripts/sql/2026-08-20b_commission_ledger_payout_flow_phase2b.sql)
— additive only (`commission_ledger.compensation_type`,
`commission_ledger.current_cycle_anchor_date`,
`commission_payout_batches.compensation_type`), all nullable, no
constraints added, safe to re-run.

**Migration review (§25):** no new unique/foreign-key constraints are
introduced in this phase, so there is nothing to check for pre-existing
duplicate/invalid data before applying it — this migration is purely
additive columns with no constraint risk.

**Required execution order for a real database deployment**, per §26 (none
of these have been run in this environment):
1. `scripts/sql/2026-08-19_payment_confirmed_service_phase1.sql`
2. `scripts/sql/2026-08-20_member_first_successful_payment_at.sql`
3. `scripts/sql/2026-08-20b_commission_ledger_payout_flow_phase2b.sql`

Order 1→2→3 is logical (chronological) but not strictly required by
foreign-key dependencies between these three files themselves; 2 and 3 do
not reference columns added by each other. All three must run before
`PaymentConfirmedService`'s automatic ledger sync and carry-forward routing
can rely on their columns existing — the application code includes
schema-fallback retries (insert-without-new-columns) so it will not hard-crash
against a database missing these columns, but `compensation_type`/
`source_payment_id`/`current_cycle_anchor_date` will simply not be recorded
until the migrations run.

```
CODE/MIGRATION PREPARED — DATABASE EXECUTION STILL REQUIRED
```

---

## 17. Historical-Data Concerns

- No historical `commission_ledger`, `commission_payout_batches`, or
  `commission_payouts` row was deleted, merged, or rewritten.
- Historical ledger rows keep `compensation_type = NULL` and are treated as
  `'writing'` by `compensationTypeOf()` — the only cycle that existed before
  Phase 2B — never reclassified or guessed as `'override'`.
- Historical rows keep `source_payment_id = NULL` and `current_cycle_anchor_date = NULL`
  — no speculative backfill was performed or attempted.
- The group-commission `effectiveDate` fix only changes what is computed for
  **newly synced** feed rows; it does not rewrite any already-persisted
  `commission_ledger.effective_date` value.

---

## 18. Remaining Risks

1. **Group compensation still uses the legacy `commission_payouts` table**
   with no $25 threshold/carry-forward enforcement — acknowledged, not
   fixed, due to inability to validate a larger migration without database
   access. This is the single largest remaining architectural risk.
2. **No live-database test coverage** for actual row insertion, batch
   creation, or concurrent-sync behavior (§14/§15's documented gap).
3. Cross-connection transaction gap from Phase 1 still applies: the
   automatic ledger sync call in `PaymentConfirmedService` happens outside
   the payments/members SQL transaction (Supabase REST client, separate
   connection) — if the process crashes between commission creation and
   ledger sync, the commission exists but is not yet ledger-synced; safe to
   retry (idempotent), but not atomic.
4. `getAllCommissionsNew`'s group `effectiveDateUnresolved` flag is
   currently only logged/surfaced on the feed object — no admin UI consumes
   it yet (Commission Center UI is explicitly out of scope for this phase).

## 19. Items Deferred to Phase 3

- Migrating group compensation onto `commission_ledger`/`commission_payout_batches`
  and retiring `commission_payouts` entirely (Option A for groups too).
- Adding $25 threshold/carry-forward enforcement to the legacy group payout
  path, if it is not retired first.
- EPX pending-success reconciliation scheduler.
- Agent Commission Center UI.
- Live-database execution of all three pending migrations and the full
  §19-§24 test matrix against real data.
- Surfacing `effectiveDateUnresolved` group commissions in an admin review
  queue/notification (currently log-only).

## 20. Final KEEP / RETIRE Matrix

| Component | Disposition |
|---|---|
| `commission_ledger` / `commission_ledger_events` / `commission_payout_batches` | **KEEP** — authoritative pipeline for all individual compensation; now correctly branches by compensation type with working carry-forward. |
| `agent_commissions` | **KEEP** — compensation entitlement/source record, unchanged. |
| `commission_payouts` / `commission-payout-service.ts` | **RETIRE for individual compensation (already true since Phase 1); KEEP as frozen, group-only compatibility path** — not extended, historical rows untouched, flagged for Phase 3 migration. |
| `calculatePaymentEligibleDate()` compatibility wrapper | **KEEP** — still the only writer-facing entry point for the legacy group path; now receives the corrected group effective date. |
| Old `1st-cycle`/`15th-cycle` `BatchType` naming | **RETIRED**, renamed to `writing_1st`/`writing_15th` — no production data existed under the old names (migrations not yet executed), so this is a zero-impact rename. |

---

## 21. Final Acceptance Check

| Check | Result |
|---|---|
| Writing ledger rows use membership/cycle effective date | **YES** for individual (unchanged, already correct); **YES, fixed this phase** for the group legacy path. |
| Writing payout dates come from unified schedule service | **YES** |
| Override rows use monthly arrears cycle | **YES** |
| Override rows are NOT placed in writing 1st/15th batches | **YES** — tested explicitly. |
| Writing holiday adjustment works at batch level | **YES** — via `getWritingCommissionPayDate` inside `buildDraftPayoutBatches`. |
| Override holiday adjustment works at batch level | **YES** — via `getOverridePayDate` inside `buildDraftPayoutBatches`. |
| $25 writing threshold enforced | **YES** |
| $25 override threshold enforced | **YES** |
| Writing/override balances kept separate | **YES** — tested. |
| Carry-forward is automatic | **YES** — fixed this phase (`advanceCycleAnchor` + `current_cycle_anchor_date`); previously broken. |
| Ledger sync requires routine manual admin action | **NO** — fixed this phase (`syncLedgerEntriesForPayment` called from `PaymentConfirmedService`). |
| New commission can be traced to source payment | **YES** — `commission_ledger.source_payment_id` now populated. |
| Two independent payout engines remain active | **Partially** — individual compensation: NO (one engine). Group compensation: legacy engine remains active by explicit, documented decision (§9/§18), not silently. |
| Historical financial records deleted or rewritten | **NO** |
| EPX payment flow changed | **NO** |
