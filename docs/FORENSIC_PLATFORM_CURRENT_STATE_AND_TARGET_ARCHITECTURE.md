# MPP Platform Forensic Audit and Target Architecture

**Audit date:** 2026-08-20  
**Audit type:** Read-only current-state assessment  
**Baseline:** `3a27e8e`  
**Scope:** Application data flow, API ownership, database/query behavior, user workflows, lifecycle integrity, and a practical target design for rebuilding the product around the existing infrastructure.

No code, database financial data, EPX behavior, or reconciliation settings were changed during this audit.

## Executive Summary

The platform is operational but has accumulated several implementation generations. The current system is best described as a working platform with a compatibility layer that has grown into the center of the product.

The main risk is not that the application lacks features. It is that the same business concept can be assembled, named, filtered, and displayed differently in different places.

The highest-risk areas are:

1. Duplicate and overlapping route registration in `server/routes.ts`.
2. Compatibility-shaped member/enrollment payloads with many aliases for the same state.
3. Member-to-commission joins that can multiply member rows.
4. Dashboard metrics assembled from multiple independent requests and sources.
5. Business-state interpretation split between server and frontend.
6. A large agent dashboard combining overview, member operations, lifecycle tasks, filters, exports, and admin scope controls.
7. A lifecycle that crosses `members`, `subscriptions`, `payments`, `agent_commissions`, `commission_ledger`, payout batches, and cancellation/refund metadata without one unified member timeline.

The recommended direction is not a greenfield rewrite. EPX, DigitalOcean, Supabase/PostgreSQL, React, Express, and the authoritative commission ledger should remain. The application layer around them should progressively become a clear domain-oriented system.

## Status and Confidence

| Area | Current assessment | Confidence |
| --- | --- | --- |
| Deployment foundation | Healthy and retained | High |
| EPX boundary | Existing integration is active and should remain isolated | High |
| Commission authority | `commission_ledger` is the intended authoritative current balance source | High |
| Historical cutover | Persisted and verified | High |
| Agent dashboard data contract | Compatibility-heavy and fragmented | High |
| Duplicate route ownership | Present in `server/routes.ts` | High |
| Join multiplication risk | Present in member queries joining raw commission rows | High |
| Full production lifecycle correctness | Not fully proven end-to-end | Medium |
| Service usage/refund history | Incomplete for historical records | High |

## 1. Application Map

### Primary User-Facing Areas

| Surface | Purpose | Main client requests | Backend/data owner |
| --- | --- | --- | --- |
| Agent Dashboard (`/agent`) | Performance overview, enrollments, filters, member actions, agent scope | `/api/agent/stats`, `/api/agent/enrollments`, `/api/plans`, `/api/agent/lifecycle-alerts`, `/api/agents` for scope users | `server/routes.ts`, `storage.getAgentEnrollments`, stats route helpers, lifecycle helpers |
| Agent Commissions (`/agent/commissions`) | Legacy/expanded commission table, lifecycle alerts, filters, exports | `/api/agent/commission-totals`, `/api/agent/commissions`, `/api/agent/commission-ledger`, lifecycle endpoints, `/api/agents` | `server/routes.ts`, `storage`, `commission-ledger-service` |
| Commission Center (`/agent/commission-center`) | Authoritative ledger balances and transactions | `/api/agent/commission-center` | `financial-exceptions.ts`, `commission-center-aggregation-service`, `commission_ledger` |
| Agent Leads (`/agent/leads`) | Lead creation, contact, assignment, follow-up | `/api/leads`, lead detail/activity endpoints | `server/routes.ts`, lead storage and activity queries |
| Agent Failed Payments | Payment issue follow-up | failed-payment endpoints | payment tracking routes and payment tables |
| Registration/enrollment | New member intake and payment initiation | registration, plan, payment, hosted checkout endpoints | registration pages, EPX hosted routes, PaymentConfirmedService |
| Admin Dashboard | Operational summary and shortcuts | many independent dashboard, analytics, alerts, payment, user, and lifecycle requests | `server/routes.ts`, admin route modules, storage |
| Admin Enrollments | Search, inspect, edit, archive, cancel/reactivate members | enrollment/member/subscription endpoints | `server/routes.ts`, `storage.ts` |
| Admin Users | User management and View-as-Agent | admin users and impersonation endpoints | `admin-users.ts`, `supabaseAuth.ts`, impersonation sessions |
| Admin Payments | Payment review, status, manual actions | payment tracking, failed payments, refund tools | payment-tracking routes, EPX service, admin pages |
| Admin Commissions | Legacy commission management and payout operations | commission, ledger, payout-batch, exception endpoints | `routes.ts`, `commission-ledger-service`, storage |
| Admin Financial Operations | Financial exceptions and controlled retries | `/api/admin/financial-exceptions/*` | financial reconciliation service/routes |
| Admin Analytics | Reporting and operational aggregates | analytics endpoints | storage/reporting queries |
| Group Enrollment | Group census, group members, lifecycle transitions | `/api/groups/*`, group payment routes | `group-enrollment.ts`, group services |

