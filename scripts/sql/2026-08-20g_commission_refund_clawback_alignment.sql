-- Align commission holds/releases/reversals with the stored manual refund decision.
-- Additive only. No historical rows are backfilled or rewritten.
BEGIN;

ALTER TABLE public.members
  DROP CONSTRAINT IF EXISTS members_refund_status_check,
  ADD CONSTRAINT members_refund_status_check CHECK (
    refund_status IS NULL OR refund_status IN (
      'not_applicable', 'pending_manual_refund', 'refunded', 'denied', 'cancelled'
    )
  );

ALTER TABLE public.commission_ledger
  ADD COLUMN IF NOT EXISTS reversal_key text;

ALTER TABLE public.commission_ledger_events
  ADD COLUMN IF NOT EXISTS event_key text;

ALTER TABLE public.commission_cancellation_events
  ADD COLUMN IF NOT EXISTS event_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_ledger_reversal_key
  ON public.commission_ledger (reversal_key)
  WHERE reversal_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_ledger_events_event_key
  ON public.commission_ledger_events (event_key)
  WHERE event_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_cancellation_events_event_key
  ON public.commission_cancellation_events (event_key)
  WHERE event_key IS NOT NULL;

COMMENT ON COLUMN public.commission_ledger.reversal_key IS
  'Deterministic idempotency key for a refund-triggered additive reversal. NULL for non-reversal rows.';

COMMIT;