-- ============================================================
-- MEMBER vs USER SEPARATION MIGRATION
-- Purpose: Separate enrolled members from authenticated users
-- Created: 2025-10-10
-- ============================================================

-- STEP 1: Create members table
-- ============================================================
CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  customer_number VARCHAR(255) UNIQUE NOT NULL,
  
  -- Personal information
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  middle_name VARCHAR(255),
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  date_of_birth DATE,
  gender VARCHAR(20),
  ssn VARCHAR(11), -- Encrypted in application layer
  
  -- Address information
  address TEXT,
  address2 TEXT,
  city VARCHAR(100),
  state VARCHAR(2),
  zip_code VARCHAR(10),
  
  -- Emergency contact
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(50),
  
  -- Employment information
  employer_name VARCHAR(255),
  division_name VARCHAR(255),
  member_type VARCHAR(50), -- employee, spouse, dependent
  date_of_hire DATE,
  plan_start_date DATE,
  
  -- Enrollment tracking
  enrolled_by_agent_id VARCHAR(255) REFERENCES users(id),
  agent_number VARCHAR(50), -- Capture agent number at enrollment time
  enrollment_date TIMESTAMP DEFAULT NOW(),
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  status VARCHAR(50) DEFAULT 'active', -- active, cancelled, suspended, pending
  cancellation_date TIMESTAMP,
  cancellation_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_members_customer_number ON members(customer_number);
CREATE INDEX IF NOT EXISTS idx_members_enrolled_by ON members(enrolled_by_agent_id);
CREATE INDEX IF NOT EXISTS idx_members_agent_number ON members(agent_number);
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE INDEX IF NOT EXISTS idx_members_enrollment_date ON members(enrollment_date);

COMMENT ON TABLE members IS 'Enrolled healthcare members (customers) - NO authentication access';
COMMENT ON COLUMN members.customer_number IS 'Unique customer identifier (e.g., MPP20250001)';
COMMENT ON COLUMN members.enrolled_by_agent_id IS 'Agent who enrolled this member';
COMMENT ON COLUMN members.agent_number IS 'Agent number at time of enrollment (e.g., MPP0001)';

-- ============================================================
-- STEP 2: Add member_id to related tables
-- ============================================================

-- Add member_id to subscriptions
ALTER TABLE subscriptions 
  ADD COLUMN IF NOT EXISTS member_id INTEGER REFERENCES members(id) ON DELETE CASCADE;

-- Make user_id nullable since subscriptions can now belong to members
ALTER TABLE subscriptions 
  ALTER COLUMN user_id DROP NOT NULL;

-- Add constraint: either user_id OR member_id must be set
ALTER TABLE subscriptions 
  ADD CONSTRAINT IF NOT EXISTS check_subscription_owner 
  CHECK (
    (user_id IS NOT NULL AND member_id IS NULL) OR 
    (user_id IS NULL AND member_id IS NOT NULL)
  );

-- Add index for member subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_member_id ON subscriptions(member_id);

-- Add member_id to payments
ALTER TABLE payments 
  ADD COLUMN IF NOT EXISTS member_id INTEGER REFERENCES members(id) ON DELETE CASCADE;

-- Make user_id nullable
ALTER TABLE payments 
  ALTER COLUMN user_id DROP NOT NULL;

-- Add constraint
ALTER TABLE payments 
  ADD CONSTRAINT IF NOT EXISTS check_payment_owner 
  CHECK (
    (user_id IS NOT NULL AND member_id IS NULL) OR 
    (user_id IS NULL AND member_id IS NOT NULL)
  );

-- Add index
CREATE INDEX IF NOT EXISTS idx_payments_member_id ON payments(member_id);

-- Add member_id to commissions
ALTER TABLE commissions 
  ADD COLUMN IF NOT EXISTS member_id INTEGER REFERENCES members(id) ON DELETE CASCADE;

-- Make user_id nullable (currently stores enrolled member, will become member_id)
ALTER TABLE commissions 
  ALTER COLUMN user_id DROP NOT NULL;

-- Add constraint
ALTER TABLE commissions 
  ADD CONSTRAINT IF NOT EXISTS check_commission_member 
  CHECK (
    (user_id IS NOT NULL AND member_id IS NULL) OR 
    (user_id IS NULL AND member_id IS NOT NULL)
  );

