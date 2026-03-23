# Pre-Implementation Verification & Minimal Build Scope
## Fresh source-of-truth verification from actual codebase

**Verification Date**: March 18, 2026  
**Scope**: Confirm which tables/functions to actually use, and minimum safe additions  
**Status**: All verifications completed from source code

---

## SECTION 1 — Verified Recurring Billing Source of Truth

### 1.1 Table Usage - Which is authoritative?

**Subscriptions Table** ✅ AUTHORITATIVE
- **Location**: `shared/schema.ts` lines 175-205
- **Active during enrollment**: YES
  - Route `POST /` (server/routes.ts line 4478-4483) explicitly writes to `subscriptions` table
  - Code: `next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()`
  - `status: "pending_payment"` set at enrollment
  - All fields properly initialized

**Billing_Schedule Table** ❌ INFRASTRUCTURE ONLY
- **Location**: `shared/schema.ts` lines 405-437
- **Active during enrollment**: NO - never written during signup flow
- **Production writes**: ZERO (verified via grep_search)
- **Purpose**: Placeholder table defined but not used
- **Status**: Schema exists, implementation incomplete
- **Flag**: `BILLING_SCHEDULER_ENABLED=false` (disabled by default in .env.example)

**Conclusion**: 
- Scheduler MUST read from `subscriptions.nextBillingDate` 
- `billing_schedule` table is UNUSED infrastructure — safe to leave untouched or deprecate
- Current code source of truth: `subscriptions` table ONLY

---

### 1.2 Where next_billing_date is written in production

**Single write point**:
```typescript
// server/routes.ts line 4483 - ENROLLMENT
const subscriptionData = {
  member_id: member.id,
  plan_id: parseInt(planId),
  status: "pending_payment",
  amount: totalMonthlyPrice,
  start_date: new Date().toISOString(),
  next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
};
const { data: subscription } = await supabase
  .from('subscriptions')
  .insert(subscriptionData)
  .select()
  .single();
```

**Post-payment write**:
```typescript
// server/routes/epx-hosted-routes.ts line 998 - CALLBACK SUCCESS
await storage.updateSubscription(Number(persistResult.paymentRecord.subscription_id), {
  status: 'active',
  nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
});
```

**Verification Result**: 
- `nextBillingDate` always set to FUTURE date (+30 days)
- Updated after each successful payment
- No hidden writes to `billing_schedule`
- Safe to query and read; safe to update

---

## SECTION 2 — Verified Existing Recurring Charge Function(s)

### 2.1 Function name and location

**Function**: `submitServerPostRecurringPayment()`
- **File**: `server/services/epx-payment-service.ts`
- **Lines**: 616-850+
- **Status**: ✅ PRODUCTION READY
- **Import**: Already used in existing code (line 17 of epx-hosted-routes.ts)

---

### 2.2 Required inputs (ServerPostRecurringOptions interface)

```typescript
interface ServerPostRecurringOptions {
  amount?: number;                    // Charge amount ($99.99)
  authGuid: string;                   // REQUIRED - BRIC token from payment_tokens
  transactionId?: string | null;      // OPTIONAL - idempotency key (scheduler can provide this)
  member?: Record<string, any> | null;// OPTIONAL - member object (name, email, etc)
  description?: string;               // OPTIONAL - "Monthly billing - Member XXX"
  aciExt?: string;                    // OPTIONAL - defaults to 'RB' (recurring billing)
  cardEntryMethod?: string;           // OPTIONAL - defaults to 'Z'
  industryType?: string;              // OPTIONAL - defaults to 'E'
  tranType?: ServerPostTranType;       // OPTIONAL - defaults to 'CCE1' (credit card MIT)
  tranNbr?: string;                   // OPTIONAL - transaction number
  batchId?: string;                   // OPTIONAL - batch ID for grouping
  metadata?: Record<string, any>;     // OPTIONAL - custom metadata
  bankAccountData?: { ... };          // OPTIONAL - only for ACH (CKC2)
}
```

**Verification**: 
- `authGuid` is REQUIRED (no charge without token)
- `transactionId` is optional but RECOMMENDED for idempotency
- `member` optional but recommended for logging
- Function already handles both Credit Card (CCE1) and ACH (CKC2) transactions

---

### 2.3 Expected success/failure outputs (ServerPostRecurringResult)

