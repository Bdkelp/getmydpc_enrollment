# Recurring Billing Scheduler — Corrected Pre-Implementation Design

**Document Status**: PRE-IMPLEMENTATION DESIGN ONLY — No code, no pseudocode, no SQL, no implementation snippets  
**Last Updated**: March 18, 2026  
**Prerequisite**: PRE_IMPLEMENTATION_VERIFICATION.md (all codebase facts verified from source)

---

# SECTION 1 — Corrected ACH Transaction Mapping

## 1.1 Why ACH Cannot Be Flattened Into CKC2

The original design treated all ACH recurring as a single transaction type (CKC2). This is incorrect. EPX defines distinct transaction types based on **account type** (checking vs savings) and **operation** (debit, credit/refund, void, BRIC storage). Sending the wrong type causes EPX rejection and violates NACHA rules requiring transaction type to match the underlying account.

## 1.2 Complete ACH Transaction Type Matrix

| Type | Account | Operation | When Used |
|------|---------|-----------|-----------|
| **CKC2** | Checking | Debit | Recurring charge against a checking account |
| **CKS2** | Savings | Debit | Recurring charge against a savings account |
| **CKC3** | Checking | Credit / Refund | Refund returned to a checking account |
| **CKS3** | Savings | Credit / Refund | Refund returned to a savings account |
| **CKCX** | Checking | Void | Cancel a checking debit before settlement |
| **CKSX** | Savings | Void | Cancel a savings debit before settlement |
| **CKC8** | Checking | BRIC Storage | Store checking token for indefinite reuse (if applicable) |
| **CKS8** | Savings | BRIC Storage | Store savings token for indefinite reuse (if applicable) |

## 1.3 Current Codebase Gap — VERIFIED

The existing helper function `submitServerPostRecurringPayment()` determines ACH status using:

```
isACHTransaction = networkTranType.startsWith('CKC')
```

**Problem**: This check matches CKC2, CKC3, CKC7, CKC8, CKC9, CKCX — but does **not** match any CKS (savings) type. Savings account ACH transactions would be classified as non-ACH by this logic.

**VERIFIED**: The current helper cannot process savings-account ACH transactions (CKS2, CKS3, CKSX, CKS8) without modification.

**Design Requirement**: The scheduler must select the correct transaction type based on account type stored in the token record. The helper's ACH detection logic must be corrected to recognize both CKC and CKS prefixes before ACH scheduler implementation begins.

## 1.4 Account Type Dependency

The scheduler must know whether a stored ACH token represents a checking or savings account. This determines CKC vs CKS selection for every operation (debit, refund, void, storage).

**VERIFIED**: The `payment_tokens` table stores `account_type` when bank account data is provided during enrollment. The webhook callback handler passes `accountType` from EPX response into token storage.

**NOT VERIFIED**: Whether all existing ACH tokens in production have `account_type` populated. If any tokens lack this field, the scheduler cannot determine the correct transaction type for those records.

---

# SECTION 2 — BRIC/GUID-Based ACH Usage Verification

## 2.1 What Is VERIFIED From the Current Codebase

- `payment_tokens` table stores BRIC tokens (`bric_token` field, AES-256-CBC encrypted) for both CARD and ACH, distinguished by `token_type` column.
- `submitServerPostRecurringPayment()` accepts `authGuid` (required) and `bankAccountData` (optional).
- For credit card recurring (CCE1): the function sends `ORIG_AUTH_GUID` with `CARD_ENT_METH=Z` and does **not** require card data on each charge. BRIC/GUID-only card recurring works.
- For ACH (CKC-prefixed): the function **requires** `bankAccountData`. If `isACHTransaction` is true and `bankAccountData` is not provided, the function **throws an error**: `"Bank account data is required for ACH transactions (CKC2, CKC7, CKC9)."`
- When `bankAccountData` is provided for ACH, the function sends `ROUTING_NBR`, `ACCOUNT_NBR`, `RECV_NAME`, `ACCOUNT_TYPE` fields and **deletes** `CARD_ENT_METH` from the request.

**VERIFIED**: The current helper assumes raw bank account data is required on every ACH charge. It does not support BRIC/GUID-only ACH recurring.

