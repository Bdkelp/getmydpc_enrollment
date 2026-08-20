# Group Commission Consolidation — Phase 2C Report

## 1. Executive Summary

Phase 2C moves newly confirmed **group** compensation from the legacy
`commission_payouts` writer into the authoritative
`agent_commissions -> commission_ledger -> commission_payout_batches` flow.
Expected group commission entitlements are still created before payment, but
remain non-payable until a specific successful payment is supplied. The
payment transition now links those rows to that exact `payments.id`, then
runs the existing compensation-aware ledger sync. No EPX collection logic,
commission amount, override rate, historical paid record, or legacy table
row was changed.

A fourth additive migration adds durable payment-level processing state so
"payment confirmed but commission/ledger work failed" is queryable without
reconstructing logs. Database credentials were unavailable, so migrations
were not executed and live staging scenarios remain pending.

## 2. Group Flow Before Phase 2C

```
group enrollment/payment
  -> expected agent_commissions row (stage:expected)
  -> transitionGroupPaymentToPayable()
  -> agent_commissions becomes payment_captured/payable
  -> commission-payout-service.createMonthlyPayout()
  -> commission_payouts
```

The transition service was the active group writer identified in Phase 2B.
A dormant helper in `group-enrollment.ts` also contained a legacy payout call;
it had no call sites and was removed so the route module cannot accidentally
reintroduce that writer.

## 3. Group Flow After Phase 2C

```
group enrollment complete
  -> expected agent_commissions row (stage:expected, not payment-backed)
  -> successful payment with exact paymentId
  -> transitionGroupPaymentToPayable()
  -> source_payment_id = payments.id
  -> syncLedgerEntriesForPayment()
  -> commission_ledger (writing or override compensation_type)
  -> shared cycle, threshold, and carry-forward rules
  -> commission_payout_batches
```

The callback supplies `paymentRecordForLogging.id`. The member-payment admin
endpoint must supply `req.body.paymentId`; the transition validates that row
exists and has a successful status. It does not search for a closest payment
or infer one from dates.

## 4. Files Changed

### New

- [scripts/sql/commission_pipeline_preflight.sql](../scripts/sql/commission_pipeline_preflight.sql): read-only schema/data preflight.
- [scripts/sql/2026-08-20c_commission_processing_state.sql](../scripts/sql/2026-08-20c_commission_processing_state.sql): additive durable financial-processing state.
- [scripts/validate-commission-pipeline-staging.ts](../scripts/validate-commission-pipeline-staging.ts): guarded staging DB validation harness.
- [scripts/test-commission-consolidation-phase2c.ts](../scripts/test-commission-consolidation-phase2c.ts): no-DB structural regression tests.
- [docs/COMMISSION_PIPELINE_DATABASE_DEPLOYMENT_CHECKLIST.md](COMMISSION_PIPELINE_DATABASE_DEPLOYMENT_CHECKLIST.md): ordered deployment procedure.

### Modified

- [server/services/group-payment-transition-service.ts](../server/services/group-payment-transition-service.ts): exact payment validation, source-payment linking, durable state, and ledger sync; removed legacy payout write.
- [server/routes/epx-hosted-routes.ts](../server/routes/epx-hosted-routes.ts): passes exact successful payment ID to group transition.
- [server/routes/group-enrollment.ts](../server/routes/group-enrollment.ts): requires payment ID on the admin group-payment transition and removed the unreachable legacy payout helper/import.
- [server/services/commission-ledger-service.ts](../server/services/commission-ledger-service.ts): permits synthetic group-member ledger feeds while retaining payment-scoped sync.
- [server/services/payment-confirmed-service.ts](../server/services/payment-confirmed-service.ts): records pending/complete/failed financial states and retries ledger sync on duplicate confirmation.
- [server/services/financial-processing-state.ts](../server/services/financial-processing-state.ts): durable payment state writer with explicit missing-schema warnings.
- [package.json](../package.json): Phase 2C test and staging commands.

## 5. Legacy Payout Writer Inventory

The repository scan after the change found:

- **Group transition writer:** removed. `group-payment-transition-service.ts` has no `commission_payouts` reference and no `createMonthlyPayout()` call.
- **Group enrollment route writer:** removed. The previously unreachable captured-payment helper had no usages and was deleted.
- **Callback group path:** calls the transition service, which now writes ledger rows only.
- **Admin group-payment path:** calls the same transition service, which now writes ledger rows only.
- **Recurring billing:** the separate Server Post writer remained after Phase 2C and was migrated in Phase 3A to `PaymentConfirmedService` plus `commission_ledger`. It is now covered by the Phase 3A report and no longer writes new `commission_payouts` rows.

## 6. `commission_payouts` Retirement Decision

