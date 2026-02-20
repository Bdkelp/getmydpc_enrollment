-- Fix Member ID 10 (Steven Villarreal) - Member/Spouse enrollment
-- Run this in Supabase SQL Editor

BEGIN;

-- 1. Fix the monthly premium (Member/Spouse plan typically $186.16)
UPDATE members
SET total_monthly_price = 186.16
WHERE id = 10;

-- 2. Check if spouse data exists in temp_registrations (if that table exists)
-- SELECT * FROM temp_registrations WHERE member_id = 10 OR email = 'svillarre@icloud.com';

-- 3. Add spouse to family_members table (replace with actual spouse info if you have it)
-- INSERT INTO family_members (
--   primary_member_id,
--   first_name,
--   last_name,
--   relationship,
--   member_type,
--   date_of_birth,
--   gender,
--   is_active
-- ) VALUES (
--   10,
--   'SPOUSE_FIRST_NAME',  -- Replace with actual name
--   'SPOUSE_LAST_NAME',    -- Replace with actual name
--   'spouse',
--   'SP',
--   'YYYY-MM-DD',          -- Replace with actual DOB
--   'GENDER',              -- Replace with M/F
--   true
-- );

COMMIT;

-- To verify the fix:
SELECT 
  m.id,
  m.first_name || ' ' || m.last_name as member_name,
  m.total_monthly_price,
  m.coverage_type,
  COUNT(fm.id) as family_members_count
FROM members m
LEFT JOIN family_members fm ON fm.primary_member_id = m.id
WHERE m.id = 10
GROUP BY m.id, m.first_name, m.last_name, m.total_monthly_price, m.coverage_type;
