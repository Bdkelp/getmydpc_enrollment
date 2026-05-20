<!-- markdownlint-disable MD022 MD032 -->

# SECURITY INVENTORY

Date: 2026-05-18  
Scope: static code inventory only (no code changes), focused on `server/`, `scripts/`, and `migrations/`.

## 1) API Routes Inventory

Legend:

- Protection: `Public`, `Auth` (authenticated), `Admin` (role check in handler/middleware), `SuperAdmin`.
- DB: `None`, `Read`, `Write`, `Read/Write`.
- Input: request sources used by handler (`body`, `params`, `query`, `headers`, `webhook payload`).
- Domain tags: `payments`, `members`, `agents`, `admins`, `commissions`, `groups`, `billing`.

### A. Core server entry routes (`server/index.ts`)

- `GET /health` | Public | DB: None | Input: none | Domain: none | Risk: low
- `GET /api/health` | Public | DB: None | Input: none | Domain: none | Risk: low
- `GET /ready` | Public | DB: Read (Supabase diagnostics) | Input: none | Domain: billing/platform health | Risk: exposes readiness metadata
- `GET /api/ready` | Public | DB: Read (Supabase diagnostics) | Input: none | Domain: billing/platform health | Risk: exposes readiness metadata

### B. Main route aggregator (`server/routes.ts`)

#### Diagnostics, public checks, and auth

- `GET /api/check-ip` | Public | DB: None | Input: headers | Domain: none | Risk: info disclosure
- `GET /api/test-cors` | Public | DB: None | Input: headers | Domain: none | Risk: low
- `GET /api/debug/users-count` | Public | DB: Read | Input: none | Domain: admins | Risk: user count leakage
- `GET /api/debug/supabase-config` | Public | DB: Read | Input: none | Domain: admins | Risk: config leakage
- `GET /api/health/supabase-auth-context` | Auth | DB: Read | Input: headers/token | Domain: admins | Risk: auth context disclosure
- `GET /api/public/test-leads-noauth` | Public | DB: Read | Input: none | Domain: members/leads | Risk: test endpoint exposed

#### Commission test/debug routes

- `POST /api/test-commission` | Public | DB: Read/Write | Input: body | Domain: commissions/agents | Risk: writable financial test route exposed
- `GET /api/test-commission-count` | Public | DB: Read | Input: none | Domain: commissions | Risk: data exposure
- `GET /api/test-commission-calc` | Public | DB: Read | Input: query | Domain: commissions | Risk: business logic disclosure
- `GET /api/test-leads` | Public | DB: Read | Input: none | Domain: members/leads | Risk: data exposure
- `GET /api/debug/plans-diagnostic` | Public | DB: Read | Input: none | Domain: billing/members | Risk: pricing diagnostics exposure
- `GET /api/debug/commission-diagnostic` | Public | DB: Read | Input: none | Domain: commissions | Risk: sensitive reporting exposure
- `GET /api/debug/recent-commissions` | Public | DB: Read | Input: none | Domain: commissions | Risk: financial data exposure

#### Admin auth-account repair routes

- `GET /api/admin/orphaned-auth-users` | Auth + Admin check | DB: Read | Input: headers | Domain: admins | Risk: account metadata exposure
- `DELETE /api/admin/orphaned-auth-user/:email` | Auth + Admin check | DB: Write | Input: params | Domain: admins | Risk: destructive user deletion path

#### Plans/auth/user self-service

- `GET /api/plans` | Public | DB: Read | Input: query | Domain: billing/members | Risk: low
- `POST /api/auth/login` | Public | DB: Read/Write | Input: body, headers | Domain: admins/agents | Risk: brute-force target
- `POST /api/auth/register` | Public | DB: Write | Input: body | Domain: admins/agents | Risk: account creation abuse
- `POST /api/auth/logout` | Public | DB: Write | Input: body, headers | Domain: admins/agents | Risk: low
- `POST /api/auth/password-change-completed` | Auth | DB: Write | Input: body | Domain: admins/agents | Risk: state tampering if weak checks
- `GET /api/auth/verify-email` | Public | DB: Write | Input: query | Domain: admins/agents | Risk: token replay/injection concerns
- `POST /api/auth/resend-verification` | Public | DB: Read/Write | Input: body | Domain: admins/agents | Risk: email enumeration/rate-limit needed
- `GET /api/auth/user` | Auth | DB: Read | Input: headers/token | Domain: agents/admins | Risk: moderate PII exposure
- `GET /api/user/profile` | Auth | DB: Read | Input: headers/token | Domain: members/agents | Risk: PII exposure
- `PUT /api/user/profile` | Auth | DB: Write | Input: body | Domain: members/agents | Risk: profile tampering
- `POST /api/user/activity` | Auth | DB: None | Input: body | Domain: admins/agents | Risk: low
- `POST /api/user/activity-ping` | Public | DB: None | Input: headers, body | Domain: none | Risk: unauthenticated ping endpoint
- `GET /api/user/subscription` | Auth | DB: Read | Input: headers/token | Domain: billing/members | Risk: subscription data exposure
- `GET /api/user/login-sessions` | Auth | DB: Read | Input: query | Domain: admins/agents | Risk: session metadata exposure
- `GET /api/user/enrollments` | Auth + role check | DB: Read | Input: query | Domain: members/agents | Risk: SSN handling path (decryption/display)

#### Leads and intake

