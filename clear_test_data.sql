
-- Clear Test Enrollment Data Script
-- This will remove all test enrollments while preserving system data

BEGIN;

-- Delete in proper order to respect foreign key constraints

-- 1. Delete commission records
DELETE FROM commissions WHERE id > 0;

-- 2. Delete enrollment modifications
DELETE FROM enrollment_modifications WHERE id > 0;

-- 3. Delete family members
DELETE FROM family_members WHERE id > 0;

-- 4. Delete payments
DELETE FROM payments WHERE id > 0;

-- 5. Delete subscriptions
DELETE FROM subscriptions WHERE id > 0;

-- 6. Delete lead activities
DELETE FROM lead_activities WHERE id > 0;

-- 7. Delete leads
DELETE FROM leads WHERE id > 0;

-- 8. Delete all users except system accounts (keep admins/agents for system access)
-- This will keep users with role 'admin' or 'agent' but remove all enrolled members
DELETE FROM users WHERE role = 'user';

-- Reset auto-increment sequences
ALTER SEQUENCE commissions_id_seq RESTART WITH 1;
ALTER SEQUENCE enrollment_modifications_id_seq RESTART WITH 1;
ALTER SEQUENCE family_members_id_seq RESTART WITH 1;
ALTER SEQUENCE payments_id_seq RESTART WITH 1;
ALTER SEQUENCE subscriptions_id_seq RESTART WITH 1;
ALTER SEQUENCE lead_activities_id_seq RESTART WITH 1;
ALTER SEQUENCE leads_id_seq RESTART WITH 1;

COMMIT;

-- Verify cleanup
SELECT 
  'users' as table_name, COUNT(*) as remaining_records FROM users
UNION ALL
SELECT 'subscriptions', COUNT(*) FROM subscriptions
UNION ALL
SELECT 'payments', COUNT(*) FROM payments
UNION ALL
SELECT 'family_members', COUNT(*) FROM family_members
UNION ALL
SELECT 'leads', COUNT(*) FROM leads
UNION ALL
SELECT 'lead_activities', COUNT(*) FROM lead_activities
UNION ALL
SELECT 'commissions', COUNT(*) FROM commissions
UNION ALL
SELECT 'enrollment_modifications', COUNT(*) FROM enrollment_modifications;
