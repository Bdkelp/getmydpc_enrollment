-- ============================================================================
-- CREATE TEST USERS SCRIPT
-- Run this in Supabase SQL Editor to create 8 test users (4 admins + 4 agents)
-- ============================================================================
-- 
-- This script creates users in BOTH:
-- 1. auth.users (Supabase authentication)
-- 2. public.users (Application user data)
--
-- IMPORTANT: Update the UUIDs in the INSERT statements if users already exist
-- in auth.users. You can check with: SELECT id, email FROM auth.users;
-- ============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- SECTION 1: Create users in Supabase Auth (auth.users)
-- ============================================================================
-- Note: These INSERT statements will fail if users already exist
-- Run: DELETE FROM auth.users WHERE email IN (...emails...) if you need to recreate

DO $$
DECLARE
  user_id uuid;
  user_email text;
  user_password text;
  user_first_name text;
  user_last_name text;
  encrypted_password text;
BEGIN
  -- Array of user data: email, password, first_name, last_name, role
  -- We'll process these in order
  
  -- ADMIN 1: Michael A.
  user_email := 'michael@mypremierplans.com';
  user_password := 'Admin123!';
  user_first_name := 'Michael';
  user_last_name := 'Anderson';
  
  -- Generate UUID for this user
  user_id := gen_random_uuid();
  
  -- Encrypt password (Supabase uses bcrypt)
  encrypted_password := crypt(user_password, gen_salt('bf'));
  
  -- Insert into auth.users if not exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = user_email) THEN
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
      user_id,
      '00000000-0000-0000-0000-000000000000',
      user_email,
      encrypted_password,
      NOW(),
      NOW(),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('firstName', user_first_name, 'lastName', user_last_name, 'email', user_email),
      false,
      'authenticated',
      'authenticated'
    );
    
    -- Insert into public.users
    INSERT INTO public.users (
      id,
      email,
      first_name,
      last_name,
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
      user_id,
      user_email,
      user_first_name,
      user_last_name,
      'admin',
      'MPP0001',
      true,
      NOW(),
      true,
      'approved',
      NOW(),
      NOW(),
      NOW()
    );
    
    RAISE NOTICE 'Created admin user: %', user_email;
  ELSE
    RAISE NOTICE 'User already exists: %', user_email;
  END IF;

  -- ADMIN 2: Travis M.
  user_email := 'travis@mypremierplans.com';
  user_password := 'Admin123!';
  user_first_name := 'Travis';
  user_last_name := 'Matheny';
  user_id := gen_random_uuid();
  encrypted_password := crypt(user_password, gen_salt('bf'));
  
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = user_email) THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud
    ) VALUES (
      user_id, '00000000-0000-0000-0000-000000000000', user_email, encrypted_password, NOW(),
      NOW(), NOW(), '{"provider":"email","providers":["email"]}',
      jsonb_build_object('firstName', user_first_name, 'lastName', user_last_name, 'email', user_email),
      false, 'authenticated', 'authenticated'
    );
    
    INSERT INTO public.users (
      id, email, first_name, last_name, role, agent_number,
      email_verified, email_verified_at, is_active, approval_status,
      approved_at, created_at, updated_at
    ) VALUES (
      user_id, user_email, user_first_name, user_last_name, 'admin', 'MPP0002',
      true, NOW(), true, 'approved', NOW(), NOW(), NOW()
    );
    
    RAISE NOTICE 'Created admin user: %', user_email;
  ELSE
    RAISE NOTICE 'User already exists: %', user_email;
  END IF;

  -- ADMIN 3: Richard H.
  user_email := 'richard@mypremierplans.com';
  user_password := 'Admin123!';
  user_first_name := 'Richard';
  user_last_name := 'Harrison';
  user_id := gen_random_uuid();
  encrypted_password := crypt(user_password, gen_salt('bf'));
  
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = user_email) THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud
    ) VALUES (
      user_id, '00000000-0000-0000-0000-000000000000', user_email, encrypted_password, NOW(),
      NOW(), NOW(), '{"provider":"email","providers":["email"]}',
      jsonb_build_object('firstName', user_first_name, 'lastName', user_last_name, 'email', user_email),
      false, 'authenticated', 'authenticated'
    );
    
    INSERT INTO public.users (
      id, email, first_name, last_name, role, agent_number,
      email_verified, email_verified_at, is_active, approval_status,
      approved_at, created_at, updated_at
    ) VALUES (
      user_id, user_email, user_first_name, user_last_name, 'admin', 'MPP0003',
      true, NOW(), true, 'approved', NOW(), NOW(), NOW()
    );
    
    RAISE NOTICE 'Created admin user: %', user_email;
  ELSE
    RAISE NOTICE 'User already exists: %', user_email;
  END IF;

  -- ADMIN 4: Joaquin R.
  user_email := 'joaquin@mypremierplans.com';
  user_password := 'Admin123!';
  user_first_name := 'Joaquin';
  user_last_name := 'Rodriguez';
  user_id := gen_random_uuid();
  encrypted_password := crypt(user_password, gen_salt('bf'));
  
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = user_email) THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud
    ) VALUES (
      user_id, '00000000-0000-0000-0000-000000000000', user_email, encrypted_password, NOW(),
      NOW(), NOW(), '{"provider":"email","providers":["email"]}',
      jsonb_build_object('firstName', user_first_name, 'lastName', user_last_name, 'email', user_email),
      false, 'authenticated', 'authenticated'
    );
    
    INSERT INTO public.users (
      id, email, first_name, last_name, role, agent_number,
      email_verified, email_verified_at, is_active, approval_status,
      approved_at, created_at, updated_at
    ) VALUES (
      user_id, user_email, user_first_name, user_last_name, 'admin', 'MPP0004',
      true, NOW(), true, 'approved', NOW(), NOW(), NOW()
    );
    
    RAISE NOTICE 'Created admin user: %', user_email;
  ELSE
    RAISE NOTICE 'User already exists: %', user_email;
  END IF;

  -- AGENT 1: Mark D. Keener
  user_email := 'mdkeener@gmail.com';
  user_password := 'Agent123!';
  user_first_name := 'Mark';
  user_last_name := 'Keener';
  user_id := gen_random_uuid();
  encrypted_password := crypt(user_password, gen_salt('bf'));
  
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = user_email) THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud
    ) VALUES (
      user_id, '00000000-0000-0000-0000-000000000000', user_email, encrypted_password, NOW(),
      NOW(), NOW(), '{"provider":"email","providers":["email"]}',
      jsonb_build_object('firstName', user_first_name, 'lastName', user_last_name, 'email', user_email),
      false, 'authenticated', 'authenticated'
    );
    
    INSERT INTO public.users (
      id, email, first_name, last_name, role, agent_number,
      email_verified, email_verified_at, is_active, approval_status,
      approved_at, created_at, updated_at
    ) VALUES (
      user_id, user_email, user_first_name, user_last_name, 'agent', 'MPP0005',
      true, NOW(), true, 'approved', NOW(), NOW(), NOW()
    );
    
    RAISE NOTICE 'Created agent user: %', user_email;
  ELSE
    RAISE NOTICE 'User already exists: %', user_email;
  END IF;

  -- AGENT 2: Trent M.
  user_email := 'tmatheny77@gmail.com';
  user_password := 'Agent123!';
  user_first_name := 'Trent';
  user_last_name := 'Matheny';
  user_id := gen_random_uuid();
  encrypted_password := crypt(user_password, gen_salt('bf'));
  
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = user_email) THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud
    ) VALUES (
      user_id, '00000000-0000-0000-0000-000000000000', user_email, encrypted_password, NOW(),
      NOW(), NOW(), '{"provider":"email","providers":["email"]}',
      jsonb_build_object('firstName', user_first_name, 'lastName', user_last_name, 'email', user_email),
      false, 'authenticated', 'authenticated'
    );
    
    INSERT INTO public.users (
      id, email, first_name, last_name, role, agent_number,
      email_verified, email_verified_at, is_active, approval_status,
      approved_at, created_at, updated_at
    ) VALUES (
      user_id, user_email, user_first_name, user_last_name, 'agent', 'MPP0006',
      true, NOW(), true, 'approved', NOW(), NOW(), NOW()
    );
    
    RAISE NOTICE 'Created agent user: %', user_email;
  ELSE
    RAISE NOTICE 'User already exists: %', user_email;
  END IF;

  -- AGENT 3: Steve V.
  user_email := 'svillarreal@cyariskmanagement.com';
  user_password := 'Agent123!';
  user_first_name := 'Steve';
  user_last_name := 'Villarreal';
  user_id := gen_random_uuid();
  encrypted_password := crypt(user_password, gen_salt('bf'));
  
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = user_email) THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud
    ) VALUES (
      user_id, '00000000-0000-0000-0000-000000000000', user_email, encrypted_password, NOW(),
      NOW(), NOW(), '{"provider":"email","providers":["email"]}',
      jsonb_build_object('firstName', user_first_name, 'lastName', user_last_name, 'email', user_email),
      false, 'authenticated', 'authenticated'
    );
    
    INSERT INTO public.users (
      id, email, first_name, last_name, role, agent_number,
      email_verified, email_verified_at, is_active, approval_status,
      approved_at, created_at, updated_at
    ) VALUES (
      user_id, user_email, user_first_name, user_last_name, 'agent', 'MPP0007',
      true, NOW(), true, 'approved', NOW(), NOW(), NOW()
    );
    
    RAISE NOTICE 'Created agent user: %', user_email;
  ELSE
    RAISE NOTICE 'User already exists: %', user_email;
  END IF;

  -- AGENT 4: Sarah J.
  user_email := 'sarah.johnson@mypremierplans.com';
  user_password := 'Agent123!';
  user_first_name := 'Sarah';
  user_last_name := 'Johnson';
  user_id := gen_random_uuid();
  encrypted_password := crypt(user_password, gen_salt('bf'));
  
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = user_email) THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud
    ) VALUES (
      user_id, '00000000-0000-0000-0000-000000000000', user_email, encrypted_password, NOW(),
      NOW(), NOW(), '{"provider":"email","providers":["email"]}',
      jsonb_build_object('firstName', user_first_name, 'lastName', user_last_name, 'email', user_email),
      false, 'authenticated', 'authenticated'
    );
    
    INSERT INTO public.users (
      id, email, first_name, last_name, role, agent_number,
      email_verified, email_verified_at, is_active, approval_status,
      approved_at, created_at, updated_at
    ) VALUES (
      user_id, user_email, user_first_name, user_last_name, 'agent', 'MPP0008',
      true, NOW(), true, 'approved', NOW(), NOW(), NOW()
    );
    
    RAISE NOTICE 'Created agent user: %', user_email;
  ELSE
    RAISE NOTICE 'User already exists: %', user_email;
  END IF;

