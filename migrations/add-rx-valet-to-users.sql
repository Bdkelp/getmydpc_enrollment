-- Add add_rx_valet column to users table
-- This column tracks whether a member has opted for the ProChoice Rx add-on ($21/month)

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS add_rx_valet BOOLEAN DEFAULT FALSE;

-- Add index for faster queries filtering by add_rx_valet
CREATE INDEX IF NOT EXISTS idx_users_add_rx_valet ON users(add_rx_valet);

-- Verify the column was added
SELECT 
    column_name, 
    data_type, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name = 'add_rx_valet';
