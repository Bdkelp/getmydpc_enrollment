-- Fix all users with trailing/leading whitespace in role field
-- This is a common data quality issue that causes authentication/permission problems

-- First, check all users with whitespace issues
SELECT 
  id,
  email,
  first_name,
  last_name,
  role,
  LENGTH(role) as role_length,
  TRIM(role) as trimmed_role,
  LENGTH(TRIM(role)) as trimmed_length,
  is_active,
  approval_status
FROM users
WHERE role != TRIM(role);

-- Fix: Trim whitespace from all role fields
UPDATE users 
SET role = TRIM(role), updated_at = NOW()
WHERE role != TRIM(role);

-- Verify no whitespace issues remain
SELECT 
  COUNT(*) as users_with_whitespace_roles
FROM users
WHERE role != TRIM(role);

-- Expected result: 0

-- Show all current users with clean roles
SELECT 
  email,
  role,
  LENGTH(role) as role_length,
  is_active,
  approval_status
FROM users
WHERE is_active = true AND approval_status = 'approved'
ORDER BY role, last_name;
