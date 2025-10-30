-- Phase 1: Safe Commission Migration - Add New Table Only
-- This script creates the new agent_commissions table WITHOUT touching the existing commissions table
-- The old system continues to work normally while we build the new one

-- Step 1: Create the new clean agent_commissions table
-- (The old 'commissions' table is left untouched)
CREATE TABLE IF NOT EXISTS agent_commissions (
  id SERIAL PRIMARY KEY,
  
  -- Core References (simple and clear)
  agent_id TEXT NOT NULL REFERENCES users(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  subscription_id INTEGER REFERENCES subscriptions(id),
  
  -- Commission Details
  commission_amount DECIMAL(10,2) NOT NULL,
  plan_cost DECIMAL(10,2) NOT NULL,
  plan_name TEXT NOT NULL,
  coverage_type TEXT NOT NULL,
  
  -- Status Tracking
  status TEXT NOT NULL DEFAULT 'pending',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  
  -- Timestamps
  enrollment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_date TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('pending', 'active', 'cancelled')),
  CONSTRAINT valid_payment_status CHECK (payment_status IN ('unpaid', 'paid', 'cancelled')),
  CONSTRAINT valid_coverage CHECK (coverage_type IN ('Individual', 'Couple', 'Children', 'Adult/Minor'))
);

-- Step 2: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_commissions_agent_id ON agent_commissions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_member_id ON agent_commissions(member_id);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_payment_status ON agent_commissions(payment_status);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_enrollment_date ON agent_commissions(enrollment_date);

-- Step 3: Enable RLS (Row Level Security) for agent access
ALTER TABLE agent_commissions ENABLE ROW LEVEL SECURITY;

-- Policy: Agents can only see their own commissions
DROP POLICY IF EXISTS agent_commissions_agent_access ON agent_commissions;
CREATE POLICY agent_commissions_agent_access ON agent_commissions
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'authenticated' AND (
      -- Agents can see their own commissions
      agent_id = auth.jwt() ->> 'sub' OR
      -- Service role can see all
      auth.jwt() ->> 'role' = 'service_role' OR
      -- Admins can see all commissions
      EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = auth.jwt() ->> 'sub' 
        AND users.role IN ('admin', 'super_admin')
      )
    )
  );

-- Step 4: Enable real-time for the new table
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS agent_commissions;

-- Step 5: Create a view for easier access with joins
CREATE OR REPLACE VIEW commission_details_v2 AS
SELECT 
  ac.id,
  ac.agent_id,
  ac.member_id,
  ac.subscription_id,
  ac.commission_amount,
  ac.plan_cost,
  ac.plan_name,
  ac.coverage_type,
  ac.status,
  ac.payment_status,
  ac.enrollment_date,
  ac.paid_date,
  -- Agent details
  u.first_name as agent_first_name,
  u.last_name as agent_last_name,
  u.agent_number,
  -- Member details
  m.first_name as member_first_name,
  m.last_name as member_last_name,
  m.email as member_email
FROM agent_commissions ac
JOIN users u ON ac.agent_id = u.id
JOIN members m ON ac.member_id = m.id;

-- Step 6: Grant appropriate permissions
GRANT ALL ON agent_commissions TO authenticated;
GRANT ALL ON commission_details_v2 TO authenticated;
GRANT USAGE ON SEQUENCE agent_commissions_id_seq TO authenticated;

-- Step 7: Verify both tables exist
SELECT 
  'agent_commissions' as new_table,
  COUNT(*) as record_count 
FROM agent_commissions
UNION ALL
SELECT 
  'commissions' as old_table,
  COUNT(*) as record_count 
FROM commissions;

-- Confirmation
SELECT 'Phase 1 Complete: New agent_commissions table created. Old commissions table preserved.' as status;