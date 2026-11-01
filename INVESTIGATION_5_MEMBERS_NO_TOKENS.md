# Investigation: 5 Active Members with No Valid Billing Tokens
**Date:** August 24, 2026  
**Status:** READ-ONLY INVESTIGATION (no data modified)  
**Members Investigated:** 32, 40, 56, 58, 59

---

## DETAILED PER-MEMBER REPORTS

### Member 32 — Ayodele Adebayo

| Field | Value |
|-------|-------|
| **Database ID** | 32 |
| **Public ID** | MEMB-2604PMMT |
| **Customer #** | CUST-26045DWG |
| **Email** | ayoadebayo1@gmail.com |
| **Phone** | 206-503-7593 |
| | |
| **Status** | active / is_active: true |
| **Plan** | 17 |
| **Subscription Status** | **pending_payment** ⚠️ |
| **Membership Start Date** | May 1, 2026 |
| **Next Billing Date** | May 1, 2026 |
| | |
| **Enrolling Agent** | Steven Villarreal (MPP0006) |
| **Enrollment Date** | April 16, 2026 |
| **Member Created** | April 16, 2026 |
| | |
| **Most Recent Successful Payment** | April 21, 2026 |
| **Payment Amount** | $61.36 |
| **Time to First Payment** | 5 days |
| **EPX Auth GUID** | NO |
| **Transaction ID** | 6803254614 |
| | |
| **Payment Token History** | **❌ NONE** |
| **Token Records Total** | 0 |
| **Active Tokens** | 0 |
| **Inactive Tokens** | 0 |
| | |
| **Recurring Billing Capability** | ❌ **NOT BILLABLE** |
| **Reason** | Token lost; has payment history |

**Billing Log:** No recurring billing attempts recorded

**Analysis:**
- Successfully paid initial charge 5 days after enrollment
- Subscription remains stuck in "pending_payment" despite successful payment (indicates payment_confirmed_service may not have run)
- Zero payment token records suggests token was lost in database restore
- Cannot be billed without re-collecting payment credentials

---

### Member 40 — Issac Jasso Jr

| Field | Value |
|-------|-------|
| **Database ID** | 40 |
| **Public ID** | MEMB-2606SHZY |
| **Customer #** | CUST-2606PL8Y |
| **Email** | cjasso217@gmail.com |
| **Phone** | 956-687-8784 |
| | |
| **Status** | active / is_active: true |
| **Plan** | 23 |
| **Subscription Status** | **pending_payment** ⚠️ |
| **Membership Start Date** | June 15, 2026 |
| **Next Billing Date** | July 12, 2026 |
| | |
| **Enrolling Agent** | Travis Matheny (MPP0008) |
| **Enrollment Date** | June 12, 2026 |
| **Member Created** | June 12, 2026 |
| | |
| **Most Recent Successful Payment** | June 12, 2026 |
| **Payment Amount** | $238.16 |
| **Time to First Payment** | 1 hour |
| **EPX Auth GUID** | NO |
| **Transaction ID** | 1296216317 |
| | |
| **Payment Token History** | **❌ NONE** |
| **Token Records Total** | 0 |
| **Active Tokens** | 0 |
| **Inactive Tokens** | 0 |
| | |
| **Recurring Billing Capability** | ❌ **NOT BILLABLE** |
| **Reason** | Token lost; has payment history |

**Billing Log:** No recurring billing attempts recorded

**Analysis:**
- Paid immediately (1 hour) after enrollment, same day
- Subscription stuck in "pending_payment" despite immediate successful payment
- Zero payment token records — indicates restore loss
- Next billing date is July 12 (overdue by 43 days)
- Cannot be billed without re-collecting payment credentials

---

### Member 56 — Lawerence Harris

| Field | Value |
|-------|-------|
| **Database ID** | 56 |
| **Public ID** | MEMB-2607YBUV |
| **Customer #** | CUST-2607K7ZM |
| **Email** | ldharris270@gmail.com |
| **Phone** | 229-379-1509 |
| | |
| **Status** | active / is_active: true |
| **Plan** | 25 |
| **Subscription Status** | **active** ✅ |
| **Membership Start Date** | August 1, 2026 |
| **Next Billing Date** | August 17, 2026 |
| | |
| **Enrolling Agent** | Alexxus Hodges (MPPLE392102) |
| **Enrollment Date** | July 17, 2026 |
| **Member Created** | July 17, 2026 |
| | |
| **Most Recent Successful Payment** | July 17, 2026 |
| **Payment Amount** | $123.76 |
| **Time to First Payment** | <1 hour (same day) |
| **EPX Auth GUID** | NO |
| **Transaction ID** | 4297429072 |
| | |
| **Payment Token History** | **❌ NONE** |
| **Token Records Total** | 0 |
| **Active Tokens** | 0 |
| **Inactive Tokens** | 0 |
| | |
| **Recurring Billing Capability** | ❌ **NOT BILLABLE** |
| **Reason** | Token lost; has payment history |