## 2.2 What Is VERIFIED From EPX Documentation

- EPX BRIC tokens generated from financial transactions (including ACH enrollment) can be reused via `ORIG_AUTH_GUID`.
- EPX documentation describes `CARD_ENT_METH=Z` as the entry method indicating a stored credential / token-based transaction.
- The EPX PayByBank / ACH API documentation describes BRIC-based ACH recurring where the original authorization GUID is referenced for subsequent charges.

**VERIFIED**: EPX documentation supports the concept of BRIC/GUID-based ACH recurring using `ORIG_AUTH_GUID` without resending raw bank account data on every charge.

## 2.3 Design Mismatch Identified

There is a direct conflict between the current helper implementation and EPX documentation:

| Aspect | Current Helper Behavior | EPX Documentation |
|--------|------------------------|-------------------|
| ACH recurring with stored token | Throws error if `bankAccountData` missing | Supports `ORIG_AUTH_GUID` with stored BRIC |
| `CARD_ENT_METH` for ACH | Deleted from request when bank data present | `CARD_ENT_METH=Z` may be valid for stored ACH |
| Required ACH fields | `ROUTING_NBR`, `ACCOUNT_NBR`, `RECV_NAME`, `ACCOUNT_TYPE` on every charge | May not be required when using stored BRIC |

**NOT VERIFIED**: Whether EPX will accept an ACH recurring charge using only `ORIG_AUTH_GUID` + `CARD_ENT_METH=Z` (no raw bank data) in the specific EPX environment configured for this platform. This must be tested or confirmed with EPX support before implementation.

## 2.4 Implications for Scheduler Design

If BRIC/GUID-only ACH recurring is confirmed valid:
- The helper's mandatory `bankAccountData` check for ACH must be relaxed.
- The scheduler can treat ACH tokens the same as card tokens (decrypt BRIC, send GUID, no raw data).
- `CARD_ENT_METH` handling must be revisited — it may need to remain as `Z` for stored ACH.

If raw bank data is truly required on every ACH charge:
- The scheduler must decrypt and pass full bank account details on every recurring charge.
- This increases the security surface (sensitive data in memory during each billing cycle).
- Token storage must guarantee `routingNumber`, `accountNumber`, `accountHolderName`, and `accountType` are all recoverable from encrypted storage.

**BLOCKER**: This mismatch must be resolved before ACH scheduler implementation begins. The helper's ACH path may need correction, or the scheduler must work within the current constraint.

---

# SECTION 3 — ACH Token Lifetime and Storage Risk

## 3.1 EPX BRIC Token Default Lifetime

**VERIFIED from EPX documentation**: BRIC tokens generated from financial transactions are accessible for **13 months** by default. After 13 months, the token may no longer be valid for subsequent charges unless extended retention is configured.

## 3.2 BRIC Storage for Indefinite Retention

EPX offers a **BRIC Storage** transaction (CKC8/CKS8 for ACH, CCE8 for card) that explicitly stores payment credentials for indefinite reuse. This is a separate transaction type submitted to EPX — it is not automatic.

**NOT VERIFIED**: Whether the DPC platform has ever submitted BRIC Storage transactions (CKC8/CKS8/CCE8). If BRIC Storage has not been used, all existing tokens are subject to the 13-month default window.

## 3.3 Current Token Lifetime Status

**NOT VERIFIED**: Whether existing ACH tokens in `payment_tokens` are financial-transaction BRICs (13-month default) or BRIC Storage tokens (indefinite). The `payment_tokens` table does not appear to store a `bric_type` or `storage_method` field that would distinguish between these two categories.

**NOT VERIFIED**: Whether the EPX environment configured for this platform has a custom BRIC retention policy that differs from the documented 13-month default.

## 3.4 Operational Risk

If the platform relies on ACH BRICs beyond the 13-month access window:

1. **Silent charge failure**: Scheduler attempts recurring charge with expired BRIC. EPX returns an error. Member's subscription lapses without warning.
2. **No proactive detection**: Without tracking token creation date or BRIC type, the scheduler cannot predict which tokens are approaching expiration.
3. **Recovery burden**: Members with expired tokens must re-enroll their bank account. There is no automated re-tokenization path for ACH (unlike card tokens which can sometimes be updated via network token services).
4. **Scale risk**: If many members enrolled around the same time, a wave of token expirations could cause mass billing failures simultaneously.

