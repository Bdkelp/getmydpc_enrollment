-- =====================================================
-- PRE-CLEANUP VERIFICATION ONLY
-- Run this FIRST to see what data exists
-- =====================================================
-- 
-- Purpose: Check current state before cleanup
--          NO data is deleted by this script
--
-- Instructions:
-- 1. Copy this entire script
-- 2. Paste into Neon SQL Editor
-- 3. Click "Run"
-- 4. Review the results
-- 5. Decide if you want to proceed with cleanup
--
-- =====================================================

-- Current timestamp
SELECT NOW() as current_time;

-- =====================================================
-- SECTION 1: RECORD COUNTS
-- =====================================================

SELECT '=== CURRENT DATA COUNTS ===' as section;

SELECT 
    (SELECT COUNT(*) FROM users WHERE role IN ('member', 'user')) as member_users,
    (SELECT COUNT(*) FROM users WHERE role IN ('agent', 'admin', 'super_admin')) as staff_users,
    (SELECT COUNT(*) FROM subscriptions) as total_subscriptions,
    (SELECT COUNT(*) FROM payments) as total_payments,
    (SELECT COUNT(*) FROM commissions) as total_commissions,
    (SELECT COUNT(*) FROM family_members) as total_family_members,
    (SELECT COUNT(*) FROM plans) as total_plans;

-- =====================================================
-- SECTION 2: SUBSCRIPTION OVERVIEW
-- =====================================================

SELECT '=== SUBSCRIPTION DATE RANGE ===' as section;

SELECT 
    MIN(created_at) as oldest_enrollment,
    MAX(created_at) as newest_enrollment,
    COUNT(*) as total_count,
    COUNT(DISTINCT user_id) as unique_users
FROM subscriptions;

-- =====================================================
-- SECTION 3: OLDEST 10 ENROLLMENTS (Will be deleted)
-- =====================================================

SELECT '=== OLDEST 10 ENROLLMENTS (WILL BE DELETED) ===' as section;

SELECT 
    s.id as subscription_id,
    s.user_id,
    u.email,
    u.first_name,
    u.last_name,
    s.plan_name,
    s.member_type,
    s.status,
    s.created_at,
    (SELECT COUNT(*) FROM payments WHERE subscription_id = s.id) as payment_count,
    (SELECT COUNT(*) FROM commissions WHERE subscription_id = s.id) as commission_count
FROM subscriptions s
LEFT JOIN users u ON s.user_id = u.id
ORDER BY s.created_at ASC
LIMIT 10;

-- =====================================================
-- SECTION 4: NEWEST 20 ENROLLMENTS (Will be kept)
-- =====================================================

SELECT '=== NEWEST 20 ENROLLMENTS (WILL BE KEPT FOR EPX) ===' as section;

SELECT 
    s.id as subscription_id,
    s.user_id,
    u.email,
    u.first_name,
    u.last_name,
    s.plan_name,
    s.member_type,
    s.status,
    s.created_at,
    (SELECT COUNT(*) FROM payments WHERE subscription_id = s.id) as payment_count,
    (SELECT COUNT(*) FROM commissions WHERE subscription_id = s.id) as commission_count
FROM subscriptions s
LEFT JOIN users u ON s.user_id = u.id
ORDER BY s.created_at DESC
LIMIT 20;

-- =====================================================
-- SECTION 5: AGENT/ADMIN ACCOUNTS (Always preserved)
-- =====================================================

SELECT '=== STAFF ACCOUNTS (WILL BE PRESERVED) ===' as section;

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
WHERE role IN ('agent', 'admin', 'super_admin')
ORDER BY role, created_at;

-- =====================================================
-- SECTION 6: PLAN DEFINITIONS (Always preserved)
-- =====================================================

SELECT '=== PLAN DEFINITIONS (WILL BE PRESERVED) ===' as section;

SELECT * FROM plans ORDER BY name;

-- =====================================================
-- SECTION 7: DELETION IMPACT ESTIMATE
-- =====================================================

SELECT '=== ESTIMATED DELETION IMPACT ===' as section;

WITH enrollments_to_delete AS (
    SELECT id, user_id
    FROM subscriptions
    ORDER BY created_at ASC
    OFFSET 20  -- Keep newest 20, delete the rest
)
SELECT 
    'Subscriptions to delete' as item,
    COUNT(*) as count
