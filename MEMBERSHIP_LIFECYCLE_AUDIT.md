# Membership Lifecycle Audit
**Platform:** GetMyDPC Enrollment  
**Branch:** main @ dd27144  
**Audit date:** 2026-04-28  

## Implementation Status Addendum (2026-04-28)

Implemented after this audit:
- Recurring billing now supports automatic suspension after configurable consecutive failures via env var `RECURRING_BILLING_SUSPEND_AFTER_CONSECUTIVE_FAILURES` (default `3`).
- Suspension is applied consistently for all recurring failure branches (auth GUID resolution failure, ACH runtime data failure, EPX decline, EPX exception, post-success persistence failure).
- Auto-suspension updates both `subscriptions` and `members`, with explicit `payment_delinquent` reasoning and admin notification telemetry.
- Legacy app-level admin user suspend/reactivate routes are now aligned with subscription lifecycle behavior and no longer reactivate cancelled subscriptions.

Still pending operationally:
- Execute full non-local smoke validation for recurring cycles and scheduled finalization.

Completed after addendum:
- Resolved manual backfill anomaly for missing direct commission lane (member 20 / subscription 31).
- Resolved subscription/member amount mismatch anomaly (member 24 / subscription 24).
- Verified clean lifecycle backfill dry-run with `recordsRequiringManualReview = 0` via report:
  `scripts/output/membership-lifecycle-backfill-dry-run-2026-04-28T19-48-54-648Z.json`

---

## 1. Current Lifecycle Flow

```
ENROLLMENT FLOW
───────────────
Form submitted (registration route, routes.ts:5460)
  │
  ├─ members row created: status='active', is_active=true  ← immediately
  │   enrollment_date = NOW()  (= billing anchor)
  │   first_payment_date = enrollment_date
  │   membership_start_date = calculateMembershipStartDate(enrollment_date)
  │                           (1st or 15th, see membership-dates.ts)
  │
  └─ subscriptions row created: status='pending_payment'
      next_billing_date = calculateNextBillingDate(NOW())   ← month+1 same day
      [subscription is NOT yet 'active']

EPX HOSTED CHECKOUT CALLBACK (epx-hosted-routes.ts)
  │
  ├─ Payment succeeds
  │   ├─ member.status → 'active', first_payment_date = payment timestamp
  │   ├─ subscription.status → 'active'
  │   ├─ next_billing_date = calculateNextBillingDate(payment_created_at)
  │   └─ billing_anchor = payment_created_at (NOT membership_start_date)
  │
  └─ No payment → member stays 'pending_activation' (only if that path is used)

RECURRING BILLING CYCLE (recurring-billing-scheduler.ts:848)
  │
  └─ Query: subscription.status='active' AND next_billing_date <= NOW
      ├─ Charge attempted via EPX Server Post
      ├─ Success → advance next_billing_date +1 month, log success
      └─ Failure → log failed, set next_retry_date (+1 or +2 days), NOT suspended

CANCELLATION (routes.ts:3582)
  │
  ├─ member.status → 'cancelled', is_active=false, cancellation_date=NOW()
  ├─ subscription.status → 'cancelled'
  ├─ commission ledger → unpaid rows held, paid rows reversed
  └─ access → ends immediately

PLAN CHANGE (routes.ts:3689, /api/agent/members/:memberId/subscription)
  │
  ├─ member.planId and totalMonthlyPrice updated immediately
  ├─ subscription.planId and amount updated immediately
  └─ next_billing_date NOT changed

REACTIVATION (routes.ts:3662, storage.ts:2362)
  │
  ├─ member.status → 'active', is_active=true
  ├─ cancellation_date and cancellation_reason → NULL
  ├─ subscription.status → 'active'
  └─ next_billing_date NOT reset (retains old value)
```

---

## 2. Date Control Map

