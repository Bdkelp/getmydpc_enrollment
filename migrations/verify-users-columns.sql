-- Verify all required columns exist in users table for registration
-- Run this in Supabase SQL Editor to identify missing columns

SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN (
    'email',
    'first_name',
    'last_name',
    'middle_name',
    'phone',
    'date_of_birth',
    'gender',
    'ssn',
    'address',
    'address2',
    'city',
    'state',
    'zip_code',
    'employer_name',
    'date_of_hire',
    'member_type',
    'plan_start_date',
    'agent_number',
    'enrolled_by_agent_id',
    'is_active',
    'email_verified',
    'terms_accepted',
    'privacy_accepted',
    'privacy_notice_acknowledged',
    'sms_consent',
    'communications_consent',
    'faq_downloaded',
    'plan_id',
    'coverage_type',
    'total_monthly_price',
    'add_rx_valet',
    'role'
)
ORDER BY column_name;

-- Count how many columns we found
SELECT COUNT(*) as found_columns FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN (
    'email', 'first_name', 'last_name', 'middle_name', 'phone', 
    'date_of_birth', 'gender', 'ssn', 'address', 'address2', 
    'city', 'state', 'zip_code', 'employer_name', 'date_of_hire', 
    'member_type', 'plan_start_date', 'agent_number', 'enrolled_by_agent_id', 
    'is_active', 'email_verified', 'terms_accepted', 'privacy_accepted', 
    'privacy_notice_acknowledged', 'sms_consent', 'communications_consent', 
    'faq_downloaded', 'plan_id', 'coverage_type', 'total_monthly_price', 
    'add_rx_valet', 'role'
);

-- Expected: 32 columns
