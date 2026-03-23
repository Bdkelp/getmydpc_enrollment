# Safe Recurring Billing Scheduler Implementation — Gap Analysis

**Analysis Date**: March 18, 2026  
**Current State**: Recurring billing triggered by external EPX webhooks only  
**Proposed State**: Add internal scheduler for proactive recurring charges

---

## SECTION 1 — Minimum Missing Components for Recurring Billing Scheduler

### 1.1 Background Job Infrastructure

**What's Missing:**
- No job queue or task runner (use Bull, RabbitMQ, or cron)
- No distributed lock mechanism (for multi-instance deployments)
- No job state tracking (queued, running, completed, failed)
- No job retry mechanism with exponential backoff

**Why It Matters:**
- DigitalOcean App Platform can have multiple instances
- Without distributed lock, same member charged twice
- Need to track which jobs succeeded/failed/should-retry

**Current Gap:**
- Server starts background jobs directly in `index.ts`
- `scheduleMembershipActivation()` runs on same process
- **No mechanism to prevent duplicate runs across instances**

---

### 1.2 Recurring Payment Due Date Query

**What's Missing:**
- Query logic to find subscriptions with `next_billing_date <= TODAY`
- Filter to skip already-processed dates
- Order by priority (earliest first)
- Handle cancellations/suspensions

**Why It Matters:**
- Must know which members should be charged
- Can't charge cancelled members
- Need consistent ordering for retries

**Current Gap:**
- `subscriptions.next_billing_date` is set but never queried
- No scheduled read of "due" subscriptions
- No check for `subscriptions.status` before attempting charge

**Minimal Implementation Needed:**
```sql
SELECT * FROM subscriptions WHERE
  next_billing_date <= NOW()
  AND status = 'active'
  AND member_id IN (SELECT id FROM members WHERE is_active = true)
  ORDER BY next_billing_date ASC
```

---

### 1.3 Idempotency & Deduplication

**What's Missing:**
- Idempotency keys for each billing run
- Tracking of which dates were already processed
- Detection of partial batch runs
- Prevention of double-charging same member same day

**Why It Matters:**
- If scheduler crashes at 3am, might run again at 4am
- Both runs could attempt to charge the same member
- EPX might process both, charging member twice

**Current Gap:**
- No `billing_schedule` rows created on successful charge
- No tracking of "we already tried to charge this member today"
- Retry logic (if implemented) could charge multiple times

**Minimal Implementation Needed:**
```
For each billing run:
├─ Generate run_id (uuid or timestamp based)
├─ Create billing_schedule record with:
│   ├─ member_id
│   ├─ payment_token_id
│   ├─ amount
│   ├─ next_billing_date (the date being processed)
│   ├─ failure_count (starts at 0)
│   ├─ status: 'pending' (not 'ineligible')
│   ├─ billing_run_id (FK to track batch)
│   └─ attempt_timestamp
└─ Before retry: Check if already succeeded for this date
```

---

### 1.4 Payment Processing Without Webhook

**What's Missing:**
- Logic to submit charge to EPX Server Post API (not just receive webhooks)
- Handling EPX response independently
- Creating payment records in-process (not waiting for webhook callback)
- Validation that charge actually succeeded before marking as paid

**Why It Matters:**
- Current flow: EPX → webhook → create payment record
- Scheduler flow: Must call EPX API directly
- Need to record charge immediately, handle EPX latency

**Current Gap:**
- `epx-payment-service.ts` has EPX API client (good!)
- But nothing actively calls it from a scheduler
- No "call EPX and check result inline" pattern

**Minimal Implementation Needed:**
```
For each due subscription:
├─ Fetch payment_token (decrypt BRIC)
├─ Call EPXServerPostService.payBill() NOT createSubscription()
├─ Wait for response (sync, not webhook)
├─ If success:
│   ├─ Create payment record immediately
│   ├─ Call createPayoutsForMemberPayment() (existing!)
│   ├─ Update subscriptions.next_billing_date += 1 month
│   ├─ Set failure_count = 0
│   └─ Mark billing_schedule.status = 'succeeded'
└─ If failure:
    ├─ Increment failure_count
    ├─ Determine if retryable (e.g., network vs. invalid card)
    ├─ Mark billing_schedule.status = 'pending_retry' or 'failed'
    └─ Schedule auto-retry (tomorrow morning)
```

---

### 1.5 Failure Classification & Retry Strategy

**What's Missing:**
- Logic to distinguish:
  - **Retryable**: Network timeout, temporary EPX downtime, rate limit
  - **Non-retryable**: Invalid card, expired token, member cancelled
  - **Manual review**: Account suspended, fraud flag
- Retry schedule (immediate, 1 hour, 24 hours)
- Max retry count before giving up
- Admin escalation for manual reconciliation

**Why It Matters:**
- Blindly retrying an invalid card wastes API calls
- Temporary failures should retry quickly
- Need to alert admin after N failures

**Current Gap:**
- No failure classification anywhere
- `failure_count` field never incremented
- No graduated retry strategy
- No alert mechanism

**Minimal Implementation Needed:**
```
classification:
  - EPX response code 400 → invalid card (non-retryable)
  - EPX response code 429 → rate limited (retryable, 1 hour wait)
  - Network timeout → retryable, 5 min wait
  - EPX 503 → retryable, 30 min wait
  - No response after 60s → retryable, 1 hour wait

retry_schedule:
  attempt_1: immediate (within billing run)
  attempt_2: +5 minutes
  attempt_3: +1 hour
  attempt_4: +24 hours
  attempt_5: GIVE UP, escalate to admin

max_retries: 5 per member per billing date
```

---

### 1.6 Billing Run Audit Log

**What's Missing:**
- Structured log of each billing run:
  - Start time, end time, duration
  - Members attempted, succeeded, failed, skipped
  - Amounts charged, amounts failed
  - Errors encountered
  - Retry schedule for next wave
- Query ability: "Show me all billing runs last week"
- Separate from payment logger (payment logger logs individual transactions)

**Why It Matters:**
- Debug "why wasn't member X charged?"
- Track scheduler health over time
- Revenue reconciliation
- Compliance audit trail

**Current Gap:**
- EPX payment logger exists (epx-payment-logger.ts)
- But scheduler run details not logged separately
- No structured run summary

**Minimal Implementation Needed:**
```
New table: billing_run_summary
├─ id (uuid)
├─ run_id (for grouping)
├─ started_at
├─ completed_at
├─ duration_ms
├─ members_attempted
├─ members_succeeded
├─ members_failed
├─ members_skipped (e.g., cancelled, no token)
├─ total_amount_charged
├─ total_amount_failed
├─ errors (JSONB array)
├─ next_retry_count (how many scheduled for auto-retry)
└─ created_at

Log each run to:
1. Database (billing_run_summary)
2. JSONL log file (like epx-payment-logger) for streaming analysis
```

---

### 1.7 Token Validity Check Before Charge Attempt

**What's Missing:**
- Pre-flight check: Is this payment_token still valid?
- Expiry validation for cards
- Has token been marked inactive?
- Is member's account in good standing?

**Why It Matters:**
- Trying to charge an expired card = failed charge + failed retry
- Saves EPX API call if we know it will fail
- Reduces member frustration from failed charge emails

**Current Gap:**
- payment_tokens table has `is_active` and `expires_at` fields
- But never checked before attempting charge
- No validation before EPX call

