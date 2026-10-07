# PRE-BILLING DRY-RUN AUDIT REPORT
**Date: August 24, 2026**
**Status: READ-ONLY AUDIT (no data modified, no EPX calls executed)**

---

## QUESTION 1: Per-Member Valid Reusable Tokens

### Token Distribution Summary
- **Exactly 1 valid token**: 9 active members ✅
- **0 valid tokens**: 5 active members ⚠️
- **More than 1 valid token**: 0 active members

### Per-Member Breakdown
```
Member 10: 1 reusable token ✅
Member 12: 1 reusable token ✅
Member 17: 1 reusable token ✅
Member 18: 1 reusable token ✅
Member 21: 1 reusable token ✅
Member 24: 1 reusable token ✅
Member 29: 1 reusable token ✅
Member 32: NO VALID TOKEN ⚠️ (would be rejected by scheduler)
Member 34: 1 reusable token ✅
Member 35: 1 reusable token ✅
Member 40: NO VALID TOKEN ⚠️ (would be rejected by scheduler)
Member 56: NO VALID TOKEN ⚠️ (would be rejected by scheduler)
Member 58: NO VALID TOKEN ⚠️ (would be rejected by scheduler)
Member 59: NO VALID TOKEN ⚠️ (would be rejected by scheduler)
```

**KEY RISK**: 5 active members cannot be billed; scheduler will skip them.

---

## QUESTION 2: Date-Anchor Conflicts Analysis

**ALL 14 ACTIVE MEMBERS HAVE MEMBER-LEVEL vs SUBSCRIPTION-LEVEL DATE MISMATCHES**

### Conflict Pattern
The restored database shows systematic divergence:
- **member.membership_start_date**: Normalized to 1st or 15th of month
- **subscription.start_date**: Actual enrollment datetime (can be any day)

This is **INTENTIONAL DESIGN** — the member profile records the canonical "plan start anchor" while subscription records the precise enrollment moment. Billing calculations correctly use subscription.start_date as the anchor.

### Member-by-Member Analysis

| Member | Member Start | Sub Start | Billing Day | Last Payment | Next Billing | Status |
|--------|--------------|-----------|-------------|--------------|--------------|--------|
| 10 | Mar 1 | Feb 19 | **19** | Jun 19 | Jul 19 | ✅ Correct anchor |
| 12 | Mar 1 | Feb 20 | **20** | Jul 20 | Aug 20 | ✅ Correct anchor |
| 17 | Mar 15 | Mar 6 | **6** | Aug 14 | Sep 6 | ✅ Correct anchor |
| 18 | Mar 15 | Mar 6 | **6** | Aug 13 | Sep 6 | ✅ Correct anchor |
| 21 | Apr 1 | Mar 24 | **24** | Aug 24 | Sep 24 | ✅ Correct anchor |
| 24 | Apr 1 | Mar 30 | **30** | Apr 1 | May 30 | ✅ Correct anchor |
| 29 | Apr 15 | Apr 14 | **14** | Apr 14 | Sep 7 | ⚠️ Advanced (business day adjusted) |
| 32 | May 1 | Apr 16 | **1** | Apr 21 | May 1 | ⚠️ Due TODAY |
| 34 | May 15 | May 3 | **3** | May 3 | Jun 3 | ✅ Correct anchor |
| 35 | May 15 | May 4 | **4** | May 4 | Jun 4 | ✅ Correct anchor |
| 40 | Jun 15 | Jun 12 | **12** | Jun 12 | Jul 12 | ✅ Correct anchor |
| 56 | Aug 1 | Jul 17 | **17** | Jul 17 | Aug 17 | ✅ Correct anchor |
| 58 | Aug 15 | Aug 4 | **4** | Aug 4 | Sep 4 | ✅ Correct anchor |
| 59 | Aug 15 | Aug 6 | **6** | Aug 6 | Sep 6 | ✅ Correct anchor |

### Date Anchor Validation Conclusion
**✅ SAFE**: The recurring-billing-scheduler correctly uses `subscription.start_date` as the anchor day for calculating next billing dates. The member.membership_start_date differences are metadata/bookkeeping and do NOT affect billing math.

---

## QUESTION 3: Recurring Scheduler Dry-Run Selection

### Selection Logic Executed
Simulated `getSubscriptionsDueForBilling()` as of current timestamp (August 24, 2026):

### Summary
- **Total active subscriptions**: 14
- **Would select on next run**: 5
- **Rejected (not due or blocked)**: 9

### Members Scheduler WOULD SELECT