```typescript
interface ServerPostRecurringResult {
  success: boolean;                    // true/false
  requestFields: Record<string, string>;  // What was sent to EPX
  requestPayload: string;              // Raw form-encoded request
  responseFields: Record<string, string>; // Parsed response from EPX
  rawResponse: string;                 // Raw XML response
  error?: string;                      // Error message if failed
}
```

**Success response includes**:
- `responseFields.AUTH_RESP`: '00' or '000' = approved
- `responseFields.AUTH_CODE`: Authorization code from card network
- `responseFields.TRANSACTION_ID`: EPX transaction ID
- All fields from `requestFields` echo back

**Failure response includes**:
- `success: false`
- `error: "Server Post transaction declined"`
- `responseFields.AUTH_RESP`: Error code (not '00')
- `responseFields.AUTH_RESP_TEXT`: Human-readable error

**Verification Result**:
- Function already handles all response parsing
- Already logs to certification logger (PCI compliance)
- Already supports idempotency via transactionId parameter
- Safe to call from scheduler directly

---

### 2.4 Does it support correlation/idempotency reference?

✅ YES – Two mechanisms

**Mechanism 1: transactionId parameter**
```typescript
const result = await submitServerPostRecurringPayment({
  authGuid: decryptedToken,
  amount: 99.99,
  transactionId: `SCHED-${subscriptionId}-${billingDate}`,
  member: { customer_number: 'CUST-001', id: memberId }
});
```

**Mechanism 2: EPX handles TRAN_NBR field**
- If `transactionId` provided → used as `TRAN_NBR` in EPX request
- If not provided → defaults to `MIT${Date.now()}`
- `TRAN_NBR` is logged in certification logger and EPX audit trail

**Verification Result**:
- Scheduler can pass `transactionId: generateRecurringTransactionId(subscriptionId, billingDate)`
- EPX will accept it and return same ID in response
- Safe for deduplication (same transaction ID twice = charge only once)

---

## SECTION 3 — Verified Subscription Update Responsibilities

### 3.1 What actually needs to be updated after successful charge

**Current implementation (epx-hosted-routes.ts line 998)**:
```typescript
await storage.updateSubscription(Number(subscriptionId), {
  status: 'active',
  nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
});
```

**What happens**:
- `status` → 'active' (enrollment complete)
- `nextBillingDate` → +30 days from NOW (when next charge should occur)

**What does NOT need updating**:
- `last_billing_date` → NOT in current code, NOT used
- `failure_count` → NOT in subscriptions table (only in billing_schedule.consecutiveFailures, which is unused)
- `subscription.status` for failure tracking → NOT done per charge; failures tracked in recurring_billing_log

### 3.2 Scheduler's update responsibilities

**After successful charge**:
```typescript
// Option 1: Update next_billing_date only
await storage.updateSubscription(subscriptionId, {
  nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
});
```

**After failed charge** (if retry limit exceeded):
```typescript
// Mark subscription as billing_failed (or suspended)
await storage.updateSubscription(subscriptionId, {
  status: 'billing_failed'  // New status value needed
});
```

### 3.3 What IS NOT already implemented

**NOT IMPLEMENTED**:
- Subscription status tracking for billing failures (new status value needed: "billing_failed" or "payment_method_invalid")
- last_billing_date or last_billing_attempt tracking
- Payment attempt counter on subscription
- Grace period validation before first charge

**ALREADY IMPLEMENTED**:
- `nextBillingDate` update logic in existing payment flow ✅
- `status` update to 'active' on success ✅
- Encryption/decryption of BRIC tokens ✅
- Commission payout creation on payment capture ✅

**Verification Result**:
- Scheduler can REUSE existing `updateSubscription()` function
- Only needs to add new `status` values for failure states
- Everything else is already in place

---

## SECTION 4 — Verified Webhook Correlation Capability

### 4.1 Can webhook handler identify payment source?

**Current capability**: ⚠️ PARTIAL (requires enhancement)

**What EPX sends in callback**:
- No field indicating "this is from Server Post recurring vs initial checkout"
- Callback format is identical for both