- `GET /api/leads` | Auth + role branching | DB: Read | Input: query | Domain: members/agents | Risk: lead data access controls required
- `POST /api/leads` | Auth | DB: Write | Input: body | Domain: members/agents | Risk: unvalidated content persistence
- `PUT /api/leads/:leadId` | Auth | DB: Write | Input: params, body | Domain: members/agents | Risk: lead ownership/authorization checks
- `POST /api/leads/:leadId/activities` | Auth | DB: Write | Input: params, body | Domain: members/agents | Risk: log injection if unfiltered notes
- `POST /api/public/leads` | Public | DB: Write | Input: body, headers | Domain: members | Risk: public write endpoint, spam/abuse
- `POST /api/public/partner-leads` | Public | DB: Write | Input: body, headers | Domain: members/agents | Risk: public write endpoint, spam/abuse

#### Payment process shim

- `POST /api/process-payment` | Auth | DB: Read | Input: body | Domain: payments/billing | Risk: payment parameter validation

#### Admin/member/agent operations (selected high-impact from `server/routes.ts`)

- `GET /api/admin/stats` | Auth + Admin | DB: Read | Input: query | Domain: admins
- `GET /api/admin/partner-leads` | Auth + Admin | DB: Read | Input: query | Domain: admins/agents
- `PUT /api/admin/partner-leads/:leadId` | Auth + Admin | DB: Write | Input: params, body | Domain: admins/agents
- `GET /api/admin/user-banking` | Auth + Admin | DB: Read | Input: headers | Domain: admins/billing | Risk: sensitive banking data exposure
- `GET /api/admin/banking-changes` | Auth + Admin | DB: Read | Input: query | Domain: admins/billing
- `GET /api/admin/dpc-members` | Auth + Admin | DB: Read | Input: none | Domain: members/admins
- `PUT /api/admin/dpc-members/:customerId/suspend` | Auth + Admin | DB: Write | Input: params, body | Domain: members/admins/billing
- `PUT /api/admin/dpc-members/:customerId/reactivate` | Auth + Admin | DB: Write | Input: params | Domain: members/admins/billing
- `POST /api/admin/reject-user/:userId` | Auth + Admin | DB: Write | Input: params, body | Domain: admins/agents
- `PUT /api/admin/users/:userId/role` | Auth + Admin | DB: Write | Input: params, body | Domain: admins/agents
- `PUT /api/admin/users/:userId/agent-number` | Auth + Admin | DB: Write | Input: params, body | Domain: admins/agents/commissions
- `PUT /api/admin/users/:userId/suspend` | Auth + Admin | DB: Write | Input: params, body | Domain: admins/agents/billing
- `PUT /api/admin/users/:userId/reactivate` | Auth + Admin | DB: Write | Input: params, body | Domain: admins/agents/billing
- `PUT /api/admin/users/:userId/assign-agent-number` | Auth + Admin | DB: Write | Input: params, body | Domain: admins/agents/commissions
- `GET /api/admin/leads` | Auth + Admin | DB: Read | Input: query | Domain: admins/members
- `GET /api/admin/members` | Auth + Agent/Admin | DB: Read | Input: query | Domain: members/admins
- `GET /api/admin/agents` | Auth + Admin | DB: Read | Input: none | Domain: agents/admins
- `GET /api/agents` | Auth | DB: Read | Input: none | Domain: agents
- `PUT /api/admin/leads/:leadId/assign` | Auth + Admin | DB: Write | Input: params, body | Domain: admins/agents
- `GET /api/admin/enrollments` | Auth + Admin | DB: Read | Input: query | Domain: members/admins
- `GET /api/admin/enrollment/:enrollmentId` | Auth + Admin | DB: Read | Input: params | Domain: members/admins/billing | Risk: SSN decrypt path
- `PATCH /api/admin/enrollment/:enrollmentId/contact` | Auth + Admin | DB: Write | Input: params, body | Domain: members/admins
- `PATCH /api/admin/enrollment/:enrollmentId/ssn` | Auth + Admin | DB: Write | Input: params, body | Domain: members/admins | Risk: sensitive field write
- `PATCH /api/admin/enrollment/:enrollmentId/personal` | Auth + Admin | DB: Write | Input: params, body | Domain: members/admins
- `PATCH /api/admin/enrollment/:enrollmentId/bank-info` | Auth + Admin | DB: Write | Input: params, body | Domain: billing/members/admins | Risk: bank data write
- `PATCH /api/admin/enrollment/:enrollmentId/address` | Auth + Admin | DB: Write | Input: params, body | Domain: members/admins
- `PATCH /api/members/:memberId/membership` | Auth + Agent/Admin + ownership checks | DB: Write | Input: params, body | Domain: members/billing/commissions
- `PATCH /api/admin/members/:memberId/status` | Auth + Admin | DB: Write | Input: params, body | Domain: members/admins
- `POST /api/admin/members/:memberId/activate-now` | Auth + Admin | DB: Write | Input: params, body | Domain: members/billing/admins
- `PATCH /api/admin/memberships/:memberId/test` | Auth + Admin | DB: Write | Input: params, body | Domain: members/admins
- `POST /api/admin/memberships/:memberId/archive` | Auth + Admin | DB: Write | Input: params, body | Domain: members/admins
- `POST /api/admin/memberships/:memberId/restore` | Auth + Admin | DB: Write | Input: params, body | Domain: members/admins
- `DELETE /api/admin/memberships/:memberId/hard` | Auth + Admin | DB: Write | Input: params, body | Domain: members/admins/billing | Risk: hard delete
- `GET /api/admin/memberships/overview` | Auth + Admin | DB: Read | Input: query | Domain: members/admins
- `GET /api/admin/memberships/duplicates` | Auth + Admin | DB: Read | Input: query | Domain: members/admins
- `GET /api/admin/analytics` | Auth + Admin | DB: Read | Input: query | Domain: admins/commissions/members/billing
- `GET /api/admin/reports/commission-run-summary` | Auth + Admin | DB: Read | Input: query | Domain: admins/commissions
- `POST /api/admin/reports/export` | Auth + Admin | DB: Read | Input: body | Domain: admins/commissions/members
- `PUT /api/admin/users/:userId` | Auth + Admin | DB: Write | Input: params, body | Domain: admins/agents
- `GET /api/agent/enrollments` | Auth + Agent/Admin | DB: Read | Input: query | Domain: agents/members
- `GET /api/agent/members` | Auth + Agent role | DB: Read | Input: query | Domain: agents/members/billing
- `GET /api/agent/failed-payments` | Auth + Agent role | DB: Read | Input: query | Domain: agents/payments/billing
- `GET /api/agent/members/:memberId` | Auth + Agent ownership check | DB: Read | Input: params | Domain: agents/members/billing
- `PUT /api/agent/members/:memberId` | Auth + Agent ownership check | DB: Write | Input: params, body | Domain: agents/members
- `PUT /api/agent/members/:memberId/subscription` | Auth + Agent ownership check | DB: Write | Input: params, body | Domain: agents/members/billing
- `POST /api/agent/members/:memberId/family` | Auth + Agent ownership check | DB: Write | Input: params, body | Domain: agents/members
- `GET /api/agent/stats` | Auth + Agent/Admin | DB: Read | Input: query | Domain: agents/commissions

