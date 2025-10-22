-- Migration: Add customer number generation function
-- This function generates unique 10-character alphanumeric customer numbers
-- Format: Random mix of uppercase letters and numbers for uniqueness

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS generate_customer_number();

-- Create function to generate customer numbers
CREATE OR REPLACE FUNCTION generate_customer_number() 
RETURNS VARCHAR(10) AS $$
DECLARE
  chars VARCHAR := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Excluding ambiguous chars (0,O,1,I)
  new_customer_number VARCHAR(10);
  max_attempts INT := 100;
  attempt INT := 0;
BEGIN
  -- Loop to handle rare collisions
  WHILE attempt < max_attempts LOOP
    -- Generate random 10-character alphanumeric string
    new_customer_number := '';
    FOR i IN 1..10 LOOP
      new_customer_number := new_customer_number || 
        substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    
    -- Check if this number already exists
    IF NOT EXISTS (SELECT 1 FROM members WHERE customer_number = new_customer_number) THEN
      RETURN new_customer_number;
    END IF;
    
    attempt := attempt + 1;
  END LOOP;
  
  -- If we somehow failed after max attempts, raise an error
  RAISE EXCEPTION 'Failed to generate unique customer number after % attempts', max_attempts;
END;
$$ LANGUAGE plpgsql;

-- Update existing members without customer numbers (if any)
-- This handles members that may have been created before this function existed
DO $$
DECLARE
  member_record RECORD;
BEGIN
  FOR member_record IN 
    SELECT id FROM members WHERE customer_number IS NULL OR customer_number = ''
  LOOP
    UPDATE members 
    SET customer_number = generate_customer_number()
    WHERE id = member_record.id;
  END LOOP;
END $$;

-- Create index on customer_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_members_customer_number ON members(customer_number);

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION generate_customer_number() TO PUBLIC;
