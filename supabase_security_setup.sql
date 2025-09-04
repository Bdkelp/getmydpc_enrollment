
-- Enable Row Level Security on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_modifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Create encryption extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add encrypted columns for sensitive data
ALTER TABLE users 
ADD COLUMN ssn_encrypted TEXT,
ADD COLUMN ssn_last_four VARCHAR(4),
ADD COLUMN payment_token_encrypted TEXT;

ALTER TABLE family_members 
ADD COLUMN ssn_encrypted TEXT,
ADD COLUMN ssn_last_four VARCHAR(4);

-- Create function to encrypt SSN and store last 4 digits
CREATE OR REPLACE FUNCTION encrypt_ssn()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ssn IS NOT NULL AND NEW.ssn != '' THEN
    -- Encrypt full SSN
    NEW.ssn_encrypted := crypt(NEW.ssn, gen_salt('bf'));
    -- Store last 4 digits only
    NEW.ssn_last_four := RIGHT(NEW.ssn, 4);
    -- Clear plain text SSN
    NEW.ssn := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for SSN encryption
CREATE TRIGGER encrypt_user_ssn 
  BEFORE INSERT OR UPDATE ON users 
  FOR EACH ROW EXECUTE FUNCTION encrypt_ssn();

CREATE TRIGGER encrypt_family_ssn 
  BEFORE INSERT OR UPDATE ON family_members 
  FOR EACH ROW EXECUTE FUNCTION encrypt_ssn();

-- Validation function for DOB (must be 18+ years old)
CREATE OR REPLACE FUNCTION validate_dob()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.date_of_birth IS NOT NULL THEN
    IF (NEW.date_of_birth::date + INTERVAL '18 years') > CURRENT_DATE THEN
      RAISE EXCEPTION 'Member must be at least 18 years old';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create DOB validation triggers
CREATE TRIGGER validate_user_dob 
  BEFORE INSERT OR UPDATE ON users 
  FOR EACH ROW EXECUTE FUNCTION validate_dob();

CREATE TRIGGER validate_family_dob 
  BEFORE INSERT OR UPDATE ON family_members 
  FOR EACH ROW EXECUTE FUNCTION validate_dob();

-- Phone number validation function
CREATE OR REPLACE FUNCTION validate_phone()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.phone IS NOT NULL THEN
    -- Remove all non-numeric characters
    NEW.phone := regexp_replace(NEW.phone, '[^0-9]', '', 'g');
    -- Validate US phone number format
    IF LENGTH(NEW.phone) NOT IN (10, 11) THEN
      RAISE EXCEPTION 'Phone number must be 10 or 11 digits';
    END IF;
    -- Ensure 11-digit numbers start with 1
    IF LENGTH(NEW.phone) = 11 AND LEFT(NEW.phone, 1) != '1' THEN
      RAISE EXCEPTION 'Invalid phone number format';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create phone validation triggers
CREATE TRIGGER validate_user_phone 
  BEFORE INSERT OR UPDATE ON users 
  FOR EACH ROW EXECUTE FUNCTION validate_phone();

CREATE TRIGGER validate_family_phone 
  BEFORE INSERT OR UPDATE ON family_members 
  FOR EACH ROW EXECUTE FUNCTION validate_phone();

-- RLS Policies for Members (can only see their own data)
CREATE POLICY member_own_data ON users
  FOR ALL USING (
    (auth.jwt() ->> 'role' = 'admin') OR 
    (auth.jwt() ->> 'role' = 'agent') OR 
    (id = auth.uid())
  );

CREATE POLICY member_own_family ON family_members
  FOR ALL USING (
    (auth.jwt() ->> 'role' = 'admin') OR 
    (auth.jwt() ->> 'role' = 'agent') OR 
    (primary_user_id = auth.uid())
  );

CREATE POLICY member_own_subscriptions ON subscriptions
  FOR ALL USING (
    (auth.jwt() ->> 'role' = 'admin') OR 
    (auth.jwt() ->> 'role' = 'agent') OR 
    (user_id = auth.uid())
  );

CREATE POLICY member_own_payments ON payments
  FOR ALL USING (
    (auth.jwt() ->> 'role' = 'admin') OR 
    (auth.jwt() ->> 'role' = 'agent') OR 
    (user_id = auth.uid())
  );

-- Agents can only see their own commissions
CREATE POLICY agent_own_commissions ON commissions
  FOR ALL USING (
    (auth.jwt() ->> 'role' = 'admin') OR 
    (agent_id = auth.uid())
  );

-- Email validation function
CREATE OR REPLACE FUNCTION validate_email()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    -- Basic email validation
    IF NEW.email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
      RAISE EXCEPTION 'Invalid email format';
    END IF;
    -- Convert to lowercase
    NEW.email := LOWER(NEW.email);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create email validation triggers
CREATE TRIGGER validate_user_email 
  BEFORE INSERT OR UPDATE ON users 
  FOR EACH ROW EXECUTE FUNCTION validate_email();

-- Audit trail for sensitive data access
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  accessed_user_id TEXT,
  timestamp TIMESTAMP DEFAULT NOW(),
  ip_address INET
);

-- Function to log sensitive data access
CREATE OR REPLACE FUNCTION log_sensitive_access()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (table_name, user_id, action, accessed_user_id)
  VALUES (TG_TABLE_NAME, auth.uid(), TG_OP, COALESCE(NEW.id, OLD.id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- RLS Policies for Plans (read-only for all authenticated users)
CREATE POLICY plans_read_all ON plans
  FOR SELECT USING (auth.role() = 'authenticated');

-- RLS Policies for Leads (agents can see assigned leads, admins see all)
CREATE POLICY leads_agent_assigned ON leads
  FOR ALL USING (
    (auth.jwt() ->> 'role' = 'admin') OR 
    (auth.jwt() ->> 'role' = 'agent' AND assigned_agent_id = auth.uid())
  );

-- RLS Policies for Lead Activities
CREATE POLICY lead_activities_agent_access ON lead_activities
  FOR ALL USING (
    (auth.jwt() ->> 'role' = 'admin') OR 
    (auth.jwt() ->> 'role' = 'agent' AND agent_id = auth.uid())
  );

-- RLS Policies for Enrollment Modifications (admins and involved agents only)
CREATE POLICY enrollment_modifications_admin_agent ON enrollment_modifications
  FOR ALL USING (
    (auth.jwt() ->> 'role' = 'admin') OR 
    (auth.jwt() ->> 'role' = 'agent' AND modified_by = auth.uid())
  );

-- RLS Policies for Audit Log (admins only)
CREATE POLICY audit_log_admin_only ON audit_log
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Create audit triggers for sensitive tables
CREATE TRIGGER audit_users 
  AFTER SELECT OR INSERT OR UPDATE OR DELETE ON users 
  FOR EACH ROW EXECUTE FUNCTION log_sensitive_access();

CREATE TRIGGER audit_family_members 
  AFTER SELECT OR INSERT OR UPDATE OR DELETE ON family_members 
  FOR EACH ROW EXECUTE FUNCTION log_sensitive_access();

CREATE TRIGGER audit_payments 
  AFTER SELECT OR INSERT OR UPDATE OR DELETE ON payments 
  FOR EACH ROW EXECUTE FUNCTION log_sensitive_access();