#### App-level routes later in `registerRoutes`

- `POST /api/registration` | Public | DB: Write | Input: body, headers | Domain: members/agents/commissions/billing | Risk: high-value public enrollment write, SSN handling
- `POST /api/agent/enrollment` | `authMiddleware` + role checks | DB: Write | Input: body, headers | Domain: members/agents/commissions/billing
- `POST /api/family-enrollment` | Public | DB: Write | Input: body | Domain: members/billing | Risk: public enrollment write
- `GET /api/agent/enrollments` | Auth (`authMiddleware`) | DB: Read | Input: query | Domain: agents/members
- `GET /api/agent/stats` | Auth (`authMiddleware`) | DB: Read | Input: query | Domain: agents
- `GET /api/agent/commission-stats` | Auth (`authMiddleware`) | DB: Read | Input: query | Domain: commissions/agents
- `GET /api/agent/commissions` | Auth (`authMiddleware`) | DB: Read | Input: query | Domain: commissions/agents
- `GET /api/agent/commission-totals` | Auth (`authMiddleware`) | DB: Read | Input: query | Domain: commissions/agents
- `GET /api/agent/commission-ledger` | Auth (`authMiddleware`) | DB: Read | Input: query | Domain: commissions/agents
- `GET /api/admin/commission-ledger` | Auth (`authMiddleware`) + admin gate | DB: Read | Input: query | Domain: commissions/admins
- `GET /api/agent/lifecycle-alerts` | Auth (`authMiddleware`) | DB: Read | Input: query | Domain: members/billing/agents
- `GET /api/admin/commission-totals` | Auth (`authMiddleware`) + admin gate | DB: Read | Input: query | Domain: commissions/admins
- `GET /api/admin/lifecycle-alerts` | Auth (`authMiddleware`) + admin gate | DB: Read | Input: query | Domain: members/billing/admins
- `GET /api/admin/performance-goals` | Auth (`authMiddleware`) + admin gate | DB: Read | Input: query | Domain: admins/agents
- `PUT /api/admin/performance-goals/defaults` | Auth (`authMiddleware`) + admin gate | DB: Write | Input: body | Domain: admins/agents
- `PUT /api/admin/performance-goals/agent/:agentId` | Auth (`authMiddleware`) + admin gate | DB: Write | Input: params, body | Domain: admins/agents
- `DELETE /api/admin/performance-goals/agent/:agentId` | Auth (`authMiddleware`) + admin gate | DB: Write | Input: params | Domain: admins/agents
- `GET /api/agent/export-commissions` | Auth (`authMiddleware`) | DB: Read | Input: query | Domain: commissions/agents
- `GET /api/agent/:agentId` | Public | DB: Read | Input: params | Domain: agents | Risk: public agent enumeration
- `GET /api/admin/commissions` | Auth (`authMiddleware`) + admin gate | DB: Read | Input: query | Domain: commissions/admins
- `GET /api/admin/commissions/statement` | Auth (`authMiddleware`) + admin gate | DB: Read | Input: query | Domain: commissions/admins
- `GET /api/admin/commissions/export` | Auth (`authMiddleware`) + admin gate | DB: Read | Input: query | Domain: commissions/admins
- `POST /api/admin/commissions/ledger/sync` | Auth (`authMiddleware`) + admin gate | DB: Write | Input: body | Domain: commissions/admins
- `GET /api/admin/commissions/payout-dashboard` | Auth (`authMiddleware`) + admin gate | DB: Read | Input: query | Domain: commissions/admins/billing
- `POST /api/admin/commissions/payout-batches/generate` | Auth (`authMiddleware`) + admin gate | DB: Write | Input: body | Domain: commissions/admins/billing
- `GET /api/admin/commissions/payout-batches/:batchId` | Auth (`authMiddleware`) + admin gate | DB: Read | Input: params | Domain: commissions/admins
- `GET /api/admin/commissions/payout-batches/:batchId/statement` | Auth (`authMiddleware`) + admin gate | DB: Read | Input: params | Domain: commissions/admins
- `GET /api/admin/commissions/payout-batches/:batchId/export` | Auth (`authMiddleware`) + admin gate | DB: Read | Input: params, query | Domain: commissions/admins
- `POST /api/admin/commissions/payout-batches/:batchId/mark-paid` | Auth (`authMiddleware`) + admin gate | DB: Write | Input: params, body | Domain: commissions/admins/billing
- `POST /api/admin/commissions/payout-batches/:batchId/override-carry-forward` | Auth (`authMiddleware`) + admin gate | DB: Write | Input: params, body | Domain: commissions/admins
- `POST /api/admin/commissions/cancellations/apply` | Auth (`authMiddleware`) + admin gate | DB: Write | Input: body | Domain: commissions/admins/members
- `POST /api/admin/mark-commissions-paid` | Auth (`authMiddleware`) + admin gate | DB: Write | Input: body | Domain: commissions/admins/billing
- `POST /api/admin/commission/:commissionId/payout` | Auth (`authMiddleware`) + admin gate | DB: Write | Input: params, body | Domain: commissions/admins/billing
- `POST /api/admin/commissions/batch-payout` | Auth (`authMiddleware`) + admin gate | DB: Write | Input: body | Domain: commissions/admins/billing
- `GET /api/admin/commissions/payout-list` | Auth (`authMiddleware`) + admin gate | DB: Read | Input: query | Domain: commissions/admins
- `GET /api/admin/login-sessions` | Auth (`authMiddleware`) + admin gate | DB: Read | Input: query | Domain: admins
- `PUT /api/admin/users/:userId/role` | Auth (`authMiddleware`) + admin gate | DB: Write | Input: params, body | Domain: admins/agents
- `PUT /api/admin/users/:userId/agent-number` | Auth (`authMiddleware`) + admin gate | DB: Write | Input: params, body | Domain: admins/agents
- `PUT /api/admin/users/:userId` | Auth (`authMiddleware`) + admin gate | DB: Write | Input: params, body | Domain: admins/agents
- `PUT /api/admin/users/:userId/suspend` | Auth (`authMiddleware`) + admin gate | DB: Write | Input: params, body | Domain: admins/agents
- `PUT /api/admin/users/:userId/reactivate` | Auth (`authMiddleware`) + admin gate | DB: Write | Input: params, body | Domain: admins/agents
- `GET /api/user` | Auth | DB: Read | Input: headers/token | Domain: agents/admins
- `POST /api/send-confirmation-email` | Public | DB: None | Input: body | Domain: payments/members | Risk: unauthenticated email trigger
- `GET /api/payments/by-transaction/:transactionId` | Public | DB: Read | Input: params | Domain: payments/members/billing | Risk: transaction ID data exposure
- `POST /api/payments/force-status-update` | Auth | DB: Write | Input: body | Domain: payments/billing/admins
- `GET /api/payments/reconciliation/pending` | Auth | DB: Read | Input: query | Domain: payments/billing/admins
- `POST /api/payments/reconciliation/batch-update` | Auth | DB: Write | Input: body | Domain: payments/billing/admins
- `GET /api/admin/member/:memberId/sensitive` | Auth + Admin check | DB: Read | Input: params | Domain: members/admins | Risk: sensitive PII/SSN access
- `POST /api/admin/members/backfill-ssn-encryption` | Auth + Admin check | DB: Write | Input: body | Domain: members/admins | Risk: mass sensitive data transformation

