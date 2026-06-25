-- Super admin live drop-in session tracking
-- Run in Supabase SQL editor (or your migration runner) before enabling impersonation endpoints.

CREATE TABLE IF NOT EXISTS public.impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  impersonator_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reason text,
  status varchar(20) NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  expires_at timestamptz,
  started_ip varchar(100),
  started_user_agent text,
  ended_ip varchar(100),
  ended_user_agent text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT impersonation_sessions_status_check CHECK (status IN ('active', 'ended', 'expired', 'revoked')),
  CONSTRAINT impersonation_sessions_not_self CHECK (impersonator_user_id <> target_user_id)
);

CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_impersonator
  ON public.impersonation_sessions (impersonator_user_id);

CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_target
  ON public.impersonation_sessions (target_user_id);

CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_status
  ON public.impersonation_sessions (status);

CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_started
  ON public.impersonation_sessions (started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_impersonation_sessions_active_unique
  ON public.impersonation_sessions (impersonator_user_id)
  WHERE status = 'active';
