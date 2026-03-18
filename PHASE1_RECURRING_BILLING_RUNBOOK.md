# Phase 1 — Recurring Billing Execution Runbook

Card-only. ACH excluded. No architecture changes.

---

## SECTION 1 — Pre-Implementation Gate

All must be true before writing any scheduler code:

- [ ] EPX Server Post API documentation reviewed for CCE1 recurring transaction type
- [ ] `submitServerPostRecurringPayment()` exists in `epx-payment-service.ts` and accepts `authGuid`, `amount`, `transactionId`, `tranType`, `member`, `description`
- [ ] `payment_tokens` table stores BRIC tokens with `payment_method_type = 'CreditCard'` and `is_active` flag
- [ ] `subscriptions` table has `next_billing_date`, `status`, `amount`, and FK to `payment_tokens`
- [ ] `decryptPaymentToken()` exists in `storage.ts` and returns the raw BRIC/AuthGUID
- [ ] Existing webhook in `epx-hosted-routes.ts` is confirmed as sole owner of: `next_billing_date` advancement, `payments` row creation, commission triggering
- [ ] `membership-activation-service.ts` pattern confirmed as template for scheduler init (setTimeout + setInterval, export function called from `index.ts`)
- [ ] `.env.example` reviewed for existing env var conventions

---

## SECTION 2 — Local Implementation Order

Execute in this exact sequence. Each step is additive.

1. **Add storage helpers to `server/storage.ts`**
   - `BillableSubscription` interface
   - `getSubscriptionsDueForBilling()` — card-only query with `payment_method_type = 'CreditCard'` filter
   - `insertRecurringBillingLog()`
   - `updateRecurringBillingLog()`
   - `hasExistingBillingLogEntry()` — idempotency check on `['success', 'pending']` only
   - `getStalePendingBillingLogs()`

2. **Create `server/services/recurring-billing-scheduler.ts`**
   - Import storage helpers + `submitServerPostRecurringPayment` + `supabase`
   - Advisory lock via `pg_try_advisory_lock` / `pg_advisory_unlock`
   - `generateTransactionId()` — deterministic `RECUR-{subId}-{YYYYMMDD}`
   - `truncateBillingDate()` — normalize to midnight UTC
   - `runBillingCycle()` — acquire lock → resolve stale pending → query due subs → process each
   - `processSubscription()` — ACH guard → idempotency check → decrypt token → dry-run path → live path
   - `scheduleRecurringBilling()` — env-gated init with setTimeout + setInterval
   - Scheduler must NOT update `next_billing_date` anywhere

3. **Wire into `server/index.ts`**
   - Import `scheduleRecurringBilling`
   - Call after `scheduleMembershipActivation()` in the `server.listen` callback

4. **Update `.env.example`**
   - `BILLING_SCHEDULER_ENABLED=false`
   - `BILLING_SCHEDULER_DRY_RUN=true`
   - `BILLING_SCHEDULER_INTERVAL_MS=3600000`

---

## SECTION 3 — Local Validation Order

### Can be validated locally

- [ ] **TypeScript compilation**: `npx tsc --noEmit` passes with zero errors on `recurring-billing-scheduler.ts` and `storage.ts`
- [ ] **Import resolution**: All imports in the scheduler resolve correctly
- [ ] **No `next_billing_date` mutation**: Search scheduler file for `.update(` on `subscriptions` table — must return zero matches
- [ ] **Idempotency filter**: Confirm `hasExistingBillingLogEntry` uses `['success', 'pending']` — no `'dry_run'`
- [ ] **ACH exclusion**: Confirm query-level `CreditCard` filter AND runtime `paymentMethodType !== 'CreditCard'` guard both exist
- [ ] **Lock mechanism**: Confirm `acquireLock`/`releaseLock` use only `supabase.rpc()` — no inserts/deletes on `recurring_billing_log`
- [ ] **Transaction ID format**: Confirm `RECUR-{subscriptionId}-{YYYYMMDD}` derived from `sub.nextBillingDate`
- [ ] **Stale-pending logic**: Confirm calls both `getPaymentByTransactionId()` and checks `next_billing_date` advancement before marking failed
- [ ] **Dry-run default**: Confirm `isDryRun()` returns `true` unless env var is explicitly `'false'`
- [ ] **Scheduler disabled by default**: Confirm `scheduleRecurringBilling()` exits early unless `BILLING_SCHEDULER_ENABLED === 'true'`
- [ ] **Webhook/commission untouched**: Confirm no changes to `epx-hosted-routes.ts`, `commission-service.ts`, `epx-payment-service.ts`
- [ ] **Server starts**: `npm run dev` starts without crash (scheduler should log "disabled" and exit)

