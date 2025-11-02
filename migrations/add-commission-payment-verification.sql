-- Add fields for payment verification and commission rules
-- Run this migration on Supabase

-- Add payment verification fields to agent_commissions
ALTER TABLE agent_commissions
ADD COLUMN IF NOT EXISTS payment_captured BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS payment_intent_id TEXT,
ADD COLUMN IF NOT EXISTS payment_captured_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS eligible_for_payout_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS commission_type TEXT DEFAULT 'direct' CHECK (commission_type IN ('direct', 'override')),
ADD COLUMN IF NOT EXISTS override_for_agent_id TEXT,
ADD COLUMN IF NOT EXISTS clawback_reason TEXT,
ADD COLUMN IF NOT EXISTS clawback_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_clawed_back BOOLEAN DEFAULT false;

-- Create index for payment verification queries
CREATE INDEX IF NOT EXISTS idx_agent_commissions_payment_captured 
ON agent_commissions(payment_captured);

CREATE INDEX IF NOT EXISTS idx_agent_commissions_eligible_for_payout 
ON agent_commissions(eligible_for_payout_at) 
WHERE payment_status = 'unpaid';

CREATE INDEX IF NOT EXISTS idx_agent_commissions_commission_type 
ON agent_commissions(commission_type);

-- Add comment explaining the 14-day rule
COMMENT ON COLUMN agent_commissions.eligible_for_payout_at IS 'Commission becomes eligible for payout 14 days after payment is captured (grace period for cancellations)';

COMMENT ON COLUMN agent_commissions.commission_type IS 'direct = commission for agent who made the sale, override = commission for upline agent';

COMMENT ON COLUMN agent_commissions.payment_captured IS 'True if the member payment was successfully captured via Stripe/EPX';
