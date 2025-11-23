-- Diagnostic: Find John Test member record
-- If member exists, we can link the orphaned payments to the correct member

-- 1. Search for John Test member by name
SELECT 
  id,
  email,
  first_name,
  last_name,
  customer_number,
  enrolled_by_agent_id,
  plan_id,
  coverage_type,
  total_monthly_price,
  is_active,
  created_at
FROM members
WHERE (first_name ILIKE '%john%' AND last_name ILIKE '%test%')
   OR customer_number = 'GSMP000001'
ORDER BY created_at DESC;

-- 2. If member exists, check for orphaned payments
-- (payments with user_id = Michael's ID but should be linked to member)
SELECT 
  p.id as payment_id,
  p.user_id,
  p.amount,
  p.status,
  p.transaction_id,
  p.created_at,
  u.email as user_email,
  u.first_name as user_first_name,
  u.last_name as user_last_name,
  u.agent_number
FROM payments p
LEFT JOIN users u ON p.user_id = u.id::text
WHERE p.user_id = '8bda1072-ab65-4733-a84b-2a3609a69450' -- Michael's user ID
ORDER BY p.created_at DESC;

-- 3. Check if member record was created but never paid
-- (member exists but has no linked payments)
SELECT 
  m.id,
  m.email,
  m.first_name,
  m.last_name,
  m.customer_number,
  m.created_at,
  COUNT(p.id) as payment_count
FROM members m
LEFT JOIN payments p ON p.user_id = m.id::text
WHERE m.created_at >= '2025-11-23T00:00:00Z'
GROUP BY m.id, m.email, m.first_name, m.last_name, m.customer_number, m.created_at
ORDER BY m.created_at DESC;

-- 4. Manual fix: Update orphaned payments to link to correct member
-- (Run this ONLY if John Test member exists and payments are orphaned)
-- UPDATE payments 
-- SET user_id = (SELECT id FROM members WHERE first_name ILIKE '%john%' AND last_name ILIKE '%test%' LIMIT 1)::text
-- WHERE user_id = '8bda1072-ab65-4733-a84b-2a3609a69450'
--   AND created_at >= '2025-11-23T19:42:00Z';
