# GetMyDPC Enrollment Platform — Developer Overview

> Last updated: April 30, 2026 · Branch: `main`

---

## 1. What This Platform Does

This is a **Direct Primary Care (DPC) membership enrollment platform** for **MyPremierPlan (MPP)**. It handles:

- Public-facing member enrollment (individual, family, group)
- Agent/broker portal (leads, commissions, failed payments)
- Admin back-office (enrollments, users, payments, analytics, certifications)
- Payment processing via EPX (credit card + ACH)
- Automated recurring monthly billing
- Agent commission tracking and payout CSV export

---

## 2. Deployment Architecture

```
Internet
  │
  ├── enrollment.getmydpc.com
  │     └── DigitalOcean App Platform
  │           ├── Static Frontend  (React/Vite build → client/dist/)
  │           └── Backend API      (Node/Express → dist/index.js)
  │
  ├── Supabase (PostgreSQL + Auth)
  │     ├── supabase.auth  — JWT sessions, password reset, email verification
  │     └── PostgreSQL     — All business data
  │
  └── EPX (External payment processor)
        ├── Hosted Checkout  (initial enrollment payments — active)
        └── Server Post      (recurring billing + ACH — active)
```

**Critical:** Frontend always calls the backend via `VITE_API_URL` — never assumes same-origin. All API traffic flows through `client/src/lib/apiClient.ts`.

---

## 3. Frontend

**Stack:** React 18 · TypeScript · Vite · Wouter (routing) · TanStack Query · React Hook Form + Zod · Tailwind CSS + shadcn/ui

### 3a. Entry Points

| File | Purpose |
|---|---|
| `client/src/main.tsx` | App bootstrap |
| `client/src/App.tsx` | Root router, auth gate, all route definitions |
| `client/src/pages/landing.tsx` | Public marketing/entry page |

### 3b. Page Groups

**Public (no login)**

| Page | Route | Purpose |
|---|---|---|
| `landing.tsx` | `/` | Entry, plan overview, CTA |
| `quiz.tsx` | `/quiz` | Plan selector quiz |
| `registration.tsx` | `/registration` | Individual enrollment form |
| `family-enrollment.tsx` | `/family-enrollment` | Family plan enrollment |
| `group-enrollment.tsx` | `/group-enrollment` | Employer/group enrollment |
| `payment.tsx` | `/payment` | Hosted EPX checkout |
| `payment-success/failed/cancel` | `/payment/*` | Post-payment landing pages |
| `payment-callback.tsx` | `/payment/callback` | EPX callback handler |
| `login.tsx` / `register.tsx` | `/login`, `/register` | Auth pages for agents/admins |
| `forgot-password`, `reset-password` | `/forgot-password`, `/reset-password` | Supabase-backed password flow |

**Agent Portal** (role: `agent` or above)

| Page | Route | Purpose |
|---|---|---|
| `agent-dashboard.tsx` | `/agent` | KPIs, quick actions |
| `agent-leads.tsx` | `/agent/leads` | Lead list, create/edit/submit |
| `agent-commissions.tsx` | `/agent/commissions` | Commission history, filters, totals |
| `agent-failed-payments.tsx` | `/agent/failed-payments` | Failed payment list, retry dialog |

**Admin Back-Office** (role: `admin` or above)