## 3.5 What Must Be Confirmed Before Implementation

- Is the platform using BRIC Storage (indefinite) or relying on financial-transaction BRICs (13-month default)?
- If 13-month default: Does `payment_tokens` store `created_at` or `enrolled_at` to allow proactive age checking?
- Does EPX return a specific error code when a BRIC has expired due to age? If so, what code?
- Is there a business process for notifying members to re-authorize when tokens approach the 13-month boundary?

---

# SECTION 4 — SEC Code Decision Framework

## 4.1 Why SEC Codes Matter for ACH

Every ACH transaction submitted through NACHA requires a Standard Entry Classification (SEC) code that describes the legal basis for the debit authorization. Submitting the wrong SEC code is a compliance violation, not merely a technical error. NACHA and receiving banks can reject or return transactions with incorrect SEC codes.

## 4.2 Applicable SEC Codes

| SEC Code | Name | Applies When |
|----------|------|-------------|
| **PPD** | Prearranged Payment & Deposit | Consumer has provided written/signed authorization for recurring debits (paper form, in-person) |
| **WEB** | Internet-Initiated Entry | Consumer authorized recurring debits via internet/web channel (online enrollment form) |
| **CCD** | Cash Concentration or Disbursement | Business/corporate account holder authorized debits (employer group enrollment, B2B) |

## 4.3 DPC Platform Considerations

- If members enroll online through the web application and authorize ACH recurring via the enrollment form, **WEB** is likely the correct SEC code for consumer enrollments.
- If members enroll via paper forms or in-person authorization captured outside the web flow, **PPD** may apply.
- If the platform supports employer/group enrollment where a business entity authorizes ACH debits on behalf of employees, **CCD** applies to those transactions.
- A single platform may need to support multiple SEC codes if it serves both consumer and business enrollment channels.

## 4.4 Current State

**NOT VERIFIED**: Which SEC code the platform currently sends (if any) during ACH enrollment or initial charge. The `submitServerPostRecurringPayment()` function does not appear to accept or send a SEC code field in its current interface.

**NOT VERIFIED**: Whether EPX requires explicit SEC code in the Server Post request, infers it from the merchant configuration, or derives it from the original enrollment transaction.

## 4.5 Design Requirement

SEC code selection is a **compliance and business confirmation item**, not an engineering decision. The scheduler design must accommodate SEC code per transaction, but the actual value must be confirmed by:

1. Reviewing the DPC enrollment authorization language (does it satisfy PPD, WEB, or both?).
2. Confirming with EPX whether SEC code is passed explicitly or inherited from enrollment.
3. Determining whether group/employer enrollments exist and require CCD.
4. Documenting the confirmation for audit trail purposes.

**BLOCKER**: If SEC code is required in the recurring charge request and the platform has no mechanism to determine or store it, this must be resolved before ACH scheduler implementation.

---

# SECTION 5 — ACH Retry / Failure Classification Framework

## 5.1 Why ACH Retry Cannot Mirror Card Retry

Credit card transactions resolve in real time: the issuing bank approves or declines within seconds, and the response is definitive. Retry logic for cards can operate on short intervals (minutes to hours) with exponential backoff.

ACH transactions resolve across **multiple phases over multiple days**. A charge that EPX accepts at submission time can still fail during settlement (T+1 to T+2) or return from the receiving bank (T+1 to T+5). Blindly applying card retry timing to ACH would cause the scheduler to retry charges that are still in-flight at the settlement layer.

## 5.2 Category 1 — Immediate Retryable Failures

These are errors returned by EPX at submission time that indicate a transient problem unlikely to persist:

- EPX service timeout or temporary unavailability
- Network-level errors (connection reset, DNS failure)
- EPX rate limiting or throttling responses
- Transient server errors (HTTP 5xx from EPX)

**Retry posture**: May retry after a reasonable delay. Standard backoff applies. These failures are about the submission channel, not the bank account.

