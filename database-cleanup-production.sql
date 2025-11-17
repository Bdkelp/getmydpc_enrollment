-- Production Database Cleanup Script
-- WARNING: This script deletes all but 5 test enrollments
-- IMPORTANT: Backup your database before running this!

-- Step 1: Identify enrollments to keep (top 5 most recent)
-- Run this first to verify which enrollments will be deleted
SELECT 
  id, 
  member_name, 
  email, 
  plan, 
  created_at,
  status
FROM enrollments 
ORDER BY created_at DESC
LIMIT 10;

-- Step 2: Store the IDs of enrollments to keep
-- These will be the 5 most recent valid enrollments
CREATE TEMP TABLE enrollments_to_keep AS
SELECT id FROM enrollments 
ORDER BY created_at DESC 
LIMIT 5;

-- Step 3: Delete all orphaned test data
-- First, identify enrollments to delete
CREATE TEMP TABLE enrollments_to_delete AS
SELECT id FROM enrollments 
WHERE id NOT IN (SELECT id FROM enrollments_to_keep);

-- Delete agent commissions for deleted enrollments
DELETE FROM agent_commissions 
WHERE enrollment_id IN (SELECT id FROM enrollments_to_delete);

-- Delete members associated with deleted enrollments
DELETE FROM members 
WHERE enrollment_id IN (SELECT id FROM enrollments_to_delete);

-- Delete the enrollments themselves
DELETE FROM enrollments 
WHERE id IN (SELECT id FROM enrollments_to_delete);

-- Step 4: Clean up user activity and sessions (test data)
-- Keep only recent activity from the past 30 days
DELETE FROM user_activity 
WHERE created_at < NOW() - INTERVAL '30 days';

-- Delete old sessions
DELETE FROM sessions 
WHERE created_at < NOW() - INTERVAL '7 days';

-- Step 5: Scrub PII from remaining test enrollments
-- Replace with placeholder data for demo purposes
UPDATE enrollments 
SET 
  member_name = CASE 
    WHEN row_number() OVER (ORDER BY created_at ASC) = 1 THEN 'Demo Member 1 - ' || plan
    WHEN row_number() OVER (ORDER BY created_at ASC) = 2 THEN 'Demo Member 2 - ' || plan
    WHEN row_number() OVER (ORDER BY created_at ASC) = 3 THEN 'Demo Member 3 - ' || plan
    WHEN row_number() OVER (ORDER BY created_at ASC) = 4 THEN 'Demo Member 4 - ' || plan
    WHEN row_number() OVER (ORDER BY created_at ASC) = 5 THEN 'Demo Member 5 - ' || plan
    ELSE member_name
  END,
  email = CASE 
    WHEN row_number() OVER (ORDER BY created_at ASC) = 1 THEN 'demo.member.1@demo.local'
    WHEN row_number() OVER (ORDER BY created_at ASC) = 2 THEN 'demo.member.2@demo.local'
    WHEN row_number() OVER (ORDER BY created_at ASC) = 3 THEN 'demo.member.3@demo.local'
    WHEN row_number() OVER (ORDER BY created_at ASC) = 4 THEN 'demo.member.4@demo.local'
    WHEN row_number() OVER (ORDER BY created_at ASC) = 5 THEN 'demo.member.5@demo.local'
    ELSE email
  END,
  phone = CASE 
    WHEN row_number() OVER (ORDER BY created_at ASC) = 1 THEN '(555) 001-0001'
    WHEN row_number() OVER (ORDER BY created_at ASC) = 2 THEN '(555) 001-0002'
    WHEN row_number() OVER (ORDER BY created_at ASC) = 3 THEN '(555) 001-0003'
    WHEN row_number() OVER (ORDER BY created_at ASC) = 4 THEN '(555) 001-0004'
    WHEN row_number() OVER (ORDER BY created_at ASC) = 5 THEN '(555) 001-0005'
    ELSE phone
  END,
  employer = 'Demo Company',
  address = '123 Demo St',
  city = 'Demo City',
  state = 'DM',
  zip = '12345'
WHERE id IN (SELECT id FROM enrollments_to_keep);

-- Step 6: Update members table with placeholder data
UPDATE members 
SET 
  first_name = CASE 
    WHEN enrollments.plan = 'Base' THEN 'Demo'
    WHEN enrollments.plan = 'Plus' THEN 'Demo'
    WHEN enrollments.plan = 'Elite' THEN 'Demo'
    ELSE 'Demo'
  END,
  last_name = CASE 
    WHEN row_number() OVER (ORDER BY members.created_at ASC) % 5 = 1 THEN 'Member 1'
    WHEN row_number() OVER (ORDER BY members.created_at ASC) % 5 = 2 THEN 'Member 2'
    WHEN row_number() OVER (ORDER BY members.created_at ASC) % 5 = 3 THEN 'Member 3'
    WHEN row_number() OVER (ORDER BY members.created_at ASC) % 5 = 4 THEN 'Member 4'
    ELSE 'Member 5'
  END,
  email = 'demo@demo.local',
  phone = '(555) 000-0000',
  dob = '1980-01-01'
FROM enrollments
WHERE members.enrollment_id = enrollments.id
  AND enrollments.id IN (SELECT id FROM enrollments_to_keep);

-- Step 7: Verify cleanup
SELECT 'Enrollments Remaining' as stat, COUNT(*) as count FROM enrollments
UNION ALL
SELECT 'Commission Records', COUNT(*) FROM agent_commissions
UNION ALL
SELECT 'Members', COUNT(*) FROM members
UNION ALL
SELECT 'Recent Activity (30 days)', COUNT(*) FROM user_activity 
  WHERE created_at > NOW() - INTERVAL '30 days';

-- Step 8: Check referential integrity
SELECT 'Orphaned commissions', COUNT(*) FROM agent_commissions 
  WHERE enrollment_id NOT IN (SELECT id FROM enrollments)
UNION ALL
SELECT 'Orphaned members', COUNT(*) FROM members 
  WHERE enrollment_id NOT IN (SELECT id FROM enrollments);

-- Step 9: Cleanup temp tables
DROP TABLE IF EXISTS enrollments_to_keep;
DROP TABLE IF EXISTS enrollments_to_delete;

-- Final confirmation
SELECT 'Database cleanup complete!' as status;
