-- ============================================================
-- FRESH START MIGRATION - Clean Slate with Proper Field Sizes
-- ============================================================
-- This migration:
-- 1. Deletes ALL member/user records (keeps only 2 agents + 3 admins)
-- 2. Creates members table with proper CHAR field sizes
-- 3. Uses validation constraints for data quality
-- ============================================================

-- ============================================================
-- STEP 1: CLEAN UP - Delete all member/user records
-- ============================================================

-- Show what will be deleted (REVIEW FIRST!)
DO $$ 
DECLARE
  member_count INT;
BEGIN
  SELECT COUNT(*) INTO member_count FROM users WHERE role IN ('member', 'user');
  RAISE NOTICE 'Records to be deleted: %', member_count;
END $$;

-- Delete related data first (foreign keys) - only if columns exist
DO $$ 
BEGIN
  -- Delete from commissions if user_id column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'commissions' AND column_name = 'user_id'
  ) THEN
    EXECUTE 'DELETE FROM commissions WHERE user_id IN (SELECT id FROM users WHERE role IN (''member'', ''user''))';
  END IF;
  
  -- Delete from payments if user_id column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'user_id'
  ) THEN
    EXECUTE 'DELETE FROM payments WHERE user_id IN (SELECT id FROM users WHERE role IN (''member'', ''user''))';
  END IF;
  
  -- Delete from subscriptions if user_id column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'user_id'
  ) THEN
    EXECUTE 'DELETE FROM subscriptions WHERE user_id IN (SELECT id FROM users WHERE role IN (''member'', ''user''))';
  END IF;
  
  -- Delete from family_members if table exists (cast to handle type mismatch)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'family_members') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'family_members' AND column_name = 'primary_user_id'
    ) THEN
      EXECUTE 'DELETE FROM family_members WHERE primary_user_id::TEXT IN (SELECT id::TEXT FROM users WHERE role IN (''member'', ''user''))';
    END IF;
  END IF;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Warning during cleanup: %', SQLERRM;
END $$;

-- Delete member/user records
DELETE FROM users WHERE role IN ('member', 'user');

-- Verify only agents and admins remain
DO $$ 
DECLARE
  agent_count INT;
  admin_count INT;
BEGIN
  SELECT COUNT(*) INTO agent_count FROM users WHERE role = 'agent';
  SELECT COUNT(*) INTO admin_count FROM users WHERE role = 'admin';
  RAISE NOTICE 'Remaining users - Agents: %, Admins: %', agent_count, admin_count;
END $$;

-- ============================================================
-- STEP 2: Create members table with PROPER field sizes
-- ============================================================

DROP TABLE IF EXISTS members CASCADE;

