-- ============================================================
-- VERIFY USERS TABLE CLEANUP
-- ============================================================
-- Run this in Supabase SQL Editor to verify the migration

-- 1. Check column count and list all columns
SELECT 
  COUNT(*) as total_columns,
  string_agg(column_name, ', ' ORDER BY ordinal_position) as column_list
FROM information_schema.columns 
WHERE table_name = 'users';

-- 2. Verify hierarchy columns exist
SELECT 
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name IN ('upline_agent_id', 'hierarchy_level', 'can_receive_overrides', 'override_commission_rate')
ORDER BY column_name;

-- 3. Verify removed columns are gone
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'stripe_customer_id') 
    THEN '❌ stripe_customer_id still exists' 
    ELSE '✅ stripe_customer_id removed' 
  END as stripe_check,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'employer_name') 
    THEN '❌ employer_name still exists' 
    ELSE '✅ employer_name removed' 
  END as employer_check,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'google_id') 
    THEN '❌ google_id still exists' 
    ELSE '✅ google_id removed' 
  END as google_check,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'password_hash') 
    THEN '❌ password_hash still exists' 
    ELSE '✅ password_hash removed' 
  END as password_check;

-- 4. Check indexes
SELECT 
  indexname,
  tablename,
  indexdef
FROM pg_indexes 
WHERE tablename = 'users' 
  AND indexname IN ('idx_users_upline', 'idx_users_hierarchy_level', 'idx_users_agent_number')
ORDER BY indexname;

-- 5. Check foreign key constraint
SELECT 
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name = 'users'
  AND tc.constraint_name = 'fk_users_upline_agent';

-- 6. Verify backup table exists
SELECT 
  COUNT(*) as backup_row_count
FROM users_backup_20251117;

-- 7. Compare row counts
SELECT 
  (SELECT COUNT(*) FROM users) as current_users_count,
  (SELECT COUNT(*) FROM users_backup_20251117) as backup_count,
  CASE 
    WHEN (SELECT COUNT(*) FROM users) = (SELECT COUNT(*) FROM users_backup_20251117)
    THEN '✅ Row counts match'
    ELSE '❌ Row counts differ'
  END as validation;
