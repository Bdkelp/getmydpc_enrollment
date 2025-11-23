-- ============================================================================
-- FIX: Add RLS Policy to Allow Backend Service Role to Insert Users
-- ============================================================================
-- Error: "new row violates row-level security policy for table \"users\""
-- 
-- The backend uses Supabase service role key to create users during login,
-- but the users table has RLS enabled without proper policies for service role.
-- 
-- Solution: Add policy to allow authenticated service to insert users
-- ============================================================================

-- Check current RLS status
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'users';

-- Drop existing restrictive policies if they exist
DROP POLICY IF EXISTS "service_role_can_insert_users" ON public.users;
DROP POLICY IF EXISTS "authenticated_users_can_insert" ON public.users;

-- Create policy to allow service role (backend) to insert users
-- The service role key bypasses RLS by default, but we need explicit policy for safety
CREATE POLICY "service_role_can_insert_users" 
ON public.users
FOR INSERT
TO service_role
WITH CHECK (true);

-- Also allow authenticated users to insert their own user record during signup
CREATE POLICY "authenticated_users_can_insert" 
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (
  id::uuid = auth.uid() OR
  EXISTS (SELECT 1 FROM public.users WHERE id::uuid = auth.uid() AND role IN ('admin', 'super_admin'))
);

-- Allow service role and authenticated users to update users table
DROP POLICY IF EXISTS "service_role_can_update_users" ON public.users;
DROP POLICY IF EXISTS "users_can_update_own_profile" ON public.users;

CREATE POLICY "service_role_can_update_users" 
ON public.users
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "users_can_update_own_profile" 
ON public.users
FOR UPDATE
TO authenticated
USING (
  id::uuid = auth.uid() OR
  EXISTS (SELECT 1 FROM public.users WHERE id::uuid = auth.uid() AND role IN ('admin', 'super_admin'))
)
WITH CHECK (
  id::uuid = auth.uid() OR
  EXISTS (SELECT 1 FROM public.users WHERE id::uuid = auth.uid() AND role IN ('admin', 'super_admin'))
);

-- Allow everyone to SELECT users (controlled by application logic)
-- Or restrict to authenticated users only
DROP POLICY IF EXISTS "anyone_can_view_users" ON public.users;

CREATE POLICY "anyone_can_view_users" 
ON public.users
FOR SELECT
TO authenticated
USING (true);

-- Verify policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'users'
ORDER BY policyname;

-- ============================================================================
-- INSTRUCTIONS:
-- 1. Run this script in your Supabase SQL Editor
-- 2. Railway backend will now be able to create users during login
-- 3. Test Richard Pennington's login again
-- ============================================================================
