-- Change name and description columns to TEXT (unlimited length)
ALTER TABLE plans 
  ALTER COLUMN name TYPE TEXT,
  ALTER COLUMN description TYPE TEXT;

-- Verify the changes
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'plans' 
  AND column_name IN ('name', 'description')
ORDER BY column_name;
