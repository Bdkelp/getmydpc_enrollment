-- ============================================================================
-- FIX: Manually Create Richard Pennington in public.users
-- ============================================================================
-- Richard exists in auth.users but is missing from public.users
-- This script creates his record in public.users to match his auth.users entry
-- ============================================================================

-- Step 1: Get Richard's UUID from auth.users
DO $$
DECLARE
  richard_auth_id uuid;
BEGIN
  -- Get Richard's ID from auth.users
  SELECT id INTO richard_auth_id
  FROM auth.users
  WHERE email = 'penningtonfinancialservices@gmail.com';
  
  IF richard_auth_id IS NULL THEN
    RAISE EXCEPTION 'Richard Pennington not found in auth.users! Run CREATE_THREE_USERS.sql first.';
  END IF;
  
  RAISE NOTICE 'Found Richard in auth.users with ID: %', richard_auth_id;
  
  -- Step 2: Check if he already exists in public.users (should not)
  IF EXISTS (SELECT 1 FROM public.users WHERE email = 'penningtonfinancialservices@gmail.com') THEN
    RAISE NOTICE '⚠️  Richard already exists in public.users, skipping...';
  ELSE
    -- Step 3: Insert Richard into public.users with matching ID from auth.users
    INSERT INTO public.users (
      id,
      email,
      first_name,
      last_name,
      phone,
      role,
      agent_number,
      email_verified,
      email_verified_at,
      is_active,
      approval_status,
      approved_at,
      created_at,
      updated_at
    ) VALUES (
      richard_auth_id,  -- Use the SAME UUID from auth.users
      'penningtonfinancialservices@gmail.com',
      'Richard',
      'Pennington',
      '832.997.9323',
      'agent',
      'MPP0011',  -- Following the sequence: Ana=MPP0009, Sean=MPP0010, Richard=MPP0011
      true,
      NOW(),
      true,
      'approved',
      NOW(),
      NOW(),
      NOW()
    );
    
    RAISE NOTICE '✅ Successfully created Richard Pennington in public.users';
  END IF;
  
END $$;

-- Step 4: Verify the creation
SELECT 
  'VERIFICATION' as status,
  id,
  email,
  first_name,
  last_name,
  role,
  agent_number,
  is_active,
  approval_status
FROM public.users
WHERE email = 'penningtonfinancialservices@gmail.com';

-- Step 5: Verify Richard can now be found in both tables
SELECT 
  'auth.users' as table_name,
  id,
  email,
  email_confirmed_at
FROM auth.users
WHERE email = 'penningtonfinancialservices@gmail.com'

UNION ALL

SELECT 
  'public.users' as table_name,
  id::text,
  email,
  email_verified_at::timestamptz
FROM public.users
WHERE email = 'penningtonfinancialservices@gmail.com';

-- ============================================================================
-- After running this script:
-- 1. Richard should appear in public.users with agent_number MPP0011
-- 2. His ID in public.users should match his ID in auth.users
-- 3. He should be able to log in successfully
-- ============================================================================
