-- Historical external commission settlement cutover.
-- Additive only: no financial rows or amounts are deleted or rewritten.
BEGIN;

CREATE TABLE IF NOT EXISTS public.commission_financial_cutovers (
  cutover_key text PRIMARY KEY,
  cutover_at timestamptz NOT NULL,
  reconciliation_reference text NOT NULL UNIQUE,
  instruction text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.commission_ledger
  DROP CONSTRAINT IF EXISTS commission_ledger_status_check,
  ADD CONSTRAINT commission_ledger_status_check CHECK (
    status IN ('earned', 'queued', 'carry_forward', 'paid', 'held', 'reversed', 'externally_settled')
  ),
  ADD COLUMN IF NOT EXISTS settlement_kind text,
  ADD COLUMN IF NOT EXISTS settlement_reference text,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS actual_external_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_date_known boolean;

ALTER TABLE public.commission_payout_batches
  DROP CONSTRAINT IF EXISTS commission_payout_batches_status_check,
  ADD CONSTRAINT commission_payout_batches_status_check CHECK (
    status IN ('draft', 'ready', 'exported', 'paid', 'externally_settled')
  ),
  ALTER COLUMN scheduled_pay_date DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS settlement_kind text,
  ADD COLUMN IF NOT EXISTS reconciliation_reference text,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS actual_external_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_date_known boolean,
  ADD COLUMN IF NOT EXISTS reason text;

ALTER TABLE public.commission_ledger_events
  ADD COLUMN IF NOT EXISTS settlement_reference text,
  ADD COLUMN IF NOT EXISTS settlement_kind text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_external_settlement_batches
  ON public.commission_payout_batches (reconciliation_reference, compensation_type)
  WHERE settlement_kind = 'HISTORICAL_EXTERNAL_SETTLEMENT';

CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_external_settlement_events
  ON public.commission_ledger_events (ledger_id, event_type, settlement_reference)
  WHERE event_type = 'historical_external_settlement';

CREATE INDEX IF NOT EXISTS idx_commission_ledger_settlement_reference
  ON public.commission_ledger (settlement_reference);

COMMENT ON TABLE public.commission_financial_cutovers IS
  'Immutable platform commission authority cutover. The cutover timestamp means qualifying historical obligations were externally settled; it is not a bank payment timestamp.';
COMMENT ON COLUMN public.commission_ledger.actual_external_payment_at IS
  'Actual external payment timestamp when known. NULL for the historical cutover because no payment date is being fabricated.';
COMMENT ON COLUMN public.commission_ledger.reconciled_at IS
  'When MPP reconciled this ledger obligation as externally settled.';
COMMENT ON COLUMN public.commission_payout_batches.settlement_kind IS
  'HISTORICAL_EXTERNAL_SETTLEMENT distinguishes accounting reconciliation from normal platform payout.';

COMMIT;