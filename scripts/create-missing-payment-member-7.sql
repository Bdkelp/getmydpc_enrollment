-- Manual Payment Record Creation for Member #7 (Steven Villarreal)
-- This should have been created automatically during enrollment but was missed
-- Reconstructed based on member enrollment data

-- First, verify member #7 details
SELECT 
  id,
  customer_number,
  first_name,
  last_name,
  email,
  total_monthly_price,
  agent_number,
  enrollment_date,
  membership_start_date,
  status,
  is_active
FROM members
WHERE id = 7;

-- Check if payment record already exists (it shouldn't)
SELECT * FROM payments WHERE member_id = 7;

-- Create the missing payment record
-- Status: 'succeeded' (since member was enrolled and commission was created)
-- Amount: $102.96 (from member.total_monthly_price)
-- Note: We don't have the actual EPX transaction_id, so using a placeholder
INSERT INTO payments (
  member_id,
  user_id,
  subscription_id,
  amount,
  currency,
  status,
  payment_method,
  transaction_id,
  authorization_code,
  epx_auth_guid,
  metadata,
  created_at,
  updated_at
)
VALUES (
  7, -- member_id
  (SELECT enrolled_by_agent_id FROM members WHERE id = 7), -- user_id (agent who enrolled)
  NULL, -- subscription_id (none for one-time enrollment)
  '102.96', -- amount
  'USD', -- currency
  'succeeded', -- status (enrollment completed)
  'card', -- payment_method
  'MANUAL-RECOVERY-M7-' || to_char(NOW(), 'YYYYMMDD-HH24MISS'), -- synthetic transaction_id
  NULL, -- authorization_code (unknown)
  NULL, -- epx_auth_guid (unknown - this is why recurring billing won't work)
  jsonb_build_object(
    'environment', 'production',
    'source', 'manual-recovery',
    'reason', 'Payment record missing during enrollment - created retroactively',
    'original_enrollment_date', (SELECT enrollment_date FROM members WHERE id = 7),
    'recovery_date', NOW(),
    'recovery_by', 'database_admin',
    'notes', 'Member #7 enrolled but payment record was not created. Commission e07f4cb9-1cab-4471-a3ff-4fb07b2996b9 already created manually.'
  ), -- metadata
  (SELECT enrollment_date FROM members WHERE id = 7), -- created_at (use original enrollment date)
  NOW() -- updated_at
)
RETURNING *;

-- Verify the created payment record
SELECT 
  p.id,
  p.member_id,
  p.transaction_id,
  p.amount,
  p.status,
  p.payment_method,
  p.created_at,
  p.metadata,
  m.customer_number,
  m.first_name || ' ' || m.last_name AS member_name,
  m.email
FROM payments p
JOIN members m ON p.member_id = m.id
WHERE p.member_id = 7;