### C. Additional route modules (`server/routes/*.ts`)

#### `ach-payment-routes.ts` (mounted at `/api/payments/ach`)

- `POST /api/payments/ach/initial` | Auth | DB: Read/Write | Input: body | Domain: payments/billing/members | Risk: bank account + routing ingestion
- `POST /api/payments/ach/recurring` | Auth | DB: Read/Write | Input: body | Domain: payments/billing/members
- `GET /api/payments/ach/member/:memberId` | Auth | DB: Read | Input: params | Domain: payments/members/billing

#### `admin-hierarchy.ts`

- `GET /api/admin/agents/hierarchy` | Auth + Admin | DB: Read | Input: query | Domain: admins/agents
- `POST /api/admin/agents/update-hierarchy` | Auth + Admin | DB: Write | Input: body | Domain: admins/agents/commissions

#### `admin-login-sessions.ts`

- `GET /api/admin/login-sessions` | Auth + Admin | DB: Read | Input: query | Domain: admins

#### `admin-logs.ts`

- `GET /api/admin/transaction-logs` | Auth + Admin | DB: Read | Input: query | Domain: admins/payments
- `GET /api/admin/export-logs` | Auth + Admin | DB: Read | Input: query | Domain: admins/payments

#### `admin-notifications.ts`

- `GET /api/admin/notifications` | Auth + Admin | DB: Read | Input: query | Domain: admins
- `POST /api/admin/notifications/:id/resolve` | Auth + Admin | DB: Write | Input: params, body | Domain: admins
- `GET /api/admin/notifications/count` | Auth + Admin | DB: Read | Input: query | Domain: admins

#### `admin-users.ts`

