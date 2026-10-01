# AGENTS.md

## Purpose

This repository contains the My Premier Plans (MPP) V1 enrollment and member-management platform.

AI coding agents should move quickly, use good judgment, and minimize unnecessary analysis or repeated tool calls.

The default operating mode is:

**Understand → make the smallest correct change → test → report.**

Do not create process for process's sake.

---

# 1. Default Working Style

For ordinary application work:

1. Inspect the relevant code.
2. Identify the likely cause.
3. Make the smallest safe fix.
4. Run the most relevant test/build check.
5. Report what changed and whether anything remains unresolved.

Do not stop for approval on routine, reversible, non-production code changes.

Do not produce long pre-change reports unless the task touches a protected area listed below.

Prefer action over commentary.

---

# 2. Keep Scope Tight

Do not make unrelated changes.

Avoid unnecessary:

- refactors
- dependency upgrades
- folder reorganizations
- route renames
- framework changes
- schema changes
- formatting sweeps
- architecture rewrites

If a nearby issue is discovered, mention it separately rather than expanding the current task.

---

# 3. Protected Areas

Extra caution is required only when work touches:

- EPX payment processing
- EPX Hosted Checkout
- payment tokenization
- payment-method maintenance
- recurring billing logic
- billing scheduler logic
- retry/decline/hold logic
- external biller logic
- production payment state
- production database data
- production credentials or secrets
- authentication/authorization boundaries
- destructive database operations

For these areas, diagnose before changing behavior.

Do not modify a protected component merely because a nearby feature is failing.

---

# 4. Payment-System Guardrail

Known-working EPX processing should be treated as stable infrastructure.

A frontend error, API `404`, route mismatch, deployment issue, or UI failure is an application-layer problem until evidence shows otherwise.

For payment-method issues, trace the request path first.

Current payment-method workflow to verify:

`POST /api/members/:memberId/payment-methods/checkout`

Check:

- frontend caller
- generated URL
- HTTP method
- backend route
- router mount path
- auth middleware
- deployed route availability
- handler
- EPX/tokenization handoff

Do not rewrite EPX internals to solve an application routing problem.

---

# 5. Production Actions Require Explicit Authorization

Do not perform these actions unless specifically authorized:

- submit a live charge
- enable live billing
- disable billing dry-run
- change a billing kill switch
- activate or change production Cron
- run destructive production SQL
- delete production records
- change production payment tokens
- rotate production credentials
- change production environment variables
- run irreversible production migrations

A request to fix code is not permission to alter production state.

---

# 6. Payment Data Safety

Never:

- store raw card numbers
- store CVV values
- log card data
- commit payment credentials
- expose full payment tokens
- bypass the approved hosted/tokenized payment flow

Use existing secure payment-provider flows.

---

# 7. Database Changes

Routine application queries may be changed as needed.

Before making a schema migration, destructive query, or production data correction, confirm that it is actually necessary.

Prefer an application-layer fix when one solves the issue.

Do not rewrite historical payment records just to make tests pass.

---

# 8. API Debugging

For API failures, follow the shortest useful trace:

**UI → request → route → handler → service/database/provider → response**

For `404` errors, verify route definition and route mounting before investigating downstream payment-provider code.

Do not over-investigate unrelated layers.

---

# 9. Git Workflow

Use normal branch/PR discipline when practical:

1. Work from current code.
2. Use a task-specific branch when the workflow supports it.
3. Keep the diff focused.
4. Test relevant behavior.
5. Commit clearly.
6. Push/open a PR when requested or when that is the established repo workflow.

Do not:

- force-push `main`
- rewrite shared history
- delete branches without checking for unique commits
- commit secrets
- merge unrelated work together

Do not spend excessive time on Git ceremony when the task is local diagnosis or a small patch.

---

# 10. Testing

Use the cheapest test that gives meaningful confidence.

Prefer targeted tests over full-suite runs when the change is isolated.

Examples:

- route change → test route
- UI change → test affected UI flow
- utility change → run utility/unit test
- build-sensitive change → run build/typecheck
- payment flow → verify secure flow without submitting a live charge

A green build alone does not prove a payment workflow is correct.

Do not repeatedly run expensive tests without a reason.

---

# 11. Secrets

Never commit:

- `.env`
- API keys
- database passwords
- EPX credentials
- Stripe credentials
- Supabase service-role keys
- webhook secrets
- JWT secrets
- private certificates
- access tokens

If a secret is missing, report that fact. Do not invent one.

---

# 12. Authentication

Do not weaken authentication or authorization to make a feature work.

Verify access rules when the bug involves:

- agents
- members
- team/upline relationships
- admin functions
- payment information

Do not bypass middleware as a shortcut.

---

# 13. Deployment Awareness

Distinguish between:

- local code
- committed code
- pushed code
- merged code
- built code
- deployed production code

A route existing locally does not prove it exists in production.

When diagnosing a production-only issue, compare source behavior with deployed behavior.

---

# 14. MPP Business Rules

Do not casually rewrite established business rules.

Preserve existing behavior around:

- member lifecycle
- agent/member relationships
- payment state
- billing cycles
- effective dates
- enrollment status
- recurring payments
- team/upline permissions

If the code and stated business rule conflict, surface the mismatch.

Use **MPP Healthstack™** exactly in customer-facing references to the branded product unless instructed otherwise.

---

# 15. When to Stop and Ask

Stop before proceeding only when the next step would:

- submit a live payment
- change production billing state
- alter known-good EPX processing without clear evidence
- run destructive production SQL
- risk production data loss
- expose or rotate secrets
- weaken authentication
- require a major architecture rewrite
- overwrite unrelated work
- perform an irreversible action

Otherwise, use reasonable engineering judgment and continue.

---

# 16. Reporting

Keep reports concise.

At completion, state:

- what caused the issue
- what changed
- what was tested
- whether production action is still required

Do not write a long forensic report for a simple bug.

Do not claim success merely because code compiled if the affected workflow was not verified.

---

# 17. Credit-Efficient Agent Behavior

Minimize unnecessary tool calls and repeated inspection.

Prefer:

- targeted file reads
- targeted searches
- focused tests
- small diffs
- reuse of already-established context
- one good diagnostic pass rather than repeated broad scans

Avoid:

- rereading large files without need
- rerunning the same tests
- producing long explanations before routine edits
- exploring unrelated code paths
- broad repo audits when the defect is localized

Spend reasoning and compute where risk is high, not everywhere.

---

# 18. Definition of Done

A task is done when:

- the identified defect is corrected
- the change is focused
- relevant tests/checks pass
- protected behavior was not unintentionally changed
- no secrets were exposed
- any remaining production action is clearly identified

For routine fixes, that is enough.
