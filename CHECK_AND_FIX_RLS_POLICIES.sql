-- ============================================================================
-- Check existing RLS policies and clean up conflicts
-- ============================================================================

-- Step 1: Check what the existing "Allow user creation" policy does
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'users'
  AND policyname = 'Allow user creation';

-- Step 2: Drop the old conflicting policies that might be blocking service role
-- Keep only the service_role policies we just created
DROP POLICY IF EXISTS "Allow user creation" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;

-- Step 3: Verify remaining policies
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'users'
ORDER BY cmd, policyname;

-- ============================================================================
-- EXPLANATION:
-- The service_role policies we created should be sufficient.
-- Old policies like "Allow user creation" might have restrictive conditions
-- that conflict with the service role's ability to insert users.
-- ============================================================================
