
-- Update the approval_status column to support 'suspended' status
-- This allows for proper tracking of user suspension vs rejection

-- Add check constraint to ensure valid approval statuses
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_approval_status_check;
ALTER TABLE users ADD CONSTRAINT users_approval_status_check 
  CHECK (approval_status IN ('pending', 'approved', 'rejected', 'suspended'));

-- Add check constraint for subscription status to include suspended
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check 
  CHECK (status IN ('active', 'cancelled', 'suspended', 'pending'));

-- Create index for faster queries on suspended users
CREATE INDEX IF NOT EXISTS idx_users_approval_status ON users(approval_status);
CREATE INDEX IF NOT EXISTS idx_users_active_status ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
