-- Check actual agent_commissions table schema
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'agent_commissions'
ORDER BY ordinal_position;