CREATE TABLE members (
  id SERIAL PRIMARY KEY,
  
  -- Customer identifier: MPP20250001 (11 chars fixed)
  customer_number CHAR(11) UNIQUE NOT NULL,
  
  -- Personal information
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  middle_name VARCHAR(50),
  email VARCHAR(100) UNIQUE NOT NULL,
  
  -- Phone: US numbers only - 10 digits (no formatting)
  phone CHAR(10),
  
  -- Date of Birth: MMDDYYYY format (8 chars)
  date_of_birth CHAR(8),
  
  -- Gender: M, F, O (1 char)
  gender CHAR(1),
  
  -- SSN: 9 digits, no dashes (encrypted in app layer)
  ssn CHAR(9),
  
  -- Address information
  address VARCHAR(100),
  address2 VARCHAR(50),
  city VARCHAR(50),
  state CHAR(2), -- US state code: TX, CA, etc.
  zip_code CHAR(5), -- US ZIP code: 5 digits
  
  -- Emergency contact
  emergency_contact_name VARCHAR(100),
  emergency_contact_phone CHAR(10), -- US phone: 10 digits
  
  -- Employment information
  employer_name VARCHAR(100),
  division_name VARCHAR(100),
  member_type VARCHAR(20), -- employee, spouse, dependent
  
  -- Date of Hire: MMDDYYYY format (8 chars)
  date_of_hire CHAR(8),
  
  -- Plan Start Date: MMDDYYYY format (8 chars)
  plan_start_date CHAR(8),
  
  -- Enrollment tracking
  enrolled_by_agent_id VARCHAR(255), -- FK will be added separately if users.id exists
  agent_number VARCHAR(20), -- MPP0001, MPP0002, etc.
  enrollment_date TIMESTAMP DEFAULT NOW(),
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  status VARCHAR(20) DEFAULT 'active', -- active, cancelled, suspended, pending
  cancellation_date TIMESTAMP,
  cancellation_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints for data validation
  CONSTRAINT check_phone_length CHECK (phone IS NULL OR LENGTH(phone) = 10),
  CONSTRAINT check_phone_digits CHECK (phone IS NULL OR phone ~ '^[0-9]{10}$'),
  CONSTRAINT check_emergency_phone_length CHECK (emergency_contact_phone IS NULL OR LENGTH(emergency_contact_phone) = 10),
  CONSTRAINT check_emergency_phone_digits CHECK (emergency_contact_phone IS NULL OR emergency_contact_phone ~ '^[0-9]{10}$'),
  CONSTRAINT check_dob_format CHECK (date_of_birth IS NULL OR date_of_birth ~ '^[0-9]{8}$'),
  CONSTRAINT check_date_of_hire_format CHECK (date_of_hire IS NULL OR date_of_hire ~ '^[0-9]{8}$'),
  CONSTRAINT check_plan_start_format CHECK (plan_start_date IS NULL OR plan_start_date ~ '^[0-9]{8}$'),
  CONSTRAINT check_ssn_format CHECK (ssn IS NULL OR ssn ~ '^[0-9]{9}$'),
  CONSTRAINT check_state_format CHECK (state IS NULL OR state ~ '^[A-Z]{2}$'),
  CONSTRAINT check_zip_format CHECK (zip_code IS NULL OR zip_code ~ '^[0-9]{5}$'),
  CONSTRAINT check_gender_values CHECK (gender IS NULL OR gender IN ('M', 'F', 'O')),
  CONSTRAINT check_customer_number_format CHECK (customer_number ~ '^MPP[0-9]{8}$')
);

-- Add foreign key to users.id if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'id'
  ) THEN
    EXECUTE 'ALTER TABLE members ADD CONSTRAINT fk_members_enrolled_by_agent FOREIGN KEY (enrolled_by_agent_id) REFERENCES users(id)';
  ELSE
    RAISE NOTICE 'Skipping foreign key constraint - users.id column not found';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not add foreign key constraint: %', SQLERRM;
END $$;

-- Create indexes for fast lookups
CREATE INDEX idx_members_customer_number ON members(customer_number);
CREATE INDEX idx_members_email ON members(email);
CREATE INDEX idx_members_enrolled_by ON members(enrolled_by_agent_id);
CREATE INDEX idx_members_status ON members(status);
CREATE INDEX idx_members_phone ON members(phone);
CREATE INDEX idx_members_last_name ON members(last_name);

-- Add helpful comments
COMMENT ON TABLE members IS 'Enrolled healthcare members (customers) - NO authentication access';
COMMENT ON COLUMN members.customer_number IS 'Format: MPP20250001 (11 chars)';
COMMENT ON COLUMN members.phone IS 'US phone numbers only: 10 digits, no formatting (e.g., 5125551234)';
COMMENT ON COLUMN members.date_of_birth IS 'Format: MMDDYYYY (8 chars, e.g., 01151990 = Jan 15, 1990)';
COMMENT ON COLUMN members.date_of_hire IS 'Format: MMDDYYYY (8 chars)';
COMMENT ON COLUMN members.plan_start_date IS 'Format: MMDDYYYY (8 chars)';
COMMENT ON COLUMN members.ssn IS '9 digits only, no dashes (e.g., 123456789)';
COMMENT ON COLUMN members.state IS 'US state code (2 chars, e.g., TX, CA)';
COMMENT ON COLUMN members.zip_code IS 'US ZIP code: 5 digits only (e.g., 78701)';
COMMENT ON COLUMN members.gender IS 'M = Male, F = Female, O = Other';

