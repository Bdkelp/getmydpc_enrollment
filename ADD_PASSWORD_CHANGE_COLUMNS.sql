-- ============================================================================
-- Add Password Change Tracking to users table
-- ============================================================================

-- Add columns for password change tracking
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS password_change_required boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS last_password_change_at timestamptz;

-- Set password_change_required to true for all users except super admin
-- (They'll need to change password on next login)
UPDATE public.users
SET password_change_required = true
WHERE 
  email != 'michael@mypremierplans.com'
  AND role IN ('admin', 'agent');

-- Verify the changes
SELECT 
  email,
  first_name || ' ' || last_name as full_name,
  role,
  password_change_required,
  last_password_change_at
FROM public.users
WHERE role IN ('admin', 'agent', 'super_admin')
ORDER BY agent_number;

-- ============================================================================
-- After running this migration:
-- 1. Users will be prompted to change password on next login
-- 2. Backend will check password_change_required flag during authentication
-- 3. Frontend should show password change form when required
-- ============================================================================
