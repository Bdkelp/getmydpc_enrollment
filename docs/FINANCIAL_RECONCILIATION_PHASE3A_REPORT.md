# Financial Reconciliation, Retry Worker & Recurring Commission Consolidation — Phase 3A

## 1. Executive Summary

Phase 3A adds the backend reliability layer required before the Commission
Center: durable financial exception records, bounded/idempotent retries,
admin exception endpoints, and an hourly reconciliation worker guarded by a
feature flag. It also migrates recurring Server Post success processing off
`commission_payouts` and onto `PaymentConfirmedService` plus
`commission_ledger`, preserving the recurring billing log's existing CAS,
duplicate-cycle protection, token handling, and failed-payment retry policy.

No EPX collection/payment request code was changed. No commission amount,
override rate, hierarchy snapshot, historical row, or paid record was
rewritten. All database-dependent work remains **CODE COMPLETE — REQUIRES
STAGING DATABASE VALIDATION**.

## 2. Files Changed

### New

- [server/services/financial-reconciliation-service.ts](../server/services/financial-reconciliation-service.ts): exception detection, retry, resolution, and normalized categories.
- [server/services/financial-reconciliation-worker.ts](../server/services/financial-reconciliation-worker.ts): bounded hourly worker with production guard.
- [server/services/financial-processing-state.ts](../server/services/financial-processing-state.ts): durable payment state writer from Phase 2C, reused by reconciliation decisions.
- [server/routes/financial-exceptions.ts](../server/routes/financial-exceptions.ts): protected admin exception and aggregation API.
- [server/services/commission-center-aggregation-service.ts](../server/services/commission-center-aggregation-service.ts): ledger-only per-agent aggregation.
- [scripts/sql/2026-08-20d_financial_exceptions.sql](../scripts/sql/2026-08-20d_financial_exceptions.sql): additive exception table migration.
- [scripts/test-financial-reconciliation-phase3a.ts](../scripts/test-financial-reconciliation-phase3a.ts): no-DB structural tests.
- [shared/commissionPolicy.ts](../shared/commissionPolicy.ts): versioned policy data.

### Modified

- [server/services/recurring-post-success-persistence.ts](../server/services/recurring-post-success-persistence.ts): legacy payout creation removed; recurring success now invokes `processConfirmedPayment({ confirmationSource: 'recurring_billing' })`.
- [server/services/commission-payout-service.ts](../server/services/commission-payout-service.ts): legacy write functions fail closed; read helpers remain.
- [server/index.ts](../server/index.ts): registers the admin exception API and feature-flagged worker.
- [scripts/validate-commission-pipeline-staging.ts](../scripts/validate-commission-pipeline-staging.ts): Phase 3A schema/invariant checks and isolated scenario gate.
- [scripts/sql/commission_pipeline_preflight.sql](../scripts/sql/commission_pipeline_preflight.sql): includes exception table fields/indexes/statuses.
- [docs/COMMISSION_PIPELINE_DATABASE_DEPLOYMENT_CHECKLIST.md](COMMISSION_PIPELINE_DATABASE_DEPLOYMENT_CHECKLIST.md): adds Phase 3A migration order.
- `.env.example`: adds `FINANCIAL_RECONCILIATION_ENABLED=false`.
- [package.json](../package.json): adds Phase 3A test command.

## 3. Existing Failure Modes

The implementation now detects:

- successful payment with failed or overdue-pending commission processing;
- successful payment with no source-linked entitlement;
- successful payment with failed ledger sync;
- commission entitlement with no matching ledger row;
- payments pending beyond the hosted-checkout review window;
- duplicate `commission_event_key` values;
- duplicate ledger source/period combinations;
- historical commissions with missing source payment IDs.

The last category is classified as historical/ignored for auto-repair. It is
never linked by nearest date, amount, member-only matching, or any other
inference.

## 4. Reconciliation Architecture

`financial-reconciliation-service.ts` is the authoritative detector and
retry dispatcher. It reads durable payment state, exact source-payment
relationships, commission-to-ledger relationships, and duplicate identities.
Every detected condition is represented by a deterministic fingerprint in
`financial_exceptions`, preventing duplicate exception rows.

Categories are distinguished as:

- **AUTO-RETRYABLE:** commission failed/missing, ledger sync failed/missing.
- **REVIEW REQUIRED:** pending payment age exception, duplicate entitlement,
  duplicate ledger entry, retry limit exceeded.
- **HISTORICAL / DO NOT AUTO-REPAIR:** missing source payment on pre-existing
  commission records and ambiguous effective dates.

## 5. Retry Worker Design

`runFinancialReconciliationOnce()` is bounded to 25 open retryable records
per pass and uses the existing idempotent functions only:

- commission failure/missing -> `processConfirmedPayment()`;
- ledger failure/missing -> `syncLedgerEntriesForPayment()`.

