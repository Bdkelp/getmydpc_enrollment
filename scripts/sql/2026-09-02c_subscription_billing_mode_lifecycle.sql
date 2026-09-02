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

  RETURN jsonb_build_object(
    'member', to_jsonb(v_member),
    'subscription', to_jsonb(v_subscription)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_member_subscription_atomic(integer, integer, boolean, timestamptz, timestamptz, text, text, uuid, text, text, text, text, text, text, timestamptz, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_member_subscription_atomic(integer, integer, boolean, timestamptz, timestamptz, text, text, uuid, text, text, text, text, text, text, timestamptz, text, jsonb)
  TO service_role;

COMMENT ON COLUMN public.subscriptions.billing_mode IS
  'automatic is eligible for unattended billing; manual_external and disabled are never submitted automatically.';

COMMIT;