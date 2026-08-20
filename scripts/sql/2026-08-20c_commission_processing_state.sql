-- Phase 2C: durable payment -> commission -> ledger processing state.
-- Additive, nullable, and safe to run repeatedly. Historical values remain NULL.
BEGIN;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS commission_processing_status text,
  ADD COLUMN IF NOT EXISTS ledger_sync_status text,
  ADD COLUMN IF NOT EXISTS commission_processing_error text,
  ADD COLUMN IF NOT EXISTS ledger_sync_error text,
  ADD COLUMN IF NOT EXISTS financial_processing_updated_at timestamptz;

COMMENT ON COLUMN public.payments.commission_processing_status IS
  'Durable downstream state: pending, complete, skipped, or failed. NULL for historical payments not processed by Phase 2C.';
COMMENT ON COLUMN public.payments.ledger_sync_status IS
  'Durable ledger state: pending, complete, or failed. NULL for historical payments not processed by Phase 2C.';
COMMENT ON COLUMN public.payments.commission_processing_error IS
  'Last retryable commission-processing failure; retained for operational diagnosis.';
COMMENT ON COLUMN public.payments.ledger_sync_error IS
  'Last retryable ledger-sync failure; retained for operational diagnosis.';
COMMENT ON COLUMN public.payments.financial_processing_updated_at IS
  'Last timestamp at which durable downstream financial-processing state changed.';

CREATE INDEX IF NOT EXISTS idx_payments_commission_processing_status
  ON public.payments (commission_processing_status);
CREATE INDEX IF NOT EXISTS idx_payments_ledger_sync_status
  ON public.payments (ledger_sync_status);

COMMIT;
