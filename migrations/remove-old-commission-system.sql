-- Remove Old Commission System Completely
-- This removes all traces of the legacy commission system and Neon database references

-- ========== REMOVE LEGACY COMMISSION SYSTEM ==========
-- Drop old commissions table completely (if it exists)
DROP TABLE IF EXISTS commissions CASCADE;

-- Drop any related views or functions
DROP VIEW IF EXISTS commissions_with_details CASCADE;
DROP FUNCTION IF EXISTS calculate_commission(text, text, boolean) CASCADE;

-- ========== ENSURE ONLY AGENT_COMMISSIONS EXISTS ==========
-- Make sure agent_commissions table exists with proper structure
CREATE TABLE IF NOT EXISTS agent_commissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agent_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    enrollment_id TEXT,
    commission_amount DECIMAL(10,2) NOT NULL,
    coverage_type TEXT NOT NULL CHECK (coverage_type IN ('aca', 'medicare_advantage', 'medicare_supplement', 'other')),
    policy_number TEXT,
    carrier TEXT,
    commission_percentage DECIMAL(5,2),
    base_premium DECIMAL(10,2),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
    payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'partial')),
    payment_date TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on agent_commissions
ALTER TABLE agent_commissions ENABLE ROW LEVEL SECURITY;

-- Ensure proper indexes exist
CREATE INDEX IF NOT EXISTS idx_agent_commissions_agent_id ON agent_commissions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_member_id ON agent_commissions(member_id);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_status ON agent_commissions(status);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_created_at ON agent_commissions(created_at);

-- Create comprehensive RLS policies for agent_commissions
DROP POLICY IF EXISTS "Agent commissions select policy" ON agent_commissions;
DROP POLICY IF EXISTS "Agent commissions insert policy" ON agent_commissions;
DROP POLICY IF EXISTS "Agent commissions update policy" ON agent_commissions;
DROP POLICY IF EXISTS "Agent commissions delete policy" ON agent_commissions;

-- Create new policies that work with service role
CREATE POLICY "Agent commissions select policy" ON agent_commissions 
    FOR SELECT 
    USING (
        -- Service role has full access (for server operations)
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        -- Agents can see their own commissions
        (auth.uid() IS NOT NULL AND agent_id = auth.uid()::text)
        OR
        -- Admins can see all commissions  
        (auth.uid() IS NOT NULL AND auth.jwt() ->> 'role' IN ('admin', 'super_admin'))
    );

CREATE POLICY "Agent commissions insert policy" ON agent_commissions 
    FOR INSERT 
    WITH CHECK (
        -- Service role can create commissions (for server operations)
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        -- Authenticated users with proper roles can create commissions
        (auth.uid() IS NOT NULL AND auth.jwt() ->> 'role' IN ('agent', 'admin', 'super_admin'))
    );

CREATE POLICY "Agent commissions update policy" ON agent_commissions 
    FOR UPDATE 
    USING (
        -- Service role can update anything
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        -- Admins can update any commission
        (auth.uid() IS NOT NULL AND auth.jwt() ->> 'role' IN ('admin', 'super_admin'))
    )
    WITH CHECK (
        -- Service role can update anything
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        -- Admins can update any commission
        (auth.uid() IS NOT NULL AND auth.jwt() ->> 'role' IN ('admin', 'super_admin'))
    );

CREATE POLICY "Agent commissions delete policy" ON agent_commissions 
    FOR DELETE 
    USING (
        -- Service role can delete anything
        current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role'
        OR
        -- Only admins can delete commissions
        (auth.uid() IS NOT NULL AND auth.jwt() ->> 'role' IN ('admin', 'super_admin'))
    );

-- Create view for commission details (optional, for easier queries)
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

-- Grant permissions
GRANT SELECT ON agent_commissions TO authenticated;
GRANT SELECT ON agent_commissions_with_details TO authenticated;

-- ========== VERIFICATION ==========
-- Check that only agent_commissions table exists
SELECT 'agent_commissions' as table_name, COUNT(*) as record_count 
FROM agent_commissions;

-- List all policies on agent_commissions
SELECT policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE tablename = 'agent_commissions'
ORDER BY policyname;

COMMENT ON TABLE agent_commissions IS 'New unified commission system - replaces legacy commissions table';