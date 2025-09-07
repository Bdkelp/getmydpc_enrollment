
-- Fix Missing RLS Policies for All Tables
-- This addresses all the "RLS Enabled No Policy" warnings from Supabase linter

-- 1. COMMISSIONS TABLE POLICIES
-- Drop any existing policies first
DROP POLICY IF EXISTS "Service role bypass commissions" ON public.commissions;
DROP POLICY IF EXISTS "Admins view all commissions" ON public.commissions;
DROP POLICY IF EXISTS "Agents view own commissions" ON public.commissions;

-- Create comprehensive policies for commissions
CREATE POLICY "Service role bypass commissions" ON public.commissions
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Admins view all commissions" ON public.commissions
  FOR SELECT
  USING (
    (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'admin'
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
  );

CREATE POLICY "Agents view own commissions" ON public.commissions
  FOR SELECT
  USING (
    agent_id::uuid = (SELECT auth.uid())
    OR (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'admin'
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
  );

CREATE POLICY "Admins manage commissions" ON public.commissions
  FOR ALL
  USING (
    (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'admin'
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
  );

-- 2. FAMILY_MEMBERS TABLE POLICIES
-- Drop any existing policies first
DROP POLICY IF EXISTS "Service role bypass family_members" ON public.family_members;
DROP POLICY IF EXISTS "Users view own family" ON public.family_members;
DROP POLICY IF EXISTS "Admins view all family" ON public.family_members;

-- Create comprehensive policies for family_members
CREATE POLICY "Service role bypass family_members" ON public.family_members
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users view own family" ON public.family_members
  FOR SELECT
  USING (
    primary_user_id::uuid = (SELECT auth.uid())
    OR (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' IN ('admin', 'agent')
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
  );

CREATE POLICY "Users manage own family" ON public.family_members
  FOR ALL
  USING (
    primary_user_id::uuid = (SELECT auth.uid())
    OR (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'admin'
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
  );

-- 3. PAYMENTS TABLE POLICIES
-- Drop any existing policies first
DROP POLICY IF EXISTS "Service role bypass payments" ON public.payments;
DROP POLICY IF EXISTS "Users view own payments" ON public.payments;
DROP POLICY IF EXISTS "Admins view all payments" ON public.payments;

-- Create comprehensive policies for payments
CREATE POLICY "Service role bypass payments" ON public.payments
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users view own payments" ON public.payments
  FOR SELECT
  USING (
    user_id::uuid = (SELECT auth.uid())
    OR (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' IN ('admin', 'agent')
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
  );

CREATE POLICY "Admins manage payments" ON public.payments
  FOR ALL
  USING (
    (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'admin'
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
  );

-- 4. PLANS TABLE POLICIES
-- Drop any existing policies first
DROP POLICY IF EXISTS "Service role bypass plans" ON public.plans;
DROP POLICY IF EXISTS "All authenticated users view plans" ON public.plans;

-- Create comprehensive policies for plans
CREATE POLICY "Service role bypass plans" ON public.plans
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "All authenticated users view plans" ON public.plans
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins manage plans" ON public.plans
  FOR ALL
  USING (
    (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'admin'
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
  );

-- 5. SESSIONS TABLE POLICIES (login_sessions)
-- Drop any existing policies first
DROP POLICY IF EXISTS "Service role bypass sessions" ON public.sessions;
DROP POLICY IF EXISTS "Users view own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Admins view all sessions" ON public.sessions;

-- Create comprehensive policies for sessions
CREATE POLICY "Service role bypass sessions" ON public.sessions
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users view own sessions" ON public.sessions
  FOR SELECT
  USING (
    user_id::uuid = (SELECT auth.uid())
    OR (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'admin'
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
  );

CREATE POLICY "Admins view all sessions" ON public.sessions
  FOR SELECT
  USING (
    (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'admin'
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
  );

-- 6. Add policies for login_sessions if it exists separately
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'login_sessions') THEN
    -- Drop existing policies
    EXECUTE 'DROP POLICY IF EXISTS "Service role bypass login_sessions" ON public.login_sessions';
    EXECUTE 'DROP POLICY IF EXISTS "Users view own login sessions" ON public.login_sessions';
    EXECUTE 'DROP POLICY IF EXISTS "Admins view all login sessions" ON public.login_sessions';
    
    -- Create policies for login_sessions
    EXECUTE 'CREATE POLICY "Service role bypass login_sessions" ON public.login_sessions FOR ALL USING (auth.role() = ''service_role'')';
    
    EXECUTE 'CREATE POLICY "Users view own login sessions" ON public.login_sessions FOR SELECT USING (
      user_id::uuid = (SELECT auth.uid())
      OR (SELECT auth.uid()) IN (
        SELECT id FROM auth.users
        WHERE auth.users.raw_user_meta_data->>''role'' = ''admin''
        OR auth.users.email LIKE ''%@mypremierplans.com''
      )
    )';
    
    EXECUTE 'CREATE POLICY "Admins view all login sessions" ON public.login_sessions FOR SELECT USING (
      (SELECT auth.uid()) IN (
        SELECT id FROM auth.users
        WHERE auth.users.raw_user_meta_data->>''role'' = ''admin''
        OR auth.users.email LIKE ''%@mypremierplans.com''
      )
    )';
    
    RAISE NOTICE 'Policies created for login_sessions table';
  END IF;
END
$$;

-- 7. VERIFICATION: Check all tables now have policies
SELECT 
  'POLICY VERIFICATION' as check_type,
  t.tablename,
  COUNT(p.policyname) as policy_count,
  CASE 
    WHEN COUNT(p.policyname) > 0 THEN '✅ Has Policies'
    ELSE '❌ NO POLICIES'
  END as status
FROM pg_tables t
LEFT JOIN pg_policies p ON p.schemaname = t.schemaname AND p.tablename = t.tablename
WHERE t.schemaname = 'public'
AND t.tablename IN ('commissions', 'family_members', 'payments', 'plans', 'sessions', 'login_sessions')
GROUP BY t.tablename
ORDER BY t.tablename;

-- 8. Final summary
SELECT 
  'SUMMARY' as report_type,
  'All missing RLS policies have been created' as status,
  'Tables affected: commissions, family_members, payments, plans, sessions' as tables_fixed,
  'Security level: Optimized with subqueries for better performance' as optimization,
  'Re-run Supabase linter to verify fixes' as next_step;