New group writes to `commission_payouts` are retired. The table is preserved
as historical financial history, and no old row is deleted or rewritten.
The legacy service remains only for historical read helpers. Its writer
functions now fail closed, and group/individual/recurring new compensation
must use the authoritative ledger path. Group reporting may continue to read
historical rows.

## 7. Group Effective-Date Handling

The group transition already resolves
`groupBillingLifecycle.expectedCycleDate`, falling back to
`billingScheduler.scheduledStartDate`. That resolved lifecycle date is used
for both the compatibility date wrapper and the ledger sync feed. Payment
capture time is used only as an explicitly warning-logged fallback when the
lifecycle contains no usable date. The admin commission feed also exposes
`effectiveDateUnresolved` for group records lacking a resolvable lifecycle
anchor. No historical effective dates are rewritten.

## 8. Group Source-Payment Traceability

For a new successful transition:

1. The exact `payments.id` is validated as successful.
2. Each expected `agent_commissions` row is updated with
   `source_payment_id = paymentId`.
3. Already-captured rows may only be linked when their existing source is
   null; a different existing source causes a hard failure.
4. `syncLedgerEntriesForPayment()` selects commissions by that exact
   `source_payment_id` and writes the same ID into `commission_ledger`.

There is no date proximity, transaction guessing, or closest-payment logic.

## 9. Group Threshold and Carry-Forward

Group rows now enter the same ledger grouping as individual rows. The ledger
uses `commission_type = direct/override` from `agent_commissions` to assign
`compensation_type = writing/override`. Writing rows use `writing_1st` or
`writing_15th`; overrides use `override_monthly`. The existing shared $25
threshold and Phase 2B `current_cycle_anchor_date` carry-forward logic then
apply without a group-specific threshold implementation. Writing and override
balances remain separate because they are separate compensation batches.

## 10. Cross-Connection Recovery Strategy

Payment bookkeeping, commission generation, and ledger sync still do not
share one distributed transaction. Phase 2C does not introduce one. Instead:

- processing begins with durable `payments` state `pending`;
- commission processing ends as `complete`, `skipped`, or `failed`;
- ledger sync ends as `complete` or `failed`;
- error text is retained in the corresponding payment state column;
- both `processConfirmedPayment()` and payment-scoped ledger sync are
  idempotent and retryable;
- duplicate confirmations retry the ledger sync, including when the first
  confirmation already created commissions.

A future scheduler is not implemented in this phase. The state gives a
review/retry process a durable query target rather than relying on logs.

## 11. Financial-Processing State Design

The new nullable `payments` columns are:

- `commission_processing_status`: `pending`, `complete`, `skipped`, or
  `failed`;
- `ledger_sync_status`: `pending`, `complete`, or `failed`;
- `commission_processing_error`;
- `ledger_sync_error`;
- `financial_processing_updated_at`.

This directly identifies successful payments with no commission, commissions
whose ledger sync failed, and successful processing. Existing rows remain
null. The application emits `FINANCIAL SCHEMA MIGRATION REQUIRED` when these
columns are unavailable rather than silently operating indefinitely in
compatibility mode.

## 12. Database Preflight Design

[commission_pipeline_preflight.sql](../scripts/sql/commission_pipeline_preflight.sql)
contains SELECT-only checks for:

- required columns and indexes;
- duplicate `commission_event_key` values;
- captured commissions missing source payments;
- invalid source payment references;
- ledger rows missing source commissions;
- duplicate source/period ledger combinations;
- existing batch types and compensation types;
- historical group `commission_payouts` rows;
- table columns and constraints that may affect migration readiness.

It performs no repair, deletion, merge, normalization, update, insert, or
schema alteration.

## 13. Migration Execution Checklist

The required order is:

```
Preflight
-> Phase 1 migration
-> successful-payment timestamp migration
-> Phase 2B ledger migration
-> Phase 2C processing-state migration
-> verification queries
-> staging tests
```

The exact commands and rollback considerations are in
[COMMISSION_PIPELINE_DATABASE_DEPLOYMENT_CHECKLIST.md](COMMISSION_PIPELINE_DATABASE_DEPLOYMENT_CHECKLIST.md).
None of the migrations were executed in this environment. The new Phase 2C
migration is additive and nullable; it does not alter historical values.

## 14. Staging Validation Harness

Run only with an isolated staging `DATABASE_URL`,
`COMMISSION_PIPELINE_TEST_DATA_MARKER=PHASE2C_STAGING_ONLY`, and a non-
production `APP_ENV`. Production execution is refused unless an explicit
override variable is supplied. The harness checks required schema and reports
existing retryable payment states before the repository-specific fixture
scenarios are run.

