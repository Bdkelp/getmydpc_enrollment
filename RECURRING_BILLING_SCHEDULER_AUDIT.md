# Recurring Billing Scheduler — Safety Audit

**Audit Date**: March 18, 2026  
**Scope**: Identify minimum missing components for safe recurring billing scheduler  
**Constraint**: Additions ONLY — no refactoring existing payment flow

---

## SECTION 1 — Minimum Missing Components for Recurring Billing

### 1.1 Scheduler Service (New)
**What's missing**: Actual scheduler implementation that the codebase skeleton references but doesn't implement

**Required**:
- Scheduler service file (not yet created)
- Timer/interval mechanism (not yet created)
- Entry point registration in server/index.ts (partially stubbed)
- Clean shutdown handling (not yet created)

**Why it's missing**: `BILLING_SCHEDULER_ENABLED=false` implies implementation is incomplete; code references scheduler but it's not wired up

**Scope**: NEW SERVICE — does not touch existing payment flow

---

### 1.2 Recurring Billing Log Table Schema
**What's missing**: While `recurring_billing_log` table schema exists in shared/schema.ts (line 439), it's never populated or queried in production

**Required**:
- Populate log records when scheduler attempts charges
- Query log to detect retry patterns
- Schema is already defined; only usage is missing

**Why it's missing**: Scheduler doesn't run, so nothing writes logs; but table/schema preparation is done

**Scope**: USE EXISTING TABLE — no schema changes

---

### 1.3 Idempotency Key Storage (New)
**What's missing**: Mechanism to prevent duplicate charges if scheduler retries

**Current state**: 
- `commission_payouts` has unique index on `(commission_id, payout_month)` — prevents duplicate *commissions*
- `payments` has unique index on `transaction_id` — prevents duplicate *payments*
- But no tracking of "scheduler run ID" to prevent retrying same batch twice

**Required**:
- Idempotency key column or separate tracking table
- Before processing next_billing_date: check if already processed this week
- Safe to add as NEW column or NEW mini-table

**Why it's missing**: Scheduler logic never implemented

**Scope**: NEW TRACKING — does not modify existing tables beyond addition

---

### 1.4 Billing Charge Attempt Tracking (New)
**What's missing**: Per-charge attempt counter to enforce retry limits

**Current state**:
- `billing_schedule.failure_count` exists but is never incremented
- EPX Server Post API docs specify `Retries: 1-5` but no retry count maintained

**Required**:
- Track attempt count per charge (in recurring_billing_log)
- Max 5 attempts per charge attempt
- After 5 failed attempts: mark subscription status "failed" and alert admin

**Why it's missing**: Scheduler not implemented

**Scope**: NEW LOGIC — uses existing recurring_billing_log table

---

### 1.5 Subscription Grace Window Tracking (New)
**What's missing**: Mechanism to ensure next_billing_date not processed until grace period expires

**Current state**:
- Member enrolls: `subscriptions.next_billing_date = now + 30 days`
- Commission payouts have 14-day grace period (via `payment_eligible_date`)
- But: No enforcement that scheduler delays first charge until after grace period

**Required**:
- Check `subscriptions.startDate` vs `now` before processing charge
- Enforce minimum X days before first charge (should match EPX subscription setup)
- Prevent immediate duplicate charge on first run

**Why it's missing**: Scheduler never runs, so this edge case untested

**Scope**: NEW LOGIC — validates before querying billing_schedule

---

### 1.6 Processing State Lock (New)
**What's missing**: Mutex/lock to prevent concurrent scheduler runs

**Current state**:
- Nothing prevents two scheduler instances running simultaneously
- Could charge same member twice if timer fires while previous run processing

**Required**:
- Distributed lock mechanism (Supabase advisory lock or Redis-like)
- OR: Single scheduler instance guaranteed via PM2/supervisor
- Track "scheduler is running" status before processing

**Why it's missing**: Scheduler skeleton exists but no concurrency protection

**Scope**: NEW SAFEGUARD — no database changes (advisory locks are built-in)

---

### 1.7 Batch Partial Failure Handling (New)
**What's missing**: Recovery mechanism if scheduler processes 50 charges and fails on #47

**Current state**:
- No tracking of "which charges in this batch succeeded vs. failed"
- If scheduler crashes mid-batch, restart will re-attempt all charges

