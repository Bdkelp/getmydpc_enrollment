-- Immutable lineage snapshots captured at payment-confirmed enrollment milestones.

CREATE TABLE IF NOT EXISTS public.agent_lineage_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id INTEGER NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  payment_id INTEGER NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  subscription_id INTEGER REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  enrolled_by_agent_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  lineage_depth INTEGER NOT NULL DEFAULT 0,
  lineage_path JSONB NOT NULL,
  capture_source TEXT NOT NULL DEFAULT 'payment_confirmed',
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_lineage_snapshots_member_payment
  ON public.agent_lineage_snapshots(member_id, payment_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_lineage_snapshots_idempotency_key
  ON public.agent_lineage_snapshots(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_agent_lineage_snapshots_member_id
  ON public.agent_lineage_snapshots(member_id);

CREATE INDEX IF NOT EXISTS idx_agent_lineage_snapshots_payment_id
  ON public.agent_lineage_snapshots(payment_id);

ALTER TABLE public.agent_lineage_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_lineage_snapshots FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_lineage_snapshots'
      AND policyname = 'agent_lineage_snapshots_service_role_only'
  ) THEN
    CREATE POLICY agent_lineage_snapshots_service_role_only
      ON public.agent_lineage_snapshots
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

ALTER TABLE public.agent_commissions
  ADD COLUMN IF NOT EXISTS lineage_snapshot_id UUID REFERENCES public.agent_lineage_snapshots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_commissions_lineage_snapshot_id
  ON public.agent_commissions(lineage_snapshot_id);

ALTER TABLE public.commission_ledger
  ADD COLUMN IF NOT EXISTS lineage_snapshot_id UUID REFERENCES public.agent_lineage_snapshots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_commission_ledger_lineage_snapshot_id
  ON public.commission_ledger(lineage_snapshot_id);
