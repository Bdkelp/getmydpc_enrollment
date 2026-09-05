# Developer Onboarding — MPP Enrollment Platform

> This repository handles live membership enrollment, payments, recurring billing, commissions, and administrative operations. Treat changes to money-moving code as production-financial changes, not ordinary application refactors.

## 1. Start here

Production stack:

- Frontend: React 18 + TypeScript + Vite
- Backend: Node.js 22 + Express + TypeScript
- Database/Auth: Supabase PostgreSQL + Supabase Auth
- Payments: EPX Hosted Checkout for interactive checkout; EPX Server Post for recurring billing
- Hosting: DigitalOcean App Platform
- Package manager: npm 11.8.0
- Production branch: `main`

The repository uses two dependency trees. Install both before local validation:

```bash
npm ci
npm ci --prefix client
```

Current runtime requirements are authoritative in `package.json`, `.nvmrc`, `.node-version`, and CI. Do not rely on older setup prose that mentions an earlier Node version.

## 2. Production change discipline

`main` is protected by the `Protect main` GitHub ruleset.

Normal workflow:

1. Branch from current `main`.
2. Make one coherent change.
3. Run targeted local validation.
4. Open a PR against `main`.
5. Required GitHub checks must pass:
   - `validation`
   - `billing-validation`
   - `durable-postgres`
6. Merge only after the PR is current with `main` and review conversations are resolved.
7. Confirm DigitalOcean deployment is green.

Do not bundle cleanup, dependency upgrades, payment behavior, database migrations, and unrelated UI changes into one PR.

## 3. Business invariants to understand before changing code

These are application rules, not implementation suggestions.

- MPP membership activation depends on a successful payment; an active-looking record alone is not proof money moved.
- Commissions and overrides are created only after a successful, confirmed payment.
- Recurring billing follows the member's billing anniversary/first-payment anchor. Plan effective-date rules such as the 1st/15th are a separate concern.
- A normal enrollment payment must keep its duplicate-payment protections.
- Explicit payment-method maintenance (`add`, `replace`, `pay_now`) is intentionally isolated so it does not fall through the normal enrollment duplicate guard.
- A confirmed decline may receive at most two unattended processor submissions for the same durable billing cycle. After the second confirmed decline, stop unattended retries and surface an operator exception.
- An ambiguous processor result (`unknown` or a cycle stranded after submission) is a possible capture. Do not automatically resubmit it.
- If the processor charge succeeded but internal commission/ledger work failed, repair the internal state only. Do not charge again.
- Missing or invalid recurring credentials are an operational exception, not permission to invent/recover a token or submit a processor charge.
- Platform EPX payment rows, processor references, tokens, durable billing records, and successful payment records are the normal source of truth. External merchant-portal data is reconciliation evidence, not a runtime dependency.

## 4. Repository map

### Frontend

Primary application code lives in `client/src/`.

Important areas:

- `client/src/lib/apiClient.ts` — frontend API base/client behavior
- `client/src/components/EPXHostedPayment.tsx` — interactive EPX Hosted Checkout UI; financially sensitive
- admin/member/agent pages under `client/src/pages/`

### Backend bootstrap

- `server/index.ts` — application bootstrap, middleware, route mount order, static serving, startup workers
- `server/routes.ts` — large legacy route collection; modify narrowly
- newer/sensitive routes are increasingly isolated under `server/routes/`

### Authentication and authorization

- `server/auth/supabaseAuth.ts` — bearer-token verification using Supabase Auth, local user lookup/creation, approval/active checks, role normalization, and impersonation context
- `server/auth/roles.ts` — role hierarchy and full-access email behavior

Passport is not the active authentication system.

### Data access

- `server/storage.ts` — major data-access/service boundary; much of the application expects queries to flow through storage helpers
- `shared/schema.ts` — Drizzle/shared schema definitions
- `server/lib/neonDb.ts` — direct PostgreSQL query path used by several newer services
- `server/lib/supabaseClient.ts` — Supabase service/client setup

