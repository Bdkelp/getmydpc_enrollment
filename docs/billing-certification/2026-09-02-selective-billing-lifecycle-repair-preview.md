# Selective Billing Lifecycle Repair Preview

Captured: `2026-09-02T20:36:53.905Z`

## Scope And Safety

This is a read-only proposal. Production queries ran inside read-only transactions and ended with `ROLLBACK`. No lifecycle row, payment, token, billing mode, Vault value, Cron job, or scheduler setting was changed. No EPX request was made.

The bulk lifecycle repair command was not run and is not proposed. Credential source and field names may appear in usability classes, including `payment_tokens.original_network_trans_id`, but no credential values, payment-token values, routing numbers, infrastructure credentials, or environment-variable values are included.

Proposed atomic cancellation previews use the existing legacy `members.cancellation_date` as both the requested and immediate effective timestamp so historical intent is not replaced with the later repair time. `next_billing_date` and payment-token rows remain unchanged.

## 1. Owner-Confirmed Cancelled

| Account                                     | Member status / active         | Subscription status     | Billing mode              | Pending reason               | End date            | Next billing                            | Token usability                            | Proposed action and reason                                                                                                                         |
| ------------------------------------------- | ------------------------------ | ----------------------- | ------------------------- | ---------------------------- | ------------------- | --------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Michael Palomo, member 61, subscription 66  | `cancelled/false` -> unchanged | `active` -> `cancelled` | `automatic` -> `disabled` | `null` -> `member_cancelled` | `null` -> unchanged | `2026-09-15T07:25:22.150Z` -> unchanged | `missing_payment_credentials` -> unchanged | Preview immediate atomic lifecycle normalization with `termination_effective_at=2026-08-24T05:02:53.031Z`; owner explicitly confirms cancellation. |
| Rebeca Iglesias, member 53, subscription 58 | `cancelled/false` -> unchanged | `active` -> `cancelled` | `automatic` -> `disabled` | `null` -> `member_cancelled` | `null` -> unchanged | `2026-07-30T11:16:10.009Z` -> unchanged | `missing_payment_credentials` -> unchanged | Preview immediate atomic lifecycle normalization with `termination_effective_at=2026-07-11T01:28:09.976Z`; owner explicitly confirms cancellation. |

## Other Database-Cancelled With Legacy Reason

These rows have cancelled member state plus an explicit legacy cancellation reason. They remain separate from the two owner-confirmed records.

| Account                                     | Member status / active         | Subscription status      | Billing mode              | Pending reason                  | End date                                | Next billing                            | Token usability                                                | Proposed action and reason                                                                                                                                                                         |
| ------------------------------------------- | ------------------------------ | ------------------------ | ------------------------- | ------------------------------- | --------------------------------------- | --------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kalyan Dinavahi, member 15, subscription 15 | `cancelled/false` -> unchanged | `active` -> unchanged    | `automatic` -> unchanged  | `member_cancelled` -> unchanged | `null` -> unchanged                     | `2026-08-03T06:00:00.000Z` -> unchanged | `usable:payment_tokens.original_network_trans_id` -> unchanged | Block lifecycle repair pending owner confirmation. Existing database cancellation text alone does not authorize execution.                                                                         |
| Daniel Aviles, member 24, subscription 24   | `cancelled/false` -> unchanged | `cancelled` -> unchanged | `automatic` -> `disabled` | `member_cancelled` -> unchanged | `null` -> unchanged                     | `2026-05-30T06:00:00.000Z` -> unchanged | `missing_payment_credentials` -> unchanged                     | Preview atomic normalization with `termination_effective_at=2026-09-02T03:44:08.967Z`; legacy reason says member cancelled and was removed from recurring billing by the 2026-09-01 billing audit. |
| Mackenzy White, member 22, subscription 29  | `cancelled/false` -> unchanged | `cancelled` -> unchanged | `automatic` -> `disabled` | `null` -> `member_cancelled`    | `2026-05-23T06:00:00.000Z` -> unchanged | `2026-05-25T06:00:00.000Z` -> unchanged | `usable:payment_tokens.original_network_trans_id` -> unchanged | Preview atomic normalization with `termination_effective_at=2026-08-13T20:03:23.292Z`; preserve the deprecated legacy period boundary.                                                             |
| Joiniesha Bell, member 20, subscription 31  | `cancelled/false` -> unchanged | `cancelled` -> unchanged | `automatic` -> `disabled` | `null` -> `member_cancelled`    | `2026-05-10T17:25:14.579Z` -> unchanged | `2026-06-23T06:00:00.000Z` -> unchanged | `usable:payment_tokens.original_network_trans_id` -> unchanged | Preview atomic normalization with `termination_effective_at=2026-08-13T20:03:23.025Z`; preserve the deprecated legacy period boundary.                                                             |

