-- Ensure RLS is enforced on tables surfaced through PostgREST
BEGIN;

-- Enable and force row level security on exposed tables
ALTER TABLE IF EXISTS public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.platform_settings FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.groups FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.group_members FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.agent_performance_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_performance_goals FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admin_notifications FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.agent_hierarchy_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_hierarchy_history FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.agent_override_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_override_config FORCE ROW LEVEL SECURITY;

-- Service role only policies (backend uses service key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'platform_settings'
      AND policyname = 'platform_settings_service_role_only'
  ) THEN
    CREATE POLICY platform_settings_service_role_only
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
      AND policyname = 'groups_service_role_only'
  ) THEN
    CREATE POLICY groups_service_role_only
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
      AND policyname = 'group_members_service_role_only'
  ) THEN
    CREATE POLICY group_members_service_role_only
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
      AND policyname = 'agent_performance_goals_service_role_only'
  ) THEN
    CREATE POLICY agent_performance_goals_service_role_only
      ON public.agent_performance_goals
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
      AND tablename = 'admin_notifications'
      AND policyname = 'admin_notifications_service_role_only'
  ) THEN
    CREATE POLICY admin_notifications_service_role_only
      ON public.admin_notifications
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
      AND tablename = 'agent_hierarchy_history'
      AND policyname = 'agent_hierarchy_history_service_role_only'
  ) THEN
    CREATE POLICY agent_hierarchy_history_service_role_only
      ON public.agent_hierarchy_history
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
      AND tablename = 'agent_override_config'
      AND policyname = 'agent_override_config_service_role_only'
  ) THEN
    CREATE POLICY agent_override_config_service_role_only
      ON public.agent_override_config
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

COMMIT;

-- Harden function search_path to avoid search_path hijacking
DO $$
DECLARE
  func RECORD;
BEGIN
  FOR func IN
    SELECT proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND proname IN (
        'set_updated_at',
        'reset_test_data',
        'update_updated_at_column',
        'cleanup_expired_temp_registrations',
        'increment_discount_usage',
        'update_discount_codes_updated_at',
        'update_agent_hierarchy_level',
        'generate_customer_number',
        'update_hierarchy_level'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = pg_catalog, public;',
      func.proname,
      func.args
    );
  END LOOP;
END $$;

-- Tighten permissive RLS policy for public lead submissions
ALTER TABLE IF EXISTS public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public lead submission" ON public.leads;
CREATE POLICY "Allow public lead submission"
  ON public.leads
  FOR INSERT
  WITH CHECK (auth.role() IN ('anon', 'authenticated', 'service_role'));