**Billing Log:** No recurring billing attempts recorded

**Analysis:**
- Paid immediately (same day) within 1 hour of enrollment
- Subscription is marked "active" (unlike Members 32, 40)
- Next billing date is August 17 (7 days overdue as of August 24)
- Zero payment token records — indicates restore loss
- Would normally be selected by scheduler if token existed
- Cannot be billed without re-collecting payment credentials

---

### Member 58 — Victor Medrano

| Field | Value |
|-------|-------|
| **Database ID** | 58 |
| **Public ID** | MEMB-2608U9LF |
| **Customer #** | CUST-2608V3G2 |
| **Email** | vhm.texasinsurance@gmail.com |
| **Phone** | 956-865-0175 |
| | |
| **Status** | active / is_active: true |
| **Plan** | 17 |
| **Subscription Status** | **active** ✅ |
| **Membership Start Date** | August 15, 2026 |
| **Next Billing Date** | September 4, 2026 |
| | |
| **Enrolling Agent** | **Victor Medrano (MPPVH604359)** ⚠️ |
| **Enrollment Date** | August 4, 2026 |
| **Member Created** | August 4, 2026 |
| | |
| **Most Recent Successful Payment** | August 4, 2026 |
| **Payment Amount** | **$83.20** ⚠️ |
| **Subscription Amount** | **$92.56** ⚠️ |
| **Time to First Payment** | <1 hour (same day) |
| **EPX Auth GUID** | NO |
| **Transaction ID** | 5809413049 |
| | |
| **Payment Token History** | **❌ NONE** |
| **Token Records Total** | 0 |
| **Active Tokens** | 0 |
| **Inactive Tokens** | 0 |
| | |
| **Recurring Billing Capability** | ❌ **NOT BILLABLE** |
| **Reason** | Token lost; has payment history |

**Billing Log:** No recurring billing attempts recorded

**Analysis:**
- **CRITICAL**: Payment amount ($83.20) does NOT match subscription amount ($92.56)
- Agent is the same person as the member (self-enrolled)
- Paid same day as enrollment
- Zero payment token records — indicates restore loss
- Next billing date is September 4 (11 days in future)
- Amount discrepancy suggests payment_confirmed_service did not run (would normally sync amounts)
- Cannot be billed without re-collecting payment credentials AND resolving amount discrepancy

---

### Member 59 — Brandon Winston

| Field | Value |
|-------|-------|
| **Database ID** | 59 |
| **Public ID** | MEMB-2608KURM |
| **Customer #** | CUST-26083624 |
| **Email** | winston10295@gmail.com |
| **Phone** | 726-567-2698 |
| | |
| **Status** | active / is_active: true |
| **Plan** | 17 |
| **Subscription Status** | **active** ✅ |
| **Membership Start Date** | August 15, 2026 |
| **Next Billing Date** | September 6, 2026 |
| | |
| **Enrolling Agent** | **Brandon Winston (MPPNA358909)** ⚠️ |
| **Enrollment Date** | August 6, 2026 |
| **Member Created** | August 6, 2026 |
| | |
| **Most Recent Successful Payment** | August 6, 2026 |
| **Payment Amount** | $61.36 |
| **Time to First Payment** | 1 hour |
| **EPX Auth GUID** | NO |
| **Transaction ID** | 6053094773 |
| | |
| **Payment Token History** | **❌ NONE** |
| **Token Records Total** | 0 |
| **Active Tokens** | 0 |
| **Inactive Tokens** | 0 |
| | |
| **Recurring Billing Capability** | ❌ **NOT BILLABLE** |
| **Reason** | Token lost; has payment history |

**Billing Log:** No recurring billing attempts recorded

