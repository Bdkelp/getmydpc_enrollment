-- Check Richard Salinas's user status
-- Run this in Supabase SQL Editor

SELECT 
  id,
  email,
  first_name,
  last_name,
  role,
  LENGTH(role) as role_length,
  agent_number,
  is_active,
  approval_status,
  email_verified,
  created_at,
  updated_at
FROM users
WHERE email ILIKE '%salinas%' OR (first_name ILIKE '%richard%' AND last_name ILIKE '%salinas%');

-- FIX: Richard Salinas has trailing space in role "admin " instead of "admin"
-- This fixes the role and trims any whitespace
UPDATE users 
SET role = TRIM(role), updated_at = NOW()
WHERE email = 'richard@cyariskmanagement.com';

-- Verify the fix
SELECT id, email, first_name, last_name, role, LENGTH(role) as role_length
FROM users 
WHERE email = 'richard@cyariskmanagement.com';
