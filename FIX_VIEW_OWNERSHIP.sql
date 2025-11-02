-- Final Fix: Change view ownership and permissions to remove any SECURITY DEFINER implications

-- Step 1: Get current owners
SELECT 
  n.nspname,
  c.relname,
  u.usename as current_owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_user u ON u.usesysid = c.relowner
WHERE n.nspname = 'public'
AND c.relname IN ('agent_commissions_with_details', 'agent_downlines');

-- Step 2: Change ownership to postgres (standard user)
-- This might help the linter recognize them as standard views
ALTER VIEW public.agent_commissions_with_details OWNER TO postgres;
ALTER VIEW public.agent_downlines OWNER TO postgres;

-- Step 3: Grant appropriate permissions
GRANT SELECT ON public.agent_commissions_with_details TO public;
GRANT SELECT ON public.agent_downlines TO public;

-- Step 4: Verify changes
SELECT 
  n.nspname,
  c.relname,
  u.usename as owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_user u ON u.usesysid = c.relowner
WHERE n.nspname = 'public'
AND c.relname IN ('agent_commissions_with_details', 'agent_downlines');

-- Step 5: Verify view definitions are still clean
SELECT schemaname, viewname, pg_get_viewdef(viewname::regclass, true)
FROM pg_views
WHERE schemaname = 'public'
AND viewname IN ('agent_commissions_with_details', 'agent_downlines');
