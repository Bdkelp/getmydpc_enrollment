-- =====================================================
-- TEST DATA CLEANUP SCRIPT
-- Keep Last 20 Enrollments for EPX Visibility
-- =====================================================
-- 
-- Purpose: Clean all test enrollments except the most recent 20
--          EPX wants to see recent enrollments for transaction visibility
--
-- Affected Tables:
--   - users (where role='member' or role='user') [AFTER member migration]
--   - subscriptions
--   - payments
--   - commissions
--   - family_members
--
-- Safety: Includes verification queries before and after
--
-- Author: System
-- Date: 2025-10-10
-- =====================================================

-- =====================================================
-- STEP 0: PRE-CLEANUP VERIFICATION
-- =====================================================

-- Check current counts
SELECT 'BEFORE CLEANUP - Data Counts' as step;

SELECT 
    (SELECT COUNT(*) FROM users WHERE role IN ('member', 'user')) as member_users,
    (SELECT COUNT(*) FROM subscriptions) as total_subscriptions,
    (SELECT COUNT(*) FROM payments) as total_payments,
    (SELECT COUNT(*) FROM commissions) as total_commissions,
    (SELECT COUNT(*) FROM family_members) as total_family_members;

-- Show oldest and newest enrollments
SELECT 'Oldest 5 Enrollments' as info, id, user_id, plan_name, created_at 
FROM subscriptions 
ORDER BY created_at ASC 
LIMIT 5;

SELECT 'Newest 5 Enrollments' as info, id, user_id, plan_name, created_at 
FROM subscriptions 
ORDER BY created_at DESC 
LIMIT 5;

-- =====================================================
-- STEP 1: IDENTIFY LAST 20 ENROLLMENTS TO KEEP
-- =====================================================

-- Create temporary table with IDs to KEEP
CREATE TEMP TABLE enrollments_to_keep AS
SELECT 
    s.id as subscription_id,
    s.user_id,
    s.created_at,
    s.plan_name
FROM subscriptions s
ORDER BY s.created_at DESC
LIMIT 20;

-- Show what we're keeping
SELECT 'KEEPING THESE 20 ENROLLMENTS' as step;
SELECT * FROM enrollments_to_keep ORDER BY created_at DESC;

-- Create temporary table with IDs to DELETE
CREATE TEMP TABLE enrollments_to_delete AS
SELECT 
    s.id as subscription_id,
    s.user_id
FROM subscriptions s
WHERE s.id NOT IN (SELECT subscription_id FROM enrollments_to_keep);

-- Show what we're deleting
SELECT 'DELETING THESE ENROLLMENTS' as step;
SELECT COUNT(*) as count_to_delete FROM enrollments_to_delete;

-- Show sample of what will be deleted
SELECT 
    s.id,
    s.user_id,
    s.plan_name,
    s.created_at,
    u.email,
    u.first_name,
    u.last_name
FROM subscriptions s
LEFT JOIN users u ON s.user_id = u.id
WHERE s.id IN (SELECT subscription_id FROM enrollments_to_delete)
ORDER BY s.created_at ASC
LIMIT 10;

-- =====================================================
-- STEP 2: DELETE RELATED DATA (Preserve Foreign Keys)
-- =====================================================

-- IMPORTANT: Delete in order to respect foreign key constraints
-- Order: commissions -> payments -> family_members -> subscriptions -> users

SELECT 'STEP 2A: Deleting Commissions' as step;

-- Delete commissions for old subscriptions
DELETE FROM commissions
WHERE subscription_id IN (SELECT subscription_id FROM enrollments_to_delete);

SELECT 'Commissions deleted: ' || ROW_COUNT() as result;

-- =====================================================

SELECT 'STEP 2B: Deleting Payments' as step;

-- Delete payments for old subscriptions
DELETE FROM payments
WHERE subscription_id IN (SELECT subscription_id FROM enrollments_to_delete);

SELECT 'Payments deleted: ' || ROW_COUNT() as result;

-- =====================================================

SELECT 'STEP 2C: Deleting Family Members' as step;

-- Delete family members linked to users being deleted
DELETE FROM family_members
WHERE primary_user_id IN (SELECT user_id FROM enrollments_to_delete);

