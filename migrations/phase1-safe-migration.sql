-- Phase 1: Safe Migration to New Commission System
-- Creates new agent_commissions table alongside existing commissions table
-- This is a ZERO-RISK migration that doesn't affect existing functionality

-- Step 1: Create the new agent_commissions table with clean schema
-- NOTE: No foreign key constraints initially since we're using UUIDs for new system
CREATE TABLE IF NOT EXISTS agent_commissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Agent and member relationships (using clean UUIDs - no FK constraints)
    agent_id TEXT NOT NULL,  -- Will store UUID strings, mapped in application
    member_id TEXT NOT NULL, -- Will store UUID strings, mapped in application
    
    -- Optional relationships for tracking  
    lead_id TEXT,            -- Will store UUID strings if needed
    enrollment_id TEXT,      -- Will store enrollment reference
    
    -- Commission details
    commission_amount DECIMAL(10,2) NOT NULL CHECK (commission_amount >= 0),
    coverage_type TEXT NOT NULL CHECK (coverage_type IN ('aca', 'medicare_advantage', 'medicare_supplement', 'lis', 'other')),
    
    -- Policy information
    policy_number TEXT,
    carrier TEXT,
    
    -- Commission calculation metadata
    commission_percentage DECIMAL(5,2) CHECK (commission_percentage >= 0 AND commission_percentage <= 100),
    base_premium DECIMAL(10,2) CHECK (base_premium >= 0),
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'denied', 'cancelled')),
    payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'processing', 'paid', 'failed', 'cancelled')),
    
    -- EPX integration
    epx_commission_id TEXT,
    epx_transaction_id TEXT,
    
    -- Additional information
    notes TEXT,
    
    -- Timestamps
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Step 2: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_commissions_agent_id ON agent_commissions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_member_id ON agent_commissions(member_id);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_status ON agent_commissions(status);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_payment_status ON agent_commissions(payment_status);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_created_at ON agent_commissions(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_enrollment_id ON agent_commissions(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_coverage_type ON agent_commissions(coverage_type);

-- Step 3: Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop trigger if it exists and recreate
DROP TRIGGER IF EXISTS update_agent_commissions_updated_at ON agent_commissions;
CREATE TRIGGER update_agent_commissions_updated_at 
    BEFORE UPDATE ON agent_commissions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 4: Enable Row Level Security (RLS)
ALTER TABLE agent_commissions ENABLE ROW LEVEL SECURITY;

-- Step 5: Create RLS policies for secure access

-- Policy for agents to see only their own commissions
CREATE POLICY "Agents can view own commissions" ON agent_commissions 
    FOR SELECT 
    USING (
        agent_id = auth.uid()::text OR 
        auth.jwt() ->> 'role' IN ('admin', 'super_admin')
    );

-- Policy for admins to see all commissions
CREATE POLICY "Admins can view all commissions" ON agent_commissions 
    FOR SELECT 
    USING (auth.jwt() ->> 'role' IN ('admin', 'super_admin'));

-- Policy for commission creation (agents and admins)
CREATE POLICY "Agents and admins can create commissions" ON agent_commissions 
    FOR INSERT 
    WITH CHECK (
        auth.jwt() ->> 'role' IN ('agent', 'admin', 'super_admin')
    );

-- Policy for commission updates (admins only)
CREATE POLICY "Admins can update commissions" ON agent_commissions 
    FOR UPDATE 
    USING (auth.jwt() ->> 'role' IN ('admin', 'super_admin'))
    WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'super_admin'));

-- Step 6: Enable real-time subscriptions for the new table
ALTER PUBLICATION supabase_realtime ADD TABLE agent_commissions;

-- Step 7: Create a view for easier querying with joined data
-- NOTE: Joins using text casting since we're using UUID strings
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

-- Step 8: Grant appropriate permissions
GRANT SELECT, INSERT, UPDATE ON agent_commissions TO authenticated;
GRANT SELECT ON agent_commissions_with_details TO authenticated;

-- Verification queries (run these to confirm everything is working)
-- SELECT COUNT(*) FROM agent_commissions; -- Should return 0 (empty table)
-- SELECT tablename FROM pg_tables WHERE tablename = 'agent_commissions'; -- Should return the table name
-- \d agent_commissions; -- Shows table structure

-- Phase 1 Complete! 
-- Next: Implement dual-write logic in application code
-- The existing commissions table remains untouched and fully functional