## Other Database-Cancelled Without Confirmation Metadata

These rows have cancelled member state but no cancellation reason, new cancellation metadata, or enrollment-modification event. The atomic after-state is previewed, but execution should remain blocked until the owner confirms each cancellation.

| Account                                        | Member status / active         | Subscription status              | Billing mode              | Pending reason                             | End date            | Next billing                            | Token usability                                                | Proposed action and reason                                                                                                             |
| ---------------------------------------------- | ------------------------------ | -------------------------------- | ------------------------- | ------------------------------------------ | ------------------- | --------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| James Meeks, member 19, subscription 19        | `cancelled/false` -> unchanged | `cancelled` -> unchanged         | `automatic` -> `disabled` | `null` -> `member_cancelled`               | `null` -> unchanged | `2026-08-18T06:00:00.000Z` -> unchanged | `usable:payment_tokens.original_network_trans_id` -> unchanged | Preview `termination_effective_at=2026-07-08T22:59:33.976Z`, contingent on owner confirmation of the legacy cancelled state.           |
| Reginald Kennedy, member 25, subscription 25   | `cancelled/false` -> unchanged | `suspended` -> `cancelled`       | `automatic` -> `disabled` | `payment_delinquent` -> `member_cancelled` | `null` -> unchanged | `2026-06-09T23:04:52.807Z` -> unchanged | `usable:payment_tokens.original_network_trans_id` -> unchanged | Preview `termination_effective_at=2026-07-11T22:37:36.484Z`, contingent on confirming cancellation rather than delinquency suspension. |
| Rodrigo Montelongo, member 30, subscription 36 | `cancelled/false` -> unchanged | `suspended` -> `cancelled`       | `automatic` -> `disabled` | `payment_delinquent` -> `member_cancelled` | `null` -> unchanged | `2026-05-16T22:30:41.978Z` -> unchanged | `missing_or_invalid_processor_reference` -> unchanged          | Preview `termination_effective_at=2026-07-11T22:37:24.111Z`, contingent on confirming cancellation rather than delinquency suspension. |
| Ayodele Adebayo, member 32, subscription 38    | `cancelled/false` -> unchanged | `pending_payment` -> `cancelled` | `automatic` -> `disabled` | `null` -> `member_cancelled`               | `null` -> unchanged | `2026-05-01T06:00:00.000Z` -> unchanged | `missing_payment_credentials` -> unchanged                     | Preview `termination_effective_at=2026-08-25T06:02:10.529Z`, contingent on confirming cancellation of the pending-payment enrollment.  |

## 2. Manual Or External

| Account                                     | Member status / active     | Subscription status            | Billing mode                     | Pending reason      | End date            | Next billing                                             | Token usability                                       | Proposed action and reason                                                                                                                                |
| ------------------------------------------- | -------------------------- | ------------------------------ | -------------------------------- | ------------------- | ------------------- | -------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Christian Parra, member 29, subscription 35 | `active/true` -> unchanged | `active` -> unchanged          | `automatic` -> `manual_external` | `null` -> unchanged | `null` -> unchanged | `2026-09-07T20:45:42.186Z` -> `2026-09-28T00:00:00.000Z` | `missing_or_invalid_processor_reference` -> unchanged | Record the August 28 external settlement as a separate cycle, then retain manual/external mode. Do not associate it with payment 56 or contact EPX/North. |
| Issac Jasso Jr, member 40, subscription 46  | `active/true` -> unchanged | `pending_payment` -> unchanged | `automatic` -> `manual_external` | `null` -> unchanged | `null` -> unchanged | `2026-07-13T01:16:19.411Z` -> unchanged                  | `missing_payment_credentials` -> unchanged            | Change only billing mode in the approved repair. Keep lifecycle state pending until the succeeded payment inconsistency is separately reviewed.           |

