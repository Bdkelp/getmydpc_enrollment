-- Check current column constraints for plans table
SELECT column_name, character_maximum_length, data_type
FROM information_schema.columns
WHERE table_name = 'plans' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Alter name column to allow longer plan names
ALTER TABLE plans ALTER COLUMN name TYPE VARCHAR(100);

-- Verify the change
SELECT column_name, character_maximum_length, data_type
FROM information_schema.columns
WHERE table_name = 'plans' 
  AND column_name = 'name';
