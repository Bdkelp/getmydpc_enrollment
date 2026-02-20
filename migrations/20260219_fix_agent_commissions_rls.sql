-- Fix RLS policy for agent_commissions table to allow service_role access
-- This resolves the "new row violates row-level security policy" error when admins create commissions

BEGIN;

-- Enable RLS on agent_commissions if not already enabled
ALTER TABLE IF EXISTS public.agent_commissions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "agent_commissions_service_role_full_access" ON public.agent_commissions;
DROP POLICY IF EXISTS "agent_commissions_service_role_only" ON public.agent_commissions;

-- Create policy allowing service_role full access (backend uses service key)
CREATE POLICY agent_commissions_service_role_full_access
  ON public.agent_commissions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMIT;
