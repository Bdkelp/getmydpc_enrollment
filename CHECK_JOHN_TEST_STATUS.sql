-- Check John Test member status to see why it's not appearing in agent dashboard

SELECT 
  id,
  email,
  first_name,
  last_name,
  customer_number,
  is_active,
  status,
  enrolled_by_agent_id,
  plan_id,
  coverage_type,
  created_at
FROM members
WHERE customer_number = 'GSMP000001';

-- If is_active is FALSE, fix it:
-- UPDATE members 
-- SET is_active = true, status = 'active'
-- WHERE customer_number = 'GSMP000001';
