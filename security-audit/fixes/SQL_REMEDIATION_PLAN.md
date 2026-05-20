<!-- markdownlint-disable MD029 MD032 -->

# SQL Remediation Plan

Date: 2026-05-18  
Source: security-audit/findings/SQL_INJECTION_AUDIT.md

## Finding 1 Remediation

1. File path: server/storage.ts
2. Function: storage.updateMember
3. Risk level: High
4. Root cause: Dynamic SQL identifier assembly uses fallback to raw key names (`columnMapping[key] || key`), allowing non-allowlisted keys to become SQL column identifiers.
5. Recommended remediation:

- Replace fallback behavior with strict allowlist enforcement.
- Reject unknown keys before SQL construction.
- Keep value parameterization unchanged.

6. Estimated implementation difficulty: Moderate
7. Change risks breaking production behavior: Yes (payloads with previously tolerated unknown keys will fail)
8. Unit/integration testing required: Yes
9. Recommended deployment strategy: staged rollout
10. Rollback considerations:

- Keep previous handler behavior behind a short-lived feature flag or reversible commit.
- Monitor 4xx spikes on member update routes after release.
- Roll back if valid update flows are rejected unexpectedly.

## Finding 2 Remediation

1. File path: server/storage.ts
2. Function: updatePayment
3. Risk level: Medium
4. Root cause: Dynamic `SET` clause allows identifier fallback from untrusted object keys (`fieldMapping[field] || field`).
5. Recommended remediation:

- Apply strict allowlist for updateable payment fields.
- Remove raw key fallback in SQL identifier positions.
- Add explicit validation error for unknown fields.

6. Estimated implementation difficulty: Moderate
7. Change risks breaking production behavior: Yes (callers sending extra keys will now fail validation)
8. Unit/integration testing required: Yes
9. Recommended deployment strategy: staged rollout
10. Rollback considerations:

- Revert to previous query builder logic if payment update failures increase.
- Keep telemetry on update validation failures for rapid triage.

## Finding 3 Remediation

1. File path: server/storage.ts
2. Function: getAllLeads
3. Risk level: Medium
4. Root cause: Runtime query text is assembled then executed through generic SQL RPC (`execute_sql`), increasing blast radius if RPC protections are weak.
5. Recommended remediation:

- Replace `execute_sql` RPC path with typed Supabase query-builder operations.
- If RPC remains, enforce single-statement, parameterized-only execution in RPC function.
- Keep filter clauses sourced from fixed templates only.

6. Estimated implementation difficulty: Complex
7. Change risks breaking production behavior: Yes (query result shape/order or performance may change)
8. Unit/integration testing required: Yes
9. Recommended deployment strategy: staged rollout
10. Rollback considerations:

- Keep existing RPC path as temporary fallback during rollout.
- Validate parity of result count/order between old and new implementations.
- Roll back if lead filtering correctness or latency regresses.

## Finding 4 Remediation

1. File path: server/storage.ts
2. Function: getRecentPaymentsDetailed
3. Risk level: Low
4. Root cause: `LIMIT` is interpolated into query text (`LIMIT ${limit}`) instead of using a bind parameter.
5. Recommended remediation:

- Convert `LIMIT` to bound integer parameter (for example `LIMIT $n::int`).
- Retain existing upper/lower bound validation.

6. Estimated implementation difficulty: Easy
7. Change risks breaking production behavior: Low
8. Unit/integration testing required: Yes (lightweight regression)
9. Recommended deployment strategy: hotfix
10. Rollback considerations:

- Straightforward code rollback if query behavior changes unexpectedly.
- Compare row-count and ordering before/after deployment.

## Finding 5 Remediation

1. File path: server/routes/debug-recent-payments.ts
2. Function: GET /api/debug/recent-payments handler
3. Risk level: Low
4. Root cause: Dynamic `.or()` filter expression is composed with template literals.
5. Recommended remediation:

- Keep debug tokens static and hardcoded.
- If future input becomes external, sanitize wildcard/control characters or use explicit predicate chaining.
- Consider removing or restricting debug route in production.

6. Estimated implementation difficulty: Easy
7. Change risks breaking production behavior: Low (debug-only path)
8. Unit/integration testing required: Optional but recommended
9. Recommended deployment strategy: hotfix
10. Rollback considerations:

