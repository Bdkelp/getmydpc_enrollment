-- Durable audit and delivery outbox for agent-initiated membership changes.
CREATE TABLE IF NOT EXISTS public.agent_membership_change_alerts (
 id BIGSERIAL PRIMARY KEY,
 member_ref TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 actor_role TEXT NOT NULL,
 change_type TEXT NOT NULL,
 summary TEXT NOT NULL,
 recipient_email TEXT NOT NULL DEFAULT 'info@mypremierplans.com',
 state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','sent','failed')),
 attempts INT NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 claimed_at TIMESTAMPTZ,
 sent_at TIMESTAMPTZ,
 last_error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_member_change_alert_due ON public.agent_membership_change_alerts(state,next_attempt_at);
ALTER TABLE public.agent_membership_change_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_membership_change_alerts FROM anon,authenticated;
GRANT ALL ON public.agent_membership_change_alerts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.agent_membership_change_alerts_id_seq TO service_role;
