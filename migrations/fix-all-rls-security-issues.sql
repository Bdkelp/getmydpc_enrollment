-- Fix All RLS Security Issues Identified in Supabase Security Advisor
-- This addresses both agent_commissions and users table RLS policy issues

-- ========== FIX 1: Agent Commissions View Security ==========
-- Drop and recreate the view without SECURITY DEFINER to avoid policy conflicts
DROP VIEW IF EXISTS agent_commissions_with_details;

-- Create a safer view without SECURITY DEFINER
CREATE OR REPLACE VIEW agent_commissions_with_details AS
SELECT 
    ac.*,
    agent.email as agent_email,
    agent.first_name as agent_first_name,
    agent.last_name as agent_last_name,
    member.email as member_email,
    member.first_name as member_first_name,
    member.last_name as member_last_name
FROM agent_commissions ac
LEFT JOIN users agent ON ac.agent_id = agent.id::text
LEFT JOIN users member ON ac.member_id = member.id::text;

-- Grant appropriate permissions (this view inherits RLS policies from underlying tables)
GRANT SELECT ON agent_commissions_with_details TO authenticated;

-- ========== FIX 2: Enable RLS on Users Table ==========
-- Enable RLS on users table to fix the security warning
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Allow user creation" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Admins can delete users" ON users;

-- Create comprehensive RLS policies for users table
-- Policy 1: Users can see their own profile
CREATE POLICY "Users can view own profile" ON users 
    FOR SELECT 
    USING (
        -- Service role has full access
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        -- Users can see their own data (cast UUID to text for comparison)
        (auth.uid()::text = id::text)
        OR
        -- Admins can see all users
        (auth.jwt() ->> 'role' IN ('admin', 'super_admin'))
    );

-- Policy 2: Allow user creation (signup)
CREATE POLICY "Allow user creation" ON users 
    FOR INSERT 
    WITH CHECK (
        -- Service role can create users
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        -- Allow public signup (new users)
        auth.uid() IS NULL
        OR
        -- Allow authenticated users to create (admin functions)
        (auth.uid() IS NOT NULL AND auth.jwt() ->> 'role' IN ('admin', 'super_admin'))
    );

-- Policy 3: Users can update their own profile
CREATE POLICY "Users can update own profile" ON users 
    FOR UPDATE 
    USING (
        -- Service role can update any user
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        -- Users can update their own profile (cast UUID to text for comparison)
        (auth.uid()::text = id::text)
        OR
        -- Admins can update any user
        (auth.jwt() ->> 'role' IN ('admin', 'super_admin'))
    )
    WITH CHECK (
        -- Service role can update any user
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        -- Users can update their own profile (cast UUID to text for comparison)
        (auth.uid()::text = id::text)
        OR
        -- Admins can update any user
        (auth.jwt() ->> 'role' IN ('admin', 'super_admin'))
    );

-- Policy 4: Only admins can delete users
CREATE POLICY "Admins can delete users" ON users 
    FOR DELETE 
    USING (
        -- Service role can delete users
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        -- Admins can delete users
        (auth.jwt() ->> 'role' IN ('admin', 'super_admin'))
    );

-- ========== FIX 3: Update Agent Commissions RLS Policies ==========
-- Drop ALL existing policies (old and new names)
DROP POLICY IF EXISTS "Allow select for service role and authenticated users" ON agent_commissions;
DROP POLICY IF EXISTS "Allow insert for service role and authenticated users" ON agent_commissions;
DROP POLICY IF EXISTS "Allow update for service role and admins" ON agent_commissions;
DROP POLICY IF EXISTS "Allow delete for service role and admins" ON agent_commissions;
DROP POLICY IF EXISTS "Agent commissions select policy" ON agent_commissions;
DROP POLICY IF EXISTS "Agent commissions insert policy" ON agent_commissions;
DROP POLICY IF EXISTS "Agent commissions update policy" ON agent_commissions;
DROP POLICY IF EXISTS "Agent commissions delete policy" ON agent_commissions;
DROP POLICY IF EXISTS "Admins can update commissions" ON agent_commissions;
DROP POLICY IF EXISTS "Admins can view all commissions" ON agent_commissions;
DROP POLICY IF EXISTS "Agents and admins can create commissions" ON agent_commissions;
DROP POLICY IF EXISTS "Agents can view own commissions" ON agent_commissions;

-- Create improved policies that handle service role properly
CREATE POLICY "Agent commissions select policy" ON agent_commissions 
    FOR SELECT 
    USING (
        -- Always allow service role (bypasses RLS for server operations)
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        -- Authenticated users based on role and ownership
        (
            auth.uid() IS NOT NULL 
            AND (
                -- Agents can see their own commissions (agent_id is TEXT, auth.uid() is UUID)
                (agent_id = auth.uid()::text)
                OR
                -- Admins can see all commissions  
                (auth.jwt() ->> 'role' IN ('admin', 'super_admin'))
            )
        )
    );

CREATE POLICY "Agent commissions insert policy" ON agent_commissions 
    FOR INSERT 
    WITH CHECK (
        -- Always allow service role
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        -- Authenticated users with proper roles can create commissions
        (
            auth.uid() IS NOT NULL 
            AND auth.jwt() ->> 'role' IN ('agent', 'admin', 'super_admin')
        )
    );

CREATE POLICY "Agent commissions update policy" ON agent_commissions 
    FOR UPDATE 
    USING (
        -- Service role can update anything
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        -- Admins can update any commission
        (
            auth.uid() IS NOT NULL 
            AND auth.jwt() ->> 'role' IN ('admin', 'super_admin')
        )
    )
    WITH CHECK (
        -- Service role can update anything
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        -- Admins can update any commission
        (
            auth.uid() IS NOT NULL 
            AND auth.jwt() ->> 'role' IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Agent commissions delete policy" ON agent_commissions 
    FOR DELETE 
    USING (
        -- Service role can delete anything
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        -- Only admins can delete commissions
        (
            auth.uid() IS NOT NULL 
            AND auth.jwt() ->> 'role' IN ('admin', 'super_admin')
        )
    );

-- ========== VERIFICATION QUERIES ==========
-- Run these to verify the policies are working correctly

-- Check users table RLS is enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('users', 'agent_commissions')
AND schemaname = 'public';

-- Check all policies are created correctly
SELECT schemaname, tablename, policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE tablename IN ('users', 'agent_commissions')
ORDER BY tablename, policyname;

-- Test that service role can access data (this should work)
-- SELECT COUNT(*) FROM agent_commissions; 
-- SELECT COUNT(*) FROM users;