### Cannot be validated locally — requires sandbox

- Advisory lock RPC actually callable via Supabase PostgREST
- `recurring_billing_log` table exists with correct schema
- `getSubscriptionsDueForBilling()` returns real data
- EPX sandbox accepts CCE1 with a stored BRIC token
- Webhook processes recurring charge responses correctly
- End-to-end dry-run cycle completes against real database

---

## SECTION 4 — Git Push Gate

All must be true before any code is pushed to GitHub:

- [ ] Every item in "Can be validated locally" above is confirmed
- [ ] `BILLING_SCHEDULER_ENABLED` defaults to `false` in `.env.example`
- [ ] `BILLING_SCHEDULER_DRY_RUN` defaults to `true` in `.env.example`
- [ ] No new environment variables are required for the app to start (scheduler is opt-in)
- [ ] No changes to existing webhook, payment, or commission files
- [ ] No database migrations are included in the push (table creation handled separately)
- [ ] Developer explicitly approves the push

---

## SECTION 5 — Sandbox/Staging Restoration or Confirmation

Before deploying to sandbox, confirm:

- [ ] Sandbox environment is running and accessible
- [ ] Sandbox database is connected and reachable
- [ ] `recurring_billing_log` table exists — if not, create it with required columns: `id`, `subscription_id`, `member_id`, `payment_token_id`, `amount`, `billing_date`, `attempt_number`, `status`, `epx_transaction_id`, `epx_auth_code`, `epx_response_code`, `epx_response_message`, `failure_reason`, `next_retry_date`, `payment_id`, `processed_at`, `created_at`
- [ ] Advisory lock wrapper functions exist in database — if not, create:
  - `public.pg_try_advisory_lock(lock_id bigint) RETURNS boolean`
  - `public.pg_advisory_unlock(lock_id bigint) RETURNS boolean`
  - Grant execute to the Supabase service role
- [ ] At least one active subscription exists with: `status = 'active'`, `next_billing_date` in the past, a linked `payment_tokens` row with `payment_method_type = 'CreditCard'`, `is_active = true`, and a valid encrypted BRIC token
- [ ] EPX sandbox credentials are configured in the sandbox environment
- [ ] Sandbox environment variables do NOT have `BILLING_SCHEDULER_ENABLED=true` yet

---

## SECTION 6 — Sandbox Deployment with Dry-Run Enabled

1. Push approved code to GitHub (per Section 4 gate)
2. Deploy to sandbox environment
3. Set sandbox env vars:
   - `BILLING_SCHEDULER_ENABLED=true`
   - `BILLING_SCHEDULER_DRY_RUN=true`
   - `BILLING_SCHEDULER_INTERVAL_MS=60000` (1 minute for faster feedback)
4. Restart sandbox server
5. Confirm server starts without errors
6. Confirm logs show: `[Recurring Billing] Scheduler initialized (DRY RUN)`
7. **Do not proceed** if the server fails to start or logs any scheduler initialization error

---

## SECTION 7 — Sandbox Dry-Run Testing

### Step 1 — First cycle execution
- Wait 15 seconds for the initial delayed cycle
- Confirm log output: `Cycle start (DRY RUN)`
- Confirm log shows count of due subscriptions found (or "No subscriptions due")
- If subscriptions found, confirm each shows: `DRY RUN — Would charge subscription {id}, member {id}, amount ${amount}, card ****{last4}`
- Confirm `recurring_billing_log` rows inserted with `status = 'dry_run'`
- Confirm NO rows in `payments` table were created by the scheduler
- Confirm `subscriptions.next_billing_date` is unchanged for all processed subscriptions

### Step 2 — Idempotency on restart
- Restart the sandbox server (do not clear `dry_run` log entries)
- Wait for next cycle
- Confirm the same subscriptions are processed again (dry_run does not block re-processing)
- This proves `dry_run` entries are not treated as idempotency blockers

### Step 3 — Advisory lock verification
- If possible, trigger two cycles simultaneously (reduce interval to 10 seconds, restart twice quickly)
- Confirm one cycle logs: `Another instance holds the lock — skipping cycle`
- If not testable in sandbox, note as deferred to production monitoring

