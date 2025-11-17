-- Alternative Approach: Use ALTER VIEW to remove SECURITY DEFINER
-- If the above approach doesn't work, try these commands:

-- For agent_commissions_with_details
ALTER VIEW public.agent_commissions_with_details OWNER TO postgres;

-- For agent_downlines  
ALTER VIEW public.agent_downlines OWNER TO postgres;

-- Then verify the SECURITY DEFINER is gone
SELECT schemaname, viewname, 
  CASE WHEN pg_get_viewdef(viewname::regclass, true) LIKE '%SECURITY DEFINER%' THEN 'HAS SECURITY DEFINER' ELSE 'NO SECURITY DEFINER' END as security_status
FROM pg_views
WHERE schemaname = 'public'
AND viewname IN ('agent_commissions_with_details', 'agent_downlines');

-- If still showing SECURITY DEFINER, try the FULL nuclear option:
-- Create temporary views with new names, drop old ones, rename new ones

-- Step 1: Create temp views WITHOUT SECURITY DEFINER
CREATE TEMP VIEW temp_agent_commissions_with_details AS
SELECT ac.id,
    ac.agent_id,
    ac.member_id,
    ac.enrollment_id,
    ac.commission_amount,
    ac.payment_status,
    ac.created_at,
    ac.updated_at,
    u.email AS agent_email,
    u.first_name AS agent_first_name,
    u.last_name AS agent_last_name
   FROM agent_commissions ac
     LEFT JOIN users u ON ac.agent_id = u.id::text;

CREATE TEMP VIEW temp_agent_downlines AS
SELECT parent.id AS parent_agent_id,
    child.id AS downline_agent_id,
    parent.email AS parent_email,
    child.email AS downline_email,
    child.first_name,
    child.last_name
   FROM users parent
     LEFT JOIN users child ON child.upline_agent_id = parent.id::text
  WHERE parent.role::text = 'agent'::text;

-- Step 2: Drop the problematic views
DROP VIEW IF EXISTS public.agent_commissions_with_details CASCADE;
DROP VIEW IF EXISTS public.agent_downlines CASCADE;

-- Step 3: Recreate without SECURITY DEFINER using the temp views as reference
CREATE VIEW public.agent_commissions_with_details AS
SELECT ac.id,
    ac.agent_id,
    ac.member_id,
    ac.enrollment_id,
    ac.commission_amount,
    ac.payment_status,
    ac.created_at,
    ac.updated_at,
    u.email AS agent_email,
    u.first_name AS agent_first_name,
    u.last_name AS agent_last_name
   FROM agent_commissions ac
     LEFT JOIN users u ON ac.agent_id = u.id::text;

CREATE VIEW public.agent_downlines AS
SELECT parent.id AS parent_agent_id,
    child.id AS downline_agent_id,
    parent.email AS parent_email,
    child.email AS downline_email,
    child.first_name,
    child.last_name
   FROM users parent
     LEFT JOIN users child ON child.upline_agent_id = parent.id::text
  WHERE parent.role::text = 'agent'::text;

-- Verify final state
SELECT schemaname, viewname, pg_get_viewdef(viewname::regclass, true)
FROM pg_views
WHERE schemaname = 'public'
AND viewname IN ('agent_commissions_with_details', 'agent_downlines');