### Parra External-Payment Reconciliation Preview

Do not modify or associate existing payment 56 with this settlement. The owner-confirmed August 28 payment is a separate external settlement/cycle with amount `$119.00`, processed manually on `2026-08-28`, invoice/reference `MPP08282026119`, and authorization reference `537600`.

Proposed supervised reconciliation, requiring real external method/reference evidence at execution time:

- Create a distinct external-settlement payment/cycle record for `$119.00`; do not reuse payment 56.
- External processed date: `2026-08-28`.
- Invoice/reference: `MPP08282026119`.
- Authorization reference: `537600`.
- Next billing date: `2026-09-28T00:00:00.000Z`, using the established same-day-next-month recurring rule from the August 28 cycle date.
- Confirmation source: supervised `manual_admin`, with the authenticated operator and owner-supplied external evidence.
- Member status/active: `active/true` -> unchanged.
- Subscription status: `active` -> unchanged.
- Billing mode: `automatic` -> `manual_external`.
- Process only the newly created settlement through the authoritative confirmation workflow. Do not contact EPX or North.

## 3. Active Records With Stale End Date

| Account                                       | Member status / active     | Subscription status   | Billing mode             | Pending reason      | End date                                | Next billing                            | Token usability                                                | Proposed action and reason                                                                               |
| --------------------------------------------- | -------------------------- | --------------------- | ------------------------ | ------------------- | --------------------------------------- | --------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Nelson Baylon, member 12, subscription 33     | `active/true` -> unchanged | `active` -> unchanged | `automatic` -> unchanged | `null` -> unchanged | `2026-05-10T17:25:15.141Z` -> unchanged | `2026-08-20T06:00:00.000Z` -> unchanged | `usable:payment_tokens.original_network_trans_id` -> unchanged | Hold. Review payment history and owner intent before changing the stale period boundary.                 |
| Andres Lozano, member 18, subscription 32     | `active/true` -> unchanged | `active` -> unchanged | `automatic` -> unchanged | `null` -> unchanged | `2026-05-10T17:25:14.864Z` -> unchanged | `2026-09-06T06:00:00.000Z` -> unchanged | `usable:payment_tokens.original_network_trans_id` -> unchanged | Hold. Do not disable or alter the period boundary.                                                       |
| Jaxon Player, member 21, subscription 30      | `active/true` -> unchanged | `active` -> unchanged | `automatic` -> unchanged | `null` -> unchanged | `2026-05-10T17:25:14.292Z` -> unchanged | `2026-09-24T06:00:00.000Z` -> unchanged | `usable:payment_tokens.original_network_trans_id` -> unchanged | Hold. Do not disable or alter the period boundary.                                                       |
| Steven Villarreal, member 10, subscription 34 | `active/true` -> unchanged | `active` -> unchanged | `automatic` -> unchanged | `null` -> unchanged | `2026-05-10T17:25:15.518Z` -> unchanged | `2026-07-19T06:00:00.000Z` -> unchanged | `usable:payment_tokens.original_network_trans_id` -> unchanged | Hold and preserve as a potential collection candidate. The owner confirms the payment was not processed. |

### End-Date Origin And Meaning

All four subscriptions were inserted on `2026-04-10` within about two seconds, and each `end_date` is about 30 days after insertion. Repository history traces the behavior to commit `cfa2a79`: the compatibility subscription creator defaulted the period end to `Date.now() + 30 days`. The current direct-SQL compatibility path still uses that fallback, while `updateSubscription` advances `next_billing_date` but does not map or advance `end_date`.

The field therefore originated as `currentPeriodEnd`/paid-through metadata for these rows, not cancellation evidence. The forward migration `2026-09-02d_subscription_period_termination_semantics.sql` resolves the conflict without changing these rows: `current_period_start` and `current_period_end` carry recurring-period state, `termination_effective_at` is the only authoritative subscription termination field, and deprecated `end_date` is ignored by due selection. Successful durable payment finalization advances both period fields and `next_billing_date` atomically. New subscription creation no longer populates `end_date`.

