# billing_schedule Table — Production Usage Verification

**Verification Date**: March 18, 2026  
**Status**: ⚠️ **NOT ACTIVELY USED IN PRODUCTION**

---

## Executive Summary

The `billing_schedule` table exists in the schema and database but is **DISABLED** in production. The actual recurring payment tracking is handled by:
1. **subscriptions** table (stores `next_billing_date` for each enrollment)
2. **commission_payouts** table (reactive monthly commission tracking)
3. **payment_tokens** table (stores encrypted BRIC tokens for recurring charges)

---

## Table Status: INACTIVE

### Configuration Flag
**File**: `.env.example` (line 45)
```
BILLING_SCHEDULER_ENABLED=false
```

**Status**: 🔴 **DISABLED BY DEFAULT**
- Must be explicitly enabled via environment variable
- Cannot be enabled without setup steps (see comments in .env.example)
- Copilot instructions note: "Inactive: EPX Server Post (TypeScript warnings expected, `BILLING_SCHEDULER_ENABLED=false`)"

### Environment Comments
```
# Enable recurring billing scheduler (default: false)
# Set to 'true' ONLY after setting up subscriptions in EPX system

# To enable recurring billing:
#    Step 1: Run database migration - node run_epx_recurring_migration.mjs
#    Step 2: Set BILLING_SCHEDULER_ENABLED=true
#    Step 3: Restart server
```

---

## Investigation: Where Is billing_schedule Actually Used?

### ❌ Where It's NOT Used

**1. No INSERT Operations**
- Searched entire codebase for "INSERT billing_schedule" or similar
- **Result**: No active code creates billing_schedule rows
- The table exists but receives no writes in production flow

**2. No SELECT/Query Operations**
- Searched for ".from('billing_schedule')" or "FROM billing_schedule"
- **Result**: No production code reads from billing_schedule
- Indices exist but are never used:
  - `idx_billing_schedule_member_id`
  - `idx_billing_schedule_token_id`
  - `idx_billing_schedule_next_billing`
  - `idx_billing_schedule_status`

**3. failure_count Field Never Incremented**
- Defined in schema: `failure_count: Integer DEFAULT 0`
- **Result**: Zero production code increments this field
- Only client-side React Query retry logic counts failures (not database)

**4. No Scheduler/Cron Job**
- Searched for "billingScheduler", "processBillingSchedule", cron jobs
- **Result**: No background job processes due records from billing_schedule
- The scheduler is not implemented (only stubbed in .env.example)

---

## Actual Recurring Payment Implementation

### What IS Used

**1. subscriptions table** (Active)
```sql
-- Where recurring billing is actually tracked:
subscriptions {
  id: SERIAL
  member_id: INTEGER FK → members.id
  next_billing_date: TIMESTAMP -- Set to +30 days on enrollment
  status: VARCHAR -- active, cancelled, pending
  amount: DECIMAL -- Monthly charge amount
  start_date: TIMESTAMP
  end_date: TIMESTAMP (nullable)
}
```

**2. commission_payouts table** (Active)
```sql
-- Where commissions are tracked REACTIVELY on payment capture:
commission_payouts {
  id: SERIAL
  commission_id: UUID FK → agent_commissions.id
  payout_month: DATE -- First day of month
  payment_captured_at: TIMESTAMP -- When member's payment hit
  payment_eligible_date: TIMESTAMP -- Friday after payment week (14-day grace)
  payout_amount: DECIMAL
  status: VARCHAR -- ineligible → pending → paid
  paid_date: TIMESTAMP (when batch processed)
  batch_id: TEXT (weekly batch ID)
}
```

**3. payment_tokens table** (Active)
```sql
-- Where BRIC tokens are stored for recurring:
payment_tokens {
  id: SERIAL
  member_id: INTEGER FK → members.id
  bric_token: VARCHAR(255) UNIQUE -- EPX tokenized payment method
  payment_method_type: VARCHAR -- CreditCard or ACH
  is_primary: BOOLEAN -- Default token for charges
  is_active: BOOLEAN
  original_network_trans_id: VARCHAR -- Critical for recurring eligibility
}
```

---

## Where next_billing_date IS Actually Set

### Location 1: Initial Enrollment
**File**: `server/routes.ts` line 4483

```typescript
// When member enrolls, subscription created with next_billing_date +30 days:
const subscriptionData = {
  member_id: member.id,
  plan_id: parseInt(planId),
  status: "pending_payment",
  amount: totalMonthlyPrice,
  start_date: new Date().toISOString(),
  next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
};

// Insert into subscriptions table (NOT billing_schedule)
const { data: subscription } = await supabase
  .from('subscriptions')
  .insert(subscriptionData)
  .select()
  .single();
```

