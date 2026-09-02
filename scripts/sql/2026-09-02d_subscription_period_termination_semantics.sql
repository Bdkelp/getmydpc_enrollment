-- Separate recurring period boundaries from authoritative membership termination.
-- This migration does not repair production rows, schedule billing, or contact a processor.
BEGIN;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS current_period_start timestamp without time zone,
  ADD COLUMN IF NOT EXISTS current_period_end timestamp without time zone,
  ADD COLUMN IF NOT EXISTS termination_effective_at timestamptz;

COMMENT ON COLUMN public.subscriptions.end_date IS
  'Deprecated legacy field. Do not use for billing eligibility or cancellation effectiveness.';
COMMENT ON COLUMN public.subscriptions.current_period_start IS
  'Inclusive start of the recurring period most recently billed successfully.';
COMMENT ON COLUMN public.subscriptions.current_period_end IS
  'Exclusive end of the recurring period most recently billed successfully; normally equals next_billing_date.';
COMMENT ON COLUMN public.subscriptions.termination_effective_at IS
  'Authoritative instant after which the subscription is terminated and no longer billable.';

CREATE INDEX IF NOT EXISTS idx_subscriptions_termination_effective_at
  ON public.subscriptions (termination_effective_at)
  WHERE termination_effective_at IS NOT NULL;

CREATE OR REPLACE VIEW public.subscription_legacy_period_date_candidates AS
SELECT
  subscription.id AS subscription_id,
  subscription.member_id,
  subscription.end_date AS legacy_end_date,
  subscription.current_period_start,
  subscription.current_period_end,
  subscription.next_billing_date
FROM public.subscriptions subscription
WHERE subscription.status = 'active'
  AND subscription.termination_effective_at IS NULL
  AND subscription.end_date IS NOT NULL
  AND subscription.end_date <= NOW();

REVOKE ALL ON public.subscription_legacy_period_date_candidates
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.subscription_legacy_period_date_candidates TO service_role;

