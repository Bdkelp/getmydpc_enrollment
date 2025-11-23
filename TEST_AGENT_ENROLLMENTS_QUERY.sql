-- Test the exact query used by getEnrollmentsByAgent for Michael
-- This mimics the backend SQL query to debug why enrollments aren't showing

SELECT 
  m.*,
  p.name as plan_name,
  p.price as plan_price,
  ac.commission_amount,
  ac.payment_status as commission_status
FROM members m
LEFT JOIN plans p ON m.plan_id = p.id
LEFT JOIN agent_commissions ac ON ac.member_id = m.id::text AND ac.agent_id = '8bda1072-ab65-4733-a84b-2a3609a69450'
WHERE m.enrolled_by_agent_id::uuid = '8bda1072-ab65-4733-a84b-2a3609a69450'::uuid 
  AND m.is_active = true
ORDER BY m.created_at DESC;

-- Also check if commission exists for John Test
SELECT * FROM agent_commissions 
WHERE member_id = '1'
  OR agent_id = '8bda1072-ab65-4733-a84b-2a3609a69450';