**Required**:
- Batch ID for each scheduler run
- Track success/failure per charge within batch
- Resume from failure point (process only failed charges on next run)
- Use recurring_billing_log.attemptNumber for this

**Why it's missing**: Scheduler not implemented

**Scope**: NEW TRACKING — uses existing recurring_billing_log.attemptNumber field

---

## SECTION 2 — Existing Components That Must NOT Be Touched

### 2.1 EPX Hosted Checkout Payment Flow
**File**: `server/routes/epx-hosted-routes.ts`

**Status**: ✅ WORKING — Do not modify

**Why untouchable**: 
- Handles initial enrollment payment
- Callback handler creates payment records, tokens, commissions
- Production stable since deploy
- Any change risks breaking enrollment

**What scheduler MUST NOT do**:
- Call this route
- Modify payment records it creates
- Change callback logic

---

### 2.2 Commission Payouts Reactive Creation
**File**: `server/services/commission-payout-service.ts`

**Status**: ✅ WORKING — Do not modify

**Why untouchable**:
- Creates commission payouts reactively on payment capture
- Enforces 14-day grace period (payment_eligible_date logic)
- Weekly batch relies on this for payment eligibility
- Already handles both direct + override commissions

**What scheduler MUST NOT do**:
- Create commission payouts (only payment capture does this)
- Modify payout status directly (only batch processing does this)
- Change grace period logic

---

### 2.3 Payment Token Storage & Encryption
**File**: `server/storage.ts` (lines ~5400-5600), `migrations/20260218_add_ach_payment_support.sql`

**Status**: ✅ WORKING — Do not modify

**Why untouchable**:
- AES-256-CBC encryption verified working
- BRIC tokens safely isolated
- Payment token usage pattern established

**What scheduler MUST NOT do**:
- Store plaintext tokens
- Change encryption keys
- Modify payment_tokens.bric_token usage
- Decrypt tokens except when calling EPX API

---

### 2.4 Subscriptions Table Structure
**File**: `shared/schema.ts` (lines 175-205)

**Status**: ✅ WORKING — Do not modify schema

**Why untouchable**:
- Enrollment relies on this for tracking
- `next_billing_date` already properly populated
- In-use enrollment flow depends on this structure

**What scheduler MUST NOT do**:
- Change column names or types
- Remove fields
- Add foreign key constraints it needs to check
- Can READ next_billing_date, but don't change the column definition

**What scheduler CAN do**:
- READ `subscriptions.next_billing_date` to determine due dates
- UPDATE `subscriptions.next_billing_date` after successful charge (if needed)
- But keep updates minimal and idempotent

---

### 2.5 Membership Dates Utilities
**File**: `server/utils/membership-dates.ts`

**Status**: ✅ WORKING — Do not modify core logic

**Why untouchable**:
- Membership activation works correctly (daily cron)
- Grace period calculations trusted
- Date math is correct

**What scheduler MUST NOT do**:
- Change `isMembershipActive()` logic
- Change `calculatePaymentEligibleDate()` logic
- Modify grace period enforcement

**What scheduler CAN do**:
- Call `calculateNextBillingDate()` to determine next charge date
- Use `parseDateFromDB()` for date parsing

---

### 2.6 Payment Service Mock Provider
**File**: `server/services/payment-service.ts`

**Status**: ✅ WORKING — Do not modify

**Why untouchable**:
- Used for testing only
- Mock provider fine for development
- Not called in production payment flow

