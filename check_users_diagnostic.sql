-- ============================================================
-- DIAGNOSTIC: Check all users in database
-- ============================================================
-- Run this in Supabase SQL Editor to see what's actually in the database

-- 1. Count total users
SELECT COUNT(*) as total_users FROM users;

-- 2. List ALL users with key fields
SELECT 
  id,
  email,
  first_name,
  last_name,
  role,
  agent_number,
  is_active,
  upline_agent_id,
  hierarchy_level,
  created_at
FROM users
ORDER BY role, created_at;

-- 3. Count by role
SELECT 
  role,
  COUNT(*) as count,
  string_agg(email, ', ') as emails
FROM users
GROUP BY role
ORDER BY role;

-- 4. Check for NULL roles or invalid roles
SELECT 
  id,
  email,
  first_name,
  last_name,
  role,
  CASE 
    WHEN role IS NULL THEN '❌ NULL role'
    WHEN role NOT IN ('super_admin', 'admin', 'agent') THEN '❌ Invalid role'
    ELSE '✅ Valid role'
  END as role_status
FROM users
ORDER BY role_status DESC, email;

-- 5. Check is_active status
SELECT 
  is_active,
  COUNT(*) as count,
  string_agg(email, ', ') as emails
FROM users
GROUP BY is_active;

-- 6. Check Supabase Auth users
SELECT 
  id,
  email,
  created_at,
  last_sign_in_at,
  confirmed_at
FROM auth.users
ORDER BY created_at;

-- 7. Compare auth.users with public.users
SELECT 
  au.email as auth_email,
  pu.email as public_email,
  pu.role,
  pu.is_active,
  CASE 
    WHEN pu.id IS NULL THEN '❌ Missing from public.users'
    WHEN pu.is_active = false THEN '⚠️ Inactive'
    ELSE '✅ Active'
  END as status
FROM auth.users au
LEFT JOIN users pu ON au.id::text = pu.id
ORDER BY au.created_at;