CREATE OR REPLACE FUNCTION public.repair_legacy_subscription_period_dates(
  p_subscription_ids integer[]
)
RETURNS TABLE(subscription_id integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.subscriptions subscription
  SET current_period_start = COALESCE(
        subscription.current_period_start,
        subscription.start_date
      ),
      current_period_end = COALESCE(
        subscription.current_period_end,
        subscription.next_billing_date
      ),
      end_date = NULL,
      updated_at = NOW()
  WHERE p_subscription_ids IS NOT NULL
    AND subscription.id = ANY(p_subscription_ids)
    AND subscription.status = 'active'
    AND subscription.termination_effective_at IS NULL
    AND COALESCE(subscription.pending_reason, '') <> 'member_cancelled'
    AND subscription.end_date IS NOT NULL
  RETURNING subscription.id;
$$;

REVOKE ALL ON FUNCTION public.repair_legacy_subscription_period_dates(integer[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repair_legacy_subscription_period_dates(integer[])
  TO service_role;

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
RETURNS TABLE(payment_id integer, next_billing_date timestamp without time zone, already_completed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  cycle public.recurring_billing_cycles;
  existing_payment public.payments%ROWTYPE;
  persisted_payment_id integer;
  current_due public.subscriptions.next_billing_date%TYPE;
  normalized_next_billing_date public.subscriptions.next_billing_date%TYPE;
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

  normalized_next_billing_date := p_next_billing_date::timestamp;

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

  IF current_due::date = cycle.cycle_date THEN
    UPDATE public.subscriptions
    SET current_period_start = cycle.cycle_date::timestamp,
        current_period_end = normalized_next_billing_date,
        next_billing_date = normalized_next_billing_date,
        updated_at = NOW()
    WHERE id = cycle.subscription_id;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    IF affected_rows <> 1 THEN RAISE EXCEPTION 'subscription billing period update affected % rows', affected_rows; END IF;
  ELSIF current_due::date < cycle.cycle_date THEN
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

CREATE OR REPLACE FUNCTION public.cancel_member_subscription_atomic(
  p_member_id integer,
  p_subscription_id integer,
  p_immediate boolean,
  p_requested_at timestamptz,
  p_effective_at timestamptz,
  p_reason text,
  p_reason_code text,
  p_actor_id uuid,
  p_actor_type text,
  p_internal_notes text,
  p_service_usage_status text,
  p_service_usage_source text,
  p_refund_eligibility text,
  p_refund_eligibility_reason text,
  p_refund_evaluated_at timestamptz,
  p_refund_status text,
  p_pending_details jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member public.members%ROWTYPE;
  v_subscription public.subscriptions%ROWTYPE;
  v_effective_at timestamptz;
  v_affected_rows integer;
BEGIN
  v_effective_at := CASE
    WHEN p_immediate THEN p_effective_at
    ELSE ((p_effective_at::date + 1)::timestamp AT TIME ZONE 'America/Chicago')
      - INTERVAL '1 millisecond'
  END;

  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE id = p_subscription_id AND member_id = p_member_id
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'member subscription not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.recurring_billing_cycles
    WHERE subscription_id = p_subscription_id AND state = 'submitting'
  ) THEN
    RAISE EXCEPTION 'billing submission is in progress; reconcile it before cancellation';
  END IF;

  UPDATE public.recurring_billing_cycles
  SET state = 'cancelled', failure_classification = 'membership_cancelled',
      lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL,
      updated_at = p_requested_at
  WHERE subscription_id = p_subscription_id
    AND state IN ('ready', 'claimed', 'declined');

  UPDATE public.members
  SET status = CASE WHEN p_immediate THEN 'cancelled' ELSE 'active' END,
      is_active = NOT p_immediate,
      cancellation_date = p_requested_at,
      cancellation_reason = p_reason,
      cancellation_requested_at = p_requested_at,
      cancellation_effective_at = v_effective_at,
      cancellation_reason_code = p_reason_code,
      cancellation_actor_id = p_actor_id,
      cancellation_actor_type = p_actor_type,
      cancellation_internal_notes = p_internal_notes,
      service_usage_status = p_service_usage_status,
      service_usage_verification_source = p_service_usage_source,
      refund_eligibility = p_refund_eligibility,
      refund_eligibility_reason = p_refund_eligibility_reason,
      refund_eligibility_evaluated_at = p_refund_evaluated_at,
      refund_status = p_refund_status,
      updated_at = p_requested_at
  WHERE id = p_member_id
  RETURNING * INTO v_member;

  IF NOT FOUND THEN RAISE EXCEPTION 'member not found'; END IF;

  UPDATE public.subscriptions
  SET status = CASE WHEN p_immediate THEN 'cancelled' ELSE 'active' END,
      billing_mode = 'disabled',
      pending_reason = 'member_cancelled',
      pending_details = p_pending_details::text,
      termination_effective_at = v_effective_at,
      updated_at = p_requested_at
  WHERE id = p_subscription_id
  RETURNING * INTO v_subscription;

  GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
  IF v_affected_rows <> 1 THEN
    RAISE EXCEPTION 'subscription cancellation update affected % rows', v_affected_rows;
  END IF;

  RETURN jsonb_build_object('member', to_jsonb(v_member), 'subscription', to_jsonb(v_subscription));
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_due_scheduled_cancellations(
  p_now timestamptz DEFAULT NOW()
)
RETURNS TABLE(finalized_count integer, deferred_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  due_subscription record;
  affected_rows integer;
BEGIN
  finalized_count := 0;
  deferred_count := 0;

  FOR due_subscription IN
    SELECT subscription.id, subscription.member_id
    FROM public.subscriptions subscription
    WHERE subscription.status = 'active'
      AND subscription.billing_mode = 'disabled'
      AND subscription.pending_reason = 'member_cancelled'
      AND subscription.termination_effective_at IS NOT NULL
      AND subscription.termination_effective_at <= p_now
    ORDER BY subscription.termination_effective_at, subscription.id
    FOR UPDATE SKIP LOCKED
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.recurring_billing_cycles cycle
      WHERE cycle.subscription_id = due_subscription.id
        AND cycle.state = 'submitting'
    ) THEN
      deferred_count := deferred_count + 1;
      CONTINUE;
    END IF;

    UPDATE public.recurring_billing_cycles
    SET state = 'cancelled', failure_classification = 'membership_cancelled',
        lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL,
        updated_at = p_now
    WHERE subscription_id = due_subscription.id
      AND state IN ('ready', 'claimed', 'declined');

    UPDATE public.subscriptions
    SET status = 'cancelled', pending_reason = NULL, pending_details = NULL,
        updated_at = p_now
    WHERE id = due_subscription.id
      AND status = 'active'
      AND pending_reason = 'member_cancelled';
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    IF affected_rows <> 1 THEN
      RAISE EXCEPTION 'scheduled subscription finalization affected % rows', affected_rows;
    END IF;

    UPDATE public.members
    SET status = 'cancelled', is_active = false,
        cancellation_date = COALESCE(cancellation_date, p_now), updated_at = p_now
    WHERE id = due_subscription.member_id;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    IF affected_rows <> 1 THEN
      RAISE EXCEPTION 'scheduled member finalization affected % rows', affected_rows;
    END IF;

    finalized_count := finalized_count + 1;
  END LOOP;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_recurring_cycle_success(bigint, text, text, text, text, text, timestamptz, date)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_member_subscription_atomic(integer, integer, boolean, timestamptz, timestamptz, text, text, uuid, text, text, text, text, text, text, timestamptz, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_due_scheduled_cancellations(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_recurring_cycle_success(bigint, text, text, text, text, text, timestamptz, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_member_subscription_atomic(integer, integer, boolean, timestamptz, timestamptz, text, text, uuid, text, text, text, text, text, text, timestamptz, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_due_scheduled_cancellations(timestamptz) TO service_role;

COMMIT;
