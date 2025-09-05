
-- Comprehensive RLS Policy and Data Verification Script
-- Run this directly in Supabase SQL Editor

-- 1. Check if RLS is enabled on all critical tables
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled,
  CASE 
    WHEN rowsecurity THEN '✅ Enabled'
    ELSE '❌ DISABLED'
  END as status
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname = 'public'
AND t.tablename IN ('users', 'family_members', 'subscriptions', 'payments', 'commissions', 'leads', 'lead_activities', 'enrollment_modifications', 'plans')
ORDER BY t.tablename;

-- 2. List all existing RLS policies
SELECT 
  schemaname||'.'||tablename as table_name,
  policyname as policy_name,
  cmd as policy_type,
  CASE 
    WHEN cmd = 'ALL' THEN '🔓 Full Access'
    WHEN cmd = 'SELECT' THEN '👀 Read Only'
    WHEN cmd = 'INSERT' THEN '➕ Insert Only'
    WHEN cmd = 'UPDATE' THEN '✏️ Update Only'
    WHEN cmd = 'DELETE' THEN '🗑️ Delete Only'
  END as access_type,
  qual as policy_condition
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('users', 'family_members', 'subscriptions', 'payments', 'commissions', 'leads', 'lead_activities')
ORDER BY tablename, cmd, policyname;

-- 3. Check user role distribution and data integrity
SELECT 
  'User Roles' as category,
  role,
  COUNT(*) as count,
  ARRAY_AGG(DISTINCT email ORDER BY email LIMIT 3) as sample_emails
FROM users 
GROUP BY role
ORDER BY role;

-- 4. Check for role conflicts
SELECT 
  'Role Conflicts' as issue_type,
  email,
  role,
  agent_number,
  'User has agent_number but is not an agent' as conflict_reason
FROM users 
WHERE agent_number IS NOT NULL 
  AND role != 'agent'
UNION ALL
SELECT 
  'Role Conflicts',
  email,
  role,
  agent_number,
  'Agent without agent_number'
FROM users 
WHERE role = 'agent' 
  AND agent_number IS NULL;

-- 5. Verify member data presence and integrity
SELECT 
  'Healthcare Members' as data_type,
  COUNT(*) as total_count,
  COUNT(CASE WHEN is_active THEN 1 END) as active_count,
  COUNT(CASE WHEN approval_status = 'approved' THEN 1 END) as approved_count,
  COUNT(CASE WHEN approval_status = 'pending' THEN 1 END) as pending_count
FROM users 
WHERE role IN ('member', 'user');

-- 6. Check subscription data for members
SELECT 
  'Member Subscriptions' as data_type,
  COUNT(s.*) as subscription_count,
  COUNT(CASE WHEN s.status = 'active' THEN 1 END) as active_subscriptions,
  SUM(s.amount) as total_monthly_revenue
FROM subscriptions s
JOIN users u ON s.user_id = u.id
WHERE u.role IN ('member', 'user');

-- 7. Check family member associations
SELECT 
  'Family Members' as data_type,
  COUNT(fm.*) as family_member_count,
  COUNT(DISTINCT fm.primary_user_id) as families_with_members,
  COUNT(CASE WHEN fm.is_active THEN 1 END) as active_family_members
FROM family_members fm
JOIN users u ON fm.primary_user_id = u.id
WHERE u.role IN ('member', 'user');

-- 8. Verify agent-member relationships
SELECT 
  'Agent Relationships' as data_type,
  COUNT(CASE WHEN enrolled_by_agent_id IS NOT NULL THEN 1 END) as members_with_agents,
  COUNT(DISTINCT enrolled_by_agent_id) as active_enrolling_agents
FROM users 
WHERE role IN ('member', 'user');

-- 9. Check commission data integrity
SELECT 
  'Commission Data' as data_type,
  COUNT(*) as total_commissions,
  COUNT(CASE WHEN status = 'active' THEN 1 END) as active_commissions,
  COUNT(DISTINCT agent_id) as agents_with_commissions,
  SUM(commission_amount) as total_commission_amount
FROM commissions;

-- 10. Sample member data (anonymized)
SELECT 
  'Sample Members' as info_type,
  LEFT(email, 3) || '***' || RIGHT(email, 10) as masked_email,
  first_name,
  role,
  is_active,
  approval_status,
  created_at::date as join_date,
  CASE WHEN agent_number IS NOT NULL THEN 'HAS_AGENT_NUM' ELSE 'NO_AGENT_NUM' END as agent_status
FROM users 
WHERE role IN ('member', 'user')
ORDER BY created_at DESC
LIMIT 10;

-- 11. Check if critical admin users exist
SELECT 
  'Admin Status' as check_type,
  COUNT(*) as admin_count,
  ARRAY_AGG(email) as admin_emails
FROM users 
WHERE role = 'admin'
AND email IN ('michael@mypremierplans.com', 'travis@mypremierplans.com', 'richard@mypremierplans.com', 'joaquin@mypremierplans.com');

-- 12. Verify database constraints and indexes
SELECT 
  'Database Integrity' as check_type,
  'Foreign Key Constraints' as constraint_type,
  COUNT(*) as count
FROM information_schema.table_constraints 
WHERE constraint_type = 'FOREIGN KEY' 
AND table_schema = 'public'
AND table_name IN ('family_members', 'subscriptions', 'payments', 'commissions', 'leads', 'lead_activities');
