-- Fix RLS Policies for Agent Commissions Table
-- This addresses the RLS policy errors when server-side code accesses agent_commissions table

-- Drop existing policies
DROP POLICY IF EXISTS "Agents can view own commissions" ON agent_commissions;
DROP POLICY IF EXISTS "Admins can view all commissions" ON agent_commissions;
DROP POLICY IF EXISTS "Agents and admins can create commissions" ON agent_commissions;
DROP POLICY IF EXISTS "Admins can update commissions" ON agent_commissions;

-- Create new policies that handle both service role and authenticated users

-- Policy 1: SELECT - Allow service role (for server-side operations) and authenticated users
CREATE POLICY "Allow select for service role and authenticated users" ON agent_commissions 
    FOR SELECT 
    USING (
        -- Service role has full access (for server-side operations)
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        -- Authenticated users can see based on role and ownership
        (
            auth.uid() IS NOT NULL 
            AND (
                -- Agents can see their own commissions
                (agent_id = auth.uid()::text)
                OR
                -- Admins can see all commissions  
                (auth.jwt() ->> 'role' IN ('admin', 'super_admin'))
            )
        )
    );

-- Policy 2: INSERT - Allow service role and authenticated users
CREATE POLICY "Allow insert for service role and authenticated users" ON agent_commissions 
    FOR INSERT 
    WITH CHECK (
        -- Service role has full access (for server-side operations)
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        -- Authenticated users with proper roles
        (
            auth.uid() IS NOT NULL 
            AND auth.jwt() ->> 'role' IN ('agent', 'admin', 'super_admin')
        )
    );

-- Policy 3: UPDATE - Allow service role and admin users
CREATE POLICY "Allow update for service role and admins" ON agent_commissions 
    FOR UPDATE 
    USING (
        -- Service role has full access (for server-side operations)
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        -- Admins can update any commission
        (
            auth.uid() IS NOT NULL 
            AND auth.jwt() ->> 'role' IN ('admin', 'super_admin')
        )
    )
    WITH CHECK (
        -- Service role has full access (for server-side operations)
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        -- Admins can update any commission
        (
            auth.uid() IS NOT NULL 
            AND auth.jwt() ->> 'role' IN ('admin', 'super_admin')
        )
    );

-- Policy 4: DELETE - Allow service role and admin users only
CREATE POLICY "Allow delete for service role and admins" ON agent_commissions 
    FOR DELETE 
    USING (
        -- Service role has full access (for server-side operations)
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        -- Admins can delete commissions
        (
            auth.uid() IS NOT NULL 
            AND auth.jwt() ->> 'role' IN ('admin', 'super_admin')
        )
    );

-- Verify policies are created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'agent_commissions'
ORDER BY policyname;