Production database state may contain operational changes not obvious from older migration history. Before destructive DDL, verify the live Supabase schema and dependencies rather than assuming a local schema file tells the whole story.

## 5. Payment architecture — protected zones

### Normal enrollment Hosted Checkout

Treat these files as protected financial infrastructure:

- `server/routes/epx-hosted-routes.ts`
- `client/src/components/EPXHostedPayment.tsx`
- `server/services/epx-hosted-checkout-service.ts`
- `server/services/epx-payment-service.ts`

Do not casually redesign:

- Hosted Checkout create/complete/callback semantics
- successful-enrollment duplicate guards
- card/ACH transaction types or request shapes
- credential extraction/storage behavior
- processor reference/idempotency behavior

If a bug can be fixed in an operator/maintenance adapter without changing the certified normal enrollment path, prefer the adapter.

### Member payment-method maintenance

`server/routes/member-payment-method-checkout.ts` is mounted before the normal EPX Hosted Checkout router in `server/index.ts` on purpose.

Supported actions:

- `add`
- `replace`
- `pay_now`

Important behavior:

- Card Add/Replace creates a $1 verification transaction/session and marks it as payment-method verification, excluded from membership revenue/commission processing, with manual reversal required.
- `pay_now` uses the real active subscription amount.
- ACH Add/Replace without a payment is rejected; the current supported path is Pay Now & Use for Recurring so EPX can authorize and save the recurring credential.

Do not weaken the normal enrollment duplicate guard to make maintenance work. Keep maintenance isolated.

## 6. Recurring billing architecture

Recurring billing is externally scheduled. It is **not** started by application boot.

High-level path:

```text
Supabase pg_cron / pg_net
        |
        v
POST /api/internal/recurring-billing/run
        |
        v
Durable recurring billing service
        |
        v
PostgreSQL recurring billing cycles + leases
        |
        v
EPX Server Post recurring transaction
        |
        v
SQL successful-cycle finalizer -> payments/subscription dates
        |
        v
PaymentConfirmedService
        |
        v
commission generation + commission ledger sync
```

Key files:

- `server/routes/internal-recurring-billing.ts`
- `server/routes/internal-recurring-billing-run-handler.ts`
- `server/services/durable-recurring-billing-service.ts`
- `server/services/durable-recurring-billing-engine.ts`
- `server/services/epx-payment-service.ts`
- `server/services/payment-confirmed-service.ts`
- `server/storage.ts`
- `scripts/sql/2026-09-02b_recurring_billing_external_schedule.sql`
- subsequent durable-billing lifecycle SQL migrations under `scripts/sql/`

Current durable controls include:

- maximum 25 cycles claimed per run
- 120-second claim lease
- deterministic processor reference per subscription/cycle date
- maximum two processor attempts for a confirmed decline
- code `51` retry delay: one day
- other confirmed-decline retry delay: two days
- `unknown` results are not automatically retried
- `internal_sync_pending` retries internal processing without another processor charge

A legacy `server/services/recurring-billing-scheduler.ts` still exists for historical/compatibility policy coverage, but `server/index.ts` does not start it. Do not re-enable an in-process recurring scheduler without a deliberate architecture review.

## 7. Successful payment / commission boundary

`server/services/payment-confirmed-service.ts` is the important boundary after confirmed money movement.

Its responsibilities include:

- confirm/link successful payment state
- activate/update member payment state idempotently
- preserve first-payment timestamps
- create or reuse commission lineage snapshots
- generate direct/override commission records when appropriate
- synchronize commission ledger state
- record financial-processing status and notifications

The scheduled biller does not itself mean "pay agents now." It confirms payments and creates/synchronizes commission accounting records; payout batching is a separate operation.

## 8. Billing safety states

When diagnosing a cycle, distinguish these classes:

