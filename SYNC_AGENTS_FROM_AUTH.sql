-- =====================================================
-- QUICK FIX: Add Missing Agents to Database
-- =====================================================
-- This script queries Supabase Auth to find user IDs
-- Then adds them to the users table
-- =====================================================

-- First, let's check which agents exist in Auth vs Database
-- Run this query in Supabase SQL Editor

SELECT 
  'Checking agents...' AS status;

-- Show all users from auth.users where email matches our agents
SELECT 
  id AS auth_id,
  email,
  email_confirmed_at IS NOT NULL AS email_confirmed,
  created_at
FROM auth.users
WHERE email IN (
  'addsumbalance@gmail.com',
  'sean@sciahealthins.com', 
  'penningtonfinancialservices@gmail.com'
)
ORDER BY email;

-- Now insert/update them in the users table using their Auth IDs
-- This uses INSERT ... ON CONFLICT to safely add or update

-- Get Auth IDs and insert into users table in one operation
INSERT INTO users (
  id,
  email,
  first_name,
  last_name,
  phone,
  role,
  agent_number,
  is_active,
  approval_status,
  email_verified,
  created_at,
  updated_at
)
SELECT 
  au.id,
  au.email,
  CASE au.email
    WHEN 'addsumbalance@gmail.com' THEN 'Ana'
    WHEN 'sean@sciahealthins.com' THEN 'Sean'
    WHEN 'penningtonfinancialservices@gmail.com' THEN 'Richard'
  END AS first_name,
  CASE au.email
    WHEN 'addsumbalance@gmail.com' THEN 'Vasquez'
    WHEN 'sean@sciahealthins.com' THEN 'Casados'
    WHEN 'penningtonfinancialservices@gmail.com' THEN 'Pennington'
  END AS last_name,
  CASE au.email
    WHEN 'addsumbalance@gmail.com' THEN '956.221.2464'
    WHEN 'sean@sciahealthins.com' THEN '720.584.6097'
    WHEN 'penningtonfinancialservices@gmail.com' THEN '832.997.9323'
  END AS phone,
  'agent' AS role,
  CASE au.email
    WHEN 'addsumbalance@gmail.com' THEN 'MPP0006'
    WHEN 'sean@sciahealthins.com' THEN 'MPP0007'
    WHEN 'penningtonfinancialservices@gmail.com' THEN 'MPP0008'
  END AS agent_number,
  true AS is_active,
  'approved' AS approval_status,
  true AS email_verified,
  NOW() AS created_at,
  NOW() AS updated_at
FROM auth.users au
WHERE au.email IN (
  'addsumbalance@gmail.com',
  'sean@sciahealthins.com',
  'penningtonfinancialservices@gmail.com'
)
ON CONFLICT (id) 
DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  phone = EXCLUDED.phone,
  role = EXCLUDED.role,
  agent_number = EXCLUDED.agent_number,
  is_active = EXCLUDED.is_active,
  approval_status = EXCLUDED.approval_status,
  email_verified = EXCLUDED.email_verified,
  updated_at = NOW();

-- Verify the agents were added
SELECT 
  u.id,
  u.email,
  u.first_name,
  u.last_name,
  u.agent_number,
  u.role,
  u.is_active,
  u.approval_status,
  u.email_verified
FROM users u
WHERE u.email IN (
  'addsumbalance@gmail.com',
  'sean@sciahealthins.com',
  'penningtonfinancialservices@gmail.com'
)
ORDER BY u.agent_number;

-- Show all agents
SELECT 
  email,
  first_name,
  last_name,
  agent_number,
  is_active,
  approval_status
FROM users
WHERE role = 'agent'
ORDER BY agent_number;
