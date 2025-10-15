-- Fix SSN column to handle encrypted data
-- SSN is optional and stored encrypted, which is longer than 9 chars

ALTER TABLE members 
ALTER COLUMN ssn TYPE VARCHAR(255);

-- Add comment explaining the column stores encrypted data
COMMENT ON COLUMN members.ssn IS 'Encrypted SSN data (optional) - stored as hex string with IV prefix';
