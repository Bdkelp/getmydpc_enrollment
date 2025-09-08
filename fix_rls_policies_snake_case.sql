-- Fixed RLS Policies with Correct Snake Case Column Names
-- This script fixes all RLS policy errors related to column naming

-- ========================================
-- 1. COMMISSIONS TABLE POLICIES
-- ========================================

-- First, drop any existing commission policies to avoid duplicates
DROP POLICY IF EXISTS "Agents can view own commissions" ON public.commissions;
DROP POLICY IF EXISTS "Agents view own commissions" ON public.commissions;
DROP POLICY IF EXISTS "Admins can view all commissions" ON public.commissions;
DROP POLICY IF EXISTS "Admins view all commissions" ON public.commissions;
DROP POLICY IF EXISTS "Admins can insert commissions" ON public.commissions;
DROP POLICY IF EXISTS "Admins can update commissions" ON public.commissions;
DROP POLICY IF EXISTS "Admins can delete commissions" ON public.commissions;
DROP POLICY IF EXISTS "Admins manage commissions" ON public.commissions;
DROP POLICY IF EXISTS "Service role bypass commissions" ON public.commissions;

-- Enable RLS on commissions table
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

-- Create new policies with correct snake_case column names
CREATE POLICY "Agents view own commissions" ON public.commissions
  FOR SELECT
  USING (
    auth.uid()::text = agent_id AND
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'agent')
  );

CREATE POLICY "Admins view all commissions" ON public.commissions
  FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin')
  );

CREATE POLICY "Admins manage commissions" ON public.commissions
  FOR ALL
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin')
  );

CREATE POLICY "Service role bypass commissions" ON public.commissions
  FOR ALL
  USING (auth.role() = 'service_role');

-- ========================================
-- 2. FAMILY_MEMBERS TABLE POLICIES
-- ========================================

-- Drop existing family_members policies to avoid duplicates
DROP POLICY IF EXISTS "Users view own family" ON public.family_members;
DROP POLICY IF EXISTS "Users manage own family" ON public.family_members;
DROP POLICY IF EXISTS "Admins view all family" ON public.family_members;
DROP POLICY IF EXISTS "Service role bypass family_members" ON public.family_members;

-- Enable RLS on family_members table
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

-- Create new policies with correct snake_case column names
CREATE POLICY "Users view own family" ON public.family_members
  FOR SELECT
  USING (
    primary_user_id = auth.uid()::text OR
    auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'agent'))
  );

CREATE POLICY "Users manage own family" ON public.family_members
  FOR ALL
  USING (
    primary_user_id = auth.uid()::text OR
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin')
  );

CREATE POLICY "Service role bypass family_members" ON public.family_members
  FOR ALL
  USING (auth.role() = 'service_role');

-- ========================================
-- 3. PAYMENTS TABLE POLICIES  
-- ========================================

-- Drop existing payment policies to avoid duplicates
DROP POLICY IF EXISTS "Users view own payments" ON public.payments;
DROP POLICY IF EXISTS "Admins view all payments" ON public.payments;
DROP POLICY IF EXISTS "Admins manage payments" ON public.payments;
DROP POLICY IF EXISTS "Service role bypass payments" ON public.payments;

-- Enable RLS on payments table
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Create new policies with correct snake_case column names
CREATE POLICY "Users view own payments" ON public.payments
  FOR SELECT
  USING (
    user_id = auth.uid()::text OR
    auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'agent'))
  );

CREATE POLICY "Admins manage payments" ON public.payments
  FOR ALL
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin')
  );

CREATE POLICY "Service role bypass payments" ON public.payments
  FOR ALL
  USING (auth.role() = 'service_role');

-- ========================================
-- 4. SESSIONS TABLE POLICIES
-- ========================================

-- Note: The sessions table has columns: sid, sess, expire (NOT user_id)
-- Drop existing session policies
DROP POLICY IF EXISTS "Service role bypass sessions" ON public.sessions;
DROP POLICY IF EXISTS "Users view own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Admins view all sessions" ON public.sessions;

-- Enable RLS on sessions table
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Create policies for sessions table
-- Sessions table is used for express-session storage, accessed by service role
CREATE POLICY "Service role manages sessions" ON public.sessions
  FOR ALL
  USING (auth.role() = 'service_role');

