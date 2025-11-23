-- ============================================================================
-- FINAL FIX: Create Richard Pennington in public.users
-- ============================================================================
-- Confirmed: Richard Pennington does NOT exist in public.users
-- He exists in auth.users but is missing from public.users
-- This script will create his record properly
-- ============================================================================

DO $$
DECLARE
  richard_auth_id uuid;
BEGIN
  -- Step 1: Get Richard's UUID from auth.users
  SELECT id INTO richard_auth_id
  FROM auth.users
  WHERE email = 'penningtonfinancialservices@gmail.com';
  
  IF richard_auth_id IS NULL THEN
    RAISE EXCEPTION 'ERROR: Richard Pennington not found in auth.users! Need to run CREATE_THREE_USERS.sql first.';
  END IF;
  
  RAISE NOTICE '✓ Found Richard in auth.users with ID: %', richard_auth_id;
  
  -- Step 2: Double-check he doesn't exist in public.users
  IF EXISTS (SELECT 1 FROM public.users WHERE email = 'penningtonfinancialservices@gmail.com') THEN
    RAISE NOTICE '⚠️  Richard already exists in public.users!';
    RAISE NOTICE 'Current record:';
    RAISE NOTICE '%', (SELECT row_to_json(u) FROM public.users u WHERE email = 'penningtonfinancialservices@gmail.com');
  ELSE
    -- Step 3: Create Richard in public.users
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
      richard_auth_id,  -- MUST match his ID in auth.users
      'penningtonfinancialservices@gmail.com',
      'Richard',
      'Pennington',
      '832.997.9323',
      'agent',
      'MPP0011',  -- Next in sequence after Sean's MPP0010
      true,
      NOW(),
      true,
      'approved',
      NOW(),
      NOW(),
      NOW()
    );
    
    RAISE NOTICE '✅ SUCCESS! Created Richard Pennington in public.users';
  END IF;
  
END $$;

-- Verification: Show Richard's record in both tables
SELECT 
  'auth.users' as table_name,
  id::text as id,
  email,
  email_confirmed_at as confirmed,
  created_at
FROM auth.users
WHERE email = 'penningtonfinancialservices@gmail.com'

UNION ALL

SELECT 
  'public.users' as table_name,
  id::text,
  email,
  email_verified_at,
  created_at
FROM public.users
WHERE email = 'penningtonfinancialservices@gmail.com';

-- Final check: List all agents to confirm Richard is now included
SELECT 
  email,
  first_name || ' ' || last_name as full_name,
  role,
  agent_number,
  is_active
FROM public.users
WHERE role IN ('agent', 'admin', 'super_admin')
ORDER BY agent_number;

-- ============================================================================
-- INSTRUCTIONS:
-- 1. Run this script in Supabase SQL Editor
-- 2. Verify Richard appears in both tables with matching IDs
-- 3. Have Richard log in with: penningtonfinancialservices@gmail.com / Welcome123!
-- 4. He should now successfully access the agent dashboard
-- ============================================================================
