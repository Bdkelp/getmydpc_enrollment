-- PBM servicing ledger for existing V1 DPC subscriptions.
-- Eligibility fulfillment is an operator task; this schema does not transmit files.
CREATE TABLE IF NOT EXISTS public.pbm_membership_changes (
  id BIGSERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES public.members(id),
  subscription_id INTEGER NOT NULL REFERENCES public.subscriptions(id),
  current_enabled BOOLEAN NOT NULL,
  target_enabled BOOLEAN NOT NULL,
  amount_delta NUMERIC(10,2) NOT NULL,
  effective_date DATE NOT NULL,
  request_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (request_status IN ('pending', 'applied', 'withdrawn')),
  fulfillment_status TEXT NOT NULL DEFAULT 'Pending Submission'
    CHECK (fulfillment_status IN ('Pending Submission', 'Submitted', 'Confirmed')),
  requested_by TEXT NOT NULL,
  requested_by_role TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pbm_membership_change_pending_subscription
  ON public.pbm_membership_changes (subscription_id)
  WHERE request_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pbm_membership_changes_fulfillment
  ON public.pbm_membership_changes (fulfillment_status, effective_date)
  WHERE request_status = 'pending';

CREATE TABLE IF NOT EXISTS public.pbm_membership_change_events (
  id BIGSERIAL PRIMARY KEY,
  change_id BIGINT NOT NULL REFERENCES public.pbm_membership_changes(id),
  event_type TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  note TEXT,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pbm_membership_change_events_change
  ON public.pbm_membership_change_events (change_id, created_at);

ALTER TABLE public.pbm_membership_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pbm_membership_change_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pbm_membership_changes FROM anon, authenticated;
REVOKE ALL ON public.pbm_membership_change_events FROM anon, authenticated;
GRANT ALL ON public.pbm_membership_changes TO service_role;
GRANT ALL ON public.pbm_membership_change_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.pbm_membership_changes_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.pbm_membership_change_events_id_seq TO service_role;
