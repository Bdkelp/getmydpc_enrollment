
-- Verify Performance Fixes
-- Run this to check that all optimizations have been applied

-- 1. Check RLS policies are optimized
SELECT 
  schemaname,
  tablename,
  policyname,
  qual,
  with_check
FROM pg_policies 
WHERE tablename IN ('lead_activities', 'enrollment_modifications')
ORDER BY tablename, policyname;

-- 2. Check foreign key indexes exist
SELECT 
  t.relname as table_name,
  i.relname as index_name,
  a.attname as column_name,
  con.conname as constraint_name
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
JOIN pg_constraint con ON con.conrelid = t.oid AND con.contype = 'f'
WHERE t.relname IN ('commissions', 'lead_activities', 'payments', 'subscriptions')
  AND i.relname LIKE 'idx_%'
ORDER BY t.relname, i.relname;

-- 3. Check index usage statistics (run after some application usage)
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_tup_read,
  idx_tup_fetch,
  idx_scan
FROM pg_stat_user_indexes 
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 4. Check table sizes and index sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 5. Show any remaining performance warnings (you'd need to run this in Supabase dashboard)
-- This is just a reminder to check the database linter again after applying fixes
SELECT 'Run database linter in Supabase dashboard to verify all warnings are resolved' as reminder;
