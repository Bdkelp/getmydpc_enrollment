-- Durable recurring billing orchestration. Additive and repeatable-safe.
-- This migration does not schedule a live trigger and does not charge EPX.
BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'automatic';

CREATE TABLE IF NOT EXISTS public.recurring_billing_runs (
  id bigserial PRIMARY KEY,
  trigger_source text NOT NULL,
  scheduled_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT NOW(),
  completed_at timestamptz,
  worker_id text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('dry_run', 'live')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  selected_count integer NOT NULL DEFAULT 0,
  claimed_count integer NOT NULL DEFAULT 0,
  succeeded_count integer NOT NULL DEFAULT 0,
  declined_count integer NOT NULL DEFAULT 0,
  unknown_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  internal_pending_count integer NOT NULL DEFAULT 0,
  amount_succeeded numeric(12,2) NOT NULL DEFAULT 0,
  amount_declined numeric(12,2) NOT NULL DEFAULT 0,
  amount_unknown numeric(12,2) NOT NULL DEFAULT 0,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.recurring_billing_cycles (
  id bigserial PRIMARY KEY,
  subscription_id integer NOT NULL REFERENCES public.subscriptions(id),
  member_id integer NOT NULL REFERENCES public.members(id),
  cycle_date date NOT NULL,
  processor_reference text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_method_type text NOT NULL,
  credential_source text,
  state text NOT NULL DEFAULT 'ready' CHECK (state IN (
    'ready', 'claimed', 'submitting', 'processor_succeeded', 'completed',
    'declined', 'unknown', 'internal_sync_pending', 'cancelled', 'skipped'
  )),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz,
  lease_owner text,
  lease_token uuid,
  lease_expires_at timestamptz,
  processor_auth_guid text,
  processor_auth_code text,
  processor_response_code text,
  processor_response_message text,
  processor_submitted_at timestamptz,
  processor_responded_at timestamptz,
  failure_classification text,
  skip_reason text,
  payment_id integer REFERENCES public.payments(id),
  next_billing_date timestamptz,
  run_id bigint REFERENCES public.recurring_billing_runs(id),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (subscription_id, cycle_date),
  UNIQUE (processor_reference)
);

CREATE INDEX IF NOT EXISTS idx_recurring_billing_cycles_claimable
  ON public.recurring_billing_cycles (state, next_attempt_at, lease_expires_at, cycle_date);
CREATE INDEX IF NOT EXISTS idx_recurring_billing_cycles_unknown
  ON public.recurring_billing_cycles (updated_at) WHERE state = 'unknown';
CREATE INDEX IF NOT EXISTS idx_recurring_billing_cycles_internal_pending
  ON public.recurring_billing_cycles (updated_at) WHERE state = 'internal_sync_pending';
CREATE INDEX IF NOT EXISTS idx_recurring_billing_runs_completed
  ON public.recurring_billing_runs (completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_recurring_due
  ON public.subscriptions (next_billing_date, id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_successful_recurring_transaction
  ON public.payments (transaction_id)
  WHERE transaction_id IS NOT NULL AND status IN ('success', 'succeeded', 'completed');

ALTER TABLE public.recurring_billing_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_billing_cycles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.recurring_billing_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.recurring_billing_cycles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.recurring_billing_runs_id_seq FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.recurring_billing_cycles_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recurring_billing_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recurring_billing_cycles TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.recurring_billing_runs_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.recurring_billing_cycles_id_seq TO service_role;

DROP POLICY IF EXISTS recurring_billing_runs_service_role_all ON public.recurring_billing_runs;
CREATE POLICY recurring_billing_runs_service_role_all
  ON public.recurring_billing_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS recurring_billing_cycles_service_role_all ON public.recurring_billing_cycles;
CREATE POLICY recurring_billing_cycles_service_role_all
  ON public.recurring_billing_cycles FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP FUNCTION IF EXISTS public.claim_recurring_billing_cycles(text, bigint, integer, integer);

CREATE OR REPLACE FUNCTION public.claim_recurring_billing_cycles(
  p_worker_id text,
  p_run_id bigint,
  p_limit integer DEFAULT 25,
  p_lease_seconds integer DEFAULT 120,
  p_subscription_ids integer[] DEFAULT NULL
)
RETURNS SETOF public.recurring_billing_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(BTRIM(p_worker_id), '') = '' THEN
    RAISE EXCEPTION 'worker id is required';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT cycle.id
    FROM public.recurring_billing_cycles cycle
    INNER JOIN public.subscriptions subscription ON subscription.id = cycle.subscription_id
    INNER JOIN public.members member ON member.id = cycle.member_id
    WHERE (
      cycle.state = 'ready'
      OR (
        cycle.state = 'declined'
        AND cycle.next_attempt_at IS NOT NULL
        AND cycle.next_attempt_at <= NOW()
      )
      OR (
        cycle.state = 'claimed'
        AND cycle.lease_expires_at < NOW()
        AND cycle.processor_submitted_at IS NULL
      )
    )
      AND subscription.status = 'active'
      AND subscription.billing_mode = 'automatic'
      AND COALESCE(subscription.pending_reason, '') <> 'member_cancelled'
      AND member.status = 'active'
      AND COALESCE(member.is_active, true) = true
      AND (cycle.next_attempt_at IS NULL OR cycle.next_attempt_at <= NOW())
      AND (p_subscription_ids IS NULL OR cycle.subscription_id = ANY(p_subscription_ids))
    ORDER BY cycle.cycle_date, cycle.id
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100))
  )
  UPDATE public.recurring_billing_cycles cycle
  SET state = 'claimed',
      lease_owner = p_worker_id,
      lease_token = extensions.gen_random_uuid(),
      lease_expires_at = NOW() + make_interval(secs => GREATEST(30, p_lease_seconds)),
      run_id = p_run_id,
      updated_at = NOW()
  FROM candidates
  WHERE cycle.id = candidates.id
  RETURNING cycle.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_recurring_internal_sync_cycles(
  p_worker_id text,
  p_run_id bigint,
  p_limit integer DEFAULT 25,
  p_lease_seconds integer DEFAULT 120,
  p_subscription_ids integer[] DEFAULT NULL
)
RETURNS SETOF public.recurring_billing_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(BTRIM(p_worker_id), '') = '' THEN
    RAISE EXCEPTION 'worker id is required';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT cycle.id
    FROM public.recurring_billing_cycles cycle
    WHERE cycle.state = 'internal_sync_pending'
      AND cycle.payment_id IS NOT NULL
      AND (cycle.next_attempt_at IS NULL OR cycle.next_attempt_at <= NOW())
      AND (cycle.lease_expires_at IS NULL OR cycle.lease_expires_at < NOW())
      AND (p_subscription_ids IS NULL OR cycle.subscription_id = ANY(p_subscription_ids))
    ORDER BY cycle.updated_at, cycle.id
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100))
  )
  UPDATE public.recurring_billing_cycles cycle
  SET lease_owner = p_worker_id,
      lease_token = extensions.gen_random_uuid(),
      lease_expires_at = NOW() + make_interval(secs => GREATEST(30, p_lease_seconds)),
      run_id = p_run_id,
      updated_at = NOW()
  FROM candidates
  WHERE cycle.id = candidates.id
  RETURNING cycle.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_recurring_cycle_submitting(
  p_cycle_id bigint,
  p_lease_token uuid
)
RETURNS public.recurring_billing_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  claimed public.recurring_billing_cycles;
  billing_allowed boolean;
