-- ============================================================================
-- INVESTIGATION: Find Richard in ALL possible locations
-- ============================================================================

-- Check 1: Is Richard in auth.users?
SELECT 
  'auth.users' as location,
  id,
  email,
  email_confirmed_at,
  created_at,
  encrypted_password IS NOT NULL as has_password
FROM auth.users 
WHERE email = 'penningtonfinancialservices@gmail.com';

-- Check 2: Is Richard in public.users?
SELECT 
  'public.users' as location,
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

-- Check 3: Check for ANY partial/incomplete records
SELECT 
  'public.users (search by partial name)' as location,
  id,
  email,
  first_name,
  last_name,
  role,
  agent_number,
  is_active,
  created_at
FROM public.users 
WHERE 
  email ILIKE '%pennington%' OR
  first_name ILIKE '%richard%' OR
  last_name ILIKE '%pennington%';

-- Check 4: Check if there's a duplicate with different casing
SELECT 
  'Case-insensitive email search' as location,
  id,
  email,
  first_name,
  last_name,
  agent_number
FROM public.users 
WHERE LOWER(email) = LOWER('penningtonfinancialservices@gmail.com');

-- ============================================================================
-- ANALYSIS:
-- If "email already exists" error occurred, one of these scenarios happened:
-- 1. Richard IS in public.users (our previous query missed him somehow)
-- 2. Richard was created with different casing/formatting
-- 3. There's a partial/corrupted record
-- 4. The error is coming from auth.users (trying to create duplicate in auth)
-- ============================================================================