| System Action | Controlling Date | Field(s) | Notes |
|---|---|---|---|
| Billing anchor | `enrollment_date` / `first_payment_date` | `members.enrollment_date`, `members.first_payment_date` | Set to `NOW()` at registration; overwritten with payment timestamp on EPX callback |
| Next billing run | `next_billing_date` | `subscriptions.next_billing_date` | Computed as `calculateNextBillingDate(payment_created_at)` — anchored to payment date, not effective date |
| Membership access start | `membership_start_date` | `members.membership_start_date` | Computed as 1st or 15th; not enforced for billing |
| Commission effective | `effective_date` | `commission_ledger.effective_date` | Populated from `item.effectiveDate` if set, else `commission_period_start` |
| Commission period | `commission_period_start/end` | `commission_ledger.*` | Derived from bi-monthly bucket of the payment date; not tied to `membership_start_date` |
| Cancellation effective | `cancellation_date` | `members.cancellation_date` | Always = NOW() at the time the cancel API is called |
| Access ends | `cancellation_date` (via `is_active` flip) | `members.is_active`, `members.status` | Immediate; no `access_ends_at` or `paid_through_date` field exists |
| Paid-through date | Not stored | — | **Gap: must be derived as `next_billing_date - 1 day`** |
| Access end on cancel | Not stored | — | **Gap: no `access_ends_at` or `cancel_at_period_end` flag** |
| Scheduled cancel effective | Not supported | — | **Gap: no pending-cancel state** |
| Scheduled plan change effective | Not supported | — | **Gap: immediate only** |
| Member access check | `members.is_active && status = 'active'` | `storage.ts:2321` | Binary flag; no time-window awareness |

---

## 3. Scenario-by-Scenario Findings

---

### Scenario A — New enrollment (pay today, active today)

**Behavior:**
- Registration route (routes.ts:5476) creates member with `status='active'` and `is_active=true` immediately, before payment, to satisfy commission tracking.
- Subscription is created with `status='pending_payment'` and `next_billing_date = calculateNextBillingDate(NOW())`.
- EPX callback (epx-hosted-routes.ts:875) promotes subscription to `active`, overwrites `next_billing_date` from `payment_created_at`.
- Billing anchor = `payment_created_at` (preferred) → `first_payment_date` → `enrollment_date`.
- `payment_date` and `effective_date` are handled separately: `first_payment_date` drives billing; `membership_start_date` (1st or 15th) governs access start but is NOT enforced against billing.

**Risks:**
- Member is `active` before payment is confirmed. If EPX callback fails silently, a non-paying member stays `active` indefinitely with an incorrect `next_billing_date` computed from pre-payment `NOW()`.
- The pre-payment `next_billing_date` written at registration will be overwritten if EPX succeeds, but if EPX callback never arrives it remains stale and the scheduler will attempt billing on that stale date.

---

### Scenario B — New enrollment (pay today, effective future date)

**Behavior:**
- `membership_start_date` is computed and stored separately from billing.
- The `pending_activation` status exists in schema and code, but registration route currently sets status directly to `active` (routes.ts:5476), bypassing `pending_activation`.
- `membership-activation-service.ts` exists and can transition `pending_activation → active` when `membership_start_date` is reached, but it is only triggered if the member was created with `pending_activation`.
- Payment is always collected at enrollment time (EPX Hosted is synchronous).
- Billing anchor still uses `payment_date`, not `effective_date`.

**Gaps:**
- The platform stores `membership_start_date` but does not enforce it as an access gate because members are immediately `active`.
- No UI allows creating a member in `pending_activation` state through the normal enrollment path.

---

### Scenario C — Employer/group enrollment

**Behavior:**
- Group members are enrolled via `group_members` table; a corresponding `members` row may not exist until payment succeeds.
- EPX callback creates the `members` row on first payment (epx-hosted-routes.ts:1070) with `membershipStartDate = NOW()`.
- `next_billing_date` for group members is computed from `paymentRecord.created_at` — same payment-date anchor as individuals.
- The billing scheduler treats group members identically to individual members: filters `subscriptions.status='active'`.
- Charge runs per individual member subscription — not consolidated at employer level.
- Cancelling one group member cancels only that member's subscription; the group subscription is unaffected.

