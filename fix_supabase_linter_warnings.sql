
-- Fix Supabase Linter Performance Warnings
-- This script addresses the auth RLS initialization plan and multiple permissive policies warnings

-- 1. Fix Auth RLS Initialization Plan warnings for lead_activities table
-- Drop existing problematic policies
DROP POLICY IF EXISTS "Admins can view all lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Admins can insert lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Admins can update lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Admins can delete lead activities" ON public.lead_activities;

-- Create optimized policies using subqueries to prevent re-evaluation
CREATE POLICY "Admins can view all lead activities" ON public.lead_activities
  FOR SELECT
  USING (
    (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'admin'
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
  );

CREATE POLICY "Admins can insert lead activities" ON public.lead_activities
  FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'admin'
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
  );

CREATE POLICY "Admins can update lead activities" ON public.lead_activities
  FOR UPDATE
  USING (
    (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'admin'
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
  );

CREATE POLICY "Admins can delete lead activities" ON public.lead_activities
  FOR DELETE
  USING (
    (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'admin'
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
  );

-- 2. Fix Multiple Permissive Policies warnings for enrollment_modifications table
-- Drop all existing policies to consolidate them
DROP POLICY IF EXISTS "Admins can create enrollment modifications" ON public.enrollment_modifications;
DROP POLICY IF EXISTS "Agents can create enrollment modifications" ON public.enrollment_modifications;
DROP POLICY IF EXISTS "Role-based enrollment modifications" ON public.enrollment_modifications;
DROP POLICY IF EXISTS "Admins and agents can view all modifications" ON public.enrollment_modifications;
DROP POLICY IF EXISTS "Users can view their own enrollment modifications" ON public.enrollment_modifications;

-- Create consolidated policies that combine all permissions into single policies
CREATE POLICY "Consolidated enrollment modifications select" ON public.enrollment_modifications
  FOR SELECT
  USING (
    -- Service role bypass
    auth.role() = 'service_role'
    OR
    -- Admin access to all
    (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'admin'
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
    OR
    -- Agent access to all
    (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'agent'
    )
    OR
    -- Users can view their own modifications
    user_id = (SELECT auth.uid())
  );

CREATE POLICY "Consolidated enrollment modifications insert" ON public.enrollment_modifications
  FOR INSERT
  WITH CHECK (
    -- Service role bypass
    auth.role() = 'service_role'
    OR
    -- Admin can create all
    (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'admin'
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
    OR
    -- Agent can create for assigned users
    ((SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'agent'
    ) AND modified_by = (SELECT auth.uid()))
  );

CREATE POLICY "Consolidated enrollment modifications update" ON public.enrollment_modifications
  FOR UPDATE
  USING (
    -- Service role bypass
    auth.role() = 'service_role'
    OR
    -- Admin can update all
    (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'admin'
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
    OR
    -- Agent can update their own modifications
    ((SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'agent'
    ) AND modified_by = (SELECT auth.uid()))
  );

CREATE POLICY "Consolidated enrollment modifications delete" ON public.enrollment_modifications
  FOR DELETE
  USING (
    -- Service role bypass
    auth.role() = 'service_role'
    OR
    -- Admin can delete all
    (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'admin'
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
  );

-- Verify the fixes by checking policy counts and names
SELECT 
  'VERIFICATION' as check_type,
  tablename,
  COUNT(*) as policy_count,
  ARRAY_AGG(policyname ORDER BY policyname) as policy_names
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('lead_activities', 'enrollment_modifications')
GROUP BY tablename
ORDER BY tablename;

-- Final status check
SELECT 
  'Performance optimization applied for:' as status,
  '- lead_activities: Auth functions now use subqueries' as fix_1,
  '- enrollment_modifications: Multiple policies consolidated' as fix_2,
  'Run database linter again to verify warnings are resolved' as next_step;
