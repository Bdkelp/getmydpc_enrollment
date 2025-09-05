
-- Complete RLS Policy Setup for MyPremierPlans
-- This script ensures all necessary RLS policies are in place

-- Enable RLS on all tables (safe to run multiple times)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_modifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them (prevents conflicts)
DROP POLICY IF EXISTS "Service role bypass users" ON users;
DROP POLICY IF EXISTS "Service role bypass family_members" ON family_members;
DROP POLICY IF EXISTS "Service role bypass subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Service role bypass payments" ON payments;
DROP POLICY IF EXISTS "Service role bypass commissions" ON commissions;
DROP POLICY IF EXISTS "Service role bypass leads" ON leads;
DROP POLICY IF EXISTS "Service role bypass lead_activities" ON lead_activities;
DROP POLICY IF EXISTS "Service role bypass enrollment_modifications" ON enrollment_modifications;

-- SERVICE ROLE BYPASS (Critical for backend operations)
CREATE POLICY "Service role bypass users" ON users FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role bypass family_members" ON family_members FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role bypass subscriptions" ON subscriptions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role bypass payments" ON payments FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role bypass commissions" ON commissions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role bypass leads" ON leads FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role bypass lead_activities" ON lead_activities FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role bypass enrollment_modifications" ON enrollment_modifications FOR ALL USING (auth.role() = 'service_role');

-- ADMIN POLICIES (Full access to all data)
DROP POLICY IF EXISTS "Admins full access users" ON users;
DROP POLICY IF EXISTS "Admins full access family_members" ON family_members;
DROP POLICY IF EXISTS "Admins full access subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Admins full access payments" ON payments;
DROP POLICY IF EXISTS "Admins full access commissions" ON commissions;

CREATE POLICY "Admins full access users" ON users FOR ALL 
  USING (auth.uid() IN (SELECT id FROM users WHERE role = 'admin'));

CREATE POLICY "Admins full access family_members" ON family_members FOR ALL 
  USING (auth.uid() IN (SELECT id FROM users WHERE role = 'admin'));

CREATE POLICY "Admins full access subscriptions" ON subscriptions FOR ALL 
  USING (auth.uid() IN (SELECT id FROM users WHERE role = 'admin'));

CREATE POLICY "Admins full access payments" ON payments FOR ALL 
  USING (auth.uid() IN (SELECT id FROM users WHERE role = 'admin'));

CREATE POLICY "Admins full access commissions" ON commissions FOR ALL 
  USING (auth.uid() IN (SELECT id FROM users WHERE role = 'admin'));

-- MEMBER POLICIES (Own data access only)
DROP POLICY IF EXISTS "Members own data users" ON users;
DROP POLICY IF EXISTS "Members own family" ON family_members;
DROP POLICY IF EXISTS "Members own subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Members own payments" ON payments;

CREATE POLICY "Members own data users" ON users FOR SELECT 
  USING (
    id = auth.uid() OR 
    auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'agent'))
  );

CREATE POLICY "Members own family" ON family_members FOR ALL 
  USING (
    primary_user_id = auth.uid() OR 
    auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'agent'))
  );

CREATE POLICY "Members own subscriptions" ON subscriptions FOR SELECT 
  USING (
    user_id = auth.uid() OR 
    auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'agent'))
  );

CREATE POLICY "Members own payments" ON payments FOR SELECT 
  USING (
    user_id = auth.uid() OR 
    auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'agent'))
  );

-- AGENT POLICIES (Access to assigned members)
DROP POLICY IF EXISTS "Agents assigned users" ON users;
DROP POLICY IF EXISTS "Agents assigned family" ON family_members;
DROP POLICY IF EXISTS "Agents assigned subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Agents own commissions" ON commissions;

CREATE POLICY "Agents assigned users" ON users FOR SELECT 
  USING (
    auth.uid() IN (SELECT id FROM users WHERE role = 'agent') AND
    (enrolled_by_agent_id = auth.uid() OR id IN (
      SELECT user_id FROM commissions WHERE agent_id = auth.uid()
    ))
  );

CREATE POLICY "Agents assigned family" ON family_members FOR ALL 
  USING (
    auth.uid() IN (SELECT id FROM users WHERE role = 'agent') AND
    primary_user_id IN (
      SELECT id FROM users WHERE enrolled_by_agent_id = auth.uid() OR id IN (
        SELECT user_id FROM commissions WHERE agent_id = auth.uid()
      )
    )
  );

CREATE POLICY "Agents assigned subscriptions" ON subscriptions FOR SELECT 
  USING (
    auth.uid() IN (SELECT id FROM users WHERE role = 'agent') AND
    user_id IN (
      SELECT id FROM users WHERE enrolled_by_agent_id = auth.uid() OR id IN (
        SELECT user_id FROM commissions WHERE agent_id = auth.uid()
      )
    )
  );

CREATE POLICY "Agents own commissions" ON commissions FOR SELECT 
  USING (
    agent_id = auth.uid() AND 
    auth.uid() IN (SELECT id FROM users WHERE role = 'agent')
  );

-- PLANS TABLE (Read access for all authenticated users)
DROP POLICY IF EXISTS "Plans read access" ON plans;
CREATE POLICY "Plans read access" ON plans FOR SELECT 
  USING (auth.role() = 'authenticated');

-- LEADS POLICIES
DROP POLICY IF EXISTS "Agents assigned leads" ON leads;
DROP POLICY IF EXISTS "Agents lead activities" ON lead_activities;

CREATE POLICY "Agents assigned leads" ON leads FOR ALL 
  USING (
    auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'agent')) AND
    (assigned_agent_id = auth.uid() OR auth.uid() IN (SELECT id FROM users WHERE role = 'admin'))
  );

CREATE POLICY "Agents lead activities" ON lead_activities FOR ALL 
  USING (
    auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'agent')) AND
    (agent_id = auth.uid() OR auth.uid() IN (SELECT id FROM users WHERE role = 'admin'))
  );

-- Verify the policies were created
SELECT 
  tablename,
  policyname,
  cmd as access_type,
  'Policy created successfully' as status
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'family_members', 'subscriptions', 'payments', 'commissions', 'leads')
ORDER BY tablename, cmd, policyname;
