
-- Clean all member and test data while preserving plans, admins, and agents
-- This will remove all enrollments, subscriptions, payments, and member records

BEGIN;

-- 1. Delete all commissions
DELETE FROM commissions;

-- 2. Delete all enrollment modifications
DELETE FROM enrollment_modifications WHERE id > 0;

-- 3. Delete all family members
DELETE FROM family_members;

-- 4. Delete all payments
DELETE FROM payments;

-- 5. Delete all subscriptions
DELETE FROM subscriptions;

-- 6. Delete all lead activities
DELETE FROM lead_activities;

-- 7. Delete all leads
DELETE FROM leads;

-- 8. Delete all member users (keep only admin and agent roles)
DELETE FROM users WHERE role NOT IN ('admin', 'agent');

-- Reset auto-increment sequences
ALTER SEQUENCE IF EXISTS commissions_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS enrollment_modifications_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS family_members_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS payments_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS subscriptions_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS lead_activities_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS leads_id_seq RESTART WITH 1;

COMMIT;

-- Verify cleanup
SELECT 
  'users (admins/agents only)' as table_name, COUNT(*) as remaining_records FROM users
UNION ALL
SELECT 'plans (preserved)', COUNT(*) FROM plans
UNION ALL
SELECT 'subscriptions (cleared)', COUNT(*) FROM subscriptions
UNION ALL
SELECT 'payments (cleared)', COUNT(*) FROM payments
UNION ALL
SELECT 'family_members (cleared)', COUNT(*) FROM family_members
UNION ALL
SELECT 'leads (cleared)', COUNT(*) FROM leads
UNION ALL
SELECT 'commissions (cleared)', COUNT(*) FROM commissions;

-- Show preserved data
SELECT 'Preserved Plans:' as info;
SELECT id, name, price, billing_period, is_active FROM plans ORDER BY price;

SELECT 'Preserved Users (Admins/Agents):' as info;
SELECT id, email, first_name, last_name, role, agent_number, is_active FROM users ORDER BY role, email;
