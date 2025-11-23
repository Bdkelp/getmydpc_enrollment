-- Verify ALL users in the system
-- Check for data quality issues (whitespace, invalid roles, inactive users, etc.)

-- 1. Check all active approved users (should appear in app)
SELECT 
  email,
  first_name,
  last_name,
  role,
  LENGTH(role) as role_length,
  agent_number,
  is_active,
  approval_status,
  email_verified,
  created_at
FROM users
WHERE is_active = true AND approval_status = 'approved'
ORDER BY 
  CASE role 
    WHEN 'super_admin' THEN 1
    WHEN 'admin' THEN 2
    WHEN 'agent' THEN 3
    ELSE 4
  END,
  last_name;

-- 2. Check for users with whitespace in roles (data quality issue)
SELECT 
  email,
  first_name,
  last_name,
  role,
  LENGTH(role) as role_length,
  TRIM(role) as trimmed_role,
  is_active,
  approval_status
FROM users
WHERE role != TRIM(role);

-- 3. Check for inactive or non-approved users (won't appear in app)
SELECT 
  email,
  first_name,
  last_name,
  role,
  is_active,
  approval_status,
  created_at
FROM users
WHERE is_active = false OR approval_status != 'approved'
ORDER BY created_at DESC;

-- 4. Check for duplicate emails
SELECT 
  email,
  COUNT(*) as count
FROM users
GROUP BY email
HAVING COUNT(*) > 1;

-- 5. Full user count by status
SELECT 
  is_active,
  approval_status,
  role,
  COUNT(*) as user_count
FROM users
GROUP BY is_active, approval_status, role
ORDER BY is_active DESC, approval_status, role;