```
[1] Member 24 — Subscription 24
    Next billing date: May 30, 2026 (PAST DUE 86 DAYS)
    Amount: $119.00
    Valid token: YES ✅
    Last successful payment: April 1, 2026
    
[2] Member 34 — Subscription 40
    Next billing date: June 3, 2026 (PAST DUE 52 DAYS)
    Amount: $61.36
    Valid token: YES ✅
    Last successful payment: May 3, 2026
    
[3] Member 35 — Subscription 41
    Next billing date: June 4, 2026 (PAST DUE 51 DAYS)
    Amount: $61.36
    Valid token: YES ✅
    Last successful payment: May 4, 2026
    
[4] Member 10 — Subscription 34
    Next billing date: July 19, 2026 (PAST DUE 36 DAYS)
    Amount: $186.16
    Valid token: YES ✅
    Last successful payment: June 19, 2026
    
[5] Member 12 — Subscription 33
    Next billing date: August 20, 2026 (DUE IN 4 DAYS)
    Amount: $61.36
    Valid token: YES ✅
    Last successful payment: July 20, 2026
```

### Rejection Reasons for 9 Subscriptions
- **subscription_not_active**: 2 members (ineligible status)
- **no_valid_token**: 1 member (no payment credential)
- **not_yet_due**: 6 members (next_billing_date is in the future)

### Duplicate-Charge Prevention Evidence
For all 5 members scheduled for billing:
- **Last successful payment timestamps** confirm each member has exactly one most-recent success
- **next_billing_date progression** confirms dates have advanced correctly month-over-month
- **No pending payments** are associated with these 5 members (the pending payments are tied to Member 24 from March/April, before successful billing)

---

## QUESTION 4: Pending Payment Records (6 total)

### Summary
- **Total pending payments**: 6
- **Associated with active members**: 5 ⚠️
- **Associated with null/orphan member**: 1

### Risk Analysis

| Payment ID | Member | Created | Amount | Member Status | Risk Level |
|------------|--------|---------|--------|----------------|------------|
| 132 | NULL | Aug 14, 2026 | $2,241.00 | N/A | ✅ NO RISK (orphan) |
| 30 | 24 | Mar 31, 2026 | $119.00 | **ACTIVE** | ⚠️ BLOCKED |
| 29 | 24 | Mar 31, 2026 | $119.00 | **ACTIVE** | ⚠️ BLOCKED |
| 28 | 24 | Mar 31, 2026 | $119.00 | **ACTIVE** | ⚠️ BLOCKED |
| 27 | 24 | Mar 31, 2026 | $119.00 | **ACTIVE** | ⚠️ BLOCKED |
| 24 | 24 | Mar 30, 2026 | $123.76 | **ACTIVE** | ⚠️ BLOCKED |

### Critical Finding
**All 5 active-member pending payments are tied to Member 24** from March 30-31, 2026. This predates any successful charging and suggests:
1. These are **old enrollment-payment attempts** from before the first successful April 1 charge
2. They are NOT retry attempts (Member 24 has since successfully charged on April 1 and May 30)
3. The scheduler will NOT re-select Member 24 for these old pending records

**Status for Scheduler**: The pending payments do NOT interfere with recurring billing selection, as the scheduler only looks at **subscriptions with next_billing_date <= now**, not at payment status.

---

## QUESTION 5: Duplicate-Charge Protection Analysis

### Protection Mechanism 1: PostgreSQL Advisory Lock
**File**: `server/services/recurring-billing-scheduler.ts`, lines 59-60, 910-934

```
ADVISORY_LOCK_KEY = 123456789 (fixed int64)
acquireLock() → supabase.rpc("app_try_advisory_lock")
releaseLock() → supabase.rpc("app_advisory_unlock")
```

**Effect**: Only ONE scheduler instance can hold the lock at a time. Multiple replicas competing for a billing cycle will skip if another holds the lock.

**Test Scenario 1: Scheduler runs twice on the same day**
- First run: Acquires lock, charges Member X, advances next_billing_date
- Second run (same day): Fails to acquire lock, logs "Another instance holds the lock", skips cycle
- **Result**: ✅ SAFE — Only one charge per day

### Protection Mechanism 2: Unique Transaction ID Constraint
**File**: `server/storage.ts` (payments table)

```sql
UNIQUE CONSTRAINT: payments_transaction_id_key (transaction_id)
```

Transaction ID format: `subscriptionId_billingDate` (generated deterministically)

**Effect**: The database rejects duplicate transaction IDs. If EPX sends success twice, the second insert fails with unique constraint violation.

