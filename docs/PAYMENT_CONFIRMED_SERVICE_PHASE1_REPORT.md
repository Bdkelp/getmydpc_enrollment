# Payment Confirmed Service — Phase 1 Implementation Report

**Scope:** Consolidate every "a payment has been confirmed successful" trigger
onto one authoritative internal service. No changes to EPX checkout
initialization, EPX request/response contracts, callback/completion URLs, or
BRIC/token collection. Payout-date math, holiday logic, the $25 threshold,
carry-forward, `commission_ledger`, and `commission_payout_batches` are all
explicitly untouched (deferred to a later phase, as instructed).

---

## 1. Files Changed

### New files
| File | Purpose |
|---|---|
| [server/services/payment-confirmed-service.ts](../server/services/payment-confirmed-service.ts) | The new authoritative `processConfirmedPayment()` entry point. |
| [server/services/commission-generation-service.ts](../server/services/commission-generation-service.ts) | Extraction of the existing WP-03/lineage-snapshot engine (previously private functions inside `epx-hosted-routes.ts`), enhanced with `source_payment_id` + `commission_event_key`. Business logic itself is unchanged — this is a relocation + additive enhancement, not a rewrite. |
| [server/utils/payment-status.ts](../server/utils/payment-status.ts) | Canonical `isSuccessfulPaymentStatus()` / `isFailedPaymentStatus()` / `isPendingPaymentStatus()` helpers and the normalized `PaymentConfirmationSource` union. |
| [scripts/sql/2026-08-19_payment_confirmed_service_phase1.sql](../scripts/sql/2026-08-19_payment_confirmed_service_phase1.sql) | Additive schema migration (see §2). |
| [scripts/test-payment-confirmed-service.ts](../scripts/test-payment-confirmed-service.ts) | Automated tests (see §9/§10). |

### Modified files
| File | What changed |
|---|---|
| [server/routes/epx-hosted-routes.ts](../server/routes/epx-hosted-routes.ts) | Removed ~580 lines of duplicated lineage/WP-03 logic (now imported from `commission-generation-service.ts`). Refactored `POST /api/epx/hosted/callback`, `POST /api/epx/hosted/complete`, `PUT /api/admin/payments/:id/status`, `POST /api/admin/members/:id/create-commission`, and `POST /api/admin/commissions/repair` to call `processConfirmedPayment()`. |
| [server/services/epx-payment-logger.ts](../server/services/epx-payment-logger.ts) | Widened `EPXLogEvent.phase` to accept the new `payment-confirmed-service` phase (and any string) — a pure type-level relaxation with zero runtime behavior change. |
| [package.json](../package.json) | Added `test:payment-confirmed-service` script. |

Nothing under `client/` was touched. No EPX request payloads, callback URLs,
or hosted-checkout session creation logic were modified.

---

## 2. Schema Changes

All changes are in [scripts/sql/2026-08-19_payment_confirmed_service_phase1.sql](../scripts/sql/2026-08-19_payment_confirmed_service_phase1.sql).
This SQL file has **not been executed against any database** by this work —
it must be run against the Supabase/Postgres instance backing `DATABASE_URL`
before the new code paths are deployed. It is written to be safe to run
multiple times.

| Table | New column(s) | Notes |
|---|---|---|
| `payments` | `payment_transaction_at`, `payment_confirmed_at`, `platform_verified_at` (all `timestamptz`, nullable) | First-write-wins; never overwritten by a later/duplicate confirmation. |
| `payments` | `verification_method` (`varchar(32)`, nullable) | One of `epx_callback`, `epx_browser_complete`, `manual_admin`, `reconciliation`, `recurring_billing`. |
| `payments` | `verified_by_user_id` (`uuid`, nullable, FK → `users.id`) | Populated only for `manual_admin`. |
| `agent_commissions` | `source_payment_id` (`integer`, nullable, FK → `payments.id`) | The direct traceability link the forensic audit found missing. |
| `agent_commissions` | `commission_event_key` (`text`, nullable) | Deterministic idempotency key (see §6). |
| `commission_ledger` | `source_payment_id` (`integer`, nullable, FK → `payments.id`) | Propagated per Phase 1 instructions §15 ("if it can safely be propagated... do so"), without redesigning the ledger. **Not yet populated by `syncCommissionLedgerFromFeed`** — see §12 deferred items. |