- `GET /api/admin/users` | Auth + Admin | DB: Read | Input: query | Domain: admins/agents
- `GET /api/admin/pending-users` | Auth + Admin | DB: Read | Input: query | Domain: admins/agents
- `POST /api/admin/approve-user/:userId` | Auth + Admin | DB: Write | Input: params, body | Domain: admins/agents

#### `debug-payments.ts` and `debug-recent-payments.ts`

- `GET /api/debug/test` | Public | DB: Read | Input: none | Domain: payments | Risk: debug route exposed
- `GET /api/debug/payments` | Public | DB: Read | Input: query | Domain: payments | Risk: payment data exposure
- `POST /api/debug/test-payment-creation` | Public | DB: Write | Input: body | Domain: payments | Risk: payment test write exposed
- `GET /api/debug/epx-config` | Public | DB: Read | Input: none | Domain: payments | Risk: config leakage
- `GET /api/debug/recent-payments` | Public | DB: Read | Input: query | Domain: payments | Risk: payment data exposure

#### `dev-utilities.ts`

- `GET /api/check-outbound-ip` | Public | DB: None | Input: none | Domain: none
- `POST /api/dev/create-test-accounts` | Dev-only guard | DB: Write | Input: body | Domain: admins/agents | Risk: environment guard bypass risk
- `POST /api/auth/reset-password-direct` | Dev-only guard | DB: Write | Input: body | Domain: admins/agents | Risk: direct password reset route
- `POST /api/dev/setup` | Dev-only guard | DB: Write | Input: body | Domain: admins/agents
- `GET /api/dev/user/:email` | Dev-only guard | DB: Read | Input: params | Domain: admins/agents
- `GET /api/dev/users` | Dev-only guard | DB: Read | Input: query | Domain: admins/agents
- `GET /api/dev/orphaned-auth-users` | Dev-only guard | DB: Read | Input: none | Domain: admins
- `DELETE /api/dev/orphaned-auth-user/:email` | Dev-only guard | DB: Write | Input: params | Domain: admins

#### `discount-codes.ts`

- `GET /api/discount-codes/validate` | Public | DB: Read | Input: query | Domain: billing/payments | Risk: brute-force code enumeration
- `GET /api/admin/discount-codes` | Auth + Admin | DB: Read | Input: query | Domain: admins/billing
- `POST /api/admin/discount-codes` | Auth + Admin | DB: Write | Input: body | Domain: admins/billing
- `PUT /api/admin/discount-codes/:id` | Auth + Admin | DB: Write | Input: params, body | Domain: admins/billing
- `PATCH /api/admin/discount-codes/:id/toggle` | Auth + Admin | DB: Write | Input: params, body | Domain: admins/billing
- `DELETE /api/admin/discount-codes/:id` | Auth + Admin | DB: Write | Input: params | Domain: admins/billing

#### `epx-certification.ts`

- `GET /api/epx/certification/logs` | Auth + SuperAdmin | DB: Read | Input: query | Domain: payments/admins
- `GET /api/epx/certification/logs/transaction/:transactionId` | Auth + SuperAdmin | DB: Read | Input: params | Domain: payments/admins
- `GET /api/epx/certification/callbacks` | Auth + SuperAdmin | DB: Read | Input: query | Domain: payments/admins
- `GET /api/epx/certification/payments` | Auth + SuperAdmin | DB: Read | Input: query | Domain: payments/admins
- `GET /api/epx/certification/report` | Auth + SuperAdmin | DB: Read | Input: query | Domain: payments/admins
- `GET /api/epx/certification/scheduler-preview` | Auth + SuperAdmin | DB: Read | Input: query | Domain: billing/admins
- `POST /api/epx/certification/export` | Auth + SuperAdmin | DB: Read | Input: body | Domain: payments/admins
- `GET /api/epx/certification/export-txt` | Auth + SuperAdmin | DB: Read | Input: query | Domain: payments/admins
- `GET /api/epx/certification/auth-guid` | Auth + SuperAdmin | DB: Read | Input: query | Domain: payments/admins
- `POST /api/epx/certification/server-post` | Auth + SuperAdmin | DB: Write | Input: body | Domain: payments/admins
- `POST /api/epx/certification/cancel-subscription` | Auth + SuperAdmin | DB: Write | Input: body | Domain: payments/billing/admins
- `GET /api/admin/payments/environment` | Auth + Admin | DB: Read | Input: query | Domain: payments/admins
- `POST /api/admin/payments/environment` | Auth + SuperAdmin | DB: Write | Input: body | Domain: payments/admins
- `POST /api/admin/payments/cancel-subscription` | Auth + SuperAdmin | DB: Write | Input: body | Domain: payments/billing/admins
- `POST /api/admin/payments/manual-transaction` | Auth + SuperAdmin | DB: Write | Input: body | Domain: payments/admins

#### `epx-hosted-routes.ts`

