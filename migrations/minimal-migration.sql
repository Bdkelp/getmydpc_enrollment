-- MINIMAL MIGRATION: Just create the agent_commissions table
-- Copy and paste this entire block into Supabase SQL Editor

CREATE TABLE IF NOT EXISTS agent_commissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    enrollment_id UUID REFERENCES enrollments(id) ON DELETE SET NULL,
    commission_amount DECIMAL(10,2) NOT NULL CHECK (commission_amount >= 0),
    coverage_type TEXT NOT NULL DEFAULT 'other' CHECK (coverage_type IN ('aca', 'medicare_advantage', 'medicare_supplement', 'lis', 'other')),
    policy_number TEXT,
    carrier TEXT,
    commission_percentage DECIMAL(5,2) CHECK (commission_percentage >= 0 AND commission_percentage <= 100),
    base_premium DECIMAL(10,2) CHECK (base_premium >= 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'denied', 'cancelled')),
    payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'processing', 'paid', 'failed', 'cancelled')),
    epx_commission_id TEXT,
    epx_transaction_id TEXT,
    notes TEXT,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create essential indexes
CREATE INDEX IF NOT EXISTS idx_agent_commissions_agent_id ON agent_commissions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_member_id ON agent_commissions(member_id);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_created_at ON agent_commissions(created_at);

-- Enable RLS
ALTER TABLE agent_commissions ENABLE ROW LEVEL SECURITY;

-- Basic RLS policy (agents see own commissions, admins see all)
CREATE POLICY "agent_commissions_policy" ON agent_commissions 
FOR ALL 
USING (
    agent_id = auth.uid() OR 
    auth.jwt() ->> 'role' IN ('admin', 'super_admin')
);

-- Enable real-time
ALTER PUBLICATION supabase_realtime ADD TABLE agent_commissions;

-- Test query
SELECT 'agent_commissions table created successfully!' as status;