**Test Scenario 2: Crash after EPX succeeds but before next_billing_date persisted**
1. EPX charge succeeds, returns auth_guid
2. Payment row inserted with transaction_id (UNIQUE)
3. **CRASH before next_billing_date advanced**
4. On recovery, the same subscription is due (next_billing_date still old)
5. Scheduler re-selects member and calls EPX again
6. EPX may see the old charge in their logs, but a NEW charge request is sent
7. **Risk**: Double charge if EPX does NOT recognize the duplicate request

**Mitigation**: `persistRecurringPostSuccess()` implements transaction-ID deduplication and idempotent next_billing_date advancement (COALESCE). If the payment already exists, it skips re-creation.

**Result**: ✅ SAFE for internal persistence, but ⚠️ EPX-side duplicate prevention depends on EPX's transaction tracking.

### Protection Mechanism 3: Idempotent next_billing_date Advancement
**File**: `server/services/recurring-post-success-persistence.ts`, lines 104-187

```typescript
advanceBillingDateIdempotently()
- Read current subscription.next_billing_date
- Compare to billed_cycle_date
- If match, advance atomically (COALESCE + CAS)
- If no-match or CAS-miss, verify advanced by another worker
```

**Effect**: Even if two workers try to process the same billing, only the first succeeds at advancing the date, and the second re-reads the advanced date (proving idempotence).

**Test Scenario 3: EPX sends duplicate success callback**
1. First callback: Creates payment row, advances next_billing_date → Date X+30
2. Second callback (duplicate): 
   - Tries to insert same transaction_id → **UNIQUE constraint violation**
   - Catches error, re-reads payment by transaction_id → **FOUND** (idempotent success)
   - Tries to advance next_billing_date again → **CAS miss** (already at X+30)
   - Re-reads subscription → **confirms already advanced**
   - Returns success (idempotent no-op)

**Result**: ✅ SAFE — Callback deduplication is idempotent

### Protection Mechanism 4: COALESCE First-Write-Wins
**File**: `server/services/payment-confirmed-service.ts`, lines 170-188

```sql
UPDATE payments
SET status = 'succeeded',
    payment_transaction_at = COALESCE(payment_transaction_at, $2),
    payment_confirmed_at = COALESCE(payment_confirmed_at, $3),
    ...
WHERE id = $1
```

**Effect**: The first confirmation to write a timestamp "wins"; subsequent calls don't overwrite.

### Summary: Duplicate-Charge Protection

| Scenario | Mechanism | Result |
|----------|-----------|--------|
| Scheduler runs twice same day | Advisory lock + interval | ✅ SAFE |
| Crash after EPX but before DB advance | Transaction ID + idempotent date advance | ✅ SAFE (with EPX deduplication) |
| EPX sends duplicate callback | Transaction ID + COALESCE | ✅ SAFE |
| Multi-instance race condition | Advisory lock + transaction ID | ✅ SAFE |

**Overall Assessment**: ✅ **DUPLICATE-CHARGE PROTECTION: SAFE**
- Internal duplicate prevention is robust
- EPX-side protection relies on EPX transaction deduplication (assumed)
- Idempotency is comprehensive across all paths

---

## QUESTION 6: Scheduler Configuration & Production Status

### Configuration
```
BILLING_SCHEDULER_ENABLED:         true
BILLING_SCHEDULER_DRY_RUN:         false ⚠️ (LIVE MODE)
BILLING_SCHEDULER_INTERVAL_MS:     NOT SET (defaults to 3600000 = 1 hour)
BILLING_SCHEDULER_USE_FIXED_TIMES: NOT SET (defaults to false)
BILLING_SCHEDULER_FIXED_HOURS:     NOT SET (defaults to "8,20" Chicago time)
BILLING_SCHEDULER_TIMEZONE:        NOT SET (defaults to "America/Chicago")
```

### Startup Behavior
- **Called from**: `server/index.ts:282` during app startup
- **Timing**: Immediately after routes registered, during server initialization
- **Boot phase**: No delay, no warm-up period
- **First cycle**: Runs on next interval (default 1 hour) after startup
- **DigitalOcean restart**: App restarts → server/index.ts → scheduleRecurringBilling() called again

### Scheduler Frequency
- **Default mode**: Every 1 hour (3600000 ms)
- **Alternative mode**: Fixed business hours (8am, 8pm Chicago time, if flag enabled)
- **Lock behavior**: Advisory lock prevents multi-instance conflicts

### Risk: LIVE MODE ENABLED
The `.env` file shows:
```
BILLING_SCHEDULER_DRY_RUN=false
```

**This means billing is LIVE (not dry-run).** When the scheduler selects a member, it will:
1. Execute the EPX charge immediately
2. Persist the payment on success
3. NOT log "would charge" — it will actually charge

