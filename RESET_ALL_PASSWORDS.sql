-- ============================================================================
-- Reset All User Passwords to Welcome123! (Except Super Admin)
-- ============================================================================
-- This script sets all agent and admin passwords to Welcome123!
-- Super admin (michael@mypremierplans.com) is excluded
-- ============================================================================

DO $$
DECLARE
  temp_password text := 'Welcome123!';
  encrypted_password text;
  updated_count integer := 0;
BEGIN
  -- Generate encrypted password using bcrypt
  encrypted_password := crypt(temp_password, gen_salt('bf'));
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Resetting passwords to: %', temp_password;
  RAISE NOTICE '========================================';
  
  -- Update all users in auth.users except super admin
  UPDATE auth.users
  SET 
    encrypted_password = encrypted_password,
    updated_at = NOW()
  WHERE 
    email != 'michael@mypremierplans.com'
    AND email IN (
      SELECT email FROM public.users 
      WHERE role IN ('admin', 'agent')
    );
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RAISE NOTICE '✅ Updated % user passwords in auth.users', updated_count;
  
  -- Update public.users to require password change on next login
  UPDATE public.users
  SET 
    password_change_required = true,
    updated_at = NOW()
  WHERE 
    email != 'michael@mypremierplans.com'
    AND role IN ('admin', 'agent');
  
  RAISE NOTICE '✅ Set password_change_required flag for all users';
  RAISE NOTICE '========================================';
  
END $$;

-- Verification: List all users whose passwords were reset
SELECT 
  au.email,
  pu.first_name || ' ' || pu.last_name as full_name,
  pu.role,
  pu.agent_number,
  CASE 
    WHEN au.email = 'michael@mypremierplans.com' THEN 'Super Admin (NOT CHANGED)'
    ELSE 'Password Reset to Welcome123!'
  END as password_status
FROM auth.users au
LEFT JOIN public.users pu ON au.email = pu.email
WHERE pu.role IN ('admin', 'agent', 'super_admin')
ORDER BY 
  CASE pu.role
    WHEN 'super_admin' THEN 1
    WHEN 'admin' THEN 2
    WHEN 'agent' THEN 3
  END,
  pu.agent_number;

-- ============================================================================
-- IMPORTANT NOTES:
-- 1. All users except Michael will have password: Welcome123!
-- 2. Users should be prompted to change password on first login (see code changes)
-- 3. Super admin (michael@mypremierplans.com) password remains unchanged
-- ============================================================================
