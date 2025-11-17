-- ============================================================
-- USERS TABLE CLEANUP - Remove Member-Specific Fields
-- ============================================================
-- Date: November 17, 2025
-- Purpose: Remove unnecessary member-specific fields from users table
--          Users table should ONLY contain staff (admin/agent) information
-- 
-- IMPORTANT: Run this in Supabase SQL Editor
-- ============================================================

-- Step 1: Create backup table (SAFETY FIRST!)
-- ============================================================
DO $$
BEGIN
  -- Drop backup table if it exists from a previous run
  DROP TABLE IF EXISTS users_backup_20251117;
  
  -- Create complete backup of users table
  CREATE TABLE users_backup_20251117 AS 
  SELECT * FROM users;
  
  RAISE NOTICE 'Backup table created: users_backup_20251117';
  RAISE NOTICE 'Backup contains % rows', (SELECT COUNT(*) FROM users_backup_20251117);
END $$;

-- Step 2: Add Agent Hierarchy Columns (if they don't exist)
-- ============================================================
DO $$
BEGIN
  -- Add upline_agent_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'upline_agent_id'
  ) THEN
    ALTER TABLE users ADD COLUMN upline_agent_id VARCHAR;
    RAISE NOTICE 'Added column: upline_agent_id';
  ELSE
    RAISE NOTICE 'Column already exists: upline_agent_id';
  END IF;

  -- Add hierarchy_level column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'hierarchy_level'
  ) THEN
    ALTER TABLE users ADD COLUMN hierarchy_level INTEGER DEFAULT 0;
    RAISE NOTICE 'Added column: hierarchy_level';
  ELSE
    RAISE NOTICE 'Column already exists: hierarchy_level';
  END IF;

  -- Add can_receive_overrides column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'can_receive_overrides'
  ) THEN
    ALTER TABLE users ADD COLUMN can_receive_overrides BOOLEAN DEFAULT FALSE;
    RAISE NOTICE 'Added column: can_receive_overrides';
  ELSE
    RAISE NOTICE 'Column already exists: can_receive_overrides';
  END IF;

  -- Add override_commission_rate column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'override_commission_rate'
  ) THEN
    ALTER TABLE users ADD COLUMN override_commission_rate DECIMAL(5,2) DEFAULT 0;
    RAISE NOTICE 'Added column: override_commission_rate';
  ELSE
    RAISE NOTICE 'Column already exists: override_commission_rate';
  END IF;
END $$;

-- Step 3: Show columns that will be removed
-- ============================================================
DO $$
DECLARE
  col RECORD;
  columns_to_remove TEXT[] := ARRAY[
    'stripe_customer_id',
    'stripe_subscription_id',
    'employer_name',
    'division_name',
    'member_type',
    'ssn',
    'date_of_hire',
    'plan_start_date',
    'enrolled_by_agent_id',
    'username',
    'password_hash',
    'email_verification_token',
    'reset_password_token',
    'reset_password_expiry',
    'google_id',
    'facebook_id',
    'apple_id',
    'microsoft_id',
    'linkedin_id',
    'twitter_id'
  ];
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Columns that will be removed:';
  RAISE NOTICE '============================================================';
  
  FOREACH col.column_name IN ARRAY columns_to_remove
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = col.column_name
    ) THEN
      RAISE NOTICE '  - %', col.column_name;
    END IF;
  END LOOP;
  
  RAISE NOTICE '============================================================';
END $$;

-- Step 4: Remove unnecessary columns
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE 'Starting column removal...';
  
  -- Stripe fields (not used - we use EPX)
  ALTER TABLE users DROP COLUMN IF EXISTS stripe_customer_id CASCADE;
  ALTER TABLE users DROP COLUMN IF EXISTS stripe_subscription_id CASCADE;
  RAISE NOTICE 'Removed Stripe columns';
  
  -- Member employment fields (belong in members table)
  ALTER TABLE users DROP COLUMN IF EXISTS employer_name CASCADE;
  ALTER TABLE users DROP COLUMN IF EXISTS division_name CASCADE;
  ALTER TABLE users DROP COLUMN IF EXISTS member_type CASCADE;
  ALTER TABLE users DROP COLUMN IF EXISTS ssn CASCADE;
  ALTER TABLE users DROP COLUMN IF EXISTS date_of_hire CASCADE;
  ALTER TABLE users DROP COLUMN IF EXISTS plan_start_date CASCADE;
  ALTER TABLE users DROP COLUMN IF EXISTS enrolled_by_agent_id CASCADE;
  RAISE NOTICE 'Removed member employment columns';
  
  -- Legacy auth fields (Supabase Auth handles this)
  ALTER TABLE users DROP COLUMN IF EXISTS username CASCADE;
  ALTER TABLE users DROP COLUMN IF EXISTS password_hash CASCADE;
  ALTER TABLE users DROP COLUMN IF EXISTS email_verification_token CASCADE;
  ALTER TABLE users DROP COLUMN IF EXISTS reset_password_token CASCADE;
  ALTER TABLE users DROP COLUMN IF EXISTS reset_password_expiry CASCADE;
  RAISE NOTICE 'Removed legacy auth columns';
  
  -- Social login fields (not implemented)
  ALTER TABLE users DROP COLUMN IF EXISTS google_id CASCADE;
  ALTER TABLE users DROP COLUMN IF EXISTS facebook_id CASCADE;
  ALTER TABLE users DROP COLUMN IF EXISTS apple_id CASCADE;
  ALTER TABLE users DROP COLUMN IF EXISTS microsoft_id CASCADE;
  ALTER TABLE users DROP COLUMN IF EXISTS linkedin_id CASCADE;
  ALTER TABLE users DROP COLUMN IF EXISTS twitter_id CASCADE;
  RAISE NOTICE 'Removed social login columns';
  
  RAISE NOTICE 'Column removal complete!';