| Page | Route | Purpose |
|---|---|---|
| `admin.tsx` | `/admin` | Dashboard, system health |
| `admin-enrollments.tsx` | `/admin/enrollments` | All member enrollments, search, status |
| `admin-leads.tsx` | `/admin/leads` | All leads across agents |
| `admin-users.tsx` | `/admin/users` | Agent/admin user CRUD |
| `admin-commissions.tsx` | `/admin/commissions` | Commission ledger, payout batches, export |
| `admin-analytics.tsx` | `/admin/analytics` | Revenue, enrollment, agent performance |
| `admin-recent-payments.tsx` | `/admin/payments/recent` | Recent payment transactions |
| `admin-failed-payments.tsx` | `/admin/payments/failed` | Failed payments across all members |
| `admin-agent-hierarchy.tsx` | `/admin/agent-hierarchy` | Upline/downline agent tree |
| `admin-discount-codes.tsx` | `/admin/discount-codes` | Promo/discount code management |
| `admin-performance-goals.tsx` | `/admin/performance-goals` | Agent KPI targets |
| `admin-notifications.tsx` | `/admin/notifications` | System notifications |
| `admin-payment-checkout.tsx` | `/admin/payments/checkout` | Manual payment entry |
| `admin-epx-certification.tsx` | `/admin/epx-certification` | EPX certification toolkit (super_admin only) |
| `enrollment-details.tsx` | `/admin/enrollment/:id` | Full enrollment detail view |

### 3c. Hook Architecture

All pages follow a consistent 3-hook extraction pattern:

```
page.tsx
 ├── useXxxFilters.ts     — filter/UI state (search, date range, status dropdowns)
 ├── useXxxQueries.ts     — TanStack Query fetches (useQuery)
 ├── useXxxMutations.ts   — useMutation calls (create/update/delete/actions)
 └── useXxxDerived.ts     — computed/memoized values from query data
```

Full hooks inventory in `client/src/hooks/`:

| Hook File(s) | Serves |
|---|---|
| `useAdminUsersQueries` / `Mutations` / `DialogState` / `Management` | `admin-users` |
| `useAdminCommissionsFilters` / `Queries` / `Mutations` / `Derived` | `admin-commissions` |
| `useAdminAnalyticsQuery` | `admin-analytics` |
| `useAdminDashboardMetrics` | `admin` dashboard |
| `useAdminEPXOperations` | Admin EPX ops |
| `useAdminPartnerLeads` | `admin-leads` |
| `useAdminRecurringBilling` | Recurring billing data |
| `useAgentCommissionsFilters` / `Queries` / `Derived` | `agent-commissions` |
| `useAgentDashboardFilters` / `Queries` / `Mutations` / `UiState` | `agent-dashboard` |
| `useAgentLeadsQueries` / `Mutations` | `agent-leads` |
| `useAgentFailedPaymentsQuery` | `agent-failed-payments` |
| `useEpxCertificationQueries` / `Mutations` | `admin-epx-certification` |
| `useEnrollmentData` / `Filters` / `Formatters` / `Mutations` / `Queries` | `enrollment-details` |
| `useAuth` | Global — Supabase auth state |

### 3d. Key Library Files

| File | Purpose |
|---|---|
| `client/src/lib/apiClient.ts` | HTTP client — attaches Supabase JWT, resolves against `VITE_API_URL` |
| `client/src/lib/queryClient.ts` | TanStack Query client + `apiRequest` helper |
| `client/src/lib/supabase.ts` | Supabase browser client, token refresh setup |
| `client/src/lib/roles.ts` | `hasAtLeastRole()` — role comparison utility |

### 3e. Key Components

| Component | Purpose |
|---|---|
| `AppShell.tsx` | Main layout with responsive sidebar + mobile drawer nav |
| `DashboardLayout.tsx` | Inner layout wrapper for dashboard pages |
| `EPXHostedPayment.tsx` | Renders EPX hosted checkout iframe/widget |
| `SessionManager.tsx` | Supabase token refresh + session expiry handling |
| `BankAccountForm.tsx` | ACH bank account entry |
| `onboarding-wizard.tsx` | New agent onboarding flow |
| `admin/` | Admin-specific dialog components |
| `group-enrollment/` | Multi-step group enrollment form components |

---

## 4. Backend (Express API)

**Stack:** Node.js · Express · TypeScript · Supabase client · node-cron

Entry: `server/index.ts` → registers all route files + starts schedulers.

### 4a. Route Files

