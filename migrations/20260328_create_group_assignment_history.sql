-- Group assignment history audit log for reassignment workflows

CREATE TABLE IF NOT EXISTS public.group_assignment_history (
  id BIGSERIAL PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  old_agent_id UUID,
  new_agent_id UUID,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_date DATE NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  transfer_linked_employees BOOLEAN NOT NULL DEFAULT FALSE,
  transfer_open_workflows BOOLEAN NOT NULL DEFAULT FALSE,
  previous_agent_read_only BOOLEAN NOT NULL DEFAULT FALSE,
  cascade_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_assignment_history_group_id
  ON public.group_assignment_history(group_id);

CREATE INDEX IF NOT EXISTS idx_group_assignment_history_changed_at
  ON public.group_assignment_history(changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_group_assignment_history_new_agent_id
  ON public.group_assignment_history(new_agent_id);

CREATE INDEX IF NOT EXISTS idx_group_assignment_history_old_agent_id
  ON public.group_assignment_history(old_agent_id);
