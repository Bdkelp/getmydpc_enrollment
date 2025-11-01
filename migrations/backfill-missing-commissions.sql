-- Backfill Missing Commissions for Existing Enrollments
-- Run this AFTER running check-missing-commissions.sql to see what's missing

-- This will create commissions for all members who:
-- 1. Have an enrolled_by_agent_id (were enrolled by an agent)
-- 2. Don't already have a commission record
-- 3. Have an active subscription

INSERT INTO agent_commissions (
    agent_id,
    member_id,
    enrollment_id,
    commission_amount,
    coverage_type,
    status,
    payment_status,
    base_premium,
    notes
)
SELECT 
    u.enrolled_by_agent_id as agent_id,
    u.id::text as member_id,
    s.id::text as enrollment_id,
    -- Calculate commission based on plan and member type
    CASE 
        -- Base Plan commissions
        WHEN LOWER(COALESCE(p.name, '')) LIKE '%base%' THEN
            CASE 
                WHEN LOWER(COALESCE(u.member_type, '')) LIKE '%member only%' OR LOWER(COALESCE(u.member_type, '')) = 'individual' THEN 9.00
                WHEN LOWER(COALESCE(u.member_type, '')) LIKE '%spouse%' OR LOWER(COALESCE(u.member_type, '')) = 'couple' THEN 15.00
                WHEN LOWER(COALESCE(u.member_type, '')) LIKE '%child%' THEN 17.00
                WHEN LOWER(COALESCE(u.member_type, '')) LIKE '%family%' THEN 17.00
                ELSE 9.00 -- Default to member only
            END
        -- Plus Plan commissions
        WHEN LOWER(COALESCE(p.name, '')) LIKE '%plus%' OR LOWER(COALESCE(p.name, '')) LIKE '%+%' THEN
            CASE 
                WHEN LOWER(COALESCE(u.member_type, '')) LIKE '%member only%' OR LOWER(COALESCE(u.member_type, '')) = 'individual' THEN 20.00
                WHEN LOWER(COALESCE(u.member_type, '')) LIKE '%spouse%' OR LOWER(COALESCE(u.member_type, '')) = 'couple' THEN 40.00
                WHEN LOWER(COALESCE(u.member_type, '')) LIKE '%child%' THEN 40.00
                WHEN LOWER(COALESCE(u.member_type, '')) LIKE '%family%' THEN 40.00
                ELSE 20.00 -- Default to member only
            END
        -- Elite Plan commissions  
        WHEN LOWER(COALESCE(p.name, '')) LIKE '%elite%' THEN
            CASE 
                WHEN LOWER(COALESCE(u.member_type, '')) LIKE '%member only%' OR LOWER(COALESCE(u.member_type, '')) = 'individual' THEN 20.00
                WHEN LOWER(COALESCE(u.member_type, '')) LIKE '%spouse%' OR LOWER(COALESCE(u.member_type, '')) = 'couple' THEN 40.00
                WHEN LOWER(COALESCE(u.member_type, '')) LIKE '%child%' THEN 40.00
                WHEN LOWER(COALESCE(u.member_type, '')) LIKE '%family%' THEN 40.00
                ELSE 20.00 -- Default to member only
            END
        ELSE 25.00 -- Default commission if plan not found
    END as commission_amount,
    'other' as coverage_type,
    'pending' as status,
    'unpaid' as payment_status,
    COALESCE(p.price, 100.00) as base_premium,
    CONCAT('Backfilled commission - Plan: ', COALESCE(p.name, 'Unknown'), ', Member Type: ', COALESCE(u.member_type, 'Unknown')) as notes
FROM users u
JOIN subscriptions s ON s.user_id = u.id
LEFT JOIN plans p ON p.id = s.plan_id
LEFT JOIN agent_commissions ac ON ac.member_id = u.id::text
WHERE u.enrolled_by_agent_id IS NOT NULL
  AND u.role = 'member'
  AND ac.id IS NULL  -- Only create if commission doesn't exist
RETURNING 
    id,
    agent_id,
    member_id,
    commission_amount,
    coverage_type,
    status,
    payment_status;

-- Verify the backfill worked
SELECT 
    COUNT(*) as total_commissions_created,
    SUM(commission_amount) as total_commission_amount,
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
    ac.commission_amount,
    ac.base_premium,
    ac.status,
    ac.payment_status,
    ac.created_at
FROM agent_commissions ac
JOIN users agent ON ac.agent_id = agent.id::text
JOIN users member ON ac.member_id = member.id::text
WHERE ac.created_at >= NOW() - INTERVAL '1 minute'
ORDER BY ac.created_at DESC;