-- Add index
CREATE INDEX IF NOT EXISTS idx_commissions_member_id ON commissions(member_id);

-- ============================================================
-- STEP 3: Update family_members table reference
-- ============================================================

-- Add member_id to family_members (primary member can now be in members table)
ALTER TABLE family_members 
  ADD COLUMN IF NOT EXISTS primary_member_id INTEGER REFERENCES members(id) ON DELETE CASCADE;

-- Make primary_user_id nullable
ALTER TABLE family_members 
  ALTER COLUMN primary_user_id DROP NOT NULL;

-- Add constraint
ALTER TABLE family_members 
  ADD CONSTRAINT IF NOT EXISTS check_family_primary 
  CHECK (
    (primary_user_id IS NOT NULL AND primary_member_id IS NULL) OR 
    (primary_user_id IS NULL AND primary_member_id IS NOT NULL)
  );

-- Add index
CREATE INDEX IF NOT EXISTS idx_family_members_primary_member_id ON family_members(primary_member_id);

-- ============================================================
-- STEP 4: Create view for backward compatibility
-- ============================================================

CREATE OR REPLACE VIEW all_members_view AS
SELECT 
  'member' as record_type,
  m.id::text as id,
  m.customer_number,
  m.first_name,
  m.last_name,
  m.middle_name,
  m.email,
  m.phone,
  m.date_of_birth::text as date_of_birth,
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
  m.date_of_hire::text as date_of_hire,
  m.plan_start_date::text as plan_start_date,
  m.enrolled_by_agent_id,
  m.agent_number,
  m.is_active,
  m.created_at,
  m.updated_at,
  NULL::text as role -- Members don't have roles
FROM members m

UNION ALL

SELECT 
  'user' as record_type,
  u.id,
  NULL as customer_number,
  u.first_name,
  u.last_name,
  u.middle_name,
  u.email,
  u.phone,
  u.date_of_birth,
  u.gender,
  u.address,
  u.address2,
  u.city,
  u.state,
  u.zip_code,
  u.emergency_contact_name,
  u.emergency_contact_phone,
  u.employer_name,
  u.division_name,
  u.member_type,
  u.date_of_hire,
  u.plan_start_date,
  NULL as enrolled_by_agent_id,
  u.agent_number,
  u.is_active,
  u.created_at,
  u.updated_at,
  u.role
FROM users u
WHERE u.role IN ('agent', 'admin', 'super_admin');

COMMENT ON VIEW all_members_view IS 'Combined view of members and users for backward compatibility';

-- ============================================================
-- STEP 5: DATA MIGRATION (Run carefully!)
-- ============================================================

-- BEFORE running this, backup the users table!
-- pg_dump -U postgres -t users enrollment_db > users_backup_20251010.sql

-- Insert member records from users table into members table
INSERT INTO members (
  customer_number,
  first_name,
  last_name,
  middle_name,
  email,
  phone,
  date_of_birth,
  gender,
  ssn,
  address,
  address2,
  city,
  state,
  zip_code,
  emergency_contact_name,
  emergency_contact_phone,
  employer_name,
  division_name,
  member_type,
  date_of_hire,
  plan_start_date,
  enrolled_by_agent_id,
  agent_number,
  enrollment_date,
  is_active,
  status,
  created_at,
  updated_at
)
SELECT 
  -- Generate customer number: MPP + year + user id
  COALESCE(
    'MPP' || EXTRACT(YEAR FROM u.created_at)::text || LPAD(SUBSTRING(u.id FROM 1 FOR 6), 6, '0'),
    'MPP' || EXTRACT(YEAR FROM NOW())::text || LPAD(SUBSTRING(u.id FROM 1 FOR 6), 6, '0')
  ) as customer_number,
  u.first_name,
  u.last_name,
  u.middle_name,
  u.email,
  u.phone,
  u.date_of_birth::DATE,
  u.gender,
  u.ssn,
  u.address,
  u.address2,
  u.city,
  u.state,
  u.zip_code,
  u.emergency_contact_name,
  u.emergency_contact_phone,
  u.employer_name,
  u.division_name,
  u.member_type,
  u.date_of_hire::DATE,
  u.plan_start_date::DATE,
  u.enrolled_by_agent_id,
  NULL as agent_number, -- Will be populated from enrolling agent
  u.created_at as enrollment_date,
  u.is_active,
  CASE 
    WHEN u.is_active = true THEN 'active'
    ELSE 'suspended'
  END as status,
  u.created_at,
  u.updated_at
