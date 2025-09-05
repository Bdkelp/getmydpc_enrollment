
-- Comprehensive member verification query
-- This will show current state of users, their roles, and enrollments

-- 1. Check overall user distribution by role
SELECT 
  role,
  COUNT(*) as count,
  ARRAY_AGG(DISTINCT email ORDER BY email) as sample_emails
FROM users 
GROUP BY role
ORDER BY role;

-- 2. Show all members (excluding agents/admins) with their details
SELECT 
  u.id,
  u.email,
  u.first_name,
  u.last_name,
  u.role,
  u.agent_number,
  u.is_active,
  u.approval_status,
  u.enrolled_by_agent_id,
  u.created_at,
  -- Get subscription info
  s.id as subscription_id,
  s.status as subscription_status,
  s.amount as subscription_amount,
  p.name as plan_name,
  -- Get enrolling agent info
  agent.email as enrolled_by_agent_email,
  agent.first_name as agent_first_name,
  agent.last_name as agent_last_name
FROM users u
LEFT JOIN subscriptions s ON u.id = s.user_id
LEFT JOIN plans p ON s.plan_id = p.id
LEFT JOIN users agent ON u.enrolled_by_agent_id = agent.id
WHERE u.role IN ('user', 'member')
ORDER BY u.created_at DESC;

-- 3. Check for any role conflicts or issues
SELECT 
  'Potential Issues' as check_type,
  COUNT(*) as count,
  'Users with agent_number but not agent role' as description
FROM users 
WHERE agent_number IS NOT NULL 
  AND role != 'agent'
UNION ALL
SELECT 
  'Potential Issues',
  COUNT(*),
  'Agents without agent_number'
FROM users 
WHERE role = 'agent' 
  AND agent_number IS NULL
UNION ALL
SELECT 
  'Data Integrity',
  COUNT(*),
  'Members with subscriptions'
FROM users u
JOIN subscriptions s ON u.id = s.user_id
WHERE u.role IN ('user', 'member')
UNION ALL
SELECT 
  'Data Integrity',
  COUNT(*),
  'Active subscriptions'
FROM subscriptions
WHERE status = 'active';

-- 4. Show family members associated with primary users
SELECT 
  fm.id as family_member_id,
  fm.first_name as family_first_name,
  fm.last_name as family_last_name,
  fm.relationship,
  fm.date_of_birth,
  u.email as primary_user_email,
  u.first_name as primary_first_name,
  u.last_name as primary_last_name,
  u.role as primary_user_role
FROM family_members fm
JOIN users u ON fm.primary_user_id = u.id
ORDER BY u.email, fm.first_name;

-- 5. Recent enrollment activity (last 30 days)
SELECT 
  COUNT(*) as recent_enrollments,
  MIN(created_at) as oldest_recent,
  MAX(created_at) as newest_recent
FROM users 
WHERE role IN ('user', 'member') 
  AND created_at >= NOW() - INTERVAL '30 days';

-- 6. Check payment activity
SELECT 
  p.id as payment_id,
  p.amount,
  p.status as payment_status,
  p.payment_method,
  p.created_at as payment_date,
  u.email as user_email,
  u.role as user_role
FROM payments p
JOIN users u ON p.user_id = u.id
WHERE u.role IN ('user', 'member')
ORDER BY p.created_at DESC
LIMIT 10;