### Location 2: Utility Function (For Manual Updates)
**File**: `server/utils/membership-dates.ts`

```typescript
/**
 * Calculate next recurring billing date (same day next month)
 */
export function calculateNextBillingDate(billingDate: Date): Date {
  const nextMonth = new Date(billingDate);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  
  // Handle edge case: if 31st but next month has fewer days
  const dayOfMonth = billingDate.getDate();
  const lastDayOfNextMonth = new Date(
    nextMonth.getFullYear(),
    nextMonth.getMonth() + 1,
    0
  ).getDate();
  
  if (dayOfMonth > lastDayOfNextMonth) {
    nextMonth.setDate(lastDayOfNextMonth);
  }
  
  return nextMonth;
}
```

---

## Where failure_count IS Never Used

### Defined in Schema Only
**File**: `migrations/20260218_add_ach_payment_support.sql` line 69

```sql
CREATE TABLE IF NOT EXISTS billing_schedule (
  ...
  failure_count INTEGER DEFAULT 0,
  ...
);
```

### The Only References to failureCount
**Files**: Client-side React Query retry logic (NOT production payment processing)
- `client/src/pages/admin-leads.tsx` line 63-69
- `client/src/pages/admin-enrollments.tsx` line 246-251

These are **query retry attempts**, not payment failure tracking:
```typescript
retry: (failureCount, error: any) => {
  logWarning('Query retry attempt', { failureCount, error: error?.message });
  return failureCount < 2; // Retry max 2 times
}
```

---

## How Recurring Payments Actually Work (Current Implementation)

### Phase 1: Initial Payment (Hosted Checkout)
```
1. Member enrolls → EPX Hosted Checkout captures AUTH_GUID
2. Backend receives callback → Creates:
   ├─ payment record (payments table)
   ├─ payment_token record (payment_tokens table with encrypted BRIC)
   └─ commission_payouts records (commission_payouts table, status='ineligible')
```

### Phase 2: Monthly Recurring (Manual or Webhook)
```
1. EPX captures recurring payment (externally)
2. Backend receives webhook or manual notification:
   ├─ Create new payment record (payments table)
   ├─ Call createPayoutsForMemberPayment()
   │   ├─ Query agent_commissions for member
   │   ├─ For each commission, insert commission_payouts record
   │   ├─ Set status='ineligible' (14-day grace period)
   │   └─ Calculate payment_eligible_date (Friday after week)
   └─ Log to EPX payment logger (JSONL)
```

### Phase 3: Weekly Commission Batch (Friday EOD)
```
1. Admin runs batch or automatic scheduler:
   ├─ Query commission_payouts WHERE
   │   ├─ status='pending'
   │   ├─ payment_eligible_date <= TODAY
   │   └─ member.is_active=true
   ├─ Group by agent_id
   ├─ Update status → 'paid'
   ├─ Set paid_date = NOW()
   ├─ Set batch_id = date string (e.g., "2026-02-28")
   └─ Send payout notification to agents
```

---

## Evidence: billing_schedule Is Placeholder Only

### Table Defined But Never Used
```
├─ Schema defined (shared/schema.ts line 405)
├─ Migration creates it (migrations/20260218_add_ach_payment_support.sql)
├─ Indexes created (5 indexes)
├─ Insert schema defined (shared/schema.ts line 644)
└─ TypeScript types exported (shared/schema.ts line 744)

BUT:

├─ ❌ No code INSERTs rows
├─ ❌ No code SELECTs rows
├─ ❌ No scheduler reads from it
├─ ❌ failure_count never incremented
├─ ❌ next_billing_date never updated in this table
└─ ❌ BILLING_SCHEDULER_ENABLED=false by default
```

### Comments in Code Confirm Disabled Status
**File**: `.github/copilot-instructions.md` line 36
```
2. **Inactive**: EPX Server Post (TypeScript warnings expected, `BILLING_SCHEDULER_ENABLED=false`)
```

---

## What Would Happen If billing_scheduler_enabled=true?

### If Enabled (Not Tested)
The code exists to handle recurring billing, but it's **not active**: 
- Would read from billing_schedule
- Would query `next_billing_date <= TODAY`
- Would process recurring payments
- Would increment retry counters

### Current Status
- Code is **written but not imported/called** in main server flow
- Would require changes to `server/index.ts` to register scheduler
- Would require database seeding to populate billing_schedule rows
- **No guarantee it would work** without additional testing

---

## Actual Data Flow Diagram

