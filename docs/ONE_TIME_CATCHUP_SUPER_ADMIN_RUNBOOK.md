# One-time BRIC catch-up — Super Admin recovery tool (Issue #28)

## Purpose
A permanent recovery action in **Super Admin → Billing Operations** for a member with an active stored North Tran ID/BRIC. This is distinct from **Pay Now & Use for Recurring**. The existing Super Admin login gates the action; no separate login or BRIC re-entry is required.

## Operation
1. Select member ID and billing month; click **Preview catch-up**.
2. Confirm the member, active subscription, standard monthly amount, usable card credential, and original next billing date.
3. If enabled, click **Charge stored BRIC once**, then confirm once.
4. Check the displayed outcome and North merchant portal approval; never assume an HTTP/network error means a decline.
5. On an **unknown** or **record_pending** outcome, do not click again; reconcile EPX first. The durable attempt prevents repeated submission for the same month.
6. A separate reconciliation/ledger adjustment is required to close old billing cycles and align the subscription's actual due date. **The one-time charge intentionally does not update subscriptions or recurring_billing_cycles.**

## Deployment and charge gate
- Migration `scripts/sql/2026-10-08_one_time_catchup_attempts.sql` must be applied with explicit approval before exposing preview.
- Deploy the PR only after build, targeted mock processor tests, and review. Default `ONE_TIME_CATCHUP_ENABLED` unset/false.
- Enabling `ONE_TIME_CATCHUP_ENABLED=true` must be a separate authorized production action after verifying EPX endpoint, paid-vs-due history, and scheduler overlap.
- Neither branch creation nor deployment triggers a payment. Only the authenticated Super Admin **Charge stored BRIC once** action does.

## Case: Harris #56 (October 8, 2026)
- Sub ID 61, $123.76 per month.
- Earliest open due date in platform: **2026-08-17**. Do not represent October 17 as the stored next billing date.
- First proposed standalone catch-up: August, $123.76. September may be charged later after August's standalone charge is recorded successfully.
- One-time payment cannot by itself correct the subscription's overdue schedule. Reconcile and align **before the regular October anniversary** to avoid an unintended stale recurring attempt.

## Non-goals
No automatic retries after unknown outcomes; no billing day changes; no new card storage; no replacement of existing Hosted Checkout, recurring scheduler, or Super Admin authentication.
