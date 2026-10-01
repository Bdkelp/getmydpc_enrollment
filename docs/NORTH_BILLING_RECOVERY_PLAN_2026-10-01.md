# North Billing Recovery Plan — 2026-10-01

## Objective

Restore normal one-cycle-at-a-time recurring billing for currently active members and groups while reconciling historical payments made directly in North.

Policy approved by ownership:

- Reconcile the past; automate the future.
- Do not automatically collect multiple historical months because the platform failed to bill or record them.
- If September was paid but August was genuinely unpaid, August may be collected after operator review/contact.
- Do not reach farther back merely because older platform dates are stale; older missed months caused by platform failure may be waived.
- Cancelled/non-paying accounts are not to be reactivated through this recovery work.
- No live payment is submitted merely by restoring a credential or reconciling an externally settled month.

## Security rule

This repository is public. Do **not** commit live North Tran ID / BRIC values, card data, bank data, AUTH_GUID values, or other reusable processor credentials. Operators must enter verified North credentials only through an authorized runtime/admin workflow or an untracked local input file. Audit records should record that a credential was restored, not the credential value itself.

## EPX source of truth

Use `docs/vendor/epx/EPX_CERTIFICATION_REFERENCE.md` plus the existing certified implementation.

Current certification covers:

- CCE1 purchase auth/capture
- CCE9 return capture
- CKC2 checking ACH debit, including BRIC-based ACH
- Card-on-File recurring billing
- Server Post
- Hosted Checkout

For recurring billing, North Tran ID / BRIC is the reusable processor credential. `AUTH_CODE` is transaction-result metadata, not an operator input. Application `transaction_id` and durable `processor_reference` are tracking/idempotency fields, not payment credentials.

## Required implementation order

1. Historical-cycle hold guard — completed in PR #23 and merged before credential restoration.
2. Super-admin **Restore credential from North Tran ID / BRIC** action.
3. Billing Ops reconciliation action for externally settled North payments.
4. Restore credentials and reconcile verified current accounts.
5. Resume normal future billing one cycle at a time.

## Credential restore acceptance criteria

The super-admin restore action must:

- identify the member and intended/default payment token;
- accept a verified North Tran ID / BRIC;
- validate with the existing canonical payment-credential resolver;
- reject a credential already assigned to another member;
- store the verified raw BRIC on the payment token;
- update the member's default payment credential only when appropriate;
- write an audit entry without copying the credential into the audit payload;
- never overwrite `payments.transaction_id` or durable `processor_reference`;
- never submit a charge at save time;
- never reactivate a cancelled member automatically.

## Reconciliation acceptance criteria

Billing Ops must be able to record a month as settled externally through North without creating a duplicate charge.

For each verified North payment:

- first match existing platform payment/cycle by member, amount, date and known processor evidence;
- if already represented, do not create another payment record;
- if externally paid but missing from platform, record an externally settled/manual payment and corresponding settled cycle using the existing `External` / `manual_external_owner_confirmed` convention;
- advance `next_billing_date` only through months verified as settled;
- if a historical month appears genuinely unpaid, hold it for operator decision rather than auto-backfilling multiple cycles;
- after reconciliation, only the next legitimate unpaid/current cycle is eligible for normal automatic billing.

## Verified recovery facts from North exports / owner review

The following accounts have recent North payment evidence and are candidates for reconciliation and future billing restoration, subject to current account status checks in production:

- Christian Parra — September payment verified in North.
- Steven Villarreal — September payment verified in North.
- Matthew Booker — September payment verified in North.
- James Howard — September payment verified in North.
- Nelson Baylon — September payments verified in North; reconcile against existing platform cycle history to avoid duplicates.
- Andres Lozano — August/September North payment history exists; verify member-to-amount mapping against platform before reconciliation.
- Oscar Lozano — August/September North payment history exists; verify member-to-amount mapping against platform before reconciliation.
- Darrel Carter — August payment verified in North.
- Brandon Winston — August payment verified in North.
- Victor Medrano — August payment verified in North.
- Isaac/Issac Jasso Jr — June payment verified in North.
- Rodriguez Tire / Leopoldo Rodriguez — group payment history through September exists in North.
- Martinez Associates — ACH payment history through September exists in North; BRIC-based CKC2 is certified.

Known non-targets / operator-review accounts:

- Midas — paid in August, cancelled before September; do not restore/reactivate.
- Daniel Torres — reported cancelled/non-paying; do not restore without explicit status review.
- Latanya Rozier — reported cancelled/non-paying; do not restore without explicit status review.
- Lawerence Harris — historical payment exists, but owner reports later non-payment/cancellation concerns; status review required before any credential restoration or billing.

## Immediate operator rule for historical gaps

If an active account paid September but August is verified unpaid, flag August as the single potential catch-up month for operator/member outreach. Do not automatically reach back to June/July or create a multi-month catch-up sequence.

## Test requirements

Targeted tests must prove:

- credential restore never submits a processor request;
- cross-member credential reuse is rejected;
- cancelled members are not reactivated;
- reconciliation is idempotent;
- an externally settled month cannot be charged again;
- a held historical subscription stays held until reconciled;
- after reconciliation, normal billing resumes only for the next eligible cycle;
- ACH future billing uses the certified BRIC-based CKC2 path without requiring raw routing/account numbers.

## Out of scope for this recovery PR

Do not mix the following into credential restore/reconciliation unless separately approved:

- CKS2 savings behavior;
- CCE7 reversal behavior;
- CKC3/CKS3/CKCX/CKSX behavior;
- broad EPX refactors;
- scheduler redesign;
- unrelated payment UI changes.
