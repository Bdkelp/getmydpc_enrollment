-- Supabase Cron + pg_net trigger for durable recurring billing.
-- Install only after Vault contains billing_scheduler_run_url,
-- billing_scheduler_health_url, and billing_scheduler_token.
-- The schedule is disabled and dry-run by default.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE TABLE IF NOT EXISTS public.recurring_billing_configuration (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'dry_run' CHECK (mode IN ('dry_run', 'live')),
  kill_switch boolean NOT NULL DEFAULT true,
  business_timezone text NOT NULL DEFAULT 'America/Chicago',
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  updated_by text NOT NULL DEFAULT 'migration'
);

INSERT INTO public.recurring_billing_configuration
  (singleton, enabled, mode, kill_switch)
VALUES (true, false, 'dry_run', true)
ON CONFLICT (singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION public.invoke_external_recurring_billing()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault, pg_temp
AS $$
DECLARE
  config public.recurring_billing_configuration;
  endpoint text;
  scheduler_token text;
  request_id bigint;
BEGIN
  SELECT * INTO config FROM public.recurring_billing_configuration WHERE singleton = true;
  IF NOT config.enabled OR config.kill_switch THEN RETURN NULL; END IF;

  SELECT decrypted_secret INTO endpoint
  FROM vault.decrypted_secrets WHERE name = 'billing_scheduler_run_url' LIMIT 1;
  SELECT decrypted_secret INTO scheduler_token
  FROM vault.decrypted_secrets WHERE name = 'billing_scheduler_token' LIMIT 1;
  IF COALESCE(endpoint, '') = '' OR COALESCE(scheduler_token, '') = '' THEN
    RAISE EXCEPTION 'billing scheduler Vault secrets are not configured';
  END IF;

  SELECT net.http_post(
    url := endpoint,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || scheduler_token,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'mode', config.mode,
      'scheduledAt', NOW()
    ),
    timeout_milliseconds := 55000
  ) INTO request_id;
  RETURN request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_external_recurring_billing_health()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault, pg_temp
AS $$
DECLARE
  config public.recurring_billing_configuration;
  endpoint text;
  scheduler_token text;
  request_id bigint;
BEGIN
  SELECT * INTO config FROM public.recurring_billing_configuration WHERE singleton = true;
  IF NOT config.enabled OR config.kill_switch THEN RETURN NULL; END IF;

  SELECT decrypted_secret INTO endpoint
  FROM vault.decrypted_secrets WHERE name = 'billing_scheduler_health_url' LIMIT 1;
  SELECT decrypted_secret INTO scheduler_token
  FROM vault.decrypted_secrets WHERE name = 'billing_scheduler_token' LIMIT 1;
  IF COALESCE(endpoint, '') = '' OR COALESCE(scheduler_token, '') = '' THEN
    RAISE EXCEPTION 'billing scheduler health Vault secrets are not configured';
  END IF;

  SELECT net.http_post(
    url := endpoint,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || scheduler_token,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) INTO request_id;
  RETURN request_id;
END;
$$;

REVOKE ALL ON TABLE public.recurring_billing_configuration FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.invoke_external_recurring_billing() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_external_recurring_billing_health() FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.recurring_billing_configuration TO service_role;
GRANT EXECUTE ON FUNCTION public.invoke_external_recurring_billing() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_external_recurring_billing_health() TO service_role;

DO $$
DECLARE
  existing_job bigint;
BEGIN
  SELECT jobid INTO existing_job FROM cron.job WHERE jobname = 'recurring-billing-every-five-minutes';
  IF existing_job IS NOT NULL THEN PERFORM cron.unschedule(existing_job); END IF;
  SELECT jobid INTO existing_job FROM cron.job WHERE jobname = 'recurring-billing-health-every-ten-minutes';
  IF existing_job IS NOT NULL THEN PERFORM cron.unschedule(existing_job); END IF;

  PERFORM cron.schedule(
    'recurring-billing-every-five-minutes',
    '*/5 * * * *',
    'SELECT public.invoke_external_recurring_billing()'
  );
  PERFORM cron.schedule(
    'recurring-billing-health-every-ten-minutes',
    '*/10 * * * *',
    'SELECT public.check_external_recurring_billing_health()'
  );
END;
$$;

COMMENT ON TABLE public.recurring_billing_configuration IS
  'External scheduler kill switch and mode. Keep kill_switch=true until dry-run rollout approval.';

COMMIT;
