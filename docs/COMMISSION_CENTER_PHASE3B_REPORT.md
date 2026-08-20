# Commission Center, Admin Financial Operations & Worker Hardening — Phase 3B

## 1. Executive Summary

Phase 3B adds the presentation and operations layer over the authoritative
financial pipeline. Agents now have a responsive Commission Center backed only
by `commission_ledger`; admins have a separate Financial Operations exception
queue; and the reconciliation worker now coordinates across application
instances with a PostgreSQL session advisory lock.

No frontend financial calculations were added. No EPX collection/payment
flow, commission amount, override rate, hierarchy snapshot, historical
financial record, or paid record was changed. Production reconciliation
remains disabled and all database-dependent functionality remains:

**CODE COMPLETE — REQUIRES STAGING DATABASE VALIDATION**

## 2. Worker Coordination Hardening

`financial-reconciliation-worker.ts` now acquires a non-blocking
`pg_try_advisory_lock()` on a dedicated PostgreSQL pool connection before
running detection/retry work. The lock is released with `pg_advisory_unlock()`
and the connection is released in `finally`, so session termination cannot
leave a permanent application lock. A second instance safely skips the pass
when another instance owns the lease. The original in-process guard remains a
cheap same-process optimization.

The worker remains disabled unless `FINANCIAL_RECONCILIATION_ENABLED=true`.
Production additionally requires `FINANCIAL_RECONCILIATION_STAGING_APPROVED=true`.
No production flag was enabled.

Multi-instance lock behavior still requires staging validation with two real
application/database sessions.

## 3. Agent Commission Center Architecture

New route: `/agent/commission-center`.

New API: `GET /api/agent/commission-center`.

The server ignores any frontend-supplied agent ID and resolves the identity
from `req.user.id`. The response is built from `commission_ledger`, with
payout-batch and safe payment metadata joined server-side. The existing
portal's agent navigation now points “Commissions” to this authoritative view.

## 4. Summary Cards

The Commission Center displays separate writing and override cards containing:

- current balance;
- payable balance;
- carry-forward balance;
- held balance;
- next payout date.

It also displays the most recent safe payment status/method, policy version,
policy coverage dates, and refresh time. Writing and override thresholds are
never combined in the UI.

## 5. Transaction History

History is returned from ledger rows and presented as responsive cards rather
than a wide mobile table. Filters include:

- all, writing, or overrides;
- all, pending, scheduled, carry-forward, on hold, paid, or adjustments;
- member search.

Each transaction shows member/source label, compensation type, amount,
effective date, earning period, underlying status plus human label, scheduled
pay date, payout batch, and safe payment status. Internal payment identifiers
are not shown to normal agents.

## 6. Writing Detail

Writing rows expose the minimum member identity needed for transparency,
amount, effective/earning period, status, scheduled pay date, and batch. No
member PHI or payment credentials are exposed.

## 7. Override Detail

Override rows are visibly separated from writing rows. The response retains
override metadata and compensation type; the UI identifies the row as an
override and shows earning/effective period, amount, monthly payout date, and
status. Organization-wide hierarchy data is not exposed.

## 8. Carry-Forward Presentation

The UI maps exact ledger states to understandable labels while retaining the
raw status in the transaction detail:

| Ledger state | Display label |
|---|---|
| `earned` | Earned / Pending |
| `queued` | Scheduled |
| `carry_forward` | Carrying Forward |
| `held` | On Hold |
| `paid` | Paid |
| `reversed` | Adjustment / Reversal |

Carry-forward explanations remain distinct: writing describes the $25 cycle
minimum; overrides describe the $25 monthly minimum. No frontend threshold
calculation is performed.

## 9. Schedule Display

The backend aggregation returns `nextWritingPayout` and
`nextOverridePayout` from the existing payout scheduling service. The UI only
renders those dates. It contains no holiday, cycle, threshold, or payout-date
algorithm.

Per-transaction scheduled dates come from payout batch data returned by the
backend.

## 10. Policy Display

The Commission Center receives the versioned policy contract from
`shared/commissionPolicy.ts`. It displays policy version, effective period,
writing/override cadence, holiday behavior, thresholds, and carry-forward
language. No independent policy constants are defined in React.

## 11. Statement Readiness

The authoritative response already contains the core statement inputs:
writing and override earning rows, adjustments/reversals, statuses, payout
batch, scheduled date, paid date, source payment reference, and effective
period. The per-agent aggregation separates writing and override buckets.

A dedicated month-selector/PDF/CSV statement workflow was not overbuilt; it is
ready to be layered over the same ledger query in a later UI iteration.

## 12. Admin Financial Operations

New admin route: `/admin/financial-operations`.

The page is separate from the agent Commission Center and is restricted by the
existing admin authorization helper. It presents exception counts for open,
retrying, review-required, resolved, and ignored states, with category/status
filters, search, detail, retry, and reason-required resolve actions.

## 13. Exception Dashboard

The existing Phase 3A endpoints are used:

- `GET /api/admin/financial-exceptions`;
- `GET /api/admin/financial-exceptions/:id`;
- `POST /api/admin/financial-exceptions/:id/retry`;
- `POST /api/admin/financial-exceptions/:id/resolve`.

The UI does not provide a generic “fix everything” action. Retry is a specific
exception action; resolution requires a reason.

## 14. Payment Verification Required

`PAYMENT_PENDING_REVIEW_REQUIRED` appears as
**PAYMENT VERIFICATION REQUIRED**. The queue exposes safe internal payment
and member references, detected time, retry count, and reason. It never marks
a payment successful. Manual verification remains in the existing authorized
route and continues through `PaymentConfirmedService`.

