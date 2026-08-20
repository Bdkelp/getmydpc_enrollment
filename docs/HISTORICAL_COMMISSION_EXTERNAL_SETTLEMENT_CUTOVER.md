# Historical Commission External Settlement Cutover

## 1. Business Instruction

MPP historically paid commissions outside this platform. The authorized accounting instruction was that all historical writing and override commissions were paid before the platform became authoritative, with no historical balance owed at cutover. This operation was an accounting reconciliation only. It did not send money, modify EPX, delete records, or enable automatic reconciliation.

## 2. Cutover Timestamp

- `commission_financial_cutover_at`: `2026-08-20T18:19:16.794Z`
- Reconciliation reference: `MPP-HISTORICAL-CUTOVER-2026-08-20`
- Actor: `system:historical-commission-cutover`
- Actual external payment timestamp: unknown and intentionally stored as `NULL`.

The timestamp is persisted in `commission_financial_cutovers` as the immutable singleton key `commission_financial_cutover`.

## 3. Pre-Cutover Inventory

The live database inventory immediately before mutation contained 171 ledger rows:

| Compensation | Status | Rows | Amount |
| --- | ---: | ---: | ---: |
| Writing | earned | 14 | $289.00 |
| Writing | carry_forward | 9 | $125.00 |
| Writing | held | 82 | $1,867.50 |
| Writing | paid | 66 | $1,572.50 |
| Override | all statuses | 0 | $0.00 |

Commission Center semantics were verified from the aggregation service:

- `earned` contributes current balance.
- `queued` contributes payable.
- `carry_forward` contributes carry-forward.
- `held` contributes held.
- `paid` is historical paid and excluded from current owed balances.
- `externally_settled` is now retained in transaction history and excluded from current platform-managed balances.

There were no queued rows and no reversed rows in the live ledger inventory.

## 4. Settlement Totals

- Writing externally settled: 105 rows, `$2,281.50`
- Override externally settled: 0 rows, `$0.00`
- Agents affected: 8
- Settlement batches: 1 writing batch; no override batch was needed because no override rows were eligible.

## 5. Statuses Affected

The settlement included historical open statuses `earned`, `carry_forward`, and `held`:

- earned: 14 rows, `$289.00`
- carry_forward: 9 rows, `$125.00`
- held: 82 rows, `$1,867.50`

The operation did not change existing `paid` or `reversed` rows.

## 6. Held Treatment

Held rows were explicitly included because the business instruction states that all historical obligations were already externally paid. Their prior status is preserved in each immutable `historical_external_settlement` event as `priorLedgerStatus: held`. No held row was treated as a platform payout.

## 7. Reversal Treatment

Reversed rows were excluded and left unchanged. No reversed rows existed in the live inventory at execution time.

## 8. Historical Anomalies

The live database showed:

- 0 orphan ledger rows with no `source_commission_id`.
- 171 ledger rows with `source_payment_id` unset.
- 46 `agent_commissions` rows with `source_payment_id` unset.

No source payment IDs were guessed, manufactured, or changed. These source-link gaps remain manual-review items separate from settlement state.

## 9. Settlement Architecture

The additive migration is `scripts/sql/2026-08-20e_historical_commission_external_settlement_cutover.sql`.

It adds:

- Immutable `commission_financial_cutovers` configuration.
- `HISTORICAL_EXTERNAL_SETTLEMENT` metadata on payout batches and ledger rows.
- `settlement_reference`, `reconciled_at`, `actual_external_payment_at`, and `payment_date_known` fields.
- Explicit `externally_settled` status checks.
- Nullable payout batch scheduled dates for undated external reconciliation.
- Unique indexes preventing duplicate settlement batches and events.

The existing payout-batch architecture is reused. The writing batch is `048380d6-efce-4eed-a78e-b0af26a197e2`. Its existing-compatible `batch_type` is `1st-cycle`; `settlement_kind` and `compensation_type` identify it as the historical external writing settlement. No normal payout was executed.

## 10. Ledger Events

Every affected ledger row received one immutable `historical_external_settlement` event. The event records:

- cutover timestamp
- prior status
- settlement amount
- compensation type
- settlement reference
- system actor
- `actualExternalPaymentAt: null`
- `paymentDateKnown: false`