**Minimal Implementation Needed:**
```
Before charging:
├─ Fetch payment_token for member
├─ Check is_active = true
├─ Check expires_at > NOW() (for cards)
├─ Check member.is_active = true
├─ Check member.status = 'active'
├─ Check subscription.status = 'active'
└─ If ANY check fails:
    ├─ Mark billing_schedule.status = 'skipped'
    ├─ Log reason (expired token, inactive member, etc.)
    ├─ Send notification to member/agent
    └─ Do NOT attempt EPX charge
```

---

### 1.8 Distributed Lock Mechanism

**What's Missing:**
- Mechanism to prevent multiple scheduler instances running simultaneously
- Lock per member (so Member A can charge while Member B is retrying)
- Lock timeout (if process dies, lock auto-releases)
- Lock versioning (so old process doesn't override new lock)

**Why It Matters:**
- DigitalOcean App Platform scales to multiple instances
- Without lock, both instances attempt same charges
- Member charged twice for one month

**Current Gap:**
- `scheduleMembershipActivation()` runs without any locking
- If deployed to 3 instances, activation runs 3x

**Minimal Implementation Needed:**
```
Option A (Simple): Database-based lock
├─ Create billing_lock table:
│   ├─ id (uuid)
│   ├─ lock_key (e.g., "scheduled_billing_run")
│   ├─ held_by (instance_id or hostname)
│   ├─ acquired_at
│   ├─ expires_at (NOW() + 30 minutes)
│   └─ version (for stale lock detection)
├─ Before run: Try to acquire lock
├─ UPDATE ... WHERE lock_key = 'x' AND held_by = null SET held_by = 'instance-1'
├─ If UPDATE returns 0 rows: Another instance holds lock, EXIT
└─ If UPDATE returns 1 row: Acquired lock, PROCEED

Option B (Better): Use Redis if available
├─ SET billing_lock:run "instance-1" EX 1800 NX
├─ If returns nil: Another instance holds lock, EXIT
└─ If returns OK: Acquired lock, PROCEED
```

---

### 1.9 Rate Limiting for EPX API Calls

**What's Missing:**
- EPX rate limit awareness (e.g., 100 calls/minute)
- Batching of charges to stay within limits
- Backoff logic if rate limited
- Graceful handling of 429 responses

**Why It Matters:**
- If billing 100 members in 1 minute, EPX might reject calls
- Need to batch or stagger calls
- Otherwise: Only first 100 charge successfully, rest fail

**Current Gap:**
- No batching logic
- No rate limit tracking
- No staggered scheduling

**Minimal Implementation Needed:**
```
Configuration:
├─ EPX_RATE_LIMIT_CALLS = 100
├─ EPX_RATE_LIMIT_WINDOW_SECONDS = 60
└─ BATCH_DELAY_MS = 600 (between each charge, to spread across window)

During run:
├─ Charge first member
├─ Wait 600ms before next
├─ If EPX returns 429: exponential backoff (wait 5s, 10s, 20s)
├─ Track calls in current window
├─ If approaching limit: Wait until window resets
└─ Log rate limit hits for analysis
```

---

## SECTION 2 — Existing Components That MUST NOT Be Touched

### 2.1 EPX Hosted Checkout Flow (Critical - Working)

**Location**: `server/routes/epx-hosted-routes.ts`

**What It Does:**
- Initial member payment capture
- AUTH_GUID extraction from EPX response
- BRIC token generation and storage
- Payment record creation
- Commission payout creation

**Why Don't Touch:**
- ✅ Currently working in production
- ✅ All initial enrollments depend on this
- ✅ Commission calculations triggered here
- ✅ Any change risks breaking new signups

**How Scheduler Fits In:**
- Scheduler processes EXISTING members (from subscriptions)
- Scheduler does NOT modify EPX Hosted Checkout
- Scheduler uses already-created BRIC tokens from this flow

**Boundaries:**
```
DO NOT change:
- EPX callback handler logic
- AUTH_GUID extraction
- BRIC token creation/encryption
- Commission creation on initial payment
- Payment record structure/creation

DO use from scheduler:
- payment_tokens already created
- Existing BRIC tokens (already encrypted)
- Existing commission structures
- EPX payment logging (epx-payment-logger.ts)
```

---

### 2.2 Commission Payout System (Critical - Working)

**Location**: `server/services/commission-payout-service.ts`

**What It Does:**
- Creates monthly commission_payouts records
- Calculates payment_eligible_date
- Enforces 14-day grace period
- Tracks direct + override commissions

**Why Don't Touch:**
- ✅ Already handles monthly commission tracking correctly
- ✅ Weekly batch relies on this logic
- ✅ Change could break agent payouts

**How Scheduler Fits In:**
- Scheduler calls `createPayoutsForMemberPayment()` AFTER successful charge
- Passes: memberId, memberPaymentId, epxTransactionId, paymentCapturedAt
- Function creates commission records with eligible date calculation
- Does NOT modify the commission creation logic

**Boundaries:**
```
DO NOT change:
- payment_eligible_date calculation
- 14-day grace period logic
- Direct vs. override commission tracking
- Status transitions (ineligible → pending → paid)

DO call from scheduler:
- After successful charge: createPayoutsForMemberPayment()
- Existing function signature stays same
- Existing business rules stay same
```

---

### 2.3 Token Storage & Encryption (Critical - Security Risk)

**Location**: `server/storage.ts` (encryptPaymentToken, decryptPaymentToken)

**What It Does:**
- AES-256-CBC encryption of BRIC tokens
- Secure storage in payment_tokens table
- Encryption key managed via ENCRYPTION_KEY env var

**Why Don't Touch:**
- ✅ Handles PCI compliance
- ✅ Changing encryption could lose all existing tokens
- ✅ Breaking this = all recurring charges fail + security breach

**How Scheduler Fits In:**
- Scheduler calls `decryptPaymentToken()` to get actual BRIC
- Uses BRIC for EPX charge call
- Does NOT re-encrypt or modify tokens

**Boundaries:**
```
DO NOT change:
- Encryption algorithm
- IV generation/management
- Encryption key handling
- Token decryption logic
- Storage format

DO call from scheduler:
- decryptPaymentToken(encryptedToken) → returns plaintext BRIC
- Use BRIC for EPX Server Post API call
- Discard plaintext immediately after use
```

---

### 2.4 Membership Activation Service (Working - Don't Change)

**Location**: `server/services/membership-activation-service.ts`

**What It Does:**
- Daily check: members with status='pending_activation'
- Activates members when membership_start_date <= TODAY
- Sets status='active' + is_active=true

**Why Don't Touch:**
- ✅ Works independently
- ✅ Scheduler doesn't need to modify this
- ✅ Membership activation and billing are separate concerns

**How Scheduler Fits In:**
- Membership MUST be active before billing run charges them
- Scheduler reads: WHERE status='active' AND is_active=true
- Membership activation ensures those members exist
- No modification needed

**Boundaries:**
```
DO NOT change:
- Activation date logic
- Status transitions
- Welcome email triggers

DO depend on:
- Only charge members with status='active'
- Read is_active flag (must be true)
- Use membership_start_date for reference
```

---

### 2.5 Payment Callback System (Don't Hijack)

**Location**: `server/routes/epx-hosted-routes.ts` + `docs/EPX_PAYOUT_INTEGRATION.ts`

**What It Does:**
- Receives EPX webhooks for initial + recurring payments
- Creates payment records
- Calls createPayoutsForMemberPayment()
- Main source of truth for payment confirmation

**Why Don't Touch:**
- ✅ EPX sends webhooks when recurring payments are captured
- ✅ This callback should remain the PRIMARY payment record source
- ✅ Scheduler is backup/proactive, not replacement

**How Scheduler Fits In:**
- Webhook callback = EPX tells us payment succeeded
- Scheduler = we ask EPX proactively if payment should be made
- Both create payment records and commission payouts
- Scheduler does NOT disable/replace webhook system

**Boundaries:**
```
DO NOT change:
- Webhook handler logic
- Payment record creation from webhook
- Commission creation from webhook
- Relies on webhook signature validation

DO NOT skip:
- Webhooks will still fire for scheduled charges
- Both webhook AND scheduler might see same payment
- Must use idempotency keys to deduplicate

DO use from scheduler:
- Same payment_tokens table
- Same payment record insertion
- Same createPayoutsForMemberPayment() call
```

---

### 2.6 Admin Dashboard & Payment Reconciliation (Don't Break)

**Location**: `server/routes/payment-tracking.ts` + `payment-reconciliation.ts`

**What It Does:**
- View recent payments
- Track failed payments
- Reconcile missing payments/tokens
- Check payment eligibility for batch processing

**Why Don't Touch:**
- ✅ Admin relies on these for operations
- ✅ New data from scheduler must be compatible
- ✅ Existing queries must still work

**How Scheduler Fits In:**
- Scheduler creates payment records (same structure)
- Reconciliation queries still find them
- Admin interface unchanged
- Scheduler runs are queryable via billing_run_summary

**Boundaries:**
```
DO NOT change:
- Payment table schema
- Query patterns for admin views
- Reconciliation logic

DO ensure:
- Scheduler-created payments appear in admin views
- Same status fields (succeeded, failed, pending)
- Compatible with existing queries
```

---

## SECTION 3 — Safest Way to Add Scheduler Without Altering Payment Flow

### 3.1 Architectural Approach: Additive, Not Modificative

**Core Principle:**
- Add new code paths, don't modify existing ones
- Existing webhook flow continues unchanged
- Scheduler is a new, independent flow
- Both flows feed the same payment/commission tables

**Pattern:**
```
Current Flow (Unchanged):
  Member pays via Hosted Checkout
    ↓
  EPX returns AUTH_GUID
    ↓
  Webhook handler creates payment + commission_payouts
    ↓
  Admin dashboard shows payment

New Scheduler Flow (Additive):
  Scheduler queries due subscriptions
    ↓
  For each: Decrypt BRIC token
    ↓
  Call EPX Server Post API (like a webhook, but initiated by us)
    ↓
  EPX returns transaction result
    ↓
  Create payment + commission_payouts (same as webhook flow)
    ↓
  Admin dashboard shows payment (same table, same view)

Both flows DON'T interfere:
  - Same payment table (compatible)
  - Same commission payout logic (reuse)
  - Webhook still works if EPX also sends notification
  - Idempotency keys prevent double-processing
```

---

### 3.2 Entry Point: New File, Not Modification of Existing

**Existing Files (DO NOT MODIFY):**
- `server/index.ts` - Server startup
- `server/routes/epx-hosted-routes.ts` - Hosted checkout
- `server/services/commission-payout-service.ts` - Commission creation
- `server/services/epx-payment-service.ts` - EPX API client

**New Files to Create:**
```
server/services/billing-scheduler-service.ts
  ├─ Query due subscriptions
  ├─ Fetch payment tokens
  ├─ Call EPX for charges
  ├─ Handle responses
  ├─ Log billing runs
  └─ No modification to existing services

server/services/billing-failure-handler.ts
  ├─ Classify failures (retryable vs. not)
  ├─ Schedule retries
  ├─ Alert admin
  └─ Track retry history

server/jobs/recurring-billing-job.ts (or similar)
  ├─ Bootstrap scheduler
  ├─ Distributed lock acquisition
  ├─ Rate limiting
  ├─ Call billing-scheduler-service
  └─ Error handling

migrations/????_add_billing_scheduler_tables.sql
  ├─ Extend billing_schedule table (if using)
  ├─ Add billing_run_summary table
  ├─ Add billing_lock table
  ├─ Add indexes
  └─ Do NOT alter existing tables
```

**Registration in index.ts:**
```typescript
// Existing code stays as-is
scheduleMembershipActivation();

// NEW: Add scheduler registration (with flag)
if (process.env.BILLING_SCHEDULER_ENABLED === 'true') {
  initializeRecurringBillingScheduler();
}

// Existing routes remain unchanged
app.use(routes);
```

---

### 3.3 Scheduler Triggering: Multiple Safe Options

**Option A: Cron-based (Simplest)**
```
Every day at 2 AM:
  ├─ Acquire distributed lock
  ├─ Query subscriptions WHERE next_billing_date <= TODAY
  ├─ Process each (with rate limiting)
  ├─ Release lock
  └─ Log summary

Advantages:
  ✅ Simple, predictable
  ✅ No external dependencies
  ✅ Easy to test

Disadvantages:
  ❌ Fixed schedule (what if system off at 2 AM?)
  ❌ No recovery of missed runs
  ❌ All members charged in 1-2 hour window
```

**Option B: Job Queue-based (Robust)**
```
When scheduler starts:
  ├─ Query all due subscriptions
  ├─ Create a job for each in queue
  ├─ Workers process in parallel (with rate limit)
  └─ Retry failed jobs with exponential backoff

Advantages:
  ✅ Resilient to crashes
  ✅ Can retry failed jobs later
  ✅ Scales with workers

Disadvantages:
  ❌ External dependency (Redis, RabbitMQ)
  ❌ More complex to deploy
```

**Option C: Hybrid (Recommended)**
```
Use Node cron + database state:
  ├─ Cron triggers at 2 AM: "time to check billing"
  ├─ Query: billing_schedule WHERE status = 'pending_retry'
  ├─ Also query: subscriptions WHERE next_billing_date <= TODAY
  ├─ Combine both into one run
  ├─ Process with backoff between attempts
  └─ Persists state in database for recovery

Advantages:
  ✅ No external queue needed
  ✅ Can pause/resume from DB state
  ✅ Natural recovery from crashes
  ❌ Mid-complexity
```

---

### 3.4 Data Flow: Scheduler → Payment → Commission

**Safest Sequence:**

```
1. PRE-FLIGHT CHECKS (No data writes yet)
   ├─ Acquire distributed lock
   │   └─ If failed: EXIT (another instance running)
   ├─ Fetch payment_tokens for all active members
   ├─ Check token validity (expiry, is_active)
   ├─ Filter members (status='active', is_active=true)
   ├─ Sort by due_date (earliest first)
   │   └─ Ensures consistent retry order
   └─ COUNT members ready to charge
       └─ If 0: EXIT (nothing to do)

2. BILLING RUN START (Create audit record)
   ├─ Create billing_run_summary record:
   │   ├─ id = uuid()
   │   ├─ started_at = NOW()
   │   ├─ members_attempted = 0
   │   ├─ members_succeeded = 0
   │   ├─ members_failed = 0
   │   └─ status = 'in_progress'
   └─ Save to DB (allows recovery if crash)

3. FOR EACH MEMBER TO CHARGE (Read-only queries)
   ├─ Fetch subscription, member, payment_token
   ├─ Validate token not expired
   ├─ Check member still active
   ├─ Check subscription still active
   ├─ Verify no duplicate: is this date already in billing_schedule?
   │   ├─ Query: WHERE member_id = ? AND next_billing_date = ?
   │   ├─ If found AND status='succeeded': SKIP (already charged)
   │   └─ If found AND status='pending_retry': UPDATE (retry)
   └─ Otherwise: PROCEED to charge

4. ATTEMPT CHARGE (Single EPX call per member)
   ├─ Create draft billing_schedule row:
   │   ├─ member_id
   │   ├─ payment_token_id
   │   ├─ amount
   │   ├─ next_billing_date (the date being processed)
   │   ├─ status = 'in_progress'
   │   ├─ attempt_number = 1 or N (if retry)
   │   └─ attempt_timestamp = NOW()
   │
   ├─ Decrypt payment_token.bric_token
   │   └─ Keep in memory ONLY, don't log
   │
   ├─ Call EPX Server Post API:
   │   ├─ POST /paybill with {amount, BRIC, customer}
   │   ├─ Wait for response (sync, with 30s timeout)
   │   └─ Log (with masking) via epx-payment-logger
   │
   └─ Handle response:

      IF success (EPX status 200, transaction_id):
        ├─ Create payment record:
        │   ├─ member_id
        │   ├─ amount
        │   ├─ currency = 'USD'
        │   ├─ status = 'succeeded'
        │   ├─ transaction_id (from EPX)
        │   ├─ payment_method_type = get from payment_tokens
        │   ├─ created_at = NOW()
        │   └─ metadata = { scheduled_billing: true, run_id: ... }
        │
        ├─ Call createPayoutsForMemberPayment():
        │   ├─ memberId, paymentId, epxTransactionId, paymentCapturedAt
        │   └─ Creates commission_payouts with eligible dates
        │
        ├─ Update subscription:
        │   ├─ next_billing_date = ADD 1 MONTH
        │   └─ updated_at = NOW()
        │
        ├─ Update billing_schedule:
        │   ├─ status = 'succeeded'
        │   ├─ failure_count = 0
        │   └─ completed_at = NOW()
        │
        └─ Increment: billing_run_summary.members_succeeded++

      IF failure (EPX error, network timeout, etc):
        ├─ Classify failure:
        │   ├─ 400 series = invalid (don't retry)
        │   ├─ 429 = rate limited (retry soon)
        │   ├─ 5xx, timeout = server issue (retry)
        │   └─ Unknown = manual review needed
        │
        ├─ Update billing_schedule:
        │   ├─ status = 'pending_retry' or 'failed'
        │   ├─ failure_count++
        │   ├─ last_error_code = EPX response code
        │   ├─ last_error_message = EPX error text
        │   └─ next_retry_at = NOW() + BACKOFF(failure_count)
        │
        ├─ Create admin alert if failure_count >= 3
        │   └─ "Member X failed 3 times, needs review"
        │
        └─ Increment: billing_run_summary.members_failed++

5. RATE LIMITING (Between each member)
   ├─ If calls approaching EPX limit:
   │   ├─ SLEEP (until limit resets or sufficient time passed)
   │   └─ Log backoff event
   └─ SLEEP 600ms default (to spread calls across window)

6. BILLING RUN END (Finalize audit record)
   ├─ Update billing_run_summary:
   │   ├─ completed_at = NOW()
   │   ├─ duration_ms = completed - started
   │   ├─ status = 'completed'
   │   ├─ total_amount_charged = SUM(succeeded payments)
   │   ├─ next_retry_count = COUNT where status='pending_retry'
   │   └─ errors = [list of errors]
   │
   ├─ Log final summary:
   │   ├─ To JSONL file (epx-payment-logger style)
   │   └─ Include: count, amounts, failures, retry schedule
   │
   ├─ Send admin notification if any retries scheduled
   │   └─ "20 members will retry billing tomorrow morning"
   │
   └─ Release distributed lock
```

---

### 3.5 Recovery from Partial Failures

**If Scheduler Crashes Mid-Run:**

```
1. Next scheduled run (tomorrow or manual):
   ├─ Query billing_schedule WHERE status IN ('in_progress', 'pending_retry')
   ├─ For 'in_progress' (crashed mid-attempt):
   │   ├─ Check if payment exists:
   │   │   ├─ If YES: EPX charged but we crashed before cleanup
   │   │   │   └─ Mark billing_schedule.status = 'succeeded'
   │   │   └─ If NO: EPX call never happened
   │   │       └─ Mark billing_schedule.status = 'pending_retry'
   └─ For 'pending_retry':
       └─ Attempt charge again (using enhanced logic above)

2. Webhook may arrive late:
   ├─ EPX sends confirmation for charge that was already recorded
   ├─ Payment record already exists
   ├─ Webhook handler creates second commission_payouts (with same data)
   ├─ Weekly batch sees duplicate:
   │   ├─ Commission payouts for same month, same agent
   │   └─ Prevents double-payout via unique constraint:
   │       └─ UNIQUE(commission_id, payout_month)
```

---

## SECTION 4 — Suggested Architecture Using Existing Patterns in This Repo

### 4.1 Logging Pattern: Use Existing epx-payment-logger.ts

**Instead of Creating New Logger:**

```typescript
// Reuse existing logging pattern:
import { logEPX } from './services/epx-payment-logger';

// During scheduler run:
logEPX({
  level: 'info',
  context: '[Scheduled Billing]',
  message: 'Starting daily billing run',
  data: {
    members_due: 42,
    run_id: 'SCHED-2026-03-18-02:00:00'
  }
});

// Success:
logEPX({
  level: 'info',
  context: '[Scheduled Billing]',
  message: 'Member charged successfully',
  data: {
    member_id: 123,
    amount: 99.99,
    transaction_id: 'epx_trans_abc123',
    run_id: 'SCHED-...'
  }
});

// Failure:
logEPX({
  level: 'error',
  context: '[Scheduled Billing]',
  message: 'Member charge failed',
  data: {
    member_id: 123,
    reason: 'Expired token',
    epx_response_code: 401,
    failure_count: 2,
    run_id: 'SCHED-...'
  }
});
```

**Why This Works:**
- ✅ Already JSONL format
- ✅ Consistent with payment logging
- ✅ Stored in EPX_LOG_DIR alongside other payment events
- ✅ Searchable, parseable
- ✅ No new infrastructure

---

### 4.2 Error Handling Pattern: Use Existing certification-logger.ts

**For Compliance Events:**

```typescript
// Reuse existing certification logger for payment authorizations:
import { certificationLogger } from './services/certification-logger';

certificationLogger.logCertificationEntry({
  purpose: 'scheduled-recurring-billing',
  requestedBy: 'scheduler', // Not a user, so 'scheduler'
  memberId: 123,
  memberEmail: 'member@example.com',
  reason: 'automatic-monthly-charge',
  details: {
    amount: 99.99,
    transaction_id: 'epx_trans_abc123',
    scheduled: true,
    run_id: 'SCHED-...'
  },
  timestamp: new Date().toISOString()
});
```

**Why This Works:**
- ✅ Compliance audit trail already established
- ✅ Masked sensitive data automatically
- ✅ Separate from operational logs
- ✅ Legal/audit ready

---

### 4.3 Token Handling Pattern: Use storage.ts Functions

**Reuse Existing Encryption/Decryption:**

```typescript
// Already exists:
import { decryptPaymentToken, encryptPaymentToken } from './storage';

// Use in scheduler:
const encryptedBric = paymentToken.bric_token; // From DB
const bric = decryptPaymentToken(encryptedBric); // Returns plaintext

// Call EPX with plaintext BRIC
try {
  const response = await epxService.payBill({
    BRIC: bric,
    amount: subscription.amount,
    ...
  });
} finally {
  // Ensure BRIC doesn't remain in memory
  bric = null; // JavaScript garbage collection will handle
}
```

**Why This Works:**
- ✅ Encryption/decryption already vetted
- ✅ PCI compliance already considered
- ✅ Don't re-invent security

---

### 4.4 Commission Creation Pattern: Reuse Existing Service

**No Changes Needed:**

```typescript
// Existing function (already working):
import { createPayoutsForMemberPayment } from './services/commission-payout-service';

// Call it the same way from scheduler as from webhook:
const result = await createPayoutsForMemberPayment(
  memberId,              // Integer
  memberPaymentId,       // Integer (from newly created payment record)
  epxTransactionId,      // String
  paymentCapturedAt      // Date
);

// Returns: { direct: [payouts], override: [payouts] }
```

**Why This Works:**
- ✅ Function already handles monthly calculations
- ✅ Already tracks 14-day grace period
- ✅ Direct + override logic already there
- ✅ Zero modification needed

---

### 4.5 Database Query Pattern: Use Supabase Client

**Existing Pattern in storage.ts:**

```typescript
// Follow existing pattern:
import { supabase } from './lib/supabaseClient';

// Query due subscriptions:
const { data: dueSubscriptions, error } = await supabase
  .from('subscriptions')
  .select('id, member_id, next_billing_date, amount, payment_token_id')
  .eq('status', 'active')
  .lte('next_billing_date', new Date().toISOString())
  .order('next_billing_date', { ascending: true });

// Create billing_schedule record:
const { data: billingSched, error } = await supabase
  .from('billing_schedule')
  .insert({
    member_id: memberId,
    payment_token_id: paymentTokenId,
    amount: subscription.amount,
    next_billing_date: subscription.next_billing_date,
    status: 'in_progress',
    attempt_number: attemptNum,
    attempt_timestamp: new Date().toISOString()
  })
  .select()
  .single();
```

**Why This Works:**
- ✅ Consistent with existing storage.ts patterns
- ✅ RLS policies already in place
- ✅ Error handling established
- ✅ No new database connection pool needed

---

### 4.6 Retry/Backoff Pattern: Follow Existing Patterns

**Similar to membership-activation-service:**

```typescript
// membership-activation-service already does daily check
// billing-scheduler-service should do similar:

// Daily cron:
setInterval(async () => {
  try {
    const result = await runBillingScheduler();
    console.log('[Scheduler] Completed:', result);
  } catch (error) {
    console.error('[Scheduler] Failed:', error);
    // Similar to membership activation error handling
  }
}, 24 * 60 * 60 * 1000); // Daily
```

**Why This Works:**
- ✅ Consistent with existing scheduler patterns
- ✅ Same error logging approach
- ✅ Same timing patterns

---

## SECTION 5 — Potential Failure Scenarios If Scheduler Implemented Incorrectly

### 5.1 Duplicate Charging (Highest Risk)

**Scenario 1A: No Distributed Lock**
```
Instance A starts at 2:00 AM → Acquires list of 100 members to charge
Instance B starts at 2:00:30 AM (delayed startup) → Acquires SAME list

Both charge Member#1 simultaneously
  ├─ Instance A: EPX charge succeeds, creates payment#1
  ├─ Instance B: EPX charge succeeds, creates payment#2
  └─ Member charged twice: $99.99 × 2 = $199.98

Result: 
  ✅ Two payments in system
  ✅ Two commission_payouts created
  ✅ Member sees two charges (nightmare support call)
  ✅ Refund needed (loses transaction fees)
```

**Scenario 1B: No Idempotency Keys**
```
Instance A calls EPX to charge member#1
  EPX processes, returns transaction_id = "TXN123"
  Instance A crashes BEFORE creating payment record

Next run (Instance B):
  Sees member#1 still due (no payment exists)
  Calls EPX again with same amount, same member
  EPX processes again (or returns duplicate error)
  
If EPX processes:
  └─ Member charged again for same month
```

**Scenario 1C: Race Between Webhook and Scheduler**
```
Member has BRIC token, subscriptions.next_billing_date = Mar 18

Scheduler Run 1: 2 AM
  └─ Attempts to call EPX to charge, succeeds

Webhook arrives: 2:05 AM
  └─ Also creates payment record (EPX sent notification)

Result:
  ✅ Two payment records for same transaction
  ✅ Commission payouts might deduplicate (if unique constraint on commission_id + payout_month)
  ✅ But could be confused in admin system
```

---

### 5.2 Broken Enrollment Recovery

**Scenario 2A: Charging Wrong Next Date**
```
Member enrolled Mar 18
scheduler_run_1: Mar 19 at 2 AM
  ├─ Member not yet due (membership_start_date = Mar 25)
  ├─ But scheduler checks subscriptions.next_billing_date = Apr 18
  ├─ Charges member 1 month early
  └─ next_billing_date updated to May 18

Result:
  ✅ Member charged when shouldn't be (refund needed)
  ✅ Billing schedule now off by one month
```

**Scenario 2B: Charging Cancelled Member**
```
Member enrolled, subscriptions.status = 'active'
Member requests cancellation, status updated to 'cancelled'

scheduler_run @ 2 AM:
  ├─ Reads subscriptions (but admin just cancelled)
  ├─ Scheduler query uses stale snapshot
  ├─ Charges cancelled member
  ├─ commission_payouts created for cancelled enrollment
  └─ Member sees unexpected charge

Result:
  ✅ Charge processed after cancellation (customer service issue)
  ✅ Difficult to reconcile
```

**Scenario 2C: Charging Suspended Member**
```
Member enrolled, but:
  ├─ Membership status = 'active'
  ├─ Members table = is_active true
  ├─ BUT: agents marked member "suspended pending review"
  │   (stored in admin_logs or separate suspension table)
  └─ Scheduler doesn't check suspension status

Result:
  ✅ Scheduler charges suspended member
  ✅ Later, admin finds out member was suspended
```

---

### 5.3 Token Misuse or Expiry

**Scenario 3A: Using Expired Token**
```
payment_tokens{
  card_expiry_year = '2025'
  is_active = true (never updated)
  expires_at = NULL (never set)
}

scheduler - Mar 2026:
  ├─ Checks: is_active = true ✓
  ├─ Checks: expires_at > NOW() → NULL > NOW() = true (null check fails!)
  ├─ Calls EPX with expired card
  ├─ EPX rejects: "Card expired"
  │   failure_count++
  ├─ Retries 4x over 2 days (each fails)
  └─ Member gets 4 failure emails

Result:
  ✅ Unnecessary EPX calls
  ✅ Member confusion
  ✅ Token never marked inactive
  ✅ Next month: same 4 failures
```

**Scenario 3B: Token Compromised or Revoked**
```
BRIC token was compromised, EPX revoked WITHOUT notifying platform
is_active still = true

scheduler_run:
  ├─ Calls EPX with revoked token
  ├─ EPX: "Invalid token"
  ├─ failure_count++
  ├─ Retry logic retries 4x
  └─ Member gets 4 failed charge emails

Result:
  ✅ Member never charged (which is good)
  ✅ But now member's billing is broken for month
  ✅ Needs admin intervention to generate new token
```

---

### 5.4 Race Conditions

**Scenario 4A: Concurrent Retry Attempts**
```
billing_schedule[1]:
  attempt_1: failed at 2 AM
  attempt_2: scheduled for 3 AM
  attempt_3: scheduled for 4 AM

Scheduler triggered at 3 AM by cron (normal run)
Retry job triggered at 3 AM by queue system

Both read billing_schedule[1]:
  ├─ Both see: status = 'pending_retry', attempt_number = 1
  ├─ Both increment: attempt_number → 2
  ├─ Both call EPX
  ├─ EPX charges twice
  └─ Member double-charged

Result:
  ✅ Concurrent updates to same record = race condition
```

**Scenario 4B: Update Lost to Race**
```
Thread A reads: subscription.next_billing_date = Mar 18
Thread A calls EPX (succeeds)
Thread A prepares UPDATE: next_billing_date = Apr 18

Thread B reads: subscription.next_billing_date = Mar 18 (before Thread A updates)
Thread B calls EPX (succeeds) 
Thread B prepares UPDATE: next_billing_date = Apr 18

Both threads UPDATE (last write wins):
  └─ Only 1 UPDATE succeeds, subscription now shows Apr 18

Member charged Mar 18 twice (once per thread):
  ├─ Two transaction_ids exist
  ├─ subscriptions.next_billing_date = Apr 18 (correct)
  └─ But TWO payments recorded
```

**Scenario 4C: Partial Batch Update**
```
billing_run_summary.members_attempted = 100
Scheduler processes members 1-50, success, crashes

Next scheduler run:
  Sees billing_run_summary.members_attempted = 100
  But members 51-100 never actually charged
  
Attempts to charge 51-100 again:
  ├─ Some succeed (duplicate)
  ├─ Some fail (already charged by first run)
  └─ Report shows confusing mix of success/failure

Result:
  ✅ Partial retry with inconsistent state
```

---

### 5.5 Retry Chaos (Infinite Loops)

**Scenario 5A: Retrying Non-Retryable Failure**
```
Member's card is invalid: "Card number format invalid"
(Non-retryable: customer must update card)

failure_count = 0: Mar 18 @ 2 AM → fails, retry in 5 min
failure_count = 1: Mar 18 @ 2:05 AM → fails, retry in 1 hour
failure_count = 2: Mar 18 @ 3:05 AM → fails, retry in 24 hours
failure_count = 3: Mar 19 @ 3:05 AM → fails, retry in 24 hours
failure_count = 4: Mar 20 @ 3:05 AM → fails, GIVE UP

Result:
  ✅ 5 EPX calls for unrecoverable error
  ✅ Customer sees 5 "charge failed" emails
  ✅ Frustration, support tickets
  ✅ All calls wasted
```

**Scenario 5B: Retry Cascade**
```
Retry scheduler checks: WHERE status = 'pending_retry'
Today finds 5 members pending retry
All 5 re-added to queue for tonight

Tomorrow finds 5 same members still pending retry
(Previous attempts failed)
All 5 re-added again

This continues for weeks:
  ├─ Same 5 members retried daily
  ├─ EPX receives 5 calls/day × 20 days = 100 calls for 5 members
  ├─ Rate limiting kicks in
  ├─ Other members' charges now affected
  └─ Billing system effectively DoS-ing itself
```

**Scenario 5C: Exponential Backoff Broken**
```
If retry backoff is implemented as:
  next_retry = NOW() + (2 ^ failure_count) minutes

failure_count = 1: 2 min wait
failure_count = 2: 4 min wait
failure_count = 3: 8 min wait
failure_count = 10: 1024 min = 17 hours
failure_count = 20: 1M+ minutes = years in future

If scheduler doesn't check failure_count before retrying:
  └─ Silently never retries (member stuck in limbo)

If scheduler doesn't cap failure_count:
  └─ Eventually overflows integer or never recovers
```

---

### 5.6 Webhook + Scheduler Conflicts

**Scenario 6A: Webhook Arrives After Scheduler**
```
Scheduler @ 2 AM: charges member#1, creates payment#1
EPX processes, sends webhook @ 2:30 AM
Webhook handler @ 2:30 AM: creates payment#2 (duplicate)

Two months later:
  Member disputes one charge
  System sees TWO payments in same month
  Can't determine which is "real"
  Forced manual reconciliation
```

**Scenario 6B: Webhook Arrives Before Scheduler Creates Record**
```
Scheduler @ 2 AM: calls EPX
EPX processes, sends webhook @ 2:01 AM (immediate confirmation)
Webhook handler @ 2:01 AM: reads subscriptions, creates payment, updates next_billing_date

Scheduler @ 2:02 AM: EPX response arrives (late), tries to create payment
Scheduler finds: payment already exists, next_billing_date already updated
Scheduler updates billing_schedule (status = succeeded)
  └─ But subscriptions.next_billing_date already moved to +2 months!

Result:
  ✅ Member double-moved in billing cycle
```

---

## SECTION 6 — Safeguards Required to Prevent Each Risk

### 6.1 Duplicate Charging Prevention

**Safeguard 1: Distributed Lock**
```
REQUIRED:
├─ Acquire lock before querying subscriptions
├─ Lock key: "billing_scheduler_run"
├─ Lock timeout: 30 minutes (max expected run duration)
├─ Lock versioning: avoid stale process overriding new lock
└─ Release lock after run completes

Implementation:
├─ Database: INSERT ... ON CONFLICT DO NOTHING
├─ Or Redis: SET key value NX EX timeout
└─ Or PostgreSQL advisory locks: SELECT pg_advisory_lock()

Verification:
├─ If deployed to 3 instances, only 1 runs at a time
├─ Multiple cron triggers don't cause concurrent runs
└─ Stale process doesn't prevent new scheduler from starting
```

**Safeguard 2: Idempotency Keys**
```
REQUIRED:
├─ Each member charge attempt gets unique idempotency_key
├─ Format: member_id + date + attempt_number + run_id
│   Example: "m_123_2026-03-18_attempt_1_run_abc123"
├─ Store idempotency_key in billing_schedule.idempotency_key
├─ Before EVERY EPX call: check if idempotency_key already succeeded
│   └─ Query: WHERE idempotency_key = ? AND status = 'succeeded'
└─ EPX API calls: include Idempotency-Key header (if supported)

Verification:
├─ If scheduler crashes mid-call, next run detects duplicate attempt
├─ If webhook arrives late, idempotency key prevents double-process
└─ EPX never charges twice with same key
```

**Safeguard 3: Payment Deduplication Query**
```
REQUIRED:
├─ Before any charge to member:
├─ Query: SELECT * FROM payments 
│   WHERE member_id = ? 
│   AND DATE(created_at) = CURRENT_DATE
│   AND status = 'succeeded'
├─ If found: log warning, skip charge
└─ Update existing billing_schedule record instead of retrying

Verification:
├─ Even if idempotency key fails, catch at database level
└─ No double charge possible
```

---

### 6.2 Broken Enrollment Prevention

**Safeguard 1: Pre-Charge Validation**
```
REQUIRED CHECKS (before every charge):

├─ members.status = 'active'
│   └─ Query: SELECT status FROM members WHERE id = ?
│
├─ members.is_active = true
│   └─ Must be true
│
├─ subscriptions.status = 'active'
│   └─ Query: SELECT status FROM subscriptions WHERE member_id = ?
│
├─ subscriptions.membership_start_date <= TODAY
│   └─ Membership has started
│
├─ members has valid payment_token
│   └─ Not NULL, is_active = true
│
└─ If ANY check fails:
    ├─ Mark billing_schedule.status = 'skipped'
    ├─ Log reason: "inactive member" / "cancelled subscription" / etc.
    ├─ Send notification to member/admin
    └─ Do NOT call EPX

Verification:
├─ No charges to cancelled members
├─ No charges before membership start
└─ All charges to members in good standing
```

**Safeguard 2: Charge Timing Validation**
```
REQUIRED:
├─ Verify charge date matches subscription intent
├─ Check: TODAY >= subscriptions.next_billing_date
├─ Check: TODAY < subscriptions.next_billing_date + 7 days (grace window)
│   └─ Prevents charging if NextBillingDate is future
│
├─ If outside window:
│   ├─ Don't charge yet (too early)
│   └─ Don't give up (might be lag, try again tomorrow)

Verification:
├─ Members charged on intended date +/- 1 day grace
└─ No premature or delayed charges
```

**Safeguard 3: Suspension Status Check**
```
OPTIONAL but RECOMMENDED:
├─ If platform has member suspension status:
│   └─ Check before charge:
│       └─ Is member suspended? (check admin_logs or suspension table)
├─ If suspended:
│   ├─ Mark billing_schedule.status = 'skipped'
│   ├─ Log: "Member suspended, skipping charge"
│   └─ Do NOT call EPX

Verification:
├─ Suspended members not charged
└─ Billing respects admin actions
```

---

### 6.3 Token Validation Before Charge

**Safeguard 1: Expiry Check**
```
REQUIRED:
├─ Before charge, validate payment_token:
│
├─ Check: is_active = true
│   └─ Token hasn't been manually disabled
│
├─ Check: expires_at > NOW() (if card expires)
│   └─ Handle NULL (non-expiring tokens or ACH)
│   └─ For expiring cards: today < card_expiry_date
│
├─ Check: NOT (payment_method_type = 'CreditCard' AND EXPIRY OLD)
│   └─ Query card_expiry_month, card_expiry_year
│   └─ Validate is future
│
└─ If ANY check fails:
    ├─ Mark token as inactive: is_active = false
    ├─ Mark billing_schedule.status = 'skipped'
    ├─ Log reason: "expired token"
    ├─ Send admin alert: "Member X token expired, needs new payment method"
    └─ Do NOT call EPX

Verification:
├─ No charges with expired cards
├─ Admin notified so can reach out to member
└─ Tokens marked inactive to prevent future attempts
```

**Safeguard 2: Token Validation Flag**
```
REQUIRED:
├─ Add field to payment_tokens: last_validation_result
│   ├─ 'valid' = successfully charged recently
│   ├─ 'invalid' = EPX rejected it
│   ├─ 'expired' = expiry check failed
│   ├─ 'suspicious' = possible fraud flag
│   └─ last_validation_date
│
├─ Before charge: check validation result:
│   ├─ If last_validation_result = 'invalid' AND recent:
│   │   └─ Don't retry (won't succeed)
│   └─ If last_validation_result = 'valid' AND within 30 days:
│       └─ Likely OK to retry
│
└─ After EPX call: update validation result

Verification:
├─ Don't waste calls on known-bad tokens
└─ Track token health over time
```

---

### 6.4 Race Condition Prevention

**Safeguard 1: Row-Level Locking**
```
REQUIRED for multi-threaded/multi-instance:
├─ When processing member:
│   ├─ SELECT * FROM subscriptions WHERE id = ? FOR UPDATE
│   │   └─ Acquires exclusive lock (blocks other threads)
│   ├─ Check all preconditions
│   ├─ Call EPX
│   ├─ Create payment
│   ├─ UPDATE subscriptions.next_billing_date
│   └─ Lock auto-released at transaction end
│
├─ Similarly for billing_schedule:
│   └─ Lock before updating attempt_number or status
│
└─ All operations in single transaction

Verification:
├─ If two threads attempt same member, second waits
├─ Race condition eliminated at database level
└─ Concurrent schedulers don't collide
```

**Safeguard 2: Optimistic Concurrency Control**
```
ALTERNATIVE if pessimistic locking not desired:
├─ Add version column to subscriptions:
│   ├─ version INT DEFAULT 1
│   └─ Increment on each update
│
├─ When updating:
│   ├─ SELECT version FROM subscriptions WHERE id = ?
│   ├─ Call EPX
│   ├─ UPDATE subscriptions SET next_billing_date = ?, version = version + 1
│   │  WHERE id = ? AND version = @original_version
│   ├─ If UPDATE returns 0 rows:
│   │   ├─ Version mismatch (concurrent update detected)
│   │   ├─ Treat as failed charge
│   │   └─ Add to retry queue
│   └─ If UPDATE returns 1 row: success
│
└─ Prevents lost updates without locking

Verification:
├─ Concurrent updates detected
└─ Retry mechanism handles conflicts
```

**Safeguard 3: Transaction Atomicity**
```
REQUIRED:
├─ Entire charge operation in single transaction:
│   ├─ CREATE payment record
│   ├─ CALL createPayoutsForMemberPayment()
│   ├─ UPDATE subscriptions.next_billing_date
│   ├─ UPDATE billing_schedule.status
│   └─ If any step fails: ROLLBACK all
│
├─ Benefits:
│   ├─ No partial payment records
│   ├─ No payment without commission payout
│   └─ No updated next_billing_date without payment record
│
└─ All or nothing

Verification:
├─ Payment records always consistent
└─ No orphaned or partial records
```

---

### 6.5 Retry Safeguards

**Safeguard 1: Failure Classification**
```
REQUIRED:
├─ Classify each EPX failure:
│
├─ Non-Retryable (give up immediately):
│   ├─ 400 = Invalid request (customer error)
│   ├─ 401 = Unauthorized (security issue)
│   ├─ 403 = Forbidden
│   ├─ 404 = Not found
│   └─ Max 0 retries
│
├─ Retryable (try again):
│   ├─ 408 = Request timeout (network)
│   ├─ 429 = Rate limited (EPX overloaded)
│   ├─ 500,502,503 = Server error (EPX down)
│   ├─ Network timeout
│   ├─ Connection refused
│   └─ Max 5 retries
│
├─ Manual Review (stop, alert admin):
│   ├─ Unexpected response format
│   ├─ Partial response (timeout mid-response)
│   ├─ Security-related rejections
│   └─ Max 1 attempt, escalate
│
└─ Update billing_schedule.failure_classification = category

Verification:
├─ Retryable errors actually retry
├─ Non-retryable errors don't waste attempts
└─ Admin alerted for weird errors
```

**Safeguard 2: Max Retry Count with Escalation**
```
REQUIRED:
├─ failure_count field in billing_schedule
│
├─ Retry logic:
│   ├─ If failure_count < 5: schedule auto-retry
│   ├─ If failure_count == 5: GIVE UP, set status='failed'
│   ├─ Create admin alert: "Member X failed 5 times, manual review needed"
│   └─ Log: requires_admin_action = true
│
├─ Admin escalation triggers:
│   ├─ Email to ADMIN_NOTIFICATION_EMAILS
│   ├─ Detail: member name, reason, amount, date
│   ├─ Action link: "Mark as renewed" or "Send recovery email to member"
│   └─ Don't retry automatically after admin is notified
│
└─ After 5 failed attempts, member must contact support

Verification:
├─ Retry cap prevents infinite loops
├─ Admin involved for difficult cases
└─ Member eventually reaches out or manually updates payment method
```

**Safeguard 3: Exponential Backoff with Ceiling**
```
REQUIRED:
├─ Backoff formula: delay = MIN(2^attempt_count * base_ms, max_ms)
│
├─ Example:
│   ├─ Attempt 1 fails @ 2:00 AM: retry @ 2:05 AM (5 min)
│   ├─ Attempt 2 fails @ 2:05 AM: retry @ 2:15 AM (10 min)
│   ├─ Attempt 3 fails @ 2:15 AM: retry @ 2:35 AM (20 min)
│   ├─ Attempt 4 fails @ 2:35 AM: retry @ 3:35 AM (60 min)
│   ├─ Attempt 5 fails @ 3:35 AM: give up
│   └─ Total: 5 attempts over 1.5 hours
│
├─ Ceiling: max_backoff_ms = 1 hour
│   └─ Prevents waiting days between retries
│
└─ Stagger retries to prevent thundering herd

Verification:
├─ Early retries come fast (recovers quickly)
├─ Late retries spread out (don't overwhelm EPX)
└─ Never waits infinitely
```

---

### 6.6 Batch Failure Handling

**Safeguard 1: Partial Batch Tracking**
```
REQUIRED:
├─ Create billing_run_summary record BEFORE starting:
│   ├─ id = uuid()
│   ├─ started_at = NOW()
│   ├─ members_attempted = 0
│   ├─ members_succeeded = 0
│   ├─ members_failed = 0
│   └─ status = 'in_progress'
│
├─ After each member:
│   ├─ Update counts
│   ├─ Log to file
│   ├─ Every N members: flush to DB
│   └─ Ensures progress visible
│
├─ If crash mid-run:
│   ├─ Next scheduler run reads billing_run_summary
│   ├─ See: 40 succeeded, 10 failed, 50 not yet attempted
│   ├─ Does NOT re-attempt succeeded members (idempotency check)
│   ├─ Retries failed members
│   └─ Attempts remaining members
│
└─ Run marked 'in_progress' until completion

Verification:
├─ Partial run recovery possible
├─ Know exactly what succeeded/failed
└─ No blind spots
```

**Safeguard 2: Idempotent Member Processing**
```
REQUIRED:
├─ For each member in batch:
│   ├─ Check: does billing_schedule record already exist?
│   │   └─ Query: WHERE member_id = ? AND next_billing_date = ? AND status = 'succeeded'
│   ├─ If found: SKIP (already charged successfully)
│   ├─ If not found: charge
│   └─ Record result in billing_schedule
│
├─ Handles these scenarios:
│   ├─ Previous run succeeded but DB updated after fact: skip
│   ├─ Previous run created billing_schedule but crashed: continue
│   ├─ Webhook arrived before scheduler could record: dedup
│   └─ Multiple scheduler restarts: safe to repeat
│
└─ Every member either in succeeded state or eligible for retry

Verification:
├─ No double-charging members from partial batch
└─ Recovery doesn't re-process succeeded charges
```

**Safeguard 3: Summary Stats Verification**
```
RECOMMENDED:
├─ After run completes:
│   ├─ Count payments created today
│   ├─ Count commission_payouts created today
│   ├─ Verify: commission_payouts > 0 iff payments > 0
│   ├─ Verify: no member charged twice same day
│   ├─ Verify: all amounts match subscription amounts
│   └─ Log: "Billing run validated: 42 payments, 84 commission_payouts"
│
├─ If validation fails:
│   ├─ Alert admin
│   ├─ Log discrepancies
│   ├─ Don't mark run 'completed' until resolved
│   └─ Requires manual review
│
└─ Sanity check before run is considered complete

Verification:
├─ Data integrity verified programmatically
└─ Admin alerted to anomalies immediately
```

---

### 6.7 Webhook + Scheduler Conflict Prevention

**Safeguard 1: Idempotency in Webhook Handler**
```
REQUIRED:
├─ Webhook handler should ALSO check for duplicates:
│   ├─ When webhook receives payment notification:
│   │   ├─ Query: SELECT * FROM payments WHERE transaction_id = ?
│   │   ├─ If found: SKIP (already processed)
│   │   └─ If not found: create payment record
│   └─ Use transaction_id as unique key
│
├─ Handles:
│   ├─ Webhook sent twice by EPX (rare but possible)
│   ├─ Late-arriving webhook for scheduler-initiated charge
│   ├─ Duplicate prevention at integration point
│   └─ Commission payouts deduplicate (unique constraint on commission_id + month)
│
└─ Both paths safe whether webhook or scheduler initiates

Verification:
├─ Webhook processes idempotently
└─ No duplicate payments from webhook
```

**Safeguard 2: next_billing_date Coordination**
```
REQUIRED:
├─ Only ONE code path updates subscriptions.next_billing_date:
│   └─ Payment processing logic (shared by scheduler AND webhook)
│
├─ Pattern:
│   ├─ After successful charge (webhook or scheduler):
│   │   ├─ Calculate: new_next_billing_date = ADD 1 MONTH
│   │   ├─ Update: UPDATE subscriptions SET next_billing_date = ? WHERE id = ?
│   │   └─ This SAME logic for both paths
│   └─ Both go through same createPayoutsForMemberPayment() call
│
├─ Prevents:
│   ├─ Webhook updates to Apr 18, scheduler updates to May 18 (conflict)
│   └─ Double-updating (+2 months instead of +1)
│
└─ Shared payment processing (DRY principle)

Verification:
├─ Same update logic regardless of initiator
└─ next_billing_date always exactly +1 month after charge
```

**Safeguard 3: Commission Payout Deduplication**
```
INHERENT (already exists):
├─ commission_payouts table has:
│   └─ UNIQUE(commission_id, payout_month)
│
├─ If both webhook and scheduler try to create payout for same month:
│   ├─ First succeeds
│   ├─ Second gets constraint violation
│   └─ Caught as "already exists" instead of duplicate creation
│
├─ Benefits:
│   ├─ No code changes needed
│   ├─ Database enforces uniqueness
│   └─ Prevents double commission payout
│
└─ This constraint must NOT be removed

Verification:
├─ Database constraint prevents duplicates
└─ Both webhook and scheduler can coexist safely
```

---

## Summary: Minimum Safeguards Checklist

```
CRITICAL (Must Have):
☐ Distributed lock (prevent concurrent runs)
☐ Idempotency keys (prevent duplicate charges)
☐ Pre-charge validation (skip inactive/cancelled)
☐ Token expiry check (don't charge with expired cards)
☐ Transaction atomicity (all-or-nothing charges)
☐ Failure classification (don't retry unrecoverable errors)
☐ Max retry count (prevent infinite loops)
☐ Partial batch recovery (idempotent processing)
☐ Billing run audit log (track what happened)
☐ Webhook deduplication (handle late arrivals)

HIGHLY RECOMMENDED:
☐ Exponential backoff (don't overwhelm EPX)
☐ Rate limiting (stay within EPX limits)
☐ Row-level locking (prevent race conditions)
☐ Summary stats verification (sanity check)
☐ Admin escalation (manual review for hard cases)
☐ Suspension status check (don't charge suspended members)

NICE-TO-HAVE:
☐ Token validation history (track token health)
☐ Graceful degradation (scheduler disabled if errors)
☐ Metrics/dashboards (operational visibility)
```

---

**END OF ANALYSIS**

No code written. No refactors proposed. Only gaps identified and safeguards specified.
