-- Create members table in Neon database
-- This table stores all member enrollment data (separate from Supabase users)

CREATE TABLE IF NOT EXISTS members (
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
  enrolled_by_agent_id VARCHAR(255),
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

-- Create function to auto-generate customer numbers: MPP20250001, MPP20250002, etc.
CREATE OR REPLACE FUNCTION generate_customer_number()
RETURNS CHAR(11) AS $$
DECLARE
  year_prefix CHAR(4);
  next_num INTEGER;
  new_number CHAR(11);
BEGIN
  -- Get current year
  year_prefix := TO_CHAR(NOW(), 'YYYY');
  
  -- Get the highest number for this year
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(customer_number FROM 8 FOR 4) AS INTEGER)),
    0
  ) + 1
  INTO next_num
  FROM members
  WHERE customer_number LIKE 'MPP' || year_prefix || '%';
  
  -- Format as MPP20250001
  new_number := 'MPP' || year_prefix || LPAD(next_num::TEXT, 4, '0');
  
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
CREATE INDEX IF NOT EXISTS idx_members_customer_number ON members(customer_number);
CREATE INDEX IF NOT EXISTS idx_members_agent_number ON members(agent_number);
CREATE INDEX IF NOT EXISTS idx_members_enrolled_by ON members(enrolled_by_agent_id);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE INDEX IF NOT EXISTS idx_members_created_at ON members(created_at);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_members_updated_at
  BEFORE UPDATE ON members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Verify table was created
SELECT 
  table_name, 
  column_name, 
  data_type, 
  character_maximum_length
FROM information_schema.columns
WHERE table_name = 'members'
ORDER BY ordinal_position;
