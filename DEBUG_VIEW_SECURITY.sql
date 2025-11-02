-- Debug: Check the actual view properties in Supabase catalog
-- This will show us if the views actually have SECURITY DEFINER at the catalog level

-- Check if views have security_invoker or other security settings
SELECT 
  n.nspname as schema_name,
  c.relname as view_name,
  c.relkind,
  c.relowner,
  obj_description(c.oid, 'pg_class') as description,
  -- Check if security_invoker is set (opposite of SECURITY DEFINER)
  EXISTS(SELECT 1 FROM pg_class WHERE oid = c.oid AND relname = c.relname) as found
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' 
AND c.relname IN ('agent_commissions_with_details', 'agent_downlines')
ORDER BY c.relname;

-- Get the view creation SQL from information_schema
SELECT 
  table_schema,
  table_name,
  view_definition
FROM information_schema.views
WHERE table_schema = 'public'
AND table_name IN ('agent_commissions_with_details', 'agent_downlines');

-- Check pg_views for security settings
SELECT 
  schemaname,
  viewname,
  viewowner,
  definition
FROM pg_views
WHERE schemaname = 'public'
AND viewname IN ('agent_commissions_with_details', 'agent_downlines');

-- Last resort: Check if the views reference any functions with SECURITY DEFINER
SELECT 
  p.oid,
  n.nspname as func_schema,
  p.proname as func_name,
  p.prosecdef as has_security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef = true
AND n.nspname = 'public';

-- Force refresh of Supabase metadata cache (may not work depending on permissions)
-- This sometimes helps when the linter is out of sync
ANALYZE public.agent_commissions_with_details;
ANALYZE public.agent_downlines;
