-- Remediation for Supabase linter suggestion:
-- rls_enabled_no_policy
--
-- Strategy:
-- - Keep anon/authenticated blocked on sensitive operational tables.
-- - Add explicit service_role policy for administrative server access.
-- - Skip tables that do not exist in the current environment.
--
-- Safe to run multiple times.

begin;

do $$
declare
  t_name text;
  tbl_exists boolean;
  deny_anon_policy text;
  deny_auth_policy text;
  service_policy text;
  target_tables text[] := array[
    'admin_notifications',
    'agent_hierarchy_history',
    'agent_override_config',
    'billing_schedule',
    'commission_cancellation_events',
    'commission_ledger',
    'commission_ledger_events',
    'commission_payout_batches',
    'commission_payouts',
    'commission_payouts_backup_20260413',
    'group_member_payment_backup_20260413',
    'group_member_payment_backup_20260413_v2',
    'payment_tokens'
  ];
begin
  foreach t_name in array target_tables
  loop
    select exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = t_name
        and c.relkind in ('r', 'p')
    )
    into tbl_exists;

    if not tbl_exists then
      continue;
    end if;

    deny_anon_policy := format('rls_%s_deny_anon', t_name);
    deny_auth_policy := format('rls_%s_deny_authenticated', t_name);
    service_policy := format('rls_%s_service_role_all', t_name);

    execute format('drop policy if exists %I on public.%I;', deny_anon_policy, t_name);
    execute format('drop policy if exists %I on public.%I;', deny_auth_policy, t_name);
    execute format('drop policy if exists %I on public.%I;', service_policy, t_name);

    execute format(
      'create policy %I on public.%I for all to anon using (false) with check (false);',
      deny_anon_policy,
      t_name
    );

    execute format(
      'create policy %I on public.%I for all to authenticated using (false) with check (false);',
      deny_auth_policy,
      t_name
    );

    execute format(
      'create policy %I on public.%I for all to service_role using (true) with check (true);',
      service_policy,
      t_name
    );
  end loop;
end $$;

commit;