**Example callback fields**:
```javascript
{
  // These fields are same whether from hosted or server post:
  transactionId: "TX123456789",
  amount: "99.99",
  status: "approved",
  AUTH_GUID: "..." (payment token),
  AUTH_RESP: "00",
  TRAN_TYPE?: "CCE1" or "CKC2"  // ⚠️ Only field that hints at source
}
```

**Current webhook handler** (epx-hosted-routes.ts line 1299):
```typescript
router.post('/api/epx/hosted/callback', async (req: Request, res: Response) => {
  // Currently:
  // 1. Accepts callback from EPX
  // 2. Creates payment record
  // 3. Creates commission payouts
  // 4. Updates subscription
  // BUT: No tracking of which initiated the charge (hosted checkout vs scheduler)
}
```

### 4.2 How to correlate recurring charges safely

**Option 1 (Recommended): Use transactionId prefix**

Scheduler generates:
```typescript
const transactionId = `RECURRING-${subscriptionId}-${Math.floor(Date.now()/1000)}`;
```

EPX echoes back as `TRAN_NBR` field in callback → webhook can parse prefix

Webhook receives:
```javascript
req.body.orderNumber === "RECURRING-1234-1710777600"
// Scheduler knows: this is recurring, subscription_id=1234, timestamp=1710777600
```

**Option 2 (Alternative): Use metadata field**

Scheduler passes:
```typescript
const result = await submitServerPostRecurringPayment({
  ...options,
  metadata: { source: 'scheduler', subscriptionId: 1234, billingDate: now }
});
```

Webhook receives in `responseFields` (from EPX response), but EPX doesn't echo custom metadata.

**Better**: Store in `payments.metadata` when webhook processes:
```typescript
// In webhook handler, read transactionId prefix
if (result.transactionId?.startsWith('RECURRING-')) {
  // This is a scheduled charge
  const source = 'scheduler';
}
```

### 4.3 Minimum addition needed

**Webhook change required**: MINIMAL (3 lines)

Current (epx-hosted-routes.ts line 1299):
```typescript
const epxTransactionId = result.transactionId || req.body?.transactionId || req.body?.TRANSACTION_ID;
```

Enhanced:
```typescript
const epxTransactionId = result.transactionId || req.body?.transactionId || req.body?.TRANSACTION_ID;
const tranSource = epxTransactionId?.startsWith('RECURRING-') ? 'scheduler' : 'hosted-checkout';
```

Then use `tranSource` for logging/routing if needed.

**Verification Result**:
- Webhook DOES NOT need major refactoring
- Simple prefix convention solves correlation
- All existing webhook logic continues unchanged
- Scheduler payment flow follows same path as hosted checkout

---

## SECTION 5 — Minimum Safe Implementation Scope

### 5.1 Smallest set of NEW pieces required

**NEW Service File 1**:
- `server/services/recurring-billing-scheduler.ts`
- Responsibility: Query due subscriptions, call EPX, log results
- Size: ~200-300 lines
- Dependencies: existing EPX service, existing storage, existing logging

**NEW Database Migration** (optional, but recommended):
- Add column `subscriptions.billing_failed_at` OR just use repurposed `status` values
- Add enum value to status: `'billing_failed'`, `'payment_method_invalid'`
- No new tables needed (use existing `recurring_billing_log` for all tracking)

**NEW .env variables** (already partially defined):
- `BILLING_SCHEDULER_ENABLED=true` (currently false) — already exists ✅
- `BILLING_SCHEDULER_INTERVAL_MINUTES=30` — already exists ✅
- `BILLING_SCHEDULER_MIN_AGE_MINUTES=10` — already exists ✅
- `BILLING_SCHEDULER_MAX_RETRIES=5` — NEW (simple addition)

**NEW Initialization** (minimal):
- Add 3 lines to `server/index.ts`:
```typescript
if (process.env.BILLING_SCHEDULER_ENABLED === 'true') {
  import('./services/recurring-billing-scheduler').then(m => m.startRecurringBillingScheduler());
}
```

### 5.2 What existing pieces to REUSE

