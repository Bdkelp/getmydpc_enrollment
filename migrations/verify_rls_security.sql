-- ============================================================
-- RLS Security Verification Script
-- ============================================================
-- Run this AFTER running enable_rls_security.sql
-- This checks that everything is configured correctly
-- ============================================================

-- Check RLS status on all tables
SELECT 
    schemaname,
    tablename,
    CASE 
        WHEN rowsecurity THEN '[ENABLED]'
        ELSE '[DISABLED]'
    END as rls_status
FROM pg_tables t
LEFT JOIN pg_class c ON c.relname = t.tablename
WHERE schemaname = 'public'
AND tablename IN (
    'billing_schedule', 'commissions', 'enrollment_modifications',
    'family_members', 'lead_activities', 'leads', 'member_change_requests',
    'members', 'payment_tokens', 'payments', 'plans', 'recurring_billing_log',
    'sessions', 'subscriptions', 'users'
)
ORDER BY tablename;

-- Check policies on tables
SELECT 
    schemaname,
    tablename,
    policyname,
    CASE 
        WHEN permissive = 'PERMISSIVE' THEN '[Permissive]'
        ELSE '[Restrictive]'
    END as policy_type,
    CASE cmd
        WHEN '*' THEN 'ALL'
        WHEN 'r' THEN 'SELECT'
        WHEN 'w' THEN 'UPDATE'
        WHEN 'a' THEN 'INSERT'
        WHEN 'd' THEN 'DELETE'
        ELSE cmd::text
    END as operation,
    roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Summary counts
SELECT 
    COUNT(DISTINCT tablename) as total_tables_with_policies,
    COUNT(*) as total_policies
FROM pg_policies
WHERE schemaname = 'public';