- `POST /api/epx/hosted/create-payment` | Public (with conditional role checks in payment-link mode) | DB: Read/Write | Input: body, headers | Domain: payments/billing/members/groups | Risk: primary payment initiation surface
- `POST /api/epx/hosted/complete` | Public | DB: Write | Input: body, webhook payload | Domain: payments/billing/commissions/members
- `POST /api/epx/hosted/record-failure` | Public | DB: Write | Input: body | Domain: payments/billing
- `POST /api/epx/hosted/callback` | Public webhook/callback | DB: Write | Input: headers, body (webhook payload) | Domain: payments/billing/commissions/members | Risk: callback authenticity critical
- `GET /api/epx/hosted/status/:transactionId` | Public | DB: Read | Input: params | Domain: payments/billing | Risk: transaction status exposure
- `GET /api/epx/logs/recent` | Public | DB: Read | Input: query | Domain: payments | Risk: sensitive log exposure
- `POST /api/epx/test-recurring` | Auth | DB: Write | Input: body | Domain: payments/billing
- `PUT /api/admin/payments/:id/status` | Auth + Admin path | DB: Write | Input: params, body | Domain: payments/admins/billing
- `POST /api/admin/members/:id/create-commission` | Auth + Admin path | DB: Write | Input: params, body | Domain: commissions/members/admins
- `POST /api/admin/commissions/repair` | Auth + Admin path | DB: Write | Input: body | Domain: commissions/admins
- `POST /api/admin/members/:id/sync-price` | Auth + Admin path | DB: Write | Input: params, body | Domain: billing/members/admins
- `POST /api/admin/members/:id/add-family-member` | Auth + Admin path | DB: Write | Input: params, body | Domain: members/admins

#### `epx-routes.ts`

- `POST /api/epx/create-payment` | Public | DB: None/indirect | Input: body | Domain: payments
- `GET /api/epx/redirect` | Public | DB: None | Input: query | Domain: payments
- `POST /api/epx/webhook` | Public webhook | DB: Write (intended) | Input: headers, webhook payload | Domain: payments/billing | Risk: signature validation optional by env
- `GET /api/epx/cancel` | Public | DB: None | Input: query | Domain: payments
- `GET /api/epx/debug-form` | Public | DB: None | Input: query | Domain: payments | Risk: debug data exposure
- `GET /api/epx/health` | Public | DB: None | Input: none | Domain: payments

#### `group-enrollment.ts`

- `GET /api/census-template` | Auth + group access middleware | DB: Read | Input: query | Domain: groups/admins
- `POST /api/admin/census-template` | Auth + Admin | DB: Write | Input: body | Domain: groups/admins
- `GET /api/admin/group-member-lifecycle-events` | Auth + Admin | DB: Read | Input: query | Domain: groups/admins/billing
- `GET /api/groups` | Auth + group access middleware | DB: Read | Input: query | Domain: groups/agents/admins
- `POST /api/admin/groups/cleanup-test-groups` | Auth + Admin | DB: Write | Input: body | Domain: groups/admins
- `POST /api/groups` | Auth + group access middleware | DB: Write | Input: body | Domain: groups
- `GET /api/groups/:groupId` | Auth + group access middleware | DB: Read | Input: params | Domain: groups
- `GET /api/groups/:groupId/commission-attribution` | Auth + Admin check | DB: Read | Input: params | Domain: groups/commissions/admins
- `PATCH /api/groups/:groupId/commission-attribution` | Auth + Admin check | DB: Write | Input: params, body | Domain: groups/commissions/admins
- `PATCH /api/groups/:groupId/effective-date` | Auth + Admin check | DB: Write | Input: params, body | Domain: groups/billing/admins
- `PATCH /api/groups/:groupId` | Auth + group access middleware | DB: Write | Input: params, body | Domain: groups
- `GET /api/groups/:groupId/assignment-history` | Auth + group access middleware | DB: Read | Input: params | Domain: groups/admins
- `POST /api/groups/:groupId/reassign` | Auth + Admin check | DB: Write | Input: params, body | Domain: groups/admins/agents
- `POST /api/groups/:groupId/members` | Auth + group access middleware | DB: Write | Input: params, body | Domain: groups/members
- `POST /api/groups/:groupId/members/bulk` | Auth + group access middleware | DB: Write | Input: params, body | Domain: groups/members
- `POST /api/groups/:groupId/members/sync` | Auth + group access middleware | DB: Write | Input: params, body | Domain: groups/members/billing
- `POST /api/groups/:groupId/documents` | Auth + group access middleware | DB: Write | Input: params, body | Domain: groups/admins
- `GET /api/groups/:groupId/members` | Auth + group access middleware | DB: Read | Input: params, query | Domain: groups/members
- `PATCH /api/groups/:groupId/members/:memberId` | Auth + group access middleware | DB: Write | Input: params, body | Domain: groups/members
- `DELETE /api/groups/:groupId/members/:memberId/ssn` | Auth + group access middleware | DB: Write | Input: params | Domain: groups/members | Risk: sensitive data mutation
- `DELETE /api/groups/:groupId/members/:memberId` | Auth + group access middleware | DB: Write | Input: params | Domain: groups/members
- `DELETE /api/groups/:groupId/members/:memberId/hard` | Auth + Admin check | DB: Write | Input: params | Domain: groups/members/admins | Risk: hard delete
- `POST /api/groups/:groupId/members/:memberId/restore` | Auth + group access middleware | DB: Write | Input: params, body | Domain: groups/members
- `POST /api/groups/:groupId/members/:memberId/payment` | Auth + group access middleware | DB: Write | Input: params, body | Domain: groups/payments/billing
- `POST /api/groups/:groupId/commission-pricing-repair` | Auth + Admin check | DB: Write | Input: params, body | Domain: groups/commissions/admins
- `POST /api/groups/:groupId/complete` | Auth + group access middleware | DB: Write | Input: params, body | Domain: groups/billing/members
- `POST /api/groups/:groupId/activate` | Auth + group access middleware | DB: Write | Input: params, body | Domain: groups/billing/members
- `POST /api/groups/:groupId/unlock` | Auth + group access middleware | DB: Write | Input: params, body | Domain: groups/admins

