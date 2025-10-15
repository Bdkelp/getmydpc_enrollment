
-- Migration: Separate App Users from Members
-- This script creates the new members table and migrates existing data

BEGIN;

-- 1. Create members table
CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  middle_name VARCHAR(100),
  phone VARCHAR(20),
  date_of_birth VARCHAR(50),
  gender VARCHAR(50),
  address TEXT,
  address2 TEXT,
  city VARCHAR(100),
  state VARCHAR(10),
  zip_code VARCHAR(10),
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(20),
  stripe_customer_id VARCHAR(255) UNIQUE,
  approval_status VARCHAR(20) DEFAULT 'pending',
  approved_at TIMESTAMP,
  approved_by VARCHAR(255) REFERENCES users(id),
  rejection_reason TEXT,
  registration_ip VARCHAR(45),
  suspicious_flags JSONB,
  enrolled_by_agent_id VARCHAR(255) REFERENCES users(id),
  employer_name VARCHAR(255),
  division_name VARCHAR(255),
  member_type VARCHAR(50),
  ssn VARCHAR(11),
  date_of_hire VARCHAR(50),
  plan_start_date VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Migrate member data from users table
INSERT INTO members (
  email, first_name, last_name, middle_name, phone, date_of_birth, gender,
  address, address2, city, state, zip_code, emergency_contact_name, emergency_contact_phone,
  stripe_customer_id, approval_status, approved_at, approved_by, rejection_reason,
  registration_ip, suspicious_flags, enrolled_by_agent_id, employer_name, division_name,
  member_type, ssn, date_of_hire, plan_start_date, is_active, created_at, updated_at
)
SELECT 
  email, "firstName", "lastName", "middleName", phone, "dateOfBirth", gender,
  address, address2, city, state, "zipCode", "emergencyContactName", "emergencyContactPhone",
  "stripeCustomerId", "approvalStatus", "approvedAt", "approvedBy", "rejectionReason",
  "registrationIp", "suspiciousFlags", "enrolledByAgentId", "employerName", "divisionName",
  "memberType", ssn, "dateOfHire", "planStartDate", "isActive", "createdAt", "updatedAt"
FROM users
WHERE role = 'member' OR role IS NULL OR role NOT IN ('admin', 'agent');

-- 3. Create mapping table for migration (temporary)
CREATE TEMP TABLE user_member_mapping AS
SELECT u.id as old_user_id, m.id as new_member_id
FROM users u
JOIN members m ON u.email = m.email
WHERE u.role = 'member' OR u.role IS NULL OR u.role NOT IN ('admin', 'agent');

-- 4. Update subscriptions to reference members
ALTER TABLE subscriptions ADD COLUMN member_id INTEGER REFERENCES members(id);

UPDATE subscriptions s
SET member_id = m.new_member_id
FROM user_member_mapping m
WHERE s.user_id = m.old_user_id;

ALTER TABLE subscriptions ALTER COLUMN member_id SET NOT NULL;
ALTER TABLE subscriptions DROP COLUMN user_id;

-- 5. Update payments to reference members
ALTER TABLE payments ADD COLUMN member_id INTEGER REFERENCES members(id);

UPDATE payments p
SET member_id = m.new_member_id
FROM user_member_mapping m
WHERE p.user_id = m.old_user_id;

ALTER TABLE payments ALTER COLUMN member_id SET NOT NULL;
ALTER TABLE payments DROP COLUMN user_id;

-- 6. Update commissions to reference members
ALTER TABLE commissions ADD COLUMN member_id INTEGER REFERENCES members(id);

UPDATE commissions c
SET member_id = m.new_member_id
FROM user_member_mapping m
WHERE c.user_id = m.old_user_id;

ALTER TABLE commissions ALTER COLUMN member_id SET NOT NULL;
ALTER TABLE commissions DROP COLUMN user_id;

-- 7. Update family_members to reference members
ALTER TABLE family_members RENAME COLUMN primary_user_id TO primary_member_id;
ALTER TABLE family_members ALTER COLUMN primary_member_id TYPE INTEGER USING (
  SELECT new_member_id FROM user_member_mapping WHERE old_user_id = primary_member_id
);

-- 8. Update enrollment_modifications to reference members
ALTER TABLE enrollment_modifications RENAME COLUMN user_id TO member_id;
ALTER TABLE enrollment_modifications ALTER COLUMN member_id TYPE INTEGER USING (
  SELECT new_member_id FROM user_member_mapping WHERE old_user_id = member_id
);

-- 9. Clean up users table - remove member records
DELETE FROM users WHERE role = 'member' OR role IS NULL OR role NOT IN ('admin', 'agent');

-- 10. Update users table constraints
ALTER TABLE users ALTER COLUMN role SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'agent'));

-- 11. Create indexes for performance
CREATE INDEX idx_members_email ON members(email);
CREATE INDEX idx_members_enrolled_by_agent ON members(enrolled_by_agent_id);
CREATE INDEX idx_subscriptions_member_id ON subscriptions(member_id);
CREATE INDEX idx_payments_member_id ON payments(member_id);
CREATE INDEX idx_commissions_member_id ON commissions(member_id);
CREATE INDEX idx_family_members_primary_member ON family_members(primary_member_id);

COMMIT;