-- ============================================================
-- STEP 3: Add member_id to related tables
-- ============================================================

-- Add member_id to subscriptions (if table exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscriptions') THEN
    ALTER TABLE subscriptions DROP COLUMN IF EXISTS member_id CASCADE;
    ALTER TABLE subscriptions ADD COLUMN member_id INTEGER REFERENCES members(id) ON DELETE CASCADE;
    
    -- Make user_id nullable if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'subscriptions' AND column_name = 'user_id'
    ) THEN
      ALTER TABLE subscriptions ALTER COLUMN user_id DROP NOT NULL;
    END IF;
    
    CREATE INDEX IF NOT EXISTS idx_subscriptions_member_id ON subscriptions(member_id);
  END IF;
END $$;

-- Add member_id to payments (if table exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payments') THEN
    ALTER TABLE payments DROP COLUMN IF EXISTS member_id CASCADE;
    ALTER TABLE payments ADD COLUMN member_id INTEGER REFERENCES members(id) ON DELETE CASCADE;
    
    -- Make user_id nullable if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'payments' AND column_name = 'user_id'
    ) THEN
      ALTER TABLE payments ALTER COLUMN user_id DROP NOT NULL;
    END IF;
    
    CREATE INDEX IF NOT EXISTS idx_payments_member_id ON payments(member_id);
  END IF;
END $$;

-- Add member_id to commissions (if table exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'commissions') THEN
    ALTER TABLE commissions DROP COLUMN IF EXISTS member_id CASCADE;
    ALTER TABLE commissions ADD COLUMN member_id INTEGER REFERENCES members(id) ON DELETE CASCADE;
    
    -- Make user_id nullable if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'commissions' AND column_name = 'user_id'
    ) THEN
      ALTER TABLE commissions ALTER COLUMN user_id DROP NOT NULL;
    END IF;
    
    CREATE INDEX IF NOT EXISTS idx_commissions_member_id ON commissions(member_id);
  END IF;
END $$;

-- ============================================================
-- STEP 4: Update family_members table (if exists)
-- ============================================================

DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'family_members') THEN
    -- Add member_id column
    ALTER TABLE family_members 
      DROP COLUMN IF EXISTS primary_member_id CASCADE;
      
    ALTER TABLE family_members 
      ADD COLUMN primary_member_id INTEGER REFERENCES members(id) ON DELETE CASCADE;
    
    -- Make primary_user_id nullable
    ALTER TABLE family_members 
      ALTER COLUMN primary_user_id DROP NOT NULL;
    
    -- Add index
    CREATE INDEX IF NOT EXISTS idx_family_members_primary_member_id ON family_members(primary_member_id);
  END IF;
END $$;

-- ============================================================
-- STEP 5: Create helper functions
-- ============================================================

-- Function to generate next customer number
CREATE OR REPLACE FUNCTION generate_customer_number()
RETURNS CHAR(11) AS $$
DECLARE
  current_year TEXT;
  next_number INT;
  customer_num TEXT;
BEGIN
  current_year := EXTRACT(YEAR FROM NOW())::TEXT;
  
  -- Get the highest number for this year
  SELECT COALESCE(MAX(SUBSTRING(customer_number FROM 4 FOR 8)::INT), 0) + 1
  INTO next_number
  FROM members
  WHERE customer_number LIKE 'MPP' || current_year || '%';
  
  -- Format: MPP + YEAR(4) + NUMBER(4 padded)
  customer_num := 'MPP' || current_year || LPAD(next_number::TEXT, 4, '0');
  
  RETURN customer_num::CHAR(11);
