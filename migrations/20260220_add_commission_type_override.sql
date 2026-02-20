-- Add commission_type and override tracking to agent_commissions and commission_payouts
-- This supports downline/upline commission structures where upline agents get override commissions

-- Add fields to agent_commissions if they don't exist
ALTER TABLE agent_commissions
ADD COLUMN IF NOT EXISTS commission_type TEXT DEFAULT 'direct';

ALTER TABLE agent_commissions
ADD COLUMN IF NOT EXISTS override_for_agent_id TEXT REFERENCES users(id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_commissions_commission_type 
ON agent_commissions(commission_type);

CREATE INDEX IF NOT EXISTS idx_agent_commissions_override_for 
ON agent_commissions(override_for_agent_id);

-- Add fields to commission_payouts if they don't exist
ALTER TABLE commission_payouts
ADD COLUMN IF NOT EXISTS commission_type TEXT DEFAULT 'direct';

ALTER TABLE commission_payouts
ADD COLUMN IF NOT EXISTS override_for_agent_id TEXT;

-- Add comments
COMMENT ON COLUMN agent_commissions.commission_type IS 'Type of commission: direct (earned by enrolling agent) or override (earned by upline agent for downline sales)';
COMMENT ON COLUMN agent_commissions.override_for_agent_id IS 'If commission_type is override, this is the downline agent ID whose sale generated the override';

COMMENT ON COLUMN commission_payouts.commission_type IS 'Type of commission payout: direct or override';
COMMENT ON COLUMN commission_payouts.override_for_agent_id IS 'If commission_type is override, this is the downline agent ID';

-- Update existing records to mark them as 'direct' if NULL
UPDATE agent_commissions
SET commission_type = 'direct'
WHERE commission_type IS NULL;

UPDATE commission_payouts
SET commission_type = 'direct'
WHERE commission_type IS NULL;