**Analysis:**
- Agent is the same person as the member (self-enrolled)
- Paid 1 hour after enrollment
- Zero payment token records — indicates restore loss
- Subscription status is "active"
- Next billing date is September 6 (13 days in future)
- Cannot be billed without re-collecting payment credentials

---

## COMPARATIVE SUMMARY TABLE

| Member | Name | Plan | Last Payment | Sub Status | Next Bill | Token Status | Likely Cause | Action Needed |
|--------|------|------|--------------|-----------|-----------|--------------|--------------|---------------|
| 32 | Ayodele Adebayo | 17 | Apr 21 (123 days ago) | pending_payment ⚠️ | May 1 (overdue) | NONE | **A** (Lost in restore) | Re-collect payment |
| 40 | Issac Jasso Jr | 23 | Jun 12 (73 days ago) | pending_payment ⚠️ | Jul 12 (overdue) | NONE | **A** (Lost in restore) | Re-collect payment |
| 56 | Lawerence Harris | 25 | Jul 17 (38 days ago) | active | Aug 17 (overdue) | NONE | **A** (Lost in restore) | Re-collect payment |
| 58 | Victor Medrano | 17 | Aug 4 (20 days ago) | active | Sep 4 | NONE + amount mismatch | **A** (Lost in restore) | Re-collect + resolve amount |
| 59 | Brandon Winston | 17 | Aug 6 (18 days ago) | active | Sep 6 | NONE | **A** (Lost in restore) | Re-collect payment |

---

## ROOT CAUSE ANALYSIS

### Pattern Recognition
All 5 members exhibit **identical characteristics**:

1. ✅ **Have successful EPX payment history** → Proves they went through payment flow
2. ✅ **Transaction IDs exist** → EPX processing occurred
3. ❌ **Zero payment_tokens records** → Tokens not in database
4. ⚠️ **Cannot be recurring-billed** → Missing credential to charge
5. ✗ **No EPX auth GUIDs** → payment_confirmed_service may not have run
6. 📊 **Metadata empty** → Payment records lack flow/source details

### Most Likely Cause: **A — Token existed before restore but appears lost**

**Evidence:**
- All 5 members successfully completed EPX Hosted Checkout (transaction_id + payment succeeded)
- EPX Hosted Checkout integration automatically creates `payment_tokens` records during success callback
- All 5 have **zero** token records — not "inactive" (which would be present), but completely absent
- This pattern is unique to these 5 members; the other 9 active members have tokens
- The most parsimonious explanation: tokens existed, database was restored from a backup point that excluded payment_tokens for these specific members

**Supporting Evidence:**
- Member 58 payment amount mismatch ($83.20 paid vs $92.56 subscription) suggests payment_confirmed_service didn't run, which typically happens when payment finalization is incomplete
- No recurring billing logs for any member → they were never even selected by the scheduler
- All payments show `epx_auth=NO` → EPX auth GUID wasn't captured (should be present if payment_confirmed_service ran)

### Alternative Hypotheses (Less Likely)

**B. Token exists but is inactive:** ❌ Ruled out — query returned 0 total records, not 0 active records

**C. Token exists but is malformed/unsupported:** ❌ Ruled out — query checks all payment_method_types, returns 0

**D. No token was ever stored:** ⚠️ Possible but improbable
- EPX Hosted Checkout flow should create tokens
- But payment succeeded without token creation? Would require enrollment via non-recurring payment path
- No evidence in metadata to support this

**E. Original payment used non-recurring payment path:** ❌ Ruled out
- All have subscriptions created
- All have next_billing_dates set
- All passed recurring enrollment flow

**F. Member should not actually be active:** ❌ Ruled out
- All marked `status='active'` and `is_active=true`
- All have successful payment
- All have valid subscription
- Member status is correct

**G. Other:** None identified

---

## INVESTIGATION QUESTIONS ANSWERED

### 1. Which specific members need us to contact for new payment information?

**ANSWER: ALL FIVE (32, 40, 56, 58, 59)**

All must be re-contacted because:
- None have valid reusable tokens
- Payment credentials from initial enrollment are not in system
- Cannot charge without token
- Must collect new payment information (card or ACH account)

**Contact Approach:**
- Member 32: Email (ayoadebayo1@gmail.com) - 5 days overdue
- Member 40: Email (cjasso217@gmail.com) - 43 days overdue ⚠️ URGENT
- Member 56: Email (ldharris270@gmail.com) - 7 days overdue
- Member 58: Email (vhm.texasinsurance@gmail.com) - Handle amount discrepancy first
- Member 59: Email (winston10295@gmail.com) - 13 days in future, but will be needed soon