### Representative Call Chain

```text
AgentDashboard
  -> useAgentDashboardQueries
  -> /api/agent/enrollments
  -> route registration in server/routes.ts
  -> storage.getAgentEnrollments
  -> members LEFT JOIN plans LEFT JOIN agent_commissions
  -> compatibility-shaped enrollment object
  -> dashboard table and filters
```

```text
CommissionCenter
  -> /api/agent/commission-center
  -> financial-exceptions.ts
  -> getCommissionCenterAggregation
  -> commission_ledger + payout batches + payments
  -> agent writing/override buckets and transactions
```

```text
View-as-Agent
  -> admin impersonation start
  -> impersonation_sessions
  -> authenticateToken
  -> req.realUser = original actor
  -> req.user = effective viewed agent
  -> scoped agent endpoints
```

## 2. Data Lineage

### Active Members

- **Source:** `members.status`, `members.is_active`.
- **Joins:** Often joined to `plans`, `subscriptions`, and commissions.
- **Filtering:** Varies by route. Some routes use `status`, some use `is_active`, some use both.
- **Transformations:** Mapped into `isActive`, `status`, and lifecycle summaries.
- **UI:** Dashboard enrollment status, admin enrollment status, lifecycle badges.
- **Risk:** `status` and `is_active` can disagree; different endpoints choose different authority.

### Enrollment Counts

- **Source:** Usually `members`; some admin analytics also combine group-member populations.
- **Filtering:** Date range commonly uses `created_at`; other screens use enrollment/payment/effective dates.
- **Transformations:** Counts may be calculated in storage, route handlers, or client-derived filters.
- **Risk:** A member with multiple `agent_commissions` rows can be duplicated by a raw join before counting.

### Pending Enrollments

- **Source:** `subscriptions.pending_reason`, `pending_details`, enrollment status fields, and lifecycle summary logic.
- **UI:** Dashboard pending filters and resolution dialog.
- **Risk:** “Pending” is overloaded: it can mean incomplete enrollment, pending consent, pending payment, pending billing, or a pending membership action.

### Plan Totals

- **Source:** `members.plan_id` joined to `plans`; group rows use group metadata and group-member data.
- **Transformations:** Plan name and price are flattened into enrollment payloads.
- **Risk:** Individual and group plan concepts do not share one normalized read model.

### Monthly Production / Agent Production

- **Source:** Primarily members/enrollment records and commission records, depending on endpoint.
- **Filtering:** Date windows vary between `created_at`, payment dates, effective dates, and reporting dates.
- **Transformations:** Server aggregation is mixed with frontend display calculations.
- **Risk:** “Production” is not one canonical metric. A dashboard count and a commission report can represent different populations while using similar labels.

### Commissions Earned

- **Current authority:** `commission_ledger` for Commission Center.
- **Legacy/compatibility sources:** `agent_commissions` remains used by several stats and legacy pages.
- **Statuses:** `earned` is displayed as pending/earned in some surfaces.
- **Risk:** Commission totals can differ between legacy Agent Commissions and Commission Center.

### Commissions Payable

- **Source:** `commission_ledger.status = queued` and payout-batch assignment logic.
- **Transformations:** Threshold and cycle logic occur in `commission-ledger-service`.
- **UI:** Commission Center payable bucket and agent commission scheduled status.
- **Risk:** Multiple status vocabularies translate the same ledger state differently.

### Commissions Paid

- **Source:** `commission_ledger.status = paid` and payout batch `paid_at`.
- **Legacy:** Historical `commission_payouts` remains preserved but is not the active writer.
- **Risk:** A user can see legacy paid history and current ledger-paid history through different screens.

### Payment Status

- **Source:** `payments.status`, `agent_commissions.payment_status`, and payment-processing state columns.
- **Transformations:** Several normalization helpers map provider/application labels.
- **Risk:** `payment_status`, `commission_status`, and `commission_processing_status` are distinct concepts but are frequently flattened or aliased.

