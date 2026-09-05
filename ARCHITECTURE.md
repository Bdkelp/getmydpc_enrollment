# Architecture — MPP Enrollment Platform

## Purpose

This document describes the production architecture and the boundaries that matter most for safe engineering changes. It is intentionally operational: follow the data and money flow first, then modify code.

## 1. System topology

```text
Browser / Frontend
React + Vite + Supabase Auth
        |
        | HTTPS JSON + bearer token
        v
DigitalOcean App Platform
Node.js 22 + Express
        |
        +-------------------------------+
        |                               |
        v                               v
Supabase PostgreSQL/Auth                EPX
members/subscriptions/payments          Hosted Checkout
billing cycles/commissions              Server Post recurring
        |
        v
Supabase pg_cron / pg_net
external recurring billing invocation
```

Production source branch: `main`.

## 2. Application bootstrap and route order

`server/index.ts` is the authoritative server bootstrap.

Important order:

1. environment loading
2. Express/CORS/body/log middleware
3. health/readiness routes
4. payment environment initialization
5. **member payment-method maintenance router**
6. **normal EPX Hosted Checkout router**
7. certification/financial exception routes
8. large `registerRoutes()` legacy route collection
9. admin/debug/payment/group/reconciliation/diagnostic/internal billing routes
10. production static frontend serving
11. startup-only services such as weekly recap, membership activation, and financial reconciliation

The payment-method maintenance router is deliberately mounted before normal enrollment EPX routes so Add/Replace/Pay Now actions cannot accidentally fall through enrollment duplicate-payment guards.

Recurring billing is not started from application boot.

## 3. Frontend architecture

Primary code: `client/src/`.

Core concerns:

- routing: Wouter
- data fetching/cache: TanStack Query
- forms/validation: React Hook Form + Zod
- auth: Supabase client session/token
- API: backend base URL through the application API client
- payment UI: `client/src/components/EPXHostedPayment.tsx`

The browser should never receive server secrets or service-role credentials.

## 4. Authentication and authorization

Primary server auth middleware: `server/auth/supabaseAuth.ts`.

Request flow:

```text
Authorization: Bearer <Supabase JWT>
        |
        v
supabase.auth.getUser(token)
        |
        v
local users table lookup/create
        |
        +--> approval check
        +--> active check
        +--> email verification check
        +--> password-change-required check
        +--> role normalization / full-access override
        +--> optional admin impersonation context
        |
        v
req.user / req.realUser
```

Authorization decisions must remain explicit on privileged routes. Do not equate successful JWT verification with permission to perform billing/admin operations.

## 5. Data-access architecture

There are three important database access surfaces:

- `server/storage.ts` — broad legacy/primary storage abstraction
- `server/lib/neonDb.ts` — direct PostgreSQL query helper used by newer operational code
- Supabase JS service client — used where auth/admin or Supabase-native behavior is appropriate

`shared/schema.ts` provides shared/Drizzle schema definitions, but production reality is the live PostgreSQL schema. For migrations or destructive changes, inspect live dependencies first.

## 6. Enrollment payment flow

Normal enrollment payment path:

```text
Enrollment UI
        |
        v
EPXHostedPayment component
        |
        v
POST normal EPX Hosted Checkout create route
        |
        v
EPX-hosted secure payment form
        |
        v
EPX callback / completion route
        |
        v
platform payment record
        |
        v
successful-payment finalization
        |
        +--> member/subscription state
        +--> recurring credential/reference storage when available
        +--> PaymentConfirmedService
              |
              +--> commission generation
              +--> commission ledger sync
              +--> financial processing state
```

Protected normal-payment files:

- `server/routes/epx-hosted-routes.ts`
- `client/src/components/EPXHostedPayment.tsx`
- `server/services/epx-hosted-checkout-service.ts`
- `server/services/epx-payment-service.ts`

The duplicate-payment protections in this path are intentional and must not be weakened to solve maintenance/operator problems.

## 7. Payment-method maintenance flow

Entry route:

`POST /api/members/:memberId/payment-methods/checkout`

Implementation: `server/routes/member-payment-method-checkout.ts`.

Actions:

### `add`

Card only. Creates a $1 Hosted Checkout verification session. Metadata marks the transaction as payment-method verification, excludes it from membership payment/commission processing, and records that manual reversal is required.

### `replace`

Same verification model as `add`, with replacement intent recorded.

### `pay_now`

Uses the current active subscription amount and proceeds as a real payment. This is also the supported ACH path when a reusable recurring credential must be created from a live authorized payment.

Maintenance uses the existing Hosted Checkout service but has a separate route/decision layer.

## 8. Recurring billing scheduler plane

Scheduling is external to the app process.

Supabase migration `scripts/sql/2026-09-02b_recurring_billing_external_schedule.sql` provisions the scheduler model:

```text
pg_cron
  every 5 min -> billing invocation
  every 10 min -> health invocation
        |
        v
pg_net HTTP POST
        |
        v
DigitalOcean protected internal routes
```

Scheduler configuration is stored in `public.recurring_billing_configuration` and secrets are retrieved from Supabase Vault by SQL functions.

Application safety gates remain authoritative as a second safety plane.

## 9. Durable recurring billing worker

Primary service: `server/services/durable-recurring-billing-service.ts`.

Key constants:

- billing timezone: `America/Chicago`
- max cycles per worker run: 25
- lease: 120 seconds
- max confirmed-decline processor attempts: 2

High-level execution:

```text
Select due subscriptions
        |
        +--> resolve credential
        |      |
        |      +--> missing/conflict -> operational exception, no charge
        |
        v
create durable cycle if absent
        |
        v
claim eligible cycles with DB lease
        |
        v
mark submitting
        |
        v
EPX Server Post
        |
        +--> verifiable success
        |       |
        |       v
        |   SQL finalize recurring-cycle success
        |       |
        |       v
        |   PaymentConfirmedService
        |       |
        |       +--> success -> completed
        |       +--> internal failure -> internal_sync_pending
        |
        +--> verifiable decline
        |       |
        |       +--> retry once after delay if attempt 1
        |       +--> operator attention after attempt 2
        |
        +--> unverifiable response/transport
                |
                v
             unknown
             no blind retry
```

## 10. Durable cycle state model

Operationally important states:

- `ready` — queued but not claimed
- `claimed` — leased to a worker; no processor submission yet
- `submitting` — processor submission started
- `declined` — verifiable processor decline
- `unknown` — transport/response cannot prove success or decline
- `internal_sync_pending` — payment exists; downstream internal synchronization failed
- `completed` — successful payment finalization and downstream processing completed
- `cancelled` — cycle intentionally terminated
- `skipped` — no processor submission by design

### State safety rules

- A lease may safely recover a `claimed` cycle only if submission never began.
- A `submitting` cycle is a possible capture. Reconcile before any resubmission.
- An `unknown` cycle is a possible capture. Reconcile before any resubmission.
- `internal_sync_pending` must never call EPX again for the same successful payment.

## 11. Recurring credential resolution

Durable billing attempts recurring credentials in this order:

1. `payment_tokens.original_network_trans_id`
2. `payments.epx_auth_guid`
3. `payment_tokens.bric_token`

References must pass the current canonical processor-reference format check and must not conflict across members.

No usable credential means no charge. The system surfaces an exception instead.

## 12. Idempotency and duplicate-charge defenses

The recurring system uses several layers:

- deterministic processor reference: `RECUR-<subscriptionId>-<YYYYMMDD>`
- unique durable cycle per `(subscription_id, cycle_date)`
- unique processor reference
- database claim leases
- state transition to `submitting` before processor call
- successful-payment transaction-id uniqueness/finalizer checks
- idempotent PaymentConfirmedService behavior

Do not remove any layer merely because another layer appears sufficient.

## 13. Confirmed payment financial pipeline

Primary service: `server/services/payment-confirmed-service.ts`.

Responsibilities after money is confirmed:

```text
successful payment
      |
      +--> payment timestamps / verification fields
      +--> member activation/state
      +--> preserve first payment data
      +--> lineage snapshot
      +--> commission generation if absent
      +--> commission ledger synchronization
      +--> financial-processing status
      +--> admin notification
```

A recurring-cycle processor success can therefore produce two distinct failure classes:

1. money-moving failure — processor did not confirm success
2. internal financial-sync failure — processor succeeded, but commission/ledger/application sync failed

Only the first class may involve a future processor attempt. The second is an internal repair problem.

## 14. Commission architecture

Commission generation is downstream of confirmed payment.

Important modules include commission generation, lineage snapshots, ledger synchronization, payout scheduling, and payout dashboard/services under `server/services/`.

Rules:

- no successful payment -> no payable commission event
- lineage/commission generation should be idempotent for the same source payment
- payout batching is separate from payment confirmation
- refunds/cancellations/clawbacks have dedicated policy/tests and should not be inferred from enrollment state alone

## 15. Cancellation and lifecycle interactions

Scheduled cancellation finalization is part of the durable billing lifecycle for live unscoped runs.

Cancellation finalization must not race with a processor submission. A subscription with an in-flight `submitting` cycle is treated carefully rather than immediately terminated under it.

Billing eligibility generally requires active member/subscription state, automatic billing mode, due billing date, no effective cancellation, and a usable credential.

## 16. Health and observability

Primary health surfaces:

- `/api/health` — process health
- `/api/ready` — backend readiness including Supabase service-role capability
- recurring billing health endpoint — checks scheduler freshness and exceptional durable states
- admin notifications — recurring billing exceptions and payment-processing events
- DigitalOcean logs — runtime/process diagnostics

Recurring billing health should distinguish:

- stale scheduler
- failed/stuck run
- `unknown`
- stranded `submitting`
- `internal_sync_pending`

These states require different operator actions.

## 17. CI architecture

Workflow: `.github/workflows/webpack.yml`.

Required PR checks:

### `validation`

- Node/npm runtime verification
- root dependency install
- client dependency install
- TypeScript baseline check

### `billing-validation`

- durable billing behavior
- internal billing route safety
- scheduler policy
- payment credential policy
- staging billing safety
- production build

### `durable-postgres`

- isolated PostgreSQL container
- durable recurring billing database integration

These checks are required by the `Protect main` ruleset.

## 18. Protected-change matrix

| Area | Risk | Default engineering posture |
|---|---|---|
| Normal EPX Hosted Checkout | Critical | Preserve behavior; isolate fixes around it |
| EPX Server Post recurring | Critical | Change only with targeted tests and transaction-shape review |
| Durable billing state machine | Critical | Preserve idempotency and possible-capture rules |
| PaymentConfirmedService | Critical | Preserve idempotency and commission boundary |
| Commission ledger/payout | High | Validate accounting consequences |
| `server/storage.ts` | High | Surgical changes only |
| `server/routes.ts` | High | Avoid broad refactor |
| Supabase migrations | High | Verify live dependencies first |
| Auth/impersonation | High | Preserve role and audit semantics |
| UI-only presentation | Moderate | Still verify no financial side effects |
| Docs/tests | Lower | Keep aligned with current implementation |

## 19. Source-of-truth hierarchy

When sources disagree, prefer:

1. verified live production behavior/configuration
2. current `main` code
3. current CI safety tests
4. recent production migrations
5. current operational documentation
6. older runbooks/README prose

Do not revive stale behavior because an old document still describes it.

## 20. Design principle for future work

The platform is safer when new operational capabilities are layered around stable financial boundaries.

Examples:

- billing operations UI should consume durable billing/payment state rather than invent a new payment path
- credential repair should use the isolated maintenance route rather than weaken enrollment guards
- reconciliation should mark/repair platform state from verified evidence rather than automatically resubmit ambiguous transactions
- developer tooling should improve visibility before changing financial semantics

That principle should guide the next phase of platform development.