**Gaps:**
- No group-level billing rollup. A 50-person group generates 50 separate monthly charges.
- Group `next_billing_date` can drift per member if individual payment fails and retries on a different date.

---

### Scenario D — Member-requested cancellation after payment

**Behavior (confirmed gap):**
- Route (routes.ts:3623) cancels immediately: `member.status='cancelled'`, `is_active=false`, `cancellation_date=NOW()`, `subscription.status='cancelled'`.
- `paid_through_date` is not stored. It can be derived as `subscription.next_billing_date - 1 day` but this computation is not performed anywhere in the codebase.
- `subscriptions.end_date` exists in schema (shared/schema.ts:193) but the cancellation route does not set it.
- Commission ledger receives `cancellationDate = NOW()`, which holds/reverses commissions for periods that include today — even the already-paid period.
- No `cancel_at_period_end` flag or `pending_reason='member_cancelled'` deferred path exists.

**Business rules NOT met:**
- No refund + access continues to `paid_through_date` + no future billing — the first two sub-rules are not satisfied. Only "no future billing" is satisfied by hard cancellation.

---

### Scenario E — Immediate admin cancellation

**Behavior:**
- Admin can cancel via the same `PATCH /api/members/:memberId/membership` route (action=cancel) or via `PATCH /api/admin/members/:memberId/status`.
- The admin-status route (routes.ts:3755) calls `storage.updateMemberStatus`, which is the same immediate path.
- An `admin_logs` table exists, but the cancellation routes do **not** write an admin-log entry explicitly.
- Super-admin access gate is enforced in the UI (admin.tsx:978).

**Gaps:**
- No audit log is written by the server-side cancellation code.
- No distinction between "admin override" and "member request" in the stored data; both write the same `cancellation_reason` string.

---

### Scenario F — Upgrade

**Behavior:**
- Agent path `PUT /api/agent/members/:memberId/subscription` (routes.ts:4631) updates `planId` and `amount` on both `members` and `subscriptions` immediately. Comment at routes.ts:4670 explicitly says "NOT updating nextBillingDate."
- Admin path `PATCH /api/members/:memberId/membership` action=change (routes.ts:3689) has the same immediate behavior.
- `next_billing_date` is preserved. The next billing run will charge the new amount at the existing anchor date.
- No commission recalculation for mid-cycle upgrades; the ledger sync picks up the new rate on the next recurring sync pass.

**Gaps:**
- Upgrades are always immediate — no scheduling supported.
- The new plan amount is charged on the next `next_billing_date` with no pro-rata adjustment for days remaining in the current period.
- No "upgrade effective on next billing date" option.

---

### Scenario G — Downgrade

**Behavior:**
- Identical to upgrade code path — same immediate update, `next_billing_date` preserved.
- Access is NOT maintained at higher tier; the plan record is immediately changed.
- The billing scheduler picks up the new (lower) amount on the next `next_billing_date`.

**Business rule NOT met:** Downgrade should take effect at next billing cycle, but the plan is changed immediately, meaning the member loses higher-tier access before the paid-through date.

---

### Scenario H — Past-due membership

**Behavior:**
- Scheduler charges the subscription. If EPX declines, the `recurring_billing_log` entry is set to `failed` with a `next_retry_date` of 1–2 days out (recurring-billing-scheduler.ts:1425).
- The scheduler's due query uses a `retry_gate` lateral join that holds off re-billing until `next_retry_date <= NOW`.
- Subscription status is **not changed** on payment failure. The subscription stays `active`.
- Member status is **not changed** on payment failure. The member stays `active`.
- There is no `past_due`, `suspended`, or grace-period state for failed recurring payments.
- An admin notification is created on failure.

