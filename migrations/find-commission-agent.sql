-- Find both agent accounts and their IDs
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
   OR agent_number = 'MPP0009'
ORDER BY email;

-- Check the real commission and see which agent it belongs to
SELECT 
    ac.id as commission_id,
    ac.agent_id,
    ac.member_id,
    ac.commission_amount,
    ac.notes,
    u.email as agent_email,
    u.agent_number,
    u.first_name,
    u.last_name
FROM agent_commissions ac
LEFT JOIN users u ON ac.agent_id = u.id
WHERE ac.member_id = '28'  -- The real enrollment
ORDER BY ac.created_at DESC;
