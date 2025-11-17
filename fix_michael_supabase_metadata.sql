-- Fix Michael's role in Supabase auth.users metadata
-- This updates the JWT token metadata so super_admin role is properly set

-- Update user_metadata in Supabase auth.users table
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  raw_user_meta_data,
  '{role}',
  '"super_admin"'
)
WHERE email = 'michael@mypremierplans.com';

-- Verify the update
SELECT 
  id,
  email,
  raw_user_meta_data->>'role' as metadata_role,
  raw_user_meta_data
FROM auth.users
WHERE email = 'michael@mypremierplans.com';
