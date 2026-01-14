-- Enable Row Level Security for platform + group tables and limit access to service role
BEGIN;

-- Enable RLS on required tables
ALTER TABLE IF EXISTS public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_performance_goals ENABLE ROW LEVEL SECURITY;

-- Helper procedure for policy creation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'platform_settings'
      AND policyname = 'platform_settings_service_role_full_access'
  ) THEN
    CREATE POLICY platform_settings_service_role_full_access
      ON public.platform_settings
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'groups'
      AND policyname = 'groups_service_role_full_access'
  ) THEN
    CREATE POLICY groups_service_role_full_access
      ON public.groups
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'group_members'
      AND policyname = 'group_members_service_role_full_access'
  ) THEN
    CREATE POLICY group_members_service_role_full_access
      ON public.group_members
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_performance_goals'
      AND policyname = 'agent_performance_goals_service_role_full_access'
  ) THEN
    CREATE POLICY agent_performance_goals_service_role_full_access
      ON public.agent_performance_goals
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

COMMIT;