**NOT VERIFIED**: The exact EPX error codes or HTTP status codes that correspond to transient failures. Must be mapped from EPX error documentation before retry logic is finalized.

## 5.3 Category 2 — Immediate Non-Retryable Failures

These are errors returned by EPX at submission time that indicate a permanent or authorization-level problem:

- BRIC token invalid, expired, or not found
- Authorization revoked or not on file
- Account type mismatch (CKC sent for savings account)
- Merchant account configuration error
- Invalid transaction type for the account

**Retry posture**: Do not retry. Mark the token or subscription for manual intervention. Retrying will produce the same error.

**NOT VERIFIED**: The exact EPX error codes that map to these permanent failures. The helper currently checks `AUTH_RESP === '00'` for success but does not classify specific decline codes.

## 5.4 Category 3 — Deferred Settlement / Return Outcomes

These are failures discovered **after** EPX accepted the transaction at submission time. The charge was submitted successfully, but the receiving bank rejected it during NACHA settlement processing. Notification arrives via webhook callback, typically T+1 to T+5 after submission.

### Non-Retryable ACH Returns

| Return Code | Meaning | Action |
|-------------|---------|--------|
| R02 | Account closed | Invalidate token, notify member |
| R03 | No account / unable to locate | Invalidate token, notify member |
| R04 | Invalid account number | Invalidate token, notify member |
| R08 | Payment stopped | Invalidate token, notify member |
| R10 | Customer advises not authorized | Invalidate token, treat as revocation |
| R13 | Invalid ACH routing number | Invalidate token, notify member |
| R16 | Account frozen | Invalidate token, notify member |
| R20 | Non-transaction account | Invalidate token, notify member |
| R29 | Corporate customer advises not authorized | Invalidate token (CCD only) |

### Potentially Retryable ACH Returns

| Return Code | Meaning | Retry Consideration |
|-------------|---------|-------------------|
| R01 | Insufficient funds | May succeed on a future billing cycle; do not retry immediately |
| R09 | Uncollected funds | Similar to R01; funds may become available |

### Escalation Returns (Manual Review Required)

| Return Code | Meaning | Action |
|-------------|---------|--------|
| R05 | Unauthorized debit to consumer account | Investigate SEC code correctness |
| R07 | Authorization revoked by customer | Confirm revocation, invalidate if confirmed |
| R11 | Check truncation entry return | Rare; requires EPX support inquiry |
| R14-R15 | Representative payee issues | Member communication required |

**NOT VERIFIED**: Whether the current webhook handler at `/api/epx/hosted/callback` receives ACH return codes in a parseable field. If the webhook does not currently distinguish ACH return codes from standard payment responses, it cannot classify returns correctly.

**NOT VERIFIED**: The exact field name in the EPX callback payload that carries the ACH return code (R01-R29). This must be confirmed before return-handling logic can be designed.

## 5.5 ACH Retry Timing Constraints

- **T+0**: Charge submitted to EPX. Immediate response received (approved or declined).
- **T+1 to T+2**: NACHA settlement processing in progress. The charge is in-flight. Do not retry or resubmit during this window — the original charge has not yet resolved.
- **T+2 to T+5**: Return notification window. If the bank rejects, the return code arrives via webhook during this period.
- **T+5 onward**: Settlement is complete. If no return was received, the charge is considered successful. If a return was received, retry (for retryable codes only) may be attempted.

**Design constraint**: ACH retry intervals must respect the settlement window. A charge that was accepted by EPX but is still settling must not be retried. The scheduler must track submission timestamps and enforce minimum wait periods before re-attempting.

**NOT VERIFIED**: The exact settlement and return timing for the EPX + NACHA configuration used by this platform. The T+2 to T+5 window is a general industry range; actual timing may vary by bank and EPX processing schedule. Must be confirmed before retry intervals are locked in.

---

# SECTION 6 — Updated Unified Scheduler Architecture Summary

## 6.1 Single Scheduler Service

One scheduler service handles both credit card and ACH recurring billing. There is no separate ACH scheduler. The scheduler runs on a configurable interval, gated by an environment flag (`BILLING_SCHEDULER_ENABLED`).

## 6.2 Source of Truth

