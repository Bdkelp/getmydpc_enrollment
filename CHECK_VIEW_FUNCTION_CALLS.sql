-- Check if the problematic views call any SECURITY DEFINER functions

-- Get the full view definitions to see if they call functions
SELECT 
  schemaname,
  viewname,
  definition
FROM pg_views
WHERE schemaname = 'public'
AND viewname IN ('agent_commissions_with_details', 'agent_downlines');

-- Search for function calls in view definitions
-- Check if views reference: generate_customer_number, format_phone, format_date_mmddyyyy, or can_modify_enrollments
SELECT 
  viewname,
  CASE 
    WHEN definition LIKE '%generate_customer_number%' THEN 'Calls generate_customer_number'
    WHEN definition LIKE '%format_phone%' THEN 'Calls format_phone'
    WHEN definition LIKE '%format_date_mmddyyyy%' THEN 'Calls format_date_mmddyyyy'
    WHEN definition LIKE '%can_modify_enrollments%' THEN 'Calls can_modify_enrollments'
    ELSE 'No SECURITY DEFINER functions called'
  END as function_usage
FROM pg_views
WHERE schemaname = 'public'
AND viewname IN ('agent_commissions_with_details', 'agent_downlines');

-- Alternative: check schema definition directly
SELECT 
  n.nspname,
  p.proname,
  p.prosecdef,
  pg_get_functiondef(p.oid) as function_def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef = true
AND n.nspname = 'public';
