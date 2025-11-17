-- Check Michael's role in BOTH Supabase auth.users AND public.users tables

-- 1. Check Supabase auth.users metadata
SELECT 
  id,
  email,
  raw_user_meta_data->>'role' as metadata_role,
  raw_user_meta_data->>'firstName' as first_name,
  raw_user_meta_data->>'lastName' as last_name
FROM auth.users
WHERE email = 'michael@mypremierplans.com';

-- 2. Check public.users table
SELECT 
  id,
  email,
  first_name,
  last_name,
  role,
  is_active,
  approval_status
FROM users
WHERE email = 'michael@mypremierplans.com';
