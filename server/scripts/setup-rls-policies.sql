-- ============================================================
-- SUPABASE RLS POLICIES FOR DPC ENROLLMENT PLATFORM
-- ============================================================
-- Security Model:
-- - Members: NO access to app (only enrolled via agents)
-- - Agents: Can only see their own enrollments and data
-- - Admins: Can see and modify all data
-- - Super Admin: Complete access (God mode)
-- ============================================================

-- ============================================================
-- 1. USERS TABLE (Agents/Admins only - NOT members)
-- ============================================================

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "users_select_own" ON users;
DROP POLICY IF EXISTS "users_select_admin" ON users;
DROP POLICY IF EXISTS "users_update_own" ON users;
DROP POLICY IF EXISTS "users_update_admin" ON users;
DROP POLICY IF EXISTS "users_insert_admin" ON users;
DROP POLICY IF EXISTS "users_delete_superadmin" ON users;

-- Agents can view their own profile
CREATE POLICY "users_select_own" ON users
  FOR SELECT
  USING (
    auth.uid()::text = id 
    OR role IN ('admin', 'super_admin')
  );

-- Admins can view all users
CREATE POLICY "users_select_admin" ON users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Users can update their own profile (limited fields)
CREATE POLICY "users_update_own" ON users
  FOR UPDATE
  USING (auth.uid()::text = id)
  WITH CHECK (auth.uid()::text = id);

-- Admins can update any user
CREATE POLICY "users_update_admin" ON users
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Only admins can create new users
CREATE POLICY "users_insert_admin" ON users
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Only super admins can delete users
CREATE POLICY "users_delete_superadmin" ON users
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role = 'super_admin'
    )
  );

-- ============================================================
-- 2. MEMBERS TABLE (Enrolled customers - NO app access)
-- ============================================================

-- Enable RLS
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "members_select_agent_own" ON members;
DROP POLICY IF EXISTS "members_select_admin" ON members;
DROP POLICY IF EXISTS "members_insert_agent" ON members;
DROP POLICY IF EXISTS "members_update_agent_own" ON members;
DROP POLICY IF EXISTS "members_update_admin" ON members;
DROP POLICY IF EXISTS "members_delete_admin" ON members;

-- Agents can view only their own enrolled members
CREATE POLICY "members_select_agent_own" ON members
  FOR SELECT
  USING (
    enrolled_by_agent_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Admins can view all members
CREATE POLICY "members_select_admin" ON members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Agents can create members (their enrollments)
CREATE POLICY "members_insert_agent" ON members
  FOR INSERT
  WITH CHECK (
    enrolled_by_agent_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Agents can update only their own enrolled members
-- Agents can modify: contact info, address, emergency contacts, family members
-- Agents CANNOT modify: plan_id, total_monthly_price, status (requires admin)
CREATE POLICY "members_update_agent_own" ON members
  FOR UPDATE
  USING (
    enrolled_by_agent_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    -- Agents can only update contact/demographic fields
    (enrolled_by_agent_id = auth.uid()::text AND (
      -- Allow updates to these fields only
      OLD.plan_id IS NOT DISTINCT FROM NEW.plan_id AND
      OLD.total_monthly_price IS NOT DISTINCT FROM NEW.total_monthly_price AND
      OLD.status IS NOT DISTINCT FROM NEW.status AND
      OLD.is_active IS NOT DISTINCT FROM NEW.is_active
    ))
    OR EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Admins can update any member
CREATE POLICY "members_update_admin" ON members
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Only admins can delete members
CREATE POLICY "members_delete_admin" ON members
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- ============================================================
-- 3. PLANS TABLE (Read-only for agents, full access for admins)
-- ============================================================

-- Enable RLS
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "plans_select_all" ON plans;
DROP POLICY IF EXISTS "plans_insert_admin" ON plans;
DROP POLICY IF EXISTS "plans_update_admin" ON plans;
DROP POLICY IF EXISTS "plans_delete_admin" ON plans;

-- Everyone can view active plans
CREATE POLICY "plans_select_all" ON plans
  FOR SELECT
  USING (is_active = true OR EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid()::text 
    AND role IN ('admin', 'super_admin')
  ));

-- Only admins can create plans
CREATE POLICY "plans_insert_admin" ON plans
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Only admins can update plans
CREATE POLICY "plans_update_admin" ON plans
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Only super admins can delete plans
CREATE POLICY "plans_delete_admin" ON plans
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role = 'super_admin'
    )
  );

-- ============================================================
-- 4. SUBSCRIPTIONS TABLE
-- ============================================================

-- Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "subscriptions_select_agent_own" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_select_admin" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_insert_agent" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_update_admin" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_delete_admin" ON subscriptions;

-- Agents can view subscriptions for their enrolled members
CREATE POLICY "subscriptions_select_agent_own" ON subscriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM members 
      WHERE members.id = subscriptions.member_id 
      AND members.enrolled_by_agent_id = auth.uid()::text
    )
    OR EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Admins can view all subscriptions
CREATE POLICY "subscriptions_select_admin" ON subscriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Agents can create subscriptions for their members
CREATE POLICY "subscriptions_insert_agent" ON subscriptions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM members 
      WHERE members.id = subscriptions.member_id 
      AND members.enrolled_by_agent_id = auth.uid()::text
    )
    OR EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Only admins can update subscriptions
