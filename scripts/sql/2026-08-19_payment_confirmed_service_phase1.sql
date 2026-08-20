-- Phase 1: Unified Payment Confirmed Service — additive schema changes only.
--
-- Safe to run multiple times (IF NOT EXISTS everywhere). Nothing here deletes,
-- renames, or overwrites existing columns/data. All new columns are nullable
-- so historical rows are left untouched.
--
-- Run this against the Supabase/Postgres database used by DATABASE_URL before
-- deploying the Phase 1 application code (server/services/payment-confirmed-service.ts,
-- server/services/commission-generation-service.ts).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. payments: distinguish "when EPX processed it" from "when MPP recognized
--    or manually verified it" (forensic audit §8/§12 gap).
-- ---------------------------------------------------------------------------
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_transaction_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS platform_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_method varchar(32),
  ADD COLUMN IF NOT EXISTS verified_by_user_id uuid;

COMMENT ON COLUMN public.payments.payment_transaction_at IS
  'When the payment provider (EPX) actually processed the successful transaction, if a trustworthy provider timestamp is available. NULL when not provided by EPX — never invented.';
COMMENT ON COLUMN public.payments.payment_confirmed_at IS
  'When MPP first established that this transaction was successful. Set once; not overwritten by later reprocessing.';
COMMENT ON COLUMN public.payments.platform_verified_at IS
  'When MPP processed/recorded this confirmation event. For automatic callbacks this may equal payment_confirmed_at; for manual recovery it is typically later.';
COMMENT ON COLUMN public.payments.verification_method IS
  'Normalized confirmation source: epx_callback | epx_browser_complete | manual_admin | reconciliation | recurring_billing.';
COMMENT ON COLUMN public.payments.verified_by_user_id IS
  'Authenticated admin user who performed manual verification. NULL for system/EPX-originated confirmations.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'payments_verified_by_user_id_fkey'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_verified_by_user_id_fkey
      FOREIGN KEY (verified_by_user_id) REFERENCES public.users(id);
  END IF;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Skipping verified_by_user_id FK — public.users table not found in this environment';
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_payment_confirmed_at ON public.payments (payment_confirmed_at);
CREATE INDEX IF NOT EXISTS idx_payments_verification_method ON public.payments (verification_method);

-- ---------------------------------------------------------------------------
-- 2. agent_commissions: direct, real FK from a commission to the exact
--    payment that produced it (forensic audit §16/§17 traceability gap).
-- ---------------------------------------------------------------------------
ALTER TABLE public.agent_commissions
  ADD COLUMN IF NOT EXISTS source_payment_id integer,
  ADD COLUMN IF NOT EXISTS commission_event_key text;

COMMENT ON COLUMN public.agent_commissions.source_payment_id IS
  'FK to payments.id — the exact successful payment that generated this writing commission or override row. Nullable for historical rows created before Phase 1.';
COMMENT ON COLUMN public.agent_commissions.commission_event_key IS
  'Deterministic idempotency key: payment:{source_payment_id}:recipient:{agent}:type:{direct|override}:overridefor:{agent|none}:level:{n}. Protected by a unique index below. NULL for rows where no source payment could be established (never fabricated).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'agent_commissions_source_payment_id_fkey'
  ) THEN
    ALTER TABLE public.agent_commissions
      ADD CONSTRAINT agent_commissions_source_payment_id_fkey
      FOREIGN KEY (source_payment_id) REFERENCES public.payments(id);
  END IF;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Skipping source_payment_id FK — public.payments table not found in this environment';
END $$;

CREATE INDEX IF NOT EXISTS idx_agent_commissions_source_payment_id ON public.agent_commissions (source_payment_id);

-- Database-enforced idempotency (forensic audit §7/§13 — app-level
-- check-then-insert is not sufficient). Before creating the unique index,
-- verify no duplicate keys already exist (they cannot yet, since the column
-- is brand new and defaults to NULL for every existing row, but this guard
-- makes the migration safe to re-run and safe if partially applied before).
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT commission_event_key
    FROM public.agent_commissions
    WHERE commission_event_key IS NOT NULL
    GROUP BY commission_event_key
    HAVING COUNT(*) > 1
  ) duplicates;

  IF dup_count > 0 THEN
    RAISE NOTICE 'Skipping unique index creation on agent_commissions.commission_event_key: % duplicate key group(s) found. Resolve duplicates manually before re-running this migration.', dup_count;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_commissions_commission_event_key
      ON public.agent_commissions (commission_event_key)
      WHERE commission_event_key IS NOT NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. commission_ledger: propagate the same FK so a ledger row can also be
--    traced directly to its source payment without redesigning the ledger
--    itself (deferred to a later phase per Phase 1 scope).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'commission_ledger'
  ) THEN
    ALTER TABLE public.commission_ledger
      ADD COLUMN IF NOT EXISTS source_payment_id integer;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'commission_ledger_source_payment_id_fkey'
    ) THEN
      ALTER TABLE public.commission_ledger
        ADD CONSTRAINT commission_ledger_source_payment_id_fkey
        FOREIGN KEY (source_payment_id) REFERENCES public.payments(id);
    END IF;

    CREATE INDEX IF NOT EXISTS idx_commission_ledger_source_payment_id
      ON public.commission_ledger (source_payment_id);
  ELSE
    RAISE NOTICE 'Skipping commission_ledger.source_payment_id — table not found in this environment';
  END IF;
END $$;

COMMIT;