**Gaps:**
- No automatic suspension after N consecutive failures.
- `billing_schedule.consecutiveFailures` field exists in schema but is on `billing_schedule`, not `subscriptions`; the active scheduler does not use `billing_schedule` at all.
- Member access continues indefinitely even with a permanently failing payment method.
- No grace period logic; retry is purely time-based via `next_retry_date`.

---

### Scenario I — Reinstatement

**Behavior:**
- Admin path `PUT /api/admin/dpc-members/:customerId/reactivate` (routes.ts:2682) calls `storage.reactivateDPCMember` (storage.ts:2362): sets `status='active'`, `is_active=true`, clears `cancellation_date/reason`, but **does not touch the subscription**.
- The membership route's "reactivate" action (routes.ts:3662) sets subscription back to `active` but does not reset `next_billing_date`.
- The stale `next_billing_date` from before cancellation is now in the past; the scheduler will immediately pick it up and attempt to charge.
- No new payment is required before reinstatement.
- The original `members` record is reused.
- Commission ledger held/reversed rows are not automatically re-earned on reactivation; there is no "un-hold" path.

**Risks:**
- Reactivation without payment causes an immediate billing attempt on the stale `next_billing_date`, which could charge double if the member already paid and was incorrectly cancelled.
- Commissions remain reversed/held after reactivation.

---

### Scenario J — Lifecycle conflicts

| Conflict | Current behavior | Risk |
|---|---|---|
| Scheduled cancel + upgrade | Not applicable — no scheduled cancel state. Any upgrade immediately changes plan | If scheduled cancel were added, an upgrade request would need to clear the pending-cancel flag or the cancel would silently win |
| Scheduled downgrade + cancel | Not applicable — no scheduling | — |
| Future-effective enrollment cancelled before activation | `pending_activation` members can be cancelled immediately; `cancellation_date = NOW`; `membership_start_date` is not checked | A member who never received access gets a commission clawback triggered on their pre-activation date |
| Billing fails during pending lifecycle action | No lifecycle state machine; billing failure only logs and sets `next_retry_date`; any concurrent plan change or cancel is allowed | Race condition if admin cancels while a billing attempt is in flight |

---

### Scenario K — Admin and Member UI

**Admin UI** (admin.tsx, admin-enrollments.tsx, enrollment-details.tsx):
- `next_billing_date` is displayed in subscription debug tables (admin.tsx:1713, admin.tsx:3072).
- `paid_through_date` is not shown and is not derivable from what is displayed.
- Scheduled cancellation: not shown, not supported.
- `pending_activation` status is a valid filter in admin-enrollments.
- Pending plan change: not shown, no pending-change state exists.
- Cancellation via admin UI triggers the immediate `action=cancel` route.

**Member-facing enrollment-details UI** (enrollment-details.tsx):
- `nextBillingDateLabel` is computed from `planStartDate + 1 month` using `addMonths(planStartDate, 1)` (enrollment-details.tsx:745) — **this is a bug**: it uses the plan start date, not `subscriptions.next_billing_date`. If billing has been running for months, this label shows a stale date.
- Access end date: not shown.
- Cancellation effective date: not shown.
- Current vs upcoming plan: not shown; no scheduled plan-change state exists.

---

### Scenario L — Commission Ledger

**What date controls commission:**
- Commission period boundaries (`commission_period_start/end`) are derived from `effective_date` using `normalizePeriodFromDate`, which buckets any date into a 1st–15th or 16th–EOM window. Commission period tracks the enrollment/payment cycle, not `membership_start_date`.
- On cancellation, `cancellationDate = NOW()` is passed to `applyCancellationToLedger`. `getCancellationImpactedUnpaidRows` holds/reverses rows where `period_start ≤ cancellationDate ≤ period_end` **and** all future periods.
- If `cancellationDate = paid_through_date` were passed instead, the current-period row would NOT be held, preserving the agent's commission for the paid cycle. **This is a code-change-only fix — no schema required.**

