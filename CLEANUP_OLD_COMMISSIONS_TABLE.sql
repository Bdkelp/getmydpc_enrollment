-- =====================================================
-- CLEANUP OLD COMMISSIONS TABLE & TEST DATA
-- =====================================================
-- Date: November 22, 2025
-- Purpose: Remove legacy commissions table and clean test data
-- Safety: Keeps only 3 real memberships currently in production
-- =====================================================

-- Step 1: BACKUP Current Data (Optional - run if you want a backup)
-- Uncomment these lines to create backup tables before cleanup:
-- CREATE TABLE commissions_backup AS SELECT * FROM commissions;
-- CREATE TABLE members_backup AS SELECT * FROM members;
-- CREATE TABLE users_backup AS SELECT * FROM users;
-- CREATE TABLE subscriptions_backup AS SELECT * FROM subscriptions;

-- =====================================================
-- Step 2: IDENTIFY THE 3 REAL MEMBERSHIPS TO KEEP
-- =====================================================
-- Run this query first to identify which members/users to keep:
-- SELECT id, email, first_name, last_name, customer_number, created_at 
-- FROM members 
-- WHERE status = 'active' 
-- ORDER BY created_at DESC 
-- LIMIT 10;

-- =====================================================
-- Step 3: DELETE ALL TEST DATA (EXCEPT REAL MEMBERS)
-- =====================================================

-- Delete test leads (keep only real leads if any)
DELETE FROM leads 
WHERE email LIKE '%test%' 
   OR email LIKE '%example%'
   OR first_name LIKE '%Test%';

-- Delete test login sessions (skip if table doesn't exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'login_sessions') THEN
    DELETE FROM login_sessions 
    WHERE user_id IN (
      SELECT id FROM users WHERE email LIKE '%test%'
    );
  END IF;
END $$;

-- Delete test subscriptions
DELETE FROM subscriptions 
WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE '%test%'
);

-- Delete ALL data from old commissions table (it's being deprecated)
DELETE FROM commissions;

-- Delete test members (UPDATE THE WHERE CLAUSE TO MATCH YOUR 3 REAL MEMBERS)
-- Example: Keep only members with specific emails or customer numbers
-- DELETE FROM members 
-- WHERE email NOT IN (
--   'real-member-1@email.com',
--   'real-member-2@email.com', 
--   'real-member-3@email.com'
-- );

-- Delete test users (agents/admins - keep only real ones)
-- UPDATE THE WHERE CLAUSE TO MATCH YOUR REAL USERS
-- DELETE FROM users 
-- WHERE email NOT IN (
--   'travis@mypremierplans.com',
--   'joaquin@mypremierplans.com',
--   'richard@cyariskmanagement.com',
--   'mdkeener@gmail.com',
--   -- Add other real agent/admin emails
-- );

-- Clean up orphaned agent_commissions
DELETE FROM agent_commissions 
WHERE member_id NOT IN (SELECT id::text FROM members);

DELETE FROM agent_commissions 
WHERE agent_id NOT IN (SELECT id FROM users);

-- =====================================================
-- Step 4: DROP OLD COMMISSIONS TABLE
-- =====================================================

-- Drop foreign key constraints first (if they exist)
-- ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_agent_id_fkey;
-- ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_user_id_fkey;
-- ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_subscription_id_fkey;
-- ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_member_id_fkey;

-- Drop indexes
DROP INDEX IF EXISTS idx_commissions_member_id;
DROP INDEX IF EXISTS idx_commissions_agent_number;
DROP INDEX IF EXISTS idx_commissions_agent_id;
DROP INDEX IF EXISTS idx_commissions_user_id;
DROP INDEX IF EXISTS idx_commissions_subscription_id;

-- Drop the table
DROP TABLE IF EXISTS commissions CASCADE;

-- =====================================================
-- Step 5: VERIFY CLEANUP
-- =====================================================

-- Check remaining data counts:
SELECT 
  (SELECT COUNT(*) FROM members) AS members_count,
  (SELECT COUNT(*) FROM users) AS users_count,
  (SELECT COUNT(*) FROM agent_commissions) AS agent_commissions_count,
  (SELECT COUNT(*) FROM leads) AS leads_count,
  (SELECT COUNT(*) FROM subscriptions) AS subscriptions_count;

-- List remaining members:
SELECT id, email, first_name, last_name, customer_number, status, created_at 
FROM members 
ORDER BY created_at DESC;

-- List remaining users:
SELECT id, email, first_name, last_name, role, agent_number, is_active 
FROM users 
ORDER BY created_at DESC;

-- List remaining commissions in new table:
SELECT id, agent_id, member_id, commission_amount, payment_status, created_at 
FROM agent_commissions 
ORDER BY created_at DESC;

-- =====================================================
-- Step 6: RESET SEQUENCES (Optional)
-- =====================================================
-- If you want to reset auto-increment IDs after cleanup:

-- SELECT setval('members_id_seq', (SELECT MAX(id) FROM members));
-- SELECT setval('leads_id_seq', (SELECT MAX(id) FROM leads));
-- SELECT setval('plans_id_seq', (SELECT MAX(id) FROM plans));

-- =====================================================
-- NOTES:
-- =====================================================
-- 1. The old 'commissions' table is now completely removed
-- 2. All commission data should use 'agent_commissions' table
-- 3. Members are in 'members' table (not 'users' table)
-- 4. Agent_commissions_with_details is a VIEW, not a table
-- 5. Before running, customize the DELETE statements to match
--    your 3 real memberships
-- =====================================================
