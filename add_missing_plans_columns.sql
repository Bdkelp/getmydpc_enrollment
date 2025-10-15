-- Add missing columns to plans table in Supabase
ALTER TABLE plans 
ADD COLUMN IF NOT EXISTS features JSONB,
ADD COLUMN IF NOT EXISTS max_members INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Show the updated structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'plans' 
ORDER BY ordinal_position;
