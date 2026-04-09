DO $$
DECLARE
  existing_check_name text;
BEGIN
  SELECT c.conname
  INTO existing_check_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'commission_ledger'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%status%'
    AND pg_get_constraintdef(c.oid) ILIKE '%earned%'
    AND pg_get_constraintdef(c.oid) ILIKE '%queued%'
    AND pg_get_constraintdef(c.oid) ILIKE '%paid%'
    AND pg_get_constraintdef(c.oid) ILIKE '%held%'
    AND pg_get_constraintdef(c.oid) ILIKE '%reversed%';

  IF existing_check_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.commission_ledger DROP CONSTRAINT %I', existing_check_name);
  END IF;

  ALTER TABLE public.commission_ledger
    ADD CONSTRAINT commission_ledger_status_check
    CHECK (status IN ('earned', 'queued', 'carry_forward', 'paid', 'held', 'reversed'));
END $$;
