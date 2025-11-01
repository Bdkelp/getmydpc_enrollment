-- Check for enrollments that don't have commissions
-- This identifies members who were enrolled by an agent but have no commission record

-- 1. Find all members enrolled by agents (have enrolled_by_agent_id)
SELECT 
    u.id as member_id,
    u.email as member_email,
    u.first_name,
    u.last_name,
    u.enrolled_by_agent_id,
    agent.email as agent_email,
    u.created_at as enrollment_date,
    CASE WHEN ac.id IS NULL THEN '❌ MISSING' ELSE '✅ EXISTS' END as commission_status
FROM users u
LEFT JOIN users agent ON u.enrolled_by_agent_id = agent.id::text
LEFT JOIN agent_commissions ac ON ac.member_id = u.id::text
WHERE u.enrolled_by_agent_id IS NOT NULL
  AND u.role = 'member'
ORDER BY u.created_at DESC;

-- 2. Count missing commissions
SELECT 
    COUNT(*) as total_members_with_agent,
    COUNT(ac.id) as members_with_commission,
    COUNT(*) - COUNT(ac.id) as missing_commissions
FROM users u
LEFT JOIN agent_commissions ac ON ac.member_id = u.id::text
WHERE u.enrolled_by_agent_id IS NOT NULL
  AND u.role = 'member';

-- 3. List specific members missing commissions
SELECT 
    u.id as member_id,
    u.email as member_email,
    u.enrolled_by_agent_id,
    agent.email as agent_email,
    u.created_at as enrollment_date
FROM users u
LEFT JOIN users agent ON u.enrolled_by_agent_id = agent.id::text
LEFT JOIN agent_commissions ac ON ac.member_id = u.id::text
WHERE u.enrolled_by_agent_id IS NOT NULL
  AND u.role = 'member'
  AND ac.id IS NULL
ORDER BY u.created_at DESC;
