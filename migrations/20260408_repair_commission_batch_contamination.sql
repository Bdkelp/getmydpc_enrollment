-- Repair existing commission payout batch contamination after hardening rules.
-- 1) Non-payable rows must not remain attached to payout batches.
-- 2) Batch totals must reflect payable rows only.

UPDATE public.commission_ledger
SET payout_batch_id = NULL
WHERE payout_batch_id IS NOT NULL
  AND status IN ('held', 'reversed');

WITH batch_rollups AS (
  SELECT
    payout_batch_id,
    COALESCE(SUM(commission_amount), 0) AS total_amount,
    COUNT(*) AS total_records,
    COUNT(DISTINCT agent_id) AS total_agents
  FROM public.commission_ledger
  WHERE payout_batch_id IS NOT NULL
    AND status IN ('queued', 'paid')
  GROUP BY payout_batch_id
)
UPDATE public.commission_payout_batches b
SET
  total_amount = COALESCE(r.total_amount, 0),
  total_records = COALESCE(r.total_records, 0),
  total_agents = COALESCE(r.total_agents, 0)
FROM (
  SELECT b2.id, br.total_amount, br.total_records, br.total_agents
  FROM public.commission_payout_batches b2
  LEFT JOIN batch_rollups br ON br.payout_batch_id = b2.id
) r
WHERE b.id = r.id;
