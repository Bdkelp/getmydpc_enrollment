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
npm run test:payment-credential-restore
npm run test:north-reconciliation
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

### Reconciling North payments (Billing Ops)

Use **Reconcile North payment** on the Billing Ops page (Super Admin only) for subscriptions held with `historical_cycle_requires_reconciliation`, or any month paid directly in North. It never submits a charge and never changes member status, billing mode, or payment credentials. Unlike the workflow above, it keeps `billing_mode` as it is, so a subscription in `automatic` stays in normal one-cycle-at-a-time billing.

Enter the member ID, subscription ID, and billing month, then choose a decision:

- **Paid through North:** payment method (Card / ACH), North payment date, amount, and evidence (an external invoice/order reference and/or the North Tran ID / BRIC; the authorization code is optional). This records the existing settled pattern: a `succeeded` payment (`verification_method = manual_admin`, `metadata.source = manual_external_reconciliation`, `metadata.externalSettlement`) and a `completed` cycle with `payment_method_type = External` and `credential_source = manual_external_owner_confirmed`. The transaction ID and processor reference are `NORTH-EXT-<subscription>-<YYYYMMDD>`.
- **Waive platform gap:** a reason is required. This records a `skipped` cycle (`credential_source = platform_gap_waived`) with no payment. Only historical cycles can be waived, never the current one.

Always **Preview** first. **Record reconciliation** is enabled only for the exact inputs that were previewed.

Rules:

- **In order.** Only the cycle at the subscription's `next_billing_date` can be reconciled. If you enter September while August is open, nothing is recorded and the open cycles are listed with the policy action: cycles before August 2026 are platform gaps to waive (collection needs explicit approval later); August 2026 onward can be reconciled, waived, or, for a single missing cycle, collected through the member's **Pay Now & Use for Recurring**.
- **Advancement.** `next_billing_date`, `current_period_start`, and `current_period_end` move past the reconciled cycle and any later cycle already recorded as completed or waived, never past an open month.
- **Hold release.** When only the current cycle remains, the historical-cycle hold lifts and normal billing charges that one cycle on the next live run.
- **Idempotent.** Reconciling a month that already has a settled or waived record returns it without new rows or a second advance.
- **Refusals (no changes made).** The same North evidence already recorded anywhere; a successful platform payment already in that cycle period; a cycle already recorded by billing; a cancelled member or subscription; a payment date in the future or more than a month before the cycle; a cycle not yet due.
- **Commissions.** After recording, the payment goes through PaymentConfirmedService only if the member is already active, because that service sets member status to active. For other members, commission processing is reported as deferred. If processing fails, reconciling the same month again retries it safely.
- **Audit.** Every reconciliation, including replays, writes a `billing_cycle_reconciled` entry to `enrollment_modifications`.

### Restoring a credential from North Tran ID / BRIC

Use this when a due subscription is skipped with `missing_or_invalid_processor_reference` or `legacy_encrypted_credential_unavailable` and the member's BRIC is available in the North portal (North shows the BRIC as Tran ID). Per `docs/vendor/epx/EPX_CERTIFICATION_REFERENCE.md`, the BRIC alone is the certified recurring credential. `AUTH_CODE`, amount, date, and MID are not required.

1. As a Super Admin, open the member's payment methods (member profile, or the admin manual EPX card with the member ID).
2. On the default payment method, choose **Restore North Tran ID / BRIC** and enter the value from North. The button appears only when that method's stored credential is unusable.
3. Save. The server validates the value with the canonical credential resolver and stores it in `payment_tokens.bric_token`. It writes a `payment_credential_restored` audit entry to `enrollment_modifications` with the member, token, operator, time, and a reference masked to its last four characters.

If the member has **no active payment method at all**, the panel shows **Add from North Tran ID / BRIC** instead. Choose the payment method type explicitly: **Card** (`CreditCard`, billed as `CCE1`) or **Bank account (ACH)** (`ACH`, billed as BRIC-based `CKC2`). Then enter the value. This creates one active default `payment_tokens` row holding only the BRIC; card and bank display details stay empty. If the member already has an active payment method, use the restore on that method instead.

The restore or create is refused when:

- the value or payment method type is malformed (400);
- the member is cancelled (409). Cancelled accounts are never restored or reactivated through this action;
- the member doesn't exist (404);
- restore only: the token isn't the member's active default (404), or its stored BRIC is already usable (409);
- create only: the member already has an active payment method (409);
- billing already has a *different* usable `original_network_trans_id` or payment `AUTH_GUID` for the member, so the BRIC would never be used (409);
- the value is already recorded for another member or group (token or payment), or on another of this member's tokens in either credential column (409).

Saving submits no charge and doesn't change member status, `original_network_trans_id`, `payments.transaction_id`, `processor_reference`, subscription dates or status, billing cycles, or payment status.

**A restore makes the subscription billable on the next live run.** If the subscription is active, automatic, and due, the next scheduled live run charges its due cycle once. Check the subscription's `next_billing_date` before restoring. Confirm the historical-cycle hold (PR #23) is deployed first. Subscriptions with unreconciled historical months then stay held, with no charge, until they are reconciled.

### Scheduled cancellations

Each worker run first invokes `finalize_due_scheduled_cancellations` using the current Chicago business date. Repeated invocation is idempotent: only subscriptions still in `scheduled_cancellation` with an effective date due on or before that business date transition to `cancelled`.

## Secret rotation handoff

Because root `.env` was previously tracked, repository history may contain these secret classes: database URLs, Supabase service-role keys, EPX terminal/MAC credentials, email provider keys, auth/JWT secrets, and OAuth credentials. Owners must rotate any real values found in history and update DigitalOcean/Supabase secret stores. Removing the file from the current index does not erase Git history.
