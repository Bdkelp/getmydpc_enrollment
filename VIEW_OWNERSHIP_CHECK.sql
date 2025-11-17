-- Check view ownership, permissions, and actual function definitions

-- 1. Get detailed view information
SELECT 
  n.nspname as schema_name,
  c.relname as view_name,
  u.usename as owner,
  c.relacl as permissions,
  c.reloptions as options,
  CASE 
    WHEN c.relkind = 'v' THEN 'Regular View'
    WHEN c.relkind = 'm' THEN 'Materialized View'
    ELSE 'Other'
  END as view_type
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_user u ON u.usesysid = c.relowner
WHERE n.nspname = 'public'
AND c.relname IN ('agent_commissions_with_details', 'agent_downlines');

-- 2. Check if views have any special attributes
SELECT 
  schemaname,
  viewname,
  definition,
  LENGTH(definition) as def_length,
  POSITION('SECURITY' IN UPPER(definition)) as security_keyword_pos,
  POSITION('DEFINER' IN UPPER(definition)) as definer_keyword_pos
FROM pg_views
WHERE schemaname = 'public'
AND viewname IN ('agent_commissions_with_details', 'agent_downlines');

-- 3. Get COMPLETE view definition with all details
SELECT pg_get_viewdef('public.agent_commissions_with_details'::regclass, true) as agent_commissions_def;
SELECT pg_get_viewdef('public.agent_downlines'::regclass, true) as agent_downlines_def;

-- 4. Check if there's a view-specific setting that's causing the linter issue
SELECT 
  t.typname,
  t.typnamespace,
  t.typtype
FROM pg_type t
WHERE t.typnamespace IN (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND t.typname IN ('agent_commissions_with_details', 'agent_downlines');