### Membership Status

- **Source:** `members.status`, `members.is_active`, `subscriptions.status`, and pending action fields.
- **UI:** Lifecycle badges, enrollment table, admin pages.
- **Risk:** No single server-owned membership state object consistently resolves conflicts.

### Cancellation Status

- **Source:** `members.cancellation_date`, `cancellation_reason`, controlled reason code, effective/requested timestamps, and `subscriptions.pending_reason`.
- **Transformations:** Safe agent-facing reason mapping occurs client-side.
- **Risk:** Historical freeform reasons and new controlled reason codes coexist.

### Refund Status

- **Source:** `members.refund_eligibility`, `refund_eligibility_reason`, `refund_status`, service usage fields.
- **Rule owner:** cancellation/refund eligibility service.
- **Commission consumer:** commission ledger service now consumes stored decision state rather than recalculating the old date-only rule.
- **Risk:** Full real-world refund completion and denial workflows remain unproven with production transactions.

### Effective Date

- **Sources:** `members.membership_start_date`, subscription dates, payment confirmation timestamps, and commission effective/period dates.
- **Risk:** “Effective date” can mean membership start, billing start, commission earning period, or cancellation effective date. The names are not always explicit enough in API contracts.

### Lifecycle Alerts

- **Source:** subscriptions, payments, members, commission records, and lifecycle helper logic.
- **Transformations:** `getScopedLifecycleSummary` and related route/storage helpers create alert buckets.
- **Risk:** Alerts are independently queried from dashboard data, so an alert and the underlying row can come from different snapshots.

## 3. API Inventory and Ownership

### Major Agent APIs

| Endpoint | Current owner | Assessment |
| --- | --- | --- |
| `/api/agent/enrollments` | Declared in more than one route registration path | Must consolidate |
| `/api/agent/stats` | Declared in more than one route registration path | Must consolidate |
| `/api/agent/commission-totals` | `server/routes.ts` | Legacy/compatibility metric surface |
| `/api/agent/commissions` | `server/routes.ts`/storage paths | Legacy commission surface |
| `/api/agent/commission-ledger` | `server/routes.ts` with ledger service data | Should become the compatibility source for legacy page |
| `/api/agent/commission-center` | `financial-exceptions.ts` | Current authoritative Commission Center endpoint |
| `/api/agent/lifecycle-alerts` | `server/routes.ts` helpers | Should be part of a dashboard read model |
| `/api/agent/export-enrollments` | `server/routes.ts` | Reuses compatibility enrollment shape |
| `/api/agents` | `server/routes.ts` | Directory/scope endpoint |

### Major Admin APIs

- `/api/admin/users` and impersonation endpoints: `admin-users.ts`.
- `/api/admin/commissions/*`: mixed legacy commission and ledger/payout operations in `routes.ts`.
- `/api/admin/financial-exceptions/*`: `financial-exceptions.ts`.
- `/api/admin/payments/*`: payment-tracking and payment diagnostic modules.
- `/api/admin/reconciliation/*`: payment-reconciliation routes; worker remains disabled.
- `/api/admin/enrollments/*` and member operations: mixed in `routes.ts` and storage.
- `/api/admin/analytics/*`: reporting/statistics surfaces.

### API Problems

1. Duplicate route declarations make registration order part of behavior.
2. Response shapes differ between compatibility endpoints and newer domain endpoints.
3. Some routes return arrays; others return `{ data }`, `{ enrollments }`, or mixed payloads.
4. Some admin operations live in dedicated route files while others remain in the large `routes.ts`.
5. Older endpoints remain reachable even when newer authoritative services exist.
6. The frontend often compensates for response inconsistency with fallback chains.

**Recommended domain owners:**

- Members/enrollments: `server/routes/members.ts` + `member-read-service.ts`.
- Payments: `server/routes/payments.ts` + payment services.
- Commissions: `server/routes/commissions.ts` + `commission-ledger-service.ts`.
- Lifecycle/tasks: `server/routes/lifecycle.ts` + `lifecycle-read-service.ts`.
- Admin/users/impersonation: existing dedicated modules.
- Reporting: explicit read-only reporting services, not general storage methods.

## 4. Database and Query Assessment

### Duplicate-row risks

`storage.getAgentEnrollments` joins `members` directly to `agent_commissions`. A member can have multiple commission rows, so the join can produce multiple enrollment records. Even if the UI appears acceptable for a given dataset, counts, filtering, and pagination can be wrong.

### N+1 patterns