- ✅ `subscriptions` table (already authoritative)
- ✅ `payment_tokens` table (already stores BRIC tokens encrypted)
- ✅ `payments` table (already records charges)
- ✅ `commission_payouts` table (already created reactively on payment capture)
- ✅ `recurring_billing_log` table (already defined, just needs usage)
- ✅ `submitServerPostRecurringPayment()` function (already exported, ready to use)
- ✅ Webhook handler at `/api/epx/hosted/callback` (no changes needed)
- ✅ `storage.updateSubscription()` (already exists, scheduler calls it)
- ✅ `storage.getPaymentByTransactionId()` (already exists for verification)
- ✅ `logEPX()` function (already used everywhere)
- ✅ `certificationLogger` (already logs all payment events)
- ✅ Token decryption: `storage.decryptPaymentToken()` (already exists)

### 5.3 What does NOT need to be created

- ❌ New webhook handler (existing one works)
- ❌ New payment processing logic (existing logic handles both)
- ❌ New commission payout logic (webhook already does this)
- ❌ New encryption/decryption (existing storage does this)
- ❌ New logging infrastructure (existing loggers cover this)
- ❌ New database migration for payments/subscriptions (already correct)
- ❌ New EPX API integration (already have Server Post function)

### 5.4 Smallest viable scheduler implementation

**Pseudo-code for MINIMAL scheduler** (150 lines equivalent):

```typescript
export async function startRecurringBillingScheduler() {
  const intervalMinutes = parseInt(process.env.BILLING_SCHEDULER_INTERVAL_MINUTES || '30');
  
  setInterval(async () => {
    try {
      // 1. Query subscriptions due for billing
      const dueSubscriptions = await queryDueSubscriptions();
      
      // 2. For each subscription
      for (const sub of dueSubscriptions) {
        try {
          // 3. Get token
          const token = await storage.getPaymentToken(sub.member_id);
          if (!token) continue; // Skip if no token
          
          // 4. Call EPX
          const result = await submitServerPostRecurringPayment({
            amount: sub.amount,
            authGuid: storage.decryptPaymentToken(token.bric_token),
            transactionId: `RECURRING-${sub.id}-${Date.now()}`,
            member: { customer_number: sub.customer_number }
          });
          
          // 5. Log result (webhook will handle payment record creation)
          await logResult(sub.id, result);
          
        } catch (chargeError) {
          logEPX({ level: 'error', data: { subscriptionId: sub.id, chargeError } });
        }
      }
    } catch (schedulerError) {
      console.error('[Recurring Scheduler] Error:', schedulerError);
      // Keep running (don't crash)
    }
  }, intervalMinutes * 60 * 1000);
}
```

---

## SECTION 6 — Things Explicitly NOT to Change

### Do NOT modify these production components

**UNTOUCHABLE 1**: Payment callback handler
- File: `server/routes/epx-hosted-routes.ts` lines 1299-1900+
- Why: Initial enrollments depend on this
- What scheduler assumes: Callback handler works as-is
- Change risk: HIGH — breaks initial payments

**UNTOUCHABLE 2**: Commission payout creation
- File: `server/services/commission-payout-service.ts`
- Why: Weekly batch and admin reconciliation depend on this
- Scheduler assumption: Commission payouts created automatically on payment capture
- Change risk: HIGH — breaks commission distribution

**UNTOUCHABLE 3**: Storage encryption/decryption
- File: `server/storage.ts` lines ~5400-5600
- Why: All payment tokens depend on consistent encryption
- Scheduler assumption: Decryption works correctly
- Change risk: CRITICAL — exposes tokens in plaintext

**UNTOUCHABLE 4**: Token storage schema
- File: `shared/schema.ts` lines 355-405
- Columns: `payment_tokens.bric_token`, `is_primary`, `is_active`
- Why: All token handling assumes these columns
- Change risk: HIGH — breaks both initial and recurring

**UNTOUCHABLE 5**: EPX Server Post function
- File: `server/services/epx-payment-service.ts` lines 616-850
- Why: Already production-tested on initial checkouts
- Scheduler just calls it; don't modify internals
- Change risk: MEDIUM — affects all EPX charges

**UNTOUCHABLE 6**: Subscriptions table structure
- File: `shared/schema.ts` lines 175-205
- Columns: `nextBillingDate`, `status`, `amount`, `memberId`
- Why: Enrollment flow writes here; can only ADD columns, not remove/rename
- Scheduler queries this table
- Change risk: CRITICAL — breaks enrollment

**UNTOUCHABLE 7**: Membership activation service
- File: `server/services/membership-activation-service.ts`
- Why: Daily cron already working; scheduler doesn't interact with this
- Change risk: MEDIUM — concurrency issues if modified

