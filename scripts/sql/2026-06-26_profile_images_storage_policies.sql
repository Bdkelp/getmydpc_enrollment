-- Ensure profile-images storage bucket and policies allow authenticated users
-- to upload/update/delete their own profile image under {auth.uid()}/...
-- Safe to run multiple times.

begin;

-- Create the bucket if missing (public read URLs are expected by the app).
insert into storage.buckets (id, name, public)
select 'profile-images', 'profile-images', true
where not exists (
  select 1 from storage.buckets where id = 'profile-images'
);

-- Remove potentially conflicting legacy policies.
drop policy if exists "Profile images are publicly readable" on storage.objects;
drop policy if exists "Authenticated users can upload profile images" on storage.objects;
drop policy if exists "Users can update own profile images" on storage.objects;
drop policy if exists "Users can delete own profile images" on storage.objects;
drop policy if exists "Public can view profile images vejz8c_0" on storage.objects;

-- Public can read objects in this bucket.
create policy "Profile images are publicly readable"
on storage.objects
for select
to public
using (bucket_id = 'profile-images');

-- Authenticated users can upload only into their own folder: {auth.uid()}/...
create policy "Authenticated users can upload profile images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Authenticated users can update only objects in their own folder.
create policy "Users can update own profile images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Authenticated users can delete only objects in their own folder.
create policy "Users can delete own profile images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;
