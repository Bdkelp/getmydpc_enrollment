-- Additive cancellation/refund eligibility metadata.
-- This migration does not issue refunds or alter EPX/payment behavior.
BEGIN;

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_effective_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason_code text,
  ADD COLUMN IF NOT EXISTS cancellation_actor_id uuid,
  ADD COLUMN IF NOT EXISTS cancellation_actor_type text,
  ADD COLUMN IF NOT EXISTS cancellation_internal_notes text,
  ADD COLUMN IF NOT EXISTS service_usage_status text,
  ADD COLUMN IF NOT EXISTS service_usage_verification_source text,
  ADD COLUMN IF NOT EXISTS refund_eligibility text,
  ADD COLUMN IF NOT EXISTS refund_eligibility_reason text,
  ADD COLUMN IF NOT EXISTS refund_eligibility_evaluated_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_status text,
  ADD COLUMN IF NOT EXISTS refund_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_processed_by uuid;

ALTER TABLE public.members
  DROP CONSTRAINT IF EXISTS members_cancellation_reason_code_check,
  ADD CONSTRAINT members_cancellation_reason_code_check CHECK (
    cancellation_reason_code IS NULL OR cancellation_reason_code IN (
      'member_requested', 'non_payment', 'duplicate_enrollment', 'ineligible',
      'group_termination', 'deceased', 'fraud_or_terms', 'admin_other'
    )
  ),
  DROP CONSTRAINT IF EXISTS members_service_usage_status_check,
  ADD CONSTRAINT members_service_usage_status_check CHECK (
    service_usage_status IS NULL OR service_usage_status IN ('yes', 'no', 'unknown')
  ),
  DROP CONSTRAINT IF EXISTS members_refund_eligibility_check,
  ADD CONSTRAINT members_refund_eligibility_check CHECK (
    refund_eligibility IS NULL OR refund_eligibility IN ('eligible', 'not_eligible', 'review_required')
  ),
  DROP CONSTRAINT IF EXISTS members_refund_status_check,
  ADD CONSTRAINT members_refund_status_check CHECK (
    refund_status IS NULL OR refund_status IN ('not_applicable', 'pending_manual_refund', 'refunded')
  );

COMMENT ON COLUMN public.members.membership_start_date IS
  'Authoritative membership start/effective date used by the refund eligibility window.';
COMMENT ON COLUMN public.members.cancellation_reason IS
  'Legacy/display text retained for compatibility; cancellation_reason_code is authoritative for workflow decisions.';
COMMENT ON COLUMN public.members.cancellation_internal_notes IS
  'Admin-only cancellation notes. Never include this field in agent-facing payloads.';
COMMENT ON COLUMN public.members.refund_status IS
  'Manual processing state only. pending_manual_refund never means a refund was issued.';

COMMIT;