-- =====================================================
-- CLEAN ENROLLMENT/MEMBER DATA ONLY
-- Keep Agents, Admins, and System Configuration
-- =====================================================
-- 
-- Purpose: Remove test enrollment/member data while preserving:
--   ✅ Agents (role='agent')
--   ✅ Admins (role='admin', 'super_admin')
--   ✅ Plans table
--   ✅ System configuration
--
-- Removes:
--   ❌ Members (role='member', 'user')
--   ❌ Subscriptions
--   ❌ Payments
--   ❌ Commissions
--   ❌ Family members
--   ❌ Leads
--
-- Use Case: Starting fresh with Supabase, cleaning test data
-- Date: 2025-10-12
-- =====================================================

BEGIN;

-- =====================================================
-- STEP 1: SHOW WHAT WILL BE DELETED
-- =====================================================

SELECT '═══════════════════════════════════════════════════' as separator;
SELECT 'ENROLLMENT DATA CLEANUP PREVIEW' as title;
SELECT '═══════════════════════════════════════════════════' as separator;

SELECT 
    'Members/Users to Delete' as category,
    COUNT(*) as count
FROM users 
WHERE role IN ('member', 'user');

SELECT 
    'Subscriptions to Delete' as category,
    COUNT(*) as count
FROM subscriptions;

SELECT 
    'Payments to Delete' as category,
    COUNT(*) as count
FROM payments;

SELECT 
    'Commissions to Delete' as category,
    COUNT(*) as count
FROM commissions;

SELECT 
    'Family Members to Delete' as category,
    COUNT(*) as count
FROM family_members;

SELECT 
    'Leads to Delete' as category,
    COUNT(*) as count
FROM leads;

SELECT '─────────────────────────────────────────────────────' as separator;

-- =====================================================
-- STEP 2: SHOW WHAT WILL BE PRESERVED
-- =====================================================

SELECT 
    'Agents/Admins to KEEP' as category,
    role,
    COUNT(*) as count
FROM users 
WHERE role IN ('agent', 'admin', 'super_admin')
GROUP BY role;

SELECT 
    'Plans to KEEP' as category,
    COUNT(*) as count
FROM plans;

SELECT '═══════════════════════════════════════════════════' as separator;
SELECT 'Review counts above. Type COMMIT to proceed or ROLLBACK to cancel.' as instruction;
SELECT '═══════════════════════════════════════════════════' as separator;

-- ⚠️ PAUSE HERE - Review the counts above before proceeding
-- If counts look wrong, type: ROLLBACK;
-- If counts look correct, continue to next section

-- =====================================================
-- STEP 3: DELETE ENROLLMENT DATA (Cascading Order)
-- =====================================================

-- Delete in proper order to respect foreign keys

-- 1. Delete commissions (references subscriptions)
DELETE FROM commissions 
WHERE subscription_id IN (
    SELECT id FROM subscriptions 
    WHERE user_id IN (
        SELECT id FROM users WHERE role IN ('member', 'user')
    )
);

SELECT 'Deleted commissions' as status;

-- 2. Delete payments (references subscriptions)
DELETE FROM payments 
WHERE subscription_id IN (
    SELECT id FROM subscriptions 
    WHERE user_id IN (
        SELECT id FROM users WHERE role IN ('member', 'user')
    )
);

SELECT 'Deleted payments' as status;

-- 3. Delete family members (references users)
DELETE FROM family_members 
WHERE user_id IN (
    SELECT id FROM users WHERE role IN ('member', 'user')
);

SELECT 'Deleted family members' as status;

-- 4. Delete subscriptions (references users)
DELETE FROM subscriptions 
WHERE user_id IN (
    SELECT id FROM users WHERE role IN ('member', 'user')
);

SELECT 'Deleted subscriptions' as status;

-- 5. Delete leads (may reference users or be independent)
DELETE FROM leads 
WHERE assigned_agent_id IN (
    SELECT id FROM users WHERE role IN ('member', 'user')
)
OR contact_email IN (
    SELECT email FROM users WHERE role IN ('member', 'user')
);

SELECT 'Deleted leads' as status;

-- 6. Delete member users (main table)
DELETE FROM users 
WHERE role IN ('member', 'user');

SELECT 'Deleted member users' as status;

-- =====================================================
-- STEP 4: RESET SEQUENCES FOR CLEAN START
-- =====================================================

-- Reset auto-increment counters
-- This makes the next enrollment start at ID=1

ALTER SEQUENCE IF EXISTS subscriptions_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS payments_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS commissions_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS family_members_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS leads_id_seq RESTART WITH 1;

SELECT 'Reset sequences' as status;

-- =====================================================
-- STEP 5: VERIFICATION
-- =====================================================

SELECT '═══════════════════════════════════════════════════' as separator;
SELECT 'CLEANUP VERIFICATION' as title;
SELECT '═══════════════════════════════════════════════════' as separator;

-- Should all be 0
SELECT 
    'Members/Users Remaining' as category,
    COUNT(*) as count
FROM users 
WHERE role IN ('member', 'user');

SELECT 
    'Subscriptions Remaining' as category,
    COUNT(*) as count
FROM subscriptions;

SELECT 
    'Payments Remaining' as category,
    COUNT(*) as count
FROM payments;

SELECT 
    'Commissions Remaining' as category,
    COUNT(*) as count
FROM commissions;

SELECT 
    'Family Members Remaining' as category,
    COUNT(*) as count
FROM family_members;

SELECT 
    'Leads Remaining' as category,
    COUNT(*) as count
FROM leads;

SELECT '─────────────────────────────────────────────────────' as separator;

-- Should still have agents/admins
SELECT 
    'Agents/Admins Preserved' as category,
    role,
    email,
    agent_number
FROM users 
WHERE role IN ('agent', 'admin', 'super_admin')
ORDER BY role, email;

SELECT 
    'Plans Preserved' as category,
    COUNT(*) as count
FROM plans;

SELECT '═══════════════════════════════════════════════════' as separator;
SELECT '✅ CLEANUP COMPLETE' as status;
SELECT 'Database ready for fresh enrollments' as message;
SELECT '═══════════════════════════════════════════════════' as separator;

-- =====================================================
-- FINAL STEP: COMMIT OR ROLLBACK
-- =====================================================

-- If everything looks good above, type: COMMIT;
-- If something looks wrong, type: ROLLBACK;

-- COMMIT; -- Uncomment this line to finalize the cleanup
-- ROLLBACK; -- Uncomment this line to undo everything

SELECT '⚠️  Transaction still open - type COMMIT; to finalize or ROLLBACK; to undo' as instruction;