CREATE POLICY "subscriptions_update_admin" ON subscriptions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Only admins can delete subscriptions
CREATE POLICY "subscriptions_delete_admin" ON subscriptions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- ============================================================
-- 5. COMMISSIONS TABLE (Agents see own, admins see all)
-- ============================================================

-- Enable RLS
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "commissions_select_agent_own" ON commissions;
DROP POLICY IF EXISTS "commissions_select_admin" ON commissions;
DROP POLICY IF EXISTS "commissions_insert_system" ON commissions;
DROP POLICY IF EXISTS "commissions_update_admin" ON commissions;
DROP POLICY IF EXISTS "commissions_delete_superadmin" ON commissions;

-- Agents can view only their own commissions
CREATE POLICY "commissions_select_agent_own" ON commissions
  FOR SELECT
  USING (
    agent_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Admins can view all commissions
CREATE POLICY "commissions_select_admin" ON commissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- System can create commissions (from backend)
CREATE POLICY "commissions_insert_system" ON commissions
  FOR INSERT
  WITH CHECK (true); -- Backend creates commissions, not direct user access

-- Only admins can update commission status/payment
CREATE POLICY "commissions_update_admin" ON commissions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Only super admins can delete commissions
CREATE POLICY "commissions_delete_superadmin" ON commissions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role = 'super_admin'
    )
  );

-- ============================================================
-- 6. PAYMENTS TABLE
-- ============================================================

-- Enable RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "payments_select_agent_own" ON payments;
DROP POLICY IF EXISTS "payments_select_admin" ON payments;
DROP POLICY IF EXISTS "payments_insert_system" ON payments;
DROP POLICY IF EXISTS "payments_update_admin" ON payments;

-- Agents can view payments for their enrolled members
CREATE POLICY "payments_select_agent_own" ON payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM members 
      WHERE members.id = payments.member_id 
      AND members.enrolled_by_agent_id = auth.uid()::text
    )
    OR EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Admins can view all payments
CREATE POLICY "payments_select_admin" ON payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- System creates payments (from backend)
CREATE POLICY "payments_insert_system" ON payments
  FOR INSERT
  WITH CHECK (true); -- Backend handles payment creation

-- Only admins can update payments
CREATE POLICY "payments_update_admin" ON payments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- ============================================================
-- 7. MEMBER CHANGE REQUESTS TABLE
-- ============================================================

-- Enable RLS
ALTER TABLE member_change_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "change_requests_select_agent_own" ON member_change_requests;
DROP POLICY IF EXISTS "change_requests_select_admin" ON member_change_requests;
DROP POLICY IF EXISTS "change_requests_insert_agent" ON member_change_requests;
DROP POLICY IF EXISTS "change_requests_update_agent_own" ON member_change_requests;
DROP POLICY IF EXISTS "change_requests_update_admin" ON member_change_requests;
DROP POLICY IF EXISTS "change_requests_delete_admin" ON member_change_requests;

-- Agents can view change requests for their enrolled members
CREATE POLICY "change_requests_select_agent_own" ON member_change_requests
  FOR SELECT
  USING (
    requested_by = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Admins can view all change requests
CREATE POLICY "change_requests_select_admin" ON member_change_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Agents can create change requests for their enrolled members
CREATE POLICY "change_requests_insert_agent" ON member_change_requests
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM members 
      WHERE members.id = member_change_requests.member_id 
      AND members.enrolled_by_agent_id = auth.uid()::text
    )
    OR EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Agents can update their own pending change requests (before review)
CREATE POLICY "change_requests_update_agent_own" ON member_change_requests
  FOR UPDATE
  USING (
    requested_by = auth.uid()::text 
    AND status = 'pending'
  )
  WITH CHECK (
    requested_by = auth.uid()::text 
    AND status = 'pending'
  );

-- Admins can update any change request (approve/reject/complete)
CREATE POLICY "change_requests_update_admin" ON member_change_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Only admins can delete change requests
CREATE POLICY "change_requests_delete_admin" ON member_change_requests
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- ============================================================
-- 8. LEADS TABLE
-- ============================================================

-- Enable RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "leads_select_agent_own" ON leads;
DROP POLICY IF EXISTS "leads_select_admin" ON leads;
DROP POLICY IF EXISTS "leads_insert_agent" ON leads;
DROP POLICY IF EXISTS "leads_update_agent_own" ON leads;
DROP POLICY IF EXISTS "leads_update_admin" ON leads;
DROP POLICY IF EXISTS "leads_delete_admin" ON leads;

-- Agents can view only their assigned leads
CREATE POLICY "leads_select_agent_own" ON leads
  FOR SELECT
  USING (
    assigned_to = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Admins can view all leads
CREATE POLICY "leads_select_admin" ON leads
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Agents can create leads
CREATE POLICY "leads_insert_agent" ON leads
  FOR INSERT
  WITH CHECK (
    assigned_to = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Agents can update their own leads
CREATE POLICY "leads_update_agent_own" ON leads
  FOR UPDATE
  USING (
    assigned_to = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Admins can update any lead
CREATE POLICY "leads_update_admin" ON leads
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Only admins can delete leads
CREATE POLICY "leads_delete_admin" ON leads
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'super_admin')
    )
  );

-- ============================================================
-- VERIFICATION QUERY
-- ============================================================
-- Run this to verify all policies are in place:

SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
