<!-- markdownlint-disable MD029 MD032 -->

# SQL IDENTIFIER ALLOWLIST FIX

Date: 2026-05-18  
Phase: 1B

## Objective

Eliminate SQL identifier injection risk in:

1. server/storage.ts -> updatePayment
2. server/storage.ts -> storage.updateMember

## Safety Notes (EPX / Certification)

- No EPX route handlers were modified.
- No payment processor request/response contract fields were changed in route code.
- The change is confined to SQL update key validation in storage-layer helpers.
- Valid update keys used by existing EPX callback/hosted flows remain supported.

## What Changed

## 1) server/storage.ts -> updatePayment

Changes applied:

- Removed SQL identifier fallback behavior (`fieldMapping[field] || field`).
- Introduced strict allowlist mapping for accepted update keys.
- Added unknown-key rejection before query construction.
- Added empty-valid-update rejection (`No valid payment update fields provided`).
- Preserved value parameterization via positional bind parameters.
- Preserved metadata JSON handling (`::jsonb`).

Validation errors now emitted:

- `Invalid payment update fields: <comma-separated keys>`
- `No valid payment update fields provided`

## 2) server/storage.ts -> storage.updateMember

Changes applied:

- Removed SQL identifier fallback behavior (`columnMapping[key] || key`).
- Introduced strict allowlist mapping for accepted member update keys.
- Added unknown-key rejection before query construction.
- Preserved existing field formatting/normalization behavior for valid keys.
- Preserved value parameterization via positional bind parameters.
- Preserved intentional timestamp alias handling (`updatedAt`, `createdAt`) as allowlisted non-persisted keys.

Validation errors now emitted:

- `Invalid member update fields: <comma-separated keys>`

## Allowed Update Fields

## updatePayment allowed keys

- userId
- memberId
- subscriptionId
- paymentMethod
- transactionId
- authorizationCode
- epxAuthGuid
- status
- amount
- currency
- metadata
- createdAt
- updatedAt

## storage.updateMember allowed keys

Supported camelCase/snake_case keys:

- firstName / first_name
- lastName / last_name
- middleName / middle_name
- email
- phone
- dateOfBirth / date_of_birth
- gender
- ssn
- address
- address2
- city
- state
- zipCode / zip_code
- employerName / employer_name
- divisionName / division_name
- dateOfHire / date_of_hire
- emergencyContactName / emergency_contact_name
- emergencyContactPhone / emergency_contact_phone
- planId / plan_id
- memberType / member_type
- coverageType / coverage_type
- totalMonthlyPrice / total_monthly_price
- addRxValet / add_rx_valet
- status
- agentNumber / agent_number
- enrolledByAgentId / enrolled_by_agent_id
- customerNumber / customer_number
- memberPublicId / member_public_id
- paymentToken / payment_token
- paymentMethodType / payment_method_type
- bankRoutingNumber / bank_routing_number
- bankAccountNumber / bank_account_number
- bankAccountType / bank_account_type
- bankAccountHolderName / bank_account_holder_name
- bankAccountLastFour / bank_account_last_four
- firstPaymentDate / first_payment_date
- membershipStartDate / membership_start_date
- enrollmentDate / enrollment_date
- isActive / is_active
- isTestMember / is_test_member

Allowed non-persisted aliases (accepted/ignored intentionally):

- updatedAt
- createdAt

## Rejected Behavior

Now rejected in both hardened functions:

- Unknown update keys not in the explicit allowlist.
- Any payload attempting to introduce ad hoc SQL identifier names via update keys.

## Verification Performed

1. Static pattern verification:

- Confirmed fallback patterns are removed from target functions.
- Confirmed explicit validation errors are present.

2. File diagnostics:

- Checked server/storage.ts diagnostics.
- Result: no errors.

3. Certification-safety verification:

- No EPX route/module edits were made as part of Phase 1B.
- Hardening is localized to SQL key-to-column mapping and validation logic.

## Rollback Considerations

1. Fast rollback path:

- Revert only the Phase 1B changes in server/storage.ts if unexpected payload-key rejections occur.

2. Operational risk of rollback:

- Rolling back reintroduces identifier fallback risk.

3. Safer rollback approach:

- Prefer targeted allowlist expansion for newly discovered legitimate keys over full rollback.
- Monitor update failure logs for validation error messages and patch allowlists surgically.
