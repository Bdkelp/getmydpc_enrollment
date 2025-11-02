-- Supabase Security Linter Fixes
-- These fixes address the Supabase security linter errors:
-- 1. Remove SECURITY DEFINER from views (use caller's permissions)
-- 2. Enable RLS on public tables

-- FIX 1: Remove SECURITY DEFINER from agent_commissions_with_details view
-- SECURITY DEFINER causes the view to run with creator's permissions
-- which bypasses RLS policies. Views should use caller's permissions instead.

-- Step 1: Check current view definition to see if it has SECURITY DEFINER
-- Query: SELECT pg_get_viewdef('public.agent_commissions_with_details', true);

-- Step 2: Drop and recreate the view WITHOUT SECURITY DEFINER
-- IMPORTANT: You must replace the SELECT statement with your actual view definition
DROP VIEW IF EXISTS public.agent_commissions_with_details CASCADE;

-- Recreate WITHOUT SECURITY DEFINER - Copy your exact SELECT statement here
-- Get your actual definition from: 
-- SELECT pg_get_viewdef('public.agent_commissions_with_details'::regclass, true)
-- Then replace the SELECT below with that definition
CREATE VIEW public.agent_commissions_with_details WITH (security_barrier=false) AS
SELECT ac.id,
    ac.agent_id,
    ac.member_id,
    ac.enrollment_id,
    ac.commission_amount,
    ac.payment_status,
    ac.created_at,
    ac.updated_at,
    u.email AS agent_email,
    u.first_name AS agent_first_name,
    u.last_name AS agent_last_name
   FROM agent_commissions ac
     LEFT JOIN users u ON ac.agent_id = u.id::text;

-- FIX 2: Remove SECURITY DEFINER from agent_downlines view
-- Step 1: Check current view definition
-- Query: SELECT pg_get_viewdef('public.agent_downlines', true);

-- Step 2: Drop and recreate WITHOUT SECURITY DEFINER
DROP VIEW IF EXISTS public.agent_downlines CASCADE;

-- Get your actual definition from:
-- SELECT pg_get_viewdef('public.agent_downlines'::regclass, true)
-- Then replace the SELECT below with that definition
CREATE VIEW public.agent_downlines WITH (security_barrier=false) AS
SELECT parent.id AS parent_agent_id,
    child.id AS downline_agent_id,
    parent.email AS parent_email,
    child.email AS downline_email,
    child.first_name,
    child.last_name
   FROM users parent
     LEFT JOIN users child ON child.upline_agent_id = parent.id::text
  WHERE parent.role::text = 'agent'::text;

-- Change view ownership to postgres to remove SECURITY DEFINER implications
ALTER VIEW public.agent_commissions_with_details OWNER TO postgres;
ALTER VIEW public.agent_downlines OWNER TO postgres;

-- FIX 3: Enable RLS on agent_hierarchy_history table
ALTER TABLE public.agent_hierarchy_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "admins_can_view_all_hierarchy_history" ON public.agent_hierarchy_history;
DROP POLICY IF EXISTS "agents_can_view_own_hierarchy_history" ON public.agent_hierarchy_history;
DROP POLICY IF EXISTS "only_admins_modify_hierarchy_history" ON public.agent_hierarchy_history;
DROP POLICY IF EXISTS "only_admins_update_hierarchy_history" ON public.agent_hierarchy_history;
DROP POLICY IF EXISTS "only_admins_delete_hierarchy_history" ON public.agent_hierarchy_history;

-- Create policies to control access
-- Policy 1: Admins can see all history
CREATE POLICY "admins_can_view_all_hierarchy_history" ON public.agent_hierarchy_history
  FOR SELECT
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()::text) = 'admin'
  );

-- Policy 2: Agents can see their own hierarchy changes
CREATE POLICY "agents_can_view_own_hierarchy_history" ON public.agent_hierarchy_history
  FOR SELECT
  USING (
    agent_id = auth.uid()::text OR
    (SELECT role FROM public.users WHERE id = auth.uid()::text) = 'admin'
  );

