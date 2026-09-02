# Durable Recurring Billing Runbook

## Safety boundary

Recurring billing is card-only and externally triggered. Web process startup never runs billing. EPX transport errors or responses without verifiable processor fields become `unknown` and are never automatically resubmitted. There is no North or EPX transaction-lookup integration.

Do not enable live mode, repair production lifecycle data, or finalize an `unknown` cycle without explicit Super Admin approval and merchant-portal evidence.

## Deployment order

Preview successful-payment transaction ID duplicates before adding the unique index:

```sql
SELECT transaction_id, COUNT(*)
FROM public.payments
WHERE transaction_id IS NOT NULL
  AND status IN ('success', 'succeeded', 'completed')
GROUP BY transaction_id
HAVING COUNT(*) > 1;
```

1. Confirm the cancellation metadata migration `2026-08-20f_cancellation_refund_workflow.sql` is installed.
2. Confirm the duplicate transaction preview above returns no rows.
3. Apply `scripts/sql/2026-09-02_recurring_billing_durable_cycles.sql`.
4. Apply `scripts/sql/2026-09-02c_subscription_billing_mode_lifecycle.sql`.
5. Run `npm run audit:billing-lifecycle`. Review all rows; do not run the repair command without Super Admin approval.
6. Deploy the application with DigitalOcean.
7. Set DigitalOcean variable names from `.env.example`. Generate `BILLING_SCHEDULER_TOKEN` in the secret manager; never commit its value.
8. Add Supabase Vault secrets named `billing_scheduler_run_url`, `billing_scheduler_health_url`, and `billing_scheduler_token`.
9. Apply `scripts/sql/2026-09-02b_recurring_billing_external_schedule.sql` last.

The schedule migration starts with `enabled=false`, `mode='dry_run'`, and `kill_switch=true`.

The migration enables RLS on durable billing runs and cycles, revokes access from `anon` and `authenticated`, and grants table/function access only to `service_role`. Verify those grants in staging before enabling the scheduler.

## Pre-deployment validation

CI and local validation require Node 22.21.1 and npm 11.8.0. Run:

```bash
npm run check
npm run test:durable-billing
npm run test:scheduler
npm run test:payment-credential
npm run build
```

The real PostgreSQL suite requires an isolated local test database whose URL contains `localhost`, `127.0.0.1`, or `test`:

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/durable_billing_test npm run test:durable-billing:postgres
```

It applies the durable migrations inside the disposable database and verifies concurrent claims, expired leases, subscription-targeted claims, Chicago billing-date advancement, repeated finalization, transaction identity conflicts, internal-sync claims, and RLS denial. Never point it at production.

## Dry-run rollout

1. Keep `EXTERNAL_BILLING_DRY_RUN=true` and `RECURRING_BILLING_KILL_SWITCH=true` in DigitalOcean.
2. Set the database scheduler to enabled dry-run while retaining its kill switch until the endpoint and token are verified.
3. Remove only the database kill switch to begin scheduled dry runs. The application dry-run gate still prevents charges.
4. Observe multiple scheduled runs in `recurring_billing_runs` and compare candidates with `npm run audit:billing-lifecycle`.
5. Confirm `/api/internal/recurring-billing/health-check` reports no failed/stuck runs and no `unknown`, `submitting`, or `internal_sync_pending` cycles.

For a canary run, pass explicit subscription IDs through the Super Admin trigger. The same IDs constrain candidate selection and SQL cycle claiming; unrelated subscriptions cannot be claimed into that run. An empty target list is rejected rather than treated as an unscoped run.

## Live approval

Live processing requires all of these controls:

- DigitalOcean `EXTERNAL_BILLING_ENABLED=true`
- DigitalOcean `EXTERNAL_BILLING_DRY_RUN=false`
- DigitalOcean `RECURRING_BILLING_KILL_SWITCH=false`
- Simulation flags false
- Supabase scheduler `enabled=true`, `mode='live'`, `kill_switch=false`
- Written Super Admin approval after dry-run review

Change one plane at a time and verify health after each change. No deployment or restart initiates a catch-up charge.

## Emergency stop

Set either kill switch immediately. Prefer setting both:

- DigitalOcean `RECURRING_BILLING_KILL_SWITCH=true`
- Supabase `recurring_billing_configuration.kill_switch=true`

Do not delete cycle or payment rows. Preserve them for reconciliation. Application rollback is secondary to disabling the external trigger.

## Reconciliation

### Unknown or submitting

Treat both as possible captures. Do not retry. Search the EPX merchant portal using `processor_reference`, amount, member, and submission time. Record evidence and obtain Super Admin approval before any production correction. If captured, finalize against the existing cycle/reference; if absent is authoritatively established, use a reviewed repair procedure to return the same cycle to `ready`. The repository intentionally provides no automatic absent/captured lookup.

### Internal sync pending

The processor success and payment row already exist. Do not submit EPX again. The internal-sync claim path leases only `internal_sync_pending` cycles with an existing `payment_id`, re-runs only `PaymentConfirmedService`, and then marks the cycle complete after commission/ledger verification. It never calls the processor.

### Confirmed decline

Only cycles with `failure_classification='confirmed_decline'` and a non-null due `next_attempt_at` are reclaimable. Attempt limits are controlled by `RECURRING_BILLING_MAX_ATTEMPTS_PER_CYCLE`.

### Manual external payments

The Super Admin external-settlement workflow requires method and external reference evidence. It sets the linked subscription to `manual_external`, excluding it from unattended billing until recurring credentials are explicitly reviewed and the mode is deliberately restored to `automatic`.

### Scheduled cancellations

Each worker run first invokes `finalize_due_scheduled_cancellations` using the current Chicago business date. Repeated invocation is idempotent: only subscriptions still in `scheduled_cancellation` with an effective date due on or before that business date transition to `cancelled`.

## Secret rotation handoff

Because root `.env` was previously tracked, repository history may contain these secret classes: database URLs, Supabase service-role keys, EPX terminal/MAC credentials, email provider keys, auth/JWT secrets, and OAuth credentials. Owners must rotate any real values found in history and update DigitalOcean/Supabase secret stores. Removing the file from the current index does not erase Git history.