The UI does not expose card data or attempt an EPX provider lookup.

## 15. Payout Batch Reporting

The existing admin payout batch/detail services remain the authoritative batch
view and already expose batch type, compensation type, dates, status, totals,
and ledger rows. The new agent aggregation also returns batch identity and
scheduled/paid dates. No metrics are fabricated or calculated from a second
source.

Further batch-specific carried/held/adjustment summary cards can be added to
the existing admin batch detail without changing the ledger authority; that
was not duplicated in the Phase 3B agent surface.

## 16. Agent Lookup/Reconciliation

Admin aggregation remains available at:
`GET /api/admin/commission-center/aggregation?agentId=...`.
It uses the same `getCommissionCenterAggregation()` service as the agent route,
while the agent route supplies the authenticated ID server-side. Writing and
override balances remain separate and drill into the same ledger transactions.

## 17. Authorization/Security

- Agent API identity comes from `req.user.id`; frontend IDs are not trusted.
- Agent endpoints require an agent/admin/super-admin role.
- Admin exception and lookup endpoints require admin-or-higher authorization.
- The agent UI does not show sensitive payment identifiers or PHI.
- Retry and resolve are admin-only; resolve requires a reason.
- Horizontal access protection is enforced by server-side route identity, not
  by UI filtering.

## 18. Missing-Schema Behavior

Agent API failures caused by missing financial columns/tables return the safe
message:

`Commission information is temporarily unavailable.`

Admin failures expose a migration-required diagnostic state rather than a raw
database error. The server logs the actionable schema condition. The UI never
falls back to `commission_payouts` calculations.

## 19. Tests

Added/updated:

- `npm run test:financial-reconciliation-phase3a`: verifies advisory-lock
  calls, production flag guards, recurring authoritative path, retired legacy
  writer behavior, admin authorization, agent identity scoping, UI
  presentation-only behavior, policy contract, and migration safeguards.

Regression tests rerun:

- `test:commission-consolidation-phase2c`;
- `test:commission-ledger-payout-flow`;
- `test:commission-payout-schedule`;
- `test:payment-confirmed-service`;
- `test:scheduler`;
- `test:plan-start-dates`.

## 20. Staging Validation Status

The client build passes after installing the already-declared
`vite-imagetools` dependency. Focused diagnostics report no errors in touched
files.

The existing staging validator has been extended for exception state and
isolated fixture gates. The following still require a real staging database:

- two-instance advisory-lock behavior;
- agent/admin horizontal authorization against real tokens;
- aggregation totals against ledger/batches;
- writing/override separation and carry-forward;
- paid batch detail;
- exception API lifecycle;
- recurring ledger rows and zero new legacy payout writes;
- delayed callback after manual verification.

**CODE COMPLETE — REQUIRES STAGING DATABASE VALIDATION**

## 21. Migration Status

Five migrations remain prepared but unexecuted/unvalidated:

1. `2026-08-19_payment_confirmed_service_phase1.sql`;
2. `2026-08-20_member_first_successful_payment_at.sql`;
3. `2026-08-20b_commission_ledger_payout_flow_phase2b.sql`;
4. `2026-08-20c_commission_processing_state.sql`;
5. `2026-08-20d_financial_exceptions.sql`.

No deployment is claimed. Existing preflight and deployment checklist
procedures remain authoritative.

## 22. Production Enablement Gate

`FINANCIAL_RECONCILIATION_ENABLED` remains false by default and was not
changed. Production requires all migrations, preflight review, staging
validation, and multi-instance lock validation before deliberate enablement.
The Commission Center UI may be deployed as presentation code, but financial
production functionality remains schema-gated.

## 23. Remaining Risks

1. Multi-instance lock behavior has not been exercised against staging.
2. The worker currently uses a fixed advisory-lock key; this is safe for the
   one reconciliation worker but should be centrally documented if additional
   workers are introduced.
3. Live database aggregation and exception lifecycle tests are pending.
4. Statement month selection and downloadable documents are not yet built.
5. The client build retains an existing large-chunk warning.

## 24. Items Deferred

- Commission Center statement month selector and downloadable PDF/CSV;
- richer admin payout batch variance dashboard;
- staging execution and production enablement;
- multi-instance staging validation and operational lease monitoring;
- future UI improvements for unresolved effective dates and exception history.

The Commission Center UI was built; no Phase 4 work or unrelated EPX changes
were started.

## Final Acceptance Check

| Requirement | Result |
|---|---|
| Agent Commission Center exists | YES |
| Agent balances come only from authoritative ledger | YES |
| Writing/override balances separate | YES |
| Agent cannot view another agent | YES in server route identity enforcement |
| No frontend payout-date calculation | YES |
| No frontend threshold calculation | YES |
| Commission schedule uses backend engine | YES |
| Policy uses versioned shared data | YES |
| Carry-forward is explained | YES |
| Transactions are drillable | YES via ledger/batch transaction data |
| Admin exception dashboard exists | YES |
| Payment Verification Required queue exists | YES |
| Admin payout batch reconciliation exists | YES through existing ledger batch services and shared aggregation |
| Manual verification still uses PaymentConfirmedService | YES |
| Legacy `commission_payouts` used for new financial calculation | NO; writers fail closed and no callers remain |
| Worker supports multi-instance coordination | YES in code via PostgreSQL advisory lock |
| Worker enabled in production | NO |
| EPX payment flow changed | NO |
| Database migrations claimed deployed | NO |

**Database status:** CODE COMPLETE — REQUIRES STAGING DATABASE VALIDATION.

Phase 4 and production reconciliation enablement were not started.
