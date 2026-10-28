-- Durable, per-recipient PBM email alert outbox (no PHI in email payload).
CREATE TABLE IF NOT EXISTS public.pbm_email_outbox (
 id BIGSERIAL PRIMARY KEY,
 change_id BIGINT NOT NULL REFERENCES public.pbm_membership_changes(id),
 recipient_email TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','sent','failed')),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 claimed_at TIMESTAMPTZ,
 sent_at TIMESTAMPTZ,
 last_error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(change_id,recipient_email)
);
CREATE INDEX IF NOT EXISTS idx_pbm_email_outbox_due ON public.pbm_email_outbox(state,next_attempt_at);
ALTER TABLE public.pbm_email_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pbm_email_outbox FROM anon, authenticated;
GRANT ALL ON public.pbm_email_outbox TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.pbm_email_outbox_id_seq TO service_role;
