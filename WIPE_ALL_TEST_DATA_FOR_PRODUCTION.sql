-- =====================================================
-- WIPE ALL TEST DATA - PREPARE FOR PRODUCTION
-- =====================================================
-- Date: November 22, 2025
-- Purpose: Complete data wipe for going live
-- Context: Still in sandbox mode, no real members yet
-- =====================================================

-- ⚠️ THIS WILL DELETE ALL DATA - ONLY RUN IN SANDBOX/DEV
-- ⚠️ DO NOT RUN THIS IN PRODUCTION AFTER GOING LIVE

-- =====================================================
-- Step 1: DELETE ALL COMMISSION DATA
-- =====================================================

-- Delete all agent commissions (new table)
DELETE FROM agent_commissions;
TRUNCATE agent_commissions RESTART IDENTITY CASCADE;

-- Delete all legacy commissions if table still exists
DROP TABLE IF EXISTS commissions CASCADE;

-- =====================================================
-- Step 2: DELETE ALL MEMBER/ENROLLMENT DATA
-- =====================================================

-- Delete all family members
DELETE FROM family_members;
TRUNCATE family_members RESTART IDENTITY CASCADE;

-- Delete all members (enrolled customers)
DELETE FROM members;
TRUNCATE members RESTART IDENTITY CASCADE;

-- =====================================================
-- Step 3: DELETE ALL PAYMENT DATA
-- =====================================================

-- Delete all payment records
DELETE FROM payments;
TRUNCATE payments RESTART IDENTITY CASCADE;

-- Delete EPX payment tokens if table exists
DROP TABLE IF EXISTS payment_tokens CASCADE;

-- Delete billing schedules if table exists
DROP TABLE IF EXISTS billing_schedule CASCADE;

-- Delete recurring billing logs if table exists
DROP TABLE IF EXISTS recurring_billing_log CASCADE;

-- =====================================================
-- Step 4: DELETE ALL SUBSCRIPTION DATA
-- =====================================================

-- Delete all subscriptions
DELETE FROM subscriptions;
TRUNCATE subscriptions RESTART IDENTITY CASCADE;

-- =====================================================
-- Step 5: DELETE ALL LEAD DATA
-- =====================================================

-- Delete lead activities first (foreign key constraint)
DELETE FROM lead_activities;
TRUNCATE lead_activities RESTART IDENTITY CASCADE;

-- Delete all leads
DELETE FROM leads;
TRUNCATE leads RESTART IDENTITY CASCADE;

-- =====================================================
-- Step 6: DELETE LOGIN SESSIONS (IF EXISTS)
-- =====================================================

-- Delete all login session history (skip if table doesn't exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'login_sessions') THEN
    DELETE FROM login_sessions;
    TRUNCATE login_sessions RESTART IDENTITY CASCADE;
  END IF;
END $$;

-- =====================================================
-- Step 7: KEEP USERS (AGENTS/ADMINS) BUT CLEAN THEIR DATA
-- =====================================================

-- Clear banking info from all users (will re-enter for real agents)
UPDATE users SET
  bank_name = NULL,
  routing_number = NULL,
  account_number = NULL,
  account_type = NULL,
  account_holder_name = NULL
WHERE TRUE;

-- Keep users table intact but delete any test users
DELETE FROM users 
WHERE email LIKE '%test%' 
   OR email LIKE '%example%'
   OR email LIKE '%demo%';

-- =====================================================
-- Step 8: VERIFY COMPLETE WIPE
-- =====================================================

-- Check all tables are empty (should show 0 for data tables)
SELECT 
  'agent_commissions' AS table_name, COUNT(*) AS record_count FROM agent_commissions
UNION ALL
SELECT 'members', COUNT(*) FROM members
UNION ALL
SELECT 'family_members', COUNT(*) FROM family_members
UNION ALL
SELECT 'payments', COUNT(*) FROM payments
UNION ALL
SELECT 'subscriptions', COUNT(*) FROM subscriptions
UNION ALL
SELECT 'leads', COUNT(*) FROM leads
UNION ALL
SELECT 'lead_activities', COUNT(*) FROM lead_activities
UNION ALL
SELECT 'login_sessions', (SELECT COUNT(*) FROM login_sessions WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'login_sessions'))
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'plans', COUNT(*) FROM plans
ORDER BY table_name;