### 2. Which members can likely be repaired using payment/token data already present?

**ANSWER: NONE**

No member can be repaired using existing data because:
- All lack any token records entirely
- Payment history exists but doesn't contain reusable credential (transaction_id only)
- EPX payment is one-time use
- No alternative payment method stored
- Re-collection is mandatory

### 3. Which members require additional investigation before changing anything?

**ANSWER: MEMBER 58 (Victor Medrano) — CRITICAL**

**Why:**
- Payment amount mismatch: Paid $83.20, subscription amount is $92.56
- This indicates one of:
  1. Customer paid less than subscription cost (underpayment)
  2. Subscription amount was adjusted after payment (subscription update)
  3. Payment capture failed after authorization (authorization only)
  4. Data corruption during restore

**Investigation needed before billing:**
- Confirm with agent whether this was intentional (e.g., promo, discount)
- Determine if $83.20 was correct one-time payment or if $92.56 is correct recurring amount
- Resolve amount before re-collecting payment

### 4. Are any of these five actually unsafe or incorrect to classify as active members?

**ANSWER: QUESTIONABLE — TWO MEMBERS SHOULD BE REVIEWED**

| Member | Risk | Explanation |
|--------|------|-------------|
| 32 | ⚠️ MODERATE | Subscription is "pending_payment" despite successful charge 5 days ago. Either: (1) subscription wasn't finalized, or (2) business decided not to activate. Verify intent. |
| 40 | ⚠️ MODERATE | Subscription is "pending_payment" despite immediate successful charge. Verify whether member should actually be active or in different status. |
| 56 | ✅ OK | Subscription is "active", payment succeeded, timeline makes sense. Safe to keep active. |
| 58 | ⚠️ CRITICAL | Amount mismatch creates ambiguity about enrollment status. Should not be charged until resolved. |
| 59 | ✅ OK | Subscription is "active", payment succeeded, timeline makes sense. Safe to keep active. |

**Recommendation:**
- Members 32, 40: Clarify with agent why subscription is "pending_payment" with successful payment
- Member 58: Resolve amount discrepancy before taking any billing action

---

## SUMMARY TOTALS

```
Active members reviewed:                           5
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tokens apparently lost due to restore:             5 (100%)
Tokens present but inactive:                       0
Members who never had a reusable token:            0
Members who may not truly belong in active:        2 (32, 40 - status unclear)
Members requiring new payment authorization:      5 (ALL)
Members recoverable without contacting customer:  0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Likely root cause:  Database restore excluded payment_tokens
                    for these 5 members specifically

Billing risk:       CRITICAL — Cannot charge without tokens
Operational risk:   MODERATE — Members stuck in pending/uncertain states
Data risk:          MODERATE — Amount mismatch on Member 58
```

---

## FINAL RECOMMENDATIONS

### Immediate Actions (Before Re-collecting Payment)

1. **Members 32 & 40:**
   - Confirm with enrolling agents why subscription is "pending_payment"
   - Clarify whether member should be active or should remain pending
   - If active, proceed to payment re-collection
   - If pending, hold and investigate further

2. **Member 58:**
   - Contact agent (Victor Medrano) to clarify $83.20 vs $92.56 discrepancy
   - Determine if this was a promo/discount or data issue
   - Resolve amount before any billing action

3. **Members 56 & 59:**
   - No blocking issues identified
   - Proceed with payment re-collection when ready

### Payment Re-Collection Process

For all 5 members:
- Use original enrollment email addresses
- Send secure payment re-authorization request
- Do NOT attempt to charge without new token
- Store new tokens with is_active=true
- Only then enable recurring billing

### Prevent Future Occurrence

- Verify database restore included payment_tokens table entirely
- Check if payment_tokens was explicitly excluded from restore
- Review backup/restore procedures for completeness
- Add backup integrity checks for critical billing tables

---

## AUDIT CERTIFICATION

This investigation is read-only and complete:
- ✅ No member records modified
- ✅ No payment tokens created or deleted
- ✅ No subscriptions changed
- ✅ No billing executed
- ✅ No EPX calls made
- ✅ Database connection read-only verified

**Investigation Date:** August 24, 2026  
**Status:** READY FOR OPERATIONAL REVIEW