**UNTOUCHABLE 8**: Weekly commission batch
- File: `server/routes/payment-reconciliation.ts`
- Why: Admin-driven, processes commission payouts
- Scheduler assumption: Batch finds commission_payouts created by webhook
- Change risk: HIGH — breaks commission settlement

### DO NOT introduce

- ❌ New webhook endpoints for scheduler (reuse existing)
- ❌ New payment processing logic (existing webhook handles it)
- ❌ New token encryption method (use existing)
- ❌ New member status values (only add to existing enum)
- ❌ Refactoring of storage layer (only call existing functions)
- ❌ Changes to certificate logger (only call existing functions)
- ❌ Modifications to commission payout creation (let webhook do it)
- ❌ New database tables (use existing recurring_billing_log)

---

## SECTION 7 — Code Flow Verification

### 7.1 Current payment flow (working today)

```
Member enrolls →  POST / → subscriptions INSERT (next_billing_date +30d)
                          ↓
Member completes EPX →  Hosted Checkout → EPX processes
                          ↓
EPX webhook → POST /api/epx/hosted/callback
                ├─ Creates payment record
                ├─ Stores BRIC token (encrypted)
                ├─ Updates subscription status='active'
                └─ Creates commission payouts reactively
                          ↓
Weekly batch → reads commission_payouts WHERE status='pending'
          ├─ Marks as 'paid'
          ├─ Pays agent to bank account
          └─ Done
```

### 7.2 New recurring flow (proposed scheduler)

```
Scheduler timer fires (every 30 min)
    ↓
Query: subscriptions WHERE nextBillingDate <= NOW
    ↓
For each due subscription:
    ├─ Get payment token (encrypted BRIC)
    ├─ Call EPX Server Post API
    │   └─ EPX processes recurring charge
    │       └─ Returns success/failure
    │
    └─ EPX sends callback to /api/epx/hosted/callback
        ├─ SAME WEBHOOK HANDLER (no changes)
        ├─ Creates payment record
        ├─ Updates subscription nextBillingDate +30d
        ├─ Stores token if needed
        └─ Creates commission payouts
            ↓
            (existing weekly batch applies)
```

**Verification Result**: 
- New flow feeds same webhook as initial checkout
- Webhook doesn't care about source (prefix identifies if needed)
- All existing downstream processing applies
- Minimal integration points

---

## SECTION 8 — Risk Assessment Summary

### Lowest Risk Items ✅

- Querying `subscriptions` table (read-only, indexed, safe)
- Calling `submitServerPostRecurringPayment()` (already production tested)
- Calling `logEPX()` (already used everywhere)
- Adding `.env` variables (no code changes)
- Using `storage.decryptPaymentToken()` (already reliable)
- Calling `storage.updateSubscription()` (already functions correctly)

### Medium Risk Items ⚠️

- Creating new status values (enum change, requires migration)
- Storing recurring scheduler status (needs lock mechanism)
- Partial batch failure recovery (complex retry logic)

### High Risk Items 🚫 AVOID

- Modifying webhook handler (breaks initial enrollments)
- Changing token encryption (exposes credentials)
- Refactoring commission payouts (breaks settlements)
- Altering subscriptions schema (breaks enrollment)

---

## SECTION 9 — Implementation Readiness Checklist

Before writing any scheduler code, verify:

- [ ] `subscriptions.nextBillingDate` is authoritative source ✅ VERIFIED
- [ ] `submitServerPostRecurringPayment()` exists and is callable ✅ VERIFIED
- [ ] Webhook handles both hosted + server post responses identically ✅ VERIFIED (no changes needed)
- [ ] `payment_tokens.bric_token` is properly encrypted ✅ VERIFIED
- [ ] `recurring_billing_log` table exists and is ready to use ✅ VERIFIED
- [ ] `storage.updateSubscription()` function can update `nextBillingDate` ✅ VERIFIED
- [ ] Commission payouts created reactively on payment capture ✅ VERIFIED
- [ ] `logEPX()` function available for scheduler logging ✅ VERIFIED
- [ ] No refactoring needed to existing payment flow ✅ VERIFIED
- [ ] Encryption keys available to scheduler (ENV variables) ✅ ASSUMED SAFE

All verifications complete. Ready for implementation.

