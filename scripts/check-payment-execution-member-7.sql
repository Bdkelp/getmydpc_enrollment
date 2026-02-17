-- Check if EPX payment actually executed for member #7
-- Look for any evidence of payment processing

-- 1. Check member #7 enrollment details
SELECT 
  id,
  customer_number,
  first_name,
  last_name,
  email,
  total_monthly_price,
  agent_number,
  enrolled_by_agent_id,
  enrollment_date,
  membership_start_date,
  status,
  is_active,
  payment_token,
  payment_method_type,
  created_at,
  updated_at
FROM members
WHERE id = 7;

-- 2. Check for ANY payment records related to agent Steven (enrolled_by_agent_id)
SELECT 
  p.id,
  p.transaction_id,
  p.member_id,
  p.user_id,
  p.amount,
  p.status,
  p.payment_method,
  p.epx_auth_guid,
  p.authorization_code,
  p.created_at,
  p.metadata,
  m.customer_number,
  m.first_name || ' ' || m.last_name AS member_name,
  m.email AS member_email
FROM payments p
LEFT JOIN members m ON p.member_id = m.id
WHERE p.user_id = (SELECT enrolled_by_agent_id FROM members WHERE id = 7)
ORDER BY p.created_at DESC;

-- 3. Check commission record (we know this exists)
SELECT 
  id,
  agent_id,
  agent_number,
  member_id,
  plan_name,
  coverage_type,
  commission_amount,
  status,
  created_at,
  updated_at
FROM agent_commissions
WHERE member_id = 7;

-- 4. Look for any orphaned payments (payments without member association)
-- These might indicate the payment succeeded but member_id wasn't linked
SELECT 
  p.id,
  p.transaction_id,
  p.amount,
  p.status,
  p.payment_method,
  p.user_id,
  p.member_id,
  p.epx_auth_guid,
  p.created_at,
  p.metadata->'environment' AS environment,
  p.metadata->'hostedCallback' AS callback_data,
  u.email AS agent_email,
  u.agent_number
FROM payments p
LEFT JOIN users u ON p.user_id = u.id
WHERE p.member_id IS NULL
  AND p.created_at >= '2026-02-13'::date  -- Member #7 enrollment date
  AND p.created_at < '2026-02-14'::date
ORDER BY p.created_at DESC;

-- 5. Check for payments with similar amount ($102.96)
SELECT 
  p.id,
  p.transaction_id,
  p.member_id,
  p.amount,
  p.status,
  p.created_at,
  m.customer_number,
  m.first_name || ' ' || m.last_name AS member_name
FROM payments p
LEFT JOIN members m ON p.member_id = m.id
WHERE p.amount = '102.96'
  OR p.amount::numeric = 102.96
ORDER BY p.created_at DESC;

-- Summary: Did payment execute?
-- If queries 2, 4, or 5 return records → Payment likely succeeded but wasn't linked to member #7
-- If all return empty → Payment never processed (member abandoned cart at EPX checkout)
