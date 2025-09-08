-- Test Script to Verify RLS Policy Fixes
-- Run this after applying the fix scripts to verify everything works

-- 1. Check RLS status for all critical tables
SELECT 
  tablename,
  rowsecurity as rls_enabled,
  CASE 
    WHEN rowsecurity THEN '✅ RLS Enabled'
    ELSE '❌ RLS NOT Enabled - SECURITY RISK!'
  END as status
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
  'users', 'commissions', 'family_members', 'payments', 
  'sessions', 'subscriptions', 'plans', 'leads',
  'lead_activities', 'enrollment_modifications'
)
ORDER BY 
  CASE WHEN NOT rowsecurity THEN 0 ELSE 1 END,
  tablename;

-- 2. Count policies per table
SELECT 
  tablename,
  COUNT(*) as policy_count,
  CASE 
    WHEN COUNT(*) = 0 THEN '❌ NO POLICIES - SECURITY RISK!'
    WHEN COUNT(*) < 2 THEN '⚠️  Only ' || COUNT(*) || ' policy'
    ELSE '✅ ' || COUNT(*) || ' policies'
  END as status
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN (
  'users', 'commissions', 'family_members', 'payments', 
  'sessions', 'subscriptions', 'plans', 'leads',
  'lead_activities', 'enrollment_modifications'
)
GROUP BY tablename
ORDER BY 
  CASE WHEN COUNT(*) = 0 THEN 0 ELSE 1 END,
  tablename;

-- 3. List all policies with their definitions
SELECT 
  tablename,
  policyname,
  permissive,
  roles,
  cmd as operation,
  CASE 
    WHEN qual IS NOT NULL THEN 'Has USING clause'
    ELSE 'No USING clause'
  END as using_clause,
  CASE 
    WHEN with_check IS NOT NULL THEN 'Has CHECK clause'
    ELSE 'No CHECK clause'
  END as check_clause
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN (
  'users', 'commissions', 'family_members', 'payments', 
  'sessions', 'subscriptions', 'plans', 'leads',
  'lead_activities', 'enrollment_modifications'
)
ORDER BY tablename, policyname;

-- 4. Check for problematic column references
SELECT 
  tablename,
  policyname,
  CASE 
    WHEN qual::text LIKE '%"agentId"%' THEN '❌ Uses camelCase "agentId"'
    WHEN qual::text LIKE '%"userId"%' THEN '❌ Uses camelCase "userId"'
    WHEN qual::text LIKE '%"primaryUserId"%' THEN '❌ Uses camelCase "primaryUserId"'
    WHEN qual::text LIKE '%"enrolledByAgentId"%' THEN '❌ Uses camelCase "enrolledByAgentId"'
    WHEN qual::text LIKE '%"approvalStatus"%' THEN '❌ Uses camelCase "approvalStatus"'
    WHEN qual::text LIKE '%"isActive"%' THEN '❌ Uses camelCase "isActive"'
    WHEN qual::text LIKE '%"createdAt"%' THEN '❌ Uses camelCase "createdAt"'
    ELSE '✅ Uses correct snake_case'
  END as column_naming_check
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('commissions', 'family_members', 'users', 'subscriptions')
AND (
  qual::text LIKE '%"agentId"%' OR
  qual::text LIKE '%"userId"%' OR
  qual::text LIKE '%"primaryUserId"%' OR
  qual::text LIKE '%"enrolledByAgentId"%' OR
  qual::text LIKE '%"approvalStatus"%' OR
  qual::text LIKE '%"isActive"%' OR
  qual::text LIKE '%"createdAt"%'
);

-- 5. Check for duplicate policy names
SELECT 
  policyname,
  COUNT(*) as duplicate_count,
  STRING_AGG(tablename, ', ') as tables_with_policy
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY policyname
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, policyname;

-- 6. Final Summary
SELECT 
  '=== RLS POLICY TEST RESULTS ===' as report,
  (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false 
   AND tablename IN ('users', 'commissions', 'family_members', 'payments', 'sessions', 'subscriptions'))::text || ' tables without RLS' as missing_rls,
  (SELECT COUNT(DISTINCT tablename) FROM pg_policies WHERE schemaname = 'public')::text || ' tables with policies' as tables_with_policies,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public')::text || ' total policies' as total_policies,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' 
      AND (qual::text LIKE '%"agentId"%' OR qual::text LIKE '%"userId"%')
    ) THEN '❌ Found camelCase column references'
    ELSE '✅ All column references use snake_case'
  END as column_naming_status;