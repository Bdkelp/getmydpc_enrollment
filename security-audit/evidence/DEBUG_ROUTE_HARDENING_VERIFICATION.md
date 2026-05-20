<!-- markdownlint-disable MD029 MD032 -->

# DEBUG ROUTE HARDENING VERIFICATION

Date: 2026-05-18  
Phase: 1A verification

## Verification Method

1. Static code verification was performed against route definitions and middleware wiring.
2. Commands used:

- Select-String over server route files for target endpoints and requireDevelopmentMode usage.
- Direct file inspection of:
  - server/middleware/debug-route-guard.ts
  - server/routes.ts
  - server/routes/debug-payments.ts
  - server/routes/debug-recent-payments.ts
  - server/routes/epx-hosted-routes.ts

3. Runtime HTTP execution was not performed in this verification pass (no live server/session execution evidence captured in this report).

## Production Behavior Checks

## 1) /api/debug/\* returns 404 in production

- Test method:
  - Verified middleware in server/middleware/debug-route-guard.ts returns 404 when NODE_ENV is production.
  - Verified debug routers apply guard via router.use('/api/debug', requireDevelopmentMode).
  - Verified inline /api/debug/\* routes in server/routes.ts include requireDevelopmentMode.
- Expected result:
  - Any /api/debug/\* request in production is blocked with 404.
- Actual result:
  - Guard is present and attached to all identified /api/debug/\* paths in scope.
- Pass/Fail: PASS
- Concerns:
  - Behavior is inferred from code wiring; no live HTTP probe output was captured.

## 2) /api/test-\* returns 404 in production

- Test method:
  - Verified /api/test-\* handlers in server/routes.ts include requireDevelopmentMode:
    - /api/test-cors
    - /api/test-commission
    - /api/test-commission-count
    - /api/test-commission-calc
    - /api/test-leads
- Expected result:
  - /api/test-\* requests in production return 404.
- Actual result:
  - All identified /api/test-\* endpoints in scope are guarded.
- Pass/Fail: PASS
- Concerns:
  - No runtime request/response capture in this pass.

## 3) /api/epx/logs/recent returns 404 in production

- Test method:
  - Verified route declaration in server/routes/epx-hosted-routes.ts:
    - router.get('/api/epx/logs/recent', requireDevelopmentMode, ...)
- Expected result:
  - Production request returns 404.
- Actual result:
  - Guard applied directly on the route.
- Pass/Fail: PASS
- Concerns:
  - No live HTTP probe output captured.

## 4) /api/epx/test-recurring not publicly accessible

- Test method:
  - Verified route declaration in server/routes/epx-hosted-routes.ts:
    - requireDevelopmentMode + authenticateToken middleware chain.
- Expected result:
  - Not publicly accessible; blocked in production and additionally requires auth in non-production.
- Actual result:
  - Route has development guard and auth middleware.
- Pass/Fail: PASS
- Concerns:
  - None beyond lack of live request evidence.

## Development Behavior Checks

## 5) Debug/test routes remain usable locally

- Test method:
  - Verified guard logic in server/middleware/debug-route-guard.ts only blocks when NODE_ENV equals production.
- Expected result:
  - In local development (NODE_ENV != production), debug/test routes remain reachable.
- Actual result:
  - Middleware pass-through confirmed for non-production environments.
- Pass/Fail: PASS
- Concerns:
  - Previous dev-utilities behavior allowed additional env toggles; new guard now keys only on NODE_ENV. If teams rely on non-production-like runtime with NODE_ENV=production, these routes will now be blocked by design.

## Production Payment Route Safety Checks

## 6) Core hosted payment routes are not blocked by debug guard

- Test method:
  - Verified route declarations in server/routes/epx-hosted-routes.ts for:
    - POST /api/epx/hosted/create-payment
    - POST /api/epx/hosted/complete
    - POST /api/epx/hosted/record-failure
    - POST /api/epx/hosted/callback
    - GET /api/epx/hosted/status/:transactionId
  - Confirmed no requireDevelopmentMode middleware attached to these routes.
- Expected result:
  - Production payment processing routes remain available.
- Actual result:
  - No debug guard attached to these production paths.
- Pass/Fail: PASS
- Concerns:
  - Functional runtime behavior was not exercised in this static pass.

## Guard Scope Safety Check

## 7) debug-route-guard.ts does not block enrollment, auth, admin, member, payment, or agent business routes

- Test method:
  - Enumerated all requireDevelopmentMode usages across server/\*_/_.ts.
  - Confirmed usage limited to debug/test/dev utility surfaces and EPX debug/test endpoints.
- Expected result:
  - Business-critical enrollment/auth/admin/member/payment/agent routes should not be guarded by requireDevelopmentMode.
- Actual result:
  - No broad/global app.use(requireDevelopmentMode) found.
  - Guard usage is route-specific.
  - Exception by design: /api/auth/reset-password-direct in dev-utilities is a dev-only auth utility and remains guarded.
- Pass/Fail: PASS
- Concerns:
  - Route naming under /api/auth in dev-utilities could be confused with normal auth APIs; recommend documenting as dev-only in API docs.

## Summary

- Overall verification status: PASS (static verification)
- Defects found requiring code changes: None
- Open concern:
  - This evidence is code-level verification; run-time curl/Postman checks in both NODE_ENV=production and NODE_ENV=development are still recommended for operational sign-off.
