# Commission Pipeline Database Deployment Checklist

This checklist is for a staging or production deployment after an approved change window. No migration has been executed by this development session.

## Required Order

1. **Preflight**: run `scripts/sql/commission_pipeline_preflight.sql` read-only and archive the output.
2. **Phase 1 migration**: run `scripts/sql/2026-08-19_payment_confirmed_service_phase1.sql`.
3. **Successful-payment timestamp migration**: run `scripts/sql/2026-08-20_member_first_successful_payment_at.sql`.
4. **Phase 2B ledger migration**: run `scripts/sql/2026-08-20b_commission_ledger_payout_flow_phase2b.sql`.
5. **Phase 2C processing-state migration**: run `scripts/sql/2026-08-20c_commission_processing_state.sql`.
6. **Phase 3A exception migration**: run `scripts/sql/2026-08-20d_financial_exceptions.sql`.
7. **Historical settlement cutover migration**: run `scripts/sql/2026-08-20e_historical_commission_external_settlement_cutover.sql` only with approved cutover values and change-window authorization.
8. **Cancellation refund migration**: run `scripts/sql/2026-08-20f_cancellation_refund_workflow.sql`.
9. **Commission clawback migration**: run `scripts/sql/2026-08-20g_commission_refund_clawback_alignment.sql`.
10. **Verification queries**: rerun the preflight and verify every required column/index exists, duplicate counts are zero, and no unexpected constraint failure occurred.
11. **Staging tests**: run `npm run validate:commission-pipeline-staging` with an isolated staging database and explicit test-data safeguards.

## Rollback Considerations

All migrations are additive and nullable. If application deployment must be rolled back, the prior application can continue to read the new columns. Do not drop columns or indexes as an emergency rollback because that would destroy operational evidence and can race with retrying workers. Disable the new writer path, preserve failed-state rows for review, and use a reviewed forward migration for any correction.

A migration transaction rollback is appropriate only while the migration is actively running and before `COMMIT`. After commit, rollback means application rollback plus preserving the additive schema. Historical `commission_payouts` and paid records are never deleted or rewritten.

## Evidence Required Before Production

- Archived preflight and post-migration outputs.
- Staging validation script passes, including duplicate and concurrent-confirmation scenarios.
- No unresolved duplicate `commission_event_key` groups.
- Explicit confirmation that `commission_payouts` has no new group writes in the deployed code path.
- Production backup/change-window approval and a named operator for failed-state retries.