-- Policy 3: Only admins can insert/update/delete history (audit trail)
CREATE POLICY "only_admins_modify_hierarchy_history" ON public.agent_hierarchy_history
  FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.users WHERE id = auth.uid()::text) = 'admin'
  );

CREATE POLICY "only_admins_update_hierarchy_history" ON public.agent_hierarchy_history
  FOR UPDATE
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()::text) = 'admin'
  )
  WITH CHECK (
    (SELECT role FROM public.users WHERE id = auth.uid()::text) = 'admin'
  );

CREATE POLICY "only_admins_delete_hierarchy_history" ON public.agent_hierarchy_history
  FOR DELETE
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()::text) = 'admin'
  );

-- FIX 4: Enable RLS on agent_override_config table
ALTER TABLE public.agent_override_config ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "admins_can_view_all_override_configs" ON public.agent_override_config;
DROP POLICY IF EXISTS "agents_can_view_own_override_configs" ON public.agent_override_config;
DROP POLICY IF EXISTS "only_admins_can_insert_override_configs" ON public.agent_override_config;
DROP POLICY IF EXISTS "only_admins_can_update_override_configs" ON public.agent_override_config;
DROP POLICY IF EXISTS "only_admins_can_delete_override_configs" ON public.agent_override_config;

-- Create policies to control access
-- Policy 1: Admins can see all override configs
CREATE POLICY "admins_can_view_all_override_configs" ON public.agent_override_config
  FOR SELECT
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()::text) = 'admin'
  );

-- Policy 2: Agents can see their own override configs
CREATE POLICY "agents_can_view_own_override_configs" ON public.agent_override_config
  FOR SELECT
  USING (
    agent_id = auth.uid()::text OR
    (SELECT role FROM public.users WHERE id = auth.uid()::text) = 'admin'
  );

-- Policy 3: Only admins can insert/update/delete override configs
CREATE POLICY "only_admins_can_insert_override_configs" ON public.agent_override_config
  FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.users WHERE id = auth.uid()::text) = 'admin'
  );

CREATE POLICY "only_admins_can_update_override_configs" ON public.agent_override_config
  FOR UPDATE
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()::text) = 'admin'
  )
  WITH CHECK (
    (SELECT role FROM public.users WHERE id = auth.uid()::text) = 'admin'
  );

CREATE POLICY "only_admins_can_delete_override_configs" ON public.agent_override_config
  FOR DELETE
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()::text) = 'admin'
  );

-- ========== CRITICAL INSTRUCTIONS FOR VIEWS ==========
-- The views above are EXAMPLES. You MUST update them with your actual view definitions.
-- 
-- To find your actual view definitions, run these queries FIRST:
-- 
-- Query 1: Get actual agent_commissions_with_details definition
-- SELECT pg_get_viewdef('public.agent_commissions_with_details'::regclass, true);
-- 
-- Query 2: Get actual agent_downlines definition  
-- SELECT pg_get_viewdef('public.agent_downlines'::regclass, true);
--
-- THEN: Replace the SELECT statements in FIX 1 and FIX 2 above with your actual definitions
-- IMPORTANT: Do NOT include "SECURITY DEFINER" - that's what we're removing!
--
-- After getting your actual definitions and updating the script above, execute the full script.
-- ====================================================

-- IMPORTANT: After running these fixes:
-- 1. Test that views still work correctly with the new permissions
-- 2. Verify RLS policies don't break existing queries
-- 3. Re-run Supabase linter to confirm all errors are resolved

-- Verify RLS is enabled on all tables
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('agent_hierarchy_history', 'agent_override_config')
ORDER BY tablename;

-- List all policies on the tables
SELECT schemaname, tablename, policyname, permissive, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('agent_hierarchy_history', 'agent_override_config')
ORDER BY tablename, policyname;

-- Verify views have no SECURITY DEFINER
SELECT schemaname, viewname, pg_get_viewdef(viewname::regclass, true)
FROM pg_views
WHERE schemaname = 'public'
AND viewname IN ('agent_commissions_with_details', 'agent_downlines');
