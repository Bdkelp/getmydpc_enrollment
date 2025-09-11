-- Fix infinite recursion in users table RLS policies
-- This error occurs when RLS policies reference themselves recursively

-- Step 1: Temporarily disable RLS on users table
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Step 2: Drop all existing policies on users table
DROP POLICY IF EXISTS "Enable read access for all users" ON public.users;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.users;
DROP POLICY IF EXISTS "Enable update for users based on id" ON public.users;
DROP POLICY IF EXISTS "Enable delete for users based on id" ON public.users;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Admins can update all users" ON public.users;
DROP POLICY IF EXISTS "Agents can view all users" ON public.users;
DROP POLICY IF EXISTS "Service role bypass" ON public.users;
DROP POLICY IF EXISTS "Allow service role full access" ON public.users;

-- Step 3: Create new, non-recursive policies
-- Allow authenticated users to read their own record
CREATE POLICY "Users can read own record" ON public.users
    FOR SELECT
    USING (auth.uid() = id);

-- Allow authenticated users to update their own record
CREATE POLICY "Users can update own record" ON public.users
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Allow service role full access (for backend operations)
CREATE POLICY "Service role has full access" ON public.users
    FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Step 4: Re-enable RLS with the new policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Step 5: Grant necessary permissions
GRANT ALL ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;

-- Verify the policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies 
WHERE tablename = 'users'
ORDER BY policyname;