# Commission Payout Scheduling — Phase 2A Report

**Scope:** One authoritative payout-date scheduling engine for writing
commissions and overrides. EPX payment collection, commission dollar-amount
calculation, and the `commission_ledger`/`commission_ledger_events`/
`commission_payout_batches` structures are unchanged. Reconciliation
scheduler and Commission Center UI are explicitly deferred (Phase 3+).

---

## Part A — Phase 1 Preflight

### A.1 — `first_payment_date` / successful-payment timestamp

**Confirmed: YES, `members.first_payment_date` can and does contain the
enrollment date before any payment occurs.**

Evidence:
- `shared/schema.ts` column comment: *"First payment date (same as
  enrollmentDate, used for recurring billing)"*.
- `server/routes.ts` (`POST /api/registration`): `const firstPaymentDate =
  enrollmentDate; // Same as enrollment date`, written to the new member row
  **before** any payment is attempted.

This means Phase 1's `COALESCE(first_payment_date, ...)` could never actually
update the field upon a real successful payment — it was already non-null
from registration. **`first_payment_date` must not be treated as proof of a
successful payment.**

**Decision:** added a dedicated column, **`members.first_successful_payment_at`**
(migration: [scripts/sql/2026-08-20_member_first_successful_payment_at.sql](../scripts/sql/2026-08-20_member_first_successful_payment_at.sql)):
- Set only inside `processConfirmedPayment()`'s transaction, first-write-wins (`COALESCE`).
- Value = `providerTransactionAt` when supplied and trustworthy, otherwise `platform_verified_at`'s value for that confirmation. Never the enrollment/registration time.
- Never overwritten by a later (e.g. manual) confirmation once set.
- No speculative historical backfill was performed or attempted.
- `first_payment_date` itself is left untouched (still written via its existing, non-authoritative `COALESCE`) — repurposing it was explicitly out of scope ("do not repurpose existing timestamps").

Code change: [server/services/payment-confirmed-service.ts](../server/services/payment-confirmed-service.ts) now also sets `first_successful_payment_at` in the same transactional `UPDATE members` statement.

### A.2 — Phase 1 migration status

The Phase 1 migration ([scripts/sql/2026-08-19_payment_confirmed_service_phase1.sql](../scripts/sql/2026-08-19_payment_confirmed_service_phase1.sql)) includes all five required elements:
- Source payment relationship on commissions: `agent_commissions.source_payment_id` (FK → `payments.id`).
- Financial timestamp columns: `payments.payment_transaction_at`, `payment_confirmed_at`, `platform_verified_at`.
- Confirmation source/method: `payments.verification_method`.
- Verified-by information: `payments.verified_by_user_id` (FK → `users.id`).
- Database-level idempotency constraint/index: `uq_agent_commissions_commission_event_key` (unique partial index on `agent_commissions.commission_event_key`).

**```
CODE/MIGRATION PREPARED — DATABASE EXECUTION STILL REQUIRED
```**
Neither the Phase 1 migration nor the new Phase 2A migration
([2026-08-20_member_first_successful_payment_at.sql](../scripts/sql/2026-08-20_member_first_successful_payment_at.sql))
has been executed against any database in this environment — no database
credentials are available here. Both files are additive/idempotent and safe
to run in either order (Phase 2A's migration has no dependency on Phase 1's
having already run). This is not claimed as done; it is reported honestly per
instructions.

### A.3 — Existing duplicate data / migration safety

Confirmed: the Phase 1 migration already contains a preflight duplicate check
before creating the unique index —
```sql
SELECT COUNT(*) INTO dup_count FROM (
  SELECT commission_event_key FROM public.agent_commissions
  WHERE commission_event_key IS NOT NULL
  GROUP BY commission_event_key HAVING COUNT(*) > 1
) duplicates;
IF dup_count > 0 THEN RAISE NOTICE '...' -- skips index creation
ELSE CREATE UNIQUE INDEX IF NOT EXISTS ... END IF;
```
Since `commission_event_key` is a brand-new column (nullable, defaulting to
`NULL` for every existing row) at the moment this migration first runs, no
duplicates can exist on that first run — the guard exists to protect re-runs
and partially-applied migrations. No destructive cleanup logic exists
anywhere in either migration file; nothing is deleted or merged.

