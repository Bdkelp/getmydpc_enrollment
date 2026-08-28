-- Record the additive core payment integrity schema already applied to production.
-- This migration is idempotent and does not modify existing row data.

BEGIN;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_transaction_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS platform_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_method varchar(32),
  ADD COLUMN IF NOT EXISTS verified_by_user_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_verified_by_user_id_fkey'
      AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_verified_by_user_id_fkey
      FOREIGN KEY (verified_by_user_id) REFERENCES public.users(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_payment_confirmed_at
  ON public.payments (payment_confirmed_at);

CREATE INDEX IF NOT EXISTS idx_payments_verification_method
  ON public.payments (verification_method);

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS first_successful_payment_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_members_first_successful_payment_at
  ON public.members (first_successful_payment_at);

COMMIT;