- `ready` / `claimed` — processor submission has not yet become an ambiguous capture
- `submitting` — submission has begun; treat a stranded record as possible capture
- `declined` — processor returned a verifiable decline
- `unknown` — transport/response was not verifiable; never blind-resubmit
- `internal_sync_pending` — processor/payment success exists; only downstream internal work remains
- `completed` — payment and durable cycle finalization completed
- `cancelled` / `skipped` — intentionally not charged

Selected candidates and claimed cycles are different metrics. An unscoped run may claim an older eligible durable cycle created by an earlier run.

## 9. CI and validation

CI definition: `.github/workflows/webpack.yml`.

Useful local commands:

```bash
npm run check
npm run build
npm run test:durable-billing
npm run test:internal-billing-route
npm run test:scheduler
npm run test:payment-credential
npm run test:member-payment-methods
npm run test:plan-start-dates
npm run test:staging-billing-safety
npm run test:hosted-checkout-semantics
npm run test:payment-confirmed-service
npm run test:commission-payout-schedule
npm run test:commission-ledger-payout-flow
npm run test:commission-consolidation-phase2c
npm run test:cancellation-refund-eligibility
npm run test:commission-refund-clawback
```

`npm run check` uses the committed TypeScript baseline. `npm run check:strict` is intentionally stricter and may expose legacy debt outside the scope of a focused change.

The PostgreSQL durable-billing integration test requires an isolated test database via `DURABLE_BILLING_TEST_DATABASE_URL`; GitHub CI provisions PostgreSQL for this job.

For payment/billing work, a production build passing is necessary but not sufficient. Run the targeted safety tests for the subsystem touched.

## 10. Deployments and environments

Production is DigitalOcean App Platform with Supabase as database/auth.

- Auto-deploy source: `main`
- Application health: `/api/health`
- Application readiness: `/api/ready`
- readiness returns 503 when the backend cannot operate with the Supabase service role
- DigitalOcean deployment must be confirmed green after a production merge

Do not commit `.env` files or secrets. Never paste processor keys, Supabase service-role keys, scheduler bearer tokens, database passwords, or encryption material into code, issues, PR bodies, test fixtures, or documentation.

Recurring billing has two safety planes: database scheduler configuration and application environment gates. A database cron being active does not by itself authorize a live charge if application gates block live execution.

## 11. Database changes

Treat migrations as production operations.

Before adding or dropping a table, function, index, policy, or column:

1. Inspect current production Supabase state.
2. Search repository consumers.
3. Check views, functions, triggers, FKs, RLS policies, and external/runtime usage.
4. Prefer additive/backward-compatible migrations first.
5. Separate schema migration from unrelated application refactors.
6. Have a rollback/recovery plan before applying destructive DDL.

Never use a cleanup PR as a reason to drop a production database object merely because repository code does not reference it.

## 12. Known technical debt / caution areas

- `server/routes.ts` and `server/storage.ts` are large legacy files. Keep edits surgical.
- The TypeScript baseline intentionally tolerates existing legacy errors; do not normalize the baseline upward to hide new errors.
- Some older runbooks/readme text may lag current implementation. Prefer current code, CI, verified production configuration, and recent migrations when sources disagree.
- The legacy in-process recurring scheduler remains in the repository but is not the active scheduler.
- Dependency/security upgrades should be isolated from payment/billing behavior changes.
- Debug/admin routes exist. Preserve authentication/authorization and do not expose operational internals publicly.

## 13. First-day developer checklist

Before changing production behavior, a new developer should be able to answer:

- Which path handles normal enrollment checkout?
- Why is payment-method maintenance mounted before the normal EPX router?
- What prevents a durable billing cycle from being charged twice?
- What is the difference between `declined`, `unknown`, and `internal_sync_pending`?
- Where does a confirmed payment turn into commission accounting?
- Why is billing anniversary logic separate from plan effective dates?
- Which GitHub checks must pass before merging?
- How is DigitalOcean production health verified after merge?

If any of those are unclear, read `ARCHITECTURE.md` and the referenced files before touching the financial path.