- **What to bill**: `subscriptions` table, filtered by `status='active'` and `next_billing_date <= NOW`.
- **How to bill**: `payment_tokens` table, joined by member ID. The `token_type` column (CARD or ACH) determines the billing path.

`billing_schedule` table is not used. It is unused infrastructure (verified in PRE_IMPLEMENTATION_VERIFICATION.md).

## 6.3 Payment Method Branching

The scheduler branches **once, early** based on `payment_tokens.token_type`:

**CARD path**:
- Transaction type: CCE1
- Token usage: BRIC/GUID only (`ORIG_AUTH_GUID` + `CARD_ENT_METH=Z`)
- Retry model: Real-time decline → immediate retry with backoff
- No SEC code required

**ACH path**:
- Transaction type: CKC2 (checking) or CKS2 (savings), determined by `account_type`
- Token usage: **Must be resolved** — either BRIC/GUID-only or BRIC + raw bank data (see Section 2 mismatch)
- Retry model: Phased — immediate EPX errors vs deferred settlement returns (see Section 5)
- SEC code: Required, must be determined per enrollment (see Section 4)

## 6.4 Existing Components Reused

- **EPX payment service**: `submitServerPostRecurringPayment()` already supports both card (CCE1) and ACH (CKC2). The scheduler calls this function for all charges. **Caveat**: The ACH path in this function must be corrected if BRIC/GUID-only ACH is confirmed valid (see Section 2).
- **Webhook callback handler**: `/api/epx/hosted/callback` already processes payment results and updates subscriptions, creates payment records, and triggers commission payouts. No changes needed for the success path.
- **Token decryption**: Existing `decryptPaymentToken()` handles AES-256-CBC decryption for both token types.
- **Subscription updates**: Existing `updateSubscription()` function handles `nextBillingDate` advancement and status changes.
- **Commission payouts**: Existing commission flow triggers on successful payment capture. No scheduler-specific changes needed.

## 6.5 New Components Required

- **Scheduler service**: Polls for due subscriptions, acquires advisory lock, processes charges, writes log entries. Single-instance coordination via PostgreSQL advisory locks.
- **Recurring billing log table**: Idempotency anchor. Each billing attempt is logged with subscription ID, billing date, attempt number, status, EPX response details, and failure classification. Prevents duplicate charges on scheduler restart or overlap.
- **New subscription status values**: `payment_method_invalid` and `authorization_revoked` for ACH-specific terminal states that require member action.
- **ACH return handling in webhook**: Parsing and classifying ACH return codes (R01-R29) and updating token/subscription status accordingly.

## 6.6 Correction Prerequisite

The ACH payload construction in the existing helper must be verified and potentially corrected before the scheduler can process ACH recurring charges. Specifically:

- The `isACHTransaction` check must recognize both CKC and CKS prefixes.
- The mandatory `bankAccountData` requirement must be reassessed based on whether BRIC/GUID-only ACH is valid.
- `CARD_ENT_METH` handling for stored ACH tokens must be confirmed with EPX documentation.

If these corrections are not made, the scheduler can only safely process **card** recurring charges. ACH recurring must be deferred until the helper is updated.

---

# SECTION 7 — Open Items Requiring Confirmation Before Code

Each item below must be resolved before implementation begins. Items are ordered by dependency — earlier items may unblock later ones.

## 7.1 ACH Transaction Type Mapping in Current Helper

**Question**: Does the current helper correctly support CKS-prefixed transaction types (savings)?  
**Current state**: `isACHTransaction = networkTranType.startsWith('CKC')` — savings types are not recognized.  
**Resolution**: Confirm whether savings accounts exist in production. If yes, the helper must be updated before ACH scheduler work.  
**Status**: VERIFIED as a gap. Correction required if savings accounts are in scope.

## 7.2 BRIC/GUID-Only ACH Recurring Viability

**Question**: Can ACH recurring charges be submitted using only `ORIG_AUTH_GUID` (stored BRIC) without raw bank account data on every charge?  
**Current state**: Helper throws error if ACH is attempted without `bankAccountData`. EPX documentation suggests BRIC-only ACH is supported.  
**Resolution**: Test in EPX sandbox or confirm with EPX support. This determines whether the helper's ACH path needs correction.  
**Status**: NOT VERIFIED. Design mismatch identified (Section 2).