An in-process `running` guard prevents overlapping worker passes in one
server instance. The worker runs hourly only when
`FINANCIAL_RECONCILIATION_ENABLED=true`. In production it additionally
requires `FINANCIAL_RECONCILIATION_STAGING_APPROVED=true`. The default is
safe/disabled.

## 6. Retry Limits

Retries are capped at three. Each attempt increments `retry_count`, records
`last_retry_at`, actor identity, and an append-only `metadata.retryHistory`
entry. A third failure changes the exception to `review_required` and
`RETRY_LIMIT_EXCEEDED`; no infinite retry loop is possible.

## 7. EPX Pending-Payment Handling

The repository contains hosted checkout status handling for MPP payment rows
and callback/browser completion flows, but no supported provider transaction-
status lookup client or polling API. The existing EPX integration contains
request/callback parsing, not a documented transaction-status query method.
Phase 3A therefore does **not** invent one and does not poll EPX.

A payment row pending beyond the configured 30-minute hosted-checkout review
window creates `PAYMENT_PENDING_REVIEW_REQUIRED` with the safe label
`PAYMENT VERIFICATION REQUIRED` and the internal payment identifier. It does
not mark the payment successful or create financial entitlement. Authorized
staff can use the existing payment diagnostics/admin processes to verify
externally without exposing card data.

## 8. Manual Verification Handling

The existing authorized manual payment-status route remains the manual
recovery entry point and already delegates successful confirmation to
`processConfirmedPayment({ confirmationSource: 'manual_admin' })`. That service
records confirmation timestamps, verification method, actor, commission
processing state, and ledger sync state. A delayed callback is idempotent by
source payment and commission event key; it retries ledger synchronization
rather than creating a second entitlement set.

## 9. Recurring Server Post Migration

Before Phase 3A, `persistRecurringPostSuccess()` did this after preserving the
payment row and recurring billing CAS:

```
recurring success -> payment row -> createPayoutsForMemberPayment()
                     -> commission_payouts
                  -> broad member ledger resync
```

Now it does:

```
recurring success -> payment row -> processConfirmedPayment(recurring_billing)
                                  -> WP-03 direct + override entitlements
                                  -> source_payment_id + event key
                                  -> payment-scoped commission_ledger sync
```

The payment-row unique transaction check, recurring billing log cycle
prevention, subscription next-date CAS, retry scheduling, token handling, and
failed-payment recording were not changed. A failed recurring payment exits
before confirmation and cannot create commission entitlement. A duplicate
successful billing event reloads the existing payment and the shared service
is idempotent.

## 10. `commission_payouts` Retirement Status

There are no remaining callers of `createMonthlyPayout()` or
`createPayoutsForMemberPayment()` in `server/**`. The legacy service's two
write functions now fail closed with an explicit migration message. Its read
helpers and the `commission_payouts` table remain for historical reporting.

Repository reads remain in `payment-diagnostic.ts`; this is historical/
diagnostic access only. New individual, group, and recurring compensation
writers use `commission_ledger`.

## 11. Financial Exception Model

Migration [2026-08-20d_financial_exceptions.sql](../scripts/sql/2026-08-20d_financial_exceptions.sql)
adds `financial_exceptions` with:

- normalized `exception_type` check values;
- deterministic `fingerprint` unique key;
- payment, member, commission, and ledger references;
- detected/retry/resolution timestamps;
- retry count and status (`open`, `retrying`, `review_required`, `resolved`,
  `ignored`);
- error reason, resolution method, actor, and JSON metadata.

The table is additive and does not modify financial records.

## 12. Admin Exception API

All endpoints require authentication and admin-or-higher authorization:

- `GET /api/admin/financial-exceptions`
- `GET /api/admin/financial-exceptions/:id`
- `POST /api/admin/financial-exceptions/:id/retry`
- `POST /api/admin/financial-exceptions/:id/resolve`
- `GET /api/admin/commission-center/aggregation`

Resolution requires a reason. Retry actor, timestamp, action, and result are
stored in the exception record. No public or agent endpoint was added.

## 13. Commission Center Backend Aggregation Readiness

`getCommissionCenterAggregation()` reads only `commission_ledger` and returns,
per agent, separate writing and override buckets for `pending`, `payable`,
`carry-forward`, `held`, and `paid`. Transaction rows include source member,
source payment, compensation/commission type, amount, effective and earning
periods, payout batch, cancellation/adjustment fields, and status. It also
returns next writing and override payout dates from the shared schedule
service. No second balance source is introduced.

## 14. Policy Backend Readiness

[shared/commissionPolicy.ts](../shared/commissionPolicy.ts) defines the
versioned `mpp-2026-03-v1` policy representation for coverage dates,
writing/override schedules, holiday rules, thresholds, and carry-forward.
It is data-only and separate from React/UI code. Calculation services remain
the operational source of truth; the policy object prepares a stable future
presentation contract.