FROM users u
WHERE u.role = 'member' OR u.role = 'user'
ON CONFLICT (email) DO NOTHING; -- Skip if already migrated

-- Update agent_number in members based on enrolling agent
UPDATE members m
SET agent_number = u.agent_number
FROM users u
WHERE m.enrolled_by_agent_id = u.id
  AND u.agent_number IS NOT NULL
  AND m.agent_number IS NULL;

-- ============================================================
-- STEP 6: Update foreign key references
-- ============================================================

-- Update subscriptions to reference members
UPDATE subscriptions s
SET 
  member_id = m.id,
  user_id = NULL
FROM members m
WHERE m.email = (SELECT email FROM users WHERE id = s.user_id)
  AND s.user_id IN (SELECT id FROM users WHERE role IN ('member', 'user'));

-- Update payments to reference members
UPDATE payments p
SET 
  member_id = m.id,
  user_id = NULL
FROM members m
WHERE m.email = (SELECT email FROM users WHERE id = p.user_id)
  AND p.user_id IN (SELECT id FROM users WHERE role IN ('member', 'user'));

-- Update commissions to reference members (user_id field was storing enrolled member)
UPDATE commissions c
SET 
  member_id = m.id,
  user_id = NULL
FROM members m
WHERE m.email = (SELECT email FROM users WHERE id = c.user_id)
  AND c.user_id IN (SELECT id FROM users WHERE role IN ('member', 'user'));

-- Update family_members to reference members as primary
UPDATE family_members fm
SET 
  primary_member_id = m.id,
  primary_user_id = NULL
FROM members m
WHERE m.email = (SELECT email FROM users WHERE id = fm.primary_user_id)
  AND fm.primary_user_id IN (SELECT id FROM users WHERE role IN ('member', 'user'));

-- ============================================================
-- STEP 7: Verification queries
-- ============================================================

-- Count members migrated
SELECT COUNT(*) as migrated_members FROM members;

-- Count subscriptions linked to members
SELECT COUNT(*) as member_subscriptions FROM subscriptions WHERE member_id IS NOT NULL;

-- Count payments linked to members
SELECT COUNT(*) as member_payments FROM payments WHERE member_id IS NOT NULL;

-- Count commissions linked to members
SELECT COUNT(*) as member_commissions FROM commissions WHERE member_id IS NOT NULL;

-- Check for orphaned records (should be 0)
SELECT COUNT(*) as orphaned_subscriptions 
FROM subscriptions 
WHERE user_id IS NULL AND member_id IS NULL;

SELECT COUNT(*) as orphaned_payments 
FROM payments 
WHERE user_id IS NULL AND member_id IS NULL;

-- ============================================================
-- STEP 8: Clean up users table (RUN AFTER VERIFICATION!)
-- ============================================================

-- ONLY run this after confirming all data is migrated correctly!
-- This will DELETE member records from users table

-- Show members to be deleted (REVIEW FIRST!)
SELECT id, email, first_name, last_name, role, created_at
FROM users
WHERE role = 'member' OR role = 'user'
ORDER BY created_at DESC;

-- DELETE member users (UNCOMMENT AFTER VERIFICATION!)
-- DELETE FROM users WHERE role = 'member' OR role = 'user';

-- Verify only staff remain in users table
SELECT role, COUNT(*) as count
FROM users
GROUP BY role
ORDER BY role;

-- Expected result:
-- role        | count
-- ------------+-------
-- admin       | 3-5
-- agent       | 2+
-- super_admin | 0-1

-- ============================================================
-- STEP 9: Update role enum constraint (if exists)
-- ============================================================

-- Remove 'member' from valid roles if constraint exists
-- ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
-- ALTER TABLE users ADD CONSTRAINT users_role_check 
--   CHECK (role IN ('agent', 'admin', 'super_admin'));

-- ============================================================
-- COMPLETE! Members are now separate from authenticated users
-- ============================================================

-- Summary of changes:
-- ✓ Created members table
-- ✓ Added member_id to subscriptions, payments, commissions, family_members
-- ✓ Migrated member data from users to members
-- ✓ Updated all foreign key references
-- ✓ Created backward compatibility view
-- ✓ Ready to delete member records from users table
