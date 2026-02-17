-- Find all members without corresponding payment records
-- This indicates broken payment flows where enrollment completed but payment wasn't tracked

SELECT 
  m.id AS member_id,
  m.customer_number,
  m.first_name || ' ' || m.last_name AS member_name,
  m.email,
  m.total_monthly_price,
  m.agent_number,
  m.enrolled_by_agent_id,
  m.enrollment_date,
  m.is_active,
  m.status,
  p.id AS payment_id,
  p.transaction_id,
  p.amount AS payment_amount,
  p.status AS payment_status
FROM members m
LEFT JOIN payments p ON m.id = p.member_id
WHERE m.total_monthly_price IS NOT NULL 
  AND m.total_monthly_price > 0
  AND p.id IS NULL  -- No payment record exists
ORDER BY m.enrollment_date DESC;

-- Summary count
SELECT 
  COUNT(*) AS members_without_payments,
  SUM(m.total_monthly_price) AS total_missing_revenue
FROM members m
LEFT JOIN payments p ON m.id = p.member_id
WHERE m.total_monthly_price IS NOT NULL 
  AND m.total_monthly_price > 0
  AND p.id IS NULL;
