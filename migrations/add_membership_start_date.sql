-- Migration: Add Membership Start Date Fields
-- Purpose: Separate enrollment/billing dates from membership activation dates
-- 
-- Business Logic:
-- - enrollment_date: When customer enrolled/paid (variable, any day of month)
-- - first_payment_date: First payment date (same as enrollment_date)
-- - membership_start_date: When membership actually begins (1st or 15th only)
-- 
-- Status Logic:
-- - pending_activation: Enrolled but membership hasn't started yet
-- - active: Membership has started (membership_start_date reached)

-- Add new columns to members table
ALTER TABLE members 
  ADD COLUMN IF NOT EXISTS first_payment_date TIMESTAMP,
  ADD COLUMN IF NOT EXISTS membership_start_date TIMESTAMP;

-- Add comment for documentation
COMMENT ON COLUMN members.enrollment_date IS 'Date when customer enrolled and made first payment (variable, used for recurring billing)';
COMMENT ON COLUMN members.first_payment_date IS 'First payment date (same as enrollment_date, used to calculate recurring billing)';
COMMENT ON COLUMN members.membership_start_date IS 'Date when membership coverage actually begins (1st or 15th only)';

-- Update existing members to have consistent dates
-- For existing active members, set all dates to enrollment_date
UPDATE members
SET 
  first_payment_date = enrollment_date,
  membership_start_date = enrollment_date
WHERE first_payment_date IS NULL OR membership_start_date IS NULL;

-- Add index for activation scheduler queries
CREATE INDEX IF NOT EXISTS idx_members_pending_activation 
  ON members(status, membership_start_date) 
  WHERE status = 'pending_activation';

-- Add check constraint to ensure membership_start_date is on 1st or 15th
-- (Optional - can be enforced in application logic instead)
-- ALTER TABLE members 
--   ADD CONSTRAINT check_membership_start_date_valid 
--   CHECK (EXTRACT(DAY FROM membership_start_date) IN (1, 15));

COMMENT ON INDEX idx_members_pending_activation IS 'Optimizes daily membership activation scheduler queries';
