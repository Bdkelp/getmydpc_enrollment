-- ============================================================================
-- Diagnostic: Check if Richard Pennington exists in auth.users and public.users
-- ============================================================================

-- Check 1: Does Richard exist in Supabase auth.users table?
SELECT 
  'auth.users' as table_name,
  id,
  email,
  email_confirmed_at,
  created_at,
  raw_user_meta_data
FROM auth.users 
WHERE email = 'penningtonfinancialservices@gmail.com';

-- Check 2: Does Richard exist in public.users table?
SELECT 
  'public.users' as table_name,
  id,
  email,
  first_name,
  last_name,
  role,
  agent_number,
  is_active,
  approval_status,
  created_at
FROM public.users 
WHERE email = 'penningtonfinancialservices@gmail.com';

-- Check 3: List ALL users in auth.users for comparison
SELECT 
  'ALL auth.users' as context,
  id,
  email,
  created_at
FROM auth.users 
ORDER BY created_at DESC
LIMIT 20;

-- Check 4: List ALL users in public.users for comparison
SELECT 
  'ALL public.users' as context,
  id,
  email,
  first_name,
  last_name,
  role,
  agent_number
FROM public.users 
ORDER BY created_at DESC
LIMIT 20;

-- ============================================================================
-- EXPECTED RESULTS:
-- - Richard should appear in auth.users (created by CREATE_THREE_USERS.sql)
-- - Richard should appear in public.users (created by CREATE_THREE_USERS.sql)
-- 
-- If Richard is in auth.users but NOT in public.users:
--   -> The SQL script created him in auth but failed on public.users insert
--   -> Need to manually create the public.users record
--
-- If Richard is NOT in auth.users at all:
--   -> The CREATE_THREE_USERS.sql script was never run or failed
--   -> Need to run the script
-- ============================================================================