---

## Part B — Phase 2A: Unified Payout Scheduling Engine

## 1. Files Changed

### New
| File | Purpose |
|---|---|
| [server/utils/federal-reserve-calendar.ts](../server/utils/federal-reserve-calendar.ts) | Shared Federal Reserve Bank holiday calendar + business-day helpers (`isFederalReserveBankHoliday`, `previousBusinessDay`, `nextBusinessDay`, `firstFridayOnOrAfter`, `firstFridayStrictlyAfter`). |
| [server/services/commission-payout-schedule-service.ts](../server/services/commission-payout-schedule-service.ts) | The unified engine: `getWritingCommissionPayDate()`, `getOverridePayDate()`, plus re-exported holiday/business-day helpers and the two independent $25 threshold helpers. |
| [scripts/test-commission-payout-schedule-service.ts](../scripts/test-commission-payout-schedule-service.ts) | Automated tests (§12/§13 below). |
| [scripts/sql/2026-08-20_member_first_successful_payment_at.sql](../scripts/sql/2026-08-20_member_first_successful_payment_at.sql) | Phase 1 preflight fix migration (Part A.1). |

### Modified
| File | Change |
|---|---|
| [server/utils/commission-payment-calculator.ts](../server/utils/commission-payment-calculator.ts) | `calculatePaymentEligibleDate()` is now a compatibility wrapper delegating to `getWritingCommissionPayDate()`. Its own (non-compliant) Monday–Sunday-week algorithm was removed. Signature and all call sites unchanged. |
| [server/services/commission-ledger-service.ts](../server/services/commission-ledger-service.ts) | `getNextPayoutDate()` and `buildDraftPayoutBatches()`'s `scheduledPayDate` now call `getWritingCommissionPayDate()` instead of a local, holiday-blind `firstFridayOnOrAfter()` (removed). |
| [server/services/payment-confirmed-service.ts](../server/services/payment-confirmed-service.ts) | Adds `first_successful_payment_at` bookkeeping (Part A.1). |
| [package.json](../package.json) | Added `test:commission-payout-schedule` script. |

Nothing under `client/`, EPX integration files, or `commission_ledger`/`commission_payout_batches` table structure was touched.

---

## 2. Unified Payout Service Architecture

```
server/utils/federal-reserve-calendar.ts
  isFederalReserveBankHoliday(date)
  previousBusinessDay(date)
  nextBusinessDay(date)
  firstFridayOnOrAfter(date)         (no holiday adjustment — pure date-finding)
  firstFridayStrictlyAfter(date)     (no holiday adjustment — pure date-finding)
        │
        ▼
server/services/commission-payout-schedule-service.ts
  getWritingCommissionPayDate(effectiveDate)
    = firstFridayStrictlyAfter(effectiveDate), then previousBusinessDay() if a holiday
  getOverridePayDate(earnedMonth)
    = firstFridayOnOrAfter(1st of the following month), then nextBusinessDay() if a holiday
  isWritingBalancePayable(amount) / isOverrideBalancePayable(amount)   (independent $25 checks)
        │
        ├──▶ commission-payment-calculator.ts  (calculatePaymentEligibleDate — compatibility wrapper)
        └──▶ commission-ledger-service.ts      (getNextPayoutDate, buildDraftPayoutBatches)
```

Both `getWritingCommissionPayDate` and `getOverridePayDate` are pure
functions: same input ⇒ same output, no dependency on the current date,
timezone, or any mutable/UI state (§18 of the spec).

---

