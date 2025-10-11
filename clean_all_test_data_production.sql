-- =====================================================
-- COMPLETE TEST DATA CLEANUP SCRIPT
-- Delete ALL Test/Demo Data - Production Launch Ready
-- =====================================================
-- 
-- Purpose: Remove ALL test enrollments when ready for production
--          Use this AFTER EPX has reviewed the last 20 enrollments
--
-- ⚠️ WARNING: This deletes ALL member data
--    - All subscriptions
--    - All payments
--    - All commissions
--    - All family members
--    - All users with role='member' or 'user'
--
-- ✅ PRESERVES: Agents, Admins, Plans, System Config
--
-- Author: System
-- Date: 2025-10-10
-- =====================================================

-- =====================================================
-- SAFETY CHECK: Confirm database
-- =====================================================

SELECT 'Database Cleanup - Production Mode' as mode;
SELECT NOW() as cleanup_timestamp;

-- Show what will be deleted
SELECT 'BEFORE CLEANUP - Record Counts' as step;
SELECT 
    (SELECT COUNT(*) FROM users WHERE role IN ('member', 'user')) as member_users,
    (SELECT COUNT(*) FROM subscriptions) as subscriptions,
    (SELECT COUNT(*) FROM payments) as payments,
    (SELECT COUNT(*) FROM commissions) as commissions,
    (SELECT COUNT(*) FROM family_members) as family_members;

-- ⚠️ STOP HERE AND REVIEW COUNTS
-- If these numbers look wrong, DO NOT PROCEED
-- Type "STOP" and investigate

-- =====================================================
-- BACKUP RECOMMENDATION
-- =====================================================

-- Before running this script, create a backup:
--
-- Using Neon Console:
-- 1. Go to your Neon project
-- 2. Click "Backups" tab
-- 3. Create manual backup: "Before Complete Test Data Cleanup"
--
-- Or using pg_dump (if you have access):
-- pg_dump -h <host> -U <user> -d <database> > backup_before_cleanup.sql
--
-- =====================================================

-- Uncomment the following line to proceed with cleanup:
-- SELECT 'Ready to proceed - uncomment DELETE statements below' as status;

-- =====================================================
-- STEP 1: DELETE RELATED DATA (Cascading Order)
-- =====================================================

-- Delete commissions first (no dependencies)
-- UNCOMMENT TO RUN:
-- DELETE FROM commissions;
SELECT 'Step 1: Commissions would be deleted' as step;

-- Delete payments (depends on subscriptions)
-- UNCOMMENT TO RUN:
-- DELETE FROM payments;
SELECT 'Step 2: Payments would be deleted' as step;

-- Delete family members (depends on users)
-- UNCOMMENT TO RUN:
-- DELETE FROM family_members;
SELECT 'Step 3: Family members would be deleted' as step;

-- Delete subscriptions (depends on users)
-- UNCOMMENT TO RUN:
-- DELETE FROM subscriptions;
SELECT 'Step 4: Subscriptions would be deleted' as step;

-- Delete member users (role='member' or 'user')
-- UNCOMMENT TO RUN:
-- DELETE FROM users WHERE role IN ('member', 'user');
SELECT 'Step 5: Member users would be deleted' as step;

-- =====================================================
-- STEP 2: RESET SEQUENCES (Optional - Clean Slate)
-- =====================================================

-- Reset auto-increment counters to start from 1
-- UNCOMMENT TO RUN:
-- ALTER SEQUENCE subscriptions_id_seq RESTART WITH 1;
-- ALTER SEQUENCE payments_id_seq RESTART WITH 1;
-- ALTER SEQUENCE commissions_id_seq RESTART WITH 1;
-- ALTER SEQUENCE family_members_id_seq RESTART WITH 1;

SELECT 'Step 6: Sequences would be reset' as step;

-- =====================================================
-- STEP 3: VERIFICATION (After Uncommenting Deletes)
-- =====================================================

-- Verify all test data removed
SELECT 'AFTER CLEANUP - Record Counts' as step;
SELECT 
    (SELECT COUNT(*) FROM users WHERE role IN ('member', 'user')) as member_users_remaining,
    (SELECT COUNT(*) FROM subscriptions) as subscriptions_remaining,
    (SELECT COUNT(*) FROM payments) as payments_remaining,
    (SELECT COUNT(*) FROM commissions) as commissions_remaining,
    (SELECT COUNT(*) FROM family_members) as family_members_remaining;

-- Expected results (after uncommenting DELETE statements):
-- member_users_remaining: 0
-- subscriptions_remaining: 0
-- payments_remaining: 0
-- commissions_remaining: 0
-- family_members_remaining: 0

-- Verify agents/admins still exist
SELECT 'Agents and Admins - Should Still Exist' as check;
SELECT 
    role,
    COUNT(*) as count
FROM users
WHERE role IN ('agent', 'admin', 'super_admin')
GROUP BY role;

-- Verify plans still exist
SELECT 'Plans - Should Still Exist' as check;
SELECT COUNT(*) as plan_count FROM plans;

-- =====================================================
-- PRODUCTION READY CHECKLIST
-- =====================================================

SELECT 'PRODUCTION READY CHECKLIST' as checklist;

-- 1. All test data removed
-- 2. Agents/admins preserved
-- 3. Plans preserved
-- 4. Database sequences reset
-- 5. System ready for real enrollments

SELECT '
NEXT STEPS AFTER CLEANUP:
✅ 1. Verify agent/admin accounts work
✅ 2. Test enrollment flow with real data
✅ 3. Verify commission creation works
✅ 4. Test payment processing
✅ 5. Check EPX integration
✅ 6. Monitor first real enrollments
✅ 7. Set up production monitoring/alerts
' as next_steps;

-- =====================================================
-- ROLLBACK PLAN
-- =====================================================

-- If something goes wrong and you have a backup:
--
-- 1. Stop the application (Railway)
-- 2. Drop all tables:
--    DROP SCHEMA public CASCADE;
--    CREATE SCHEMA public;
--
-- 3. Restore from backup:
--    psql -h <host> -U <user> -d <database> < backup_before_cleanup.sql
--
-- 4. Restart application
--
-- Or use Neon's restore from backup feature in console
--
-- =====================================================

SELECT '⚠️  SCRIPT COMPLETE - DELETE STATEMENTS ARE COMMENTED OUT' as status;
SELECT '    Uncomment DELETE statements above to execute cleanup' as instruction;
SELECT '    Make sure you have a backup first!' as warning;
