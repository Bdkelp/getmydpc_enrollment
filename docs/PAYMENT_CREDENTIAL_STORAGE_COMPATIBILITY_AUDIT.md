# Payment Credential Storage Compatibility Audit

Date: 2026-09-01

## Current policy

- Card PAN and CVV are not stored. Hosted card details remain with EPX/North.
- BRIC, AUTH_GUID, ORIG_AUTH_GUID, and equivalent EPX billing references are normalized and stored raw server-side.
- ACH account and routing values are stored readable server-side. Account masking is screen privacy only; audited admin access reveals or updates full values. Routing numbers remain readable.
- SSN protection remains separate from payment-reference handling.
- Canonical EPX-origin values in platform payment and payment-token rows are the operational source of truth. North/Payments Hub is an investigation fallback for missing, corrupted, conflicting, or disputed data.
- Legacy AES-CBC-looking payment values are platform-origin migration inputs, not directly usable billing credentials. Only the guarded one-time conversion utility decrypts them; runtime billing and future writes do not.

## Code path inventory

### Writes

- `server/storage.ts`
  - `upsertMemberPaymentToken`: writes `payment_tokens.bric_token`, `original_network_trans_id`, and ACH fields.
  - `upsertGroupPaymentToken`: same behavior for group-owned credentials.
  - `createPayment`: writes `payments.epx_auth_guid`.
  - `updatePayment`: updates `payments.epx_auth_guid` through an allowlisted mapping.
  - All new processor references pass through `normalizeProcessorReference` and remain raw.
- `server/routes/epx-hosted-routes.ts`
  - Hosted completion and callback paths update `members.payment_token` and call member/group token upserts.
  - Card callback parsing derives only last four digits for display; PAN is not persisted.
- `server/utils/epx-metadata.ts`
  - Persists server-post AUTH_GUID through `storage.updatePayment`.
- `server/routes/ach-payment-routes.ts`
  - Initial ACH setup writes readable routing/account values and calls token upsert.
- `server/routes.ts`
  - Admin bank-info update writes normalized readable routing/account values.
- `server/routes/payment-diagnostic.ts`
  - Guarded repair endpoint writes only missing/invalid `original_network_trans_id` values and does not overwrite a valid existing reference.

### Reads and resolution

- `server/storage.ts`
  - Scheduler query loads active member/group tokens, `original_network_trans_id`, latest payment AUTH_GUID, and member/token ACH fields.
- `server/services/recurring-billing-scheduler.ts`
  - Card precedence: verified readable `original_network_trans_id`, payment AUTH_GUID, then readable BRIC.
  - ACH uses readable account data directly. Legacy ciphertext is classified for migration.
- `server/routes/payment-diagnostic.ts`
  - Automatic repair trusts well-formed platform-stored EPX AUTH_GUID or readable BRIC for active accounts unless a cross-member duplicate conflict exists. `members.payment_token` remains legacy and ambiguous.
- `server/routes.ts`
  - Admin-sensitive endpoint masks account/reference data by default for screen privacy and reveals full values after admin authorization with audit logging. Routing numbers are readable.
- `server/routes/ach-payment-routes.ts`
  - ACH execution consumes readable values directly; certification logging masks account numbers to avoid unnecessary disclosure.

## Legacy behavior confirmed

Legacy token upserts encrypted `payment_tokens.bric_token` with AES-256-CBC using `ENCRYPTION_KEY`. When the key was absent, the application generated a random key for that process. Values written under one random key could not be decrypted after restart or by another instance. Meanwhile, `members.payment_token`, `payments.epx_auth_guid`, and many `original_network_trans_id` values remained raw. This produced mixed-format records and explains recurring failures reporting token decryption failure with no usable original-auth fallback.

Runtime payment encryption/decryption helpers have been removed. New BRIC, AUTH_GUID, ORIG_AUTH_GUID, ACH account, and routing writes are readable server-side. `scripts/convert-legacy-payment-tokens.ts` contains the isolated one-time legacy conversion implementation.

## Production compatibility result

Read-only scan of 17 active token rows:

- 11 are usable because a raw `original_network_trans_id` is present.
- 6 have legacy encrypted-looking BRIC values that are not valid billing credentials and have no usable original-auth fallback.

Unusable active token rows:

- Token 26, Darrel Carter, active: one-time platform legacy conversion; external verification only if conversion fails.
- Token 21, Christian Parra, active: one-time platform legacy conversion; external verification only if conversion fails.
- Token 24, Latanya Rozier, active: one-time platform legacy conversion; external verification only if conversion fails.
- Token 25, Daniel Torres Jr, active: one-time platform legacy conversion; external verification only if conversion fails.
- Token 22, Rodrigo Montelongo, cancelled: no billing repair while cancelled.
- Token 23, Johan Osuna Vera, suspended: do not reactivate through token repair.

No raw processor references or bank account values were printed during the scan.

## Safe repair plan

1. Deploy the canonical raw-reference write policy before repairing old rows.
2. Run the existing diagnostic repair endpoint in preview mode.
3. Preserve every valid `original_network_trans_id` and `payments.epx_auth_guid` unchanged.
4. Prefer canonical references already stored by platform EPX payment flows. Use North/Payments Hub only when platform data is missing, malformed, conflicting, disputed, or cannot be converted.
5. Update only `payment_tokens.original_network_trans_id` when it is null or invalid, guarded by token ID, member ID, active state, and expected current value.
6. Do not needlessly rewrite legacy `bric_token` ciphertext if a verified raw original-auth reference makes billing usable.
7. For legacy encrypted-looking ACH account values, have an authorized admin re-enter the full account number from an authoritative source. Do not infer it from last four digits or BRIC.
8. Automatic repair accepts well-formed EPX references in proper platform payment/payment-token rows for active accounts unless duplicate values conflict across members. Amount, transaction, date, and MID remain diagnostic context rather than routine external re-proof requirements.
9. Leave empty, malformed, conflicting, inactive, cancelled, or disputed rows review-only. Manual external receipt input is allowed only through an explicit super-admin repair path after review.
10. Keep cancelled, suspended, outside-payment, and authorization-held members scheduler-ineligible regardless of token repair.
11. Re-run the compatibility scan and a targeted dry run. A member enters live billing only after payment history, subscription date/status, method, and authorization are independently confirmed.

## Validation

- `npm run test:scheduler` passes.
- VS Code diagnostics report no errors in the changed billing/storage files.
- No production credential was overwritten and no billing was triggered by this audit.
