-- Test the exact query that getAgentCommissionsNew runs
SELECT 
    *
FROM agent_commissions
WHERE agent_id = '82bc3fb4-b2e4-4d05-a9d9-41641e998a21'
ORDER BY created_at DESC;

-- Double check this agent exists in users
SELECT id, email, role FROM users WHERE id = '82bc3fb4-b2e4-4d05-a9d9-41641e998a21';