#### `payment-diagnostic.ts`

- `GET /api/admin/diagnostic/recurring-billing/status` | Auth + Admin/SuperAdmin check | DB: Read | Input: query | Domain: payments/billing/admins
- `POST /api/admin/diagnostic/recurring-billing/run-once` | Auth + SuperAdmin check | DB: Write | Input: body | Domain: payments/billing/admins
- `POST /api/admin/diagnostic/recurring-billing/operator-workflow` | Auth + SuperAdmin check | DB: Write | Input: body | Domain: payments/billing/admins
- `POST /api/admin/diagnostic/recurring-billing/repair-card-auth-guids` | Auth + SuperAdmin check | DB: Write | Input: body | Domain: payments/billing/admins
- `POST /api/admin/diagnostic/epx-approved-reconciliation` | Auth + SuperAdmin check | DB: Write | Input: body | Domain: payments/billing/admins
- `GET /api/admin/diagnostic/payment-execution/:memberId` | Auth + Admin check | DB: Read | Input: params, query | Domain: payments/billing/admins

#### `payment-reconciliation.ts`

- `GET /api/admin/reconciliation/missing-payments` | Auth + Admin check | DB: Read | Input: query | Domain: payments/billing/admins
- `GET /api/admin/reconciliation/missing-tokens` | Auth + Admin check | DB: Read | Input: query | Domain: payments/billing/admins
- `GET /api/admin/reconciliation/dashboard` | Auth + Admin check | DB: Read | Input: query | Domain: payments/billing/admins
- `POST /api/admin/reconciliation/create-manual-payment` | Auth + Admin check | DB: Write | Input: body | Domain: payments/billing/admins

#### `payment-tracking.ts`

- `GET /api/admin/payments/recent` | Auth + Admin check | DB: Read | Input: query | Domain: payments/admins
- `GET /api/admin/payments/member/:memberId` | Auth + Admin check | DB: Read | Input: params, query | Domain: payments/members/admins
- `GET /api/admin/payments/failed` | Auth + Admin check | DB: Read | Input: query | Domain: payments/admins/billing
- `POST /api/admin/payments/archive-stale` | Auth + Admin check | DB: Write | Input: body | Domain: payments/admins/billing
- `GET /api/admin/payments/stats` | Auth + Admin check | DB: Read | Input: query | Domain: payments/admins
- `GET /api/admin/enrollments-with-payments` | Auth + Admin check | DB: Read | Input: query | Domain: payments/members/admins
- `POST /api/admin/export-enrollments` | Auth + Admin check | DB: Read | Input: body | Domain: payments/members/admins

#### `payments.ts`

- `POST /api/payments/update-info` | Auth + Agent/Admin check | DB: Write | Input: body | Domain: payments/billing/members

#### `supabase-auth.ts`

- `GET /api/auth/me` | Public (token passed in header/body path-dependent) | DB: Read | Input: headers | Domain: auth/admins
- `POST /api/auth/login` | Public | DB: Read/Write | Input: body, headers | Domain: auth/admins/agents
- `POST /api/auth/register` | Public | DB: Write | Input: body | Domain: auth/admins/agents
- `POST /api/auth/logout` | Public | DB: Write | Input: body | Domain: auth
- `POST /api/admin/create-user` | Public route in file (must verify internal role enforcement) | DB: Write | Input: body | Domain: admins/agents | Risk: admin creation route exposure if guard weak
- `POST /change-password` | Public | DB: Write | Input: body | Domain: auth | Risk: non-namespaced auth endpoint

## 2) Webhook / Payment Callback Routes

- `POST /api/epx/webhook` (`server/routes/epx-routes.ts`) | public webhook payload + optional signature
- `POST /api/epx/hosted/callback` (`server/routes/epx-hosted-routes.ts`) | public callback payload, payment finalization path
- `POST /api/epx/hosted/complete` (`server/routes/epx-hosted-routes.ts`) | payment completion callback style path
- `POST /api/epx/hosted/record-failure` (`server/routes/epx-hosted-routes.ts`) | payment failure callback style path
- `POST /api/payments/reconciliation/batch-update` (`server/routes.ts`) | payment status reconciliation batch
- `POST /api/payments/force-status-update` (`server/routes.ts`) | manual payment status override

## 3) Admin Routes (prefix inventory)

All `GET/POST/PUT/PATCH/DELETE` routes under `/api/admin/*` appear across:

- `server/routes.ts`
- `server/routes/admin-hierarchy.ts`
- `server/routes/admin-login-sessions.ts`
- `server/routes/admin-logs.ts`
- `server/routes/admin-notifications.ts`
- `server/routes/admin-users.ts`
- `server/routes/discount-codes.ts`
- `server/routes/epx-certification.ts`
- `server/routes/epx-hosted-routes.ts`
- `server/routes/group-enrollment.ts`
- `server/routes/payment-diagnostic.ts`
- `server/routes/payment-reconciliation.ts`
- `server/routes/payment-tracking.ts`

Primary risk concentration:

- commission payout lifecycle controls
- manual payment state mutation
- sensitive member data retrieval/decryption
- destructive membership/group-member operations

## 4) Authentication / Authorization Middleware Inventory

### Middleware definitions

- `server/auth/supabaseAuth.ts`
  - `authenticateToken(req,res,next)`
- `server/routes.ts`
  - `authMiddleware` (local middleware inside `registerRoutes`)
  - `adminRequired` (local admin gate)