BEGIN
  SELECT true INTO billing_allowed
  FROM public.recurring_billing_cycles cycle
  INNER JOIN public.subscriptions subscription ON subscription.id = cycle.subscription_id
  INNER JOIN public.members member ON member.id = cycle.member_id
  WHERE cycle.id = p_cycle_id
    AND subscription.status = 'active'
    AND subscription.billing_mode = 'automatic'
    AND COALESCE(subscription.pending_reason, '') <> 'member_cancelled'
    AND member.status = 'active'
    AND COALESCE(member.is_active, true) = true
  FOR UPDATE OF subscription;

  IF NOT COALESCE(billing_allowed, false) THEN
    RAISE EXCEPTION 'cycle is no longer eligible for automatic billing';
  END IF;

  UPDATE public.recurring_billing_cycles
  SET state = 'submitting',
      attempt_count = attempt_count + 1,
      processor_submitted_at = NOW(),
      lease_expires_at = NULL,
      updated_at = NOW()
  WHERE id = p_cycle_id
    AND state = 'claimed'
    AND lease_token = p_lease_token
    AND lease_expires_at > NOW()
  RETURNING * INTO claimed;

  IF claimed.id IS NULL THEN
    RAISE EXCEPTION 'cycle lease is not owned or has expired';
  END IF;
  RETURN claimed;
END;
$$;

DROP FUNCTION IF EXISTS public.finalize_recurring_cycle_success(
  bigint, text, text, text, text, text, timestamptz, timestamptz
);