| File | Prefix | Purpose |
|---|---|---|
| `server/routes.ts` | `/api/...` | Main file — members, agents, leads, commissions, admin ops |
| `routes/supabase-auth.ts` | `/api/auth/...` | Login, register, password, email verify |
| `routes/epx-hosted-routes.ts` | `/api/epx/hosted/...` | EPX hosted checkout session + callbacks |
| `routes/epx-certification.ts` | `/api/epx/certification/...` | Certification toolkit (server post, logs, export) |
| `routes/payments.ts` | `/api/payments/...` | General payment endpoints |
| `routes/ach-payment-routes.ts` | `/api/payments/ach/...` | ACH recurring payments |
| `routes/discount-codes.ts` | `/api/discount-codes/...` | Promo code CRUD + validation |
| `routes/group-enrollment.ts` | `/api/groups/...` | Group enrollment operations |
| `routes/admin-logs.ts` | `/api/admin/logs/...` | Admin audit log viewer |
| `routes/admin-notifications.ts` | `/api/admin/notifications/...` | Notification management |
| `routes/payment-reconciliation.ts` | `/api/payments/reconcile/...` | Payment reconciliation tools |
| `routes/payment-diagnostic.ts` | `/api/payments/diagnostic/...` | Payment health diagnostics |
| `routes/payment-tracking.ts` | `/api/payments/tracking/...` | Payment status tracking |

### 4b. Auth Middleware

```typescript
// server/auth/supabaseAuth.ts
authenticateToken(req, res, next)
// Validates Bearer JWT from Supabase, attaches req.user = { id, email, role, ... }
```

Role hierarchy (ascending): `agent` → `admin` → `super_admin`

`hasAtLeastRole()` in `server/auth/roles.ts` gates all protected endpoints.

### 4c. Services Layer

| Service | Purpose |
|---|---|
| `epx-hosted-checkout-service.ts` | Builds EPX hosted sessions (PublicKey-based, no TAC needed) |
| `epx-payment-service.ts` | EPX Server Post — charges, captures, voids, refunds |
| `epx-service-selector.ts` | Routes to sandbox vs production EPX endpoint |
| `payment-service.ts` | Full payment orchestration (validate → EPX → persist) |
| `payment-environment-service.ts` | Reads `PAYMENT_ENVIRONMENT`, gates sandbox/production |
| `membership-activation-service.ts` | Daily: promotes `pending_activation` → `active` when start date reached |
| `recurring-billing-scheduler.ts` | Hourly: queries due subscriptions, fires EPX Server Post charges |
| `commission-ledger-service.ts` | Payout batches (1st/15th cycle), per-agent totals, CSV export |
| `commission-payout-service.ts` | Marks batches paid, handles overrides and carry-forwards |
| `recurring-post-success-persistence.ts` | Persists successful recurring billing results to DB |
| `certification-logger.ts` | Captures EPX request/response pairs for certification evidence |
| `epx-payment-logger.ts` | Audit log for all EPX transactions |
| `weekly-recap-service.ts` | Sends weekly admin summary emails |
| `group-payment-transition-service.ts` | Handles group payment method changes |

### 4d. Background Schedulers

All started in `server/index.ts` at boot:

```
server startup
  ├── scheduleMembershipActivation()   — daily, pending_activation → active
  ├── scheduleRecurringBilling()       — hourly (or fixed 8am/8pm CT)
  │     BILLING_SCHEDULER_ENABLED=true  (LIVE)
  │     BILLING_SCHEDULER_DRY_RUN=false (LIVE — actually charges)
  └── WeeklyRecapService               — weekly admin recap emails
```

---

## 5. Data Layer

**Database:** Supabase PostgreSQL. Two server-side clients:

| Client | File | Used For |
|---|---|---|
| `supabaseAdmin` | `server/lib/supabaseClient.ts` | All server DB ops (bypasses RLS) |
| `supabase` (anon) | `server/lib/supabaseClient.ts` | Auth operations |
| `neonPool` | `server/lib/neonDb.ts` | Legacy alias for same Supabase connection — used in some older dashboard queries |

**Rule:** All DB operations go through `server/storage.ts` functions. Never write raw Drizzle ORM queries directly in routes. `shared/schema.ts` is for TypeScript type inference only.