## 7.3 BRIC Token Type and Retention Period

**Question**: Are existing ACH tokens financial-transaction BRICs (13-month default) or BRIC Storage tokens (indefinite)?  
**Current state**: No field in `payment_tokens` distinguishes BRIC type. No BRIC Storage transactions (CKC8/CKS8) have been verified in codebase.  
**Resolution**: Check EPX merchant configuration or contact EPX support. If 13-month default, implement proactive token age monitoring.  
**Status**: NOT VERIFIED.

## 7.4 SEC Code per Enrollment Use Case

**Question**: What SEC code applies to DPC recurring enrollments?  
**Current state**: No SEC code field in `submitServerPostRecurringPayment()` interface. No SEC code stored in `payment_tokens`.  
**Resolution**: Confirm enrollment authorization method (web form = WEB, paper = PPD, business = CCD). Confirm whether EPX requires explicit SEC code or inherits from enrollment.  
**Status**: NOT VERIFIED. Compliance confirmation required.

## 7.5 ACH Return Code Handling in Webhook

**Question**: Does the current webhook handler receive and parse ACH return codes (R01-R29)?  
**Current state**: Webhook processes all callbacks identically regardless of payment type. No R-code parsing has been verified.  
**Resolution**: Review EPX callback payload documentation for ACH-specific fields. Test with EPX sandbox to confirm return code delivery format.  
**Status**: NOT VERIFIED.

## 7.6 ACH Retry Policy and Timing

**Question**: What retry intervals and maximum attempts are appropriate for ACH failures?  
**Current state**: No ACH-specific retry logic exists. Card retry patterns are not applicable to ACH settlement timing.  
**Resolution**: Confirm NACHA retry rules for the applicable SEC code. Confirm business-acceptable delay between failed charge and retry. Confirm maximum retry count.  
**Status**: NOT VERIFIED. Business and compliance approval required.

## 7.7 ACH Non-Retryable Failure Classification

**Question**: Which EPX error codes and ACH return codes should be classified as permanently non-retryable?  
**Current state**: No error code classification exists. The helper only checks `AUTH_RESP === '00'` for success.  
**Resolution**: Obtain EPX error code reference. Map each code to retryable, non-retryable, or escalation category. Confirm with compliance team.  
**Status**: NOT VERIFIED.

## 7.8 Account Type Population in Existing Tokens

**Question**: Do all existing ACH tokens in `payment_tokens` have `account_type` populated?  
**Current state**: The webhook stores `account_type` when provided by EPX during enrollment. Historical tokens may lack this field.  
**Resolution**: Query production `payment_tokens` for ACH tokens with null `account_type`. If any exist, determine remediation strategy.  
**Status**: NOT VERIFIED.

## 7.9 Compliance / Legal Confirmation

**Question**: Are there additional compliance or legal requirements for automated recurring ACH debits?  
**Considerations**: NACHA operating rules, state-specific consumer protection laws, authorization retention requirements, notification-before-debit requirements.  
**Resolution**: Confirm with legal/compliance team before enabling ACH recurring in production.  
**Status**: NOT VERIFIED.

---

## Pre-Implementation Checklist

All items must be checked before any scheduler code is written:

- [ ] 7.1 — Helper ACH detection logic corrected for CKS types (if savings in scope)
- [ ] 7.2 — BRIC/GUID-only ACH recurring confirmed or denied with EPX
- [ ] 7.3 — BRIC token type and retention period confirmed
- [ ] 7.4 — SEC code per use case confirmed (compliance sign-off)
- [ ] 7.5 — Webhook ACH return code handling confirmed
- [ ] 7.6 — ACH retry policy and timing approved
- [ ] 7.7 — EPX error codes mapped to failure classifications
- [ ] 7.8 — Existing ACH token `account_type` population verified
- [ ] 7.9 — Legal/compliance confirmation obtained

**When all items are resolved**: Proceed to implementation phase.

---

**Document Status**: PRE-IMPLEMENTATION DESIGN — NO CODE WRITTEN