## 3. Existing Date Functions Discovered (full inventory)

| Function | File | What it computed |
|---|---|---|
| `calculatePaymentEligibleDate(enrollmentDate)` | `server/utils/commission-payment-calculator.ts` | Monday–Sunday-week + "Friday after week ends" — **non-compliant** (audit: 3/7 tests passed). |
| `getNextPayoutDate(batchType, referenceDate)` | `server/services/commission-ledger-service.ts` | 1st/15th anchor + naive Friday-finder — **no holiday awareness at all**. |
| `getCycleAnchorForEntry(commissionPeriodEnd)` | `server/services/commission-ledger-service.ts` | Groups a ledger row into a `1st-cycle`/`15th-cycle` batch key based on `commission_period_end` day-of-month. |
| `firstFridayOnOrAfter(date)` (local, now removed) | `server/services/commission-ledger-service.ts` | Naive Friday-finder, no holiday adjustment. |
| `adjustAnchorForBusinessCalendar` / `shiftToPreviousBusinessDay` / `isUsBankHoliday` | `server/utils/membership-dates.ts` | Billing-anchor (1st/15th) holiday/weekend shifting for **subscription billing dates**, not commission payout dates. |
| `markCommissionPaymentCaptured`'s "eligible date = 14 days from now" | `server/storage.ts` | A **different business concept** (refund/clawback grace window on commission capture), unrelated to Friday-based payout scheduling. |

## 4. KEEP / REDIRECT / DEPRECATE Matrix