Several route and storage paths load a base collection and then fetch related members, agents, payments, batches, or group records in loops. Some newer services batch related IDs; older routes do not consistently do so.

### Broad selects

There are many `select('*')` calls against member, ledger, payment, subscription, and commission tables. This increases payload size, makes contracts implicit, and increases accidental exposure risk.

### Repeated reads

The dashboard independently loads stats, enrollments, plans, scope agents, and lifecycle alerts. Mutations invalidate broad query keys, causing repeated reloads without a single consistency boundary.

### Client-side aggregation

The frontend filters and interprets enrollment and commission objects in multiple pages. Business-state derivation should be server-owned; client code should primarily format and interact.

### Duplicate status concepts

| Concept | Current fields |
| --- | --- |
| Member state | `members.status`, `members.is_active` |
| Subscription state | `subscriptions.status`, pending fields, end dates |
| Payment state | `payments.status`, payment processing fields |
| Commission state | `agent_commissions.status`, `payment_status`, ledger `status` |
| Refund state | `refund_eligibility`, `refund_status`, service usage fields |
| Payout state | ledger status, payout batch status, legacy payout fields |

These should remain distinct in storage where necessary, but be resolved into explicit read-model objects.

## 5. Frontend Data Flow

### Agent Dashboard Initial Load

Typical independent requests:

1. Agent stats.
2. Agent enrollments.
3. Available plans.
4. Lifecycle alerts.
5. Agent directory for admin/agency scope.

The requests are interdependent conceptually but not coordinated. Stats may reflect one moment, enrollments another, and alerts a third.

### Agent Commissions Initial Load

The page separately loads:

- commission totals
- commission records
- ledger rows
- lifecycle alert data
- agent directory when scoped

This is a second reporting model adjacent to Commission Center.

### Commission Center

Commission Center has a cleaner source path: one aggregation endpoint backed by `commission_ledger`, with related payout batches and payments loaded by IDs.

### Frontend Business Interpretation

Current frontend logic interprets:

- which statuses are pending/scheduled/paid
- whether a cancellation reason is safe to display
- whether refund state should be shown
- which filters apply to which status vocabulary
- which date fields should be formatted as calendar dates

The target should move these interpretations into server-owned view models.

## 6. UX Workflow Audit

### Agent

The agent starts on a dashboard that combines overview, member table, date filters, business filters, payment risk filters, access filters, lifecycle alerts, exports, member changes, cancellation, plan changes, pending enrollment resolution, and commission navigation.

This is too much context for one task surface. The likely result is high scan cost and uncertainty about which action is safe.

Primary friction:

- Too many controls in the dashboard header/table area.
- Member operations are buried inside a general change dialog.
- Cancellation is materially different from plan change but shares the same workflow.
- Status language varies between dashboard, Agent Commissions, and Commission Center.
- Secondary detail is represented as table columns instead of a member detail surface.
- Mobile layouts will require horizontal scrolling or compressed controls.

### Manager/Admin

Admin users have access to dashboards, users, impersonation, payments, enrollments, commissions, analytics, reconciliation exceptions, and configuration. These are powerful surfaces but not organized around a clear task queue.

Primary friction:

- Operational exceptions are distributed across pages.
- View-as-Agent is useful but can obscure whether the user is acting as admin or viewing as agent.
- Manual payment/refund actions are close to reporting surfaces and carry high-risk consequences.
- Similar concepts use different terms: enrollment, member, subscription, payment, commission, payout, cancellation, refund.

## 7. Member Lifecycle Trace

```text
Registration
  -> members + enrollment fields
  -> hosted checkout / payment session

Payment success
  -> payments status and confirmation timestamps
  -> PaymentConfirmedService
  -> member activation
  -> lineage snapshot
  -> agent_commissions
  -> commission_ledger

Membership effective date
  -> members.membership_start_date
  -> subscription/billing schedule
  -> commission period/effective date calculations

Recurring payment
  -> recurring billing scheduler or callback
  -> PaymentConfirmedService / ledger sync
  -> future commission entitlement

Plan change
  -> membership mutation route
  -> subscription/member updates
  -> downstream lifecycle and commission implications vary by path

Cancellation
  -> members cancellation metadata
  -> subscription pending/end-date changes
  -> stored refund eligibility and manual refund status
  -> commission decision consumer

Refund
  -> administrator manually processes externally
  -> refund status transition
  -> unpaid hold/release or additive paid reversal

Commission Center
  -> commission_ledger aggregation
  -> current balances, payout status, transaction history
```