SELECT 'Family members deleted: ' || ROW_COUNT() as result;

-- =====================================================

SELECT 'STEP 2D: Deleting Old Subscriptions' as step;

-- Delete old subscriptions
DELETE FROM subscriptions
WHERE id IN (SELECT subscription_id FROM enrollments_to_delete);

SELECT 'Subscriptions deleted: ' || ROW_COUNT() as result;

-- =====================================================

SELECT 'STEP 2E: Deleting Old Member Users' as step;

-- Delete users (members only) whose subscriptions were deleted
-- NOTE: Only delete if they have NO remaining subscriptions
DELETE FROM users
WHERE id IN (
    SELECT user_id 
    FROM enrollments_to_delete
    WHERE user_id NOT IN (SELECT DISTINCT user_id FROM subscriptions WHERE user_id IS NOT NULL)
)
AND role IN ('member', 'user');

SELECT 'Member users deleted: ' || ROW_COUNT() as result;

-- =====================================================
-- STEP 3: POST-CLEANUP VERIFICATION
-- =====================================================

SELECT 'AFTER CLEANUP - Data Counts' as step;

SELECT 
    (SELECT COUNT(*) FROM users WHERE role IN ('member', 'user')) as member_users_remaining,
    (SELECT COUNT(*) FROM subscriptions) as subscriptions_remaining,
    (SELECT COUNT(*) FROM payments) as payments_remaining,
    (SELECT COUNT(*) FROM commissions) as commissions_remaining,
    (SELECT COUNT(*) FROM family_members) as family_members_remaining;

-- Verify we kept exactly 20 subscriptions
SELECT 'Verification: Should have exactly 20 subscriptions' as check;
SELECT COUNT(*) as actual_count, 
       CASE WHEN COUNT(*) = 20 THEN '✅ PASS' ELSE '❌ FAIL' END as status
FROM subscriptions;

-- Show what we kept
SELECT 'FINAL: These 20 Enrollments Were Kept' as step;
SELECT 
    s.id,
    s.user_id,
    s.plan_name,
    s.member_type,
    s.status,
    s.created_at,
    u.email,
    u.first_name,
    u.last_name
FROM subscriptions s
LEFT JOIN users u ON s.user_id = u.id
ORDER BY s.created_at DESC;

-- Check for orphaned records (should be 0)
SELECT 'Orphan Check: Payments without subscription' as check;
SELECT COUNT(*) as orphaned_payments,
       CASE WHEN COUNT(*) = 0 THEN '✅ PASS' ELSE '❌ FAIL' END as status
FROM payments
WHERE subscription_id NOT IN (SELECT id FROM subscriptions);

SELECT 'Orphan Check: Commissions without subscription' as check;
SELECT COUNT(*) as orphaned_commissions,
       CASE WHEN COUNT(*) = 0 THEN '✅ PASS' ELSE '❌ FAIL' END as status
FROM commissions
WHERE subscription_id NOT IN (SELECT id FROM subscriptions);

-- =====================================================
-- STEP 4: CLEANUP TEMPORARY TABLES
-- =====================================================

DROP TABLE IF EXISTS enrollments_to_keep;
DROP TABLE IF EXISTS enrollments_to_delete;

SELECT '✅ TEST DATA CLEANUP COMPLETE!' as status;

-- =====================================================
-- NOTES FOR FUTURE COMPLETE CLEANUP
-- =====================================================
-- When ready to clean ALL test data (even the last 20):
--
-- 1. Delete all commissions:
--    DELETE FROM commissions;
--
-- 2. Delete all payments:
--    DELETE FROM payments;
--
-- 3. Delete all family members:
--    DELETE FROM family_members;
--
-- 4. Delete all subscriptions:
--    DELETE FROM subscriptions;
--
-- 5. Delete all member users:
--    DELETE FROM users WHERE role IN ('member', 'user');
--
-- 6. Reset sequences (optional):
--    ALTER SEQUENCE subscriptions_id_seq RESTART WITH 1;
--    ALTER SEQUENCE payments_id_seq RESTART WITH 1;
--    ALTER SEQUENCE commissions_id_seq RESTART WITH 1;
--    ALTER SEQUENCE family_members_id_seq RESTART WITH 1;
--
-- =====================================================