The event uniqueness key is `(ledger_id, event_type, settlement_reference)`, making reruns idempotent.

## 11. Cutover-Aware Late Reconciliation

`historical-commission-external-settlement-service.ts` determines historical activity using this precedence for payment-backed rows:

1. `payments.payment_transaction_at`
2. `payments.payment_confirmed_at`
3. `payments.created_at`
4. persisted ledger `created_at` fallback when no source payment is available

`syncLedgerEntriesForPayment()` preserves creation of a legitimate entitlement and ledger row, then applies the persisted cutover classification to newly inserted rows. A pre-cutover activity becomes `externally_settled`; a post-cutover activity remains platform-managed and can proceed through normal payable/carry-forward processing.

The deterministic classifier regression test confirms an old activity is pre-cutover and a timestamp after cutover is not.

## 12. Dry-Run Results

The live dry run completed before mutation:

- Agents affected: 8
- Rows affected: 105
- Writing amount: `$2,281.50`
- Override amount: `$0.00`
- Statuses affected: earned, carry_forward, held
- Held amount: `$1,867.50`
- Reversed amount: `$0.00`
- Projected historical writing outstanding after settlement: `$0.00`
- Projected historical override outstanding after settlement: `$0.00`

## 13. Applied Results

The apply completed successfully using the persisted cutover timestamp. The initial apply settled 105 rows. Two earlier attempts rolled back cleanly while adapting to existing database constraints; no partial financial mutation occurred.

## 14. Per-Agent Reconciliation Summary

| Agent | Compensation | External rows | External amount | Current outstanding |
| --- | --- | ---: | ---: | ---: |
| Elda Elijah | Writing | 3 | $60.00 | $0.00 |
| Ana Vasquez | Writing | 25 | $364.50 | $0.00 |
| Steven Villarreal | Writing | 15 | $507.00 | $0.00 |
| Michael Keener | Writing | 2 | $40.00 | $0.00 |
| Devion Moore | Writing | 33 | $1,062.50 | $0.00 |
| Controlled Validation | Writing | 1 | $2.50 | $0.00 |
| Controlled Validation | Writing | 1 | $20.00 | $0.00 |
| Travis Matheny | Writing | 25 | $225.00 | $0.00 |

No override rows were present.

## 15. Idempotency Verification

The apply command was run twice:

- First run: 105 rows settled, 1 batch created, 105 events created.
- Second run: 0 rows, `$0.00`, 0 new batches, 0 duplicate events.

## 16. Commission Center Verification

Post-reconciliation ledger state:

- Writing externally settled: 105 rows, `$2,281.50`
- Existing platform-paid writing: 66 rows, `$1,572.50`
- Current historical writing owed: `$0.00`
- Current historical override owed: `$0.00`
- Historical carry-forward owed: `$0.00`

Commission Center now retains external settlement transactions and displays them as `Paid externally before cutover`, with a discreet historical notice. No historical external settlement is counted in current owed, payable, carry-forward, or held balances.

## 17. Remaining Manual Review

The 171 unset ledger source payment IDs and 46 unset commission source payment IDs remain unresolved source-link anomalies. They were preserved and not guessed. They do not prevent the accounting settlement because the existing ledger records were deterministically attributable to the historical pre-cutover population through persisted ledger/activity timestamps.

## 18. Post-Cutover Operating Rules

- New post-cutover successful payments use the normal PaymentConfirmedService and ledger pipeline.
- New post-cutover writing and override obligations remain platform-managed.
- Late discovery of pre-cutover activity creates/preserves the entitlement and source traceability, then classifies it as externally settled.
- Actual historical payment dates are never fabricated.
- EPX is unchanged.
- `FINANCIAL_RECONCILIATION_ENABLED` remains false.
- No historical financial rows are deleted or zeroed.

## 19. Validation

Passed:

- Historical external settlement source-pattern tests.
- Existing View-as-Agent authorization tests.
- Live dry run.
- Live apply.
- Second-run idempotency verification.
- Post-reconciliation SQL verification.

The repository-wide TypeScript check retains unrelated pre-existing errors in `server/storage.ts`, `server/utils/sequential-agent-number-generator.ts`, and `shared/clean-commission-schema.ts`. Server and client builds remain the required final validation steps for the code changes.
