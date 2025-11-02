-- Add created_by field to users table for audit trail tracking
-- This field stores the UUID of the admin user who created the account

-- Step 1: Add the created_by column if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);

-- Step 2: Add index for efficient audit trail queries
CREATE INDEX IF NOT EXISTS idx_users_created_by ON public.users (created_by);

-- Step 3: Update existing records to track creation (if approvedBy is set, use that as proxy for who created them)
-- This is optional - only do if you want to backfill existing data
-- UPDATE users SET created_by = approved_by WHERE created_by IS NULL AND approved_by IS NOT NULL;

-- Audit trail queries:
-- 1. Find all users created by a specific admin:
-- SELECT email, first_name, last_name, created_at FROM users WHERE created_by = 'admin-uuid-here' ORDER BY created_at DESC;

-- 2. Count users created by each admin:
-- SELECT u.first_name as admin_name, COUNT(*) as users_created FROM users u LEFT JOIN users creators ON u.created_by = creators.id WHERE u.created_by IS NOT NULL GROUP BY u.created_by ORDER BY users_created DESC;

-- 3. Get user creation details with creator info:
-- SELECT u.email, u.first_name, u.last_name, u.role, creators.first_name as created_by_admin, u.created_at FROM users u LEFT JOIN users creators ON u.created_by = creators.id WHERE u.email = 'user@example.com';

-- 4. Recent user creations (last 20):
-- SELECT u.email, u.role, creators.first_name as created_by_admin, u.created_at FROM users u LEFT JOIN users creators ON u.created_by = creators.id WHERE u.created_by IS NOT NULL ORDER BY u.created_at DESC LIMIT 20;
