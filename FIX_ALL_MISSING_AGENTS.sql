-- =====================================================
-- FIX ALL MISSING AGENTS - Complete Solution
-- =====================================================
-- This script:
-- 1. Gets the Supabase Auth IDs for the agents
-- 2. Adds them to the users table with correct IDs
-- 3. Ensures they can login successfully
-- =====================================================

-- STEP 1: Find the Supabase Auth IDs
-- Run this first to get the actual Auth IDs, then use them below
-- Go to Supabase Dashboard > Authentication > Users
-- Search for each email and copy their ID

-- STEP 2: Add users with their actual Supabase Auth IDs
-- Replace 'PASTE_AUTH_ID_HERE' with the actual IDs from Step 1

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
) VALUES (
  'PASTE_ANA_AUTH_ID_HERE'::uuid,  -- Get this from Supabase Auth Users
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
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  phone = EXCLUDED.phone,
  role = EXCLUDED.role,
  agent_number = EXCLUDED.agent_number,
  is_active = EXCLUDED.is_active,
  approval_status = EXCLUDED.approval_status;

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
) VALUES (
  'PASTE_SEAN_AUTH_ID_HERE'::uuid,  -- Get this from Supabase Auth Users
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
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  phone = EXCLUDED.phone,
  role = EXCLUDED.role,
  agent_number = EXCLUDED.agent_number,
  is_active = EXCLUDED.is_active,
  approval_status = EXCLUDED.approval_status;

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
) VALUES (
  'PASTE_RICHARD_AUTH_ID_HERE'::uuid,  -- Get this from Supabase Auth Users
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
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  phone = EXCLUDED.phone,
  role = EXCLUDED.role,
  agent_number = EXCLUDED.agent_number,
  is_active = EXCLUDED.is_active,
  approval_status = EXCLUDED.approval_status;

-- Verify all agents are in the database
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
WHERE role = 'agent'
ORDER BY agent_number;

-- =====================================================
-- INSTRUCTIONS:
-- =====================================================
-- 1. Go to Supabase Dashboard > Authentication > Users
-- 2. Search for each agent's email
-- 3. Copy their UUID (the long ID like: a1b2c3d4-e5f6-7890-abcd-ef1234567890)
-- 4. Replace PASTE_XXX_AUTH_ID_HERE with the actual UUID
-- 5. Run this script
-- =====================================================
