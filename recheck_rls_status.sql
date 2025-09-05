
-- Comprehensive RLS Status Recheck
-- Run this in Supabase SQL Editor to verify all fixes

-- 1. Check RLS enabled status on all tables
SELECT 
  'RLS Status Check' as check_type,
  t.schemaname||'.'||t.tablename as table_name,
  c.relrowsecurity as rls_enabled,
  CASE 
    WHEN c.relrowsecurity THEN '✅ RLS Enabled'
    ELSE '❌ RLS DISABLED'
  END as status
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
WHERE t.schemaname = 'public'
AND t.tablename IN ('users', 'family_members', 'subscriptions', 'payments', 'commissions', 'leads', 'lead_activities', 'enrollment_modifications', 'plans', 'sessions')
ORDER BY t.tablename;

-- 2. Check for tables with RLS enabled but NO policies (the main issue)
SELECT 
  'Tables Without Policies' as issue_type,
  t.schemaname||'.'||t.tablename as table_name,
  'RLS enabled but NO policies exist' as problem,
  '❌ NEEDS ATTENTION' as status
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
WHERE t.schemaname = 'public'
AND c.relrowsecurity = true  -- RLS is enabled
AND NOT EXISTS (
  SELECT 1 FROM pg_policies p 
  WHERE p.schemaname = t.schemaname 
  AND p.tablename = t.tablename
)
AND t.tablename IN ('users', 'family_members', 'subscriptions', 'payments', 'commissions', 'leads', 'lead_activities', 'enrollment_modifications', 'plans', 'sessions')
ORDER BY t.tablename;

-- 3. Count policies per table
SELECT 
  'Policy Count' as check_type,
  schemaname||'.'||tablename as table_name,
  COUNT(*) as policy_count,
  CASE 
    WHEN COUNT(*) = 0 THEN '❌ NO POLICIES'
    WHEN COUNT(*) < 2 THEN '⚠️ FEW POLICIES' 
    ELSE '✅ HAS POLICIES'
  END as status
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('users', 'family_members', 'subscriptions', 'payments', 'commissions', 'leads', 'lead_activities', 'enrollment_modifications', 'plans', 'sessions')
GROUP BY schemaname, tablename
ORDER BY tablename;

-- 4. List all existing policies by table
SELECT 
  'Current Policies' as info_type,
  schemaname||'.'||tablename as table_name,
  policyname as policy_name,
  cmd as policy_type,
  CASE 
    WHEN cmd = 'ALL' THEN '🔓 Full Access'
    WHEN cmd = 'SELECT' THEN '👀 Read Only'
    WHEN cmd = 'INSERT' THEN '➕ Insert Only'
    WHEN cmd = 'UPDATE' THEN '✏️ Update Only'
    WHEN cmd = 'DELETE' THEN '🗑️ Delete Only'
  END as access_type
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('users', 'family_members', 'subscriptions', 'payments', 'commissions', 'leads', 'lead_activities', 'enrollment_modifications', 'plans', 'sessions')
ORDER BY tablename, cmd, policyname;

-- 5. Check for performance issues (auth RLS initialization plan)
SELECT 
  'Performance Check' as check_type,
  schemaname||'.'||tablename as table_name,
  policyname,
  CASE 
    WHEN qual LIKE '%auth.uid()%' AND qual NOT LIKE '%EXISTS%' THEN '⚠️ POTENTIAL PERFORMANCE ISSUE'
    WHEN qual LIKE '%auth.role()%' AND qual NOT LIKE '%EXISTS%' THEN '⚠️ POTENTIAL PERFORMANCE ISSUE'
    ELSE '✅ POLICY OPTIMIZED'
  END as performance_status,
  LEFT(qual, 100) as policy_snippet
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('lead_activities', 'enrollment_modifications')
ORDER BY tablename, policyname;

-- 6. Check for unindexed foreign keys that were flagged
SELECT 
  'Foreign Key Index Check' as check_type,
  t.table_name,
  kcu.column_name as foreign_key_column,
  CASE 
    WHEN i.indexname IS NOT NULL THEN '✅ INDEXED'
    ELSE '❌ NOT INDEXED'
  END as index_status,
  i.indexname
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name
LEFT JOIN pg_indexes i 
  ON i.tablename = kcu.table_name 
  AND i.indexdef LIKE '%'||kcu.column_name||'%'
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_schema = 'public'
AND kcu.table_name IN ('commissions', 'lead_activities', 'payments', 'subscriptions', 'enrollment_modifications')
ORDER BY kcu.table_name, kcu.column_name;

-- 7. Summary of issues resolved/remaining
WITH rls_status AS (
  SELECT 
    COUNT(*) as total_tables,
    COUNT(CASE WHEN c.relrowsecurity THEN 1 END) as rls_enabled_tables
  FROM pg_tables t
  JOIN pg_class c ON c.relname = t.tablename
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
  WHERE t.schemaname = 'public'
  AND t.tablename IN ('users', 'family_members', 'subscriptions', 'payments', 'commissions', 'leads', 'lead_activities', 'enrollment_modifications', 'plans', 'sessions')
),
policy_status AS (
  SELECT 
    COUNT(DISTINCT tablename) as tables_with_policies
  FROM pg_policies
  WHERE schemaname = 'public'
  AND tablename IN ('users', 'family_members', 'subscriptions', 'payments', 'commissions', 'leads', 'lead_activities', 'enrollment_modifications', 'plans', 'sessions')
),
tables_without_policies AS (
  SELECT COUNT(*) as problem_tables
  FROM pg_tables t
  JOIN pg_class c ON c.relname = t.tablename
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
  WHERE t.schemaname = 'public'
  AND c.relrowsecurity = true  
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p 
    WHERE p.schemaname = t.schemaname 
    AND p.tablename = t.tablename
  )
  AND t.tablename IN ('users', 'family_members', 'subscriptions', 'payments', 'commissions', 'leads', 'lead_activities', 'enrollment_modifications', 'plans', 'sessions')
)
SELECT 
  'FINAL SUMMARY' as report_type,
  r.total_tables as total_critical_tables,
  r.rls_enabled_tables as rls_enabled_count,
  p.tables_with_policies as tables_with_policies,
  w.problem_tables as remaining_issues,
  CASE 
    WHEN w.problem_tables = 0 THEN '🎉 ALL RLS ISSUES RESOLVED!'
    ELSE '❌ ' || w.problem_tables || ' TABLES STILL NEED POLICIES'
  END as overall_status
FROM rls_status r, policy_status p, tables_without_policies w;

-- 8. If any issues remain, show specific actions needed
SELECT 
  'ACTION REQUIRED' as alert_type,
  'Table: ' || t.schemaname||'.'||t.tablename as table_name,
  'Create RLS policies for this table' as required_action,
  'Run fix_missing_rls_policies.sql script' as solution
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
WHERE t.schemaname = 'public'
AND c.relrowsecurity = true  
AND NOT EXISTS (
  SELECT 1 FROM pg_policies p 
  WHERE p.schemaname = t.schemaname 
  AND p.tablename = t.tablename
)
AND t.tablename IN ('users', 'family_members', 'subscriptions', 'payments', 'commissions', 'leads', 'lead_activities', 'enrollment_modifications', 'plans', 'sessions')
ORDER BY t.tablename;
