# Phase 1 — Recurring Billing Status

## 1. Implementation Status

- **Card-only**: Phase 1 processes credit card subscriptions exclusively (CCE1 transaction type)
- **ACH excluded**: Filtered out at query level (`payment_method_type = 'CreditCard'`) and enforced by runtime guard
- **Dry-run safe**: Defaults to `BILLING_SCHEDULER_DRY_RUN=true` — logs intended charges without submitting to EPX
- **Scheduler does NOT update `next_billing_date`**: The EPX webhook in `epx-hosted-routes.ts` is the sole owner of billing date advancement, payment record creation, and commission triggering
- **Idempotency**: Keyed on subscription ID + scheduled billing cycle date (deterministic transaction ID: `RECUR-{subId}-{YYYYMMDD}`)
- **Locking**: PostgreSQL advisory lock — no sentinel rows written to any billing table
- **Stale pending recovery**: Verifies payment existence and billing date advancement before marking entries failed

### Files created/modified

| File | Role |
|------|------|
| `server/services/recurring-billing-scheduler.ts` | Scheduler service (created) |
| `server/storage.ts` | Added 5 query/log helper functions + `BillableSubscription` interface |
| `server/index.ts` | Wired `scheduleRecurringBilling()` into server startup |
| `.env.example` | Added `BILLING_SCHEDULER_ENABLED`, `BILLING_SCHEDULER_DRY_RUN`, `BILLING_SCHEDULER_INTERVAL_MS` |

---

## 2. Safety Audit Result — 8/8 PASS

- **No `next_billing_date` mutation** — scheduler only reads, never writes
- **`dry_run` does not block live billing** — idempotency filter checks `['success', 'pending']` only
- **Stale pending verified** — checks `getPaymentByTransactionId()` and subscription date advancement before resolving
- **Lock writes nothing to `recurring_billing_log`** — uses `pg_try_advisory_lock` / `pg_advisory_unlock`
- **ACH excluded at both query and runtime** — DB filter + `paymentMethodType !== 'CreditCard'` guard
- **Webhook/payment/commission code untouched** — no references to scheduler in `epx-hosted-routes.ts`, `commission-service.ts`, or `epx-payment-service.ts`
- **Deterministic transaction ID** — `RECUR-{subscriptionId}-{YYYYMMDD}` from scheduled billing date
- **Idempotency uses scheduled date** — `sub.nextBillingDate`, not `new Date()`

---

## 3. Remaining Pre-Deployment Checks

1. **Advisory lock RPC availability**: Confirm `pg_try_advisory_lock` and `pg_advisory_unlock` are callable via `supabase.rpc()`. If Supabase PostgREST does not expose them, create thin SQL wrapper functions and grant execute.

2. **`recurring_billing_log` table existence**: Verify the table exists with required columns: `subscription_id`, `member_id`, `payment_token_id`, `amount`, `billing_date`, `attempt_number`, `status`, `epx_transaction_id`, `epx_auth_code`, `epx_response_code`, `epx_response_message`, `failure_reason`, `next_retry_date`, `payment_id`, `processed_at`, `created_at`.

3. **Webhook creates payment row for recurring charges**: Confirm the EPX webhook inserts a `payments` row when processing recurring transaction responses — required for stale-pending verification via `getPaymentByTransactionId()`.

---

## 4. Sandbox Test Sequence

### Step 1 — Dry-run validation
- Set `BILLING_SCHEDULER_ENABLED=true`, `BILLING_SCHEDULER_DRY_RUN=true`
- Start server, wait for first cycle (15s delay)
- Confirm logs show `DRY RUN` with correct subscription/amount/card data
- Confirm `recurring_billing_log` entries have `status = 'dry_run'`
- Confirm no EPX calls made, no `next_billing_date` changes

### Step 2 — Restart/rerun idempotency
- Restart server without clearing `dry_run` log entries
- Confirm second cycle skips already-processed subscriptions (idempotency)
- Flip to `BILLING_SCHEDULER_DRY_RUN=false`
- Confirm live cycle runs and is NOT blocked by prior `dry_run` entries

### Step 3 — Sandbox live card test
- Set `BILLING_SCHEDULER_DRY_RUN=false` against EPX sandbox
- Ensure at least one active subscription with a valid BRIC token and `next_billing_date` in the past
- Confirm `recurring_billing_log` entry transitions: `pending` → `success`
- Confirm EPX response fields populated (transaction ID, auth code)
- Confirm `next_billing_date` was NOT advanced by the scheduler
- Confirm webhook (if triggered) handles the billing date advancement separately

---

## 5. Phase 2 — Deferred Scope

- **ACH recurring billing**: Remove `CreditCard` filter, add ACH transaction type support
- **SEC code handling**: Determine correct SEC code (WEB vs TEL) per ACH transaction context
- **BRIC token lifetime**: Verify EPX BRIC token validity window for ACH, confirm storage/refresh strategy
- **ACH return/retry logic**: Handle R01–R29 return codes, implement appropriate retry windows and member notification
