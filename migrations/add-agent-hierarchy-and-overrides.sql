-- Add agent hierarchy and override commission structure
-- Run this migration on Supabase

-- Add upline tracking to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS upline_agent_id TEXT REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS override_commission_rate DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS hierarchy_level INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS can_receive_overrides BOOLEAN DEFAULT false;

-- Create agent hierarchy history table to track changes
CREATE TABLE IF NOT EXISTS agent_hierarchy_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    previous_upline_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    new_upline_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    changed_by_admin_id TEXT REFERENCES users(id),
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for upline lookups
CREATE INDEX IF NOT EXISTS idx_users_upline_agent_id 
ON users(upline_agent_id) 
WHERE upline_agent_id IS NOT NULL;

-- Create index for hierarchy history
CREATE INDEX IF NOT EXISTS idx_agent_hierarchy_history_agent_id 
ON agent_hierarchy_history(agent_id);

-- Add override commission configuration table
CREATE TABLE IF NOT EXISTS agent_override_config (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    override_amount DECIMAL(10,2) NOT NULL DEFAULT 5.00 CHECK (override_amount >= 1.00 AND override_amount <= 10.00),
    override_type TEXT NOT NULL DEFAULT 'fixed' CHECK (override_type IN ('fixed', 'percentage')),
    override_percentage DECIMAL(5,2),
    effective_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(agent_id)
);

-- Add comments for documentation
COMMENT ON COLUMN users.upline_agent_id IS 'The agent ID of the upline agent (manager/supervisor)';
COMMENT ON COLUMN users.override_commission_rate IS 'Fixed override commission amount (e.g., $5 or $10) paid to upline for this agents sales';
COMMENT ON COLUMN users.hierarchy_level IS 'Level in agent hierarchy (0=top level, 1=first level downline, etc.)';
COMMENT ON COLUMN users.can_receive_overrides IS 'True if this agent can receive override commissions from downline agents';

COMMENT ON TABLE agent_hierarchy_history IS 'Tracks all changes to agent upline/downline relationships for audit purposes';

COMMENT ON TABLE agent_override_config IS 'Stores custom override commission configuration per agent (range: $1-$10 per enrollment, based on contract level)';
COMMENT ON COLUMN agent_override_config.override_amount IS 'Fixed dollar amount per enrollment ($1-$10 range, varies by contract level)';

-- Function to automatically update hierarchy level when upline changes
CREATE OR REPLACE FUNCTION update_agent_hierarchy_level()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.upline_agent_id IS NULL THEN
        NEW.hierarchy_level := 0;
    ELSE
        SELECT COALESCE(hierarchy_level, 0) + 1 
        INTO NEW.hierarchy_level
        FROM users 
        WHERE id = NEW.upline_agent_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for hierarchy level updates
DROP TRIGGER IF EXISTS trg_update_hierarchy_level ON users;
CREATE TRIGGER trg_update_hierarchy_level
    BEFORE INSERT OR UPDATE OF upline_agent_id ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_hierarchy_level();

-- Add manual payment verification flag to agent_commissions
ALTER TABLE agent_commissions
ADD COLUMN IF NOT EXISTS manual_verification_required BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS manually_verified_by TEXT REFERENCES users(id),
ADD COLUMN IF NOT EXISTS manually_verified_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN agent_commissions.manual_verification_required IS 'True if payment needs manual verification (EPX callback failed or manual entry)';
COMMENT ON COLUMN agent_commissions.manually_verified_by IS 'Admin user ID who manually verified the payment';

-- Create view for agent downlines (makes querying easier)
CREATE OR REPLACE VIEW agent_downlines AS
SELECT 
    u.id as upline_agent_id,
    u.email as upline_email,
    u.agent_number as upline_agent_number,
    d.id as downline_agent_id,
    d.email as downline_email,
    d.agent_number as downline_agent_number,
    d.hierarchy_level,
    COALESCE(aoc.override_amount, u.override_commission_rate, 5.00) as override_rate,
    aoc.override_type,
    d.created_at as downline_since
FROM users u
INNER JOIN users d ON d.upline_agent_id = u.id
LEFT JOIN agent_override_config aoc ON aoc.agent_id = u.id
WHERE u.role = 'agent' AND d.role = 'agent';

COMMENT ON VIEW agent_downlines IS 'Easy view of agent upline/downline relationships with override rates';
