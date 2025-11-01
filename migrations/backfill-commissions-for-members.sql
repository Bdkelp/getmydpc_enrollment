-- Backfill commissions for existing members in the members table
-- This creates commissions for members who:
-- 1. Were enrolled by an agent (have enrolled_by_agent_id)
-- 2. Don't already have a commission in agent_commissions
-- 3. Have a subscription

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
    m.enrolled_by_agent_id as agent_id,
    m.id::text as member_id,
    s.id::text as enrollment_id,
    -- Calculate commission based on plan and member type
    CASE 
        -- Base Plan commissions
        WHEN LOWER(COALESCE(p.name, '')) LIKE '%base%' THEN
            CASE 
                WHEN LOWER(COALESCE(m.member_type, '')) LIKE '%member only%' OR LOWER(COALESCE(m.member_type, '')) = 'individual' THEN 9.00
                WHEN LOWER(COALESCE(m.member_type, '')) LIKE '%spouse%' OR LOWER(COALESCE(m.member_type, '')) = 'couple' THEN 15.00
                WHEN LOWER(COALESCE(m.member_type, '')) LIKE '%child%' THEN 17.00
                WHEN LOWER(COALESCE(m.member_type, '')) LIKE '%family%' THEN 17.00
                ELSE 9.00
            END
        -- Plus Plan commissions
        WHEN LOWER(COALESCE(p.name, '')) LIKE '%plus%' OR LOWER(COALESCE(p.name, '')) LIKE '%+%' THEN
            CASE 
                WHEN LOWER(COALESCE(m.member_type, '')) LIKE '%member only%' OR LOWER(COALESCE(m.member_type, '')) = 'individual' THEN 20.00
                WHEN LOWER(COALESCE(m.member_type, '')) LIKE '%spouse%' OR LOWER(COALESCE(m.member_type, '')) = 'couple' THEN 40.00
                WHEN LOWER(COALESCE(m.member_type, '')) LIKE '%child%' THEN 40.00
                WHEN LOWER(COALESCE(m.member_type, '')) LIKE '%family%' THEN 40.00
                ELSE 20.00
            END
        -- Elite Plan commissions  
        WHEN LOWER(COALESCE(p.name, '')) LIKE '%elite%' THEN
            CASE 
                WHEN LOWER(COALESCE(m.member_type, '')) LIKE '%member only%' OR LOWER(COALESCE(m.member_type, '')) = 'individual' THEN 20.00
                WHEN LOWER(COALESCE(m.member_type, '')) LIKE '%spouse%' OR LOWER(COALESCE(m.member_type, '')) = 'couple' THEN 40.00
                WHEN LOWER(COALESCE(m.member_type, '')) LIKE '%child%' THEN 40.00
                WHEN LOWER(COALESCE(m.member_type, '')) LIKE '%family%' THEN 40.00
                ELSE 20.00
            END
        ELSE 9.00 -- Default to Base member only
    END as commission_amount,
    'other' as coverage_type,
    'pending' as status,
    'unpaid' as payment_status,
    COALESCE(m.total_monthly_price, s.amount, 0) as base_premium,
    CONCAT('Backfilled: Plan ', COALESCE(p.name, 'Unknown'), ', Member Type: ', COALESCE(m.member_type, 'Unknown')) as notes
FROM members m
LEFT JOIN subscriptions s ON s.member_id = m.id
LEFT JOIN plans p ON p.id = COALESCE(m.plan_id, s.plan_id)
WHERE m.enrolled_by_agent_id IS NOT NULL
  AND m.enrolled_by_agent_id != ''
  AND m.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM agent_commissions ac 
    WHERE ac.member_id = m.id::text
  );

-- Show what was created
SELECT 
    COUNT(*) as commissions_created,
    SUM(commission_amount) as total_commission_amount
FROM agent_commissions
WHERE notes LIKE 'Backfilled:%';