The required fixture scenarios are enumerated in the script: duplicate and
concurrent payment confirmation, duplicate ledger sync, writing and override
carry-forward, group writing and override, holidays, and manual confirmation
followed by a delayed callback. The harness has not been run because no
staging credentials or isolated fixtures are available.

## 15. Tests Runnable Without DB

- `npm run test:commission-consolidation-phase2c`: group source-payment,
  ledger-routing, no-legacy-group-writer, preflight read-only, migration, and
  production-guard assertions.
- `npm run test:commission-ledger-payout-flow`: Phase 2B classification,
  carry-forward, threshold, and manual override tests.
- `npm run test:commission-payout-schedule`: Phase 2A date/holiday tests.
- `npm run test:payment-confirmed-service`: Phase 1 static/logic tests pass;
  its optional database connection attempts fail because no database is
  available, but the static assertions complete successfully.
- `npm run test:scheduler`: pass.
- `npm run test:plan-start-dates`: pass, 22 assertions.

## 16. Tests Requiring Staging DB

The following remain **CODE COMPLETE — REQUIRES STAGING DATABASE
VALIDATION**:

- actual individual and group payment rows;
- duplicate and concurrent confirmation against database uniqueness;
- twice-run ledger sync row-count equality;
- real writing/override batch creation and thresholds;
- group effective-date and holiday batch dates;
- manual confirmation plus delayed callback;
- verification after all migrations execute.

## 17. Historical-Data Findings

No historical financial record was deleted, rewritten, reclassified, or
backfilled. Existing `commission_payouts` rows remain available for audit.
Null source payment IDs, null compensation types, ambiguous group effective
dates, duplicate commission keys, and duplicate ledger source/period rows
are reported by preflight and require a separately reviewed reconciliation
plan.

## 18. Remaining Risks

1. The recurring Server Post path still writes the legacy `commission_payouts`
   table; it is outside the group migration and must be handled before that
   table can be globally read-only.
2. Live staging validation and migration execution were not possible here.
3. No automatic retry scheduler was added; durable failed states are now
   queryable and safely retryable, but a future operational worker is still
   needed.
4. Group admin payment transitions now require an exact `paymentId`; clients
   that previously sent only a status will receive a validation error until
   they supply the payment reference.
5. Unresolvable group effective dates are logged/flagged but not surfaced in
   a UI in this phase.

## 19. Backend Readiness for Commission Center

The authoritative ledger and batch records now contain or can return, per
agent: writing and override compensation type, earned period, effective date,
source payment ID, member, ledger status (`earned`, `queued`, `carry_forward`,
`paid`, `held`, `reversed`), payout batch, scheduled pay date, paid date,
threshold routing, and ledger event history. The existing dashboard and batch
detail functions expose the ledger rows and batch data. Missing presentation
work includes explicit per-agent pending/payable/carry-forward aggregations
and a review surface for `effectiveDateUnresolved` and durable failed states;
no UI was built in Phase 2C.

## 20. Items Deferred to Phase 3

- EPX reconciliation scheduler or polling worker.
- Commission Center UI.
- Migration of recurring Server Post writes off `commission_payouts`.
- Full historical reconciliation/backfill plan.
- Live database execution and staging fixture validation.
- Admin review UI for failed processing and unresolved effective dates.
- New ACH/payment integrations.

## Final Acceptance Check

| Requirement | Result |
|---|---|
| New individual payouts use `commission_ledger` | YES, from Phases 1/2B. |
| New group payouts use `commission_ledger` | YES in both active group confirmation routes. |
| New group writes to `commission_payouts` | NO. |
| Historical `commission_payouts` preserved | YES. |
| Group writing uses actual cycle effective date | YES in code; staging validation pending. |
| Group overrides use monthly arrears | YES in shared compensation-aware ledger code; staging validation pending. |
| Group $25 writing threshold | YES through shared ledger threshold; staging validation pending. |
| Group $25 override threshold | YES through separate shared ledger batches; staging validation pending. |
| Group writing/override balances separate | YES in code and Phase 2B pure tests; group DB scenario pending. |
| Source payment traceability | YES in code; migration/staging validation pending. |
| Automatic ledger population | YES in code via payment-scoped sync. |
| Missing ledger sync detectable/recoverable | YES: durable status/error columns plus idempotent retry path; no scheduler yet. |
| Migration preflight exists | YES. |
| Migration deployment checklist exists | YES. |
| DB-backed staging validation script exists | YES, guarded; execution pending credentials/fixtures. |
| Production historical records rewritten | NO. |
| EPX process changed | NO. |

**Database status:** CODE COMPLETE — REQUIRES STAGING DATABASE VALIDATION.

Phase 3 was not started.