END;
$$ LANGUAGE plpgsql;

-- Function to validate and format phone number
CREATE OR REPLACE FUNCTION format_phone(phone_input TEXT)
RETURNS CHAR(10) AS $$
BEGIN
  -- Remove all non-digits
  phone_input := REGEXP_REPLACE(phone_input, '[^0-9]', '', 'g');
  
  -- Check if exactly 10 digits
  IF LENGTH(phone_input) = 10 THEN
    RETURN phone_input::CHAR(10);
  ELSE
    RETURN NULL;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to format date MMDDYYYY
CREATE OR REPLACE FUNCTION format_date_mmddyyyy(date_input TEXT)
RETURNS CHAR(8) AS $$
BEGIN
  -- Remove all non-digits
  date_input := REGEXP_REPLACE(date_input, '[^0-9]', '', 'g');
  
  -- Check if exactly 8 digits
  IF LENGTH(date_input) = 8 THEN
    RETURN date_input::CHAR(8);
  ELSE
    RETURN NULL;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- STEP 6: Create view for backward compatibility
-- ============================================================

-- Create a simple view for members only (since users table structure is unknown)
CREATE OR REPLACE VIEW all_members_view AS
SELECT 
  'member' as record_type,
  m.id::TEXT as id,
  m.customer_number,
  m.first_name,
  m.last_name,
  m.middle_name,
  m.email,
  m.phone,
  m.date_of_birth,
  m.gender,
  m.address,
  m.address2,
  m.city,
  m.state,
  m.zip_code,
  m.emergency_contact_name,
  m.emergency_contact_phone,
  m.employer_name,
  m.division_name,
  m.member_type,
  m.date_of_hire,
  m.plan_start_date,
  m.enrolled_by_agent_id,
  m.agent_number,
  m.is_active,
  m.created_at,
  m.updated_at,
  NULL::TEXT as role
FROM members m;

-- ============================================================
-- VERIFICATION
-- ============================================================

-- Show current state
DO $$ 
DECLARE
  agent_count INT;
  admin_count INT;
  member_count INT;
  subscription_count INT;
  member_sub_count INT;
BEGIN
  RAISE NOTICE '=== CURRENT DATABASE STATE ===';
  
  -- Count users by role
  SELECT COUNT(*) INTO agent_count FROM users WHERE role = 'agent';
  SELECT COUNT(*) INTO admin_count FROM users WHERE role = 'admin';
  RAISE NOTICE 'Users remaining - Agents: %, Admins: %', agent_count, admin_count;
  
  -- Count members (should be 0)
  SELECT COUNT(*) INTO member_count FROM members;
  RAISE NOTICE 'Members table created - Record count: %', member_count;
  
  -- Count subscriptions
  SELECT COUNT(*) INTO subscription_count FROM subscriptions;
  SELECT COUNT(*) INTO member_sub_count FROM subscriptions WHERE member_id IS NOT NULL;
  RAISE NOTICE 'Subscriptions - Total: %, With member_id: %', subscription_count, member_sub_count;
  
  RAISE NOTICE '=== MIGRATION COMPLETE ===';
  RAISE NOTICE 'Database is now clean and ready for new member enrollments';
  RAISE NOTICE 'Use generate_customer_number() function to create new customer numbers';
END $$;

-- ============================================================
-- EXAMPLE: How to insert a new member
-- ============================================================

-- EXAMPLE (commented out):
/*
INSERT INTO members (
  customer_number,
  first_name,
  last_name,
  email,
  phone,
  date_of_birth,
  gender,
  state,
  zip_code,
  enrolled_by_agent_id,
  agent_number
) VALUES (
  generate_customer_number(),
  'John',
  'Doe',
  'john.doe@example.com',
  '5125551234',
  '01151990',  -- Jan 15, 1990
  'M',
  'TX',
  '78701',
  (SELECT id FROM users WHERE role = 'agent' LIMIT 1),
  'MPP0001'
);
*/
