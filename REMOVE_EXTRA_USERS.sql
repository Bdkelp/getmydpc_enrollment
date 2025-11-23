-- Remove test/duplicate user accounts
-- Keep dual-role admins who also have agent numbers (they can enroll and earn commissions)

-- 1. Deactivate test admin account
UPDATE users 
SET is_active = false, approval_status = 'rejected', updated_at = NOW()
WHERE email = 'admin@dpcplatform.com';

-- 2. Deactivate Mike Keener duplicate account (keep michael@mypremierplans.com instead)
UPDATE users 
SET is_active = false, approval_status = 'rejected', updated_at = NOW()
WHERE email = 'mdkeener@gmail.com';

-- 3. Verify the cleanup - should show 8 active users
SELECT 
  email,
  first_name,
  last_name,
  role,
  agent_number,
  is_active,
  approval_status
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

-- Expected result: 8 users
-- 1 super_admin: Michael Admin (MPP0009)
-- 3 admins: Travis (MPP0008), Richard Salinas (MPP0007), Joaquin (MPP0005)
-- 4 agents: Steven (MPP0006), Ana (MPP0006 - DUPLICATE), Sean (MPP0007 - DUPLICATE), Richard P. (MPP0011)

-- NOTE: Duplicate agent numbers need manual reassignment:
-- Ana Vasquez and Steven Villarreal both have MPP0006
-- Sean Casados has MPP0007 (conflicts with Richard Salinas)
-- Suggest assigning Ana a new number like MPP0010, Sean MPP0012

