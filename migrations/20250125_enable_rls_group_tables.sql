-- Enable RLS on operational tables surfaced through PostgREST
ALTER TABLE IF EXISTS public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_performance_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_settings_service_policy ON public.platform_settings;
CREATE POLICY platform_settings_service_policy
ON public.platform_settings
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS groups_service_policy ON public.groups;
CREATE POLICY groups_service_policy
ON public.groups
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS group_members_service_policy ON public.group_members;
CREATE POLICY group_members_service_policy
ON public.group_members
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS agent_performance_goals_service_policy ON public.agent_performance_goals;
CREATE POLICY agent_performance_goals_service_policy
ON public.agent_performance_goals
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
