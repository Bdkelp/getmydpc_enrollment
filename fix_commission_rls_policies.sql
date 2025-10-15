
-- RLS Policies for Members-based Commission Tracking

-- Enable RLS on members table
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- Agents and admins can view all members
CREATE POLICY "agents_admins_view_members" ON members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'agent')
    )
  );

-- Agents can only update members they enrolled
CREATE POLICY "agents_update_enrolled_members" ON members
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role = 'agent'
      AND id = enrolled_by_agent_id
    )
    OR EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role = 'admin'
    )
  );

-- Fix commissions RLS - agents view their own commissions
DROP POLICY IF EXISTS "agents_view_own_commissions" ON commissions;
CREATE POLICY "agents_view_own_commissions" ON commissions
  FOR SELECT
  USING (
    agent_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role = 'admin'
    )
  );

-- Admins manage all commissions
DROP POLICY IF EXISTS "admins_manage_commissions" ON commissions;
CREATE POLICY "admins_manage_commissions" ON commissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND role = 'admin'
    )
  );

-- Service role has full access
CREATE POLICY "service_role_full_access_members" ON members
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_full_access_commissions" ON commissions
  FOR ALL
  USING (auth.role() = 'service_role');