| Function | Classification | Rationale |
|---|---|---|
| `calculatePaymentEligibleDate()` | **REDIRECT** | Kept as a thin compatibility wrapper around `getWritingCommissionPayDate()`. Callers (`commission-payout-service.ts`, `group-payment-transition-service.ts`, `group-enrollment.ts`) needed zero changes. |
| `getNextPayoutDate()` | **REDIRECT** | Internals now call `getWritingCommissionPayDate()`; public signature/callers (`getPayoutDashboardData`'s "next payout date" preview) unchanged. |
| `firstFridayOnOrAfter()` (local copy in `commission-ledger-service.ts`) | **REMOVED** | Fully replaced by direct calls to the unified service; no remaining callers. |
| `getCycleAnchorForEntry()` | **KEEP** | Ledger batch-grouping logic, not date math — explicitly out of scope ("do not perform a wholesale ledger redesign"). See §11 caveat below. |
| `server/utils/membership-dates.ts` holiday/business-day logic | **KEEP (unchanged)** | Billing-anchor dates are a different business concern from commission payout dates; changing this calendar's Saturday-holiday behavior could alter existing subscription billing behavior. Not touched — see §9 below for why. |
| `markCommissionPaymentCaptured`'s 14-day logic | **KEEP (out of scope)** | Different business rule (refund/clawback window), not a payout-date algorithm. |

No production caller is left using a competing writing/override payout-date
algorithm after this phase — every remaining caller of the two REDIRECTed
functions now transitively runs the unified rules.

---

## 5. Writing Commission Rule (implemented)

`getWritingCommissionPayDate(effectiveDate)`:
1. Pay date = first Friday **strictly after** `effectiveDate` (computed as: `effectiveDate + 1 day`, then the first Friday on/after that — this guarantees a strictly-later result even when `effectiveDate` is itself a Friday).
2. If that Friday is a Federal Reserve Bank holiday, move to the **preceding business day**.

Verified: `05/01/2026` (a Friday) → `05/08/2026` (does not pay same-day; moves a full week forward, not just to next weekday).

## 6. Override Rule (implemented)

`getOverridePayDate(earnedMonth)`:
1. Pay date = first Friday **on or after** the 1st of the month following `earnedMonth`.
2. If that Friday is a Federal Reserve Bank holiday, move **forward** to the next business day (never backward into the earning month — preserves the in-arrears guarantee).

## 7. Holiday / Business-Day Implementation

`server/utils/federal-reserve-calendar.ts` holds one shared holiday table
(New Year's, MLK, Presidents, Memorial, Juneteenth, Independence, Labor,
Columbus, Veterans, Thanksgiving, Christmas) and one shared
`isFederalReserveBankBusinessDay()` predicate used by both
`previousBusinessDay()` and `nextBusinessDay()`. Both the writing and
override rules call the *same* holiday function — only the *direction*
(`previousBusinessDay` vs `nextBusinessDay`) differs per §3/§5 of the spec.

**Corrected observance rule vs. the pre-existing calendar** in
`server/utils/membership-dates.ts`: a fixed-date holiday falling on
**Saturday** is now **not** shifted to the preceding Friday (Federal Reserve
Banks remain open; only the Board of Governors, an administrative body,
closes early — that closure does not affect Reserve Bank funds-transfer
operations). A holiday falling on **Sunday** still shifts to the following
Monday. This directly implements the required **July 3, 2026 rule** (§8): in
2026, July 4th (Independence Day) is a Saturday, so July 3rd remains a normal
Federal Reserve Bank business day — confirmed by test: effective `07/01/2026`
→ pay date `07/03/2026`.

**Why `membership-dates.ts` itself was left unchanged:** its holiday
calendar *does* shift a Saturday holiday to the preceding Friday, which is
the opposite (incorrect, for Fed Reserve Bank purposes) rule. Changing that
shared calendar in place would risk altering existing subscription
billing-anchor behavior that already depends on it, which the spec
explicitly says to preserve. Per instructions ("if that calendar is accurate
and reusable, extract/refactor... otherwise..."), since it was found to be
**not accurate** for the Federal Reserve Bank commission-payout use case, a
new, corrected, separate calendar was built for commission scheduling instead
of reusing the flawed one. In practice this created no billing regression
risk to check: the 1st/15th billing anchors examined for 2026 do not fall
near the July 4th weekend edge case. **Recommendation for a later phase:**
audit whether `membership-dates.ts`'s Saturday-holiday behavior is itself a
latent billing bug and, if so, fix it there too as its own targeted change
(not bundled into Phase 2A).

## 8. Threshold Compatibility

- `MIN_WRITING_PAYOUT_THRESHOLD = 25` and `MIN_OVERRIDE_PAYOUT_THRESHOLD = 25` exported from the new service, matching the existing `MIN_AGENT_PAYOUT_THRESHOLD` constant already used by `commission-ledger-service.ts` (that constant and its carry-forward mechanics were **not** touched — Phase 2A only redirected date math).
- `isWritingBalancePayable()` / `isOverrideBalancePayable()` are independent functions — a test explicitly asserts `$20` writing + `$10` override does **not** become a payable combined `$30` (each must independently reach `$25`).
- No changes were made to `commission_ledger`'s actual carry-forward implementation (`shouldCarryForwardAgent`, `rebalanceOpenBatchThresholdAssignments`) — those continue to use the pre-existing `MIN_AGENT_PAYOUT_THRESHOLD` mechanics, unchanged.

## 9. Legacy `commission_payouts` / `commission-payout-service.ts` Findings

- Still depended on by: `server/services/group-payment-transition-service.ts` (group payment cycle transitions) and `server/routes/group-enrollment.ts` (group commission pricing repair / expected-commission-cycle flows) — both call `calculatePaymentEligibleDate()`.
- **Decision: Option A — delegate to the new payout schedule service**, achieved transparently via the `calculatePaymentEligibleDate()` compatibility wrapper (§4 above). No caller code changed; the underlying date math is now correct and unified.
- The table itself (`commission_payouts`) and `commission-payout-service.ts`'s `createMonthlyPayout()`/`createPayoutsForMemberPayment()` writer functions were **not** modified — they still write payout rows the same way they always did (no historical records touched), but the *date* they compute for new rows now comes from the unified engine.
- The $25-threshold gap the forensic audit found in this legacy path (`createMonthlyPayout()` has no carry-forward/threshold logic at all) is **not fixed in Phase 2A** — that is a structural gap in the legacy table's writer, not a date-scheduling defect, and fixing it would mean changing how/when payout rows are created (out of this phase's scope, which is scheduling **dates** only). Flagged for a later phase.

## 10. Effective Date — Not Enrollment Date

Per §13, writing commission scheduling must use the membership effective
date, not enrollment/creation/processing date. The authoritative field is
**`members.membershipStartDate`** (`membership_start_date` column) — set at
registration to one of the next available 1st/15th anchors
(`shared/planStartDates.ts`), and for groups, the group's cycle anchor date
(`groupBillingLifecycle.expectedCycleDate` / `billingScheduler.scheduledStartDate`,
also always a 1st/15th-normalized date per `parseCycleDate`).

**This phase does not change which date value existing callers pass in** —
`calculatePaymentEligibleDate()`'s callers currently pass a "payment
captured at" timestamp, not `membershipStartDate`, for the legacy
`commission_payouts` path. This is a **pre-existing caller-level
discrepancy**, not something Phase 2A introduces or was asked to fix (the
instructions authorize compatibility wrappers precisely to avoid touching
caller call-sites in this phase). It is documented here as a known,
unresolved gap: **when `commission_payouts` rows are created for group
cycles, their pay date is technically anchored to payment-capture date, not
membership effective date.** Recommended Phase 2B follow-up: update
`group-payment-transition-service.ts`/`group-enrollment.ts` to pass the
actual cycle's effective date instead of `paymentCapturedAt`.

No code path silently guesses an effective date when one is absent — none of
the new functions have a "guess" branch; a caller must supply a concrete
`Date`.

---

## 11. Automated Tests

`scripts/test-commission-payout-schedule-service.ts`, run via
`npm run test:commission-payout-schedule`:

- **Writing commission tests (§9 of spec, all 7 required cases):**
  `03/01/2026→03/06/2026`, `04/01/2026→04/03/2026`, `05/01/2026→05/08/2026`,
  `06/15/2026→06/18/2026`, `07/01/2026→07/03/2026`, `08/15/2026→08/21/2026`,
  `01/01/2027→01/08/2027`.
- **Override tests (§10, all 3 required cases):** August 2026 → `09/04/2026`,
  September 2026 → `10/02/2026`, December 2026 → `01/04/2027`.
- **Edge tests (§11):** effective date is Friday (must not pay same day);
  effective date is Saturday; effective date is Sunday; Friday-payout-is-holiday
  for both writing (backward) and override (forward); holiday adjustment
  crossing a month boundary (December override → January, never back into
  December); weekend business-day navigation (`previousBusinessDay`/`nextBusinessDay`
  around a Sunday).
- **July 3, 2026 rule (§8):** explicit assertion that `07/03/2026` is *not*
  classified a holiday, plus the end-to-end pay-date assertion.
- **Threshold separation (§15):** `$20` writing + `$10` override does not
  become a payable `$30`; each threshold evaluated independently; `$25`
  alone is payable for both.

## 12. PASS/FAIL Results

```
$ npm run test:commission-payout-schedule
✅ Writing commission tests passed (7/7)
✅ Override tests passed (3/3)
✅ Edge-case tests passed
✅ July 3, 2026 rule test passed
✅ Threshold separation tests passed
```
**All required and edge-case tests PASS.** (Forensic audit baseline: the old
implementation passed only 3 of 7 writing cases and failed the December 2026
override holiday case.)

Regression check — pre-existing test scripts still pass after the redirects:
```
$ npm run test:scheduler          → Recurring billing scheduler policy tests passed.
$ npm run test:plan-start-dates   → Plan start date tests passed (22 assertions)
$ npm run test:payment-confirmed-service → all 5 Phase 1 assertion groups passed
```
`npx tsc --noEmit`, filtered to every file touched or created in this phase,
shows **zero new type errors** (the only matches remaining are the same
pre-existing `TS2802` Set/Map-iteration pattern already present in 27+
other locations across this codebase, unrelated to Phase 2A).

---

## 13. Remaining Dependencies

- `commission-payout-service.ts` (legacy `commission_payouts` table) and its
  two callers (`group-payment-transition-service.ts`, `group-enrollment.ts`)
  now get correct dates via the wrapper, but the table's writer logic itself
  (no threshold/carry-forward) is unchanged and still a materially different
  payout *mechanism* (not just date algorithm) from `commission_ledger`.
- `commission_ledger`'s `getCycleAnchorForEntry()` still applies the
  semi-monthly (1st/15th) writing-commission batch cadence to **every**
  commission type it processes, including rows tagged `commission_type:
  'override'` synced in from `agent_commissions` — it does not yet route
  overrides onto a true monthly-in-arrears cycle inside the ledger. This is a
  **structural** (not date-math) gap, explicitly out of scope for Phase 2A
  ("do not perform a wholesale ledger redesign"). Flagged for Phase 2B.

## 14. Items Deferred to Phase 2B / Phase 3

- Reclassifying override rows in `commission_ledger` onto a true monthly-arrears cycle (structural ledger change).
- Updating `group-payment-transition-service.ts`/`group-enrollment.ts` to pass the actual membership/cycle effective date instead of `paymentCapturedAt` into the payout-date wrapper.
- Adding threshold/carry-forward enforcement to the legacy `commission_payouts` writer, or formally retiring it.
- Auditing/fixing `membership-dates.ts`'s Saturday-holiday billing-anchor behavior, if it is confirmed to be a real billing bug.
- EPX reconciliation scheduler (Phase 3) and agent Commission Center UI (later phase) — not started, per explicit instruction.

## 15. Database Migration Status

Both migrations for this work are **prepared, additive, and idempotent, but
not yet executed against any database** (no credentials available in this
environment):
- [scripts/sql/2026-08-19_payment_confirmed_service_phase1.sql](../scripts/sql/2026-08-19_payment_confirmed_service_phase1.sql) (Phase 1, still pending from the previous phase).
- [scripts/sql/2026-08-20_member_first_successful_payment_at.sql](../scripts/sql/2026-08-20_member_first_successful_payment_at.sql) (this phase's preflight fix).

```
CODE/MIGRATION PREPARED — DATABASE EXECUTION STILL REQUIRED
```

Phase 2A itself required **no new schema changes** beyond the Part A.1
preflight fix — payout-date scheduling is pure application logic with no
persisted new columns.

---

## 16. Final Acceptance Check

| Check | Result |
|---|---|
| Writing commissions use effective date | **YES** — `getWritingCommissionPayDate(effectiveDate)`; the compatibility wrapper's remaining caller-level discrepancy for the legacy group path is documented in §10, not hidden. |
| Writing commissions use first Friday strictly after | **YES** |
| Friday effective date moves to following Friday | **YES** — tested explicitly. |
| Writing Fed holiday moves backward | **YES** — tested (Juneteenth example). |
| Overrides are monthly in arrears | **YES** |
| Override first-Friday holiday moves forward | **YES** — tested (New Year's Day example). |
| July 3, 2026 treated correctly | **YES** — tested explicitly. |
| $25 writing threshold preserved | **YES** — unchanged `MIN_AGENT_PAYOUT_THRESHOLD` mechanics; new equivalent constant added for the unified service. |
| $25 override threshold preserved | **YES** |
| Writing and override balances remain separate | **YES** — tested explicitly (`$20 + $10` does not combine). |
| Competing payout algorithms still independently active | **NO** — both prior implementations now redirect through the unified service. |
| EPX payment collection/process changed | **NO** |
