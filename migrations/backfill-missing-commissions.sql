-- Backfill Missing Commissions for Existing Enrollments
-- Run this AFTER running check-missing-commissions.sql to see what's missing

-- This will create commissions for all members who:
-- 1. Have an enrolled_by_agent_id (were enrolled by an agent)
-- 2. Don't already have a commission record
-- 3. Have an active subscription

INSERT INTO agent_commissions (
    agent_id,
    member_id,
    amount,
    status,
    commission_type,
    created_at
)
SELECT 
    u.enrolled_by_agent_id as agent_id,
    u.id::text as member_id,
    COALESCE(
        -- Try to get commission from plan if available
        (SELECT p.commission_rate FROM plans p 
         JOIN subscriptions s ON s.plan_id = p.id 
         WHERE s.user_id = u.id 
         LIMIT 1),
        -- Default commission amount if no plan found
        25.00
    ) as amount,
    'pending' as status,
    'enrollment' as commission_type,
    u.created_at as created_at
FROM users u
LEFT JOIN agent_commissions ac ON ac.member_id = u.id::text
WHERE u.enrolled_by_agent_id IS NOT NULL
  AND u.role = 'member'
  AND ac.id IS NULL  -- Only create if commission doesn't exist
  AND EXISTS (
      -- Only if member has a subscription
      SELECT 1 FROM subscriptions s WHERE s.user_id = u.id
  )
RETURNING 
    id,
    agent_id,
    member_id,
    amount,
    status,
    created_at;

-- Verify the backfill worked
SELECT 
    COUNT(*) as total_commissions_created,
    SUM(amount) as total_commission_amount,
    status
FROM agent_commissions
WHERE created_at >= NOW() - INTERVAL '1 minute'
GROUP BY status;

-- Show the newly created commissions with member details
SELECT 
    ac.id,
    ac.agent_id,
    agent.email as agent_email,
    ac.member_id,
    member.email as member_email,
    ac.amount,
    ac.status,
    ac.created_at
FROM agent_commissions ac
JOIN users agent ON ac.agent_id = agent.id::text
JOIN users member ON ac.member_id = member.id::text
WHERE ac.created_at >= NOW() - INTERVAL '1 minute'
ORDER BY ac.created_at DESC;