### Lifecycle disagreement points

1. Payment status can be represented differently in `payments`, commissions, and processing-state columns.
2. Membership active state can differ between member and subscription records.
3. Effective date has several meanings and is not consistently named.
4. Cancellation date and cancellation effective date are different concepts.
5. Commission ledger rows can exist without source-payment linkage.
6. Group lifecycle transitions use separate routes and services from individual membership transitions.
7. Legacy commission surfaces remain adjacent to the authoritative ledger surface.

## 8. If We Were Designing This Today

We would keep the infrastructure and redesign the application layer around explicit business domains.

### Infrastructure to Keep

- **EPX:** Keep behind a narrow `PaymentProvider` adapter. The rest of the application should not know EPX transaction codes or request formats.
- **DigitalOcean:** Keep for deployment, backend service, and static frontend hosting.
- **Supabase/PostgreSQL:** Keep as the system of record and authentication/data platform.
- **React + TypeScript:** Keep for the operational frontend.
- **Express + TypeScript:** Keep for the API and domain services.
- **Commission ledger:** Keep as the authoritative financial pipeline.
- **Reconciliation worker:** Keep disabled until isolated validation is complete.

### Domain Shape

```text
server/
  domains/
    members/
      member-read-service.ts
      member-mutation-service.ts
      member-routes.ts
      member-view-models.ts
    payments/
      payment-provider.ts
      payment-service.ts
      payment-routes.ts
      payment-view-models.ts
    commissions/
      commission-ledger-service.ts
      commission-read-service.ts
      commission-routes.ts
      commission-view-models.ts
    lifecycle/
      lifecycle-read-service.ts
      lifecycle-routes.ts
    admin/
      impersonation-service.ts
      admin-routes.ts
  infrastructure/
    supabase/
    epx/
    database/
  shared/
    contracts/
    status-models/
```

The existing files do not need to move immediately. This is the ownership model to migrate toward.

### Canonical Read Models

The frontend should receive explicit view models, for example:

```ts
type AgentMemberRow = {
  memberId: string;
  memberName: string;
  plan: { id: number | null; name: string | null; price: number | null };
  membership: {
    state: 'active' | 'pending' | 'scheduled_cancel' | 'cancelled' | 'suspended';
    effectiveDate: string | null;
    accessThroughDate: string | null;
  };
  payment: {
    state: 'successful' | 'pending' | 'failed' | 'unknown';
    nextBillingDate: string | null;
  };
  commission: {
    state: 'none' | 'pending' | 'payable' | 'held' | 'paid' | 'reversed';
    amount: number;
  };
  cancellation: {
    requestedAt: string | null;
    effectiveAt: string | null;
    safeReason: string | null;
    refundEligibility: 'eligible' | 'not_eligible' | 'review_required' | null;
    refundStatus: 'not_applicable' | 'pending_manual_refund' | 'refunded' | null;
  } | null;
};
```

The exact type can evolve, but the principle is important: one field per concept, server-owned interpretation, no frontend fallback chain across raw database aliases.

### API Shape

Prefer task-oriented read models over raw-table endpoints:

- `GET /api/agent/dashboard`
- `GET /api/agent/members`
- `GET /api/agent/members/:memberId`
- `GET /api/agent/commissions`
- `GET /api/agent/tasks`
- `GET /api/admin/operations`
- `GET /api/admin/members/:memberId`

The existing endpoints should remain during migration and become adapters over the new read services before they are retired.

## 9. Proposed Information Architecture

Recommended top-level structure:

1. **Overview**
   - production summary
   - urgent tasks
   - recent member activity
   - payment/lifecycle risks

2. **Members**
   - searchable, filterable member list
   - one row per member
   - clear membership/payment/commission state

3. **Member Detail**
   - enrollment and plan
   - payment timeline
   - effective/access dates
   - cancellation/refund workflow
   - commission context

4. **Tasks**
   - pending enrollment resolution
   - failed payments
   - refund review
   - financial exceptions
   - lifecycle issues

5. **Commissions**
   - Commission Center as the primary financial view
   - legacy Agent Commissions as a compatibility redirect or secondary detail view

6. **Administration**
   - users and View-as-Agent
   - payments and manual operations
   - financial operations
   - analytics/configuration

This structure follows the work users need to complete rather than the historical backend modules.

## 10. Target Shared UI System

Create a small operational UI vocabulary:

- `PageHeader`
- `FilterBar`
- `DataTable`
- `StatusBadge`
- `TaskList`
- `MemberDetailDrawer`
- `ConfirmationDialog`
- `EmptyState`
- `LoadingState`
- `ErrorState`
- `StaleDataNotice`

The goal is not visual uniformity for its own sake. These components should standardize behavior, accessibility, density, error handling, and terminology.

## 11. Prioritized Remediation Matrix

Scores: 1 low, 5 high.

| Finding | Data correctness risk | User impact | Effort | Priority | Classification |
| --- | ---: | ---: | ---: | ---: | --- |
| Duplicate agent route ownership | 5 | 4 | 2 | P0 | Must fix |
| Member/commission join multiplication | 5 | 4 | 3 | P0 | Must fix |
| No canonical agent enrollment read model | 4 | 5 | 4 | P0 | Must fix |
| Status aliases and fallback chains | 5 | 4 | 4 | P0 | Must fix |
| Independent dashboard request snapshots | 4 | 4 | 3 | P1 | Should fix |
| Legacy Agent Commissions beside Commission Center | 4 | 3 | 3 | P1 | Should fix |
| Member lifecycle lacks unified timeline | 4 | 4 | 4 | P1 | Should fix |
| Broad `select('*')` usage | 3 | 3 | 3 | P1 | Technical debt |
| N+1 related reads in older paths | 3 | 3 | 3 | P1 | Technical debt |
| Dashboard overloaded with operations | 2 | 5 | 3 | P1 | UX improvement |
| Cancellation/plan-change shared dialog | 3 | 4 | 2 | P1 | UX improvement |
| Inconsistent status badges/terminology | 2 | 4 | 2 | P2 | UX improvement |
| Mobile table density and filter layout | 2 | 4 | 2 | P2 | UX improvement |
| Missing isolated full lifecycle fixtures | 5 | 3 | 4 | P0 | Must fix before enabling automation |
| Historical source-payment gaps | 4 | 2 | 3 | P1 | Manual review / documented gap |

## 12. Recommended Migration Sequence

### Phase 0: Freeze and inventory

- Keep EPX, DigitalOcean, Supabase, and the ledger unchanged.
- Add endpoint contract snapshots for current responses.
- Record route ownership and mark duplicates.
- Add query-count and duplicate-row diagnostics in non-production validation.

### Phase 1: Establish read-model services

- Build `agent-dashboard-read-service` without changing existing endpoints.
- Aggregate commissions before joining to members.
- Return one member row per member.
- Add explicit typed view models.
- Make existing dashboard endpoints adapters over the read service.

### Phase 2: Consolidate route ownership

- Move agent endpoints into a dedicated route module.
- Remove duplicate registration paths only after contract tests pass.
- Preserve old URLs as thin compatibility adapters temporarily.

### Phase 3: Build the member workspace

- Add Members list and Member Detail surfaces.
- Move cancellation, plan changes, payment timeline, and refund workflow into Member Detail.
- Keep existing mutations and authorization; change only the orchestration and presentation first.

### Phase 4: Make Tasks the operational queue

- Combine lifecycle alerts, failed payments, pending enrollments, refund review, and financial exceptions into a server-owned task read model.
- Link each task to a specific member and authorized action.

### Phase 5: Make Commission Center canonical

- Redirect or simplify legacy Agent Commissions.
- Use one commission view model based on `commission_ledger`.
- Keep payout and historical external settlement distinctions explicit.

### Phase 6: Standardize UI primitives

- Migrate page headers, filters, tables, status badges, dialogs, and empty/error states incrementally.
- Prioritize Members, Tasks, and Commission Center because they carry operational and financial risk.

### Phase 7: Isolated lifecycle validation

Prove, in a separate staging database:

- successful payment to commission
- failed payment produces no commission
- recurring payment behavior
- cancellation with service usage yes/no/unknown
- pending refund hold
- denied refund release
- processed refund reversal
- duplicate and concurrent processing
- View-as-Agent authorization
- Commission Center totals

Only after these scenarios are durable should reconciliation automation be reconsidered.

## Final Recommendation

Do not rebuild the platform from scratch. Rebuild the application layer progressively around the infrastructure that is already working.

The first engineering investment should be a canonical agent/member read model and route consolidation. The first UX investment should be separating Overview, Members, Tasks, and Commissions. The first validation investment should be an isolated lifecycle fixture suite.

That sequence reduces the chance of another “Frankenstein” layer: every new screen should consume an owned contract, every business decision should have one server-side owner, and every high-risk action should appear in a task-specific workflow with an explicit audit trail.