### 5a. Core Tables

| Table | Contents |
|---|---|
| `users` | Agents + admins — login, roles, agent numbers (`MPP0001`+), hierarchy, bank info |
| `members` | Enrolled DPC customers — personal info, plan, SSN (encrypted), EPX tokens, status |
| `leads` | Pre-enrollment contact forms submitted by agents |
| `agent_commissions` | Per-enrollment commission records with scheduled/paid dates |
| `commission_payouts` | Payout batch records (1st-cycle / 15th-cycle) |
| `commission_ledger` | Double-entry ledger: earned → queued → paid |
| `subscriptions` | Recurring billing records — method type, next billing date, status |
| `recurring_billing_log` | Full audit of every recurring billing attempt |
| `payments` | All payment transactions (initial + recurring) |
| `groups` | Employer/group enrollment profiles |
| `group_members` | Individual members under a group |
| `discount_codes` | Promo codes — value, usage limits, expiry |
| `admin_logs` | Audit trail for admin actions |
| `admin_notifications` | In-app notifications for admin users |
| `agent_performance_goals` | KPI targets per agent |

### 5b. Member Status Lifecycle

```
lead → enrolled → pending_activation → active → suspended / cancelled
```

### 5c. Encryption

SSNs and payment tokens are **AES-256-CBC encrypted at rest** via helpers in `server/storage.ts`:

- `encryptSensitiveData()` / `decryptSensitiveData()`
- `encryptPaymentToken()` / `decryptPaymentToken()`
- Key sourced from `ENCRYPTION_KEY` env var (must be 64 hex chars = 32 bytes)

---

## 6. Payment Flows

### 6a. Initial Enrollment (Hosted Checkout)

```
1. Member completes enrollment form → POST /api/enroll
2. Server creates member record (status: enrolled)
3. Frontend loads EPXHostedPayment component
4. Server generates EPX hosted session (publicKey + orderNumber)
5. EPX iframe collects card → EPX processes payment
6. EPX POSTs callback to /api/epx/hosted/callback
7. Server validates, updates member → pending_activation
8. Commission calculated → inserted into agent_commissions
9. Confirmation email sent (SendGrid)
10. Member redirected to /payment/success
```

### 6b. Recurring Billing (Automated — LIVE)

```
Scheduler wakes (hourly or fixed 8am/8pm CT)
  → queries subscriptions WHERE next_billing_date <= today AND status = active
  → for each due subscription:
      → EPX Server Post (token-based, no card re-entry)
      → success: update next_billing_date, log to recurring_billing_log
      → soft decline: retry in 1 day
      → hard decline: retry in 2 days
      → 3 consecutive failures: suspend member, notify admin
```

### 6c. ACH Payments (LIVE)

Same Server Post path with ACH credentials. All three gates enabled in production:

```
ACH_RECURRING_ENABLED=true
ACH_RECURRING_ALLOW_PRODUCTION=true
ACH_RECURRING_TEST_MODE=false
```

---

## 7. Commission System

```
Enrollment payment captured
  → calculateCommission(planName, memberType, hasRxValet)
  → INSERT agent_commissions (status: scheduled, date: next 1st or 15th)

Commission Ledger Sync (manual or scheduled)
  → syncCommissionLedgerFromFeed()
  → builds earned → queued entries in commission_ledger

Payout Batch (admin action)
  → buildDraftPayoutBatches()       — groups by agent, applies $25 minimum threshold
  → prepareBatchForExport()
  → buildQuickBooksCsvFromBatch()   or   buildHexonaCsvFromBatch()
  → admin downloads CSV → pays agents externally
  → markBatchAsPaid()
```

### Commission Rates (`server/commissionCalculator.ts`)

| Plan | EE (Member Only) | ESP (+ Spouse) | ECH (+ Child) | FAM (Family) |
|---|---|---|---|---|
| MyPremierPlan Base | $9 | $15 | $17 | $17 |
| MyPremierPlan+ | $20 | $40 | $40 | $40 |
| MyPremierPlan Elite | $20 | $40 | $40 | $40 |

