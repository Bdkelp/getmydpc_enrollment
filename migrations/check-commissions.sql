-- Check if commissions are being created
SELECT 
    ac.id,
    ac.agent_id,
    ac.member_id,
    ac.enrollment_id,
    ac.commission_amount,
    ac.coverage_type,
    ac.status,
    ac.payment_status,
    ac.created_at,
    u.email as agent_email
FROM agent_commissions ac
LEFT JOIN users u ON ac.agent_id = u.id
ORDER BY ac.created_at DESC
LIMIT 20;

-- Check total count
SELECT COUNT(*) as total_commissions FROM agent_commissions;

-- Check if there are any commissions at all
SELECT * FROM agent_commissions ORDER BY created_at DESC LIMIT 5;

-- Check what type member_id actually is
SELECT 
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'agent_commissions'
AND column_name IN ('member_id', 'agent_id', 'enrollment_id');
