BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_tokens_member_active_primary
  ON public.payment_tokens (member_id)
  WHERE member_id IS NOT NULL
    AND is_active = true
    AND is_primary = true;

COMMIT;