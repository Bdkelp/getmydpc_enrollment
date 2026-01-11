-- Enable Row Level Security for platform settings and agent performance goal tables
BEGIN;

ALTER TABLE IF EXISTS public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_performance_goals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
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
    SELECT 1
    FROM pg_policies
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
