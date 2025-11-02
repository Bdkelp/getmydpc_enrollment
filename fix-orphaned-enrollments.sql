-- Fix orphaned enrollments and commissions
-- These enrollments are pointing to agent IDs that don't exist anymore

-- STEP 1: Check orphaned enrollments (run this first to verify)
SELECT 
  m.id,
  m.email,
  m.enrolled_by_agent_id as old_agent_id,
  'ORPHANED - Agent not found' as status
FROM members m
LEFT JOIN users u ON u.id = m.enrolled_by_agent_id
WHERE m.enrolled_by_agent_id IS NOT NULL 
  AND u.id IS NULL;

-- STEP 2: Reassign orphaned enrollments to bdkelp@gmail.com
-- Replace 'YOUR_AGENT_ID' with: f68adf72-0ec5-45d8-af5d-b7b1e6609d25
UPDATE members
SET enrolled_by_agent_id = 'f68adf72-0ec5-45d8-af5d-b7b1e6609d25'
WHERE enrolled_by_agent_id IN (
  '8bda1072-ab65-4733-a84b-2a3609a69450',
  'f1282fe7-1cd0-4971-ac5a-a5d54e5a464b'
);

-- STEP 3: Update orphaned commissions to match
UPDATE agent_commissions
SET agent_id = 'f68adf72-0ec5-45d8-af5d-b7b1e6609d25'
WHERE agent_id IN (
  '8bda1072-ab65-4733-a84b-2a3609a69450',
  'f1282fe7-1cd0-4971-ac5a-a5d54e5a464b'
);

-- STEP 4: Verify the fix
SELECT 
  u.email as agent_email,
  COUNT(DISTINCT m.id) as enrollment_count,
  COUNT(DISTINCT ac.id) as commission_count
FROM users u
LEFT JOIN members m ON m.enrolled_by_agent_id = u.id
LEFT JOIN agent_commissions ac ON ac.agent_id = u.id
WHERE u.role = 'agent'
GROUP BY u.id, u.email
ORDER BY enrollment_count DESC;
