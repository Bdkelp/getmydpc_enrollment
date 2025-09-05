
-- Fix RLS Performance Issues
-- This script addresses the Supabase linter warnings for auth RLS initialization plan issues

-- 1. Fix lead_activities RLS policies to use subqueries for auth functions
DROP POLICY IF EXISTS "Admins can view all lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Admins can insert lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Admins can update lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Admins can delete lead activities" ON public.lead_activities;

-- Create optimized policies with subqueries
CREATE POLICY "Admins can view all lead activities" ON public.lead_activities
  FOR SELECT
  USING ((SELECT auth.jwt()) ->> 'user_metadata' ->> 'role' = 'admin');

CREATE POLICY "Admins can insert lead activities" ON public.lead_activities
  FOR INSERT
  WITH CHECK ((SELECT auth.jwt()) ->> 'user_metadata' ->> 'role' = 'admin');

CREATE POLICY "Admins can update lead activities" ON public.lead_activities
  FOR UPDATE
  USING ((SELECT auth.jwt()) ->> 'user_metadata' ->> 'role' = 'admin')
  WITH CHECK ((SELECT auth.jwt()) ->> 'user_metadata' ->> 'role' = 'admin');

CREATE POLICY "Admins can delete lead activities" ON public.lead_activities
  FOR DELETE
  USING ((SELECT auth.jwt()) ->> 'user_metadata' ->> 'role' = 'admin');

-- 2. Consolidate multiple permissive policies on enrollment_modifications
-- Drop existing policies
DROP POLICY IF EXISTS "Admins can create enrollment modifications" ON public.enrollment_modifications;
DROP POLICY IF EXISTS "Agents can create enrollment modifications" ON public.enrollment_modifications;
DROP POLICY IF EXISTS "Admins and agents can view all modifications" ON public.enrollment_modifications;
DROP POLICY IF EXISTS "Users can view their own enrollment modifications" ON public.enrollment_modifications;

-- Create consolidated policies
CREATE POLICY "Admins and agents can create enrollment modifications" ON public.enrollment_modifications
  FOR INSERT
  WITH CHECK (
    (SELECT auth.jwt()) ->> 'user_metadata' ->> 'role' IN ('admin', 'agent')
  );

CREATE POLICY "Comprehensive view policy for enrollment modifications" ON public.enrollment_modifications
  FOR SELECT
  USING (
    -- Admins and agents can view all
    (SELECT auth.jwt()) ->> 'user_metadata' ->> 'role' IN ('admin', 'agent')
    OR 
    -- Users can view their own modifications
    user_id = (SELECT auth.uid())
  );

-- Add agents can update modifications
CREATE POLICY "Admins and agents can update enrollment modifications" ON public.enrollment_modifications
  FOR UPDATE
  USING ((SELECT auth.jwt()) ->> 'user_metadata' ->> 'role' IN ('admin', 'agent'))
  WITH CHECK ((SELECT auth.jwt()) ->> 'user_metadata' ->> 'role' IN ('admin', 'agent'));

-- Add agents can delete modifications
CREATE POLICY "Admins can delete enrollment modifications" ON public.enrollment_modifications
  FOR DELETE
  USING ((SELECT auth.jwt()) ->> 'user_metadata' ->> 'role' = 'admin');

-- Verify policies are working
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename IN ('lead_activities', 'enrollment_modifications')
ORDER BY tablename, policyname;
