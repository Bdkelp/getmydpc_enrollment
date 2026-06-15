-- WP-03: Configurable 3-level override flow-up auditing (additive only).

ALTER TABLE public.agent_commissions
  ADD COLUMN IF NOT EXISTS original_recipient_agent_id TEXT,
  ADD COLUMN IF NOT EXISTS final_recipient_agent_id TEXT,
  ADD COLUMN IF NOT EXISTS original_level INTEGER,
  ADD COLUMN IF NOT EXISTS final_paid_level INTEGER,
  ADD COLUMN IF NOT EXISTS flow_up_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS policy_version TEXT,
  ADD COLUMN IF NOT EXISTS override_pool_amount NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS override_level_split JSONB,
  ADD COLUMN IF NOT EXISTS override_window_levels INTEGER;

CREATE INDEX IF NOT EXISTS idx_agent_commissions_original_recipient
  ON public.agent_commissions(original_recipient_agent_id);

CREATE INDEX IF NOT EXISTS idx_agent_commissions_final_recipient
  ON public.agent_commissions(final_recipient_agent_id);

CREATE INDEX IF NOT EXISTS idx_agent_commissions_flow_up_reason
  ON public.agent_commissions(flow_up_reason_code);

ALTER TABLE public.commission_ledger
  ADD COLUMN IF NOT EXISTS original_recipient_agent_id TEXT,
  ADD COLUMN IF NOT EXISTS final_recipient_agent_id TEXT,
  ADD COLUMN IF NOT EXISTS original_level INTEGER,
  ADD COLUMN IF NOT EXISTS final_paid_level INTEGER,
  ADD COLUMN IF NOT EXISTS flow_up_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS policy_version TEXT,
  ADD COLUMN IF NOT EXISTS override_pool_amount NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS override_level_split JSONB,
  ADD COLUMN IF NOT EXISTS override_window_levels INTEGER;

CREATE INDEX IF NOT EXISTS idx_commission_ledger_original_recipient
  ON public.commission_ledger(original_recipient_agent_id);

CREATE INDEX IF NOT EXISTS idx_commission_ledger_final_recipient
  ON public.commission_ledger(final_recipient_agent_id);

CREATE INDEX IF NOT EXISTS idx_commission_ledger_flow_up_reason
  ON public.commission_ledger(flow_up_reason_code);
