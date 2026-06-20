-- Remediation for Supabase linter warnings:
-- 1) public_bucket_allows_listing (profile-images)
-- 2) anon/authenticated can execute SECURITY DEFINER functions
--
-- Safe to run multiple times.

begin;

-- Remove broad object-listing policy on the public profile image bucket.
-- Public buckets can still serve objects through public URLs without this policy.
drop policy if exists "Public can view profile images vejz8c_0" on storage.objects;

-- Lock down EXECUTE for SECURITY DEFINER helper functions so they are not callable
-- through PostgREST by anon/authenticated roles.

do $$
declare
  fn_sig text;
begin
  for fn_sig in
    values
      ('public.app_advisory_unlock(bigint)'),
      ('public.app_try_advisory_lock(bigint)'),
      ('public.can_modify_enrollments()'),
      ('public.format_date_mmddyyyy(text)'),
      ('public.format_phone(text)'),
      ('public.rls_auto_enable()')
  loop
    begin
      execute format('revoke execute on function %s from public, anon, authenticated;', fn_sig);
      execute format('grant execute on function %s to service_role;', fn_sig);
    exception
      when undefined_function then
        null;
    end;
  end loop;
end $$;

commit;
