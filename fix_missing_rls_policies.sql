
-- Fix Missing RLS Policies
-- This script adds RLS policies for tables that have RLS enabled but no policies

-- 1. Commissions table policies
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

-- 2. Family members table policies
CREATE POLICY "Service role bypass family_members" ON public.family_members
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own family members" ON public.family_members
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can manage own family members" ON public.family_members
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Admins can view all family members" ON public.family_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (
        auth.users.raw_user_meta_data->>'role' = 'admin'
        OR auth.users.email LIKE '%@mypremierplans.com'
      )
    )
  );

-- 3. Payments table policies
CREATE POLICY "Service role bypass payments" ON public.payments
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own payments" ON public.payments
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can view all payments" ON public.payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (
        auth.users.raw_user_meta_data->>'role' = 'admin'
        OR auth.users.email LIKE '%@mypremierplans.com'
      )
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

-- 5. Sessions table policies (users can only access their own sessions)
CREATE POLICY "Service role bypass sessions" ON public.sessions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can manage own sessions" ON public.sessions
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Admins can view all sessions" ON public.sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (
        auth.users.raw_user_meta_data->>'role' = 'admin'
        OR auth.users.email LIKE '%@mypremierplans.com'
      )
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
WHERE tablename IN ('commissions', 'family_members', 'payments', 'plans', 'sessions')
ORDER BY tablename, policyname;
