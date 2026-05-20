<!-- markdownlint-disable MD013 MD024 MD032 -->

# SQL IDENTIFIER ALLOWLIST VERIFICATION

Date: 2026-05-18  
Phase: HARDENING PHASE 1B  
Verifier: GitHub Copilot (GPT-5.3-Codex)

## Scope

Verification target:

- server/storage.ts (`updatePayment`, `storage.updateMember`)
- Related route call sites that invoke these helpers
- Current working tree delta for Phase 1B safety scope

Constraints respected:

- No runtime mutation tests were executed against live data.
- No application code changes were made during this verification.

## Verification Matrix

## 1) updateMember no longer uses fallback SQL identifiers

Test method:

- Static code inspection of `storage.updateMember` SQL update construction and key mapping.
- Pattern search for fallback expression `columnMapping[key] || key`.

Expected result:

- No fallback identifier mapping expression remains.
- SQL column names must come from explicit allowlist mapping only.

Actual result:

- `updateMember` builds `dbField` from `columnMapping[key]` and skips unset mappings.
- Unknown keys are rejected before SQL updates are built (`Invalid member update fields: ...`).
- No `columnMapping[key] || key` fallback exists in the function.

Pass/Fail:

- PASS

Concerns:

- None for this control.

## 2) updatePayment no longer uses fallback SQL identifiers

Test method:

- Static code inspection of `updatePayment` SQL update construction.
- Pattern search for fallback expression `fieldMapping[field] || field`.

Expected result:

- No fallback identifier mapping expression remains.
- SQL column names must come from explicit allowlist mapping only.

Actual result:

- `updatePayment` uses `dbField = fieldMapping[field]` only.
- Unknown fields are rejected first (`Invalid payment update fields: ...`).
- No `fieldMapping[field] || field` fallback exists in the function.

Pass/Fail:

- PASS

Concerns:

- None for this control.

## 3) Unknown update keys are rejected before SQL construction

Test method:

- Static control-flow review in both functions.
- Validation line check for unknown-key exceptions before `setClause` / `updates[]` SQL assignment generation.

Expected result:

- Unknown keys produce an error before dynamic SQL assignment clauses are built.

Actual result:

- `updatePayment` computes `unknownFields` and throws before `setClause` is built.
- `updateMember` computes `unknownUpdateKeys` and throws before dynamic `updates.push(...)` SQL assignments.

Pass/Fail:

- PASS

Concerns:

- Behavior change is intentionally fail-fast; clients sending extra fields will now receive errors.

## 4) Valid update fields still work

Test method:

- Static call-site compatibility review of major flows:
  - Enrollment/admin member update routes (`server/routes.ts`)
  - EPX hosted callback/complete paths (`server/routes/epx-hosted-routes.ts`)
  - ACH setup route (`server/routes/ach-payment-routes.ts`)
  - Payment diagnostics (`server/routes/payment-diagnostic.ts`)
  - EPX metadata persistence helper (`server/utils/epx-metadata.ts`)
- Compared payload keys used in these call sites against Phase 1B allowlists.

Expected result:

- Existing valid keys used by enrollment/member/agent/admin/EPX flows remain allowlisted.

Actual result:

- Reviewed payload keys in active call sites are present in allowlists, including:
  - updatePayment: `status`, `metadata`, `memberId`, `subscriptionId`, `paymentMethod`, `transactionId`, `authorizationCode`, `epxAuthGuid`
  - updateMember: `status`, `isActive`, `firstPaymentDate`, `paymentToken`, `paymentMethodType`, `coverageType`, `totalMonthlyPrice`, `total_monthly_price`, `ssn`, contact/address/bank fields
- No immediate allowlist mismatch found in reviewed flows.

Pass/Fail:

- PASS (static verification)

Concerns:

- Static verification cannot prove every runtime edge path. Recommend monitoring for new validation errors after deploy.

## 5) Values remain parameterized

Test method:

- Static SQL construction review in both functions.

Expected result:

- User-supplied values are bound as query parameters, not interpolated into SQL values.

Actual result:

- `updatePayment` uses placeholders (`$1`, `$2...`) and passes values as query args; `metadata` is bound as `$n::jsonb`.
- `updateMember` constructs `updates.push("col = $n")` and executes with parameter array.
- Only allowlisted column identifiers are composed; values remain parameterized.

Pass/Fail:

- PASS

Concerns:

- None for value parameterization.

## 6) updatedAt and createdAt behavior is intentional and documented

Test method:

- Static review of `updateMember` handling for timestamp aliases.
- Documentation review of `security-audit/fixes/SQL_IDENTIFIER_ALLOWLIST_FIX.md`.

Expected result:

- `updatedAt` and `createdAt` are intentionally handled (not accidental).
- Behavior is documented in remediation notes.

Actual result:

- `updateMember` explicitly removes `updatedAt` and `createdAt` from persisted payload (`delete sanitizedData.updatedAt/createdAt`).
- `updateMember` allows these keys as non-persisted aliases (`nonPersistedAllowedKeys`).
- Remediation doc explicitly states this intentional behavior.

Pass/Fail:

- PASS

Concerns:

- None.

## 7) No EPX hosted payment route behavior was changed

Test method:

- Working-tree scope verification with Git:
  - `git diff --name-only`
  - `git diff --name-only -- server/routes/epx-hosted-routes.ts`
- Commit scope note for context (`git show --name-only HEAD`).

Expected result:

- Phase 1B pending changes should not include EPX hosted route logic changes.

Actual result:

- Current uncommitted delta is only `server/storage.ts`.
- No pending changes in `server/routes/epx-hosted-routes.ts`.
- Note: prior Phase 1A commit did include EPX route guard changes (debug hardening), but Phase 1B verification scope shows no additional EPX route behavior change.

Pass/Fail:

- PASS (for Phase 1B working-tree scope)

Concerns:

- If evaluating across all prior hardening phases combined, EPX route files were changed in Phase 1A (as expected).

## 8) No enrollment, member, agent, or admin update flow is accidentally broken by missing valid keys

Test method:

- Static compatibility mapping of representative critical flows:
  - Enrollment admin contact/personal/address/SSN/bank updates
  - Membership update flows
  - Agent family coverage updates
  - Admin payment reconciliation updates
  - EPX hosted completion/callback updates
  - ACH initial setup updates
- Matched route payload keys against `updateMember`/`updatePayment` allowlists.

Expected result:

- Known valid keys used in these flow families remain accepted.

Actual result:

- Reviewed keys align with allowlists and no direct mismatches found.
- Diagnostics check on `server/storage.ts` returned no errors.

Pass/Fail:

- PASS (static verification)

Concerns:

- Residual risk exists for unreviewed rare payload paths or external callers not covered in sampled static analysis.
- Recommend temporary production log monitoring for:
  - `Invalid member update fields:`
  - `Invalid payment update fields:`

## Commands / Evidence Notes

- `git status --short` -> confirms pending files include `server/storage.ts`
- `git diff --name-only` -> `server/storage.ts`
- `git diff --name-only -- server/routes/epx-hosted-routes.ts` -> no output
- `get_errors(server/storage.ts)` -> No errors found
- `Select-String` checks confirmed validation messages exist and fallback patterns are absent in hardened functions.

## Final Outcome

HARDENING PHASE 1B verification status: PASS with monitoring recommendations.

No defect requiring code change was identified during this verification pass.
