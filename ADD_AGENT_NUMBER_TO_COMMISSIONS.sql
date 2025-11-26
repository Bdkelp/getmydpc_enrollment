-- Add agent_number column to agent_commissions table for proper agent tracking
-- This allows commissions to be tracked by agent number (MPP00001, etc.) instead of just UUID

-- Add the column if it doesn't exist
ALTER TABLE agent_commissions 
ADD COLUMN IF NOT EXISTS agent_number TEXT;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_agent_commissions_agent_number 
ON agent_commissions(agent_number);

-- Backfill agent_number from users table for existing records
UPDATE agent_commissions ac
SET agent_number = u.agent_number
FROM users u
WHERE ac.agent_id = u.id::text
  AND ac.agent_number IS NULL
  AND u.agent_number IS NOT NULL;

-- Show stats
SELECT 
  COUNT(*) as total_commissions,
  COUNT(agent_number) as with_agent_number,
  COUNT(*) - COUNT(agent_number) as missing_agent_number
FROM agent_commissions;

-- Show sample commissions with agent numbers
SELECT 
  id,
  agent_id,
  agent_number,
  member_id,
  commission_amount,
  status,
  payment_status,
  created_at
FROM agent_commissions
ORDER BY created_at DESC
LIMIT 10;
