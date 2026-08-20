# MPP Membership, Payment & Commission System — Forensic Audit

**Audit type:** READ-ONLY. No application code, schema, or data was modified.
**Date:** 2026-08-19
**Scope:** Registration → Enrollment → Payment (EPX) → Commission → Override → Payout → Reporting

---

## 1. Executive Summary

| Area | Finding | Risk |
|---|---|---|
| Enrollment creates member before payment | Confirmed. Status = `pending_payment`, `is_active=false`. | OK (matches intended model) |
| Commission at enrollment time | Disabled (`if (false && ...)` in `/api/registration`, and commented-out in `/api/agent/enrollment`). Commission is deferred to payment confirmation. | OK (matches intended model) |
| Single "Payment Confirmed" service | **Does NOT exist.** Commission-creation logic is duplicated in at least 3 places (webhook/callback, `/api/admin/payments/:id/status`, `/api/admin/members/:id/create-commission`, `/api/admin/commissions/repair`). | **HIGH** |
| Idempotency protection | Partial. Callback has a "duplicate callback" short-circuit and commission-creation checks `agent_commissions` existence before inserting, but there is **no DB unique constraint** enforcing one-commission-per-payment; protection is app-level "check-then-insert" (race possible). | **HIGH** |
| Missed EPX success (webhook never lands) | Real risk. Auto-activation and commission creation both happen **only** inside the `/api/epx/hosted/callback` handler (server-to-server EPX POST) or the `/api/epx/hosted/complete` (frontend-triggered) handler. If both fail (browser closed AND server callback lost), member stays `pending_payment` indefinitely with no reconciling job that finds "EPX succeeded, MPP still pending." | **HIGH** |
| Manual recovery path | Exists (`PUT /api/admin/payments/:id/status`, `POST /api/admin/reconciliation/create-manual-payment`, `POST /api/admin/commissions/repair`, `POST /api/admin/members/:id/create-commission`). These are **separate, ad-hoc code paths**, not the same function as the automatic path. They do NOT record "who verified / when / original EPX timestamp vs platform-verified timestamp" as distinct fields. | **HIGH** |
| Writing commission payout date logic | **FAILS** the specified acceptance tests (see §9). Current code computes eligibility using a Monday–Sunday-week + "Friday after week ends" rule tied to enrollment date, not the "1st/15th effective date → first strictly-later Friday" rule described in the requirements. | **HIGH — logic mismatch with documented business rule** |
| Override payout date logic | **PASSES** for ordinary months, **FAILS** the Federal-Reserve-holiday case (no holiday-awareness at all in the override/ledger payout-date function). | **MEDIUM–HIGH** |
| $25 threshold / carry-forward | Implemented and separate for writing vs. override queues (single `commission_ledger` uses same threshold constant for both, but batch grouping is by `batch_type` so they aren't mixed together in a single payable amount incorrectly — see §12). | OK, with one caveat noted |
| Refunds/cancellations | Ledger holds unpaid rows and can create explicit negative "reversal" rows for paid rows; nothing is deleted or overwritten. | OK (immutable-style) |
| Financial ledger vs. mutable totals | **Hybrid.** `agent_commissions` (source-of-record, mutable rows with `payment_status`) + `commission_ledger` (append-style rows, some mutated in place: `status`, `payout_batch_id` are updated, not versioned) + `commission_payouts` (per-member/legacy). No single canonical immutable ledger; three co-existing commission representations. | **HIGH — traceability gap** |

---

## 2. System Map (files, tables, triggers)

### 2.1 Registration / Enrollment

| File | Function/Endpoint | Purpose | Writes | Commission side effect |
|---|---|---|---|---|
| [client/src/pages/registration.tsx](client/src/pages/registration.tsx) | form → `POST /api/registration` | Collects personal/employment/plan info, plan start date (1st/15th only, cutoff-aware via [shared/planStartDates.ts](shared/planStartDates.ts)) | — | none |
| [server/routes.ts](server/routes.ts#L7079) | `POST /api/registration` | Creates `members` row, optional `subscriptions` row | `members` (status=`pending_payment`, `is_active=false`), `subscriptions` (status=`pending_payment`) | **Disabled** — code path is wrapped in `if (false && ...)` (line ~8129) with comment "Commission creation is deferred until payment callback confirms activation." |
| [server/routes.ts](server/routes.ts#L8100) | `POST /api/agent/enrollment` | Same as above, agent-authenticated variant | `members`, `subscriptions` | Same — explicit log "Commission creation deferred until payment callback confirms activation" |
| [server/routes/group-enrollment.ts](server/routes/group-enrollment.ts) | `POST /api/groups`, `.../members`, `.../complete` | Group/employer enrollment workflow (separate lifecycle) | `groups`, `group_members`, `agent_commissions` (as **expected/placeholder** rows created at `complete`, see §2.4) | Creates **expected** (not yet payable) commission rows tagged `stage` metadata before payment |

**Confirmed:** Member and (if plan/price provided) subscription records are created **before** payment. `enrollmentDate`, `firstPaymentDate`, `membershipStartDate` (1st/15th only) are all set at registration time. No commission or override record exists at this point for individual enrollments — verified by grep: the `agent_commissions` insert block in `/api/registration` is dead code (`if (false && ...)`).

### 2.2 EPX Hosted Checkout

| File | Endpoint | Purpose |
|---|---|---|
| [server/routes/epx-hosted-routes.ts](server/routes/epx-hosted-routes.ts#L4272) | `POST /api/epx/hosted/create-payment` | Launches secure hosted checkout window. Creates a `payments` row, `status="pending"`, `transactionId=orderNumber` (app-generated, `Date.now()` based). Sends amount, order/invoice number, public key, terminal profile ID to frontend. Has guardrails against duplicate concurrent sessions (`PAYMENT_ALREADY_COMPLETED`, `PAYMENT_INTENT_ACTIVE`). |
| [server/routes/epx-hosted-routes.ts](server/routes/epx-hosted-routes.ts#L4337) | `POST /api/epx/hosted/complete` | **Frontend-triggered** completion (browser callback from EPX modal). Marks payment `succeeded`, activates member (`status: active`), attaches BRIC token. Has idempotent no-op if already succeeded. |
| [server/routes/epx-hosted-routes.ts](server/routes/epx-hosted-routes.ts#L4997) | `POST /api/epx/hosted/callback` | **Server-to-server EPX POST-back** ("EPX Server Post"/webhook analogue). This is the authoritative path: persists payment success, auto-activates member, creates commissions if missing, sends notifications. Has a duplicate-callback short-circuit (`callbackAlreadyProcessed`). |
| [server/routes/epx-hosted-routes.ts](server/routes/epx-hosted-routes.ts#L6444) | `GET /api/epx/hosted/status/:transactionId` | Polling status check for frontend. |
| [server/routes/epx-hosted-routes.ts](server/routes/epx-hosted-routes.ts#L6540) | `POST /api/admin/payments/:id/status` (**manual verification**) | Admin manually sets payment status; if `succeeded`, activates member and creates commission if missing (duplicated logic from callback, not shared). |
| [server/routes/epx-hosted-routes.ts](server/routes/epx-hosted-routes.ts#L7089) | `POST /api/admin/members/:id/create-commission` | Manual, one-off commission creation for a member (separate code path, uses legacy `calculateCommission` directly — does **not** call the WP-03 override-flow allocation engine used by callback/admin-update). |
| [server/routes/epx-hosted-routes.ts](server/routes/epx-hosted-routes.ts#L7284) | `POST /api/admin/commissions/repair` | Bulk scan across all active members, creates missing commissions (dry-run supported). Also bypasses the WP-03 allocation engine — uses plain `calculateCommission` and inserts a **single** direct-only row (no override fan-out). |
| [server/routes/payment-reconciliation.ts](server/routes/payment-reconciliation.ts#L233) | `POST /api/admin/reconciliation/create-manual-payment` | Creates a **synthetic** payment record (`transactionId = "MANUAL-RECOVERY-M{id}-{timestamp}"`) when a member has no payment row at all. Explicitly labeled in the response: "does not verify actual money receipt." Does **not** trigger commission creation itself. |

**There is no true async webhook queue/retry.** The `/api/epx/hosted/callback` route is EPX's server-to-server POST, but nothing distinguishes "we never received it" from "we received it and processed it" other than the payment row staying `pending`. There is no scheduled reconciliation job that polls EPX for transaction status and repairs `pending` payments automatically — the audit found scheduled jobs for: membership activation (date-based `pending_activation` → `active`), recurring billing (subscription-cycle charges), weekly recap (reporting email). **None of these reconcile a stuck `pending` hosted-checkout payment against EPX's actual transaction status.**

### 2.3 Commission / Override Creation

| File | Function | Trigger | Notes |
|---|---|---|---|
| [server/routes/epx-hosted-routes.ts](server/routes/epx-hosted-routes.ts#L645) | `createWp03CommissionsForSuccessfulPayment` | Called from: hosted callback (auto), `/api/admin/payments/:id/status` (manual) | Full override "flow-up" allocation engine ([server/services/override-flow-up-engine.ts](server/services/override-flow-up-engine.ts)): walks upline chain, applies level-split policy, snapshots lineage (`agent_lineage_snapshots`, `lineage_snapshot_id` FK on both `agent_commissions` and `commission_ledger`). |
| [server/routes/epx-hosted-routes.ts](server/routes/epx-hosted-routes.ts#L7089), [#L7285](server/routes/epx-hosted-routes.ts#L7285) | ad-hoc admin commission creation / repair | Manual admin action | **Does NOT use** the WP-03 engine — creates a single direct-only row via `calculateCommission()`. This means manually repaired members get a **different commission shape** (no override fan-out to upline) than automatically processed ones. |
| [server/services/commission-ledger-service.ts](server/services/commission-ledger-service.ts) | `syncCommissionLedgerFromFeed`, `buildDraftPayoutBatches` | Admin-triggered ledger sync / batch build | Converts `agent_commissions` feed rows into `commission_ledger` rows (separate table), assigns `payout_batch_id`, applies $25 threshold. |

**Duplicate-protection mechanism:** every code path (`callback`, `admin-update`, `create-commission`, `commissions/repair`) does a `SELECT ... FROM agent_commissions WHERE member_id = X LIMIT 1` **before** inserting. This is a **check-then-act** pattern with no unique DB constraint (no `UNIQUE(member_id, payment_id)` or similar). Two near-simultaneous requests (e.g., EPX callback + admin manually verifying) could both pass the "no existing commission" check and both insert — this is an actual **race condition**, not just theoretical, because Node's event loop can interleave two concurrent request handlers between the `SELECT` and the `INSERT`.

### 2.4 Group Enrollment (separate track)

Groups use a materially different, better-instrumented flow: `POST /api/groups/:groupId/complete` calls `createExpectedGroupMemberCommissionsForCycle` to pre-create **expected** (metadata-tagged, `stage:expected`) commission rows *before* payment, then `transitionGroupPaymentToPayable` (called from both the member-payment admin endpoint and the EPX hosted callback) flips them to `payment_captured=true` and creates `commission_payouts` rows via `createMonthlyPayout`. This IS the "shared service" pattern the audit's §11 asks for — but it exists **only for groups**, not for individual enrollments.

---

## 3. Registration & Enrollment Flow — Detailed Answers

- **Where registration starts:** [client/src/pages/registration.tsx](client/src/pages/registration.tsx) (individual) and [client/src/pages/group-enrollment.tsx](client/src/pages/group-enrollment.tsx) (group).
- **What's collected:** personal info, address, employment, plan/coverage selection, plan start date (1st/15th, cutoff-validated), discount code, consents.
- **When a prospective member becomes a DB record:** immediately on `POST /api/registration` success — **before** any payment attempt.
- **Incomplete enrollments stored?** No separate "draft" table for individual enrollments — the form is entirely client-side (sessionStorage) until final submit. Groups DO have a `draft` status on the `groups` table itself.
- **Enrollment progress storage:** individual = none (single-shot submit); group = `groups.status` (`draft` → `ready`/`registered` → `active`).
- **When is enrollment "complete"?** On successful `POST /api/registration` (member+subscription rows exist), independent of payment.
- **Enrollment/membership status values:** member `status`: `pending_payment` (actually set at creation — note: the DB default in [shared/schema.ts](shared/schema.ts#L197) is `pending_activation`, but the registration route explicitly overrides with `"pending_payment"`), later `active`, also `cancelled`, `suspended`, `pending_activation` (post-payment, pre-effective-date), `inactive`. Subscription `status`: `pending_payment`, `active`, `cancelled`, `suspended`, `pending`.
- **Writing agent attachment:** `enrolledByAgentId` + `agentNumber` resolved server-side (not trusted from client) in the registration handler.
- **Plan/product storage:** `members.planId`, `coverageType`, `totalMonthlyPrice`; mirrored into `subscriptions.planId/amount`.
- **Effective date determination:** `membershipStartDate` = one of the next two 1st/15th anchors per [shared/planStartDates.ts](shared/planStartDates.ts), cutoff-aware (3 business days before anchor).
- **Can effective date change later?** Yes — `activateMembershipNow` (admin override) sets `membershipStartDate = now()` and immediately flips status to `active`, bypassing the normal 1st/15th anchor. There's also a documented `ADMIN_ENROLLMENT_DATE_OVERRIDE.md` allowing backdating `enrollmentDate` at registration time (admin-only, validated `<= now`).
- **Member record created before payment?** **Yes, confirmed.**
- **membershipId vs memberId separate?** For individuals, no separate "membership" entity — `members` row IS both identity and membership. `subscriptions` is a related-but-distinct billing record (own `id`, FK `memberId`). Groups have `groups` + `group_members` as a second membership layer.
- **What happens if enrollment completes but payment never occurs?** Member stays `pending_payment`/`is_active=false` indefinitely. No automatic expiration/cleanup job found for individual enrollments (only a stale-hosted-**payment** expiry after 20 minutes — `expireHostedPendingPayment` — which marks the *payment row* `failed`, not the member).

**Compliance with the documented "Authoritative Business Flow" (§3 of requirements):** ✅ Enrollment and payment ARE separate. ✅ Enrollment completion does NOT generate commission. ✅ Member enters pending-payment state. ✅ Only a successful EPX transaction (via callback/complete) creates commission eligibility. This part of the system **matches the intended design**.

---

## 4. Member Record Immediately After Enrollment

Confirmed writes at `POST /api/registration` success:
- `members`: `status='pending_payment'`, `isActive=false`, `enrollmentDate`, `firstPaymentDate` (=enrollmentDate), `membershipStartDate` (1st/15th anchor), `planId`, `coverageType`, `totalMonthlyPrice`, `enrolledByAgentId`, `agentNumber`.
- `subscriptions` (if `planId` + `totalMonthlyPrice` present): `status='pending_payment'`, `amount`, `nextBillingDate`.
- **No** `agent_commissions`, **no** `commission_ledger`, **no** `payments` row yet (payment row is only created later, when the hosted-checkout session is launched via `create-payment`).

This matches "EXPECTED BEHAVIOR" in the requirements exactly.

---

## 5. EPX Payment Integration — Request/Response Field Map

**Request to EPX (via `create-payment` → frontend → EPX hosted script):**
- `amount`, `orderNumber` (app-generated 10-digit numeric, used as `transactionId`), `email`, `billingName`, `publicKey`, `terminalProfileId`, `scriptUrl`, `environment` (`sandbox`/`production`).
- No explicit "memberId" or "membershipId" is sent *to* EPX — EPX only sees `orderNumber`/`invoiceNumber`. The member linkage lives purely on MPP's side via the `payments` row (`memberId` FK) keyed by that same `orderNumber` (stored as `transactionId`).
- Return/callback URLs are configured server-side in EPX hosted checkout config (`epx-hosted-config.production.json`), not per-request.

**Response from EPX (captured in callback/complete handlers):**
| EPX value | Stored where |
|---|---|
| Transaction ID / order number | `payments.transaction_id`, `payments.metadata.epxTransactionId` |
| AUTH_GUID | `payments.epx_auth_guid`, masked copy in `metadata.hostedCallback.authGuidMasked` |
| Auth code | `payments.authorization_code` |
| Success/failure status | `payments.status` (`succeeded`/`failed`), plus raw `metadata.hostedCallback.status` |
| Amount | `payments.amount` (via update), raw echoed in `metadata.hostedCallback.amount` |
| Decline reason/code | `metadata.hostedCallback.declineReason/declineCode/rawStatusMessage/failureCategory` |
| BRIC token (recurring) | `members.paymentToken`, `payment_tokens` table (`bricToken`, `originalNetworkTransId`) |
| Transaction timestamp | **Not separately stored** — only `payments.updated_at`/`created_at` (see §8 gap). |

---

## 6. Payment Success — Authoritative Trigger

**Precise triggers that flip status + create commission**, confirmed by code:

1. `POST /api/epx/hosted/callback` (EPX server-to-server POST) — **primary automatic trigger**. On `result.isApproved`: persists payment `succeeded`, activates member (`status:'active', isActive:true, firstPaymentDate:now`), snapshots lineage, creates WP-03 commissions if none exist, sends notifications.
2. `POST /api/epx/hosted/complete` (frontend-triggered, browser-side "the modal told us it succeeded") — activates member and attaches token, but **notably does not independently call the commission-creation block** (only the callback path does, per code read — `complete` only sets member active + token, commission creation is not present in that handler). This is an **inconsistency**: a payment that completes via `complete` but whose server-to-server `callback` is delayed/lost will have an **active member with no commission** until the callback (if it ever arrives) creates it.
3. `PUT /api/admin/payments/:id/status` (manual admin override) — same effect, separate code (uses same WP-03 engine, good), but is a structurally different endpoint/function from #1.

**No database trigger, no cron/scheduled reconciliation job, and no message-queue/webhook-retry mechanism** perform this transition. It is 100% synchronous, per-request application logic.

---

## 7. Required Successful-Payment Sequence — What Happens Today

| Step | Happens today? | Where |
|---|---|---|
| EPX transaction/reference stored | ✅ | `payments.transaction_id`, `epx_auth_guid` |
| Actual payment transaction timestamp stored | ⚠️ Partial — only `updated_at`, no distinct `payment_transaction_at` | — |
| Payment status Pending→Paid | ✅ | `payments.status` |
| `payment_confirmed_at` recorded | ❌ Not a distinct field; conflated with `updated_at` | — |
| Member/membership status updated | ✅ | `members.status='active'` |
| Member payment-related timestamp | ✅ (`firstPaymentDate`) | `members.firstPaymentDate` |
| Writing commission generated | ✅ (callback / manual-update paths only) | `agent_commissions` |
| Hierarchy snapshotted | ✅ | `agent_lineage_snapshots` |
| Applicable overrides generated | ✅ (WP-03 engine, callback/manual-update paths only) | `agent_commissions` (`commission_type='override'`) |
| Commission payout cycle assigned | ⚠️ Only for groups (`commission_payouts` via `createMonthlyPayout`); individual `agent_commissions` rows get a `paymentEligibleDate` but are only converted into a `commission_ledger`/batch row by a **separate, manually-triggered** sync (`syncCommissionLedgerFromFeed`/`buildDraftPayoutBatches`), not automatically at payment time. | `commission_ledger`, `commission_payout_batches` |
| Audit event created | ✅ (`admin_notifications` of type `payment_succeeded`, `auto_activation`; `commission_ledger_events` for ledger transitions) | — |

---

## 8. Timestamps & Financial Audit Trail

Confirmed **actual distinguishable timestamp fields** present in the system today:

- `members.enrollmentDate`, `members.firstPaymentDate`, `members.membershipStartDate`, `members.createdAt/updatedAt`.
- `payments.createdAt/updatedAt` (no separate "attempt" vs "success" timestamp — a `pending`→`succeeded` transition just overwrites `updated_at`).
- `agent_commissions.enrollmentDate` (defaults to `now()` at insert — i.e., **commission creation time**, not payment time), `paymentEligibleDate`, `paidDate`.
- `commission_ledger` rows carry `commission_period_start/end`, `cancellation_date`; ledger transitions are separately audited in `commission_ledger_events` (append-only, has `from_status`/`to_status`/`reason`/`metadata`) — **this is the one genuinely good immutable audit trail in the system.**
- `payments.metadata.hostedCallback.updatedAt` — the closest thing to "platform recognized this transaction at X," but it's inside a JSONB blob, not a queryable column, and is **overwritten** on each callback (not append-only).

**Conceptual fields requested by the audit (`payment_transaction_at`, `payment_confirmed_at`, `platform_verified_at`, `verification_method`, `verified_by`, `epx_transaction_id`) — status:**
- `epx_transaction_id` ≈ exists (`payments.transaction_id` / `epx_auth_guid`).
- `payment_transaction_at` (when EPX actually processed it) — **does not exist as a distinct value.** EPX's own transaction timestamp is never captured separately from MPP's processing time.
- `payment_confirmed_at` — **does not exist.**
- `platform_verified_at` — **does not exist** as a column; only inferable from `payments.updated_at`, which is not durable evidence of *first* confirmation (subsequent unrelated updates overwrite it).
- `verification_method` — **partially exists** only for the manual-status-update path, stored as free-form `metadata.manualStatusUpdate.{previousStatus,newStatus,updatedBy,updatedAt,note}` and `metadata.externalSettlement.{source,method,reference,processedAt}` — not a normalized enum column, and not present at all for the automatic callback path (there is no `verification_method='automatic_callback'` marker).
- `verified_by` — only present for manual updates (`metadata.manualStatusUpdate.updatedBy`); automatic callbacks have no "verified_by" (implicitly "system/EPX").

**Conclusion:** The system does **not** currently distinguish "when EPX processed the transaction" from "when MPP's platform recognized it," which is exactly the ambiguity §8 of the requirements warned about. This is the root cause of the risk in §9/§12 below.

---

## 9. Writing Commission Date Acceptance Tests — RESULT

Ran the current `calculatePaymentEligibleDate()` (in [server/utils/commission-payment-calculator.ts](server/utils/commission-payment-calculator.ts)) against the specified cases:

| Input | Expected | Actual | Result |
|---|---|---|---|
| 03/01/2026 | 03/06/2026 | 03/06/2026 | PASS |
| 04/01/2026 | 04/03/2026 | **04/10/2026** | **FAIL** |
| 05/01/2026 | 05/08/2026 | 05/08/2026 | PASS |
| 06/15/2026 | 06/18/2026 | **06/26/2026** | **FAIL** |
| 07/01/2026 | 07/03/2026 | **07/10/2026** | **FAIL** |
| 08/15/2026 | 08/21/2026 | 08/21/2026 | PASS |
| 01/01/2027 | 01/08/2027 | 01/08/2027 | PASS |

**4 of 7 FAIL.** Root cause: `calculatePaymentEligibleDate()` implements a **Monday–Sunday-week-based** rule ("Friday after the week containing the enrollment date ends") rather than the specified **"first Friday strictly after the 1st/15th effective date (next Friday if it falls on that Friday)"** rule. The two rules happen to agree when the effective date is itself a Sunday/near-week-boundary (hence the 3 passing cases), but diverge whenever the effective date falls earlier in the week (e.g., a Wednesday 4/1/2026 gets pushed a full extra week under the current logic).

This function (`calculatePaymentEligibleDate`) is used for **individual writing-commission payout scheduling** in [server/services/commission-payout-service.ts](server/services/commission-payout-service.ts) and [server/services/group-payment-transition-service.ts](server/services/group-payment-transition-service.ts). It is a **different, separate implementation** from the batch-based `getNextPayoutDate()` used by `commission-ledger-service.ts` (which implements the 1st/15th-anchor model and is closer to — but not identical to — the documented rule; see §10).

---

## 10. Override Date Acceptance Tests — RESULT

Using the actual cycle-anchor model in [server/services/commission-ledger-service.ts](server/services/commission-ledger-service.ts) (`getCycleAnchorForEntry` + `firstFridayOnOrAfter`):

| Earnings month | Expected payout | Actual | Result |
|---|---|---|---|
| August 2026 | 09/04/2026 | 09/04/2026 | PASS |
| September 2026 | 10/02/2026 | 10/02/2026 | PASS |
| December 2026 | 01/04/2027 (holiday-shifted) | **01/01/2027** | **FAIL** |

`firstFridayOnOrAfter()` has **no Federal Reserve holiday logic at all** — confirmed Jan 1, 2027 is a Friday **and** New Year's Day (a Fed holiday), so the required "shift forward to next business day" rule cannot fire because no holiday check exists in this function. (Contrast: [server/utils/membership-dates.ts](server/utils/membership-dates.ts) DOES implement a full observed-US-bank-holiday calendar and shift logic for **billing anchor dates** — that holiday calendar is simply never invoked by the commission-ledger payout-date code.)

---

## 11. Threshold / Carry-Forward Logic

- `MIN_AGENT_PAYOUT_THRESHOLD = 25` is a hard-coded constant in [server/services/commission-ledger-service.ts](server/services/commission-ledger-service.ts) (`shouldCarryForwardAgent`). Not configurable via admin UI/env var.
- Same constant is used for both writing and override rows inside `commission_ledger` — **but** batches are segregated by `batch_type` (`1st-cycle`/`15th-cycle` for writing vs. the monthly override cycle keyed the same way), so a writing amount and an override amount for the same agent are evaluated against the $25 threshold **independently per batch**, not summed together. This matches "writing commission balances and override balances remain separate," though it relies on batch segregation rather than an explicit type-based split — a subtle but currently-correct implementation detail.
- Carry-forward is stored by leaving the ledger row's `status='carry_forward'` and `payout_batch_id=null`; it is **not a separate running-total row** — the next `buildDraftPayoutBatches` run will re-evaluate and either re-carry-forward or include it, and `rebalanceOpenBatchThresholdAssignments` recalculates whenever new rows land in an open batch. This is **reconcilable** (each carried row is individually traceable via `commission_ledger_events`), which is good.
- Commissions below $25 do **not** disappear — they remain `carry_forward` rows with a full audit trail (`commission_ledger_events` records every threshold transition with `thresholdMinimum`/`thresholdNetPayableTotal` in metadata).
- An `adminOverrideCarryForwardForBatch` admin escape-hatch exists to force-pay below-minimum balances — audited but bypasses normal threshold logic (requires a mandatory reason string).

---

## 12. Manual Payment Verification — Deep Trace

Endpoint: `PUT /api/admin/payments/:id/status` ([server/routes/epx-hosted-routes.ts](server/routes/epx-hosted-routes.ts#L6737)).

- **Fields changed:** `payments.status`, optionally `payments.paymentMethod` (if `processedExternally`), `payments.metadata.manualStatusUpdate` (`previousStatus/newStatus/updatedBy/updatedByUserId/updatedAt/note`), optionally `payments.metadata.externalSettlement` (`method/reference/processedAt/updatedBy`).
- **Does it change only status?** No — on `succeeded`, it also: activates the member, snapshots lineage, checks for existing commission, and (if none) runs the **same WP-03 allocation engine** as the automatic callback (`createWp03CommissionsForSuccessfulPayment`) — this part is correctly shared logic.
- **Stores original EPX transaction timestamp separately from verification timestamp?** **No.** `manualStatusUpdate.updatedAt` records when the *admin acted*, but there is no field capturing "when EPX actually processed this" if that differs (the scenario explicitly described in requirements §12 — EPX processes Aug 15 2:34pm, admin verifies Aug 16 9:12am). The system has no way to record/display two distinct timestamps for this case.
- **Records who performed manual verification?** Yes (`updatedBy`, `updatedByUserId`).
- **Records when manual verification occurred?** Yes (`updatedAt`), but this timestamp isn't tagged as "verification time" vs. transaction time in the schema — it's just inside a metadata note.
- **Generates writing commission / overrides?** Yes, via WP-03 engine — good, this matches the "shared service" ideal for override fan-out logic specifically.
- **Assigns payout cycle?** The `agent_commissions` row gets `paymentEligibleDate`/`status` fields set the same way as automatic creation, but **actual batch/cycle assignment into `commission_ledger`/`commission_payout_batches` is a separate manual step** (`buildDraftPayoutBatches`), identical to the automatic path (this part is consistent — both paths defer batching the same way).
- **Can it generate duplicates?** Protected by the same check-then-insert `SELECT agent_commissions WHERE member_id=X` guard used everywhere else — same race-condition caveat as §2.3 applies (no unique DB constraint).
- **Bypasses normal commission logic?** No for the `PUT /api/admin/payments/:id/status` path (uses WP-03 engine) — **but YES** for `/api/admin/members/:id/create-commission` and `/api/admin/commissions/repair`, which use the plain `calculateCommission()` and create a single direct-only row, silently skipping override fan-out to any upline. This is a **real inconsistency**: a member manually repaired via the "repair" tool will never generate upline override commissions, while one repaired via "update payment status" will.

**Scenario check against §12 acceptance criteria (Aug 15 EPX success / Aug 16 admin verification):**
- Original EPX transaction timestamp preserved separately: **FAIL** (no such field).
- Platform verification timestamp recorded distinctly: **partial PASS** (`manualStatusUpdate.updatedAt` exists, but is not semantically distinguished as "platform_verified_at" vs. "payment_transaction_at").
- Verification method = Manual recorded: **PASS** (implicit, via presence of `manualStatusUpdate` block; no explicit `verification_method` enum).
- Admin who verified recorded: **PASS**.
- Member becomes Active: **PASS**.
- Exactly one writing commission + one valid override set: **PASS** (WP-03 engine + existence check), *modulo the race-condition caveat*.
- If EPX later sends original callback → no duplicate: **PASS** — callback path also checks `agent_commissions` existence before creating; also has a separate "callback already processed" short-circuit keyed on `payments.status==succeeded && hostedCallback.updatedAt` for the *payment* record itself.
- If admin verifies twice → no duplicate: **PASS** — second call finds existing commission and skips (only re-attaches lineage snapshot).

**Overall: PASS on functional duplicate-prevention, FAIL on distinguishing EPX-processed-time vs. platform-verified-time (the core ask of §8/§12).**

---

## 13. Payment Idempotency — Risk Rating

| Scenario | Outcome today | Risk |
|---|---|---|
| EPX callback arrives twice | Guarded — `callbackAlreadyProcessed` short-circuit on `payments.status==succeeded` + existing `hostedCallback.updatedAt`. Returns `noOp:true`. | LOW |
| EPX webhook retries (network retry, different body) | Same guard applies if it resolves to the same payment row by `transactionId`/`orderNumber`. If EPX changes the transaction reference on retry, guard could miss — **not verified against real EPX retry semantics**. | MEDIUM |
| User refreshes success page | `/api/epx/hosted/complete` has an explicit idempotent no-op when payment already `succeeded` and no new token supplied. | LOW |
| Admin manually verifies after automatic success | Blocked from creating duplicate commission by the pre-insert existence check; payment status update itself is a no-op semantically (already `succeeded`). | LOW–MEDIUM (race window still exists) |
| Admin manually verifies twice | Second call finds existing commission, skips insert. | LOW |
| Manual verification first, webhook arrives later | Manual path creates commission; webhook path finds it and skips — but webhook's own "duplicate callback" check is keyed to **payment status**, not commission existence, so it still runs the full activation logic again (idempotent because commission-existence check catches it, but redundant side effects — e.g., duplicate `admin_notifications` "payment_succeeded" entries, duplicate BRIC-token upserts). | MEDIUM |
| Two concurrent processes handle the same event simultaneously | **No DB-level unique constraint** on `agent_commissions(member_id, payment_id)` or similar; protection is application-level SELECT-then-INSERT. A true race (two requests within the same DB round-trip window) **can** produce duplicate commission rows. | **HIGH** |

**Overall duplicate-commission risk rating: MEDIUM–HIGH.** Functional/business-logic duplicate guards exist and are mostly effective for realistic sequential scenarios, but there is **no database-level idempotency key** (e.g., unique constraint on `(member_id, subscription_id, commission_type, override_for_agent_id)` or on a stored `epx_transaction_id`), so true concurrent-request races are not structurally prevented — only reduced by the ordering of typical operational flows.

---

## 14/15. Failed Payment & Recurring Payment Flow

- **Failed payment:** Declined callbacks persist `payments.status='failed'` with rich decline metadata (`declineReason/declineCode/failureCategory/retryable`), create an `admin_notifications` "payment_failed" record. **No commission or override created** — confirmed, matches expected behavior. Member remains `pending_payment`.
- **Retry:** Explicit retry endpoint (`/api/admin/epx/hosted/retry-payment/:paymentId`, admin-only) with guards: only allowed for `failed`/`cancelled` originals classified `retryable`, blocks if a retry already exists in-flight, blocks if the member already has a newer successful payment. A successful retry goes through the normal callback/complete path and creates exactly one commission set (protected by the same existence check).
- **Recurring billing:** Separate scheduler ([server/services/recurring-billing-scheduler.ts](server/services/recurring-billing-scheduler.ts)) uses `recurring_billing_log` with `RECURRING_BILLING_IDEMPOTENCY_STATUSES` (`success/pending/ach_test_success`) to prevent double-charging a subscription in the same cycle — this table-level idempotency check is **the one place in the codebase with an actual "has this billing period already been attempted" guard tied to a distinct log table**, stronger than the enrollment-commission guard. Recurring successful payments **do** create `commission_payouts` rows via `createPayoutsForMemberPayment`/`createMonthlyPayout` (checked by `commission_id + payout_month` uniqueness query before insert) — this is a **decent** idempotency pattern, though still check-then-insert rather than a DB unique constraint.

---

## 16/17. Follow the Money — Forward and Backward Traceability

**Forward (one successful transaction):**

```
EPX Transaction (transaction_id / epx_auth_guid)
  → payments row (member_id FK)
    → members row (enrolledByAgentId FK → users)
      → agent_commissions row(s) (member_id FK [text, not real FK], subscription_id FK,
                                    lineage_snapshot_id FK → agent_lineage_snapshots,
                                    commission_type: direct | override,
                                    override_for_agent_id FK → users)
        → commission_ledger row(s) (source_commission_id FK → agent_commissions.id
                                      [populated only via syncCommissionLedgerFromFeed, a
                                       separate manual/scheduled step])
          → commission_payout_batches (payout_batch_id FK)
            → (export/paid) — no further downstream "disbursement" table found;
              batch export produces a CSV (QuickBooks/Hexona format) — the actual bank
              disbursement is external and not modeled in the DB.
```

**Breaks found in this chain:**
1. `agent_commissions.member_id` is stored as **TEXT**, not an integer FK to `members.id` — works via convention (`.toString()`) but is **not database-enforced referential integrity**. A typo or type mismatch would silently orphan a commission.
2. `commission_ledger.source_commission_id` is only populated by the `syncCommissionLedgerFromFeed` step — until that runs, a fresh `agent_commissions` row has **no** ledger representation, meaning "follow the money forward" from EPX transaction to ledger/batch is **not automatic** and depends on an admin-triggered sync.
3. There is no `epx_transaction_id` column stored directly on `agent_commissions` or `commission_ledger` — to trace a commission back to its exact EPX transaction, one must join `agent_commissions.member_id` → `payments.member_id` and pick the "right" payment by proximity/date, since `payments` can have multiple rows per member (retries, recurring charges) and there's no direct `payment_id` FK on `agent_commissions`. **This is a genuine traceability gap** — flagged per §17 as it prevents a clean, unambiguous answer to "why was this exact dollar paid?" without manual/heuristic date-matching.

**Backward (Commission → EPX payment):** Achievable only by: `agent_commissions.member_id` → look up member's `payments` rows → manually pick the payment whose timestamp/amount is closest to the commission's `enrollmentDate`. **Not a direct foreign key** — flag as **HIGH** per the audit's own escalation rule ("if the answer cannot be reconstructed, flag it as HIGH or CRITICAL"). It CAN be reconstructed, but only via inference/heuristics, not a guaranteed join.

**Override backward-trace:** `agent_commissions` rows of `commission_type='override'` carry `override_for_agent_id` (which downline writing agent generated it) and `lineage_snapshot_id` (frozen upline chain at time of payment, in `agent_lineage_snapshots.lineage_path` JSON) — this part is **well-designed and traceable**, addressing the "historical financial rights must not silently change" requirement in §22.

**Payout backward-trace:** `commission_payout_batches` ← `commission_ledger.payout_batch_id` ← `commission_ledger.source_commission_id` ← `agent_commissions.id`. Traceable **once** the ledger-sync step has run; before that, a payout batch cannot include a not-yet-synced commission at all (by construction), so no data loss, but a manual sync dependency exists in the pipeline.

---

## 18. Database Inventory (key tables)

| Table | PK | Key FKs | Money cols | Status col | Notes |
|---|---|---|---|---|---|
| `members` | `id` (int) | `enrolledByAgentId→users`, `planId→plans` | `totalMonthlyPrice` | `status` | Source-of-truth for member/membership state |
| `subscriptions` | `id` (int) | `memberId→members`, `planId→plans` | `amount` | `status`, `pendingReason` | Billing cycle record |
| `payments` | `id` (int) | `memberId→members`, `subscriptionId→subscriptions` (loosely) | `amount` | `status` | `transactionId` UNIQUE; `epxAuthGuid` |
| `agent_commissions` | `id` (uuid) | `agentId→users`, `memberId` (**TEXT, not real FK**), `subscriptionId→subscriptions`, `overrideForAgentId→users`, `lineageSnapshotId` | `commissionAmount`, `basePremium` | `status`, `paymentStatus` | No unique constraint preventing duplicate rows per member/payment |
| `commission_ledger` | `id` | `source_commission_id→agent_commissions`, `payout_batch_id→commission_payout_batches`, `lineage_snapshot_id` | `commission_amount` | `status` (`earned/queued/paid/held/reversed/carry_forward`) | Mutated in place on transitions; append-only *events* table is separate |
| `commission_ledger_events` | — | `ledger_id→commission_ledger` | — | `from_status/to_status` | **Genuinely immutable/append-only audit trail** |
| `commission_payout_batches` | `id` | — | `total_amount` | `status` (`draft/ready/exported/paid`) | `batch_type`, `cutoff_date`, `scheduled_pay_date` |
| `commission_payouts` (legacy/group) | `id` (serial) | `commissionId→agent_commissions`, `memberPaymentId→payments` | `payoutAmount` | `status` (`pending/paid/cancelled/ineligible`) | Used by group flow and `commission-payout-service.ts`; **parallel/competing** payout representation to `commission_ledger` |
| `agent_lineage_snapshots` | `id` | `member_id`, `payment_id` | — | — | Unique on `(member_id, payment_id)` — good idempotency example |
| `payment_tokens` | `id` | `memberId→members` | — | `isActive` | BRIC token storage, unique `bricToken` |
| `recurring_billing_log` | `id` | `subscriptionId`, `memberId`, `paymentTokenId`, `paymentId` | `amount` | `status` | Has the strongest per-cycle idempotency pattern in the system |

**A. Immutable ledger entries:** `commission_ledger_events`, `agent_lineage_snapshots` (append/upsert-by-unique-key).
**B. Mutable running totals:** `commission_ledger.status`/`payout_batch_id` (mutated in place, not versioned), `commission_payout_batches.total_amount` (recalculated/overwritten), `agent_commissions.status/paymentStatus` (mutated in place).
**C. Both:** the system as a whole is a **hybrid** — mutable "current state" rows (`agent_commissions`, `commission_ledger`) paired with an append-only *event log* for the ledger only. **`agent_commissions` itself has no append-only event trail** — if its `status`/`paymentStatus` are changed, there's no historical record of the prior value outside of ad-hoc `notes` text fields. **Flag: `agent_commissions` mutable-status changes are not independently audited** (unlike `commission_ledger`, which has `commission_ledger_events`).

---

## 19. Duplicate/Overlapping Business Logic (API map excerpt)

Endpoints found with **overlapping responsibility** for commission creation:
1. `POST /api/epx/hosted/callback` (auto)
2. `PUT /api/admin/payments/:id/status` (manual, uses WP-03 engine — consistent with #1)
3. `POST /api/admin/members/:id/create-commission` (manual, **different logic** — direct-only, no override fan-out)
4. `POST /api/admin/commissions/repair` (bulk, **same simplified logic as #3**)

**This directly violates the "one shared Payment Confirmed service" model requested in §11.** Today there are effectively **two different commission-generation algorithms** in production: the WP-03 override-flow engine (paths #1–#2) and a legacy direct-only calculator (paths #3–#4), reachable by different admin actions.

---

## 20. Status State Machine — Notable Exceptions

- `members.status='active'` while a related `payments` row is still `pending`/`failed` is **possible** — e.g., `activateMembershipNow` (admin override) sets a member active with no payment check at all. Flagged as an **ambiguous state** per the example in the requirements (`Member=Pending, Payment=Successful` type mismatch — here the inverse also exists: `Member=Active, Payment=not-succeeded`).
- `payments.status` values used in code: `pending`, `processing`, `succeeded`/`success`/`completed` (inconsistently — three synonyms are checked in different places), `failed`, `cancelled`, `refunded` (declared in schema, no code path found that sets it). This **naming inconsistency** (`succeeded` vs `success` vs `completed`) increases the chance that a status check in one code path misses a status set by another.
- `commission_ledger.status='held'` (from cancellation) has no automatic "un-hold" path found other than the admin `adminOverrideCarryForwardForBatch` — a held row could remain held indefinitely unless an admin acts.

---

## 21/22. Commission/Override Creation — Snapshot vs. Recalculation

- **Commission amount is snapshotted at creation time** (`commissionResult.commission` computed once from `commissionCalculator.ts` rate table + plan/coverage at the moment of payment success) and stored as a static `commission_amount` — **not recalculated later** even if the underlying `commissionCalculator.ts` rates change afterward. This is correct/expected behavior for financial integrity.
- **Hierarchy is frozen at payment time** via `agent_lineage_snapshots.lineage_path` (JSON array of `{userId, agentNumber, role, isActive, depth}` at time of payment) and `lineage_snapshot_id` FK on both `agent_commissions` and `commission_ledger`. Confirmed: this correctly satisfies "historical financial rights must not silently change because an agent later changes hierarchy" — **this is one of the better-designed parts of the system.**
- **Caveat:** the *manual* commission-repair paths (§19 items 3–4) do **not** call the lineage-snapshot/override-flow engine at all — a commission created via `/api/admin/commissions/repair` has **no override fan-out and no lineage snapshot**, meaning upline agents for that member permanently lose override commissions unless someone notices and manually creates override rows separately.

---

## 23–27. Payout Rules vs. Approved Business Rules — Summary of Findings

| Rule | Approved | Current Implementation | Verdict |
|---|---|---|---|
| Writing commission effective dates | 1st & 15th, twice monthly | Uses enrollment date + Monday–Sunday-week logic, NOT the 1st/15th anchor, for **payout-date eligibility** (`calculatePaymentEligibleDate`) | **MISMATCH** |
| Writing payout date | First Friday strictly after effective date; next Friday if effective date is itself Friday | See §9 — 4/7 test cases fail | **FAIL** |
| Writing holiday rule | Move to preceding business day if scheduled Friday is a Fed holiday | **Not implemented anywhere** in `commission-payment-calculator.ts` or `commission-ledger-service.ts` (only `membership-dates.ts`, used for billing anchors, has holiday logic) | **NOT IMPLEMENTED** |
| Writing minimum payout | $25, carries forward | Implemented (`MIN_AGENT_PAYOUT_THRESHOLD`), applies to `commission_ledger` batches (1st-cycle/15th-cycle) | **PASS** (for the ledger-batch path; the `commission_payouts`/group path has no equivalent $25 gate — see below) |
| Override cadence | Monthly, paid in arrears | `getCycleAnchorForEntry` groups by month, correctly implements "arrears" (payout = first Friday of *following* month) | **PASS** |
| Override payout date | First Friday of following month | See §10 — 2/3 pass | **PASS except holidays** |
| Override minimum payout | $25, carries forward | Same `MIN_AGENT_PAYOUT_THRESHOLD` mechanism | **PASS** |
| Override holiday rule | Move forward to next business day (stays in arrears) | **Not implemented** | **NOT IMPLEMENTED** |
| Writing/override balances kept separate | Required | Achieved via `batch_type` segregation, not an explicit separate-ledger-per-type design, but functionally correct today | **PASS (fragile)** |

**Note on the parallel `commission_payouts` table** (used by `commission-payout-service.ts` for individual/group recurring payouts): this path has **no $25 threshold logic at all** — `createMonthlyPayout` inserts a payout for any positive amount and marks it `pending`/`ineligible` purely based on `calculatePaymentEligibleDate` (itself already shown to be non-compliant), with **no carry-forward concept**. This is a **second, materially different payout-rules implementation** running in parallel with the `commission_ledger` batch system — reinforcing the "duplicated business logic" concern from §1/§19.

---

## 28. Refunds, Reversals, Cancellations

- **Cancellation** (`applyCancellationToLedger`): checks a configurable `REFUND_WINDOW_DAYS` (default 14) from `membership_start_date`. If within window: holds all unpaid ledger rows (`status→held`, detached from any batch, fully audited via `commission_ledger_events`) and, if requested, creates explicit **negative reversal rows** for already-paid commissions (never edits the original paid row's amount). If outside window: **no adjustment at all** (documented as "no clawback policy" outside 14 days) — this matches "financial history should be auditable... flag destructive mutation," and **no destructive mutation was found** — the system correctly uses additive reversal rows rather than editing history.
- **TODO comment found in code** acknowledging an incomplete requirement: refund-window logic currently checks **date only**; a code comment explicitly states service-usage validation (no appointments/consultations used) is **not yet implemented**, meaning a member could cancel within 14 days after having already used services and still get a "clean" hold with no reversal — a **business-logic gap**, not a data-integrity one.
- **Failed recurring payment:** logged in `recurring_billing_log` with a failure reason and retry scheduling; does not itself touch `agent_commissions`/`commission_ledger` (correct — no commission should exist for a failed charge).

---

## 29/30. Admin & Agent Reporting

- Admin has dedicated reconciliation endpoints (`/api/admin/reconciliation/missing-payments`, `/missing-tokens`, `/dashboard`) that surface members with `total_monthly_price > 0` but zero `payments` rows, and revenue-gap totals — this is a **useful existing self-check** the audit should note as a positive control, though it only detects the *"payment never got created at all"* case, not the *"EPX succeeded but MPP shows pending"* case explicitly asked about in §9.
- Agent/admin commission dashboards ([client/src/pages/agent-commissions.tsx](client/src/pages/agent-commissions.tsx), [client/src/pages/admin-commissions.tsx](client/src/pages/admin-commissions.tsx)) read from `commission_ledger`/`commission_payout_batches` (the newer, better-audited system) for balance/status/carry-forward/payout-date display — **not** from the older `commission_payouts` table, which is good, but means the two payout mechanisms can show **different numbers** for the same member depending on which enrollment path (individual direct EPX vs. group vs. recurring) created the record, since not all of them flow through the same ledger-sync step.
- **Reports that cannot be independently reconciled:** any commission created via the two "manual repair" endpoints (§19 items 3–4) will show up in `agent_commissions` but, until someone runs `syncCommissionLedgerFromFeed`, will **not** appear in the `commission_ledger`-based dashboards at all — an admin/agent viewing the ledger-based report would see an **undercount** relative to raw `agent_commissions` totals.

---

## 30. Highest-Priority Findings (Ranked)

1. **CRITICAL/HIGH — No unified "Payment Confirmed" service.** At least 4 distinct code paths can create commissions, 2 of which use a materially different (non-override-aware) calculation. Recommend consolidating into one function callable from all triggers (matches the architecture the business already wants per §11 — and groups already have a working example of this pattern to model from).
2. **HIGH — Writing-commission payout-date formula does not match the documented business rule** (4/7 acceptance tests fail). This affects real payout scheduling accuracy today.
3. **HIGH — No Federal Reserve holiday awareness in commission/override payout-date calculation**, despite a full holiday calendar already existing and working correctly for billing-anchor dates elsewhere in the codebase.
4. **HIGH — No distinction between "EPX processed the transaction" and "platform recognized/verified it."** Directly blocks accurately auditing the manual-recovery scenario described in the requirements (§8/§12).
5. **HIGH — No scheduled reconciliation job for "EPX succeeded but MPP still Pending."** The system relies entirely on the callback/complete handlers firing; if both are missed (closed browser + lost server callback), there is no safety net beyond an admin noticing manually.
6. **HIGH — `agent_commissions.member_id` is TEXT, not an enforced FK; no direct `payment_id` FK on commissions**, making exact "why was this dollar paid" traceability inference-based rather than guaranteed.
7. **MEDIUM–HIGH — No DB-level idempotency constraint** for commission creation; protection is entirely check-then-insert application logic, vulnerable to true concurrent-request races.
8. **MEDIUM — Two parallel, inconsistent payout-rule implementations** (`commission_ledger` batch system vs. `commission_payouts`/`commission-payout-service.ts`), with only one of them implementing the $25 threshold/carry-forward rule.
9. **MEDIUM — Refund-window logic checks dates only**; service-usage validation is an acknowledged TODO in the code.
10. **LOW–MEDIUM — Status value inconsistency** (`succeeded`/`success`/`completed` used interchangeably across files) increases the chance of a status check silently failing to match.

---

## What Was NOT Changed

Per instructions, this audit made **zero** modifications to application code, schema, or data. Two temporary standalone verification scripts were created under `scripts/` purely to execute the existing date-calculation logic in isolation (copy-pasted, not imported into the app) for acceptance testing in §9/§10, then **deleted** immediately after producing the PASS/FAIL results recorded above — no trace of them remains in the repository.
