-- Commission ledger and payout batch foundation for recurring payout operations.
-- This is additive and does not modify existing commission calculation logic.

CREATE TABLE IF NOT EXISTS public.commission_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_commission_id UUID,
  parent_ledger_id UUID REFERENCES public.commission_ledger(id) ON DELETE SET NULL,

  agent_id UUID,
  agent_name TEXT NOT NULL,
  writing_number TEXT,

  member_id TEXT,
  member_name TEXT NOT NULL,
  membership_tier TEXT,
  coverage_type TEXT,
  effective_date DATE,

  commission_period_start DATE NOT NULL,
  commission_period_end DATE NOT NULL,
  commission_amount NUMERIC(10,2) NOT NULL,

  commission_type TEXT NOT NULL CHECK (commission_type IN ('new','renewal','adjustment','reversal')),
  status TEXT NOT NULL CHECK (status IN ('earned','queued','paid','held','reversed')),

  payout_batch_id UUID,
  statement_number TEXT,

  cancellation_date DATE,
  cancellation_reason TEXT,

  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_ledger_source_period
  ON public.commission_ledger(source_commission_id, commission_period_start, commission_period_end)
  WHERE source_commission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commission_ledger_agent ON public.commission_ledger(agent_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_member ON public.commission_ledger(member_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_status ON public.commission_ledger(status);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_period ON public.commission_ledger(commission_period_start, commission_period_end);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_payout_batch ON public.commission_ledger(payout_batch_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_cancellation_date ON public.commission_ledger(cancellation_date);

CREATE TABLE IF NOT EXISTS public.commission_payout_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_name TEXT NOT NULL,
  batch_type TEXT NOT NULL CHECK (batch_type IN ('1st-cycle','15th-cycle')),
  cutoff_date DATE NOT NULL,
  scheduled_pay_date DATE NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_agents INTEGER NOT NULL DEFAULT 0,
  total_records INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('draft','ready','exported','paid')) DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_commission_payout_batches_status ON public.commission_payout_batches(status);
CREATE INDEX IF NOT EXISTS idx_commission_payout_batches_cutoff ON public.commission_payout_batches(cutoff_date);
CREATE INDEX IF NOT EXISTS idx_commission_payout_batches_scheduled_pay_date ON public.commission_payout_batches(scheduled_pay_date);

ALTER TABLE public.commission_ledger
  DROP CONSTRAINT IF EXISTS fk_commission_ledger_batch;

ALTER TABLE public.commission_ledger
  ADD CONSTRAINT fk_commission_ledger_batch
  FOREIGN KEY (payout_batch_id)
  REFERENCES public.commission_payout_batches(id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.commission_cancellation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id TEXT NOT NULL,
  membership_id TEXT,
  agent_id UUID,
  cancellation_date DATE NOT NULL,
  cancellation_reason TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_commission_cancellation_events_member ON public.commission_cancellation_events(member_id);
CREATE INDEX IF NOT EXISTS idx_commission_cancellation_events_date ON public.commission_cancellation_events(cancellation_date);

CREATE TABLE IF NOT EXISTS public.commission_ledger_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID REFERENCES public.commission_ledger(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  payout_batch_id UUID REFERENCES public.commission_payout_batches(id) ON DELETE SET NULL,
  actor_id UUID,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_ledger_events_ledger_id ON public.commission_ledger_events(ledger_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_events_type ON public.commission_ledger_events(event_type);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_events_batch ON public.commission_ledger_events(payout_batch_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_events_created_at ON public.commission_ledger_events(created_at);
