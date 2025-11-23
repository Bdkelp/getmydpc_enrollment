-- EMERGENCY FIX: Add missing agents to database
-- This matches their Supabase Auth accounts so they can login

-- Step 1: Get the Supabase Auth user IDs
-- You'll need to get these from Supabase Auth dashboard or run this query:
-- SELECT id, email FROM auth.users WHERE email IN ('addsumbalance@gmail.com', 'sean@sciahealthins.com', 'penningtonfinancialservices@gmail.com');

-- Step 2: Insert users with their actual Supabase Auth IDs
-- IMPORTANT: Replace 'REPLACE_WITH_AUTH_ID' with actual UUIDs from auth.users table

-- Ana Vasquez
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
  'addsumbalance@gmail.com',
  'Ana',
  'Vasquez',
  '956.221.2464',
  'agent',
  'MPP0006',
  true,
  'approved',
  true,
  NOW(),
  NOW()
FROM auth.users au
WHERE au.email = 'addsumbalance@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'addsumbalance@gmail.com');

-- Sean Casados  
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
  'sean@sciahealthins.com',
  'Sean',
  'Casados',
  '720.584.6097',
  'agent',
  'MPP0007',
  true,
  'approved',
  true,
  NOW(),
  NOW()
FROM auth.users au
WHERE au.email = 'sean@sciahealthins.com'
  AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'sean@sciahealthins.com');

-- Richard Pennington
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
  'penningtonfinancialservices@gmail.com',
  'Richard',
  'Pennington',
  '832.997.9323',
  'agent',
  'MPP0008',
  true,
  'approved',
  true,
  NOW(),
  NOW()
FROM auth.users au
WHERE au.email = 'penningtonfinancialservices@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'penningtonfinancialservices@gmail.com');

-- Verify they were added
SELECT 
  'Verification Results' as status,
  COUNT(*) as users_added
FROM users
WHERE email IN ('addsumbalance@gmail.com', 'sean@sciahealthins.com', 'penningtonfinancialservices@gmail.com');

-- Show the added users
SELECT 
  id,
  email,
  first_name,
  last_name,
  agent_number,
  role,
  is_active,
  approval_status
FROM users
WHERE email IN ('addsumbalance@gmail.com', 'sean@sciahealthins.com', 'penningtonfinancialservices@gmail.com')
ORDER BY email;
