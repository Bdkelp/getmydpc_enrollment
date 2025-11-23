-- Fix orphaned payments for John Test enrollment
-- Bug: Payment page used agent's user.id for BOTH member and agent tracking
-- Correct behavior: member_id = John Test's ID, user_id = Michael's ID (for commission)

-- Step 1: Verify John Test member ID and enrolling agent
SELECT 
  m.id as member_id,
  m.email,
  m.first_name,
  m.last_name,
  m.customer_number,
  m.enrolled_by_agent_id,
  m.created_at,
  u.email as agent_email,
  u.agent_number
FROM members m
LEFT JOIN users u ON m.enrolled_by_agent_id::uuid = u.id::uuid
WHERE m.customer_number = 'GSMP000001';

-- Step 2: Verify orphaned payments (currently have user_id but no member_id)
SELECT 
  id,
  user_id,
  member_id,
  amount,
  status,
  transaction_id,
  created_at
FROM payments
WHERE user_id = '8bda1072-ab65-4733-a84b-2a3609a69450' -- Michael's UUID
  AND created_at >= '2025-11-23T19:42:00Z'
  AND created_at <= '2025-11-23T19:43:30Z'
ORDER BY created_at ASC;

-- Step 3: Fix the orphaned payments
-- Set member_id = John Test's member ID (for billing/plan management)
-- Keep user_id = Michael's UUID (for commission tracking)
UPDATE payments 
SET member_id = (
  SELECT id
  FROM members 
  WHERE customer_number = 'GSMP000001'
  LIMIT 1
)
WHERE user_id = '8bda1072-ab65-4733-a84b-2a3609a69450'
  AND created_at >= '2025-11-23T19:42:00Z'
  AND created_at <= '2025-11-23T19:43:30Z'
  AND member_id IS NULL; -- Only update if member_id not already set

-- Step 4: Verify the fix worked - both member_id and user_id should be set
SELECT 
  p.id,
  p.user_id,
  p.member_id,
  p.amount,
  p.status,
  p.transaction_id,
  p.created_at,
  m.first_name as member_first_name,
  m.last_name as member_last_name,
  m.email as member_email,
  m.customer_number,
  u.email as agent_email,
  u.agent_number
FROM payments p
LEFT JOIN members m ON p.member_id = m.id
LEFT JOIN users u ON p.user_id::uuid = u.id::uuid
WHERE m.customer_number = 'GSMP000001'
ORDER BY p.created_at ASC;

-- Step 5: Verify enrollment now appears in agent dashboard
-- This query mimics what getAgentEnrollments() does
SELECT 
  m.id,
  m.email,
  m.first_name,
  m.last_name,
  m.customer_number,
  m.coverage_type,
  m.created_at,
  m.enrolled_by_agent_id,
  u.agent_number as agent_number
FROM members m
LEFT JOIN users u ON m.enrolled_by_agent_id::uuid = u.id::uuid
WHERE m.enrolled_by_agent_id::uuid = '8bda1072-ab65-4733-a84b-2a3609a69450'::uuid
ORDER BY m.created_at DESC;
