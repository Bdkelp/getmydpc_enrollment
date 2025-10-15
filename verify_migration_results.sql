-- ============================================================
-- VERIFY MIGRATION RESULTS
-- ============================================================
-- Check what data remains after fresh_start_migration.sql
-- ============================================================

-- Check users table structure
SELECT 
  column_name,
  data_type,
  character_maximum_length
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;

-- Count users by role
SELECT 
  role,
  COUNT(*) as count
FROM users
GROUP BY role
ORDER BY role;

-- Show all users (should only be agents and admins)
SELECT 
  id,
  email,
  role,
  first_name,
  last_name,
  created_at
FROM users
ORDER BY role, email;

-- Check members table exists and is empty
SELECT COUNT(*) as member_count FROM members;

-- Check members table structure
SELECT 
  column_name,
  data_type,
  character_maximum_length
FROM information_schema.columns
WHERE table_name = 'members'
ORDER BY ordinal_position;

-- Verify helper functions exist
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_name IN ('generate_customer_number', 'format_phone', 'format_date_mmddyyyy')
ORDER BY routine_name;

-- Check related tables have member_id column
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE column_name = 'member_id'
ORDER BY table_name;
