-- Add payment_eligible_date column to agent_commissions table
-- This tracks when a commission becomes eligible for payout (Friday after plan activation week ends)

ALTER TABLE agent_commissions
ADD COLUMN IF NOT EXISTS payment_eligible_date TIMESTAMP WITH TIME ZONE;

-- Add comment for documentation
COMMENT ON COLUMN agent_commissions.payment_eligible_date IS 'Date when commission becomes eligible for payout (calculated as Friday after week ends, Monday-Sunday). Can be overridden by admin/super_admin.';

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_agent_commissions_payment_eligible_date 
ON agent_commissions(payment_eligible_date);

-- Backfill payment_eligible_date for existing unpaid commissions
-- Calculate Friday after the Monday-Sunday week that includes the enrollment date
UPDATE agent_commissions
SET payment_eligible_date = (
  -- Find the Sunday ending the week that starts on the Monday of enrollment week
  DATE_TRUNC('week', created_at + INTERVAL '1 day')::date + INTERVAL '6 days'
  -- Then add 5 days to get to Friday
  + INTERVAL '5 days'
)::timestamp with time zone
WHERE payment_eligible_date IS NULL
  AND payment_status = 'unpaid';
