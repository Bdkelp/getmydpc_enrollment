-- Remove SSN format check constraint since we store encrypted SSN
-- Encrypted SSN is a hex string with IV, not 9 digits

ALTER TABLE members 
DROP CONSTRAINT IF EXISTS check_ssn_format;

-- Add a more flexible constraint that allows encrypted format or NULL
ALTER TABLE members
ADD CONSTRAINT check_ssn_not_empty 
CHECK (ssn IS NULL OR length(ssn) > 0);
