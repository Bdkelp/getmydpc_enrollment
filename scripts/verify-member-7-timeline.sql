-- Verify exact timeline for member #7
-- Check all date fields to determine when enrollment/payment actually happened

SELECT 
  id,
  customer_number,
  first_name,
  last_name,
  email,
  total_monthly_price,
  agent_number,
  enrollment_date,
  first_payment_date,
  membership_start_date,
  plan_start_date,
  status,
  is_active,
  created_at,
  updated_at
FROM members
WHERE id = 7;

-- Also check commission creation date (might indicate when payment was supposed to happen)
SELECT 
  id,
  member_id,
  agent_number,
  commission_amount,
  status,
  created_at,
  updated_at
FROM agent_commissions
WHERE member_id = 7;

-- Check if there are ANY payments in the system around that timeframe
-- This will help us know what date range to search in EPX
SELECT 
  id,
  transaction_id,
  member_id,
  amount,
  status,
  created_at::date AS payment_date,
  created_at
FROM payments
WHERE created_at >= (SELECT enrollment_date - INTERVAL '1 day' FROM members WHERE id = 7)
  AND created_at <= (SELECT enrollment_date + INTERVAL '1 day' FROM members WHERE id = 7)
ORDER BY created_at DESC;
