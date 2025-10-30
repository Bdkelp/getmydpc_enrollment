-- CORRECTED MIGRATION: New UUID-based commission system
-- Copy and paste this entire block into Supabase SQL Editor

CREATE TABLE IF NOT EXISTS agent_commissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Agent and member IDs (stored as text for UUID compatibility)
    agent_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    
    -- Optional tracking references
    lead_id TEXT,
    enrollment_id TEXT,
    
    -- Commission details
    commission_amount DECIMAL(10,2) NOT NULL CHECK (commission_amount >= 0),
    coverage_type TEXT NOT NULL DEFAULT 'other' CHECK (coverage_type IN ('aca', 'medicare_advantage', 'medicare_supplement', 'lis', 'other')),
    
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

-- Create essential indexes
CREATE INDEX IF NOT EXISTS idx_agent_commissions_agent_id ON agent_commissions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_member_id ON agent_commissions(member_id);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_created_at ON agent_commissions(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_status ON agent_commissions(status);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_payment_status ON agent_commissions(payment_status);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_agent_commissions_updated_at ON agent_commissions;
CREATE TRIGGER update_agent_commissions_updated_at 
    BEFORE UPDATE ON agent_commissions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE agent_commissions ENABLE ROW LEVEL SECURITY;

-- RLS policies (agents see own commissions, admins see all)
CREATE POLICY "agent_commissions_policy" ON agent_commissions 
FOR ALL 
USING (
    agent_id = auth.uid()::text OR 
    auth.jwt() ->> 'role' IN ('admin', 'super_admin')
);

-- Enable real-time subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE agent_commissions;

-- Create view for easier querying
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
LEFT JOIN users agent ON ac.agent_id = agent.id
LEFT JOIN users member ON ac.member_id = member.id;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON agent_commissions TO authenticated;
GRANT SELECT ON agent_commissions_with_details TO authenticated;

-- Success message
SELECT 'NEW agent_commissions table created with UUID support!' as status, 
       'Ready for clean commission tracking system' as message;