The migration exposes a read-only legacy candidate view and a service-role-only, explicitly targeted repair function that refuses cancelled, pending-cancellation, or already terminating subscriptions. It does not invoke that repair function or backfill data. Nelson Baylon, Andres Lozano, Jaxon Player, and Steven Villarreal therefore remain held pending reviewed data correction.

## 4. Suspended, Pending-Payment, Test, And Unconfirmed Records

| Account                                       | Member status / active               | Subscription status            | Billing mode                       | Pending reason                    | End date            | Next billing                            | Token usability                                                | Proposed action and reason                                                                                                                   |
| --------------------------------------------- | ------------------------------------ | ------------------------------ | ---------------------------------- | --------------------------------- | ------------------- | --------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Christy Greenwood, member 16, subscription 16 | `suspended/false` -> unchanged       | `suspended` -> unchanged       | `automatic` -> proposed `disabled` | `payment_delinquent` -> unchanged | `null` -> unchanged | `2026-08-03T06:00:00.000Z` -> unchanged | `usable:payment_tokens.original_network_trans_id` -> unchanged | Disable unattended billing while suspended. Require a deliberate eligibility review before any future return to `automatic`.                 |
| Johan Osuna Vera, member 31, subscription 37  | `suspended/false` -> unchanged       | `suspended` -> unchanged       | `automatic` -> proposed `disabled` | `payment_delinquent` -> unchanged | `null` -> unchanged | `2026-05-17T08:11:48.671Z` -> unchanged | `missing_or_invalid_processor_reference` -> unchanged          | Disable unattended billing while suspended; credential remediation and owner approval are required before reactivation.                      |
| Letricia Ervin, member 37, subscription 43    | `pending_payment/false` -> unchanged | `pending_payment` -> unchanged | `automatic` -> proposed `disabled` | `null` -> unchanged               | `null` -> unchanged | `2026-06-21T05:52:08.324Z` -> unchanged | `missing_payment_credentials` -> unchanged                     | Keep pending and disable unattended billing; no successful payment exists. A future confirmed checkout may deliberately restore `automatic`. |
| Travis Test, member 60, subscription 65       | `pending_payment/false` -> unchanged | `pending_payment` -> unchanged | `automatic` -> proposed `disabled` | `null` -> unchanged               | `null` -> unchanged | `2026-09-11T01:53:20.743Z` -> unchanged | `missing_payment_credentials` -> unchanged                     | Mark billing disabled as test data. Any deletion or broader cleanup requires separate approval.                                              |

James Meeks, Reginald Kennedy, Rodrigo Montelongo, and Ayodele Adebayo are the unconfirmed cancellation records; their proposed values are listed in section 1 and remain blocked on owner confirmation.

## Migration History And SQL Integrity

The production database currently has no `supabase_migrations` tables. The Supabase dashboard also reported `Last migration: No migrations`. The three direct SQL installations are therefore not listed in Supabase migration history. No migration-history row was fabricated or inserted.

Executed SQL SHA-256 hashes:

| SQL file                                              | SHA-256                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| `2026-08-20f_cancellation_refund_workflow.sql`        | `7f272e8a49eefadad38c188e491927591507a9093ea55b1decb5eb8aa4b5e7fc` |
| `2026-09-02_recurring_billing_durable_cycles.sql`     | `1c2bd0d9cfa66c4c97681968ba05cd32f49f3fbfcfeb84abc800845a2e87cb33` |
| `2026-09-02c_subscription_billing_mode_lifecycle.sql` | `5a54a2a6c8bde2412598f27b38f7f133b05c6686c9ca74fb937264332997a095` |

The forward lifecycle design migration is pending deployment and is not included in the executed-production hash list: `2026-09-02d_subscription_period_termination_semantics.sql`.

Related certification evidence is preserved in:

- `2026-09-02-durable-billing-production-preflight.md`
- `2026-09-02-supabase-production-recovery-evidence.md`
- `2026-09-02-durable-billing-post-migration.md`

## Approval Boundary

Stop here for owner review. This report does not authorize or execute any repair. Vault, `pg_cron`, and `scripts/sql/2026-09-02b_recurring_billing_external_schedule.sql` remain untouched. Scheduled dry runs remain separately gated.