### Stop conditions — halt and investigate if:
- Server crashes on startup
- Advisory lock RPC call fails
- `recurring_billing_log` insert fails (table missing or schema mismatch)
- Any `subscriptions.next_billing_date` value changes
- Any `payments` row is created during dry-run

---

## SECTION 8 — Sandbox Live Card Transaction

### Prerequisites
- Dry-run testing (Section 7) fully passed
- EPX sandbox credentials confirmed working
- One specific test subscription identified by ID with known card/BRIC token

### Execution
1. Set `BILLING_SCHEDULER_DRY_RUN=false` in sandbox env
2. Restart sandbox server
3. Confirm log: `Scheduler initialized (LIVE)`
4. Wait for first cycle to process the test subscription
5. Monitor logs for the charge attempt

### Verification checklist

**`recurring_billing_log`**
- [ ] Row exists with `status = 'pending'` initially (may transition fast)
- [ ] Row updated to `status = 'success'`
- [ ] `epx_transaction_id` populated (matches `RECUR-{subId}-{YYYYMMDD}`)
- [ ] `epx_auth_code` populated
- [ ] `epx_response_code` populated
- [ ] `processed_at` populated

**EPX response**
- [ ] Transaction accepted in EPX sandbox
- [ ] Response fields (`AUTH_CODE`, `AUTH_RESP`, `TRANSACTION_ID`) returned and logged

**`payments` table**
- [ ] Scheduler did NOT insert a `payments` row (it only writes to `recurring_billing_log`)
- [ ] If the webhook fires for this transaction, confirm a `payments` row was created by the webhook

**`subscriptions.next_billing_date`**
- [ ] NOT changed by the scheduler
- [ ] If the webhook fires, confirm the webhook advanced it (and only the webhook)

**Commission flow**
- [ ] Scheduler triggered no commission logic
- [ ] If webhook fires and creates a payment, confirm commission was triggered by the webhook path, not the scheduler

**Webhook behavior**
- [ ] If EPX sends a callback for the recurring charge, confirm the webhook processes it normally
- [ ] If EPX does NOT send a callback for Server Post recurring charges, document this — it means `payments` row creation and `next_billing_date` advancement must be added to the scheduler in a follow-up

### Stop conditions — halt and investigate if:
- EPX returns an unexpected error (not a normal decline)
- `next_billing_date` changes and the scheduler is the cause
- A `payments` row appears with no webhook activity
- Commission triggers from the scheduler code path

---

## SECTION 9 — EPX Verification Package Checklist

Collect and save the following after sandbox live test:

- [ ] **EPX request fields**: `TRAN_TYPE=CCE1`, `AUTH_GUID` (masked), `AUTH_AMOUNT`, `TRANSACTION_ID` format
- [ ] **EPX response fields**: `AUTH_RESP`, `AUTH_RESP_TEXT`, `AUTH_CODE`, `TRANSACTION_ID`
- [ ] **Transaction ID evidence**: Screenshot or log showing `RECUR-{subId}-{YYYYMMDD}` in both request and response
- [ ] **Masked server logs**: Scheduler cycle log output showing DRY RUN and LIVE results (mask any PII, card numbers, tokens)
- [ ] **`recurring_billing_log` query result**: Exported rows showing `dry_run` → `pending` → `success` progression
- [ ] **`subscriptions` before/after**: Evidence that `next_billing_date` was not changed by the scheduler
- [ ] **Webhook callback evidence**: If EPX sent a callback, the webhook log showing it processed the recurring payment; if no callback, document absence
- [ ] **`payments` table evidence**: Screenshot showing payment row was created by webhook (or absence if no callback)
- [ ] **Idempotency evidence**: Log showing second cycle skipped the already-processed subscription
- [ ] **Advisory lock evidence**: Log showing lock acquisition and release per cycle

---

## SECTION 10 — Production Dry-Run

### Prerequisites
- Sandbox testing (Sections 7–8) fully passed
- EPX verification package (Section 9) collected
- Production database has `recurring_billing_log` table and advisory lock wrapper functions
- Deployment approved by developer

### Execution
1. Deploy to production with:
   - `BILLING_SCHEDULER_ENABLED=true`
   - `BILLING_SCHEDULER_DRY_RUN=true`
   - `BILLING_SCHEDULER_INTERVAL_MS=3600000` (1 hour)
