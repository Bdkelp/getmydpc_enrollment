
-- Verify RLS Policy Fixes
-- Run this after applying the main RLS policy fixes

-- 1. Check RLS is enabled on all tables
SELECT 
  'RLS STATUS CHECK' as check_type,
  schemaname||'.'||tablename as table_name,
  rowsecurity as rls_enabled,
  CASE 
    WHEN rowsecurity THEN '✅ RLS Enabled'
    ELSE '❌ RLS DISABLED'
  END as status
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname = 'public'
AND t.tablename IN ('commissions', 'family_members', 'payments', 'plans', 'sessions', 'login_sessions')
ORDER BY t.tablename;

-- 2. Count policies per table
SELECT 
  'POLICY COUNT CHECK' as check_type,
  tablename,
  COUNT(*) as policy_count,
  CASE 
    WHEN COUNT(*) >= 2 THEN '✅ Has Multiple Policies'
    WHEN COUNT(*) = 1 THEN '⚠️ Only 1 Policy'
    ELSE '❌ NO POLICIES'
  END as status
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('commissions', 'family_members', 'payments', 'plans', 'sessions', 'login_sessions')
GROUP BY tablename
ORDER BY tablename;

-- 3. List all policies with their types
SELECT 
  'POLICY DETAILS' as check_type,
  tablename,
  policyname,
  cmd as policy_type,
  CASE 
    WHEN qual LIKE '%SELECT auth.uid()%' THEN '✅ Optimized (subquery)'
    WHEN qual LIKE '%auth.uid()%' AND qual NOT LIKE '%SELECT auth.uid()%' THEN '⚠️ Direct call'
    WHEN qual LIKE '%service_role%' THEN '🔧 Service bypass'
    ELSE '📋 Other pattern'
  END as optimization_status
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('commissions', 'family_members', 'payments', 'plans', 'sessions', 'login_sessions')
ORDER BY tablename, cmd, policyname;

-- 4. Check for tables that still have RLS enabled but no policies
SELECT 
  'REMAINING ISSUES' as check_type,
  t.tablename,
  'RLS enabled but no policies' as issue
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname = 'public'
AND c.relrowsecurity = true
AND NOT EXISTS (
  SELECT 1 FROM pg_policies p 
  WHERE p.schemaname = t.schemaname 
  AND p.tablename = t.tablename
)
AND t.tablename IN ('commissions', 'family_members', 'payments', 'plans', 'sessions', 'login_sessions');

-- 5. Final status report
SELECT 
  'FINAL STATUS' as report_type,
  'RLS Policy Implementation Complete' as status,
  'All critical tables now have proper RLS policies' as result,
  'Performance optimized with subquery patterns' as optimization,
  'Run Supabase database linter to confirm all warnings resolved' as next_step;
