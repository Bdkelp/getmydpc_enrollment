
-- Create a view that provides camelCase field names for the leads table
-- This matches what your UI components expect
create or replace view public.app_leads as
select
  id,
  first_name  as "firstName",
  last_name   as "lastName",
  email,
  phone,
  message,
  source,
  coalesce(status,'new')     as status,
  assigned_agent_id          as "assignedUserId",   -- aliased to what the UI expects
  created_at                 as "createdAt",
  updated_at                 as "updatedAt",
  notes
from public.leads;

-- Grant appropriate permissions
GRANT SELECT ON public.app_leads TO authenticated;
GRANT SELECT ON public.app_leads TO anon;

-- Enable RLS on the view (inherits from the underlying table)
ALTER VIEW public.app_leads OWNER TO postgres;

-- Add a comment explaining the view's purpose
COMMENT ON VIEW public.app_leads IS 'Leads view with camelCase field names for UI consistency';
