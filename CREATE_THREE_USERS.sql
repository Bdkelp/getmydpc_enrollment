-- ============================================================================
-- CREATE THREE NEW AGENT USERS
-- Run this entire script in Supabase SQL Editor
-- ============================================================================
-- Users to create:
--   1. Ana Vasquez - addsumbalance@gmail.com - 956.221.2464
--   2. Sean Casados - sean@sciahealthins.com - 720.584.6097
--   3. Richard Pennington - penningtonfinancialservices@gmail.com - 832.997.9323
-- 
-- Temporary Password: Welcome123!
-- ============================================================================

DO $$
DECLARE
  ana_id uuid;
  sean_id uuid;
  richard_id uuid;
  encrypted_password text;
  temp_password text := 'Welcome123!';
BEGIN
  -- Generate UUIDs
  ana_id := gen_random_uuid();
  sean_id := gen_random_uuid();
  richard_id := gen_random_uuid();
  
  -- Encrypt password
  encrypted_password := crypt(temp_password, gen_salt('bf'));
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Creating three new users...';
  RAISE NOTICE 'Temporary Password: %', temp_password;
  RAISE NOTICE '========================================';
  
  -- ============================================================================
  -- USER 1: Ana Vasquez
  -- ============================================================================
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'addsumbalance@gmail.com') THEN
    -- Create in auth.users
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      role,
      aud
    ) VALUES (
      ana_id,
      '00000000-0000-0000-0000-000000000000',
      'addsumbalance@gmail.com',
      encrypted_password,
      NOW(),
      NOW(),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('firstName', 'Ana', 'lastName', 'Vasquez', 'email', 'addsumbalance@gmail.com'),
      false,
      'authenticated',
      'authenticated'
    );
    
    -- Create in public.users
    INSERT INTO public.users (
      id,
      email,
      username,
      first_name,
      last_name,
      phone,
      role,
      email_verified,
      email_verified_at,
      is_active,
      approval_status,
      approved_at,
      created_at,
      updated_at
    ) VALUES (
      ana_id,
      'addsumbalance@gmail.com',
      'addsumbalance',
      'Ana',
      'Vasquez',
      '956.221.2464',
      'agent',
      true,
      NOW(),
      true,
      'approved',
      NOW(),
      NOW(),
      NOW()
    );
    
    RAISE NOTICE '✅ Created: Ana Vasquez (addsumbalance@gmail.com)';
  ELSE
    RAISE NOTICE '⚠️  Ana Vasquez already exists, skipping...';
  END IF;
  
  -- ============================================================================
  -- USER 2: Sean Casados
  -- ============================================================================
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'sean@sciahealthins.com') THEN
    -- Create in auth.users
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      role,
      aud
    ) VALUES (
      sean_id,
      '00000000-0000-0000-0000-000000000000',
      'sean@sciahealthins.com',
      encrypted_password,
      NOW(),
      NOW(),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('firstName', 'Sean', 'lastName', 'Casados', 'email', 'sean@sciahealthins.com'),
      false,
      'authenticated',
      'authenticated'
    );
    
    -- Create in public.users
    INSERT INTO public.users (
      id,
      email,
      username,
      first_name,
      last_name,
      phone,
      role,
      email_verified,
      email_verified_at,
      is_active,
      approval_status,
      approved_at,
      created_at,
      updated_at
    ) VALUES (
      sean_id,
      'sean@sciahealthins.com',
      'sean',
      'Sean',
      'Casados',
      '720.584.6097',
      'agent',
      true,
      NOW(),
      true,
      'approved',
      NOW(),
      NOW(),
      NOW()
    );
    
    RAISE NOTICE '✅ Created: Sean Casados (sean@sciahealthins.com)';
  ELSE
    RAISE NOTICE '⚠️  Sean Casados already exists, skipping...';
  END IF;
  
  -- ============================================================================
  -- USER 3: Richard Pennington
  -- ============================================================================
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'penningtonfinancialservices@gmail.com') THEN
    -- Create in auth.users
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      role,
      aud
    ) VALUES (
      richard_id,
      '00000000-0000-0000-0000-000000000000',
      'penningtonfinancialservices@gmail.com',
      encrypted_password,
      NOW(),
      NOW(),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('firstName', 'Richard', 'lastName', 'Pennington', 'email', 'penningtonfinancialservices@gmail.com'),
      false,
      'authenticated',
      'authenticated'
    );
    
    -- Create in public.users
    INSERT INTO public.users (
      id,
      email,
      username,
      first_name,
      last_name,
      phone,
      role,
      email_verified,
      email_verified_at,
      is_active,
      approval_status,
      approved_at,
      created_at,
      updated_at
    ) VALUES (
      richard_id,
      'penningtonfinancialservices@gmail.com',
      'penningtonfinancialservices',
      'Richard',
      'Pennington',
      '832.997.9323',
      'agent',
      true,
      NOW(),
      true,
      'approved',
      NOW(),
      NOW(),
      NOW()
    );
    
    RAISE NOTICE '✅ Created: Richard Pennington (penningtonfinancialservices@gmail.com)';
  ELSE
    RAISE NOTICE '⚠️  Richard Pennington already exists, skipping...';
  END IF;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SUCCESS! All users created.';
  RAISE NOTICE 'Temporary Password for all: %', temp_password;
  RAISE NOTICE '========================================';
  
END $$;

-- ============================================================================
-- VERIFICATION QUERY: Run this to see the created users
-- ============================================================================
SELECT 
  u.first_name || ' ' || u.last_name AS "Name",
  u.email AS "Email",
  u.phone AS "Phone",
  u.role AS "Role",
  CASE WHEN u.is_active THEN 'Active' ELSE 'Inactive' END AS "Status",
  u.approval_status AS "Approval",
  u.created_at AS "Created At"
FROM public.users u
WHERE u.email IN (
  'addsumbalance@gmail.com',
  'sean@sciahealthins.com',
  'penningtonfinancialservices@gmail.com'
)
ORDER BY u.created_at DESC;
