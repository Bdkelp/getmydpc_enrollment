-- Phase 1: Recurring Billing Scheduler — Database Prerequisites
-- Run in Supabase SQL Editor (sandbox first, then production)
-- Date: 2026-03-18

-- ============================================================
-- STEP 1: Create recurring_billing_log table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.recurring_billing_log (
  id                   SERIAL PRIMARY KEY,
  subscription_id      INTEGER REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  member_id            INTEGER NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  payment_token_id     INTEGER REFERENCES public.payment_tokens(id),
  amount               NUMERIC(10,2) NOT NULL,
  billing_date         TIMESTAMPTZ NOT NULL,
  attempt_number       INTEGER DEFAULT 1,
  status               VARCHAR(50) NOT NULL,
  epx_transaction_id   VARCHAR(255),
  epx_auth_code        VARCHAR(50),
  epx_response_code    VARCHAR(10),
  epx_response_message TEXT,
  failure_reason       TEXT,
  next_retry_date      TIMESTAMPTZ,
  payment_id           INTEGER REFERENCES public.payments(id),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  processed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_billing_log_subscription  ON public.recurring_billing_log(subscription_id);
CREATE INDEX IF NOT EXISTS idx_billing_log_member        ON public.recurring_billing_log(member_id);
CREATE INDEX IF NOT EXISTS idx_billing_log_status        ON public.recurring_billing_log(status);
CREATE INDEX IF NOT EXISTS idx_billing_log_billing_date  ON public.recurring_billing_log(billing_date);

-- ============================================================
-- STEP 2: Enable RLS + service role policy
-- ============================================================

ALTER TABLE public.recurring_billing_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY recurring_billing_log_service_policy
  ON public.recurring_billing_log
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- STEP 3: Advisory lock wrapper functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.app_try_advisory_lock(lock_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT pg_try_advisory_lock(lock_id);
$$;

CREATE OR REPLACE FUNCTION public.app_advisory_unlock(lock_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT pg_advisory_unlock(lock_id);
$$;

REVOKE EXECUTE ON FUNCTION public.app_try_advisory_lock(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_try_advisory_lock(BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.app_advisory_unlock(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_advisory_unlock(BIGINT) TO service_role;
