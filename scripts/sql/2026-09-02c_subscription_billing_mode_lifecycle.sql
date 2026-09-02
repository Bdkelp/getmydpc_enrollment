-- Explicit recurring billing mode and atomic cancellation lifecycle transition.
BEGIN;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'automatic';

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_billing_mode_check,
  ADD CONSTRAINT subscriptions_billing_mode_check
    CHECK (billing_mode IN ('automatic', 'manual_external', 'disabled'));

CREATE INDEX IF NOT EXISTS idx_subscriptions_automatic_billing_due
  ON public.subscriptions (next_billing_date, id)
  WHERE status = 'active' AND billing_mode = 'automatic';

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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  UPDATE public.subscriptions
  SET status = CASE WHEN p_immediate THEN 'cancelled' ELSE 'active' END,
      billing_mode = 'disabled',
      pending_reason = 'member_cancelled',
      pending_details = p_pending_details::text,
      end_date = v_effective_at, updated_at = p_requested_at
  WHERE id = p_subscription_id
  RETURNING * INTO v_subscription;

  GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
  IF v_affected_rows <> 1 THEN
    RAISE EXCEPTION 'subscription cancellation update affected % rows', v_affected_rows;
  END IF;

  RETURN jsonb_build_object(
    'member', to_jsonb(v_member),
    'subscription', to_jsonb(v_subscription)
  );
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
      AND subscription.end_date IS NOT NULL
      AND subscription.end_date <= p_now
    ORDER BY subscription.end_date, subscription.id
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

REVOKE ALL ON FUNCTION public.cancel_member_subscription_atomic(integer, integer, boolean, timestamptz, timestamptz, text, text, uuid, text, text, text, text, text, text, timestamptz, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_member_subscription_atomic(integer, integer, boolean, timestamptz, timestamptz, text, text, uuid, text, text, text, text, text, text, timestamptz, text, jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION public.finalize_due_scheduled_cancellations(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_due_scheduled_cancellations(timestamptz)
  TO service_role;

COMMENT ON COLUMN public.subscriptions.billing_mode IS
  'automatic is eligible for unattended billing; manual_external and disabled are never submitted automatically.';

COMMIT;