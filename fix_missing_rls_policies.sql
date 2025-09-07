
-- Fix Missing RLS Policies
-- This script adds RLS policies for tables that have RLS enabled but no policies

-- Drop existing policies first to avoid conflicts
DROP POLICY IF EXISTS "Service role bypass commissions" ON public.commissions;
DROP POLICY IF EXISTS "Agents can view own commissions" ON public.commissions;
DROP POLICY IF EXISTS "Admins can manage commissions" ON public.commissions;
DROP POLICY IF EXISTS "Service role bypass family_members" ON public.family_members;
DROP POLICY IF EXISTS "Users can view own family members" ON public.family_members;
DROP POLICY IF EXISTS "Users can manage own family members" ON public.family_members;
DROP POLICY IF EXISTS "Admins can view all family members" ON public.family_members;
DROP POLICY IF EXISTS "Service role bypass payments" ON public.payments;
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can view all payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can manage payments" ON public.payments;
DROP POLICY IF EXISTS "Service role bypass plans" ON public.plans;
DROP POLICY IF EXISTS "Authenticated users can view plans" ON public.plans;
DROP POLICY IF EXISTS "Admins can manage plans" ON public.plans;
DROP POLICY IF EXISTS "Service role bypass sessions" ON public.sessions;
DROP POLICY IF EXISTS "Users can manage own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Admins can view all sessions" ON public.sessions;
DROP POLICY IF EXISTS "Service role bypass subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Admins can manage subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Service role bypass leads" ON public.leads;
DROP POLICY IF EXISTS "Agents can view assigned leads" ON public.leads;
DROP POLICY IF EXISTS "Agents can manage assigned leads" ON public.leads;
DROP POLICY IF EXISTS "Service role bypass lead_activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Agents can view own lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Agents can manage own lead activities" ON public.lead_activities;

-- 1. Commissions table policies (using correct column names)
CREATE POLICY "Service role bypass commissions" ON public.commissions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Agents can view own commissions" ON public.commissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (
        auth.users.raw_user_meta_data->>'role' = 'admin'
        OR auth.users.email LIKE '%@mypremierplans.com'
        OR (auth.users.raw_user_meta_data->>'role' = 'agent' AND auth.users.id = agent_id)
      )
    )
  );

CREATE POLICY "Admins can manage commissions" ON public.commissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (
        auth.users.raw_user_meta_data->>'role' = 'admin'
        OR auth.users.email LIKE '%@mypremierplans.com'
      )
    )
  );

-- 2. Family members table policies (using correct column name: primary_user_id)
CREATE POLICY "Service role bypass family_members" ON public.family_members
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own family members" ON public.family_members
  FOR SELECT USING (
    primary_user_id = (SELECT auth.uid())
    OR (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' IN ('admin', 'agent')
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
  );

CREATE POLICY "Users can manage own family members" ON public.family_members
  FOR ALL USING (
    primary_user_id = (SELECT auth.uid())
    OR (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'admin'
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
  );

-- 3. Payments table policies (using correct column name: user_id)
CREATE POLICY "Service role bypass payments" ON public.payments
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own payments" ON public.payments
  FOR SELECT USING (
    user_id = (SELECT auth.uid())
    OR (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' IN ('admin', 'agent')
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
  );

CREATE POLICY "Admins can manage payments" ON public.payments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (
        auth.users.raw_user_meta_data->>'role' = 'admin'
        OR auth.users.email LIKE '%@mypremierplans.com'
      )
    )
  );

-- 4. Plans table policies (read-only for all authenticated users)
CREATE POLICY "Service role bypass plans" ON public.plans
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can view plans" ON public.plans
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage plans" ON public.plans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (
        auth.users.raw_user_meta_data->>'role' = 'admin'
        OR auth.users.email LIKE '%@mypremierplans.com'
      )
    )
  );

-- 5. Sessions table policies
CREATE POLICY "Service role bypass sessions" ON public.sessions
  FOR ALL USING (auth.role() = 'service_role');

-- Sessions table typically doesn't have user_id, so allowing all authenticated users
CREATE POLICY "Authenticated users can access sessions" ON public.sessions
  FOR ALL USING (auth.role() = 'authenticated');

-- 6. Subscriptions table policies (using correct column name: user_id)
CREATE POLICY "Service role bypass subscriptions" ON public.subscriptions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own subscriptions" ON public.subscriptions
  FOR SELECT USING (
    user_id = (SELECT auth.uid())
    OR (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' IN ('admin', 'agent')
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
  );

CREATE POLICY "Admins can manage subscriptions" ON public.subscriptions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (
        auth.users.raw_user_meta_data->>'role' = 'admin'
        OR auth.users.email LIKE '%@mypremierplans.com'
      )
    )
  );

-- 7. Leads table policies (using correct column name: assigned_agent_id)
CREATE POLICY "Service role bypass leads" ON public.leads
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Agents can view assigned leads" ON public.leads
  FOR SELECT USING (
    assigned_agent_id = (SELECT auth.uid())
    OR (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'admin'
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
  );

CREATE POLICY "Agents can manage assigned leads" ON public.leads
  FOR ALL USING (
    assigned_agent_id = (SELECT auth.uid())
    OR (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'admin'
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
  );

-- 8. Lead activities table policies (using correct column name: agent_id)
CREATE POLICY "Service role bypass lead_activities" ON public.lead_activities
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Agents can view own lead activities" ON public.lead_activities
  FOR SELECT USING (
    agent_id = (SELECT auth.uid())
    OR (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'admin'
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
  );

CREATE POLICY "Agents can manage own lead activities" ON public.lead_activities
  FOR ALL USING (
    agent_id = (SELECT auth.uid())
    OR (SELECT auth.uid()) IN (
      SELECT id FROM auth.users
      WHERE auth.users.raw_user_meta_data->>'role' = 'admin'
      OR auth.users.email LIKE '%@mypremierplans.com'
    )
  );

-- Verify policies are created
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd as policy_type,
  qual as policy_condition
FROM pg_policies 
WHERE tablename IN ('commissions', 'family_members', 'payments', 'plans', 'sessions', 'subscriptions', 'leads', 'lead_activities')
ORDER BY tablename, policyname;
