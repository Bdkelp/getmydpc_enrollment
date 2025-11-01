-- Find the agent and admin accounts
SELECT 
    id,
    email,
    first_name,
    last_name,
    role,
    agent_number,
    is_active
FROM users
WHERE email IN ('mkeener@lonestarenotary.com', 'michael@mypremierplans.com')
ORDER BY email;

-- Check if the commission agent_id matches either of them
SELECT 
    '82bc3fb4-b2e4-4d05-a9d9-41641e998a21' as commission_agent_id,
    u.id as user_id,
    u.email,
    u.role,
    CASE 
        WHEN u.id = '82bc3fb4-b2e4-4d05-a9d9-41641e998a21' THEN '✓ MATCH'
        ELSE '✗ NO MATCH'
    END as match_status
FROM users u
WHERE email IN ('mkeener@lonestarenotary.com', 'michael@mypremierplans.com');
