-- Allow Public Lead Submission Without Authentication
-- This enables the contact form to work for the general public

-- Enable RLS on leads table
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Drop any existing restrictive policies
DROP POLICY IF EXISTS "Leads insert policy" ON leads;
DROP POLICY IF EXISTS "Leads select policy" ON leads;
DROP POLICY IF EXISTS "Leads update policy" ON leads;
DROP POLICY IF EXISTS "Leads delete policy" ON leads;
DROP POLICY IF EXISTS "Block direct access" ON leads;
DROP POLICY IF EXISTS "Allow public lead submission" ON leads;
DROP POLICY IF EXISTS "Agents and admins can view leads" ON leads;
DROP POLICY IF EXISTS "Admins can update leads" ON leads;
DROP POLICY IF EXISTS "Admins can delete leads" ON leads;

-- Allow public to insert leads (no auth required for contact form)
CREATE POLICY "Allow public lead submission" ON leads
    FOR INSERT
    WITH CHECK (true); -- Anyone can submit a lead

-- Only authenticated agents and admins can view leads
CREATE POLICY "Agents and admins can view leads" ON leads
    FOR SELECT
    USING (
        -- Service role has full access
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        -- Authenticated agents can see their assigned leads
        (auth.uid() IS NOT NULL AND (
            assigned_agent_id = auth.uid()::text
            OR
            -- Admins can see all leads
            auth.jwt() ->> 'role' IN ('admin', 'super_admin')
        ))
    );

-- Only admins can update leads
CREATE POLICY "Admins can update leads" ON leads
    FOR UPDATE
    USING (
        -- Service role can update
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        -- Admins can update
        (auth.uid() IS NOT NULL AND auth.jwt() ->> 'role' IN ('admin', 'super_admin'))
    )
    WITH CHECK (
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        (auth.uid() IS NOT NULL AND auth.jwt() ->> 'role' IN ('admin', 'super_admin'))
    );

-- Only admins can delete leads
CREATE POLICY "Admins can delete leads" ON leads
    FOR DELETE
    USING (
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        (auth.uid() IS NOT NULL AND auth.jwt() ->> 'role' IN ('admin', 'super_admin'))
    );

-- Verify policies
SELECT tablename, policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE tablename = 'leads'
ORDER BY policyname;