ProChoice Rx (RxValet) add-on: **+$2.50** on all plan types.

Payout cycles: **1st of month** and **15th of month**. Minimum threshold: **$25/agent**.

---

## 8. Email (SendGrid)

`server/email.ts` and `server/utils/notifications.ts` handle:

- Lead submission confirmation (to agent + ops team)
- New member enrollment confirmation
- Agent credential emails (on account creation)
- Email verification links
- Recurring billing cycle reports
- Weekly admin recap

---

## 9. Environment Variables

| Variable | Purpose | Production Value |
|---|---|---|
| `DATABASE_URL` | Supabase PostgreSQL connection | Supabase connection string |
| `SUPABASE_URL` | Supabase project URL | Set in DO |
| `SUPABASE_ANON_KEY` | Supabase anon key | Set in DO |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role (bypasses RLS) | Set in DO |
| `VITE_API_URL` | Frontend → backend URL | `https://enrollment.getmydpc.com` |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Frontend Supabase auth | Set in DO |
| `ENCRYPTION_KEY` | AES-256 key for SSN/token encryption | 64 hex chars |
| `EPX_PUBLIC_KEY` | EPX hosted checkout | Set in DO |
| `EPX_TERMINAL_PROFILE_ID` | EPX terminal | Set in DO |
| `EPX_MERCHANT_ID` / `EPX_USERNAME` / `EPX_PASSWORD` | EPX Server Post auth | Set in DO |
| `PAYMENT_ENVIRONMENT` | `sandbox` or `production` | `production` |
| `BILLING_SCHEDULER_ENABLED` | Activate recurring billing cron | `true` |
| `BILLING_SCHEDULER_DRY_RUN` | `false` = actually charges | `false` |
| `ACH_RECURRING_ENABLED` | Enable ACH recurring path | `true` |
| `ACH_RECURRING_ALLOW_PRODUCTION` | Extra production safety gate | `true` |
| `SENDGRID_API_KEY` | Email delivery | Set in DO |

All production vars are set directly in **DigitalOcean App Platform → Settings → Environment Variables**.

---

## 10. Local Development

```bash
# Install server dependencies
npm install

# Install frontend dependencies
cd client && npm install

# Run both frontend (Vite :5173) and backend (:5000) concurrently
npm run dev

# Build everything (server + client)
npm run build:all

# Push schema changes to Supabase
npm run db:push

# Audit ACH go-live readiness
node scripts/audit-ach-go-live.mjs
```

---

## 11. Project Status

### Complete and Live

- Full enrollment flow (individual, family, group)
- Agent portal (leads, commissions, failed payments)
- Admin back-office (all pages)
- EPX Hosted Checkout (production)
- EPX Server Post recurring billing (production, live charges)
- ACH recurring billing (production, live)
- Commission ledger + payout batch CSV export
- Membership activation scheduler
- Frontend refactoring — hook extraction complete (Waves 1–4)

### Known Tech Debt

| Item | Location | Notes |
|---|---|---|
| `@ts-nocheck` at top | `server/routes.ts` | Large legacy file, TypeScript strictness suppressed |
| `neonDb.ts` naming | `server/lib/neonDb.ts` | Legacy name — actually connects to Supabase now |
| EPX Server Post TS warnings | `server/services/epx-payment-service.ts` | Expected, inactive path |

---

## 12. Key Conventions

- **No Drizzle ORM in routes** — use `storage.ts` functions only
- **All frontend API calls** go through `client/src/lib/apiClient.ts`
- **Agent numbers** format: `MPP0001`, `MPP0002`, etc.
- **Phone numbers** stored as 10 digits (no formatting), formatted on display
- **SSNs** always encrypted before DB insert, decrypted only for display/masking
- **DOB** stored as `MMDDYYYY` 8-char string
- **State** stored as 2-char code (`TX`, `CA`)