2. Monitor first cycle (15 seconds after server start)
3. Confirm log output matches sandbox behavior
4. Let run for 2–3 cycles (2–3 hours)

### Monitor
- [ ] No errors in server logs
- [ ] `recurring_billing_log` rows are `dry_run` only
- [ ] No `payments` rows created
- [ ] No `subscriptions.next_billing_date` changes
- [ ] No commission records created
- [ ] Advisory lock acquired and released cleanly each cycle
- [ ] Cycle duration is reasonable (< 60 seconds for expected subscription count)

### Stop conditions
- Any error in scheduler logs
- Any non-`dry_run` row in `recurring_billing_log`
- Any mutation to `subscriptions` or `payments` tables

---

## SECTION 11 — Limited Production Live Rollout

### Prerequisites
- Production dry-run (Section 10) ran at least 3 clean cycles
- No errors or unexpected behavior observed
- Kill-switch plan understood

### Kill switch
Set `BILLING_SCHEDULER_ENABLED=false` and restart. The scheduler will not run. No in-flight charges are affected (EPX processes them asynchronously; the scheduler only submits).

### Execution
1. Identify 1–3 specific subscriptions as the first live cohort (known test accounts or willing participants)
2. Set those subscriptions' `next_billing_date` to a past date (so they become due)
3. Set `BILLING_SCHEDULER_DRY_RUN=false`
4. Set `BILLING_SCHEDULER_INTERVAL_MS=3600000` (1 hour — do not rush)
5. Restart production server
6. Monitor first LIVE cycle
7. After first cycle, verify for each subscription:
   - [ ] `recurring_billing_log`: `pending` → `success`
   - [ ] EPX accepted the charge
   - [ ] `next_billing_date` NOT changed by scheduler
   - [ ] Webhook received callback (if applicable) and advanced the date
   - [ ] Payment record created by webhook (if applicable)
   - [ ] Commission triggered by webhook path (if applicable)
8. If any subscription failed, investigate before expanding
9. Let run for 24 hours with the limited cohort before expanding

### Stop conditions — kill switch immediately if:
- EPX returns unexpected errors (not normal declines)
- `next_billing_date` updated by the scheduler
- Duplicate charges detected
- Commission or payment anomalies

---

## SECTION 12 — Full Production Enablement

### Go/no-go criteria — all must be true:

- [ ] Limited rollout ran for at least 24 hours without issues
- [ ] All limited-cohort subscriptions billed correctly
- [ ] No duplicate charges
- [ ] No scheduler-initiated `next_billing_date` changes
- [ ] Webhook/commission/payment flow confirmed working for recurring charges
- [ ] EPX verification package reviewed and saved
- [ ] No open bugs or unresolved issues from any prior section

### Execution
1. Remove any artificial `next_billing_date` overrides from test subscriptions
2. Confirm `BILLING_SCHEDULER_DRY_RUN=false`
3. Confirm `BILLING_SCHEDULER_INTERVAL_MS=3600000`
4. Normal server restart — scheduler now processes all due card subscriptions each cycle
5. Monitor closely for first 48 hours

### Ongoing monitoring
- Check `recurring_billing_log` daily for unexpected `failed` entries
- Monitor EPX decline rates
- Confirm stale-pending recovery is working (entries resolved correctly)
- Watch for advisory lock contention if running multiple server instances

---

## SECTION 13 — Explicit Stop Conditions

**Stop the scheduler immediately** (`BILLING_SCHEDULER_ENABLED=false` + restart) if any of the following occur at any stage:

1. **Duplicate charges**: Same subscription charged twice for the same billing period
2. **`next_billing_date` mutation by scheduler**: Any evidence the scheduler updated this field
3. **Phantom payment records**: `payments` rows created by scheduler code path (not webhook)
4. **Commission anomalies**: Commissions triggered by scheduler instead of webhook
5. **EPX errors**: Non-decline errors (network failures, auth failures, malformed requests) exceeding 3 consecutive cycles
6. **Advisory lock failure**: Lock cannot be acquired or released, leading to skipped or overlapping cycles
7. **Stale pending misclassification**: Stale entries marked `success` when no payment actually exists, or marked `failed` when a payment did succeed
8. **Data integrity**: Any `recurring_billing_log` row with impossible state (e.g., `success` with no `epx_transaction_id`)
9. **Unexpected table writes**: Any insert/update/delete to tables the scheduler should not touch
10. **Server instability**: Scheduler causing memory leaks, CPU spikes, or server crashes
