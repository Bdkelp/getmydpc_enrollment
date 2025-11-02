-- Debug script to check agent dashboard data
-- Run this in Supabase SQL Editor

-- 1. Check what agents exist
SELECT id, email, role, agent_number 
FROM users 
WHERE role = 'agent';

-- 2. Check members enrolled by agents
SELECT 
  m.id,
  m.email,
  m.first_name,
  m.last_name,
  m.enrolled_by_agent_id,
  m.is_active,
  m.created_at,
  p.name as plan_name,
  p.price as plan_price
FROM members m
LEFT JOIN plans p ON m.plan_id = p.id
WHERE m.enrolled_by_agent_id IS NOT NULL
ORDER BY m.created_at DESC;

-- 3. Check commissions for a specific agent (replace with actual agent ID)
-- Find your agent ID from query #1, then replace 'YOUR_AGENT_ID' below
SELECT 
  ac.id,
  ac.agent_id,
  ac.member_id,
  ac.commission_amount,
  ac.payment_status,
  ac.commission_type,
  m.email as member_email,
  m.first_name,
  m.last_name
FROM agent_commissions ac
LEFT JOIN members m ON m.id::text = ac.member_id
WHERE ac.agent_id = 'YOUR_AGENT_ID'
ORDER BY ac.created_at DESC;

-- 4. Check ALL commissions (to see if any exist)
SELECT 
  ac.id,
  ac.agent_id,
  ac.member_id,
  ac.commission_amount,
  ac.payment_status,
  ac.commission_type,
  ac.created_at
FROM agent_commissions ac
ORDER BY ac.created_at DESC
LIMIT 10;

-- 5. Check if members have mismatched agent IDs
SELECT 
  m.id as member_id,
  m.email as member_email,
  m.enrolled_by_agent_id,
  COUNT(ac.id) as commission_count
FROM members m
LEFT JOIN agent_commissions ac ON ac.member_id = m.id::text
WHERE m.enrolled_by_agent_id IS NOT NULL
GROUP BY m.id, m.email, m.enrolled_by_agent_id;