**What scheduler MUST NOT do**:
- Call mock payment service in production
- Modify mock logic (won't affect scheduler anyway)

---

### 2.7 Admin Logs & Compliance Logging
**File**: `server/services/certification-logger.ts`

**Status**: ✅ WORKING — Do not modify

**Why untouchable**:
- Compliance requirement (PCI DSS audit trail)
- Masking rules working correctly
- Admin logs depend on this

**What scheduler MUST NOT do**:
- Log full payment tokens
- Log unmasked card details
- Change masking rules

**What scheduler CAN do**:
- Call certification logger to log "scheduler charge attempt"
- No sensitive data in scheduler logs

---

### 2.8 Weekly Commission Batch Processing
**File**: `server/routes/payment-reconciliation.ts` (implied batch endpoints)

**Status**: ✅ WORKING — Do not modify

**Why untouchable**:
- Admin-triggered weekly batch works
- Commission payout status management working
- Payment eligible date enforcement working

**What scheduler MUST NOT do**:
- Modify commission payout statuses
- Change batch processing logic
- Interfere with admin batch run

**What scheduler CAN do**:
- Run concurrently with batch (batch doesn't know scheduler exists)
- Read commission_payouts status (read-only)

---

## SECTION 3 — Safest Way to Add Scheduler Without Altering Payment Flow

### 3.1 Architectural Isolation Pattern

**Scheduler is completely separate from existing payment flow:**

```
EXISTING FLOW (unmodified):
Member Enrollment → EPX Checkout → Webhook Callback → Payment Record + Commission Payouts
                                                              ↓
                                                    Weekly Admin Batch
                                                    (marks payouts "paid")

NEW SCHEDULER (additive only, triggers ONLY by reading subscriptions):
Scheduler Timer → Query subscriptions.next_billing_date → Call EPX Server Post → Webhook (same as existing)
                                                                                      ↓
                                                                           Existing payment flow continues
```

**Key principle**: Scheduler is just another customer of EPX API; webhook response goes to same handler as initial checkout

---

### 3.2 Scheduler Entry Point - NEW Service

Create new file: `server/services/recurring-billing-scheduler.ts`

**Responsibilities** (NEW ONLY):
1. On interval: Query subscriptions WHERE next_billing_date <= NOW AND status='active'
2. For each due subscription:
   - Get payment_token (BRIC)
   - Call EPX Server Post API (existing EPX service)
   - Log attempt to recurring_billing_log
   - Handle EPX response (success/failure)
3. EPX sends webhook back to existing handler (no changes needed)

**Does NOT**:
- Create commission payouts (existing webhook callback does this)
- Modify member status
- Change payment flow
- Encrypt/decrypt tokens itself (existing service does this)

---

### 3.3 Registration in Server - MINIMAL Addition

File: `server/index.ts`

**Add** (new lines only):
```typescript
if (process.env.BILLING_SCHEDULER_ENABLED === 'true') {
  import('./services/recurring-billing-scheduler').then(module => {
    module.startRecurringBillingScheduler();
  });
}
```

**What this does**:
- Conditionally starts scheduler
- Completely optional (disabled by default)
- Can be toggled without restarting server

**Does NOT modify**:
- Existing route registration
- Payment flow
- Webhook handlers
- Any existing services

---

### 3.4 Query Pattern - READ ONLY

Scheduler queries:
```sql
SELECT 
  s.id, s.member_id, s.next_billing_date, s.amount,
  pt.id as payment_token_id, pt.bric_token
FROM subscriptions s
LEFT JOIN members m ON s.member_id = m.id
LEFT JOIN payment_tokens pt ON m.id = pt.member_id AND pt.is_primary = true
WHERE 
  s.next_billing_date <= NOW()
  AND s.status = 'active'
  AND m.is_active = true
  AND pt.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM recurring_billing_log rbl
    WHERE rbl.subscription_id = s.id
      AND rbl.billing_date = CURRENT_DATE
      AND rbl.status IN ('success', 'pending')
  )
ORDER BY s.next_billing_date ASC
LIMIT 100
```

**What this query does**:
- Finds due subscriptions (READ ONLY)
- Joins to get payment tokens (READ ONLY)
- Excludes already-processed charges today (READ ONLY)
- Safe to run repeatedly

**Keys**:
- Uses existing indices (idx_subscriptions_member_id, idx_billing_schedule_next_billing)
- Doesn't modify any tables
- Outer join ensures safety (won't charge if token missing)

---

### 3.5 EPX Integration - REUSE Existing Service

Scheduler calls existing EPX service: `server/services/epx-payment-service.ts`

**Already exists**: `submitServerPostRecurringPayment()` (line 923)

**Scheduler calls it**:
```typescript
const result = await submitServerPostRecurringPayment({
  amount: subscription.amount,
  authGuid: decryptPaymentToken(paymentToken.bric_token),
  member: member,
  transactionId: generateIdempotencyKey(),
  description: `Monthly billing - Member ${member.customer_number}`
});
```

**What happens**:
- EPX processes recurring charge
- Returns success/failure
- EPX sends webhook back (same as initial checkout)
- Existing webhook handler creates payment record
- Existing commission payout creation triggers

**Scheduler doesn't**:
- Modify EPX response handling
- Create payment records (webhook does this)
- Manage commissions (webhook does this)

---

### 3.6 Webhook Reuse - NO CHANGES NEEDED

Existing webhook handler: `server/routes/epx-hosted-routes.ts`

**Current behavior**: When EPX sends payment callback, creates payments + commissions

**Scheduler improvement**:
- Sends recurring payment to EPX
- EPX sends webhook (same format as initial checkout)
- Same webhook handler processes it
- No webhook code changes required

**Key**: Scheduler just triggers webhook via EPX; handler doesn't know source (enrollment vs. recurring)

---

## SECTION 4 — Suggested Architecture Using Existing Patterns in This Repo

### 4.1 Service Pattern - Existing Model

This repo already has:
- `commission-payout-service.ts` (handles business logic for commissions)
- `membership-activation-service.ts` (handles daily scheduled task)
- `weekly-recap-service.ts` (handles weekly scheduled task)

**Scheduler should follow same pattern**:

```
recurring-billing-scheduler.ts
├─ exports startRecurringBillingScheduler() function
├─ Called from index.ts (similar to membership-activation-service)
├─ Uses setInterval for scheduling (same as WeeklyRecapService)
├─ Logs errors with same pattern (certificationLogger + epxPaymentLogger)
├─ Returns stats { processed, succeeded, failed, retried }
└─ Handles graceful shutdown (similar to other services)
```

---

### 4.2 Idempotency Pattern - Use Existing Approach

This repo uses:
- Unique constraints (e.g., `commission_payouts(commission_id, payout_month)`)
- Transaction IDs for deduplication (`payments.transaction_id` unique)

**For scheduler, follow same pattern**:

Add tracking table or column:
```
recurring_billing_log {
  subscription_id + billing_date = unique key
  Prevents: Same subscription charged twice same day
}
```

Or simpler: Mark subscription when charge starts
```
subscriptions {
  billing_in_progress: BOOLEAN (set before EPX call, unset after webhook)
  Prevents: Concurrent charges on same subscription
}
```

---

### 4.3 Logging Pattern - Reuse Existing

This repo uses:
- `certificationLogger` for compliance (payment events)
- `logEPX()` from `epx-payment-logger.ts` for payment details
- Structured JSONL format

**Scheduler logging**:
```typescript
logEPX({
  level: 'info',
  phase: 'recurring-scheduler',
  message: 'Charge attempted',
  data: {
    subscriptionId: sub.id,
    memberId: sub.member_id,
    amount: sub.amount,
    attemptNumber: attemptCount,
    transactionId: epxResponse.transactionId
  }
});
```

Same format, new phase tag

---

### 4.4 Error Handling Pattern - Match Weekly Recap

`WeeklyRecapService.ts` shows pattern:
```typescript
try {
  // Do work
  console.log('[Weekly Recap] Processing...');
  // ...
  console.log('[Weekly Recap] ✅ Success');
} catch (error) {
  console.error('[Weekly Recap] Unhandled error:', error);
  // Continue running (don't crash scheduler)
}
```

**Scheduler follows same**:
```typescript
try {
  // Query due subscriptions
  for (const subscription of dueSubscriptions) {
    try {
      // Charge individual subscription
    } catch (chargeError) {
      // Log and continue (don't stop batch)
      logEPX({ level: 'error', data: { chargeError } });
    }
  }
} catch (schedulerError) {
  // Log but keep scheduler running
  console.error('[Recurring Billing Scheduler] Error', schedulerError);
}
```

---

### 4.5 Interval Pattern - Match Existing Crons

`membership-activation-service.ts`:
```typescript
setInterval(() => {
  activatePendingMemberships();
}, 24 * 60 * 60 * 1000); // Daily
```

`WeeklyRecapService.ts`:
```typescript
setTimeout(() => {
  this.generateAndSendWeeklyRecap();
  setInterval(() => { ... }, 7 * 24 * 60 * 60 * 1000); // Weekly
}, msUntilNextMonday);
```

**Scheduler follows same**:
```typescript
setInterval(() => {
  processRecurringBillingCharges();
}, process.env.BILLING_SCHEDULER_INTERVAL_MINUTES * 60 * 1000);
```

Uses existing .env variables (already defined)

---

### 4.6 Shutdown Pattern - Match PM2 Best Practice

This repo uses:
- Services keep running until process terminates
- No explicit stop method (process management via PM2)

**Scheduler same**:
```typescript
process.on('SIGTERM', async () => {
  console.log('[Recurring Billing Scheduler] Shutting down');
  clearInterval(schedulerInterval);
  // Wait for in-flight charges to complete (if needed)
  process.exit(0);
});
```

---

## SECTION 5 — Potential Failure Scenarios If Scheduler Implemented Incorrectly

### 5.1 Duplicate Charge Scenario

**What happens**: Member charged twice for same month

**How it breaks**:
1. Scheduler queries subscriptions, finds member due
2. Calls EPX, success
3. EPX sends webhook, payment record created
4. BUT: Scheduler runs again before webhook processed
5. Second charge goes through ← DUPLICATE

**Symptoms**:
- Payment records with same subscription_id, same day
- Member sees two charges
- Commission payouts created twice

**Prevention needed** (Section 6)

---

### 5.2 Orphaned Payment Record Scenario

**What happens**: Payment recorded but commission payout never created

**How it breaks**:
1. Scheduler calls EPX → success
2. EPX sends webhook → payment record created
3. But webhook handler crashes before calling `createPayoutsForMemberPayment()`
4. Payment sits in database without commission ← ORPHANED

**Symptoms**:
- Payment status "succeeded" but no commission_payouts records
- Agent never gets paid
- Member money trapped in system

**Prevention needed**: Retry webhook, not scheduler

---

### 5.3 Permanent Failure Loop Scenario

**What happens**: Charge fails, scheduler keeps retrying forever

**How it breaks**:
1. Member's card expires
2. Scheduler attempts charge → fails
3. Transaction ID same, so idempotency prevents retry
4. Subscription status never updated
5. Next run continues retrying indefinitely ← SPAM

**Symptoms**:
- Repeated failed charges in EPX logs
- recurring_billing_log filled with retries
- Member never notified

**Prevention needed** (Section 6)

---

### 5.4 Race Condition Scenario

**What happens**: Two scheduler instances run simultaneously, charge same member twice

**How it breaks**:
1. Pod 1 starts scheduler
2. Pod 2 starts scheduler (blue/green deploy)
3. Both query subscriptions at same time
4. Both see same member due
5. Both call EPX → TWO CHARGES ← RACE

**Symptoms**:
- Duplicate payment entries
- EPX rate limits triggered
- Member charged twice

**Prevention needed** (Section 6)

---

### 5.5 Partial Batch Failure Scenario

**What happens**: Scheduler processes 100 charges, crashes at #47, restarts and recharges #1-46

**How it breaks**:
1. Scheduler loops: for charge in [1..100]:
2. Charges 1-46 successfully
3. Charge 47 fails, exception thrown
4. Loop breaks, partial batch incomplete
5. Next run: queries again, finds 1-46 still due (new day means new query)
6. Charges 1-46 AGAIN ← DUPLICATES

**Symptoms**:
- Duplicate charges for first 46 members
- Charge 47 still fails
- System unreliable

**Prevention needed** (Section 6)

---

### 5.6 Token Misuse Scenario

**What happens**: Scheduler uses wrong payment token for member

**How it breaks**:
1. Member has 2 payment_tokens (old card + new card)
2. is_primary=false on both (data corruption)
3. Scheduler picks random token (should be primary only)
4. Charges wrong card ← WRONG TOKEN

**Symptoms**:
- Charges to card member didn't authorize
- Member disputes charge
- Commission tied to wrong payment

**Prevention needed** (Section 6)

---

### 5.7 Grace Period Bypass Scenario

**What happens**: Scheduler charges before 14-day grace period expires

**How it breaks**:
1. Member enrolls Monday
2. Payment captured, commission_payouts created with status='ineligible'
3. Scheduler runs Wednesday (2 days later)
4. Checks `subscriptions.next_billing_date` (doesn't know about grace period)
5. Charges member before grace period expires ← EARLY CHARGE

**Symptoms**:
- Commission can't be clawed back (charge happened too fast)
- Agent paid for work that might reverse
- Business rule violated

**Prevention needed** (Section 6)

---

### 5.8 Stale Token Scenario

**What happens**: Scheduler tries to charge with expired/revoked token

**How it breaks**:
1. Member's card expires (card_expiry_year = 2024, now 2026)
2. Scheduler doesn't check expiry
3. Calls EPX with expired token ← CHARGE FAILS IMMEDIATELY

**Symptoms**:
- EPX rejects charge (expired card)
- Member not notified
- Subscription stays "active" but can't charge
- Member thinks they're enrolled, but aren't

**Prevention needed** (Section 6)

---

## SECTION 6 — Safeguards Required to Prevent Failure Scenarios

### 6.1 Duplicate Charge Prevention

**Safeguard 1A: Idempotency by (subscription_id, billing_date)**

Track in recurring_billing_log:
```sql
-- Before scheduling charge:
SELECT * FROM recurring_billing_log
WHERE subscription_id = $1
  AND DATE(billing_date) = CURRENT_DATE
  AND status IN ('success', 'pending')
```

If record exists: SKIP (already processed today)

**Safeguard 1B: Atomic marking on charge attempt**

Before calling EPX:
```sql
INSERT INTO recurring_billing_log (subscription_id, billing_date, status, attempt_number, created_at)
VALUES ($1, NOW(), 'pending', 1, NOW())
```

If INSERT succeeds: proceed with charge (unique constraint prevents duplicate)
If INSERT fails (duplicate): skip charge

**Safeguard 1C: Processing lock per subscription**

Query result includes version number:
```sql
SELECT ..., version FROM subscriptions WHERE id = $1 FOR UPDATE
```

For Update prevents concurrent reads; atomically fetch + lock

**Implementation**: Use recurring_billing_log insert as the lock

---

### 6.2 Orphaned Payment Prevention

**Safeguard 2A: Webhook must complete successfully BEFORE marking charge done**

In webhook handler, add:
```javascript
// 1. Create payment record
// 2. Create commission payouts
// 3. ONLY THEN: Update recurring_billing_log status = 'success'
// If any step fails: log = 'failed', alert admin
```

Scheduler doesn't mark success; webhook does

**Safeguard 2B: Scheduler checks payment_exists before next attempt**

```sql
SELECT COUNT(*) FROM payments
WHERE transaction_id = $1 AND status = 'succeeded'
```

If payment exists: commission payload should exist too (checked by webhook)
If payment missing: retry EPX call or mark failed

---

### 6.3 Permanent Failure Prevention

**Safeguard 3A: Retry limit (max 5 attempts per charge)**

In recurring_billing_log:
```sql
SELECT attempt_number FROM recurring_billing_log
WHERE subscription_id = $1 ORDER BY created_at DESC LIMIT 1
```

If attempt_number >= 5: STOP, mark subscription 'billing_failed', alert admin

**Safeguard 3B: Failure age detection**

```sql
SELECT created_at FROM recurring_billing_log
WHERE subscription_id = $1 AND status = 'failed'
ORDER BY created_at DESC LIMIT 1
```

If failed > 30 days ago AND still active: alert admin (stale failure)

**Safeguard 3C: Backoff on retry**

Schedule retries: 1st fail → retry in 1 hour, 2nd fail → retry in 4 hours, 3rd fail → next day

Use attempt_number to calculate backoff:
```
backoff_minutes = 2 ^ attempt_number (1, 2, 4, 8, 16 hours)
```

---

### 6.4 Race Condition Prevention

**Safeguard 4A: Distributed lock**

Before querying subscriptions:
```postgresql
SELECT pg_advisory_lock(12345); -- arbitrary ID for "billing scheduler"
```

Only one instance holds lock; others wait

Use connection pool timeout to release lock after work

**Safeguard 4B: Single-instance guarantee**

Use PM2 cluster mode with:
```
instances: 1
```

Guarantees only ONE scheduler instance runs, even in clustered deployment

**Safeguard 4C: Lock heartbeat**

Every 5 seconds while processing:
```sql
UPDATE scheduler_lock SET updated_at = NOW() WHERE id = 1
```

If process dies: lock expires after 30 seconds, next instance acquires it

**Recommended**: Use 4B (PM2 instance=1) as simplest

---

### 6.5 Partial Batch Failure Prevention

**Safeguard 5A: Resume from failure point**

Query continues from last successful:
```sql
SELECT * FROM subscriptions
WHERE next_billing_date <= NOW()
  AND status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM recurring_billing_log rbl
    WHERE rbl.subscription_id = subscriptions.id
      AND rbl.status = 'success'
      AND DATE(rbl.billing_date) = CURRENT_DATE
  )
```

Only charges that don't have a success record TODAY

**Safeguard 5B: Batch size limit**

```sql
LIMIT 50
```

Process at most 50 per run; if 200 are due, runs multiple times

Prevents timeout and restarts from scratch

**Safeguard 5C: Transaction wrapping**

Each subscription charge in its own transaction:
```javascript
try {
  await chargeSingleSubscription(sub);
} catch (e) {
  log error; // continue to next
}
```

Don't wrap entire batch in one transaction (if one fails, don't lose prior successes)

---

### 6.6 Token Misuse Prevention

**Safeguard 6A: Verify token before use**

```sql
SELECT * FROM payment_tokens
WHERE member_id = $1 AND is_primary = true AND is_active = true
```

Enforces:
- Primary token only (is_primary=true)
- Active token only (is_active=true)
- Exactly one primary per member (unique constraint enforced by DB)

**Safeguard 6B: Check token expiry if card**

```javascript
if (token.card_type && token.expiryYear && token.expiryMonth) {
  const exp = new Date(token.expiryYear, token.expiryMonth);
  if (exp < now) {
    throw new Error('Card expired');
  }
}
```

Skip charge if card expired; mark subscription 'needs_new_payment'

**Safeguard 6C: Validate token has network transaction ID**

```sql
WHERE original_network_trans_id IS NOT NULL
```

EPX requires this for recurring eligibility; don't charge without it

---

### 6.7 Grace Period Bypass Prevention

**Safeguard 7A: Check enrollment date before scheduling**

Before charging, verify:
```sql
SELECT enrollment_date FROM members WHERE id = $1
```

Calculate days since enrollment → if < 14 days: SKIP this run

OR: Add grace_period_ends_at to subscriptions table, check before charging

**Safeguard 7B: Query includes grace period check**

```sql
WHERE next_billing_date <= NOW()
  AND created_at + INTERVAL '14 days' <= NOW()
```

Double-checks subscription is old enough to charge

**Safeguard 7C: Commission payout status prerequisite**

```sql
  AND NOT EXISTS (
    SELECT 1 FROM commission_payouts
    WHERE // subscription joins to commission
    AND status = 'ineligible'
    AND payment_eligible_date > NOW()
  )
```

Don't charge if associated commissions still in grace period

---

### 6.8 Stale Token Prevention

**Safeguard 8A: Token expiry check for cards**

Before calling EPX:
```javascript
if (token.paymentMethodType === 'CreditCard') {
  const expiry = new Date(token.expiryYear, parseInt(token.expiryMonth));
  if (expiry <= now) {
    report_log.status = 'token_expired';
    updateSubscriptionStatus(subscription.id, 'payment_method_expired');
    sendAlert('Member needs new payment method', subscription.member_id);
    SKIP; // Don't charge yet
  }
}
```

**Safeguard 8B: Token used within TTL**

```javascript
const daysSinceUsed = (now - token.lastUsedAt) / (1000 * 60 * 60 * 24);
if (daysSinceUsed > 90) {
  // Token hasn't been used in 90 days; verify still valid
  // Consider: Mark stale, require member to re-auth
}
```

Don't use tokens older than threshold without verification

**Safeguard 8C: EPX token validation response**

After calling EPX (even if charge fails):
```javascript
if (epxResponse.error === 'INVALID_TOKEN' || 'EXPIRED_CARD') {
  markTokenInactive(token.id);
  updateSubscriptionStatus(subscription.id, 'payment_method_invalid');
  sendAlert('Member must update payment method', subscription.member_id);
}
```

Mark token unusable if EPX rejects it

---

## Summary Matrix: Safeguards vs. Scenarios

| Scenario | 6.1 | 6.2 | 6.3 | 6.4 | 6.5 | 6.6 | 6.7 | 6.8 |
|----------|-----|-----|-----|-----|-----|-----|-----|-----|
| Duplicate Charge | ✅ | | | ✅ | ✅ | | | |
| Orphaned Payment | | ✅ | | | | | | |
| Permanent Failure | | | ✅ | | | | | |
| Race Condition | | | | ✅ | | | | |
| Partial Batch | | | | | ✅ | | | |
| Token Misuse | | | | | | ✅ | | |
| Grace Period Bypass | | | | | | | ✅ | |
| Stale Token | | | | | | | | ✅ |

**All 8 safeguard categories required for production use**
