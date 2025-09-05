
-- Query to verify member data storage and role distribution
SELECT 
  role,
  COUNT(*) as count,
  ARRAY_AGG(DISTINCT email ORDER BY email) as sample_emails
FROM users 
GROUP BY role
ORDER BY role;

-- Detailed member information
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
WHERE role IN ('member', 'user')
ORDER BY created_at DESC
LIMIT 20;

-- Check for any orphaned subscriptions
SELECT 
  u.email,
  u.role,
  s.status as subscription_status,
  s.amount,
  s.created_at as subscription_date
FROM users u
LEFT JOIN subscriptions s ON u.id = s.user_id
WHERE u.role IN ('member', 'user')
ORDER BY s.created_at DESC;
