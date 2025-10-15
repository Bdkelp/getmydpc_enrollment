-- Add missing columns to members table for confirmation page
-- These columns are needed to display accurate enrollment confirmation information

ALTER TABLE members 
  ADD COLUMN IF NOT EXISTS plan_id INTEGER,
  ADD COLUMN IF NOT EXISTS coverage_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS total_monthly_price DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS add_rx_valet BOOLEAN DEFAULT false;

-- Add comment to document the columns
COMMENT ON COLUMN members.plan_id IS 'Reference to the plan selected during enrollment';
COMMENT ON COLUMN members.coverage_type IS 'Type of coverage: individual, member+spouse, member+child, family';
COMMENT ON COLUMN members.total_monthly_price IS 'Total monthly price including all fees and add-ons';
COMMENT ON COLUMN members.add_rx_valet IS 'Whether the member added Rx Valet prescription savings';

-- Verify columns were added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'members'
  AND column_name IN ('plan_id', 'coverage_type', 'total_monthly_price', 'add_rx_valet')
ORDER BY ordinal_position;
