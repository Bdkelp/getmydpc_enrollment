-- Migration: Add Discount Codes System
-- Date: December 1, 2025
-- Description: Create tables for discount code management and member discount tracking

-- Create discount_codes table
CREATE TABLE IF NOT EXISTS discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('fixed', 'percentage')),
  discount_value DECIMAL(10, 2) NOT NULL CHECK (discount_value > 0),
  duration_type VARCHAR(20) NOT NULL CHECK (duration_type IN ('once', 'limited_months', 'indefinite')),
  duration_months INTEGER CHECK (duration_months IS NULL OR duration_months > 0),
  is_active BOOLEAN DEFAULT true,
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  current_uses INTEGER DEFAULT 0,
  valid_from TIMESTAMP,
  valid_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index on code for faster lookups
CREATE INDEX idx_discount_codes_code ON discount_codes(code);
CREATE INDEX idx_discount_codes_is_active ON discount_codes(is_active);
CREATE INDEX idx_discount_codes_created_at ON discount_codes(created_at DESC);

-- Create member_discount_codes tracking table
CREATE TABLE IF NOT EXISTS member_discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  discount_code_id UUID NOT NULL REFERENCES discount_codes(id) ON DELETE RESTRICT,
  discount_amount DECIMAL(10, 2) NOT NULL,
  duration_type VARCHAR(20) NOT NULL,
  months_remaining INTEGER,
  applied_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for member_discount_codes
CREATE INDEX idx_member_discount_codes_member ON member_discount_codes(member_id);
CREATE INDEX idx_member_discount_codes_code ON member_discount_codes(discount_code_id);
CREATE INDEX idx_member_discount_codes_active ON member_discount_codes(is_active);

-- Add discount tracking columns to members table
ALTER TABLE members 
ADD COLUMN IF NOT EXISTS discount_code_id UUID REFERENCES discount_codes(id),
ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS original_price DECIMAL(10, 2);

-- Create trigger to update discount_codes.current_uses when a member uses a code
CREATE OR REPLACE FUNCTION increment_discount_usage()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.discount_code_id IS NOT NULL THEN
    UPDATE discount_codes 
    SET current_uses = current_uses + 1 
    WHERE id = NEW.discount_code_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_discount_usage
  AFTER INSERT ON member_discount_codes
  FOR EACH ROW
  EXECUTE FUNCTION increment_discount_usage();

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_discount_codes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_discount_codes_timestamp
  BEFORE UPDATE ON discount_codes
  FOR EACH ROW
  EXECUTE FUNCTION update_discount_codes_updated_at();

-- Grant permissions to super_admin role
-- Note: Adjust role names based on your actual database roles
DO $$
BEGIN
  -- Grant full access to discount_codes table
  GRANT SELECT, INSERT, UPDATE, DELETE ON discount_codes TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON member_discount_codes TO authenticated;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
  
  EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'Role authenticated does not exist, skipping permission grants';
END $$;

-- Insert sample discount codes for testing (optional - comment out for production)
-- INSERT INTO discount_codes (code, description, discount_type, discount_value, duration_type, is_active)
-- VALUES 
--   ('WELCOME20', 'Welcome discount - $20 off first month', 'fixed', 20.00, 'once', true),
--   ('PBBT2024', 'Professional Bail Bondsmen of Texas 2024 membership discount', 'fixed', 20.00, 'indefinite', true),
--   ('SUMMER10', 'Summer promotion - 10% off for 3 months', 'percentage', 10.00, 'limited_months', true);

-- Update the sample codes with duration_months where applicable
-- UPDATE discount_codes SET duration_months = 3 WHERE code = 'SUMMER10';

COMMENT ON TABLE discount_codes IS 'Stores discount codes for member enrollment promotions';
COMMENT ON TABLE member_discount_codes IS 'Tracks which members are using which discount codes and their remaining duration';
COMMENT ON COLUMN discount_codes.discount_type IS 'Type of discount: fixed (dollar amount) or percentage';
COMMENT ON COLUMN discount_codes.duration_type IS 'How long discount applies: once (first month), limited_months (specific duration), or indefinite (forever)';
COMMENT ON COLUMN discount_codes.current_uses IS 'Number of times this code has been used';
COMMENT ON COLUMN member_discount_codes.months_remaining IS 'For limited_months discounts, tracks how many months of discount remain';