**Gaps:**
- Commission cancellation is immediate and keyed to `NOW()`, not to `paid_through_date`.
- Upgrades/downgrades do not trigger ledger adjustments; the next recurring sync picks up the new rate.
- Commission does not follow billing — it follows membership status. A member who fails payment but stays `active` continues to earn agent commission on each recurring billing sync.

---

## 4. Identified Gaps Summary

| # | Gap | Scope |
|---|---|---|
| G1 | No `paid_through_date` — not stored, not computed, not displayed | Schema/logic |
| G2 | No `cancel_at_period_end` — cancellation is always immediate | Logic |
| G3 | Member is `active` before payment is confirmed at registration | Logic |
| G4 | `nextBillingDateLabel` in enrollment-details UI computed from `planStartDate` not `subscriptions.next_billing_date` | **UI bug** |
| G5 | No automatic suspension after recurring payment failures | Logic |
| G6 | Reactivation does not reset `next_billing_date`; stale date causes immediate billing | Logic |
| G7 | Downgrade is immediate; higher-tier access not preserved to `paid_through_date` | Logic |
| G8 | Commission cancellation uses `NOW()` not `paid_through_date`; holds agent commission for already-paid cycle | Logic |
| G9 | No audit log entry created server-side for cancellations | Compliance |
| G10 | `billing_schedule.consecutiveFailures` field exists but is not used by the active scheduler | Dead code |
| G11 | No distinction between admin and member-initiated cancellations in stored data | Data quality |
| G12 | No pending plan-change state — upgrades/downgrades are always immediate | Logic |

---

## 5. Risk Areas

### Billing risk (HIGH)
- **G3**: Members who start as `active` before payment could receive care without ever paying.
- **G6**: A reactivated member could be double-billed if their `next_billing_date` is in the past and they already paid for that period before cancellation.
- **G4**: The UI shows a wrong next billing date, eroding member trust and potentially leading to incorrect cancellation timing.

### Access risk (MEDIUM)
- **G2**: Members who cancel after paying lose access immediately — they paid for the current period but receive nothing.
- **G7**: Members who downgrade lose higher-tier access immediately despite paying for it until `next_billing_date`.
- **G5**: Members who never pay (after initial enrollment) stay `active` indefinitely.

### Commission risk (MEDIUM)
- **G8**: Agents lose commission for the current (already-earned) period when a member cancels, because `cancellationDate=NOW()` intersects the current period. This should be `paid_through_date`.

### Compliance risk (LOW-MEDIUM)
- **G9**: No server-side audit trail for cancellations means dispute resolution relies on Supabase logs alone.
- **G11**: Cannot distinguish member-initiated from admin-initiated cancellations in reports.

---

## 6. Schema Sufficiency Analysis

**No new columns are required** to implement the core end-of-period cancel business rule. The following existing fields are sufficient:

| Required concept | Existing field | Usage |
|---|---|---|
| Paid-through date | `subscriptions.next_billing_date - 1 day` | Derivable at query time |
| Access window | `subscriptions.end_date` | Already exists (shared/schema.ts:193); currently unused by cancel path |
| Scheduled cancel marker | `subscriptions.pending_reason = 'member_cancelled'` | Already exists with correct semantics |
| Cancel requested date | `members.cancellation_date` | Can be repurposed as "requested at" |

**One optional column** would improve clarity without being strictly required:
- `subscriptions.cancel_at_period_end boolean DEFAULT false` — makes the scheduler exclusion check trivial and avoids ambiguous `pending_reason` parsing. Single-column migration.

---

## 7. Minimal Safe Implementation Plan

Ordered from smallest/safest to largest. Each step is independently deployable.

