-- Phase 2B: commission ledger cycle-classification + carry-forward routing.
-- Additive only. Nullable. Safe to run multiple times. Nothing is deleted,
-- renamed, or backfilled for historical rows.

BEGIN;

ALTER TABLE public.commission_ledger
  ADD COLUMN IF NOT EXISTS compensation_type text,
  ADD COLUMN IF NOT EXISTS current_cycle_anchor_date date;

COMMENT ON COLUMN public.commission_ledger.compensation_type IS
  '''writing'' or ''override''. Distinct from the pre-existing commission_type column (new/renewal/adjustment/reversal), which classifies WHY a row was created, not WHICH payout cycle it belongs to. NULL for historical rows created before Phase 2B — application code treats NULL as ''writing'' (the only cycle that existed previously) without rewriting the historical row.';

COMMENT ON COLUMN public.commission_ledger.current_cycle_anchor_date IS
  'Carry-forward routing pointer. NULL until a row is first carried forward past its originally-earned cycle. When set, batch-cycle classification uses this date (advanced one cycle step at a time) instead of recomputing from commission_period_end, so a carried balance is reconsidered in the correct next writing (1st/15th) or override (monthly) cycle. The original commission_period_start/end/effective_date are never modified — this is purely a "where in the queue is this row now" pointer, itself audited via commission_ledger_events on every advance.';

CREATE INDEX IF NOT EXISTS idx_commission_ledger_compensation_type
  ON public.commission_ledger (compensation_type);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_current_cycle_anchor_date
  ON public.commission_ledger (current_cycle_anchor_date);

ALTER TABLE public.commission_payout_batches
  ADD COLUMN IF NOT EXISTS compensation_type text;

COMMENT ON COLUMN public.commission_payout_batches.compensation_type IS
  '''writing'' or ''override'' — lets the database/reporting layer identify a batch''s compensation cycle directly instead of inferring it from batch_type string parsing or dates. NULL for historical batches created before Phase 2B.';

CREATE INDEX IF NOT EXISTS idx_commission_payout_batches_compensation_type
  ON public.commission_payout_batches (compensation_type);

COMMIT;
