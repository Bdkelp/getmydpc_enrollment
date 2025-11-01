-- Find the agent who should see the commission
SELECT 
    id,
    email,
    first_name,
    last_name,
    role,
    agent_number
FROM users
WHERE id = '82bc3fb4-b2e4-4d05-a9d9-41641e998a21';

-- Also check all agents
SELECT 
    id,
    email,
    first_name,
    last_name,
    role,
    agent_number
FROM users
WHERE role IN ('agent', 'admin')
ORDER BY created_at DESC;
