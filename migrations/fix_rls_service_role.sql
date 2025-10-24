-- ============================================================
-- Fix RLS Blocking Service Role on Users Table
-- ============================================================
-- Problem: Service role is being blocked by RLS during login
-- Solution: Add explicit policy to allow service_role full access
-- ============================================================

-- Drop the overly restrictive policy on users table
DROP POLICY IF EXISTS "Block direct access" ON users;

-- Create a new policy that allows service_role but blocks public
CREATE POLICY "Allow service role access" ON users
    FOR ALL
    TO authenticated, anon
    USING (false)
    WITH CHECK (false);

-- Service role bypasses RLS by default, but let's ensure it
-- by creating a permissive policy for authenticated service role actions
CREATE POLICY "Allow backend operations" ON users
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Verify
DO $$
BEGIN
    RAISE NOTICE 'Updated RLS policy on users table';
    RAISE NOTICE 'Service role now has explicit full access';
    RAISE NOTICE 'Public/anon/authenticated users are blocked';
END $$;
