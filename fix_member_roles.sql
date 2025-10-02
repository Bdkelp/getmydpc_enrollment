
-- Fix Member Role Classification
-- Members are DPC enrollees (data records only)
-- Users who authenticate are agents/admins

-- Step 1: Identify current 'user' role records
SELECT 
  id,
  email,
  first_name,
  last_name,
  role,
  agent_number,
  is_active
FROM users 
WHERE role = 'user'
ORDER BY created_at DESC;

-- Step 2: Update 'user' role to 'member' for DPC enrollees
-- (Those without agent_number who are healthcare members)
UPDATE users 
SET role = 'member'
WHERE role = 'user'
  AND agent_number IS NULL
  AND id IN (
    SELECT DISTINCT user_id 
    FROM subscriptions
  );

-- Step 3: Verify the change
SELECT 
  role,
  COUNT(*) as count,
  COUNT(CASE WHEN is_active THEN 1 END) as active_count
FROM users 
GROUP BY role
ORDER BY role;

-- Step 4: Update any remaining 'user' roles that are healthcare members
UPDATE users 
SET role = 'member'
WHERE role = 'user';

-- Step 5: Final verification
SELECT 
  'Members (DPC Enrollees)' as category,
  COUNT(*) as total,
  COUNT(CASE WHEN is_active THEN 1 END) as active,
  COUNT(CASE WHEN approval_status = 'approved' THEN 1 END) as approved
FROM users 
WHERE role = 'member'

UNION ALL

SELECT 
  'Agents',
  COUNT(*),
  COUNT(CASE WHEN is_active THEN 1 END),
  COUNT(CASE WHEN approval_status = 'approved' THEN 1 END)
FROM users 
WHERE role = 'agent'

UNION ALL

SELECT 
  'Admins',
  COUNT(*),
  COUNT(CASE WHEN is_active THEN 1 END),
  COUNT(CASE WHEN approval_status = 'approved' THEN 1 END)
FROM users 
WHERE role = 'admin';
