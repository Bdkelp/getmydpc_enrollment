
-- Fix RLS Performance Issues
-- This script addresses the Supabase linter warnings for auth RLS initialization plan issues

-- 1. Fix lead_activities RLS policies to use subqueries for auth functions
DROP POLICY IF EXISTS "Admins can view all lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Admins can insert lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Admins can update lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Admins can delete lead activities" ON public.lead_activities;

-- Create optimized policies with subqueries for lead_activities
CREATE POLICY "Admins can view all lead activities" ON public.lead_activities
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role' = 'admin' OR auth.users.email LIKE '%@mypremierplans.com')
    )
  );

CREATE POLICY "Admins can insert lead activities" ON public.lead_activities
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role' = 'admin' OR auth.users.email LIKE '%@mypremierplans.com')
    )
  );

CREATE POLICY "Admins can update lead activities" ON public.lead_activities
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role' = 'admin' OR auth.users.email LIKE '%@mypremierplans.com')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role' = 'admin' OR auth.users.email LIKE '%@mypremierplans.com')
    )
  );

CREATE POLICY "Admins can delete lead activities" ON public.lead_activities
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role' = 'admin' OR auth.users.email LIKE '%@mypremierplans.com')
    )
  );

-- 2. Consolidate multiple permissive policies on enrollment_modifications
-- Drop existing policies
DROP POLICY IF EXISTS "Admins can create enrollment modifications" ON public.enrollment_modifications;
DROP POLICY IF EXISTS "Agents can create enrollment modifications" ON public.enrollment_modifications;
DROP POLICY IF EXISTS "Admins and agents can view all modifications" ON public.enrollment_modifications;
DROP POLICY IF EXISTS "Users can view their own enrollment modifications" ON public.enrollment_modifications;

-- Create consolidated policies for enrollment_modifications
CREATE POLICY "Admins and agents can create enrollment modifications" ON public.enrollment_modifications
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (
        auth.users.raw_user_meta_data->>'role' IN ('admin', 'agent')
        OR auth.users.email LIKE '%@mypremierplans.com'
      )
    )
  );

CREATE POLICY "Comprehensive view policy for enrollment modifications" ON public.enrollment_modifications
  FOR SELECT
  USING (
    -- Admins and agents can view all
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (
        auth.users.raw_user_meta_data->>'role' IN ('admin', 'agent')
        OR auth.users.email LIKE '%@mypremierplans.com'
      )
    )
    OR 
    -- Users can view their own modifications
    user_id = auth.uid()
  );

CREATE POLICY "Admins and agents can update enrollment modifications" ON public.enrollment_modifications
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (
        auth.users.raw_user_meta_data->>'role' IN ('admin', 'agent')
        OR auth.users.email LIKE '%@mypremierplans.com'
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (
        auth.users.raw_user_meta_data->>'role' IN ('admin', 'agent')
        OR auth.users.email LIKE '%@mypremierplans.com'
      )
    )
  );

CREATE POLICY "Admins can delete enrollment modifications" ON public.enrollment_modifications
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (
        auth.users.raw_user_meta_data->>'role' = 'admin'
        OR auth.users.email LIKE '%@mypremierplans.com'
      )
    )
  );

-- 3. Verify policies are working
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename IN ('lead_activities', 'enrollment_modifications')
ORDER BY tablename, policyname;
