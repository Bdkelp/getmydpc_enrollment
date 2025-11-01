-- Fix SECURITY DEFINER Issue on agent_commissions_with_details View
-- This migration explicitly sets SECURITY INVOKER to ensure the view
-- runs with the permissions of the querying user, not the view creator

-- Drop the existing view completely
DROP VIEW IF EXISTS agent_commissions_with_details CASCADE;

-- Recreate the view with SECURITY INVOKER (explicit setting)
CREATE OR REPLACE VIEW agent_commissions_with_details
WITH (security_invoker = true)
AS
SELECT 
    ac.*,
    agent.email as agent_email,
    agent.first_name as agent_first_name,
    agent.last_name as agent_last_name,
    member.email as member_email,
    member.first_name as member_first_name,
    member.last_name as member_last_name
FROM agent_commissions ac
LEFT JOIN users agent ON ac.agent_id = agent.id::text
LEFT JOIN users member ON ac.member_id = member.id::text;

-- Grant appropriate permissions
-- The view will use the querying user's RLS policies on underlying tables
GRANT SELECT ON agent_commissions_with_details TO authenticated;
GRANT SELECT ON agent_commissions_with_details TO anon;

-- Add comment explaining the security model
COMMENT ON VIEW agent_commissions_with_details IS 
'Commission details view with SECURITY INVOKER - uses querying user''s permissions and RLS policies';
