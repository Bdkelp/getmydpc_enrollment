-- Add missing consent and configuration columns to users table
-- These columns track user agreements and feature selections during enrollment

-- Consent columns
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT FALSE;

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS privacy_accepted BOOLEAN DEFAULT FALSE;

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS privacy_notice_acknowledged BOOLEAN DEFAULT FALSE;

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN DEFAULT FALSE;

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS communications_consent BOOLEAN DEFAULT FALSE;

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS faq_downloaded BOOLEAN DEFAULT FALSE;

-- Plan and pricing columns
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS plan_id INTEGER;

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS coverage_type VARCHAR(50);

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS total_monthly_price NUMERIC(10,2);

-- Create indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_users_plan_id ON users(plan_id);
CREATE INDEX IF NOT EXISTS idx_users_coverage_type ON users(coverage_type);
CREATE INDEX IF NOT EXISTS idx_users_terms_accepted ON users(terms_accepted);

-- Verify all columns were added
SELECT 
    column_name, 
    data_type, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN (
    'terms_accepted',
    'privacy_accepted',
    'privacy_notice_acknowledged',
    'sms_consent',
    'communications_consent',
    'faq_downloaded',
    'plan_id',
    'coverage_type',
    'total_monthly_price',
    'add_rx_valet'
)
ORDER BY column_name;
