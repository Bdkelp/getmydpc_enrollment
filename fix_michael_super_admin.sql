-- ============================================================
-- FIX: Update Michael to super_admin role
-- ============================================================
-- Michael Keener should be super_admin, not admin

-- Update Michael's role to super_admin
UPDATE users 
SET role = 'super_admin'
WHERE email = 'michael@mypremierplans.com';

-- Verify the change
SELECT 
  email,
  first_name,
  last_name,
  role,
  agent_number,
  is_active
FROM users
WHERE email = 'michael@mypremierplans.com';

-- Show all users by role
SELECT 
  role,
  COUNT(*) as count,
  string_agg(email, ', ') as emails
FROM users
GROUP BY role
ORDER BY 
  CASE role
    WHEN 'super_admin' THEN 1
    WHEN 'admin' THEN 2
    WHEN 'agent' THEN 3
    ELSE 4
  END;