- `server/auth/roles.ts`
  - `hasAtLeastRole`, `isAtLeastAdmin`, role normalization helpers
- `server/middleware/permissions.ts`
  - `requireSuperAdmin`, `requireAdmin`, related permission utilities
- `server/routes/group-enrollment.ts`
  - `ensureGroupEnrollmentAccess`
- `server/routes/dev-utilities.ts`
  - `requireDevelopmentMode`
- `server/routes/epx-certification.ts`
  - local `requireRole('admin'/'super_admin')`

### Middleware usage pattern

- Most privileged routes use `authenticateToken` then in-handler role checks (`hasAtLeastRole`, `isAdmin`, `isSuperAdmin`).
- Some high-value public routes remain unauthenticated by design (`/api/registration`, `/api/public/*`, EPX callbacks).

## 5) Database Access Files

### Runtime application DB access

- `server/storage.ts` (primary data access layer; Supabase + raw SQL via `query`)
- `server/lib/supabaseClient.ts` (Supabase admin/service-role clients)
- `server/lib/neonDb.ts` (`pg` pool, raw `query`, transaction helper)
- `server/services/*` (multiple service files call storage/Supabase for payment and commission workflows)

### Route-level direct DB access (bypassing storage in places)

- `server/routes.ts` (direct `supabase.from(...)` and `storage.query(...)` in several handlers)
- `server/routes/epx-hosted-routes.ts`
- `server/routes/group-enrollment.ts`
- `server/routes/payment-*` modules

### Operational scripts with DB access

- `scripts/*.mjs` and `scripts/*.ts` (many Supabase service-role and `pg` scripts)
- `server/scripts/backfill-dependent-census-fields.mjs`

## 6) Raw SQL Usage Inventory

### SQL migration files

- `migrations/*.sql` (full migration set; includes schema changes, RLS, commission/billing/payment updates)

### Raw SQL in TypeScript/JS runtime

- `server/storage.ts`
  - extensive `query('SELECT ...')`, `query('UPDATE ...')`, `query('DELETE ...')`, dynamic SQL construction
  - direct transactional deletion workflow in hard-delete path
- `server/lib/neonDb.ts`
  - generic `query(text, params)` and transaction wrapper

### Raw SQL in scripts

- `scripts/apply-rls-fix.mjs`
- `scripts/apply-ledger-schema-direct.mjs`
- `scripts/apply-commission-unit-uniqueness.mjs`
- `scripts/controlled-ledger-rehearsal.mjs`
- `scripts/audit-commission-unit-uniqueness.mjs`
- other scripts that call `supabase.rpc('exec_sql', ...)` or `pg.Client.query(...)`

## 7) Supabase / Postgres Usage Inventory

### Supabase clients and access paths

- `server/lib/supabaseClient.ts` (service-role client setup)
- heavy `.from(...)` usage in:
  - `server/storage.ts`
  - `server/routes.ts`
  - `server/routes/group-enrollment.ts`
  - `server/routes/epx-hosted-routes.ts`
  - `server/routes/supabase-auth.ts`
  - `server/routes/payment-*.ts`
- scripts: broad Supabase usage in `scripts/*.mjs` and `scripts/*.ts`

### Postgres (`pg`) direct usage

- `server/lib/neonDb.ts` (`Pool`)
- `server/storage.ts` (imports `neonPool`, `query`)
- scripts using direct `pg.Client`

## 8) Obvious Risk Notes

- Public high-impact enrollment/payment endpoints:
  - `/api/registration`, `/api/family-enrollment`, `/api/public/leads`, `/api/public/partner-leads`, `/api/epx/hosted/*`, `/api/epx/webhook`.
- Sensitive data handling paths:
  - SSN/bank info decrypt/update routes in `server/routes.ts` and group-member SSN routes in `group-enrollment.ts`.
- Debug/test routes exposed in production path namespace (`/api/debug/*`, `/api/test-*`) increase reconnaissance and misuse risk.
- Financial/admin mutation routes are numerous and high impact; rely heavily on in-handler role checks.
- Mixed data-access style (storage layer + route-level direct Supabase + raw SQL) increases consistency/audit complexity.
- Hard-delete endpoints and batch payout operations can cause irreversible financial/data integrity impact if misused.

## 9) Route Files Discovered

- `server/routes.ts`
- `server/routes/ach-payment-routes.ts`
- `server/routes/admin-hierarchy.ts`
- `server/routes/admin-login-sessions.ts`
- `server/routes/admin-logs.ts`
- `server/routes/admin-notifications.ts`
- `server/routes/admin-users.ts`
- `server/routes/debug-payments.ts`
- `server/routes/debug-recent-payments.ts`
- `server/routes/dev-utilities.ts`
- `server/routes/discount-codes.ts`
- `server/routes/epx-certification.ts`
- `server/routes/epx-hosted-routes.ts`
- `server/routes/epx-routes.ts`
- `server/routes/group-enrollment.ts`
- `server/routes/payment-diagnostic.ts`
- `server/routes/payment-reconciliation.ts`
- `server/routes/payment-tracking.ts`
- `server/routes/payments.ts`
- `server/routes/supabase-auth.ts`
- `server/index.ts` (health/readiness and fallback handler)

## 10) Notes on Coverage

- Inventory is based on static route declaration scan in `server/**/*.ts`.
- Non-API fallback route (`app.get('*')`) is excluded from business-domain categorization.
- For routes with conditional role checks inside handlers, protection is marked by observed logic rather than decorator-only middleware.