FROM enrollments_to_delete

UNION ALL

SELECT 
    'Payments to delete',
    COUNT(*)
FROM payments p
WHERE subscription_id IN (
    SELECT id FROM subscriptions ORDER BY created_at ASC OFFSET 20
)

UNION ALL

SELECT 
    'Commissions to delete',
    COUNT(*)
FROM commissions c
WHERE subscription_id IN (
    SELECT id FROM subscriptions ORDER BY created_at ASC OFFSET 20
)

UNION ALL

SELECT 
    'Family members to delete',
    COUNT(*)
FROM family_members f
WHERE primary_user_id IN (
    SELECT user_id FROM subscriptions ORDER BY created_at ASC OFFSET 20
)

UNION ALL

SELECT 
    'Subscriptions to KEEP',
    20

UNION ALL

SELECT 
    'Payments to KEEP',
    COUNT(*)
FROM payments p
WHERE subscription_id IN (
    SELECT id FROM subscriptions ORDER BY created_at DESC LIMIT 20
)

UNION ALL

SELECT 
    'Commissions to KEEP',
    COUNT(*)
FROM commissions c
WHERE subscription_id IN (
    SELECT id FROM subscriptions ORDER BY created_at DESC LIMIT 20
);

-- =====================================================
-- SECTION 8: DATA QUALITY CHECKS
-- =====================================================

SELECT '=== DATA QUALITY CHECKS ===' as section;

-- Check for orphaned payments
SELECT 
    'Orphaned payments (no subscription)' as check_type,
    COUNT(*) as count,
    CASE WHEN COUNT(*) = 0 THEN '✅ GOOD' ELSE '⚠️ NEEDS ATTENTION' END as status
FROM payments
WHERE subscription_id NOT IN (SELECT id FROM subscriptions);

-- Check for orphaned commissions
SELECT 
    'Orphaned commissions (no subscription)' as check_type,
    COUNT(*) as count,
    CASE WHEN COUNT(*) = 0 THEN '✅ GOOD' ELSE '⚠️ NEEDS ATTENTION' END as status
FROM commissions
WHERE subscription_id NOT IN (SELECT id FROM subscriptions);

-- Check for subscriptions without user
SELECT 
    'Subscriptions without user' as check_type,
    COUNT(*) as count,
    CASE WHEN COUNT(*) = 0 THEN '✅ GOOD' ELSE '⚠️ NEEDS ATTENTION' END as status
FROM subscriptions
WHERE user_id IS NULL;

-- Check for users without subscriptions
SELECT 
    'Member users without subscriptions' as check_type,
    COUNT(*) as count,
    CASE WHEN COUNT(*) > 0 THEN '⚠️ WILL BE DELETED' ELSE '✅ NONE' END as status
FROM users u
WHERE role IN ('member', 'user')
AND id NOT IN (SELECT DISTINCT user_id FROM subscriptions WHERE user_id IS NOT NULL);

-- =====================================================
-- SECTION 9: SUMMARY & RECOMMENDATION
-- =====================================================

SELECT '=== CLEANUP DECISION SUMMARY ===' as section;

SELECT 
    (SELECT COUNT(*) FROM subscriptions) as current_subscription_count,
    20 as will_keep_for_epx,
    (SELECT COUNT(*) FROM subscriptions) - 20 as will_delete,
    CASE 
        WHEN (SELECT COUNT(*) FROM subscriptions) > 20 THEN '✅ Cleanup recommended'
        WHEN (SELECT COUNT(*) FROM subscriptions) = 20 THEN '⚠️ Already have exactly 20'
        ELSE '❌ Less than 20 - DO NOT RUN CLEANUP'
    END as recommendation;

-- =====================================================
-- READY TO PROCEED?
-- =====================================================

SELECT '
╔═══════════════════════════════════════════════════╗
║        VERIFICATION COMPLETE                      ║
║                                                   ║
║  Review the results above carefully.              ║
║                                                   ║
║  If everything looks correct:                     ║
║  → Run clean_test_data_keep_last_20.sql          ║
║                                                   ║
║  If something looks wrong:                        ║
║  → STOP and investigate before cleanup           ║
╚═══════════════════════════════════════════════════╝
' as next_step;