### Step 1 — Fix G4 (UI bug, frontend only)
**File:** `client/src/pages/enrollment-details.tsx:745`  
Change `nextBillingDateLabel` to read `subscription.nextBillingDate` from the API response instead of computing `addMonths(planStartDate, 1)`. The enrollment-details API endpoint already returns subscription data.

### Step 2 — Fix G8 (commission cancellation date, backend code-only)
**File:** `server/routes.ts:3647`  
Change `cancellationDate` passed to `applyCancellationToLedger` from `member.cancellation_date` (= NOW) to `formatLocalDate(nextBillingDate)` — i.e., the day after `paid_through_date`. This preserves the agent's commission for the already-paid cycle.

### Step 3 — Implement cancel-at-period-end (logic change, no schema migration)
**File:** `server/routes.ts:3582–3655`  
In the cancel handler:
1. Do NOT immediately set `member.status='cancelled'`.
2. Compute `paidThroughDate = subscriptions.next_billing_date - 1 day`.
3. Set `subscription.end_date = paidThroughDate`.
4. Set `subscription.pending_reason = 'member_cancelled'`.
5. Set `member.cancellation_date = NOW()` (records request time).
6. Keep `member.status = 'active'` and `is_active = true`.
7. Pass `paidThroughDate` to `applyCancellationToLedger`.
8. Add a daily finalization job: set `status='cancelled'` when `subscription.end_date < TODAY`.
9. Update billing due query (storage.ts:5579) to exclude rows where `pending_reason = 'member_cancelled'`.

### Step 4 — Fix G6 (reactivation billing anchor)
**File:** `server/routes.ts:3662`, `server/storage.ts:2362`  
When reactivating, if `subscription.next_billing_date < TODAY`, set it to `calculateNextBillingDate(TODAY)` before setting status to `active`. Prevents the scheduler from immediately billing a stale date.

### Step 5 — Fix G5 (failed payment grace period)
After N consecutive failures (suggest 3), set `subscription.status = 'suspended'` and `member.status = 'suspended'`. Add `suspended` handling to UI. Requires a failure counter on `subscriptions` (the existing `billing_schedule.consecutiveFailures` is on the wrong table).

### Step 6 — Fix G9 (audit log, compliance)
In the cancel handler, write an `admin_logs` entry with:
- `action = 'cancellation'`
- `initiated_by = req.user.email`
- `type = 'member_requested' | 'admin_initiated'`

---

## 8. Recommended Test Cases Before Production Deployment

| # | Test case | Validates |
|---|---|---|
| T1 | Enroll member, confirm EPX callback, verify `next_billing_date = payment_date + 1 month` | G3, billing anchor |
| T2 | Cancel after payment, confirm `subscription.end_date = next_billing_date - 1 day`, status remains `active` | Step 3 |
| T3 | Run scheduler on date before `end_date` for a pending-cancel subscription — confirm no charge | Step 3 |
| T4 | Run scheduler on `end_date` — confirm finalization job sets status to `cancelled` | Step 3 |
| T5 | Run scheduler the day after `end_date` — confirm `cancelled` subscription is excluded | G2 |
| T6 | Cancel after payment, confirm commission is held starting from `next_billing_date`, not from `NOW()` | G8, Step 2 |
| T7 | Reactivate cancelled member, verify `next_billing_date >= TODAY` before scheduler runs | G6, Step 4 |
| T8 | Downgrade member, confirm higher-tier plan is still in effect until `next_billing_date` | G7 |
| T9 | Fail recurring payment 3 times, verify `subscription.status = 'suspended'` and access gate reacts | G5, Step 5 |
| T10 | View enrollment-details page, confirm shown next billing date matches `subscriptions.next_billing_date` | G4, Step 1 |
| T11 | Group member payment succeeds, verify `next_billing_date` anchored to payment timestamp, not group effective date | Scenario C |
| T12 | Admin cancel vs member cancel — confirm audit log distinguishes the two | G9, G11 |

---

*End of audit.*
