-- Read-only commission pipeline preflight. Run with psql against the target database.
-- This file contains SELECTs only: it never repairs, rewrites, deletes, or normalizes data.

SELECT current_database() AS database_name, current_user AS database_user, now() AS checked_at;

WITH required_columns(table_name, column_name) AS (VALUES
  ('payments','payment_transaction_at'), ('payments','payment_confirmed_at'),
  ('payments','platform_verified_at'), ('payments','verification_method'),
  ('payments','verified_by_user_id'), ('payments','commission_processing_status'),
  ('payments','ledger_sync_status'), ('payments','commission_processing_error'),
  ('payments','ledger_sync_error'), ('payments','financial_processing_updated_at'),
  ('agent_commissions','source_payment_id'), ('agent_commissions','commission_event_key'),
  ('commission_ledger','source_payment_id'), ('commission_ledger','compensation_type'),
  ('commission_ledger','current_cycle_anchor_date'),
  ('commission_payout_batches','compensation_type'),
  ('financial_exceptions','fingerprint'), ('financial_exceptions','retry_count'),
  ('financial_exceptions','status'), ('financial_exceptions','resolution_method')
)
SELECT r.table_name, r.column_name,
       (c.column_name IS NOT NULL) AS exists,
       c.data_type, c.is_nullable
FROM required_columns r
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public' AND c.table_name = r.table_name AND c.column_name = r.column_name
ORDER BY r.table_name, r.column_name;

WITH required_indexes(index_name) AS (VALUES
  ('idx_payments_payment_confirmed_at'), ('idx_payments_verification_method'),
  ('idx_payments_commission_processing_status'), ('idx_payments_ledger_sync_status'),
  ('idx_agent_commissions_source_payment_id'), ('uq_agent_commissions_commission_event_key'),
  ('idx_commission_ledger_source_payment_id'), ('idx_commission_ledger_compensation_type'),
  ('idx_commission_ledger_current_cycle_anchor_date'),
  ('idx_commission_payout_batches_compensation_type'),
  ('idx_financial_exceptions_status'), ('idx_financial_exceptions_payment_id'),
  ('idx_financial_exceptions_type'), ('idx_financial_exceptions_detected_at')
)
SELECT r.index_name, (i.indexname IS NOT NULL) AS exists,
       i.tablename, i.indexdef
FROM required_indexes r
LEFT JOIN pg_indexes i ON i.schemaname = 'public' AND i.indexname = r.index_name
ORDER BY r.index_name;

SELECT commission_event_key, count(*) AS duplicate_count, array_agg(id ORDER BY id) AS commission_ids
FROM public.agent_commissions
WHERE commission_event_key IS NOT NULL
GROUP BY commission_event_key HAVING count(*) > 1
ORDER BY duplicate_count DESC, commission_event_key;

SELECT count(*) AS commissions_missing_source_payment_id
FROM public.agent_commissions
WHERE payment_captured IS TRUE AND source_payment_id IS NULL;

SELECT ac.id AS commission_id, ac.source_payment_id
FROM public.agent_commissions ac
LEFT JOIN public.payments p ON p.id = ac.source_payment_id
WHERE ac.source_payment_id IS NOT NULL AND p.id IS NULL
ORDER BY ac.id;

SELECT cl.id AS ledger_id, cl.source_commission_id
FROM public.commission_ledger cl
LEFT JOIN public.agent_commissions ac ON ac.id = cl.source_commission_id
WHERE cl.source_commission_id IS NULL OR ac.id IS NULL
ORDER BY cl.id;

SELECT source_commission_id, commission_period_start, commission_period_end,
       count(*) AS duplicate_count, array_agg(id ORDER BY id) AS ledger_ids
FROM public.commission_ledger
WHERE source_commission_id IS NOT NULL
GROUP BY source_commission_id, commission_period_start, commission_period_end
HAVING count(*) > 1
ORDER BY duplicate_count DESC;

SELECT batch_type, compensation_type, status, count(*) AS batch_count
FROM public.commission_payout_batches
GROUP BY batch_type, compensation_type, status
ORDER BY batch_type, compensation_type, status;

SELECT status, exception_type, count(*) AS exception_count
FROM public.financial_exceptions
GROUP BY status, exception_type
ORDER BY status, exception_type;

SELECT count(*) AS historical_group_payout_rows
FROM public.commission_payouts
WHERE commission_id IN (
  SELECT id FROM public.agent_commissions
  WHERE member_id::text LIKE 'group_member:%'
)
   OR epx_transaction_id ILIKE 'group%'
   OR notes ILIKE '%group:%';

SELECT table_name, column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('payments','agent_commissions','commission_ledger','commission_payout_batches','commission_payouts')
ORDER BY table_name, ordinal_position;

SELECT conname AS constraint_name, conrelid::regclass AS table_name, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND conrelid::regclass::text IN ('payments','agent_commissions','commission_ledger','commission_payout_batches','commission_payouts')
ORDER BY table_name::text, conname;