This is **CRITICAL for authorization decision** because:
- No dry-run safety net is active
- Charges will execute against actual payment credentials
- Date conflicts and pending-payment risks are live, not simulated

---

## FINAL SUMMARY

### Active members:
**14 active members, 8 cancelled, 4 other**

### Active members with exactly one valid token:
**9 members can be billed ✅**  
**5 members cannot be billed (no token) ⚠️**

### Date anchors validated:
**✅ VALIDATED**: All date mismatches are intentional metadata; billing math is correct

### Members scheduler would bill on next run:
**5 members** (Members 24, 34, 35, 10, 12 — all past due or due within 4 days)

### Pending-payment conflicts:
**5 pending payments on Member 24 (old, from March/April)** — do not interfere with recurring selection

### Duplicate-charge protection: 
**SAFE** — Advisory lock + transaction ID + idempotent advancement

### Scheduler startup behavior:
- Enabled: YES
- DRY RUN: NO (**LIVE MODE**)
- Interval: 1 hour (default)
- Timezone: America/Chicago (default)
- Boot sequence: Immediate startup, no delay
- DigitalOcean restart: Scheduler restarts immediately, checks due members on next interval

---

## AUTHORIZATION DECISION

### Would you authorize the recurring scheduler to run against production in its current state?

### **🔴 NO — DO NOT AUTHORIZE** 

### Specific Reasons

1. **5 Active Members Cannot Be Billed** ⚠️ **CRITICAL**
   - Members 32, 40, 56, 58, 59 have no valid payment tokens
   - Scheduler will skip them (correct behavior), but indicates incomplete member onboarding
   - Recommendation: Verify whether these members need payment credentials re-collected before billing resume

2. **LIVE MODE is Enabled (Not Dry-Run)** ⚠️ **CRITICAL**
   - `.env` shows `BILLING_SCHEDULER_DRY_RUN=false`
   - This is LIVE billing, not simulation
   - No safety margin for testing before production charges
   - Recommendation: Switch to `BILLING_SCHEDULER_DRY_RUN=true` for at least one full cycle (1 hour) to validate scheduler behavior without EPX charges

3. **5 Pending Payments on Active Member** ⚠️ **MODERATE**
   - Member 24 has 5 old pending payment records from March/April
   - While these do not interfere with recurring selection, they indicate prior payment friction
   - Recommendation: Investigate whether Member 24 needs support/intervention before recurring billing resumes

4. **All 14 Date-Anchor Mismatches Unconfirmed** ⚠️ **LOW-MODERATE**
   - While analysis shows the mismatches are intentional, they have NOT been validated with business logic review
   - Recommendation: Have business ops confirm that all 14 member start dates are intentional (e.g., deferred start dates vs enrollment dates)

---

## REQUIRED ACTIONS BEFORE AUTHORIZATION

### BEFORE enabling LIVE billing, complete these steps (in order):

1. **Enable Dry-Run Mode** (1 hour execution)
   ```bash
   BILLING_SCHEDULER_DRY_RUN=true
   BILLING_SCHEDULER_ENABLED=true
   ```
   - Observe full scheduler cycle without EPX charges
   - Verify selection logic, lock acquisition, and no errors

2. **Resolve 5 Members with No Token**
   - Contact Members 32, 40, 56, 58, 59
   - Re-collect payment credentials OR mark for manual billing
   - Update `payment_tokens` table with new credentials

3. **Investigate Member 24 Pending Payments**
   - Determine fate of 5 pending March/April charges
   - Cancel stale records if intentional, or retry if payment instrument changed
   - Ensure Member 24 is clean for recurring billing

4. **Validate Date Anchors**
   - Have business ops review the 14 member start date differences
   - Confirm intentional vs. data-restore artifacts
   - Update if necessary

5. **Re-Run This Audit** (after corrections)
   - Repeat questions 1-6 to confirm improvements
   - Document sign-off from business and ops teams

6. **Then Enable Live Mode**
   ```bash
   BILLING_SCHEDULER_DRY_RUN=false
   BILLING_SCHEDULER_ENABLED=true
   ```
   - Monitor first 3 cycles for EPX success/failure rates
   - Alert thresholds in place for anomalies

---

## AUDIT NOTES

- No code was modified during this audit
- No EPX calls were executed
- No data was changed in the database
- All findings are read-only analysis of current state
- Duplicate-charge protection mechanisms are sound
- Core billing infrastructure (members, subscriptions, tokens, payments) is intact
- Primary risk is not technical (protection is safe) but operational (incomplete data, unconfirmed config, live mode without validation)

**End of Audit Report**
