-- ============================================================
-- FIX PRODUCTION: Update Michael to super_admin
-- ============================================================
-- Run this in your PRODUCTION Supabase SQL Editor
-- Project: sgtnzhgxlkcvtrzejobx.supabase.co

-- 1. Update Michael's role to super_admin
UPDATE users 
SET role = 'super_admin'
WHERE email = 'michael@mypremierplans.com';

-- 2. Verify the change
SELECT 
  email,
  role,
  is_active,
  agent_number
FROM users
WHERE email = 'michael@mypremierplans.com';

-- 3. Show all users by role (should now show 1 super_admin, 2 admin, 6 agent)
SELECT 
  role,
  COUNT(*) as count,
  string_agg(email, ', ' ORDER BY email) as emails
FROM users
GROUP BY role
ORDER BY 
  CASE role
    WHEN 'super_admin' THEN 1
    WHEN 'admin' THEN 2
    WHEN 'agent' THEN 3
    ELSE 4
  END;