CREATE OR REPLACE FUNCTION public.finalize_recurring_cycle_success(
  p_cycle_id bigint,
  p_transaction_id text,
  p_epx_auth_guid text,
  p_epx_auth_code text,
  p_epx_response_code text,
  p_epx_response_message text,
  p_captured_at timestamptz,
  p_next_billing_date date
)
RETURNS TABLE(payment_id integer, next_billing_date timestamptz, already_completed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  cycle public.recurring_billing_cycles;
  existing_payment public.payments%ROWTYPE;
  persisted_payment_id integer;
  current_due timestamptz;
  normalized_next_billing_date timestamptz;
  affected_rows integer;
BEGIN
  SELECT * INTO cycle
  FROM public.recurring_billing_cycles
  WHERE id = p_cycle_id
  FOR UPDATE;

  IF cycle.id IS NULL THEN RAISE EXCEPTION 'billing cycle not found'; END IF;
  IF p_transaction_id IS DISTINCT FROM cycle.processor_reference THEN
    RAISE EXCEPTION 'finalization transaction id does not match cycle processor reference';
  END IF;
  IF cycle.state = 'completed' THEN
    SELECT * INTO existing_payment FROM public.payments WHERE id = cycle.payment_id;
    IF existing_payment.id IS NULL
      OR existing_payment.transaction_id IS DISTINCT FROM p_transaction_id
      OR existing_payment.member_id IS DISTINCT FROM cycle.member_id
      OR existing_payment.subscription_id IS DISTINCT FROM cycle.subscription_id
      OR existing_payment.amount::numeric IS DISTINCT FROM cycle.amount::numeric THEN
      RAISE EXCEPTION 'completed billing cycle payment identity does not match finalization request';
    END IF;
    RETURN QUERY SELECT cycle.payment_id, cycle.next_billing_date, true;
    RETURN;
  END IF;
  IF cycle.state NOT IN ('submitting', 'processor_succeeded', 'internal_sync_pending', 'unknown') THEN
    RAISE EXCEPTION 'billing cycle state % cannot be finalized', cycle.state;
  END IF;

  normalized_next_billing_date := p_next_billing_date::timestamp AT TIME ZONE 'America/Chicago';

  INSERT INTO public.payments (
    member_id, subscription_id, amount, currency, status, payment_method,
    transaction_id, epx_auth_guid, payment_transaction_at, payment_confirmed_at,
    platform_verified_at, verification_method, metadata, created_at, updated_at
  ) VALUES (
    cycle.member_id, cycle.subscription_id, cycle.amount, 'USD', 'succeeded',
    CASE WHEN cycle.payment_method_type = 'ACH' THEN 'ach' ELSE 'card' END,
    p_transaction_id, p_epx_auth_guid, p_captured_at, NOW(), NOW(),
    'recurring_billing', jsonb_build_object(
      'source', 'durable_recurring_scheduler',
      'billingCycleId', cycle.id,
      'billingDate', cycle.cycle_date,
      'epxResponseCode', p_epx_response_code,
      'epxResponseMessage', p_epx_response_message,
      'epxAuthCode', p_epx_auth_code
    ), NOW(), NOW()
  )
  ON CONFLICT (transaction_id)
    WHERE transaction_id IS NOT NULL
      AND status IN ('success', 'succeeded', 'completed')
  DO NOTHING
  RETURNING id INTO persisted_payment_id;

  IF persisted_payment_id IS NULL THEN
    SELECT * INTO existing_payment
    FROM public.payments payment
    WHERE payment.transaction_id = p_transaction_id
      AND payment.status IN ('success', 'succeeded', 'completed')
    FOR UPDATE;

    IF existing_payment.id IS NULL
      OR existing_payment.member_id IS DISTINCT FROM cycle.member_id
      OR existing_payment.subscription_id IS DISTINCT FROM cycle.subscription_id
      OR existing_payment.amount::numeric IS DISTINCT FROM cycle.amount::numeric THEN
      RAISE EXCEPTION 'successful transaction id conflicts with another payment identity';
    END IF;
    persisted_payment_id := existing_payment.id;
  END IF;

  SELECT subscription.next_billing_date INTO current_due
  FROM public.subscriptions subscription
  WHERE subscription.id = cycle.subscription_id
  FOR UPDATE;

  IF (current_due AT TIME ZONE 'America/Chicago')::date = cycle.cycle_date THEN
    UPDATE public.subscriptions
    SET next_billing_date = normalized_next_billing_date, updated_at = NOW()
    WHERE id = cycle.subscription_id;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    IF affected_rows <> 1 THEN RAISE EXCEPTION 'subscription billing date update affected % rows', affected_rows; END IF;
  ELSIF (current_due AT TIME ZONE 'America/Chicago')::date < cycle.cycle_date THEN
    RAISE EXCEPTION 'subscription billing date is behind claimed cycle';
  END IF;

  UPDATE public.recurring_billing_cycles
  SET state = 'completed', payment_id = persisted_payment_id,
      processor_auth_guid = p_epx_auth_guid, processor_auth_code = p_epx_auth_code,
      processor_response_code = p_epx_response_code,
      processor_response_message = p_epx_response_message,
      processor_responded_at = NOW(), next_billing_date = normalized_next_billing_date,
      completed_at = NOW(), lease_owner = NULL, lease_token = NULL,
      lease_expires_at = NULL, failure_classification = NULL, updated_at = NOW()
  WHERE id = cycle.id;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 1 THEN RAISE EXCEPTION 'billing cycle finalization affected % rows', affected_rows; END IF;

  RETURN QUERY SELECT persisted_payment_id, normalized_next_billing_date, false;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_recurring_billing_cycles(text, bigint, integer, integer, integer[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_recurring_internal_sync_cycles(text, bigint, integer, integer, integer[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_recurring_cycle_submitting(bigint, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_recurring_cycle_success(bigint, text, text, text, text, text, timestamptz, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_recurring_billing_cycles(text, bigint, integer, integer, integer[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_recurring_internal_sync_cycles(text, bigint, integer, integer, integer[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_recurring_cycle_submitting(bigint, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_recurring_cycle_success(bigint, text, text, text, text, text, timestamptz, date) TO service_role;

COMMENT ON TABLE public.recurring_billing_cycles IS
  'Authoritative recurring billing cycle state. One immutable processor reference per subscription and billing date.';

COMMIT;