## 15. Tests

Added:

- `npm run test:financial-reconciliation-phase3a`: recurring writer removal,
  shared confirmation path, bounded retry, admin protection, migration,
  feature-flag, and policy assertions.

Existing regression tests rerun:

- `test:commission-consolidation-phase2c`;
- `test:payment-confirmed-service`;
- `test:commission-payout-schedule`;
- `test:commission-ledger-payout-flow`;
- `test:scheduler`;
- `test:plan-start-dates`.

## 16. Test Results

All listed no-DB/static tests passed. The Phase 1 script still attempts its
optional placeholder database connection and reports the expected connection
failure, but all static/logic assertions pass. Focused compiler checks report
no errors in touched Phase 3A files.

The final writer scan found only legacy function definitions in
`commission-payout-service.ts`; no active callers remain, and those functions
now fail closed.

## 17. Staging Tests Pending/Completed

The guarded [staging validator](../scripts/validate-commission-pipeline-staging.ts)
now checks Phase 3A columns, exception states, retryable payment states, and
historical `commission_payouts` preservation. Scenario mode requires
`COMMISSION_PIPELINE_STAGING_FIXTURE_ID=PHASE3A_ISOLATED_FIXTURE`.

Not executed here because no staging credentials or isolated fixtures exist:
failed commission recovery, failed ledger recovery, concurrent retries,
recurring success/duplicate prevention, zero new legacy payout rows, manual
verification plus delayed callback, and exception lifecycle transitions.

**CODE COMPLETE — REQUIRES STAGING DATABASE VALIDATION**

## 18. Migration Status

Prepared but not executed:

1. `2026-08-19_payment_confirmed_service_phase1.sql`
2. `2026-08-20_member_first_successful_payment_at.sql`
3. `2026-08-20b_commission_ledger_payout_flow_phase2b.sql`
4. `2026-08-20c_commission_processing_state.sql`
5. `2026-08-20d_financial_exceptions.sql`

Use the existing read-only preflight and deployment checklist. No migration
execution is claimed.

## 19. Production Enablement Requirements

Before enabling `FINANCIAL_RECONCILIATION_ENABLED=true` in production:

1. Execute and verify all five migrations.
2. Archive preflight and post-migration verification output.
3. Resolve duplicate-key findings under a reviewed plan.
4. Complete isolated staging scenarios.
5. Set `FINANCIAL_RECONCILIATION_STAGING_APPROVED=true` only after staging
   sign-off.
6. Monitor exception counts and retry-limit escalations.

The worker is disabled by default and cannot start in production without the
approval guard.

## 20. Remaining Risks

1. No EPX provider-status lookup exists in this integration, so missed
   successful callbacks remain admin verification exceptions rather than
   automatically confirmed payments.
2. The reconciliation worker is intentionally single-process guarded; a
   multi-instance deployment needs a database lease/advisory lock before
   enabling it across replicas.
3. Live database/staging validation has not run.
4. Existing historical ambiguous commissions remain unresolved by design.
5. `effectiveDateUnresolved` and exception review are backend-ready but have
   no UI yet.

## 21. Items Deferred to Phase 3B / UI

- Agent Commission Center UI.
- Multi-instance reconciliation lease/worker coordination.
- Provider-supported EPX status lookup, only if EPX supplies a documented API.
- Reviewed historical financial reconciliation/backfill project.
- Exception review dashboard and richer policy presentation.

## Final Acceptance Check

| Requirement | Result |
|---|---|
| Payment confirmed but commission failed is detectable | YES |
| Payment confirmed but ledger sync failed is detectable | YES |
| Retry is idempotent | YES, reuses authoritative services |
| Retry limit exists | YES, three attempts |
| Repeated failures escalate | YES, `review_required` |
| Pending payment is never assumed successful | YES |
| Manual recovery uses authoritative service | YES |
| Recurring payments use `commission_ledger` | YES in code; staging pending |
| Recurring payment `source_payment_id` preserved | YES in code; migration/staging pending |
| New recurring `commission_payouts` writes | NO |
| New individual `commission_payouts` writes | NO |
| New group `commission_payouts` writes | NO |
| `commission_payouts` retained as history | YES |
| Commission Center aggregation backend ready | YES, no UI |
| Writing/override balances separate | YES through ledger compensation type |
| Financial exceptions queryable | YES, after migration |
| Historical ambiguity auto-guessed | NO |
| EPX collection/payment process changed | NO |
| Reconciliation production-enabled before staging | NO; disabled/guarded |

**Database status:** CODE COMPLETE — REQUIRES STAGING DATABASE VALIDATION.

Phase 3B and the Commission Center UI were not started.
