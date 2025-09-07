
-- Verify Supabase Linter Fixes
-- Run this after applying the main fix to confirm warnings are resolved

-- 1. Check lead_activities policies use optimized auth patterns
SELECT 
  'LEAD_ACTIVITIES POLICIES' as check_type,
  policyname,
  cmd as policy_type,
  CASE 
    WHEN qual LIKE '%SELECT auth.uid()%' THEN '✅ Optimized (uses subquery)'
    WHEN qual LIKE '%auth.uid()%' AND qual NOT LIKE '%SELECT auth.uid()%' THEN '❌ Not optimized (direct call)'
    ELSE '? Unknown pattern'
  END as optimization_status
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'lead_activities'
ORDER BY cmd, policyname;

-- 2. Check enrollment_modifications has consolidated policies
SELECT 
  'ENROLLMENT_MODIFICATIONS POLICIES' as check_type,
  cmd as policy_type,
  COUNT(*) as policy_count,
  CASE 
    WHEN COUNT(*) = 1 THEN '✅ Consolidated (1 policy per action)'
    WHEN COUNT(*) > 1 THEN '❌ Still multiple (' || COUNT(*) || ' policies)'
    ELSE '? No policies'
  END as consolidation_status
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'enrollment_modifications'
GROUP BY cmd
ORDER BY cmd;

-- 3. Verify RLS is still enabled on both tables
SELECT 
  'RLS STATUS' as check_type,
  t.tablename,
  c.relrowsecurity as rls_enabled,
  CASE 
    WHEN c.relrowsecurity THEN '✅ RLS Enabled'
    ELSE '❌ RLS DISABLED'
  END as status
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname = 'public'
AND t.tablename IN ('lead_activities', 'enrollment_modifications')
ORDER BY t.tablename;

-- 4. Test policy functionality (basic check)
SELECT 
  'POLICY FUNCTIONALITY TEST' as check_type,
  'Policies should allow authorized access and block unauthorized' as expected_behavior,
  'Run application tests to verify functionality' as recommendation;

-- 5. Summary of changes made
SELECT 
  'SUMMARY OF FIXES APPLIED' as report_type,
  'Auth RLS Initialization Plan: Fixed by using (SELECT auth.uid()) subqueries' as fix_1,
  'Multiple Permissive Policies: Fixed by consolidating multiple policies into single policies per action' as fix_2,
  'Both optimizations improve query performance at scale' as benefit,
  'Re-run Supabase database linter to confirm warnings are resolved' as next_step;