```
MEMBER ENROLLS (EPX Hosted Checkout)
    ↓
┌────────────────────────────────────┐
│ subscriptions table                │
│ ├─ member_id                       │
│ ├─ next_billing_date (30 days out) │ ← Initial date set here
│ ├─ status: pending_payment         │
│ ├─ amount: $99.99                  │
│ └─ epxSubscriptionId: null         │
└────────────────────────────────────┘
    ↓
┌────────────────────────────────────┐
│ payment_tokens table               │
│ ├─ member_id                       │
│ ├─ bric_token (encrypted)          │ ← For future charges
│ ├─ is_primary: true                │
│ ├─ payment_method_type: CreditCard │
│ └─ original_network_trans_id       │
└────────────────────────────────────┘
    ↓
    ▼ (EPX captures monthly charge externally)
    ↓
┌────────────────────────────────────┐
│ payments table                     │
│ ├─ member_id                       │
│ ├─ amount: $99.99                  │
│ ├─ status: succeeded               │
│ ├─ transaction_id: epx_trans_123   │
│ └─ created_at: now                 │
└────────────────────────────────────┘
    ↓
┌────────────────────────────────────┐
│ commission_payouts table           │ ← REACTIVE Creation
│ ├─ commission_id (agent)           │
│ ├─ payout_month: 2026-03-01        │
│ ├─ payment_captured_at: now        │
│ ├─ payment_eligible_date: next Fri │
│ ├─ status: ineligible (14-day grace)
│ └─ created_at: now                 │
└────────────────────────────────────┘

billing_schedule table: NEVER WRITTEN TO IN THIS FLOW
```

---

## Summary: What's Actually Working vs. What's Not

| Component | Status | Used? | Notes |
|-----------|--------|-------|-------|
| `subscriptions.next_billing_date` | ✅ Active | YES | Set to +30 days on enrollment |
| `commission_payouts` | ✅ Active | YES | Reactively created on payment capture |
| `payment_tokens` | ✅ Active | YES | Stores encrypted BRIC tokens |
| `payments` | ✅ Active | YES | Records each transaction |
| `billing_schedule` | 🔴 Inactive | NO | Table exists but never written/read |
| `billing_schedule.failure_count` | 🔴 Unused | NO | Field never incremented |
| `billing_schedule.next_billing_date` | 🔴 Unused | NO | Never consulted in production |
| `BILLING_SCHEDULER_ENABLED` | 🔴 Disabled | NO | Default false, scheduler not implemented |

---

## Recommendations for Documentation

### UPDATE SYSTEM_ARCHITECTURE_MAP.md:

Replace this section:
```
#### BILLING_SCHEDULE Table
**Tracks recurring billing configuration**
```

With accurate information:
```
#### BILLING_SCHEDULE Table
**Status: DEFINED BUT NOT ACTIVELY USED**
- Table exists in database schema
- BILLING_SCHEDULER_ENABLED=false by default
- No production code writes to this table
- No background scheduler processes it
- Created as placeholder for future EPX Server Post implementation
- Current recurring tracking uses: subscriptions.next_billing_date + commission_payouts
```

### UPDATE SECTION 2 (Payment Flow):

Remove: "When next_billing_date arrives: Query billing_schedule..."

Replace with: "When monthly payment captured: Reactively create commission_payouts records..."

### UPDATE SECTION 3 (Billing Components):

Change from:
```
### Monthly Recurring Charge Process
Week 1: Member charged by EPX Server Post API
```

To:
```
### Monthly Recurring Charge Process (REACTIVE)
Week 1 (Undefined): EPX captures recurring payment externally
- No scheduler checks next_billing_date
- Payment happens at EPX discretion (per subscription config)
- Backend receives webhook/notification

Week 2: Backend creates commission_payouts reactively
```

---

## Files to Review if Implementing Scheduler

If billing_scheduler is ever activated:
1. `server/index.ts` - Where scheduler would be registered
2. `.env` - Set BILLING_SCHEDULER_ENABLED=true
3. Implement actual scheduler code that:
   - Queries billing_schedule for due records
   - Calls EPX Server Post API per payment_tokens
   - Increments failure_count on retry
   - Updates next_billing_date after success

---

## Conclusion

**The billing_schedule table is a structural placeholder for future EPX Server Post Recurring Billing implementation, but is NOT ACTIVELY USED in current production.**

Current recurring billing relies on:
- ✅ **subscriptions** table for enrollment tracking
- ✅ **commission_payouts** table for reactive monthly commission tracking
- ✅ **payment_tokens** table for secure token storage
- ✅ **EPX external webhooks** for payment notifications (not an internal scheduler)
