-- Check for missing users: Ana Vasquez and Sean Casados

SELECT 
  'Ana Vasquez - addsumbalance@gmail.com' AS user_check,
  CASE 
    WHEN EXISTS (SELECT 1 FROM users WHERE email = 'addsumbalance@gmail.com') 
    THEN '✅ EXISTS in users table'
    ELSE '❌ MISSING from users table'
  END AS database_status;

SELECT 
  'Sean Casados - sean@sciahealthins.com' AS user_check,
  CASE 
    WHEN EXISTS (SELECT 1 FROM users WHERE email = 'sean@sciahealthins.com') 
    THEN '✅ EXISTS in users table'
    ELSE '❌ MISSING from users table'
  END AS database_status;

-- Show details if they exist
SELECT 
  id,
  email,
  first_name,
  last_name,
  role,
  agent_number,
  is_active,
  approval_status,
  created_at
FROM users
WHERE email IN ('addsumbalance@gmail.com', 'sean@sciahealthins.com')
ORDER BY email;

-- Check all agent users
SELECT 
  id,
  email,
  first_name,
  last_name,
  agent_number,
  is_active,
  approval_status
FROM users
WHERE role = 'agent'
ORDER BY agent_number;