-- Allow authenticated users to access sessions (for session management)
CREATE POLICY "Authenticated users access sessions" ON public.sessions
  FOR ALL
  USING (auth.role() = 'authenticated');

-- ========================================
-- 5. USERS TABLE - Agent Policies
-- ========================================

-- Drop existing agent-related user policies
DROP POLICY IF EXISTS "Agents can view assigned users" ON public.users;
DROP POLICY IF EXISTS "Agents can update assigned user info" ON public.users;

-- Create new policies with correct snake_case column names
CREATE POLICY "Agents view assigned users" ON public.users
  FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'agent') AND
    (
      enrolled_by_agent_id = auth.uid()::text OR
      id IN (
        SELECT user_id FROM public.commissions WHERE agent_id = auth.uid()::text
      )
    )
  );

CREATE POLICY "Agents update assigned users" ON public.users
  FOR UPDATE
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'agent') AND
    (
      enrolled_by_agent_id = auth.uid()::text OR
      id IN (
        SELECT user_id FROM public.commissions WHERE agent_id = auth.uid()::text
      )
    )
  )
  WITH CHECK (
    -- Prevent agents from modifying critical system fields
    OLD.id = NEW.id AND
    OLD.email = NEW.email AND
    OLD.role = NEW.role AND
    OLD.approval_status = NEW.approval_status AND
    OLD.is_active = NEW.is_active AND
    OLD.created_at = NEW.created_at AND
    OLD.enrolled_by_agent_id = NEW.enrolled_by_agent_id
  );

-- ========================================
-- 6. SUBSCRIPTIONS TABLE - Agent Policies
-- ========================================

-- Drop existing agent-related subscription policies
DROP POLICY IF EXISTS "Agents can view assigned user subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Agents can update assigned user subscriptions" ON public.subscriptions;

-- Create new policies with correct snake_case column names
CREATE POLICY "Agents view assigned subscriptions" ON public.subscriptions
  FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'agent') AND
    user_id IN (
      SELECT id FROM public.users 
      WHERE enrolled_by_agent_id = auth.uid()::text
      OR id IN (
        SELECT user_id FROM public.commissions WHERE agent_id = auth.uid()::text
      )
    )
  );

CREATE POLICY "Agents update assigned subscriptions" ON public.subscriptions
  FOR UPDATE
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role = 'agent') AND
    user_id IN (
      SELECT id FROM public.users 
      WHERE enrolled_by_agent_id = auth.uid()::text
      OR id IN (
        SELECT user_id FROM public.commissions WHERE agent_id = auth.uid()::text
      )
    )
  )
  WITH CHECK (
    -- Prevent agents from modifying payment timing and critical fields
    OLD.id = NEW.id AND
    OLD.user_id = NEW.user_id AND
    OLD.created_at = NEW.created_at AND
    OLD.next_billing_date = NEW.next_billing_date AND
    OLD.stripe_subscription_id = NEW.stripe_subscription_id
  );

-- ========================================
-- 7. VERIFICATION QUERY
-- ========================================

-- Check that all tables now have policies
SELECT 
  t.schemaname,
  t.tablename,
  CASE 
    WHEN t.rowsecurity = true THEN '✅ RLS Enabled'
    ELSE '❌ RLS Disabled'
  END as rls_status,
  COUNT(p.policyname) as policy_count,
  CASE 
    WHEN COUNT(p.policyname) > 0 THEN '✅ Has Policies'
    ELSE '❌ No Policies'
  END as policy_status
FROM pg_tables t
LEFT JOIN pg_policies p ON p.schemaname = t.schemaname AND p.tablename = t.tablename
WHERE t.schemaname = 'public'
AND t.tablename IN ('commissions', 'family_members', 'payments', 'sessions', 'users', 'subscriptions')
GROUP BY t.schemaname, t.tablename, t.rowsecurity
ORDER BY t.tablename;

-- ========================================
-- 8. SUMMARY
-- ========================================
SELECT 
  'RLS POLICIES FIXED' as status,
  'All column names converted to snake_case' as fix_1,
  'Duplicate policies dropped before recreation' as fix_2,
  'Sessions table policies fixed (no user_id column)' as fix_3,
  'Ready to apply to Supabase' as next_step;