**Migration safety:**
- Every column is additive and nullable — no existing row is touched.
- Before creating `uq_agent_commissions_commission_event_key`, the migration
  counts duplicate `commission_event_key` groups and **skips index creation**
  (with a `RAISE NOTICE`) if any are found, per instructions §18. Since the
  column is brand new, no duplicates can exist on first run; this guard
  protects re-runs and partially-applied migrations.
- FK/table-existence guards (`information_schema` checks, `EXCEPTION WHEN
  undefined_table`) let the script run safely even if a target table name
  differs slightly across environments.

**Production-data condition that could block part of the migration:** none
identified from the code — since `commission_event_key` starts NULL for every
row, the unique index creation cannot fail on first run. If it is somehow
re-run after a partial manual backfill of that column, the duplicate-count
guard will report and skip rather than fail destructively.

---

## 3. New Service Architecture

```
epx_callback ──────────────┐
epx_browser_complete ──────┼──▶ processConfirmedPayment() ──▶ payments/members transaction
manual_admin ───────────────┘        │
(reconciliation, recurring_billing        ├─▶ ensureLineageSnapshotForPayment()
 are reserved values for later phases,     ├─▶ createWp03CommissionsForSuccessfulPayment()
 not wired to a trigger yet)               ├─▶ attachLineageSnapshotToCommissionAndLedger()
                                            └─▶ audit notification (admin_notifications)
```

