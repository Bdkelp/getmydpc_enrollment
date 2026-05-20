<!-- markdownlint-disable MD029 MD032 -->

# DEBUG ROUTE HARDENING PLAN

Date: 2026-05-18  
Phase: 1A

## Objective

Lock down public debug/test endpoints so they are unavailable in production while preserving developer usability in local/dev.

## Hardening Strategy

1. Create centralized middleware: `requireDevelopmentMode`.
2. Enforce middleware on all `/api/debug/*` and `/api/test-*` endpoints in scope.
3. Protect public test lead endpoints and EPX debug/test endpoints.
4. Return `404` in production to reduce route discoverability.
5. Keep enrollment and payment business flows unchanged by targeting only debug/test surfaces.

## Centralized Middleware Added

- File: `server/middleware/debug-route-guard.ts`
- Behavior: blocks requests when `NODE_ENV=production`.
- Response in production: `404 Not found`.
- Response in non-production: pass-through.

## Routes Changed

## A. Main Router (`server/routes.ts`)

- `GET /api/test-cors` -> guarded by `requireDevelopmentMode`
- `GET /api/debug/users-count` -> guarded by `requireDevelopmentMode`
- `GET /api/debug/supabase-config` -> guarded by `requireDevelopmentMode`
- `GET /api/public/test-leads-noauth` -> guarded by `requireDevelopmentMode`
- `POST /api/test-commission` -> guarded by `requireDevelopmentMode`
- `GET /api/test-commission-count` -> guarded by `requireDevelopmentMode`
- `GET /api/test-commission-calc` -> guarded by `requireDevelopmentMode`
- `GET /api/test-leads` -> guarded by `requireDevelopmentMode`
- `GET /api/debug/plans-diagnostic` -> guarded by `requireDevelopmentMode`
- `GET /api/debug/commission-diagnostic` -> guarded by `requireDevelopmentMode`
- `GET /api/debug/recent-commissions` -> guarded by `requireDevelopmentMode`

## B. Debug Payment Router (`server/routes/debug-payments.ts`)

- Added router-level guard: `router.use('/api/debug', requireDevelopmentMode)`
- Covers:
  - `GET /api/debug/test`
  - `GET /api/debug/payments`
  - `POST /api/debug/test-payment-creation`
  - `GET /api/debug/epx-config`

## C. Debug Recent Payments Router (`server/routes/debug-recent-payments.ts`)

- Added router-level guard: `router.use('/api/debug', requireDevelopmentMode)`
- Covers:
  - `GET /api/debug/recent-payments`
  - `GET /api/debug/test`

## D. EPX Hosted Router (`server/routes/epx-hosted-routes.ts`)

- `GET /api/epx/logs/recent` -> guarded by `requireDevelopmentMode`
- `POST /api/epx/test-recurring` -> guarded by `requireDevelopmentMode` (in addition to existing auth/disabled logic)

## E. Dev Utilities Router (`server/routes/dev-utilities.ts`)

- Replaced local middleware implementation with centralized middleware import.
- Existing dev utility routes continue to require development mode.

## Production Safety Impact

- Debug/test endpoints in scope are no longer reachable in production.
- Enrollment/payment core flows are unchanged (hosted payment create/callback/status routes were not modified).
- Authentication-sensitive admin operational routes remain unchanged outside debug/test scope.

## Rollback Plan

1. Immediate rollback option:

- Revert commit touching:
  - `server/middleware/debug-route-guard.ts`
  - `server/routes.ts`
  - `server/routes/debug-payments.ts`
  - `server/routes/debug-recent-payments.ts`
  - `server/routes/epx-hosted-routes.ts`
  - `server/routes/dev-utilities.ts`

2. Partial rollback option:

- Remove middleware from specific route definitions if any non-production workflow unexpectedly depends on production access.

3. Validation after rollback:

- Re-test affected routes in production and non-production.
- Verify no regression on enrollment/payment endpoints:
  - `/api/epx/hosted/create-payment`
  - `/api/epx/hosted/callback`
  - `/api/epx/hosted/status/:transactionId`

4. Risk note:

- Rollback re-exposes debug/test surfaces in production unless replaced by equivalent controls.
