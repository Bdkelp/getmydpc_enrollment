-- Check for John Test enrollment (test enrollment by Michael agent MPP0009)
-- Looking for customer number GSMP000001

-- 1. Get Michael's user ID
SELECT id, email, first_name, last_name, agent_number, role
FROM users 
WHERE agent_number = 'MPP0009';

-- 2. Search for John Test member by name or customer number
SELECT 
  m.id,
  m.email,
  m.first_name,
  m.last_name,
  m.customer_number,
  m.enrolled_by_agent_id,
  m.coverage_type,
  m.plan_id,
  m.is_active,
  m.created_at,
  p.name as plan_name
FROM members m
LEFT JOIN plans p ON m.plan_id = p.id
WHERE m.customer_number = 'GSMP000001' 
   OR (m.first_name ILIKE '%john%' AND m.last_name ILIKE '%test%')
ORDER BY m.created_at DESC;

-- 3. Check for commissions for this enrollment
SELECT 
  ac.id,
  ac.agent_id,
  ac.member_id,
  ac.commission_amount,
  ac.coverage_type,
  ac.status,
  ac.payment_status,
  ac.created_at,
  m.first_name,
  m.last_name,
  m.email,
  m.customer_number
FROM agent_commissions ac
LEFT JOIN members m ON ac.member_id = m.id::text
WHERE m.customer_number = 'GSMP000001' 
   OR (m.first_name ILIKE '%john%' AND m.last_name ILIKE '%test%')
ORDER BY ac.created_at DESC;

-- 4. Alternative: Check all recent members (last 10)
SELECT 
  m.id,
  m.email,
  m.first_name,
  m.last_name,
  m.customer_number,
  m.enrolled_by_agent_id,
  m.coverage_type,
  m.created_at
FROM members m
ORDER BY m.created_at DESC
LIMIT 10;

-- 5. Check recent payments for John Test
SELECT 
  p.id,
  p.user_id,
  p.amount,
  p.status,
  p.payment_method,
  p.transaction_id,
  p.created_at
FROM payments p
ORDER BY p.created_at DESC
LIMIT 10;