END $$;

-- ============================================================================
-- SECTION 2: Verification Queries
-- ============================================================================
-- Run these to verify users were created successfully

-- Check auth.users
SELECT 
  id,
  email,
  email_confirmed_at,
  created_at,
  raw_user_meta_data->>'firstName' as first_name,
  raw_user_meta_data->>'lastName' as last_name
FROM auth.users
WHERE email IN (
  'michael@mypremierplans.com',
  'travis@mypremierplans.com',
  'richard@mypremierplans.com',
  'joaquin@mypremierplans.com',
  'mdkeener@gmail.com',
  'tmatheny77@gmail.com',
  'svillarreal@cyariskmanagement.com',
  'sarah.johnson@mypremierplans.com'
)
ORDER BY email;

-- Check public.users
SELECT 
  id,
  email,
  first_name,
  last_name,
  role,
  agent_number,
  is_active,
  approval_status,
  email_verified,
  created_at
FROM public.users
WHERE email IN (
  'michael@mypremierplans.com',
  'travis@mypremierplans.com',
  'richard@mypremierplans.com',
  'joaquin@mypremierplans.com',
  'mdkeener@gmail.com',
  'tmatheny77@gmail.com',
  'svillarreal@cyariskmanagement.com',
  'sarah.johnson@mypremierplans.com'
)
ORDER BY role DESC, agent_number;

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- This script creates:
-- - 4 Admin users (MPP0001-MPP0004)
-- - 4 Agent users (MPP0005-MPP0008)
--
-- All users have:
-- - Password: Admin123! or Agent123!
-- - Email verified: true
-- - Status: active
-- - Approval: approved
--
-- Test login at: https://enrollment.getmydpc.com/login
-- ============================================================================