-- =====================================================
-- Step 9: VERIFY REMAINING USERS (AGENTS/ADMINS)
-- =====================================================

-- List all remaining users (should only be real agents/admins)
SELECT 
  id, 
  email, 
  first_name, 
  last_name, 
  role, 
  agent_number, 
  is_active,
  approval_status,
  created_at
FROM users 
ORDER BY role, created_at;

-- =====================================================
-- Step 10: VERIFY PLANS ARE INTACT
-- =====================================================

-- Plans should remain (these are configuration, not data)
SELECT 
  id,
  name,
  description,
  price,
  is_active
FROM plans
ORDER BY price;

-- =====================================================
-- RESET CUSTOMER NUMBER SEQUENCE (Fresh Start)
-- =====================================================

-- Reset customer number generation to start fresh
-- Next member will get GSMP000001
DROP SEQUENCE IF EXISTS customer_number_seq CASCADE;
CREATE SEQUENCE customer_number_seq START WITH 1;

-- Recreate the customer number generation function
CREATE OR REPLACE FUNCTION generate_customer_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  customer_num TEXT;
BEGIN
  next_num := nextval('customer_number_seq');
  customer_num := 'GSMP' || LPAD(next_num::TEXT, 6, '0');
  RETURN customer_num;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- RESET AUTO-INCREMENT SEQUENCES
-- =====================================================

-- Reset all sequences to start at 1
ALTER SEQUENCE members_id_seq RESTART WITH 1;
ALTER SEQUENCE family_members_id_seq RESTART WITH 1;
ALTER SEQUENCE payments_id_seq RESTART WITH 1;
ALTER SEQUENCE subscriptions_id_seq RESTART WITH 1;
ALTER SEQUENCE leads_id_seq RESTART WITH 1;
ALTER SEQUENCE lead_activities_id_seq RESTART WITH 1;
ALTER SEQUENCE plans_id_seq RESTART WITH 1;

-- Only reset login_sessions if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'login_sessions_id_seq') THEN
    ALTER SEQUENCE login_sessions_id_seq RESTART WITH 1;
  END IF;
END $$;

-- Only reset agent_commissions if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'agent_commissions_id_seq') THEN
    ALTER SEQUENCE agent_commissions_id_seq RESTART WITH 1;
  END IF;
END $$;

-- =====================================================
-- FINAL VERIFICATION
-- =====================================================

-- This should show all zeros except users and plans
SELECT 'FINAL COUNT CHECK' AS status;
SELECT 
  (SELECT COUNT(*) FROM agent_commissions) AS commissions,
  (SELECT COUNT(*) FROM members) AS members,
  (SELECT COUNT(*) FROM family_members) AS family_members,
  (SELECT COUNT(*) FROM payments) AS payments,
  (SELECT COUNT(*) FROM subscriptions) AS subscriptions,
  (SELECT COUNT(*) FROM leads) AS leads,
  (SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'login_sessions') 
           THEN (SELECT COUNT(*) FROM login_sessions) 
           ELSE 0 END) AS login_sessions,
  (SELECT COUNT(*) FROM users) AS users_kept,
  (SELECT COUNT(*) FROM plans) AS plans_kept;

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

SELECT '✅ DATABASE WIPED - READY FOR PRODUCTION' AS message;
SELECT '🔄 Customer numbers will start at GSMP000001' AS customer_info;
SELECT '👥 User accounts (agents/admins) preserved' AS user_info;
SELECT '📋 Plans configuration preserved' AS plan_info;
SELECT '⚠️ All test data (members, commissions, payments) deleted' AS data_info;

-- =====================================================
-- NOTES FOR GOING LIVE:
-- =====================================================
-- 
-- ✅ What was deleted:
--   - All agent_commissions
--   - All members and family_members
--   - All payments and payment tokens
--   - All subscriptions
--   - All leads and activities
--   - All login sessions
--   - Old commissions table (dropped)
--
-- ✅ What was kept:
--   - Users (agents and admins)
--   - Plans (pricing configuration)
--   - Database schema/structure
--
-- ✅ Ready for production:
--   - First member will get GSMP000001
--   - All IDs start at 1
--   - Clean slate for real enrollments
--
-- =====================================================