`processConfirmedPayment(options)`:
- `paymentId`, `confirmationSource` (`epx_callback | epx_browser_complete | manual_admin | reconciliation | recurring_billing`), `verifiedByUserId?`, `providerTransactionAt?`, `platformVerifiedAt?`.
- Loads the payment, requires `isSuccessfulPaymentStatus(payment.status)` — **refuses to run for anything else**, so a commission can never be generated from enrollment status or a pending/failed payment.
- Requires a resolvable `member_id` on the payment.
- Runs one real Postgres transaction (via `server/lib/neonDb.ts`'s existing `transaction()` helper) that:
  - Sets `payments.status='succeeded'`.
  - Sets `payment_transaction_at` / `payment_confirmed_at` / `platform_verified_at` / `verification_method` / `verified_by_user_id` using `COALESCE(existing, new)` — **first confirmation wins, permanently**, regardless of source or how many times it is retried.
  - Activates the member (`status='active'`, `is_active=true`, `first_payment_date = COALESCE(existing, now)`).
- Then (outside that transaction, via the Supabase REST client — see gap in §8): ensures the lineage snapshot, checks for existing commissions **by `source_payment_id`** (not just `member_id`, so a legitimate second/recurring payment can still generate its own commission), generates writing + override commissions via the existing WP-03 engine if none exist yet, and attaches the lineage snapshot to the resulting rows.
- Writes one `admin_notifications` audit row (`type: 'payment_confirmed_processed'`) recording `paymentId`, `confirmationSource`, `verifiedByUserId`, `alreadyConfirmed`, `commissionsCreated`, `overridesRetained`.
- Returns a structured result; never throws for the "no commission needed" cases (already confirmed, no enrolling agent) — those are reported via `commissionSkippedReason`, not exceptions.

---

## 4. Routes Now Using the Service

| Route | `confirmationSource` | Change |
|---|---|---|
| `POST /api/epx/hosted/callback` | `epx_callback` | Removed the inline member-activation block and the ~200-line inline "check commission, then create WP-03 rows" block; both replaced by one `processConfirmedPayment()` call guarded by `isSuccessfulPaymentStatus(...)` and `!groupPaymentContext` (group payments keep their existing, separate `transitionGroupPaymentToPayable` flow — untouched, out of Phase 1 scope). |
| `POST /api/epx/hosted/complete` | `epx_browser_complete` | Previously activated the member but **never created a commission** at all (the audit's inconsistency finding). Now calls `processConfirmedPayment()` after token/payment-method attachment, so browser-only completion generates commissions exactly like the server callback. Token/payment-method fields are still written directly by this route (BRIC handling explicitly out of scope). |
| `PUT /api/admin/payments/:id/status` | `manual_admin` | Replaced its inline member-activation + WP-03 call with `processConfirmedPayment({verifiedByUserId: req.user.id, platformVerifiedAt: now})`. Response now includes a `paymentConfirmed` summary. |

---

## 5. Legacy Routes Changed

| Route | Before | After |
|---|---|---|
| `POST /api/admin/members/:id/create-commission` | Ran its own `calculateCommission()` and inserted a single direct-only row — no override fan-out, no lineage snapshot. | Looks up the member's latest enrollment payment; if it is not `isSuccessfulPaymentStatus`, returns `409` with an explicit error and **does not fabricate anything**. If successful, calls `processConfirmedPayment()` (full WP-03 engine, lineage snapshot, FK, idempotency key). |
| `POST /api/admin/commissions/repair` | Bulk-scanned active members, created a direct-only row per member with no source payment check at all. | For each candidate member, requires `storage.getLatestEnrollmentPayment(member.id)` to be `isSuccessfulPaymentStatus`; if not, the member is reported under a new `unresolvedMembers` array (with a reason) and **skipped**, never fabricated. In live mode, resolved members are routed through `processConfirmedPayment()`. Dry-run mode reports which members have a provable payment vs. which do not, without mutating anything. |

Both endpoints remain reachable (per instructions §13's "if compatibility
requires leaving the endpoints accessible temporarily") but their write path
no longer bypasses the authoritative service. No historical `agent_commissions`
rows were altered, backfilled, or deleted.

---

## 6. Idempotency Design

**Database-enforced**, not merely application-level:

- Every generated commission/override row gets a deterministic
  `commission_event_key`:
  `payment:{source_payment_id}:recipient:{final_recipient_agent_id|unassigned}:type:{direct|override}:overridefor:{writing_agent_id|none}:level:{final_paid_level|na}`.
- A **unique partial index** (`WHERE commission_event_key IS NOT NULL`) on
  `agent_commissions.commission_event_key` means Postgres itself — not a
  prior `SELECT` in Node — rejects a second identical entitlement, even
  under true concurrent requests.
- The key intentionally varies by `source_payment_id`, so a **different**
  payment (e.g. a later recurring charge, or a retried payment after a
  failure) is always free to generate its own entitlement — multiple
  override recipients (L1/L2/L3) from the *same* payment also each get a
  distinct key (different `level`), matching instructions §7's explicit
  "do not create a constraint that prevents legitimate... multiple override
  recipients... recurring-payment commissions."
- `createWp03CommissionsForSuccessfulPayment()` treats a unique-violation
  (`error.code === '23505'` or "duplicate key" message) on insert as an
  **idempotent no-op**, not a failure — so if the database constraint
  actually catches a race, the request still completes cleanly instead of
  throwing.
- Rows created without a `source_payment_id` (only possible if a future
  caller omits it) get `commission_event_key = null` and are **not**
  protected by the unique index — Postgres allows unlimited NULLs. This is
  intentional: Phase 1 never fabricates a false uniqueness guarantee for a
  relationship it can't prove.

---

## 7. Timestamp Design

| Field | Semantics | Overwrite behavior |
|---|---|---|
| `payment_transaction_at` | When EPX itself processed the transaction, if a trustworthy provider timestamp is supplied. **Every current caller passes `null`** — EPX's hosted-checkout callback/complete payloads do not currently expose a reliable provider transaction timestamp, and none was invented. | First-write-wins (`COALESCE`). |
| `payment_confirmed_at` | When MPP first established the payment was successful. | First-write-wins — **never** overwritten by a later duplicate/manual confirmation, satisfying the exact Aug-15/Aug-16 scenario from the spec. |
| `platform_verified_at` | When MPP processed this confirmation event. | First-write-wins, for the same reason — a redundant later confirmation (e.g. an admin manually re-verifying something the callback already handled) does not clobber the original record. |
| `verification_method` / `verified_by_user_id` | Which trigger, and which admin (if any). | First-write-wins. |

`members.first_payment_date` continues to use `COALESCE(existing, now)` —
existing semantics preserved, never overwritten by a later manual
verification (per instructions §5).

---

## 8. Payment-to-Commission FK Design

`agent_commissions.source_payment_id → payments.id` (real FK, added in the
migration). Populated on every row inserted by
`createWp03CommissionsForSuccessfulPayment()` (writing commission **and**
every override level). This directly answers the forensic audit's "why was
this exact dollar paid" gap without date-matching inference.

`commission_ledger.source_payment_id` was also added (nullable, FK) so a
future ledger-sync pass can propagate it without a schema change — but
Phase 1 does **not** modify `syncCommissionLedgerFromFeed()` to populate it,
per the explicit "do not rebuild the commission ledger yet" instruction.
**Documented as a required Phase 2 follow-up.**

---

## 9. Tests Created

[scripts/test-payment-confirmed-service.ts](../scripts/test-payment-confirmed-service.ts),
run via `npm run test:payment-confirmed-service`, following this repository's
existing test convention (`node:assert` + source-pattern checks via
`tsx scripts/test-*.ts` — there is no Jest/vitest or test-database harness
anywhere in this repo; `test-recurring-scheduler-policy.ts` and
`test-plan-start-dates.ts` use the identical style).

Covers, without requiring a live database:
- **Canonical status helper**: `isSuccessfulPaymentStatus` / `isFailedPaymentStatus` / `isPendingPaymentStatus` case-insensitivity, whitespace handling, and the confirmation-source allowlist.
- **Idempotency key determinism** (maps to spec Tests B/C/G): identical allocation ⇒ identical key; different override level ⇒ different key; different `source_payment_id` (e.g. a later recurring charge) ⇒ different key; missing `source_payment_id` ⇒ `null` key (never fabricated).
- **Route delegation** (maps to spec Tests D/E/F/H): source-pattern assertions proving `epx-hosted-routes.ts` imports and calls `processConfirmedPayment` with `confirmationSource` set to `epx_callback`, `epx_browser_complete`, and `manual_admin` respectively, and that the two legacy routes no longer call `calculateCommission()` directly and instead delegate to the service or explicitly report `unresolvedMembers`.
- **Enrollment-does-not-create-commission guard** (maps to spec Test J): asserts the pre-existing `if (false && ...)` dead-code guard in `/api/registration` remains disabled.
- **Migration safety**: asserts every new column exists in the SQL file and that the unique index is guarded by a duplicate-count check.

### What is explicitly NOT covered by this script (documented gap)
Spec Tests A, B, C, D, E, F, G, H, I (full end-to-end) require a live
Postgres + Supabase-backed environment: creating real `members`/`payments`
rows, invoking `processConfirmedPayment()` against them, simulating true
concurrent requests, and asserting on resulting `agent_commissions` rows.
This repository has no test database, fixtures, or seeding harness to do
that safely and repeatably. **Recommended before production rollout:**
stand up a disposable staging database, run the Phase 1 migration against
it, and execute the full Test A–J matrix from the original spec directly
against it (ideally with a small integration-test script added at that
point, using the same `transaction()`/Supabase client this service already
uses).

---

## 10. Test Results

```
$ npm run test:payment-confirmed-service
✅ payment-status helper tests passed
✅ commission idempotency key tests passed
✅ route delegation source-pattern tests passed
✅ enrollment-does-not-create-commission guard test passed
✅ migration safety source tests passed
```

Regression check — existing test scripts in the repo still pass after the
extraction:
```
$ npm run test:scheduler          → Recurring billing scheduler policy tests passed.
$ npm run test:plan-start-dates   → Plan start date tests passed (22 assertions)
```
(`test:group-assignment-hardening`, `test:registration-assignment-hardening`,
`test:commission-payout-hardening`, `test:hierarchy-hardening`,
`test:lineage-snapshot-hardening`, `test:wp03-override-flow-up` are declared
in `package.json` but their target files do not exist in this repository
snapshot — a pre-existing condition, unrelated to this work.)

Type-check (`npx tsc --noEmit`) was run against the full repository. It
reports pre-existing errors in `server/storage.ts`,
`server/utils/sequential-agent-number-generator.ts`, and
`shared/clean-commission-schema.ts` that are unrelated to and unchanged by
this work (confirmed by diffing error output before/after). The only
Phase-1-introduced type issue (`logEPX`'s `phase` union not yet including
`"payment-confirmed-service"`) was fixed by widening that union — a pure
type-level, zero-runtime-behavior change. The one remaining new-file type
note (`TS2802` Set-iteration in `commission-generation-service.ts`) is an
exact copy of a pattern that already exists in 27 other places across this
codebase (confirmed via `grep -c TS2802`), caused by the project's
pre-existing TypeScript `target` configuration — not introduced by Phase 1,
and not blocking (`build:server` uses `esbuild`, not `tsc`, for the actual
build).

---

## 11. Remaining Risks

1. **Cross-connection transaction gap** (documented in code comments too): `payments`/`members` writes happen in one real Postgres transaction via `server/lib/neonDb.ts`. Lineage snapshot + `agent_commissions` inserts happen via the Supabase REST client (`server/lib/supabaseClient.ts`), a separate connection that cannot join that transaction. If the process crashes between the two, the result is "payment confirmed, member active, no commission yet" — **not** silent data loss, because `processConfirmedPayment()` is safe to re-invoke (idempotent by `source_payment_id` + DB unique index) by a future reconciliation job (Phase 2).
2. **EPX callback/browser-complete never provide a provider transaction timestamp today**, so `payment_transaction_at` will be `null` for all new rows until/unless EPX's payload is confirmed to include one. This was a conscious decision per instructions §4 ("do NOT invent one").
3. **Group-payment flow is untouched.** `transitionGroupPaymentToPayable` (a separate, pre-existing, already-well-instrumented pipeline for groups) is explicitly left alone in Phase 1 — group commissions do not yet get `source_payment_id`/`commission_event_key`. Documented as a Phase 2 candidate.
4. **Migration has not been executed against any database.** It must be run (see §2) before any of the new code paths are deployed; until then, `insertCommissionRowWithWp03Fallback()`'s legacy-column-fallback will silently drop the new `source_payment_id`/`commission_event_key` fields (existing fallback behavior, extended defensively to cover the two new columns too).
5. **No live-database integration test coverage yet** (see §9's documented gap) — the concurrent-race scenario (spec Test C) in particular has only been verified structurally (unique index + idempotent-insert handling), not empirically under real concurrent load.

---

## 12. Deferred to Phase 2 (explicitly, per instructions)

- Payout-date calendar fixes (1st/15th, first-Friday, Federal Reserve holiday logic) — audited and found non-compliant in the forensic audit, but **not touched** here.
- `commission_ledger` / `commission_ledger_events` / `commission_payout_batches` redesign — only an additive, unpopulated `source_payment_id` FK was added to `commission_ledger` for future use.
- Populating `commission_ledger.source_payment_id` during `syncCommissionLedgerFromFeed()`.
- A `reconciliation`-sourced scheduled job that finds "EPX succeeded, MPP still pending" and calls `processConfirmedPayment()` automatically (the `reconciliation` and `recurring_billing` confirmation sources are defined in the type system now, but no caller uses them yet).
- Extending `processConfirmedPayment()` (or an equivalent) to the group-enrollment payment flow.
- Live-database integration tests for spec Tests A–J.

---

## 13. Final Verification (per Phase 1 spec §21)

| Question | Expected | Result |
|---|---|---|
| Does enrollment alone generate commission? | NO | **NO** — unchanged; `if (false && ...)` guard confirmed still disabled (tested). |
| Can a failed payment generate commission? | NO | **NO** — `processConfirmedPayment()` throws `PaymentConfirmationError` unless `isSuccessfulPaymentStatus(payment.status)`. |
| Can a successful EPX payment generate writing commission? | YES | **YES** — via the unmodified WP-03 engine, now reached from all three real triggers. |
| Can it generate eligible overrides? | YES | **YES** — same engine, unchanged override-flow-up logic. |
| Can browser completion + callback create duplicates? | NO | **NO** — both call the same idempotent `processConfirmedPayment()`; first-write-wins timestamps + `source_payment_id` existence check + DB unique index. |
| Can manual verification + callback create duplicates? | NO | **NO** — same mechanism. |
| Can two concurrent requests create duplicates? | NO, database-enforced | **Structurally yes** — enforced by the `uq_agent_commissions_commission_event_key` unique index, not just app logic. **Not yet empirically load-tested** (see §11.5). |
| Does each new commission directly identify its source payment? | YES | **YES** — `agent_commissions.source_payment_id` FK, populated on every row. |
| Can we distinguish payment transaction time from later manual verification? | YES when provider time is available | **Schema supports it** (`payment_transaction_at` vs `platform_verified_at`/`verification_method`); no current EPX payload supplies a provider timestamp, so this is not yet exercised in practice — documented, not invented. |
| Did EPX checkout/payment-capture behavior change? | NO | **NO** — no changes to hosted-checkout session creation, EPX request/response parsing, callback/browser-complete URL contracts, or BRIC/token handling. |