END $$;

-- Step 5: Create indexes for performance
-- ============================================================
DO $$
BEGIN
  -- Index on upline_agent_id for hierarchy queries
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'users' AND indexname = 'idx_users_upline'
  ) THEN
    CREATE INDEX idx_users_upline ON users(upline_agent_id);
    RAISE NOTICE 'Created index: idx_users_upline';
  ELSE
    RAISE NOTICE 'Index already exists: idx_users_upline';
  END IF;

  -- Index on hierarchy_level for level-based queries
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'users' AND indexname = 'idx_users_hierarchy_level'
  ) THEN
    CREATE INDEX idx_users_hierarchy_level ON users(hierarchy_level);
    RAISE NOTICE 'Created index: idx_users_hierarchy_level';
  ELSE
    RAISE NOTICE 'Index already exists: idx_users_hierarchy_level';
  END IF;

  -- Index on agent_number (should already exist but verify)
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'users' AND indexname = 'idx_users_agent_number'
  ) THEN
    CREATE INDEX idx_users_agent_number ON users(agent_number);
    RAISE NOTICE 'Created index: idx_users_agent_number';
  ELSE
    RAISE NOTICE 'Index already exists: idx_users_agent_number';
  END IF;
END $$;

-- Step 6: Add foreign key constraint for upline_agent_id
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_users_upline_agent'
  ) THEN
    ALTER TABLE users 
      ADD CONSTRAINT fk_users_upline_agent 
      FOREIGN KEY (upline_agent_id) 
      REFERENCES users(id) 
      ON DELETE SET NULL;
    RAISE NOTICE 'Added foreign key constraint: fk_users_upline_agent';
  ELSE
    RAISE NOTICE 'Foreign key constraint already exists: fk_users_upline_agent';
  END IF;
END $$;

-- Step 7: Verify final table structure
-- ============================================================
DO $$
DECLARE
  col_count INTEGER;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'FINAL USERS TABLE STRUCTURE';
  RAISE NOTICE '============================================================';
  
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns 
  WHERE table_name = 'users';
  
  RAISE NOTICE 'Total columns: %', col_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Remaining columns:';
  
  FOR col_count IN (
    SELECT column_name, data_type
    FROM information_schema.columns 
    WHERE table_name = 'users'
    ORDER BY ordinal_position
  )
  LOOP
    RAISE NOTICE '  - % (%)', col_count.column_name, col_count.data_type;
  END LOOP;
  
  RAISE NOTICE '============================================================';
END $$;

-- Step 8: Verify backup can restore
-- ============================================================
DO $$
DECLARE
  backup_count INTEGER;
  users_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO backup_count FROM users_backup_20251117;
  SELECT COUNT(*) INTO users_count FROM users;
  
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'VERIFICATION';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Backup table rows: %', backup_count;
  RAISE NOTICE 'Current users table rows: %', users_count;
  
  IF backup_count = users_count THEN
    RAISE NOTICE 'Row count matches - backup is valid ✓';
  ELSE
    RAISE WARNING 'Row count mismatch - verify backup!';
  END IF;
  
  RAISE NOTICE '============================================================';
END $$;

-- ============================================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- ============================================================
-- If something goes wrong, run this to restore:
/*
DROP TABLE users CASCADE;
ALTER TABLE users_backup_20251117 RENAME TO users;

-- Recreate any foreign key constraints that were dropped
-- (Run appropriate ALTER TABLE ADD CONSTRAINT commands)
*/

-- ============================================================
-- CLEANUP BACKUP TABLE (after verification)
-- ============================================================
-- After verifying everything works, you can drop the backup:
/*
DROP TABLE IF EXISTS users_backup_20251117;
*/

-- ============================================================
-- SUMMARY OF CHANGES
-- ============================================================
-- REMOVED (20 columns):
--   - stripe_customer_id, stripe_subscription_id
--   - employer_name, division_name, member_type
--   - ssn, date_of_hire, plan_start_date
--   - enrolled_by_agent_id
--   - username, password_hash
--   - email_verification_token, reset_password_token, reset_password_expiry
--   - google_id, facebook_id, apple_id, microsoft_id, linkedin_id, twitter_id
--
-- ADDED (4 columns):
--   - upline_agent_id (VARCHAR) - Parent agent reference
--   - hierarchy_level (INTEGER) - Depth in hierarchy
--   - can_receive_overrides (BOOLEAN) - Override eligibility
--   - override_commission_rate (DECIMAL) - Override percentage
--
-- INDEXES CREATED:
--   - idx_users_upline
--   - idx_users_hierarchy_level
--   - idx_users_agent_number
--
-- CONSTRAINTS ADDED:
--   - fk_users_upline_agent (foreign key to users.id)
-- ============================================================