- Low-impact rollback; endpoint is non-critical.
- Verify debug diagnostics still return expected records.

## Finding 6 Remediation

1. File path: server/lib/neonDb.ts
2. Function: query
3. Risk level: Medium
4. Root cause: Generic raw SQL wrapper accepts arbitrary query text; safety depends entirely on callers.
5. Recommended remediation:

- Add guardrails in wrapper (query source tagging, reject dangerous multi-statement patterns in runtime paths).
- Establish centralized safe-query conventions and lint rules.
- Add audit logging for risky query patterns.

6. Estimated implementation difficulty: Complex
7. Change risks breaking production behavior: Yes (false-positive query blocking can impact legitimate operations)
8. Unit/integration testing required: Yes
9. Recommended deployment strategy: staged rollout
10. Rollback considerations:

- Roll back wrapper guardrail enforcement quickly if legitimate queries fail.
- Keep guardrails configurable via environment flag for emergency bypass.

## Finding 7 Remediation

1. File path: scripts/apply-payment-date-migrations.mjs, scripts/ensure-commission-ledger-schema.mjs, scripts/apply-rls-fix.mjs
2. Function: migration helpers using exec_sql / pg.Client.query
3. Risk level: Medium (operational), Low (runtime API)
4. Root cause: Full SQL text execution capability exists in operational scripts and SQL-exec RPC usage.
5. Recommended remediation:

- Restrict SQL-exec RPC exposure to tightly controlled operator contexts.
- Ensure RPC cannot be invoked by untrusted application roles.
- Move production schema changes to controlled migration tooling only.

6. Estimated implementation difficulty: Moderate
7. Change risks breaking production behavior: Yes (operational workflow changes for DB maintenance)
8. Unit/integration testing required: Yes (operational smoke tests)
9. Recommended deployment strategy: maintenance window
10. Rollback considerations:

- Preserve break-glass admin migration path during transition.
- Document fallback operational procedure if migration automation fails.

## Priority Order

1. Finding 1: storage.updateMember (High)
2. Finding 3: getAllLeads with execute_sql RPC (Medium, broad blast radius)
3. Finding 2: updatePayment (Medium)
4. Finding 6: neonDb.query wrapper guardrails (Medium, foundational)
5. Finding 7: script/RPC operational SQL execution hardening (Medium operational)
6. Finding 4: getRecentPaymentsDetailed LIMIT parameterization (Low)
7. Finding 5: debug-recent-payments dynamic .or expression (Low)

## Recommended Implementation Sequence

1. Implement and test strict allowlist enforcement in storage.updateMember.
2. Implement and test strict allowlist enforcement in updatePayment.
3. Convert interpolated LIMIT to bound parameter in getRecentPaymentsDetailed.
4. Refactor getAllLeads away from generic execute_sql RPC (or harden RPC constraints first, then refactor).
5. Introduce neonDb.query runtime guardrails behind a feature flag and roll out progressively.
6. Harden exec_sql operational access model and migration procedures during a planned maintenance window.
7. Clean up debug route filter construction and production exposure posture.

## Estimated Total Remediation Effort

- Finding 1: 1-2 engineering days
- Finding 2: 1 engineering day
- Finding 3: 2-4 engineering days
- Finding 4: 0.5 engineering day
- Finding 5: 0.5 engineering day
- Finding 6: 2-3 engineering days
- Finding 7: 1-2 engineering days

Estimated total: 8-14 engineering days (single engineer), excluding change-approval lead time.

## Recommended Regression Testing Checklist

- Verify member update endpoints reject unknown fields and still accept all documented fields.
- Verify payment update endpoints reject unknown fields and still persist valid updates.
- Confirm getAllLeads returns identical functional results for status/assignment filters versus baseline.
- Validate no multi-statement or unsafe SQL text can pass through execute_sql pathways in runtime contexts.
- Confirm getRecentPaymentsDetailed returns correct count/order with bound LIMIT.
- Run payment/admin reconciliation and reporting routes that depend on updated storage query logic.
- Validate authentication and role-gated admin flows that call affected storage functions.
- Run integration tests for lead management, payment tracking, and admin member maintenance paths.
- Execute operational smoke tests for migration scripts under hardened permissions.
- Monitor post-deploy metrics/logs: query errors, 4xx/5xx rates, lead/admin/payment API latency, and failed update counts.
